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
const { parseDirectMediaUrl } = await importTypeScript('src/playback/directMediaUrl.ts')
const heroCarousel = await importTypeScript('src/home/heroCarousel.ts')
const tmdbData = await importTypeScript('src/data.ts')
const { getConfiguredLiveChannels, isConfiguredLiveChannel, isSafeLiveTvLogo, liveTvChannels } = await importTypeScript('src/liveTv.ts')
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

test('hero carousel navigation wraps and rejects stale player events', () => {
  assert.equal(heroCarousel.getNextHeroIndex(0, -1, 4), 3)
  assert.equal(heroCarousel.getNextHeroIndex(3, 1, 4), 0)
  assert.equal(heroCarousel.getNextHeroIndex(0, 1, 0), 0)
  assert.equal(heroCarousel.isCurrentHeroEvent('movie:2', 'movie:2'), true)
  assert.equal(heroCarousel.isCurrentHeroEvent('movie:1', 'movie:2'), false)
  assert.equal(heroCarousel.isCurrentHeroEvent('', ''), false)
})

test('Your Name is pinned first and trending movies and TV are deduplicated and capped at ten', () => {
  const yourName = { id: 372058, media_type: 'movie', title: 'Your Name.', poster: '/poster.jpg', backdrop: '/backdrop.jpg', overview: '', genre: 'Animation', language: 'Japanese', cast: [], recommendations: [], trailerKey: 'official-trailer-key' }
  const trending = [
    yourName,
    { id: 100, media_type: 'movie', title: 'Trending movie', poster: '', backdrop: '', overview: '', genre: 'Drama', language: '' },
    { id: 200, media_type: 'tv', title: 'Trending show', poster: '', backdrop: '', overview: '', genre: 'Drama', language: '' },
    { id: 100, media_type: 'movie', title: 'Duplicate movie', poster: '', backdrop: '', overview: '', genre: 'Drama', language: '' },
    ...Array.from({ length: 12 }, (_, index) => ({ id: 300 + index, media_type: index % 2 ? 'tv' : 'movie', title: `Trending ${index}`, poster: '', backdrop: '', overview: '', genre: 'Drama', language: '' })),
  ]
  const items = heroCarousel.buildHeroCarousel(yourName, trending, 10)
  assert.equal(heroCarousel.YOUR_NAME_TMDB_ID, 372058)
  assert.equal(items[0].id, 372058)
  assert.equal(items[0].title, 'Your Name.')
  assert.equal(items[0].trailerKey, 'official-trailer-key')
  assert.equal(items.length, 10)
  assert.equal(items.filter(item => item.media_type === 'movie' && item.id === 372058).length, 1)
  assert.ok(items.some(item => item.media_type === 'movie' && item.id === 100))
  assert.ok(items.some(item => item.media_type === 'tv' && item.id === 200))
  assert.equal(new Set(items.map(item => `${item.media_type}:${item.id}`)).size, items.length)
  assert.deepEqual(heroCarousel.buildHeroCarousel({ ...yourName, id: 1 }, trending), [])
})

