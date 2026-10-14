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
const { getConfiguredLiveChannels, isConfiguredLiveChannel, isSafeLiveTvLogo, isSportsLiveChannel, liveTvChannels, parseIptvPlaylist } = await importTypeScript('src/liveTv.ts')
const { classifyLiveTvAvailability, createLiveTvHealthHandler, isPublicAddress } = await importTypeScript('api/live-tv/health.ts')
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
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'movie', id: 550 }), 'https://web.nxsha.app/embed/movie/550?color=orange&disable_app_ad=true')
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'tv', id: 1396, season_number: 2, episode_number: 3 }), 'https://web.nxsha.app/embed/tv/1396/2/3?disable_app_ad=true')
  assert.equal(getExternalPlayerUrl(nxshaPlaybackSource, { media_type: 'tv', id: 1396, season_number: 0, episode_number: 1 }), 'https://web.nxsha.app/embed/tv/1396/0/1?disable_app_ad=true')
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
  assert.match(player, /makeYouTubeEmbedUrl\(videoKey, \{ autoplay: true, muted: true, controls: false \}\)/)
  assert.match(app, /isCurrentHeroEvent\(endedKey, activeKeyRef\.current\)/)
  assert.match(app, /buildHeroCarousel\(yourName, trending, 10\)/)
  assert.match(app, /getMovieDetails\(YOUR_NAME_TMDB_ID\)/)
  assert.match(app, /onTouchStart=\{onHeroTouchStart\}/)
  assert.match(app, /onTouchEnd=\{onHeroTouchEnd\}/)
  assert.match(app, /heroPlaybackToggle\.current\?\.\(\)/)
  assert.match(styles, /\.hero\[data-trailer-playing="true"\] \.hero-artwork\{opacity:0\}/)
  assert.doesNotMatch(styles, /\.hero-artwork\{[^}]*animation:heroArtworkIn/)
  assert.match(styles, /\.hero-youtube-host iframe \{ width:max\(100cqw,177\.78cqh\); height:max\(100cqh,56\.25cqw\); \}/)
  assert.match(styles, /height:clamp\(500px,77svh,630px\)/)
  const youtube = await readFile(new URL('../src/playback/youtube.ts', import.meta.url), 'utf8')
  assert.match(youtube, /cc_load_policy: '0'/)
  assert.doesNotMatch(youtube, /suggestedQuality|vq:/)
})

