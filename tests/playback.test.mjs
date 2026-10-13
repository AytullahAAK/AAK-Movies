import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  const { outputText: code } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

const [{ getExternalPlayerUrl, nxshaPlaybackSource }] = await Promise.all([
  importTypeScript('src/playback/sources.ts'),
])
const { default: tmdbHandler } = await importTypeScript('api/tmdb/proxy.ts')
const { default: tmdbStatusHandler } = await importTypeScript('api/tmdb/status.ts')
const { createAddonHandler } = await importTypeScript('api/addons/[provider].ts')

function mockResponse() {
  const headers = new Map()
  return {
    statusCode: 200,
    headers,
    body: '',
    setHeader(name, value) { headers.set(name.toLowerCase(), value) },
    end(body = '') { this.body = body instanceof Uint8Array ? new TextDecoder().decode(body) : String(body) },
  }
}

test('Nxsha movie and episode URLs keep movie and TV identifiers separate', () => {
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'movie', id: 550 }), 'https://web.nxsha.app/embed/movie/550?color=orange')
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'tv', id: 1396, season_number: 2, episode_number: 3 }), 'https://web.nxsha.app/embed/tv/1396/2/3')
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'tv', id: 1396, season_number: 0, episode_number: 1 }), 'https://web.nxsha.app/embed/tv/1396/0/1')
})

test('invalid Nxsha movie and episode targets are rejected', () => {
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'movie', id: 0 }), null)
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'tv', id: 1, season_number: -1, episode_number: 1 }), null)
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'tv', id: 1, season_number: 1, episode_number: 0 }), null)
})

test('TMDB proxy builds v3 movie and TV episode requests with server Bearer auth', async () => {
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN
  const originalFetch = globalThis.fetch
  const testToken = 'unit-test-token-never-use-in-production'
  process.env.TMDB_READ_ACCESS_TOKEN = testToken
  let requestedUrl
  let authorization
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url)
    authorization = init.headers.Authorization
    return new Response('{"episodes":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const response = mockResponse()
    await tmdbHandler({ method: 'GET', url: '/api/tmdb/proxy?path=%2Ftv%2F1396%2Fseason%2F2&language=en' }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(new URL(requestedUrl).origin, 'https://api.themoviedb.org')
    assert.equal(new URL(requestedUrl).pathname, '/3/tv/1396/season/2')
    assert.equal(new URL(requestedUrl).searchParams.get('language'), 'en')
    assert.equal(authorization, `Bearer ${testToken}`)
    assert.equal(response.body, '{"episodes":[]}')
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken
  }
})

test('TMDB proxy rejects unknown routes and reports missing server configuration', async () => {
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN
  delete process.env.TMDB_READ_ACCESS_TOKEN
  try {
    const missingCredential = mockResponse()
    await tmdbHandler({ method: 'GET', url: '/api/tmdb/proxy?path=%2Fmovie%2F550' }, missingCredential)
    assert.equal(missingCredential.statusCode, 503)
    assert.match(missingCredential.body, /not configured/i)

    const unknownRoute = mockResponse()
    await tmdbHandler({ method: 'GET', url: '/api/tmdb/proxy?path=%2Fconfiguration' }, unknownRoute)
    assert.equal(unknownRoute.statusCode, 404)
  } finally {
    if (originalToken !== undefined) process.env.TMDB_READ_ACCESS_TOKEN = originalToken
  }
})