test('the pinned hero title is loaded from the exact TMDB movie record and uses its official trailer metadata', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let requested
  globalThis.window = { location: { origin: 'https://aak.example' } }
  globalThis.fetch = async input => {
    requested = new URL(String(input))
    return new Response(JSON.stringify({
      id: 372058,
      title: 'Your Name.',
      original_title: '君の名は。',
      release_date: '2016-07-01',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      overview: 'A body-swapping story connects two teenagers.',
      original_language: 'ja',
      genres: [{ id: 16, name: 'Animation' }],
      videos: { results: [{ site: 'YouTube', type: 'Trailer', official: true, key: 'official-trailer-key' }] },
      credits: { cast: [] },
      recommendations: { results: [] },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const record = await tmdbData.getMovieDetails(heroCarousel.YOUR_NAME_TMDB_ID)
    assert.equal(requested.pathname, '/api/tmdb/proxy')
    assert.equal(requested.searchParams.get('path'), '/movie/372058')
    assert.equal(record.id, 372058)
    assert.equal(record.media_type, 'movie')
    assert.equal(record.title, 'Your Name.')
    assert.equal(record.original_title, '君の名は。')
    assert.equal(record.trailerKey, 'official-trailer-key')
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
  }
})

test('hero swipe threshold distinguishes horizontal gestures from taps and vertical scrolling', () => {
  assert.equal(heroCarousel.getHeroSwipeDirection(200, 100, 110, 115), 1)
  assert.equal(heroCarousel.getHeroSwipeDirection(100, 100, 205, 110), -1)
  assert.equal(heroCarousel.getHeroSwipeDirection(100, 100, 130, 105), 0)
  assert.equal(heroCarousel.getHeroSwipeDirection(100, 100, 115, 180), 0)
})

test('hero trailer poster and carousel transitions use confirmed YouTube player state events', async () => {
  const player = await readFile(new URL('../src/home/HeroTrailerPlayer.tsx', import.meta.url), 'utf8')
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(player, /PlayerState\.PLAYING/)
  assert.match(player, /PlayerState\.ENDED/)
  assert.match(player, /onAutoplayBlocked/)
  assert.match(player, /getPlayerState\(\)/)
  assert.match(player, /pauseVideo\(\)/)
  assert.match(player, /onRetry\(mediaKey\)/)
  assert.match(app, /isCurrentHeroEvent\(endedKey, activeKeyRef\.current\)/)
  assert.match(app, /buildHeroCarousel\(yourName, trending, 10\)/)
  assert.match(app, /getMovieDetails\(YOUR_NAME_TMDB_ID\)/)
  assert.match(app, /onTouchStart=\{onHeroTouchStart\}/)
  assert.match(app, /onTouchEnd=\{onHeroTouchEnd\}/)
  assert.match(app, /heroPlaybackToggle\.current\?\.\(\)/)
  assert.match(styles, /\.hero\[data-trailer-playing="true"\] \.hero-artwork\{opacity:0\}/)
  assert.doesNotMatch(styles, /\.hero-artwork\{[^}]*animation:heroArtworkIn/)
  assert.match(styles, /\.hero-youtube-host iframe\{position:absolute;left:50%;top:50%;width:max\(100vw,177\.78vh\);height:max\(56\.25vw,100vh\);transform:translate\(-50%,-50%\)/)
})

test('Universal Player accepts only direct HTTPS MP4, WebM, and Ogg media URLs', () => {
  assert.deepEqual(parseDirectMediaUrl('https://media.example/video.mp4?token=temporary'), { source: { url: 'https://media.example/video.mp4?token=temporary', contentType: 'video/mp4' } })
  assert.equal(parseDirectMediaUrl('https://media.example/episode.WEBM').source.contentType, 'video/webm')
  assert.equal(parseDirectMediaUrl('https://media.example/clip.ogg').source.contentType, 'video/ogg')
  assert.match(parseDirectMediaUrl('https://media.example/watch').error, /webpage, embed, or torrent manifest/i)
  assert.match(parseDirectMediaUrl('https://media.example/playlist.m3u8').error, /direct HTTPS MP4/i)
  assert.match(parseDirectMediaUrl('http://media.example/video.mp4').error, /must use HTTPS/i)
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

test('TMDB provider discovery passes region, provider, and monetization filters through the server proxy', async () => {
  const originalToken = process.env.TMDB_READ_ACCESS_TOKEN
  const originalFetch = globalThis.fetch
  process.env.TMDB_READ_ACCESS_TOKEN = 'unit-test-token-never-use-in-production'
  let requestedUrl
  globalThis.fetch = async url => {
    requestedUrl = new URL(String(url))
    return new Response('{"results":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const response = mockResponse()
    await tmdbHandler({ method: 'GET', url: '/api/tmdb/proxy?path=%2Fdiscover%2Fmovie&watch_region=BD&with_watch_providers=8&with_watch_monetization_types=flatrate%7Cfree%7Cads&sort_by=popularity.desc' }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(requestedUrl.pathname, '/3/discover/movie')
    assert.equal(requestedUrl.searchParams.get('watch_region'), 'BD')
    assert.equal(requestedUrl.searchParams.get('with_watch_providers'), '8')
    assert.equal(requestedUrl.searchParams.get('with_watch_monetization_types'), 'flatrate|free|ads')
  } finally {
    globalThis.fetch = originalFetch
    if (originalToken === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN
    else process.env.TMDB_READ_ACCESS_TOKEN = originalToken
  }
})

test('home provider logos use TMDB global provider records when the default region has none', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://aak.test' } }
  let requestedUrl
  globalThis.fetch = async input => {
    requestedUrl = new URL(String(input))
    return new Response(JSON.stringify({ results: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/rK1KljqmbvO9HQa1PBFLILWah72.png', display_priority: 1 }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const providers = await tmdbData.getWatchProviders('movie')
    assert.equal(requestedUrl.searchParams.has('watch_region'), false)
    assert.equal(providers[0].provider_name, 'Netflix')
    assert.equal(tmdbData.getProviderLogoUrl(providers[0].logo_path), 'https://image.tmdb.org/t/p/w185/rK1KljqmbvO9HQa1PBFLILWah72.png')
    assert.equal(tmdbData.getProviderLogoUrl('//other.example/logo.png'), null)
    assert.equal(tmdbData.getProviderLogoUrl('/../../untrusted.png'), null)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('homepage and directory share the deduplicated worldwide movie and TV provider dataset', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://aak.test' } }
  const requested = []
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    requested.push(url)
    const providers = url.searchParams.get('path') === '/watch/providers/movie'
      ? [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 1 }, { provider_id: 99, provider_name: 'No official logo', logo_path: null, display_priority: 5 }]
      : [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 2 }, { provider_id: 15, provider_name: 'Hulu', logo_path: '/hulu.png', display_priority: 3 }]
    return new Response(JSON.stringify({ results: providers }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const catalog = await tmdbData.getGlobalWatchProviders()
    assert.deepEqual(catalog.movies.map(item => item.provider_id), [8, 99])
    assert.deepEqual(catalog.tv.map(item => item.provider_id), [8, 15])
    assert.deepEqual(catalog.all.map(item => item.provider_id), [8, 15, 99])
    assert.equal(requested.length, 2)
    assert.equal(requested.every(url => !url.searchParams.has('watch_region')), true)
    assert.equal(tmdbData.getProviderLogoUrl(catalog.all[2].logo_path), null)
    const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
    assert.match(app, /getGlobalWatchProviders\(\)\.then\(catalog => \{\s*if \(active\) \{ setMovies\(catalog\.movies\); setTv\(catalog\.tv\) \}/)
    assert.match(app, /<ProviderLogo provider=\{item\} size=\{54\} alt="" \/>/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('Universal Player no longer renders a user supplied direct video URL form', async () => {
  const source = await readFile(new URL('../src/playback/UniversalPlayerPanel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /direct-video-url|Direct video URL|playDirectUrl/)
  assert.match(source, /Select source/)
  assert.match(source, /playbackKind === 'direct-video'/)
})

test('provider search results are retained only when title availability matches the selected region and provider', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { location: { origin: 'https://aak.test' } }
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (url.searchParams.get('path') === '/search/movie') return new Response(JSON.stringify({ results: [
      { id: 901, title: 'Provider Match', poster_path: null, backdrop_path: null, genre_ids: [28], original_language: 'en' },
      { id: 902, title: 'Different Provider', poster_path: null, backdrop_path: null, genre_ids: [28], original_language: 'en' },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.searchParams.get('path') === '/genre/movie/list') return new Response('{"genres":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.searchParams.get('path') === '/movie/901/watch/providers') return new Response(JSON.stringify({ results: { US: { flatrate: [{ provider_id: 8, provider_name: 'Provider' }] } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.searchParams.get('path') === '/movie/902/watch/providers') return new Response(JSON.stringify({ results: { US: { rent: [{ provider_id: 8, provider_name: 'Provider' }] } } }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
  }
  try {
    const result = await tmdbData.getProviderCatalog({ query: 'title', type: 'movie', providerId: 8, region: 'US', monetization: ['flatrate'] })
    assert.deepEqual(result.map(item => item.id), [901])
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('PWA manifest keeps AAK branding and declares the install icon sizes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.equal(manifest.name, 'AAK Movies')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.icons.some(icon => icon.sizes === '192x192'), true)
  assert.equal(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'), true)
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(worker, /url\.origin !== self\.location\.origin/)
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
    assert.equal(JSON.parse(response.body).streams[0].name, 'Example source')
    assert.equal(JSON.parse(response.body).streams[0].title, 'Episode source')
    assert.equal(JSON.parse(response.body).streams[0].quality, '1080p')
    assert.equal(JSON.parse(response.body).streams[0].language, 'en')
    assert.equal(JSON.parse(response.body).streams[0].size, '1 GB')
    assert.equal(JSON.parse(response.body).streams[0].sourceType, 'direct')
    assert.equal(requested.some(url => url.pathname.includes('/stream/series/tt0903747:2:3.json')), true)
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

test('addon lookup converts malformed stream responses into a safe provider error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0111161"}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie'], resources: ['stream'], idPrefixes: ['tt'] }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response('{"streams":', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const handler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }))
    const response = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=278' }, response)
    assert.equal(response.statusCode, 502)
    assert.match(JSON.parse(response.body).message, /unavailable or returned an invalid response/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('addon lookup rejects TV seasons and episodes before making upstream requests', async () => {
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => { requests += 1; return new Response('{}') }
  try {
    const handler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }))
    for (const query of ['season_number=-1&episode_number=2', 'season_number=1&episode_number=0', 'season_number=1.5&episode_number=2']) {
      const response = mockResponse()
      await handler({ method: 'GET', url: `/api/addons/torrentio?media_type=tv&tmdb_id=1396&${query}` }, response)
      assert.equal(response.statusCode, 400)
      assert.match(JSON.parse(response.body).message, /TV lookups require/)
    }
    assert.equal(requests, 0)
  } finally { globalThis.fetch = originalFetch }
})

test('addon timeout and non-JSON manifest failures return safe provider errors', async () => {
  const originalFetch = globalThis.fetch
  const handler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }))
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input))
      if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0111161"}', { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.pathname.endsWith('/manifest.json')) return new Response('<html>blocked</html>', { status: 200, headers: { 'content-type': 'text/html' } })
      return new Response('{}')
    }
    const nonJson = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=278' }, nonJson)
    assert.equal(nonJson.statusCode, 502)
    assert.match(JSON.parse(nonJson.body).message, /unavailable or returned an invalid response/i)

    globalThis.fetch = async input => {
      const url = new URL(String(input))
      if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0111161"}', { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie'], resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      throw new DOMException('Simulated upstream timeout.', 'TimeoutError')
    }
    const timedOut = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=278' }, timedOut)
    assert.equal(timedOut.statusCode, 502)
    assert.equal(JSON.parse(timedOut.body).code, 'ADDON_UPSTREAM_ERROR')
  } finally { globalThis.fetch = originalFetch }
})

test('universal addon requests remain independent and discard responses after a context change', async () => {
  const panel = await readFile(new URL('../src/playback/UniversalPlayerPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /for \(const manifest of builtInManifests\)/)
  assert.match(panel, /new AbortController\(\)/)
  assert.match(panel, /return \(\) => \{ window\.clearTimeout\(startTimer\); controller\.abort\(\) \}/)
  assert.match(panel, /if \(controller\.signal\.aborted\) return/)
  assert.match(panel, /payload\.streams\.every\(isAddonStream\)/)
  assert.match(panel, /window\.setTimeout\(startRequests, 0\)/)
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

test('addon disabled status reveals configured variable presence without its value', async () => {
  const manifestUrl = 'https://torrentio.strem.fun/manifest.json?secret=never-return-this-value'
  const handler = createAddonHandler(() => ({ TORRENTIO_MANIFEST_URL: manifestUrl }))
  const response = mockResponse()
  await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=550' }, response)
  const message = JSON.parse(response.body).message
  assert.equal(response.statusCode, 503)
  assert.match(message, /ENABLE_AUTHORIZED_ADDON_LOOKUPS=true/)
  assert.doesNotMatch(message, /TORRENTIO_MANIFEST_URL/)
  assert.doesNotMatch(message, /never-return-this-value/)
})

test('Live TV registry stays empty until an authorized HTTPS media URL is configured', () => {
  assert.deepEqual(liveTvChannels, [])
  assert.deepEqual(getConfiguredLiveChannels(), [])
  const channel = { id: 'news-1', name: 'Example News', category: 'News', description: 'Authorized channel', playbackUrl: 'https://cdn.example/live/channel.m3u8?token=public-demo', format: 'hls', rightsConfirmed: true, playbackTested: true }
  assert.equal(isConfiguredLiveChannel(channel), true)
  assert.equal(isConfiguredLiveChannel({ ...channel, playbackUrl: 'http://cdn.example/live/channel.m3u8' }), false)
  assert.equal(isConfiguredLiveChannel({ ...channel, playbackUrl: 'https://cdn.example/watch/channel' }), false)
  assert.equal(isConfiguredLiveChannel({ ...channel, rightsConfirmed: false }), false)
  assert.equal(isConfiguredLiveChannel({ ...channel, playbackTested: false }), false)
  assert.equal(isConfiguredLiveChannel({ ...channel, format: 'mp4', playbackUrl: 'https://cdn.example/live/channel.m3u8' }), false)
  assert.equal(isSafeLiveTvLogo('https://cdn.example/logo.png'), true)
  assert.equal(isSafeLiveTvLogo('http://cdn.example/logo.png'), false)
})