test('movie and TV detail trailers render inline before cast and clean up when closed', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const data = await readFile(new URL('../src/data.ts', import.meta.url), 'utf8')
  const detailTrailer = app.slice(app.indexOf('function DetailTrailerInline('), app.indexOf('function CastList('))
  const backgroundTrailer = app.slice(app.indexOf('function DetailHeroArtwork('), app.indexOf('function DetailTrailerInline('))
  assert.match(app, /DetailTrailerInline videoKey=\{detailed\.trailerKey\} title=\{movie\.title\} open=\{trailerOpen\}/)
  assert.match(app, /DetailTrailerInline videoKey=\{show\.trailerKey\} title=\{show\.title\} open=\{trailerOpen\}/)
  assert.match(app, /DetailHeroArtwork artwork=\{movie\.backdrop\} videoKey=\{movie\.officialTrailerKey\} title=\{movie\.title\} suspended=\{trailerOpen\} onRegisterToggle=\{toggleBackgroundTrailer\}/)
  assert.match(app, /DetailHeroArtwork artwork=\{show\.backdrop\} videoKey=\{show\.officialTrailerKey\} title=\{show\.title\} suspended=\{trailerOpen\} onRegisterToggle=\{toggleBackgroundTrailer\}/)
  assert.match(app, /className="detail-hero" role="group" tabIndex=\{0\}[^>]*onClick=\{toggleBanner\} onKeyDown=\{handleBannerKeyDown\}/)
  assert.equal((data.match(/const officialTrailerKey = videos\.find\(video => video\.site === 'YouTube' && video\.type === 'Trailer' && video\.official\)\?\.key/g) ?? []).length, 2)
  assert.match(data, /trailerKey: officialTrailerKey \?\? videos\.find\(video => video\.site === 'YouTube' && video\.type === 'Trailer'\)\?\.key/)
  assert.match(app, /className="hero-actions"[\s\S]*?Watch Trailer/)
  assert.match(backgroundTrailer, /makeYouTubeEmbedUrl\(videoKey!?, \{ autoplay: true, muted: true, controls: false \}\)/)
  assert.match(backgroundTrailer, /new api\.Player\(frame/)
  assert.match(backgroundTrailer, /muted: true/)
  assert.match(backgroundTrailer, /if \(!suspendedRef\.current && !userPaused\.current\) \{[\s\S]*?target\.playVideo\(\)/)
  assert.match(backgroundTrailer, /userPaused\.current = true[\s\S]*?player\.current\?\.pauseVideo\(\)/)
  assert.match(backgroundTrailer, /userPaused\.current = false[\s\S]*?player\.current\?\.playVideo\(\)/)
  assert.doesNotMatch(backgroundTrailer, /FullscreenButton|detail-hero-control/)
  assert.match(backgroundTrailer, /current\?\.destroy\(\)/)
  assert.match(backgroundTrailer, /onAutoplayBlocked/)
  assert.ok(backgroundTrailer.includes('/^[\\w-]{11}$/'))
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(styles, /\.detail-trailer-backdrop\.is-playing \.detail-backdrop-art \{ opacity:0;/)
  assert.match(styles, /\.detail-trailer-backdrop\.is-playing \.detail-youtube-host iframe \{ opacity:1;/)
  assert.match(detailTrailer, /scrollIntoView\(\{ behavior: reduceMotion \? 'auto' : 'smooth'/)
  assert.match(detailTrailer, /onClick=\{onClose\}/)
  assert.match(detailTrailer, /makeYouTubeEmbedUrl\(videoKey, \{ autoplay: true, muted: true, controls: true \}\)/)
  assert.match(detailTrailer, /allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"/)
  assert.match(detailTrailer, /allowFullScreen/)
  assert.match(detailTrailer, /className="detail-youtube-iframe-inline"/)
  assert.doesNotMatch(detailTrailer, /loadYouTubeApi|new api\.Player/)
  assert.match(detailTrailer, /className="detail-trailer-close-row"[\s\S]*?aria-label="Close trailer">×/)
  assert.doesNotMatch(detailTrailer, /FullscreenButton|detail-trailer-mute|detail-trailer-inline-heading|detail-trailer-error-inline|Try again/)
  assert.equal((app.match(/event\.stopPropagation\(\); setTrailerOpen\(true\)/g) ?? []).length, 2)
  assert.match(styles, /\.detail-trailer-inline-frame \{[^}]*aspect-ratio:16\/9/)
  assert.match(styles, /\.detail-youtube-iframe-inline \{[^}]*width:100%;height:100%[^}]*pointer-events:auto/)
  assert.doesNotMatch(detailTrailer, /aria-modal|role=\{?['"]dialog/)
})

test('Live TV caps category tabs at ten and omits the channel attribution/status paragraph', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const livePage = app.slice(app.indexOf('function LiveTvPage('), app.indexOf('function AboutPage('))
  assert.match(livePage, /const options = \['All Channels'\][\s\S]*?return options\.slice\(0, 10\)/)
  assert.match(livePage, /categoryOptions\.map\(\(item, index\)/)
  assert.doesNotMatch(livePage, /Listings from IPTV-org\. Green: supported response or playback; red: confirmed 404\/410; grey: unchecked or inconclusive\. Reachability does not confirm rights\./)
  assert.doesNotMatch(livePage, /live-setup-footnote/)
})

test('AAK Player keeps its iframe and fullscreen control without the AAK, Reload, or Open player items', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const player = app.slice(app.indexOf('function ExternalIframePlayer('), app.indexOf('function LegacyEpisodeRedirect('))
  assert.match(player, /<iframe title=\{title\} src=\{src\}/)
  assert.match(player, /<FullscreenButton targetRef=\{playerShell\} hideWhenActive \/>/)
  assert.doesNotMatch(player, /AAK Player|Reload|Open player|<a href=\{src\}/)
  assert.match(player, /sandbox="allow-scripts allow-same-origin"/)
  assert.match(player, /allow="autoplay; encrypted-media; fullscreen; picture-in-picture"/)
  assert.doesNotMatch(player, /allow-popups|allow-top-navigation|allow-presentation/)
})

test('AAK fullscreen control hides while active and other player fullscreen behavior remains unchanged', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const native = await readFile(new URL('../src/playback/NativeVideoPlayer.tsx', import.meta.url), 'utf8')
  const universal = await readFile(new URL('../src/playback/UniversalPlayerPanel.tsx', import.meta.url), 'utf8')
  const livePlayer = await readFile(new URL('../src/playback/LiveTvPlayer.tsx', import.meta.url), 'utf8')
  const control = await readFile(new URL('../src/playback/FullscreenButton.tsx', import.meta.url), 'utf8')
  assert.match(app, /<div className="player-frame" ref=\{stage\}>[\s\S]*?<\/div>\s*<div className="player-note"><div className="player-note-controls"><FullscreenButton targetRef=\{playerShell\}/)
  assert.match(app, /<FullscreenButton targetRef=\{playerShell\} hideWhenActive \/>/)
  assert.match(native, /<div className="native-video-player" ref=\{playerShell\}>[\s\S]*?<div className="native-player-toolbar"[\s\S]*?<FullscreenButton targetRef=\{playerShell\} \/>/)
  assert.match(universal, /className="addon-embed-player" ref=\{embedPlayer\}[\s\S]*?<div className="addon-player-toolbar"><FullscreenButton targetRef=\{embedPlayer\} \/>/)
  assert.doesNotMatch(livePlayer, /FullscreenButton|live-tv-player-toolbar/)
  assert.doesNotMatch(app.slice(app.indexOf('function DetailTrailerInline('), app.indexOf('function CastList(')), /FullscreenButton/)
  assert.match(livePlayer, /await import\('hls\.js'\)/)
  assert.match(livePlayer, /canPlayType\('application\/vnd\.apple\.mpegurl'\)/)
  assert.match(livePlayer, /instance\?\.destroy\(\)/)
  assert.match(control, /requestFullscreen\(\)/)
  assert.match(control, /webkitEnterFullscreen/)
  assert.match(control, /fullscreenchange/)
  assert.match(control, /target\.contains\(fullscreenElement\)/)
  assert.match(control, /aria-label=\{active \? 'Exit fullscreen' : 'Enter fullscreen'\}/)
  assert.match(control, /hideWhenActive && active/)
})

test('AAK iframe fullscreen fills the viewport without reserving toolbar or aspect-ratio space', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(styles, /\.external-player:fullscreen \{[^}]*width:100vw;height:100vh;height:100dvh[^}]*margin:0;padding:0/)
  assert.match(styles, /\.external-player:fullscreen \.player-frame \{[^}]*width:100%;height:100%[^}]*flex:1 1 auto;aspect-ratio:auto/)
  assert.match(styles, /\.external-player:fullscreen \.player-frame iframe \{[^}]*width:100%;height:100%;max-width:none;max-height:none/)
  assert.match(styles, /\.external-player:fullscreen \.player-note \{ display:none; \}/)
})

test('Live TV keeps the full filtered directory browsable and checks visible rows with bounded status semantics', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const player = await readFile(new URL('../src/playback/LiveTvPlayer.tsx', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  const livePage = app.slice(app.indexOf('function LiveTvPage('), app.indexOf('function AboutPage('))
  assert.match(livePage, /channels\.filter\(channel =>/)
  assert.match(livePage, /liveListEntries\.slice\(visibleStart, visibleEnd\)/)
  assert.match(livePage, /live-channel-groups/)
  assert.doesNotMatch(livePage, /<table className="live-channel-table"/)
  assert.match(livePage, /matchingChannels\.length\.toLocaleString\(\)/)
  assert.match(livePage, /const options = \['All Channels'\][\s\S]*?if \(channels\.some\(isSportsLiveChannel\)\) options\.push\('Sports'\)/)
  assert.match(livePage, /healthWorkers\.current < 3/)
  assert.match(livePage, /healthQueue\.current\.unshift\(selectedChannel\)/)
  assert.match(livePage, /state: 'unknown'[\s\S]*checkedAt: Date\.now\(\)/)
  assert.match(app, /state === 'unknown' \? 'Unverified' : 'Not checked'/)
  assert.match(livePage, /health\[entry\.channel\.id\]\?\.state \?\? 'unchecked'/)
  assert.match(livePage, /live-tv-empty-stage/)
  assert.match(livePage, /setSelectedId\(entry\.channel\.id\)/)
  assert.match(player, /onPrevious\?\.\(\)|onClick=\{onPrevious\}/)
  assert.match(player, /onNext\?\.\(\)|onClick=\{onNext\}/)
  assert.match(player, /<video ref=\{video\} controls playsInline/)
  assert.doesNotMatch(player, /qualityLevels|FullscreenButton|live-volume-control|Reconnect|live-tv-player-toolbar/)
  assert.match(player, /metadata\.presentedFrames > 0/)
  assert.doesNotMatch(player, /status === 'error'|status === 'blocked'|role="alert"|Playback could not be confirmed/)
  assert.match(player, /const handleMediaError = \(\) => fail\(\)/)
  assert.doesNotMatch(player, /<input[^>]+type="range"[^>]+aria-label="Seek|durationProgress/)
  assert.match(styles, /body\.live-tv-active\s*\{[^}]*overflow:hidden/)
  assert.doesNotMatch(styles, /\.live-player-error\s*\{[^}]*position:absolute/)
  assert.match(styles, /\.live-channel-scroll\s*\{[^}]*flex:1;overflow:auto/)
  assert.match(styles, /\.live-category-filters\s*\{[^}]*overflow-x:auto/)
})

test('Live TV media failures stay silent while video and channel controls remain mounted', async () => {
  const player = await readFile(new URL('../src/playback/LiveTvPlayer.tsx', import.meta.url), 'utf8')
  const output = player.slice(player.indexOf('return <div className="live-tv-player">'))
  assert.match(player, /const handleMediaError = \(\) => fail\(\)/)
  assert.match(player, /const fail = \(availability: AvailabilityStatus = 'unknown'\)/)
  assert.match(player, /onStatusRef\.current\?\.\(availability\)/)
  assert.doesNotMatch(output, /role="alert"|live-player-error|status === 'error'|status === 'blocked'/)
  assert.match(output, /<video ref=\{video\} controls playsInline/)
  assert.match(output, /<nav className="live-channel-navigation"[\s\S]*?onClick=\{onPrevious\}[\s\S]*?onClick=\{onNext\}/)
})

test('desktop and mobile share the six destination quick navigation', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  const navigation = app.slice(app.indexOf('function BottomNavigation('), app.indexOf('function BackToTop('))
  for (const label of ['Home', 'Search', 'Movies', 'TV Shows', 'Anime', 'Live TV']) assert.ok(navigation.includes(`label: '${label}'`))
  assert.match(styles, /\.bottom-navigation \{ display:grid!important;bottom:max\(14px,env\(safe-area-inset-bottom\)\)/)
  assert.match(styles, /\.bottom-navigation a\.active[^}]*color:var\(--accent\)/)
})

test('Discover loads TMDB pages incrementally and discards stale page requests', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  const discover = app.slice(app.indexOf('function Discover('), app.indexOf('function MediaRow('))
  assert.match(discover, /className="page-wrap discover-page"/)
  assert.match(discover, /getDiscoverCatalogPage\(filters, requestedPage, current\.controller\.signal\)/)
  assert.match(discover, /current\?\.controller\.abort\(\)/)
  assert.match(discover, /request\.current !== current/)
  assert.match(discover, /dedupeMediaByIdentity\(/)
  assert.match(discover, /new IntersectionObserver/)
  assert.match(discover, /useSpeechRecognition\(onVoiceTranscript\)/)
  assert.doesNotMatch(discover, /className="provider-filters"/)
  assert.match(styles, /\.discover-page \.discover-grid > \.movie-card \{ display:block; \}/)
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

test('Discover pagination uses media-specific TMDB search routes and deduplicates with media-aware IDs', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const requested = []
  globalThis.window = { location: { origin: 'https://aak.test' } }
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    const path = url.searchParams.get('path')
    requested.push(url)
    if (path.startsWith('/genre/')) return new Response('{"genres":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    const page = Number(url.searchParams.get('page'))
    const records = page === 1
      ? [{ id: 42, media_type: 'movie', title: 'Example Film', release_date: '2024-01-01' }]
      : [{ id: 42, media_type: 'movie', title: 'Duplicate Film', release_date: '2024-01-01' }, { id: 43, media_type: 'movie', title: 'Second Film', release_date: '2024-02-01' }]
    return new Response(JSON.stringify({ page, total_pages: 2, results: records }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const filters = { query: 'example', type: 'movie', anime: false, genre: 'All films', year: 'Any year', language: 'Any language', sort: 'popular', region: 'BD', monetization: ['flatrate'] }
  try {
    const first = await tmdbData.getDiscoverCatalogPage(filters, 1)
    const second = await tmdbData.getDiscoverCatalogPage(filters, 2)
    assert.equal(first.totalPages, 2)
    assert.equal(first.page, 1)
    assert.equal(second.page, 2)
    assert.deepEqual(requested.filter(url => url.searchParams.get('path') === '/search/movie').map(url => url.searchParams.get('page')), ['1', '2'])
    assert.equal(requested.some(url => url.searchParams.get('path') === '/search/multi'), false)
    const tvWithSameId = { ...first.results[0], media_type: 'tv', first_air_date: '2024-01-01' }
    const merged = tmdbData.dedupeMediaByIdentity([...first.results, ...second.results, tvWithSameId])
    assert.deepEqual(merged.map(item => `${item.media_type}:${item.id}`), ['movie:42', 'movie:43', 'tv:42'])
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
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

test('duplicate provider metadata keeps the preferred priority and recovers a valid logo from the other catalog', () => {
  const merged = tmdbData.mergeWatchProviders(
    [{ provider_id: 8, provider_name: 'Netflix', logo_path: null, display_priority: 1 }],
    [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix-official.png', display_priority: 3 }],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].display_priority, 1)
  assert.equal(merged[0].logo_path, '/netflix-official.png')
  assert.equal(tmdbData.getProviderLogoUrl(merged[0].logo_path), 'https://image.tmdb.org/t/p/w185/netflix-official.png')
})

test('homepage provider marquee promotes available major services and keeps the rest stable', () => {
  const providers = [
    { provider_id: 70, provider_name: 'Regional Service', logo_path: '/regional.png', display_priority: 1 },
    { provider_id: 9, provider_name: 'Apple TV+', logo_path: '/apple.png', display_priority: 20 },
    { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 30 },
    { provider_id: 119, provider_name: 'Disney Plus', logo_path: '/disney.png', display_priority: 8 },
    { provider_id: 1, provider_name: 'Another Regional Service', logo_path: '/other.png', display_priority: 1 },
  ]
  const ranked = tmdbData.prioritizeHomepageProviders(providers)
  assert.deepEqual(ranked.map(item => item.provider_name), ['Netflix', 'Disney Plus', 'Apple TV+', 'Another Regional Service', 'Regional Service'])
  assert.deepEqual(providers.map(item => item.provider_name), ['Regional Service', 'Apple TV+', 'Netflix', 'Disney Plus', 'Another Regional Service'])
})

test('homepage marquee collapses duplicate IDs and known provider aliases while retaining the full input dataset', () => {
  const providers = [
    { provider_id: 9, provider_name: 'Amazon Prime Video', logo_path: '/prime-a.png', display_priority: 4 },
    { provider_id: 10, provider_name: 'Amazon Prime Video', logo_path: '/prime-b.png', display_priority: 1 },
    { provider_id: 11, provider_name: 'Disney Plus', logo_path: '/disney-a.png', display_priority: 2 },
    { provider_id: 12, provider_name: 'Disney+', logo_path: '/disney-b.png', display_priority: 7 },
    { provider_id: 13, provider_name: 'Regional Service', logo_path: '/regional.png', display_priority: 3 },
  ]
  const marquee = tmdbData.prioritizeHomepageProviders(providers)
  assert.deepEqual(marquee.map(provider => provider.provider_id), [10, 11, 13])
  assert.equal(providers.length, 5)
})

test('All Providers uses one global name search and keeps the complete merged dataset', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const page = app.slice(app.indexOf('function ProviderDirectory('), app.indexOf('function InstallPage('))
  assert.match(page, /mergeWatchProviders\(movies, tv\)/)
  assert.match(page, /type="search"/)
  assert.match(page, /provider\.provider_name\.toLocaleLowerCase\(\)\.includes/)
  assert.match(page, /No providers match that name/)
  assert.doesNotMatch(page, /media-switch|watch_region|Region selector/)
})

test('account UI is gated on real Supabase Auth configuration and calls provider APIs', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const auth = await readFile(new URL('../src/auth/supabase.ts', import.meta.url), 'utf8')
  const accessPanel = app.slice(app.indexOf('function AccountAccessPanel('), app.indexOf('function AuthCallbackPage('))
  assert.match(accessPanel, /!isSupabaseAuthConfigured/)
  assert.match(accessPanel, /signInWithOAuth\(\{ provider: 'google'/)
  assert.match(accessPanel, /signInWithOtp\(/)
  assert.match(accessPanel, /\.auth\.signOut\(\)/)
  assert.match(auth, /VITE_SUPABASE_URL/)
  assert.match(auth, /VITE_SUPABASE_ANON_KEY/)
  assert.doesNotMatch(auth, /VITE_SUPABASE_(?:SERVICE_ROLE|CLIENT_SECRET)/i)
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
  assert.equal(manifest.orientation, 'portrait')
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

test('addon movie lookup maps a TMDB movie to the movie stream endpoint', async () => {
  const originalFetch = globalThis.fetch
  const requested = []
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    requested.push(url)
    if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0468569"}', { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.pathname.endsWith('/manifest.json')) return new Response(JSON.stringify({ types: ['movie'], resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response('{"streams":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const handler = createAddonHandler(() => ({ ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }))
    const response = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=155' }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(JSON.parse(response.body).id, 'tt0468569')
    assert.ok(requested.some(url => url.pathname === '/stream/movie/tt0468569.json'))
    assert.ok(requested.some(url => url.pathname === '/3/movie/155/external_ids'))
    assert.equal(requested.some(url => url.pathname.includes('/stream/series/')), false)
  } finally { globalThis.fetch = originalFetch }
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

test('addon lookup rejects incompatible manifests and never follows provider redirects', async () => {
  const originalFetch = globalThis.fetch
  const env = { ENABLE_AUTHORIZED_ADDON_LOOKUPS: 'true', TMDB_READ_ACCESS_TOKEN: 'unit-test-token', TORRENTIO_MANIFEST_URL: 'https://torrentio.strem.fun/manifest.json' }
  const handler = createAddonHandler(() => env)
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input))
      if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0111161"}', { status: 200, headers: { 'content-type': 'application/json' } })
      return new Response(JSON.stringify({ types: ['movie'], resources: ['catalog'] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const invalidManifest = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=278' }, invalidManifest)
    assert.equal(invalidManifest.statusCode, 422)

    const requestedHosts = []
    globalThis.fetch = async input => {
      const url = new URL(String(input))
      requestedHosts.push(url.hostname)
      if (url.hostname === 'api.themoviedb.org') return new Response('{"imdb_id":"tt0111161"}', { status: 200, headers: { 'content-type': 'application/json' } })
      return new Response(null, { status: 302, headers: { location: 'https://redirect-target.example/manifest.json' } })
    }
    const redirected = mockResponse()
    await handler({ method: 'GET', url: '/api/addons/torrentio?media_type=movie&tmdb_id=278' }, redirected)
    assert.equal(redirected.statusCode, 502)
    assert.equal(requestedHosts.includes('redirect-target.example'), false)
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
    for (const query of ['episode_number=2', 'season_number=-1&episode_number=2', 'season_number=1&episode_number=0', 'season_number=1.5&episode_number=2']) {
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

test('IPTV M3U parsing preserves channel metadata, rejects unsafe URLs and deduplicates exact entries', () => {
  const playlist = `#EXTM3U
#EXTINF:-1 tvg-id="news.one" tvg-name="News One" tvg-logo="https://cdn.example/news.png" group-title="News",News One, East
https://streams.example/news/index.m3u8?token=demo
#EXTINF:-1 tvg-id="news.one" tvg-name="News One" tvg-logo="javascript:alert(1)" group-title="News",News One, East
https://streams.example/news/index.m3u8?token=demo
#EXTINF:-1 tvg-id="sports.two" group-title="International Sports, Live",Sport Two
https://streams.example/sports/main.m3u8
#EXTINF:-1 group-title="",Uncategorized
https://streams.example/movies/feature.mp4
#EXTINF:-1 group-title="Broken",Bad HTTP
http://streams.example/live.m3u8
#EXTINF:-1 group-title="Broken",Bad type
https://streams.example/watch?id=12
#EXTINF:-1 group-title="Broken" No title delimiter
https://streams.example/no-metadata.m3u8`
  const channels = parseIptvPlaylist(playlist)
  assert.equal(channels.length, 3)
  assert.equal(channels[0].name, 'News One, East')
  assert.equal(channels[0].tvgId, 'news.one')
  assert.equal(channels[0].logoUrl, 'https://cdn.example/news.png')
  assert.equal(channels[0].format, 'hls')
  assert.equal(channels[1].category, 'International Sports, Live')
  assert.equal(isSportsLiveChannel(channels[1]), true)
  assert.equal(channels[2].category, 'Other')
  assert.equal(channels[2].format, 'mp4')
})

test('Live TV health endpoint rejects non-HTTPS and private-network probe targets', async () => {
  const handler = createLiveTvHealthHandler()
  const insecure = mockResponse()
  await handler({ method: 'POST', body: { url: 'http://cdn.example/live.m3u8' }, headers: { 'x-forwarded-for': '198.51.100.42' } }, insecure)
  assert.equal(insecure.statusCode, 400)
  assert.match(JSON.parse(insecure.body).message, /HTTPS/)

  const privateAddress = mockResponse()
  await handler({ method: 'POST', body: { url: 'https://127.0.0.1/live.m3u8?token=private' }, headers: { 'x-forwarded-for': '198.51.100.43' } }, privateAddress)
  assert.equal(privateAddress.statusCode, 200)
  assert.equal(JSON.parse(privateAddress.body).online, false)
  assert.equal(JSON.parse(privateAddress.body).state, 'unknown')
  assert.doesNotMatch(privateAddress.body, /token=private/)
})

test('Live TV health handler reports verified media responses and safely handles probe timeouts', async () => {
  const onlineHandler = createLiveTvHealthHandler(async () => ({ online: true, state: 'online', format: 'hls', message: 'HLS playlist signature found.', checkedAt: 10 }))
  const online = mockResponse()
  await onlineHandler({ method: 'POST', body: { url: 'https://media.example/channel.m3u8?health-test=success' } }, online)
  assert.equal(online.statusCode, 200)
  assert.equal(JSON.parse(online.body).online, true)
  assert.equal(JSON.parse(online.body).state, 'online')
  assert.doesNotMatch(online.body, /health-test/)

  const timeoutHandler = createLiveTvHealthHandler(async () => { throw new Error('Probe timeout.') })
  const timeout = mockResponse()
  await timeoutHandler({ method: 'POST', body: { url: 'https://media.example/channel.m3u8?health-test=timeout' } }, timeout)
  assert.equal(timeout.statusCode, 200)
  assert.equal(JSON.parse(timeout.body).online, false)
  assert.equal(JSON.parse(timeout.body).state, 'unknown')
  assert.match(JSON.parse(timeout.body).message, /could not be checked reliably/i)
  assert.doesNotMatch(timeout.body, /health-test|Probe timeout/)
})

test('Live TV health classification reserves red/offline status for reliable 404 and 410 responses', () => {
  assert.equal(classifyLiveTvAvailability(200, true), 'online')
  assert.equal(classifyLiveTvAvailability(206, true), 'online')
  assert.equal(classifyLiveTvAvailability(404, false), 'offline')
  assert.equal(classifyLiveTvAvailability(410, false), 'offline')
  for (const status of [0, 200, 206, 301, 401, 403, 429, 500, 503]) assert.equal(classifyLiveTvAvailability(status, false), 'unknown')
})

test('Live TV health address checks accept public origins and reject private, loopback, and reserved addresses', () => {
  assert.equal(isPublicAddress('1.1.1.1', 4), true)
  assert.equal(isPublicAddress('10.0.0.5', 4), false)
  assert.equal(isPublicAddress('127.0.0.1', 4), false)
  assert.equal(isPublicAddress('192.0.2.1', 4), false)
  assert.equal(isPublicAddress('2606:4700:4700::1111', 6), true)
  assert.equal(isPublicAddress('::1', 6), false)
})