test('TMDB status reports credential presence without returning its value', () => {
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN
  const testToken = 'unit-test-token-never-return-this-value'
  process.env.TMDB_READ_ACCESS_TOKEN = testToken
  try {
    const response = mockResponse()
    tmdbStatusHandler({ method: 'GET' }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(JSON.parse(response.body).configured, true)
    assert.equal(response.body.includes(testToken), false)
  } finally {
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken
  }
})

test('addon lookup maps a TMDB TV series to the supported IMDb episode ID', async () => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    requested.push(url)
    if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0903747"}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie', 'series'], resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ streams: [{ name: 'Example source', title: 'Episode source', url: 'https://media.example/video.mp4', quality: '1080p', language: 'en', size: '1 GB', type: 'direct' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const handler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }))
    const response = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=tv&tmdb_id=1396&season_number=2&episode_number=3' }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(JSON.parse(response.body).id, 'tt0903747:2:3')
    assert.equal(JSON.parse(response.body).streams[0].playbackKind, 'direct-video')
    assert.equal(JSON.parse(response.body).streams[0].contentType, 'video/mp4')
    assert.equal(requested.some(url => url.pathname.includes('/stream/series/tt0903747%3A2%3A3.json')), true)
    assert.equal(requested.some(url => url.pathname.includes('/stream/series/1396')), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('addon lookup sections fail independently and classify non-browser sources safely', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0111161"}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie'], resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.hostname === 'hdhub.thevolecitor.qzz.io') return new Response('upstream unavailable', { status: 503, headers: { 'content-type': 'text/plain' } })
    return new Response(JSON.stringify({ streams: [{ name: 'Torrent result', infoHash: 'never-return-this-hash' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const env = { ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json', HDHUB_MANIFEST_URL: 'https://hdhub.thevolecitor.qzz.io/manifest.json' }
    const handler = createAddonHandler(() => env)
    const torrentioResponse = mockResponse()
    const hdhubResponse = mockResponse()
    await Promise.all([
      handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=278' }, torrentioResponse),
      handler({ method: 'GET', url: '/api/addons/hdhub?media_type=movie&tmdb_id=278' }, hdhubResponse),
    ])
    assert.equal(torrentioResponse.statusCode, 200)
    assert.equal(JSON.parse(torrentioResponse.body).streams[0].playbackKind, 'torrent')
    assert.equal(torrentioResponse.body.includes('never-return-this-hash'), false)
    assert.equal(hdhubResponse.statusCode, 502)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('addon endpoint rejects arbitrary hosts and returns a real empty list distinctly', async () => {
  const handler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://evil.example/manifest.json' }))
  const invalidConfig = mockResponse()
  await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=550' }, invalidConfig)
  assert.equal(invalidConfig.statusCode, 503)

  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0133093"}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie'], resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response('{"streams":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const validHandler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }))
    const emptyResponse = mockResponse()
    await validHandler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=603' }, emptyResponse)
    assert.equal(emptyResponse.statusCode, 200)
    assert.equal(JSON.parse(emptyResponse.body).id, 'tt0133093')
    assert.deepEqual(JSON.parse(emptyResponse.body).streams, [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('addon iframe playback requires an exact operator-approved HTTPS host', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt1254207"}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie'], resources: ['stream'], idPrefixes: ['tt'] }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ streams: [{ name: 'Provider embed', url: 'https://embed.example/player/123' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const manifestUrl = 'https://torrentio.strem.fun/manifest.json'
    const withAllowlist = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: manifestUrl, AUTHORIZED_EMBED_HOSTS: 'embed.example' }))
    const allowedResponse = mockResponse()
    await withAllowlist({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=1' }, allowedResponse)
    assert.equal(JSON.parse(allowedResponse.body).streams[0].playbackKind, 'embed')

    const withoutAllowlist = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: manifestUrl }))
    const blockedResponse = mockResponse()
    await withoutAllowlist({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=1' }, blockedResponse)
    assert.equal(JSON.parse(blockedResponse.body).streams[0].playbackKind, 'unsupported')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('anime discovery proxy preserves the intended TMDB filters', async () => {
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN
  const originalFetch = globalThis.fetch
  process.env.TMDB_READ_ACCESS_TOKEN = 'unit-test-token'
  let target
  globalThis.fetch = async input => {
    target = new URL(String(input))
    return new Response('{"results":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const response = mockResponse()
    await tmdbHandler({ method: 'GET', url: '/api/tmdb/proxy?path=%2Fdiscover%2Ftv&with_genres=16&with_original_language=ja&sort_by=popularity.desc' }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(target.pathname, '/3/discover/tv')
    assert.equal(target.searchParams.get('with_genres'), '16')
    assert.equal(target.searchParams.get('with_original_language'), 'ja')
    assert.equal(target.searchParams.get('sort_by'), 'popularity.desc')
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken
  }
})

test('direct source playback accepts video files and rejects webpage or manifest URLs', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0111161"}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie'], resources: ['stream'], idPrefixes: ['tt'] }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ streams: [
      { name: 'Authorized media file', url: 'https://media.example/feature.webm' },
      { name: 'Webpage', url: 'https://example.org/watch/123' },
      { name: 'Manifest', url: 'https://example.org/manifest.json' },
      { name: 'HLS playlist', url: 'https://media.example/video.m3u8' },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const handler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }))
    const response = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=278' }, response)
    assert.equal(response.statusCode, 200)
    const streams = JSON.parse(response.body).streams
    assert.equal(streams[0].playbackKind, 'direct-video')
    assert.equal(streams[0].contentType, 'video/webm')
    assert.deepEqual(streams.slice(1).map(stream => stream.playbackKind), ['unsupported', 'unsupported', 'unsupported'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('addon setup errors state the exact missing operator configuration', async () => {
  const handler = createAddonHandler(() => ({}))
  for (const [provider, variable] of [['torrentio', 'TORRENTIO_MANIFEST_URL'], ['hdhub', 'HDHUB_MANIFEST_URL']]) {
    const response = mockResponse()
    await handler({ method: 'GET', url: `/api/addons/${provider}?media_type=movie&tmdb_id=550` }, response)
    assert.equal(response.statusCode, 503)
    assert.match(JSON.parse(response.body).message, /ENABLE_AUTHORIZED_ADDON_LOOKUPS=true/)
    assert.match(JSON.parse(response.body).message, new RegExp(variable))
  }
})
