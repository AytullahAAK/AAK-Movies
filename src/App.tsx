import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ArrowDownWideNarrow, ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Compass, Download, ExternalLink, Film, Heart, House, Info, Library, ListFilter, LockKeyhole, Magnet, MonitorPlay, Moon, Play, Radio, Search, Settings, ShieldCheck, Smartphone, Sparkles, Star, Sun, Tv, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { animeTvCatalog, genres, genreApiId, getCatalogBySort, getGenreCatalog, getGlobalWatchProviders, getHomeCatalog, getMediaTrailerKey, getMovieDetails, getProviderCatalog, getProviderLogoUrl, getTvDetails, getTvSeason, getWatchProviders, mediaDate, mediaTypeLabel, mediaYear, mergeWatchProviders, movies, searchCatalog, trendingAllDay, type CastMember, type Media, type MediaType, type Movie, type MovieDetails, type TvDetails, type TvEpisode, type TvShow, type WatchMonetization, type WatchProvider } from './data'
import { getExternalPlayerUrl, nxshaPlaybackSource, type PlaybackTarget } from './playback/sources'
import { UniversalPlayerPanel } from './playback/UniversalPlayerPanel'
import { builtInManifests, describeManifestResource, type StremioResource } from './playback/builtInManifests'
import { readWatchProgress, removeWatchProgress, subscribeWatchProgress, type WatchProgress } from './playback/watchProgress'
import { accentLabel, accentPreferenceKey, accentPresets, getAccentChoices, getAccentColors, isAccentValue, isHexAccent, lastCustomAccentPreferenceKey, readPreference, storeCustomAccent, writePreference, type AccentValue } from './theme'
import { useHorizontalDrag } from './useHorizontalDrag'
import { getConfiguredLiveChannels, isSafeLiveTvLogo } from './liveTv'
import { HeroTrailerPlayer } from './home/HeroTrailerPlayer'
import { buildHeroCarousel, getHeroSwipeDirection, getNextHeroIndex, isCurrentHeroEvent, YOUR_NAME_TMDB_ID } from './home/heroCarousel'

function mediaKey(item: Media) { return `${item.media_type}:${item.id}` }
function isSaved(saved: Media[], item: Media) { return saved.some(value => mediaKey(value) === mediaKey(item)) }

type DeferredInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }> }
function App() {
  const [profileOpen, setProfileOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'night'>(() => {
    const savedTheme = readPreference('aak-movies-theme')
    const initialTheme = savedTheme === 'light' || savedTheme === 'night' ? savedTheme : 'light'
    document.documentElement.dataset.theme = initialTheme
    return initialTheme
  })
  const [saved, setSaved] = useState<Media[]>([])
  const [toast, setToast] = useState('')
  const [accent, setAccent] = useState<AccentValue>(() => {
    const value = readPreference(accentPreferenceKey)
    const initialAccent = isAccentValue(value) ? value : 'blue'
    applyAccent(initialAccent)
    return initialAccent
  })
  const [lastCustomAccent, setLastCustomAccent] = useState<string | null>(() => {
    const savedCustom = readPreference(lastCustomAccentPreferenceKey)
    if (isHexAccent(savedCustom ?? '')) return savedCustom
    const current = readPreference(accentPreferenceKey)
    return isHexAccent(current ?? '') ? current : null
  })
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const reloadAfterUpdate = useRef(false)
  const location = useLocation()
  useEffect(() => { document.documentElement.dataset.theme = theme; writePreference('aak-movies-theme', theme); const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]'); if (meta) meta.content = theme === 'night' ? '#000000' : '#e9e8e4' }, [theme])
  useEffect(() => { applyAccent(accent); writePreference(accentPreferenceKey, accent) }, [accent])
  const updateAccent = (value: AccentValue) => {
    if (isHexAccent(value)) {
      setLastCustomAccent(value)
      storeCustomAccent(value)
    }
    setAccent(value)
  }
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setIsInstalled(standalone)
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as DeferredInstallPrompt) }
    const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null) }
    let updateWorker: ServiceWorker | undefined
    const onControllerChange = () => { if (reloadAfterUpdate.current) window.location.reload() }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').then(value => {
        if (value.waiting && navigator.serviceWorker.controller) setUpdateReady(true)
        value.addEventListener('updatefound', () => {
          updateWorker = value.installing ?? undefined
          updateWorker?.addEventListener('statechange', () => {
            if (updateWorker?.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true)
          })
        })
        void value.update().catch(() => undefined)
      }).catch(error => console.warn('[PWA] Service worker registration failed.', error))
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])
  const toggleSaved = (item: Media) => { const exists = saved.some(value => mediaKey(value) === mediaKey(item)); setSaved(current => exists ? current.filter(value => mediaKey(value) !== mediaKey(item)) : [...current, item]); setToast(exists ? 'Removed from your library' : 'Added to your library'); window.setTimeout(() => setToast(''), 2300) }
  const installApp = async () => {
    if (!installPrompt) return
    try { await installPrompt.prompt(); await installPrompt.userChoice }
    catch (cause) { console.warn('[PWA] Browser install prompt failed.', cause) }
    finally { setInstallPrompt(null) }
  }
  const updateApp = () => {
    reloadAfterUpdate.current = true
    navigator.serviceWorker?.getRegistration().then(registration => registration?.waiting?.postMessage({ type: 'SKIP_WAITING' }))
  }
  return <div className="app-shell">
    <Header theme={theme} setTheme={setTheme} onOpenProfile={() => setProfileOpen(true)} />
    {updateReady && <aside className="app-update-banner" role="status"><span>A new AAK Movies version is ready.</span><button type="button" onClick={updateApp}>Update and reload</button></aside>}
    <main><Routes>
      <Route path="/" element={<Home saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/discover" element={<Discover saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/providers" element={<ProviderDirectory />} />
      <Route path="/install" element={<InstallPage installPrompt={installPrompt} installApp={installApp} isInstalled={isInstalled} />} />
      <Route path="/live-tv" element={<LiveTvPage />} />
      <Route path="/movie/:id" element={<MovieDetailsPage key={location.pathname} saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/tv/:id" element={<TvDetailsPage key={location.pathname} saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/tv/:id/season/:seasonNumber" element={<TvSeasonPage key={location.pathname} />} />
      <Route path="/watch/movie/:id" element={<MovieWatchPage key={location.pathname} />} />
      <Route path="/watch/tv/:id/:seasonNumber/:episodeNumber" element={<LegacyEpisodeRedirect />} />
      <Route path="/watch/:id" element={<MovieWatchPage key={location.pathname} />} />
      <Route path="/sources" element={<ManifestManager />} />
      <Route path="/library" element={<LibraryPage saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/profile" element={<Profile accent={accent} lastCustomAccent={lastCustomAccent} setAccent={updateAccent} />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<InfoPage title="Contact information unavailable." kicker="CONTACT" text="A public support contact is not configured for this demonstration." />} />
      <Route path="/privacy" element={<Policy title="Privacy, in plain language." kicker="PRIVACY" text="This demo stores saved titles and manifest URLs in browser storage. TMDB searches and metadata requests are sent to TMDB. Never configure private credentials in a client bundle for production." />} />
      <Route path="/terms" element={<Policy title="A few ground rules." kicker="TERMS" text="AAK Movies is a discovery interface. Film and series metadata is supplied by TMDB. Viewing availability, licensing, and playback rights vary by territory and provider." />} />
      <Route path="/copyright" element={<Policy title="Content & copyright." kicker="RIGHTS & REMOVAL" text="AAK Movies does not host movie or television files. External playback is handled by providers. Rights holders should contact the AAK Movies operator with the title, rights documentation, and contact information." />} />
      <Route path="*" element={<InfoPage title="A scene missing from the reel." kicker="404" text="We couldn’t find that page. Return to the collection and find a new favorite." />} />
    </Routes></main>
    <BottomNavigation />
    <Footer />{toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    {profileOpen && <ProfilePopup accent={accent} lastCustomAccent={lastCustomAccent} setAccent={updateAccent} theme={theme} setTheme={setTheme} onClose={() => setProfileOpen(false)} />}
  </div>
}

function applyAccent(value: AccentValue) {
  const root = document.documentElement
  const colors = getAccentColors(value)
  root.dataset.accent = isHexAccent(value) ? 'custom' : value
  root.style.setProperty('--accent-user-light', colors.light)
  root.style.setProperty('--accent-user-night', colors.night)
  root.style.setProperty('--accent-user-light-foreground', colors.lightForeground)
  root.style.setProperty('--accent-user-night-foreground', colors.nightForeground)
}

function Header({ theme, setTheme, onOpenProfile }: { theme: 'light' | 'night'; setTheme: (theme: 'light' | 'night') => void; onOpenProfile: () => void }) {
  return <header className="site-header"><Link className="brand" to="/" aria-label="AAK Movies home"><span className="brand-logo-plate"><img src="/images/aak-movies-logo.png" alt="" /></span><span>AAK Movies</span></Link>
    <nav className="main-nav" aria-label="Main navigation"><NavLink to="/discover"><Compass size={15} />Discover</NavLink><NavLink to="/library"><Library size={15} />My library</NavLink><NavLink to="/sources"><Settings size={15} />Sources</NavLink></nav>
    <div className="header-actions"><Link to="/install" className="header-icon-button install-link" aria-label="Download or install AAK Movies" title="Download or install"><Download size={18} /></Link><Link to="/discover" className="header-icon-button header-search" aria-label="Search movies and TV shows" title="Search"><Search size={18} /></Link><button className="header-icon-button theme-toggle" onClick={() => setTheme(theme === 'light' ? 'night' : 'light')} aria-label={theme === 'light' ? 'Switch to AMOLED night mode' : 'Switch to light mode'} title={theme === 'light' ? 'Night mode' : 'Light mode'}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button><button className="header-icon-button avatar" type="button" onClick={onOpenProfile} aria-label="Open preferences and app options" aria-haspopup="dialog" title="Profile and preferences"><UserRound size={18} /></button></div>
  </header>
}

function BottomNavigation() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const onDiscover = location.pathname === '/discover'
  const collection = query.get('collection')
  const media = query.get('media')
  const items = [
    { label: 'Home', to: '/', icon: House, active: location.pathname === '/' },
    { label: 'Search', to: '/discover', icon: Search, active: onDiscover && !media && collection !== 'anime' },
    { label: 'Movies', to: '/discover?media=movie', icon: Film, active: onDiscover && media === 'movie' && collection !== 'anime' },
    { label: 'TV Shows', to: '/discover?media=tv', icon: Tv, active: onDiscover && media === 'tv' && collection !== 'anime' },
    { label: 'Anime', to: '/discover?media=tv&collection=anime&genre=Animation&language=Japanese', icon: Sparkles, active: onDiscover && collection === 'anime' },
    { label: 'Live TV', to: '/live-tv', icon: Radio, active: location.pathname === '/live-tv' },
  ]
  return <nav className="bottom-navigation" aria-label="Quick navigation">
    {items.map(({ label, to, icon: Icon, active }) => <Link key={label} to={to} className={active ? 'active' : ''} aria-label={label} aria-current={active ? 'page' : undefined}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
    </Link>)}
  </nav>
}

function usePageMeta(title: string, description: string, type = 'website') {
  useEffect(() => {
    document.title = title
    const setMeta = (selector: string, attr: string, value: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector)
      if (!element) { element = document.createElement('meta'); document.head.appendChild(element) }
      element.setAttribute(attr, value)
    }
    setMeta('meta[name="description"]', 'content', description)
    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[property="og:description"]', 'content', description)
    setMeta('meta[property="og:type"]', 'content', type)
    const configured = import.meta.env.VITE_SITE_URL
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    try {
      const origin = configured ? new URL(configured) : null
      const hostname = origin?.hostname ?? ''
      const reservedHost = !hostname.includes('.') || /(^|\.)(localhost|local|invalid|test|example|example\.(com|org|net))$/i.test(hostname) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || /^(127\.|10\.|192\.168\.|0\.)/.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
      if (origin && origin.protocol === 'https:' && !origin.username && !origin.password && !reservedHost) {
        if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical) }
        canonical.href = new URL(window.location.pathname, origin).href
        setMeta('meta[property="og:url"]', 'content', canonical.href)
        setMeta('meta[property="og:image"]', 'content', new URL('/images/aak-movies-logo.png', origin).href)
      } else {
        canonical?.remove()
        document.head.querySelector('meta[property="og:url"]')?.remove()
        document.head.querySelector('meta[property="og:image"]')?.remove()
      }
      setMeta('meta[property="og:site_name"]', 'content', 'AAK Movies')
      setMeta('meta[name="twitter:card"]', 'content', 'summary')
      setMeta('meta[name="twitter:title"]', 'content', title)
      setMeta('meta[name="twitter:description"]', 'content', description)
    } catch { canonical?.remove(); document.head.querySelector('meta[property="og:url"]')?.remove(); document.head.querySelector('meta[property="og:image"]')?.remove() }
  }, [title, description, type])
}

function Home({ saved, toggleSaved }: { saved: Media[]; toggleSaved: (item: Media) => void }) {
  const [trending, setTrending] = useState<Media[]>([])
  const [yourName, setYourName] = useState<MovieDetails | null>(null)
  const [yourNameLoading, setYourNameLoading] = useState(true)
  const [trendingLoading, setTrendingLoading] = useState(true)
  const loading = trendingLoading || yourNameLoading
  const [error, setError] = useState('')
  const [rows, setRows] = useState<Record<string, Media[]>>({})
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({ topMovies: true, popularMovies: true, topTv: true, popularTv: true, anime: true, action: true, comedy: true })
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [providers, setProviders] = useState<WatchProvider[]>([])
  const [providerLoading, setProviderLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [trailer, setTrailer] = useState<{ mediaKey: string; key: string } | null>(null)
  const [trailerAttempt, setTrailerAttempt] = useState(0)
  const [trailerStatus, setTrailerStatus] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'failed'>('loading')
  const [playingMediaKey, setPlayingMediaKey] = useState('')
  const [muted, setMuted] = useState(true)
  const [heroVisible, setHeroVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  const [progress, setProgress] = useState<WatchProgress[]>(readWatchProgress)
  const heroRef = useRef<HTMLElement>(null)
  const heroPlaybackToggle = useRef<(() => void) | null>(null)
  const heroTouchStart = useRef<{ x: number; y: number } | null>(null)
  const suppressHeroClickUntil = useRef(0)
  const registerHeroPlaybackToggle = useCallback((toggle: (() => void) | null) => { heroPlaybackToggle.current = toggle }, [])
  usePageMeta('AAK Movies — Discover Movies & TV Series', 'Explore trending movies and television series on AAK Movies.')
  useEffect(() => { let active = true; trendingAllDay().then(items => { if (active) setTrending(items) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Catalog unavailable.') }).finally(() => { if (active) setTrendingLoading(false) }); return () => { active = false } }, [])
  useEffect(() => {
    let active = true
    getMovieDetails(YOUR_NAME_TMDB_ID).then(item => {
      if (item.media_type !== 'movie' || item.id !== YOUR_NAME_TMDB_ID) throw new Error('TMDB returned an unexpected record for the featured movie.')
      if (active) setYourName(item)
    }).catch(cause => {
      if (active) {
        const message = cause instanceof Error ? cause.message : 'Could not load the featured movie from TMDB.'
        setError(current => current || message)
      }
    }).finally(() => { if (active) setYourNameLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    const requests: [string, () => Promise<Media[]>][] = [
      ['topMovies', () => getHomeCatalog('movie', 'top_rated')],
      ['popularMovies', () => getHomeCatalog('movie', 'popular')],
      ['topTv', () => getHomeCatalog('tv', 'top_rated')],
      ['popularTv', () => getHomeCatalog('tv', 'popular')],
      ['anime', () => animeTvCatalog()],
      ['action', () => getGenreCatalog('movie', 'Action')],
      ['comedy', () => getGenreCatalog('movie', 'Comedy')],
    ]
    for (const [key, request] of requests) request().then(items => { if (active) setRows(current => ({ ...current, [key]: items })) }).catch(cause => { if (active) setRowErrors(current => ({ ...current, [key]: cause instanceof Error ? cause.message : 'Catalog unavailable.' })) }).finally(() => { if (active) setRowLoading(current => ({ ...current, [key]: false })) })
    getGlobalWatchProviders().then(catalog => { if (active) setProviders(catalog.all.slice(0, 24)) }).catch(cause => { if (active) console.warn('[TMDB providers] Could not load provider catalog.', cause) }).finally(() => { if (active) setProviderLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => subscribeWatchProgress(() => setProgress(readWatchProgress())), [])
  const featured = buildHeroCarousel(yourName, trending, 10)
  const currentIndex = featured.length ? activeIndex % featured.length : 0
  const activeItem = featured[currentIndex]
  const activeKey = activeItem ? mediaKey(activeItem) : ''
  const activeKeyRef = useRef(activeKey)
  const activeIndexRef = useRef(currentIndex)
  const featuredLengthRef = useRef(featured.length)
  activeKeyRef.current = activeKey
  activeIndexRef.current = currentIndex
  featuredLengthRef.current = featured.length
  useEffect(() => {
    const node = heroRef.current
    if (!node || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => setHeroVisible(entries[0]?.isIntersecting ?? true), { threshold: 0.18 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])
  useEffect(() => {
    setTrailer(null)
    setTrailerStatus('loading')
    setTrailerAttempt(0)
    setMuted(true)
    if (!activeItem || !heroVisible || !pageVisible) { setTrailerStatus('idle'); return }
    let current = true
    const trailerLookup = Object.prototype.hasOwnProperty.call(activeItem, 'trailerKey')
      ? Promise.resolve(activeItem.trailerKey)
      : getMediaTrailerKey(activeItem)
    trailerLookup.then(key => {
      if (!current) return
      if (key) { setTrailer({ mediaKey: activeKey, key }); setTrailerStatus('ready') }
      else setTrailerStatus('missing')
    }).catch(cause => {
      if (!current) return
      if (import.meta.env.DEV) console.warn('[Hero trailer] Trailer metadata lookup failed.', cause)
      setTrailerStatus('missing')
    })
    return () => { current = false }
  }, [activeItem, activeKey, heroVisible, pageVisible])
  useEffect(() => {
    if (!activeItem || featured.length < 2 || !heroVisible || !pageVisible || (trailerStatus !== 'missing' && trailerStatus !== 'failed')) return
    const expectedKey = activeKey
    const timer = window.setTimeout(() => {
      if (isCurrentHeroEvent(expectedKey, activeKeyRef.current)) setActiveIndex(index => getNextHeroIndex(index, 1, featuredLengthRef.current))
    }, 12000)
    return () => window.clearTimeout(timer)
  }, [activeItem, activeKey, featured.length, heroVisible, pageVisible, trailerStatus])
  const goToFeatured = (direction: number) => {
    const count = featuredLengthRef.current
    if (!count) return
    const nextIndex = getNextHeroIndex(activeIndexRef.current, direction, count)
    activeIndexRef.current = nextIndex
    activeKeyRef.current = featured[nextIndex] ? mediaKey(featured[nextIndex]) : ''
    setActiveIndex(nextIndex)
  }
  const onHeroClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (Date.now() < suppressHeroClickUntil.current) return
    const target = event.target
    if (target instanceof Element && target.closest('button,a,input,select,[role="button"]')) return
    heroPlaybackToggle.current?.()
  }
  const onHeroTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest('.hero-controls,.hero-actions,button,a')) {
      heroTouchStart.current = null
      return
    }
    if (event.touches.length !== 1) { heroTouchStart.current = null; return }
    const touch = event.touches[0]
    heroTouchStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const onHeroTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const start = heroTouchStart.current
    heroTouchStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const direction = getHeroSwipeDirection(start.x, start.y, touch.clientX, touch.clientY)
    if (!direction) return
    suppressHeroClickUntil.current = Date.now() + 700
    goToFeatured(direction)
  }
  if (!activeItem) return <>
    <section ref={heroRef} className="hero hero-empty" aria-label="Featured titles">
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-content"><div className="eyebrow"><Sparkles size={13} /> AAK MOVIES</div><h1>{loading ? 'Loading today’s titles.' : 'Today’s titles are unavailable.'}</h1><p role={error ? 'alert' : 'status'}>{loading ? 'Loading titles…' : error}</p><Link className="button button-quiet" to="/discover">Explore titles <ArrowRight size={15} /></Link></div>
    </section>
    <ProviderCarousel providers={providers} loading={providerLoading} />
    <ContinueWatchingRow progress={progress} />
    <section className="content-section">{loading && <SkeletonRow title="Trending today" />}{error && <div className="empty-state" role="alert"><Info /><h3>We couldn’t load the catalog</h3><p>{error}</p><Link className="button button-outline" to="/discover">Try search</Link></div>}</section>
  </>
  const isMovie = activeItem.media_type === 'movie'
  const titlePath = isMovie ? `/movie/${activeItem.id}` : `/tv/${activeItem.id}`
  const watchPath = isMovie ? `/watch/movie/${activeItem.id}` : titlePath
  const previewKey = trailer?.mediaKey === activeKey ? trailer.key : null
  const onHeroEnded = (endedKey: string) => { if (isCurrentHeroEvent(endedKey, activeKeyRef.current)) goToFeatured(1) }
  const onHeroError = (failedKey: string) => {
    if (isCurrentHeroEvent(failedKey, activeKeyRef.current)) setTrailerStatus('failed')
  }
  const onHeroRetry = (retryKey: string) => {
    if (!isCurrentHeroEvent(retryKey, activeKeyRef.current)) return
    setPlayingMediaKey('')
    setTrailerStatus('ready')
    setTrailerAttempt(attempt => attempt + 1)
  }
  const onHeroPlayingChange = (playingKey: string, isPlaying: boolean) => {
    if (!isCurrentHeroEvent(playingKey, activeKeyRef.current)) return
    setPlayingMediaKey(isPlaying ? playingKey : '')
  }
  const trendingMovies = trending.filter((item): item is Movie => item.media_type === 'movie')
  const trendingShows = trending.filter((item): item is TvShow => item.media_type === 'tv')
  return <><section ref={heroRef} className="hero" data-trailer-playing={playingMediaKey === activeKey && !!activeKey} aria-label="Featured titles. Click or tap the banner to pause or resume its trailer, or swipe to change titles." onClick={onHeroClick} onTouchStart={onHeroTouchStart} onTouchEnd={onHeroTouchEnd} onTouchCancel={() => { heroTouchStart.current = null }}>
    <div className="hero-ambient" style={{ backgroundImage: `url('${activeItem.backdrop}')` }} aria-hidden="true" />
    <div key={activeKey} className="hero-artwork" style={{ backgroundImage: `url('${activeItem.backdrop}')` }} aria-hidden="true" />
    {previewKey && heroVisible && pageVisible && <HeroTrailerPlayer key={`${activeKey}:${previewKey}:${trailerAttempt}`} mediaKey={activeKey} videoKey={previewKey} muted={muted} onEnded={onHeroEnded} onError={onHeroError} onPlayingChange={onHeroPlayingChange} onRetry={onHeroRetry} onRegisterToggle={registerHeroPlaybackToggle} />}
    <div className="hero-scrim" aria-hidden="true" />
    <div className="hero-content"><div className="eyebrow"><Sparkles size={13} /> {isMovie ? 'FEATURED FILM' : 'FEATURED SERIES'}</div><h1 aria-live="polite">{activeItem.title}</h1><div className="hero-meta">{mediaYear(activeItem) && <><span>{mediaYear(activeItem)}</span><i /></>}<span>{mediaTypeLabel(activeItem)}</span><i /><span>{activeItem.genre}</span>{activeItem.vote_average !== undefined && <><i /><span className="rated"><Star size={12} fill="currentColor" /> {activeItem.vote_average.toFixed(1)}</span></>}</div><p>{activeItem.overview || 'Discover the story and details.'}</p><div className="hero-actions"><Link className="button button-primary" to={watchPath}>{isMovie ? <><Play size={17} fill="currentColor" /> Watch now</> : <>Explore series <ArrowRight size={15} /></>}</Link><Link className="button button-quiet" to={titlePath}><Info size={17} /> More details <ArrowRight size={15} /></Link></div><div className="hero-caption"><span className="caption-line" /> AAK MOVIES COLLECTION</div></div>
    <div className="hero-controls"><div className="hero-step-controls"><button className="circle-control" onClick={event => { event.stopPropagation(); goToFeatured(-1) }} aria-label="Previous featured title"><ChevronLeft size={17} /></button><button className="circle-control" onClick={event => { event.stopPropagation(); goToFeatured(1) }} aria-label="Next featured title"><ChevronRight size={17} /></button></div>{previewKey && <button className="hero-mute" onClick={event => { event.stopPropagation(); setMuted(value => !value) }} aria-label={muted ? 'Unmute trailer preview' : 'Mute trailer preview'} title={muted ? 'Unmute preview' : 'Mute preview'}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}<span>{muted ? 'Muted' : 'Sound on'}</span></button>}<div className="hero-index" aria-label={`Featured title ${currentIndex + 1} of ${featured.length}`}><span>{String(currentIndex + 1).padStart(2, '0')}</span><div /><span>{String(featured.length).padStart(2, '0')}</span></div></div>
  </section>
  <ProviderCarousel providers={providers} loading={providerLoading} /><ContinueWatchingRow progress={progress} />
    <section className="content-section"><div className="section-heading"><div><div className="section-kicker">HANDPICKED FOR YOU</div><h2>Stories worth staying in for<span>.</span></h2></div><Link className="text-link" to="/discover">Explore all titles <ArrowRight size={15} /></Link></div><div className="genre-chips">{['All films', 'Drama', 'Sci-Fi', 'Thriller', 'Adventure', 'Documentary'].map((genre, index) => <Link className={index === 0 ? 'genre-chip selected' : 'genre-chip'} to={`/discover?genre=${encodeURIComponent(genre)}`} key={genre}>{genre}</Link>)}</div>
    {error && <p className="catalog-error" role="status">{error}</p>}{loading && <SkeletonRow title="Trending today" />}<MediaRow title="Trending movies today" kicker="TMDB TRENDING · DAY" items={trendingMovies.slice(0, 8)} to="/discover?media=movie&sort=trending" saved={saved} toggleSaved={toggleSaved} />{trendingShows.length > 0 && <MediaRow title="Trending TV series today" kicker="TMDB TRENDING · DAY" items={trendingShows.slice(0, 8)} to="/discover?media=tv&sort=trending" saved={saved} toggleSaved={toggleSaved} />}</section>
   <section className="content-section home-collections">
     {rowLoading.topMovies ? <SkeletonRow title="Top rated movies" /> : rowErrors.topMovies ? <CatalogRowError title="Top rated movies" message={rowErrors.topMovies} /> : <MediaRow title="Top rated movies" kicker="MOVIES · TOP RATED" items={rows.topMovies ?? []} to="/discover?media=movie&sort=top_rated" saved={saved} toggleSaved={toggleSaved} />}
     {rowLoading.popularMovies ? <SkeletonRow title="Popular movies" /> : rowErrors.popularMovies ? <CatalogRowError title="Popular movies" message={rowErrors.popularMovies} /> : <MediaRow title="Popular movies" kicker="MOVIES · POPULAR" items={rows.popularMovies ?? []} to="/discover?media=movie&sort=popular" saved={saved} toggleSaved={toggleSaved} />}
     {rowLoading.topTv ? <SkeletonRow title="Top rated TV series" /> : rowErrors.topTv ? <CatalogRowError title="Top rated TV series" message={rowErrors.topTv} /> : <MediaRow title="Top rated TV series" kicker="SERIES · TOP RATED" items={rows.topTv ?? []} to="/discover?media=tv&sort=top_rated" saved={saved} toggleSaved={toggleSaved} />}
     {rowLoading.popularTv ? <SkeletonRow title="Popular TV series" /> : rowErrors.popularTv ? <CatalogRowError title="Popular TV series" message={rowErrors.popularTv} /> : <MediaRow title="Popular TV series" kicker="SERIES · POPULAR" items={rows.popularTv ?? []} to="/discover?media=tv&sort=popular" saved={saved} toggleSaved={toggleSaved} />}
     {rowLoading.anime ? <SkeletonRow title="Anime" /> : rowErrors.anime ? <CatalogRowError title="Anime" message={rowErrors.anime} /> : <MediaRow title="Anime" kicker="JAPANESE ANIMATION" items={rows.anime ?? []} to="/discover?media=tv&collection=anime&genre=Animation&language=Japanese" saved={saved} toggleSaved={toggleSaved} />}
     {rowLoading.action ? <SkeletonRow title="Action films" /> : rowErrors.action ? <CatalogRowError title="Action films" message={rowErrors.action} /> : <MediaRow title="Action films" kicker="GENRE · ACTION" items={rows.action ?? []} to="/discover?media=movie&genre=Action" saved={saved} toggleSaved={toggleSaved} />}
     {rowLoading.comedy ? <SkeletonRow title="Comedy films" /> : rowErrors.comedy ? <CatalogRowError title="Comedy films" message={rowErrors.comedy} /> : <MediaRow title="Comedy films" kicker="GENRE · COMEDY" items={rows.comedy ?? []} to="/discover?media=movie&genre=Comedy" saved={saved} toggleSaved={toggleSaved} />}
   </section>
   <section className="collection-banner" style={{ backgroundImage: `linear-gradient(90deg, rgba(18,20,24,.92), rgba(18,20,24,.54)),url('${trending[3]?.backdrop ?? trending[0]?.backdrop ?? ''}')` }}><div><div className="section-kicker">THE AAK MOVIES COLLECTION</div><h2>The edge of<br />the unknown.</h2><p>For nights when you want to get lost in another world.</p><Link to="/discover?media=all" className="button button-outline">Explore movies & series <ArrowRight size={15} /></Link></div><div className="collection-orb">A<span>AK</span></div></section>
   <div className="content-section compact-section"><MediaRow title="More movies to discover" kicker="TRENDING MOVIES" items={trendingMovies.slice(3, 8)} to="/discover?media=movie&sort=trending" saved={saved} toggleSaved={toggleSaved} /></div></>
}

function Discover({ saved, toggleSaved }: { saved: Media[]; toggleSaved: (item: Media) => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  type DiscoverCategory = 'all' | 'movie' | 'anime' | 'tv'
  const params = new URLSearchParams(location.search)
  const getCategory = (): DiscoverCategory => params.get('collection') === 'anime' ? 'anime' : (params.get('media') === 'movie' || params.get('media') === 'tv') ? params.get('media') as 'movie' | 'tv' : 'all'
  const [category, setCategory] = useState<DiscoverCategory>(getCategory)
  const [query, setQuery] = useState(params.get('query') ?? '')
  const [selectedGenre, setSelectedGenre] = useState(params.get('genre') ?? 'All films')
  const [year, setYear] = useState(params.get('year') ?? 'Any year')
  const [language, setLanguage] = useState(params.get('language') ?? 'Any language')
  const [sort, setSort] = useState(params.get('sort') ?? 'popular')
  const region = 'BD'
  const [providerId, setProviderId] = useState(params.get('provider') ?? '')
  const [monetization, setMonetization] = useState(params.get('monetization') ?? 'streaming')
  const [providers, setProviders] = useState<WatchProvider[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providerError, setProviderError] = useState('')
  const [results, setResults] = useState<Media[]>(import.meta.env.DEV ? movies : [])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!import.meta.env.DEV)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const animeMode = category === 'anime'
  const mediaFilter = animeMode ? 'tv' : category
  usePageMeta(category === 'anime' ? 'Anime — Discover | AAK Movies' : category === 'tv' ? 'TV Shows — Discover | AAK Movies' : category === 'movie' ? 'Movies — Discover | AAK Movies' : 'Movies & TV — Discover | AAK Movies', 'Search and filter movies, anime, and TV series by title, genre, year, language, and verified streaming provider.')
  useEffect(() => {
    const current = new URLSearchParams(location.search)
    setCategory(current.get('collection') === 'anime' ? 'anime' : current.get('media') === 'movie' || current.get('media') === 'tv' ? current.get('media') as 'movie' | 'tv' : 'all')
    setQuery(current.get('query') ?? '')
    setSelectedGenre(current.get('genre') ?? 'All films')
    setYear(current.get('year') ?? 'Any year')
    setLanguage(current.get('language') ?? 'Any language')
    setSort(current.get('sort') ?? 'popular')
    setProviderId(current.get('provider') ?? '')
    setMonetization(current.get('monetization') ?? 'streaming')
  }, [location.search])
  useEffect(() => {
    let active = true
    setProvidersLoading(true)
    setProviderError('')
    Promise.all([getWatchProviders('movie', region), getWatchProviders('tv', region)]).then(([movieProviders, tvProviders]) => {
      if (active) setProviders(mergeWatchProviders(movieProviders, tvProviders))
    }).catch(cause => {
      if (active) setProviderError(cause instanceof Error ? cause.message : 'Provider list unavailable.')
    }).finally(() => { if (active) setProvidersLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      const selectedType = mediaFilter as 'movie' | 'tv' | 'all'
      const request = providerId
        ? getProviderCatalog({ query, type: selectedType, providerId: Number(providerId), region, monetization: (monetization === 'rent-buy' ? ['rent', 'buy'] : monetization === 'subscription' ? ['flatrate'] : monetization === 'all' ? ['flatrate', 'free', 'ads', 'rent', 'buy'] : ['flatrate', 'free', 'ads']) as WatchMonetization[], anime: animeMode, sort: sort === 'top_rated' || sort === 'newest' ? sort : 'popular' })
        : animeMode ? animeTvCatalog() : query.trim() ? searchCatalog(query, selectedType) : selectedGenre !== 'All films' ? getGenreCatalog(selectedType, selectedGenre) : getCatalogBySort(selectedType, sort === 'top_rated' || sort === 'newest' ? sort : sort === 'popular' ? 'popular' : 'trending')
      request.then(data => { if (active) setResults(data) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Catalog unavailable.') }).finally(() => { if (active) setLoading(false) })
    }, query.trim() ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, mediaFilter, animeMode, providerId, region, monetization, sort, selectedGenre, retryAttempt])
  const filtered = useMemo(() => {
    let list = results.filter(item =>
      (!animeMode || item.media_type === 'tv') &&
      (!animeMode || !query.trim() || item.title.toLowerCase().includes(query.trim().toLowerCase())) &&
      (selectedGenre === 'All films' || (genreApiId(item.media_type, selectedGenre) !== undefined ? item.genre_ids?.includes(genreApiId(item.media_type, selectedGenre)!) : item.genre.toLowerCase() === selectedGenre.toLowerCase())) &&
      (year === 'Any year' || mediaYear(item) === year) &&
      (language === 'Any language' || item.language === language))
    if (sort === 'top_rated') list = [...list].sort((a, b) => (b.vote_average ?? -1) - (a.vote_average ?? -1))
    if (sort === 'newest') list = [...list].sort((a, b) => mediaDate(b)?.localeCompare(mediaDate(a) ?? '') ?? 0)
    return list
  }, [results, selectedGenre, year, language, sort, animeMode, query])
  const updateUrl = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(location.search)
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key)
    navigate('/discover' + (next.size ? '?' + next.toString() : ''), { replace: true })
  }
  const chooseCategory = (value: DiscoverCategory) => {
    setCategory(value)
    setSelectedGenre(value === 'anime' ? 'Animation' : 'All films')
    updateUrl({ media: value === 'anime' ? 'tv' : value, collection: value === 'anime' ? 'anime' : null, genre: value === 'anime' ? 'Animation' : null, language: value === 'anime' ? 'Japanese' : null })
  }
  const clearFilters = () => {
    setQuery('')
    updateUrl({ query: null, genre: null, year: null, language: null, provider: null, monetization: null, sort: null, collection: null })
  }
  const provider = providers.find(item => String(item.provider_id) === providerId)
  const monetizationOptions = [
    { value: 'streaming', label: 'Streaming' }, { value: 'subscription', label: 'Subscription' },
    { value: 'rent-buy', label: 'Rent or buy' }, { value: 'all', label: 'Any availability' },
  ]
  return <div className="page-wrap">
    <div className="page-intro discover-welcome"><div className="section-kicker"><Sparkles size={13} /> YOUR NEXT STORY STARTS HERE</div><h1 className="discover-welcome-name">Ayatullah Al Khomeini</h1><p>Find a new favorite from a world of movies, anime, and television.</p></div>
    <div className="media-switch" role="group" aria-label="Choose content category">{(['all', 'movie', 'anime', 'tv'] as const).map(value => <button key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => chooseCategory(value)}>{value === 'movie' ? 'Movies' : value === 'tv' ? 'TV Shows' : value === 'anime' ? 'Anime' : 'All'}</button>)}</div>
    <div className="discover-tools">
      <label className="search-field"><Search size={18} /><input value={query} onChange={event => { setQuery(event.target.value); updateUrl({ query: event.target.value || null }) }} placeholder={'Search ' + (animeMode ? 'anime' : mediaFilter === 'movie' ? 'movies' : mediaFilter === 'tv' ? 'TV shows' : 'movies and TV shows') + '…'} aria-label={animeMode ? 'Search anime' : mediaFilter === 'movie' ? 'Search movies' : mediaFilter === 'tv' ? 'Search TV shows' : 'Search movies and TV shows'} />{query && <button type="button" onClick={() => { setQuery(''); updateUrl({ query: null }) }} aria-label="Clear search"><X size={16} /></button>}</label>
      <div className="filter-row"><div className="genre-filter">{genres.map(item => <button type="button" key={item} className={selectedGenre === item ? 'filter-chip active' : 'filter-chip'} onClick={() => { setSelectedGenre(item); updateUrl({ genre: item === 'All films' ? null : item }) }}>{item === 'All films' ? 'All genres' : item}</button>)}</div>
        <div className="select-filters">
          <label><ListFilter size={14} /><select value={year} onChange={event => { setYear(event.target.value); updateUrl({ year: event.target.value === 'Any year' ? null : event.target.value }) }} aria-label="Filter by year"><option>Any year</option>{Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)).map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <label><ListFilter size={14} /><select value={language} onChange={event => { setLanguage(event.target.value); updateUrl({ language: event.target.value === 'Any language' ? null : event.target.value }) }} aria-label="Filter by language"><option>Any language</option>{['English', 'Japanese', 'Korean', 'French', 'Spanish', 'Hindi'].map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <label><ArrowDownWideNarrow size={14} /><select value={sort} onChange={event => { setSort(event.target.value); updateUrl({ sort: event.target.value }) }} aria-label="Sort results"><option value="trending">Trending</option><option value="popular">Popular</option><option value="top_rated">Top rated</option><option value="newest">Newest</option></select><ChevronDown size={13} /></label>
        </div>
      </div>
      <div className="provider-filters">
        <label><span>Select Provider</span><select value={providerId} onChange={event => { setProviderId(event.target.value); updateUrl({ provider: event.target.value || null, region }) }} aria-label="Select streaming provider"><option value="">All providers</option>{providers.map(item => <option value={item.provider_id} key={item.provider_id}>{item.provider_name}</option>)}</select></label>
        <label><span>Availability</span><select value={monetization} onChange={event => { setMonetization(event.target.value); updateUrl({ monetization: event.target.value === 'streaming' ? null : event.target.value }) }} aria-label="Filter by provider availability type">{monetizationOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <Link to="/providers" className="subtle-link">Provider directory <ArrowRight size={14} /></Link>
      </div>
      {!providersLoading && !providerError && providers.length === 0 && <p className="provider-filter-note" role="status">TMDB has not listed provider options for the default availability market.</p>}
      {providerError && <p className="provider-filter-note" role="status">Provider choices are unavailable. {providerError}</p>}
      {providerId && <div className="selected-provider-note" role="status">{provider ? 'Showing titles listed for ' + provider.provider_name : providersLoading ? 'Loading selected provider…' : 'The selected provider is not listed in the current availability data.'} · Availability by JustWatch <button type="button" onClick={() => { setProviderId(''); updateUrl({ provider: null }) }} aria-label="Clear provider filter">Clear</button></div>}
    </div>
    <p className="provider-filter-attribution">Provider availability by <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">JustWatch</a> via TMDB.</p>
    <div className="results-head"><span>{loading ? 'Finding titles…' : providerId ? filtered.length + ' matching titles' : filtered.length + (filtered.length === 1 ? ' title to explore' : ' titles to explore')}</span><span>COLLECTED WITH CARE</span></div>
      {error ? <div className="empty-state" role="alert"><Info /><h3>We couldn’t load the catalog</h3><p>{error}</p><button type="button" className="button button-outline" onClick={() => setRetryAttempt(value => value + 1)}>Try again</button></div> : loading ? <SkeletonGrid /> : filtered.length ? <div className="discover-grid">{filtered.map(item => <MediaCard item={item} saved={isSaved(saved, item)} toggleSaved={toggleSaved} key={item.media_type + '-' + item.id} />)}</div> : <div className="empty-state"><Search /><h3>No titles found in this frame.</h3><p>{providerId ? 'No matching titles were found for this provider and availability type.' : 'Try another title or loosen your filters.'}</p><button type="button" className="button button-outline" onClick={clearFilters}>Clear filters</button></div>}
  </div>
}
function MediaRow({ title, kicker, items, to = '/discover?media=all', saved, toggleSaved }: { title: string; kicker: string; items: Media[]; to?: string; saved: Media[]; toggleSaved: (item: Media) => void }) {
  const carousel = useRef<HTMLDivElement>(null)
  const dragHandlers = useHorizontalDrag<HTMLDivElement>()
  if (!items.length) return null
  const scroll = (direction: -1 | 1) => { const node = carousel.current; if (node) node.scrollBy({ left: direction * Math.max(node.clientWidth * 0.8, 260), behavior: 'smooth' }) }
  return <section className="movie-row"><div className="row-heading"><div><div className="section-kicker">{kicker}</div><h3>{title}</h3></div><div className="row-controls"><Link to={to} className="subtle-link">View all <ArrowRight size={14} /></Link><button className="circle-control carousel-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}><ChevronLeft size={15} /></button><button className="circle-control carousel-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}><ChevronRight size={15} /></button></div></div><div className="poster-carousel" ref={carousel} role="region" aria-label={`${title} carousel`} tabIndex={0} {...dragHandlers}>{items.map(item => <MediaCard key={`${item.media_type}-${item.id}`} item={item} saved={isSaved(saved, item)} toggleSaved={toggleSaved} />)}</div></section>
}

function CatalogRowError({ title, message }: { title: string; message: string }) { return <div className="catalog-row-error" role="status"><strong>{title}</strong><span>{message}</span></div> }

function ProviderLogo({ provider, size = 58, alt = provider.provider_name }: { provider: WatchProvider; size?: number; alt?: string }) {
  const [failed, setFailed] = useState(false)
  const src = getProviderLogoUrl(provider.logo_path)
  if (failed || !src) return <span className="provider-logo-fallback" style={{ width: size, height: size }} role="img" aria-label={`${provider.provider_name} logo unavailable`}>{provider.provider_name.slice(0, 1)}</span>
  return <img src={src} alt={alt} loading="lazy" decoding="async" width={size} height={size} onError={() => setFailed(true)} />
}

function ProviderCarousel({ providers, loading }: { providers: WatchProvider[]; loading: boolean }) {
  const carousel = useRef<HTMLDivElement>(null)
  const dragHandlers = useHorizontalDrag<HTMLDivElement>()
  const scroll = (direction: -1 | 1) => { const node = carousel.current; if (node) node.scrollBy({ left: direction * Math.max(node.clientWidth * 0.8, 240), behavior: 'smooth' }) }
  return <section className="provider-section" aria-label="Streaming provider logos"><div className="provider-strip-controls"><Link to="/providers" className="subtle-link">See all providers <ArrowRight size={14} /></Link><span className="provider-strip-arrows"><button className="circle-control carousel-arrow" onClick={() => scroll(-1)} aria-label="Scroll provider logos left"><ChevronLeft size={15} /></button><button className="circle-control carousel-arrow" onClick={() => scroll(1)} aria-label="Scroll provider logos right"><ChevronRight size={15} /></button></span></div>{loading ? <><span className="sr-only" role="status">Loading provider logos.</span><div className="provider-carousel provider-carousel-loading" aria-hidden="true">{Array.from({ length: 8 }).map((_, index) => <span key={index} />)}</div></> : providers.length ? <div className="provider-carousel" ref={carousel} role="region" aria-label="Streaming provider logos" tabIndex={0} {...dragHandlers}>{providers.map(provider => <Link className="provider-tile" key={provider.provider_id} to={`/discover?provider=${provider.provider_id}&region=BD`} aria-label={`Discover titles on ${provider.provider_name}`} title={provider.provider_name}><ProviderLogo provider={provider} size={58} /></Link>)}</div> : <span className="sr-only" role="status">No provider listings are currently returned by TMDB.</span>}</section>
}

function ContinueWatchingRow({ progress }: { progress: WatchProgress[] }) {
  const carousel = useRef<HTMLDivElement>(null)
  const dragHandlers = useHorizontalDrag<HTMLDivElement>()
  const scroll = (direction: -1 | 1) => { const node = carousel.current; if (node) node.scrollBy({ left: direction * Math.max(node.clientWidth * .8, 260), behavior: 'smooth' }) }
  return <section className="continue-watching-section movie-row" id="continue-watching" aria-labelledby="continue-watching-title">
    <div className="row-heading"><div><div className="section-kicker">ON THIS DEVICE</div><h3 id="continue-watching-title">Continue Watching</h3></div>{progress.length > 0 && <div className="row-controls"><button className="circle-control carousel-arrow" onClick={() => scroll(-1)} aria-label="Scroll Continue Watching left"><ChevronLeft size={15} /></button><button className="circle-control carousel-arrow" onClick={() => scroll(1)} aria-label="Scroll Continue Watching right"><ChevronRight size={15} /></button></div>}</div>
    {progress.length ? <div className="continue-carousel poster-carousel" ref={carousel} role="region" aria-label="Continue Watching carousel" tabIndex={0} {...dragHandlers}>{progress.map(item => {
      const episodeText = item.media_type === 'tv' ? `Season ${item.seasonNumber ?? 0} · Episode ${item.episodeNumber ?? 0}${item.episodeTitle ? ` · ${item.episodeTitle}` : ''}` : ''
      const resumePath = item.media_type === 'movie'
        ? `/watch/movie/${item.tmdbId}?player=universal`
        : `/tv/${item.seriesId ?? item.tmdbId}?season=${item.seasonNumber ?? 0}&episode=${item.episodeNumber ?? 1}&player=universal`
      const percent = Math.max(0, Math.min(100, Math.round(item.position / item.duration * 100)))
      return <article className="continue-card movie-card" key={item.key}>
        <Link className="poster-link" to={resumePath} aria-label={`Continue ${item.title}${episodeText ? `, ${episodeText}` : ''} at ${percent} percent`}><div className="poster-wrap"><img src={item.poster} alt={`${item.title} poster`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement?.classList.add('image-fallback') }} /><span className="continue-play"><Play size={17} fill="currentColor" /></span><span className="continue-progress" role="progressbar" aria-label={`${item.title} playback progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></span></div></Link>
        <button type="button" className="continue-remove" onClick={() => removeWatchProgress(item.key)} aria-label={`Remove ${item.title} from Continue Watching`} title="Remove from Continue Watching"><X size={15} /></button>
        <div className="poster-info"><Link to={resumePath} className="poster-title">{item.title}</Link>{episodeText ? <span className="continue-episode" title={episodeText}>{episodeText}</span> : <span>{Math.max(0, Math.ceil((item.duration - item.position) / 60))} min left</span>}</div>
      </article>
    })}</div> : <p className="continue-empty">Progress appears here after you play a compatible native video source.</p>}
  </section>
}
function MediaCard({ item, saved, toggleSaved }: { item: Media; saved: boolean; toggleSaved: (item: Media) => void }) {
  const path = item.media_type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`
  return <article className="movie-card"><Link to={path} className="poster-link" aria-label={`View ${item.title}, ${mediaTypeLabel(item)}`}><div className="poster-wrap"><img src={item.poster} alt={`${item.title} poster`} loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('image-fallback') }} /><span className="poster-play"><Play size={18} fill="currentColor" /></span>{item.vote_average !== undefined && <span className="poster-rating"><Star size={11} fill="currentColor" />{item.vote_average.toFixed(1)}</span>}<span className="media-badge">{item.media_type === 'movie' ? 'FILM' : 'SERIES'}</span></div></Link><button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={() => toggleSaved(item)} aria-label={saved ? `Remove ${item.title} from library` : `Save ${item.title}`}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /></button><div className="poster-info"><Link to={path} className="poster-title">{item.title}</Link><span>{mediaYear(item) || 'Year unavailable'}<i />{item.genre}</span></div></article>
}
function SkeletonGrid() { return <div className="discover-grid" aria-label="Loading titles">{Array.from({ length: 8 }).map((_, i) => <div className="skeleton-card" key={i}><div className="skeleton-poster" /><div className="skeleton-line" /><div className="skeleton-short" /></div>)}</div> }
function SkeletonRow({ title }: { title: string }) { return <section className="movie-row" aria-label={`Loading ${title}`}><div className="row-heading"><h3>{title}</h3></div><div className="skeleton-carousel" role="status">{Array.from({ length: 7 }).map((_, index) => <div className="skeleton-card" key={index}><div className="skeleton-poster" /><div className="skeleton-line" /><div className="skeleton-short" /></div>)}</div></section> }

function MovieDetailsPage({ saved, toggleSaved }: { saved: Media[]; toggleSaved: (item: Media) => void }) {
  const { id } = useParams(); const numericId = Number(id); const fallback = movies.find(item => item.id === numericId); const [movie, setMovie] = useState<MovieDetails | null>(fallback ? { ...fallback, cast: [], recommendations: [] } : null); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  usePageMeta(movie ? `${movie.title} — Movie Details | AAK Movies` : 'Movie details | AAK Movies', movie?.overview || 'Movie details and recommendations on AAK Movies.', 'video.movie')
  useEffect(() => { let active = true; setLoading(true); setError(''); const local = movies.find(item => item.id === numericId); setMovie(local ? { ...local, cast: [], recommendations: [] } : null); if (!Number.isInteger(numericId) || numericId <= 0) { setError('This movie ID is invalid.'); setLoading(false); return } getMovieDetails(numericId).then(data => { if (active) setMovie(data) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Movie details unavailable.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [numericId])
  if (!movie && (loading || error)) return <PageState loading={loading} error={error} />
  if (!movie) return <PageState error="Movie not found." />
  const detailed = movie
  const year = mediaYear(movie)
  return <><section className="detail-hero"><DetailTrailerBackdrop artwork={movie.backdrop} title={movie.title} videoKey={detailed.trailerKey} /><div className="detail-content"><Link to="/discover" className="back-link"><ArrowLeft size={14} /> Back to discover</Link><div className="section-kicker">AAK MOVIES FEATURE · MOVIE</div><h1>{movie.title}</h1><div className="hero-meta">{year && <span>{year}</span>}<i /><span>{movie.runtime ?? 'Runtime unavailable'}</span><i /><span>{movie.genre}</span>{movie.vote_average !== undefined && <><i /><span className="rated"><Star size={13} fill="currentColor" /> {movie.vote_average.toFixed(1)}</span></>}</div><p>{movie.overview || 'No synopsis is available from TMDB.'}</p><div className="hero-actions"><Link className="button button-primary" to={`/watch/movie/${movie.id}`}><Play size={17} fill="currentColor" /> Watch now</Link><button className="button button-quiet" onClick={() => toggleSaved(movie)}>{isSaved(saved, movie) ? <Check size={17} /> : <Bookmark size={17} />}{isSaved(saved, movie) ? 'In your library' : 'Add to library'}</button></div></div><img className="detail-poster" src={movie.poster} alt={`${movie.title} poster`} /></section><div className="detail-body"><div className="detail-facts"><Fact label="RELEASED" value={year || 'Not listed'} /><Fact label="LANGUAGE" value={movie.language || 'Not listed'} /><Fact label="GENRE" value={movie.genre} />{movie.vote_average !== undefined && <Fact label="TMDB RATING" value={`${movie.vote_average.toFixed(1)} / 10`} />}</div>{detailed.cast.length > 0 && <CastList members={detailed.cast} />}<MediaRow title="Recommended movies" kicker="KEEP THE FEELING GOING" items={detailed.recommendations} saved={saved} toggleSaved={toggleSaved} /></div></>
}

function TvDetailsPage({ saved, toggleSaved }: { saved: Media[]; toggleSaved: (item: Media) => void }) {
  const { id } = useParams(); const numericId = Number(id); const location = useLocation(); const navigate = useNavigate(); const [show, setShow] = useState<TvDetails | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [episodes, setEpisodes] = useState<TvEpisode[]>([]); const [seasonLoading, setSeasonLoading] = useState(false); const [seasonError, setSeasonError] = useState(''); const [seasonNo, setSeasonNo] = useState<number | null>(null); const [episodeNo, setEpisodeNo] = useState<number | null>(null); const [player, setPlayer] = useState<'nxsha' | 'universal'>(() => new URLSearchParams(location.search).get('player') === 'universal' ? 'universal' : 'nxsha'); const requestedEpisode = useRef<number | undefined>(undefined)
  usePageMeta(show ? `${show.title} — TV Series | AAK Movies` : 'TV Series Details | AAK Movies', show?.overview || 'TV series details, seasons, and episodes on AAK Movies.', 'video.tv_show')
  useEffect(() => { let active = true; setLoading(true); setError(''); setShow(null); setEpisodes([]); setSeasonNo(null); setEpisodeNo(null); if (!Number.isInteger(numericId) || numericId <= 0) { setError('This series ID is invalid.'); setLoading(false); return } getTvDetails(numericId).then(data => { if (active) setShow(data) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Series details unavailable.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [numericId])
  const availableSeasons = show?.seasons.filter(season => season.season_number >= 0) ?? []
  const selectedSeason = availableSeasons.find(season => season.season_number === seasonNo) ?? availableSeasons[0]
  useEffect(() => {
    if (!show) return
    const params = new URLSearchParams(location.search)
    const requestedSeason = Number(params.get('season'))
    const chosenSeason = availableSeasons.some(season => season.season_number === requestedSeason) ? requestedSeason : availableSeasons[0]?.season_number
    const parsedEpisode = Number(params.get('episode'))
    requestedEpisode.current = Number.isSafeInteger(parsedEpisode) && parsedEpisode > 0 ? parsedEpisode : undefined
    setSeasonNo(chosenSeason ?? null)
    setEpisodeNo(requestedEpisode.current ?? null)
  }, [show, location.search])
  useEffect(() => {
    if (!show || !selectedSeason) { setEpisodes([]); return }
    let active = true
    setSeasonLoading(true); setSeasonError(''); setEpisodes([])
    getTvSeason(show.id, selectedSeason.season_number).then(items => {
      if (!active) return
      setEpisodes(items)
      const requested = requestedEpisode.current
      const chosen = items.find(item => item.episode_number === requested)?.episode_number ?? items[0]?.episode_number ?? null
      setEpisodeNo(chosen)
      if (chosen !== null && chosen !== requested) {
        const params = new URLSearchParams(location.search); params.set('season', String(selectedSeason.season_number)); params.set('episode', String(chosen))
        navigate(`/tv/${show.id}?${params.toString()}`, { replace: true })
      }
    }).catch(cause => { if (active) setSeasonError(cause instanceof Error ? cause.message : 'Could not load this season.') }).finally(() => { if (active) setSeasonLoading(false) })
    return () => { active = false }
  }, [show?.id, selectedSeason?.season_number])
  if (!show && (loading || error)) return <PageState loading={loading} error={error} />
  if (!show) return <PageState error="Series not found." />
  const year = mediaYear(show)
  const episode = episodes.find(item => item.episode_number === episodeNo && item.season_number === selectedSeason?.season_number)
  const episodeIndex = episode ? episodes.findIndex(item => item.id === episode.id) : -1
  const previous = episodeIndex > 0 ? episodes[episodeIndex - 1] : undefined
  const next = episodeIndex >= 0 && episodeIndex < episodes.length - 1 ? episodes[episodeIndex + 1] : undefined
  const selectEpisode = (number: number) => { setEpisodeNo(number); requestedEpisode.current = number; const params = new URLSearchParams(location.search); if (selectedSeason) params.set('season', String(selectedSeason.season_number)); params.set('episode', String(number)); navigate(`/tv/${show.id}?${params.toString()}`) }
  const selectSeason = (number: number) => { setSeasonNo(number); setEpisodeNo(null); requestedEpisode.current = undefined; navigate(`/tv/${show.id}?season=${number}`) }
  const target: PlaybackTarget | null = episode && selectedSeason ? { media_type: 'tv', id: show.id, season_number: selectedSeason.season_number, episode_number: episode.episode_number } : null
  const nxshaUrl = target ? getExternalPlayerUrl(nxshaPlaybackSource, target) : null
  return <><section className="detail-hero"><DetailTrailerBackdrop artwork={show.backdrop} title={show.title} videoKey={show.trailerKey} /><div className="detail-content"><Link to="/discover?media=tv" className="back-link"><ArrowLeft size={14} /> Back to TV shows</Link><div className="section-kicker">AAK MOVIES FEATURE · TV SERIES</div><h1>{show.title}</h1><div className="hero-meta">{year && <span>{year}</span>}<i /><span>{show.number_of_seasons === undefined ? 'Seasons unavailable' : `${show.number_of_seasons} ${show.number_of_seasons === 1 ? 'season' : 'seasons'}`}</span><i /><span>{show.number_of_episodes === undefined ? 'Episodes unavailable' : `${show.number_of_episodes} episodes`}</span>{show.vote_average !== undefined && <><i /><span className="rated"><Star size={13} fill="currentColor" /> {show.vote_average.toFixed(1)}</span></>}</div><p>{show.overview || 'No synopsis is available from TMDB.'}</p><div className="hero-actions"><button className="button button-quiet" onClick={() => toggleSaved(show)}>{isSaved(saved, show) ? <Check size={17} /> : <Bookmark size={17} />}{isSaved(saved, show) ? 'In your library' : 'Add to library'}</button></div></div><img className="detail-poster" src={show.poster} alt={`${show.title} poster`} /></section><div className="detail-body"><div className="detail-facts"><Fact label="FIRST AIRED" value={year || 'Not listed'} /><Fact label="SEASONS" value={show.number_of_seasons?.toString() ?? 'Not listed'} /><Fact label="EPISODES" value={show.number_of_episodes?.toString() ?? 'Not listed'} /><Fact label="GENRE" value={show.genre} /></div>{show.cast.length > 0 && <CastList members={show.cast} />}<section className="season-list inline-episode-guide"><div className="section-kicker">EPISODE GUIDE</div><h3>Choose a season and episode</h3><label className="inline-season-select">Season<select value={selectedSeason?.season_number ?? ''} onChange={event => selectSeason(Number(event.target.value))} aria-label="Choose a season" disabled={!availableSeasons.length}>{availableSeasons.map(season => <option key={season.id} value={season.season_number}>{season.name || `Season ${season.season_number}`}</option>)}</select></label>{seasonError && <p className="form-error" role="alert">{seasonError}</p>}{seasonLoading ? <p className="season-status" role="status">Loading episodes…</p> : episodes.length ? <div className="inline-episode-layout"><div className="episode-list" aria-label="Episodes">{episodes.map(item => <button className={`inline-episode-card ${episode?.id === item.id ? 'selected' : ''}`} key={item.id} type="button" aria-pressed={episode?.id === item.id} onClick={() => selectEpisode(item.episode_number)}><span className="episode-number">{String(item.episode_number).padStart(2, '0')}</span><span className="episode-copy"><strong>{item.name || `Episode ${item.episode_number}`}</strong><small>{item.air_date || 'Air date not listed'}{item.runtime ? ` · ${item.runtime} min` : ''}</small></span><Play size={15} aria-hidden="true" /></button>)}</div><div className="inline-tv-playback">{episode && <div className="selected-episode"><div className="section-kicker">SEASON {episode.season_number} · EPISODE {episode.episode_number}</div><h4>{episode.name || `Episode ${episode.episode_number}`}</h4><p>{episode.overview || 'No episode synopsis is available from TMDB.'}</p></div>}<PlayerChoices selected={player} onChange={setPlayer} />{player === 'nxsha' && nxshaUrl ? <ExternalIframePlayer key={nxshaUrl} title={`AAK Player for ${show.title}, season ${selectedSeason?.season_number}, episode ${episode?.episode_number}`} src={nxshaUrl} /> : player === 'universal' && episode && selectedSeason ? <UniversalPlayerPanel contextLabel={`${show.title} S${selectedSeason.season_number}E${episode.episode_number}`} mediaContext={{ media_type: 'tv', tmdbId: show.id, title: show.title, poster: episode.still_path ? `https://image.tmdb.org/t/p/w500${episode.still_path}` : show.poster, seasonNumber: selectedSeason.season_number, episodeNumber: episode.episode_number, episodeId: episode.id, episodeTitle: episode.name }} /> : <p className="season-status" role="status">Choose an episode to view playback options.</p>}<nav className="episode-neighbors" aria-label="Episode navigation">{previous ? <button className="button button-outline" type="button" onClick={() => selectEpisode(previous.episode_number)}><ArrowLeft size={14} /> Previous · E{previous.episode_number}</button> : <span />}{next ? <button className="button button-outline" type="button" onClick={() => selectEpisode(next.episode_number)}>Next · E{next.episode_number} <ArrowRight size={14} /></button> : <span />}</nav></div></div> : !seasonError && <p className="season-status" role="status">TMDB has not listed episodes for this season.</p>}</section><MediaRow title="Recommended TV series" kicker="MORE SERIES TO DISCOVER" items={show.recommendations} saved={saved} toggleSaved={toggleSaved} /></div></>
}

function TvSeasonPage() {
  const { id, seasonNumber } = useParams()
  const showId = Number(id)
  const seasonNo = Number(seasonNumber)
  const [show, setShow] = useState<TvDetails | null>(null)
  const [episodes, setEpisodes] = useState<TvEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  usePageMeta(show ? `${show.title} — Season ${seasonNo} | AAK Movies` : 'TV Episodes | AAK Movies', 'Browse episode metadata and season information.')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    if (!Number.isSafeInteger(showId) || showId <= 0 || !Number.isSafeInteger(seasonNo) || seasonNo < 0) {
      setError('This TV show or season number is invalid.'); setLoading(false)
      return () => { active = false }
    }
    Promise.all([getTvDetails(showId), getTvSeason(showId, seasonNo)]).then(([series, items]) => { if (active) { setShow(series); setEpisodes(items) } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Season unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [showId, seasonNo, attempt])
  if (loading) return <PageState loading />
  if (error) return <PageState error={error} onRetry={() => setAttempt(value => value + 1)} />
  if (!show) return <PageState error="Series not found." onRetry={() => setAttempt(value => value + 1)} />
  return <div className="page-wrap episode-page"><Link to={`/tv/${show.id}`} className="back-link"><ArrowLeft size={14} /> Back to {show.title}</Link><div className="page-intro"><div className="section-kicker">TV SERIES · EPISODE GUIDE</div><h1>{show.title}<br /><em>Season {seasonNo}</em></h1><p>{episodes.length} episodes listed by TMDB.</p></div><div className="episode-list">{episodes.length ? episodes.map(episode => <article className="episode-card" key={episode.id}><div className="episode-still">{episode.still_path && <img src={`https://image.tmdb.org/t/p/w300${episode.still_path}`} alt={`${episode.name || `Episode ${episode.episode_number}`} still`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} />}</div><div className="episode-number">{String(episode.episode_number).padStart(2, '0')}</div><div className="episode-copy"><h3>{episode.name || `Episode ${episode.episode_number}`}</h3><p>{episode.overview || 'No episode synopsis is available.'}</p><small>{episode.air_date || 'Air date not listed'}{episode.runtime ? ` · ${episode.runtime} min` : ''}</small></div><Link className="button button-outline" to={`/tv/${show.id}?season=${seasonNo}&episode=${episode.episode_number}`} aria-label={`Select ${episode.name || `episode ${episode.episode_number}`} on the series page`}><Play size={14} /> Select episode</Link></article>) : <div className="empty-state"><Info /><h3>No episode information listed.</h3><p>TMDB has not provided episodes for this season.</p></div>}</div></div>
}

function MovieWatchPage() {
  const { id } = useParams()
  const location = useLocation()
  const numericId = Number(id)
  const [movie, setMovie] = useState<Movie | null>(movies.find(item => item.id === numericId) ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [player, setPlayer] = useState<'nxsha' | 'universal'>(() => new URLSearchParams(location.search).get('player') === 'universal' ? 'universal' : 'nxsha')
  const target: PlaybackTarget | null = movie ? { media_type: 'movie', id: movie.id } : null
  const url = target ? getExternalPlayerUrl(nxshaPlaybackSource, target) : null
  usePageMeta(movie ? `Watch ${movie.title} | AAK Movies` : 'Movie player | AAK Movies', 'Movie playback choices on AAK Movies.')
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setPlayer(new URLSearchParams(location.search).get('player') === 'universal' ? 'universal' : 'nxsha')
    if (!Number.isSafeInteger(numericId) || numericId <= 0) { setError('This movie ID is invalid.'); setLoading(false); return () => { active = false } }
    getMovieDetails(numericId).then(data => { if (active) setMovie(data) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Movie unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [numericId, attempt, location.search])
  if (loading) return <PageState loading />
  if (error || !movie || !url) return <PageState error={error || 'A playback source is not configured for this movie.'} onRetry={() => setAttempt(value => value + 1)} />
  return <div className="watch-page"><div className="watch-top"><Link to={`/movie/${movie.id}`} className="back-link"><ArrowLeft size={14} /> Back to {movie.title}</Link><span className="watch-title">MOVIE PLAYER <i /> {movie.title}</span></div><PlayerChoices selected={player} onChange={setPlayer} /><div className="watch-player-content">{player === 'nxsha' ? <ExternalIframePlayer key={url} title={`AAK Player for ${movie.title}`} src={url} /> : <UniversalPlayerPanel contextLabel={movie.title} mediaContext={{ media_type: 'movie', tmdbId: movie.id, title: movie.title, poster: movie.poster }} />}</div><div className="watch-information"><div><div className="section-kicker">MOVIE</div><h1>{movie.title}</h1><p>{mediaYear(movie)} <i /> {movie.runtime ?? 'Runtime unavailable'}</p></div><Link className="button button-quiet" to={`/movie/${movie.id}`}>Movie details <ArrowRight size={15} /></Link></div></div>
}

function PlayerChoices({ selected, onChange }: { selected: 'nxsha' | 'universal'; onChange: (value: 'nxsha' | 'universal') => void }) {
  return <div className="player-choices" role="group" aria-label="Choose a player">
    <button type="button" className={selected === 'nxsha' ? 'selected' : ''} aria-pressed={selected === 'nxsha'} onClick={() => onChange('nxsha')}><MonitorPlay size={17} /><span>AAK Player</span><small>Default player</small></button>
    <button type="button" className={selected === 'universal' ? 'selected' : ''} aria-pressed={selected === 'universal'} onClick={() => onChange('universal')}><Magnet size={17} /><span>Torrent</span><small>Built-in addon sources</small></button>
  </div>
}

function ExternalIframePlayer({ src, title }: { src: string; title: string }) {
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [frameTimedOut, setFrameTimedOut] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => { setFrameLoaded(false); setFrameTimedOut(false) }, [src, attempt])
  useEffect(() => {
    if (frameLoaded) return
    const timer = window.setTimeout(() => {
      setFrameTimedOut(true)
      console.warn('[Nxsha] The iframe did not finish loading before the timeout.', { source: nxshaPlaybackSource.name })
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [src, attempt, frameLoaded])
  return <section className="external-player">
    <div className="player-frame">
      <iframe key={attempt} title={title} src={src} loading="eager" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" onLoad={() => { setFrameLoaded(true); setFrameTimedOut(false) }} onError={() => console.warn('[Nxsha] The browser reported an iframe load error. Cross-origin player state is not available.')} />
      {frameTimedOut && !frameLoaded ? <div className="iframe-error" role="alert">Player could not load. Please try again.</div> : !frameLoaded && <div className="iframe-loading" role="status"><div className="loading-spinner" /><span>Loading player…</span></div>}
    </div>
    <div className="player-note"><span>AAK Player</span><div><button type="button" onClick={() => setAttempt(value => value + 1)}>Reload</button><a href={src} target="_blank" rel="noreferrer">Open player</a></div></div>
  </section>
}

function LegacyEpisodeRedirect() {
  const { id, seasonNumber, episodeNumber } = useParams()
  const showId = Number(id)
  const season = Number(seasonNumber)
  const episode = Number(episodeNumber)
  if (!Number.isSafeInteger(showId) || showId <= 0 || !Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(episode) || episode <= 0) return <Navigate replace to="/discover?media=tv" />
  return <Navigate replace to={`/tv/${showId}?season=${season}&episode=${episode}`} />
}

type ManifestRecord = { url: string; name: string; id: string; resources: string[]; types: string[] }
function readManifestStore(): ManifestRecord[] { try { const value: unknown = JSON.parse(localStorage.getItem('aak-movies-manifests') || '[]'); return Array.isArray(value) ? value.filter(isManifestRecord) : [] } catch { return [] } }
function isManifestRecord(value: unknown): value is ManifestRecord { if (!value || typeof value !== 'object') return false; const v = value as Partial<ManifestRecord>; return typeof v.url === 'string' && typeof v.name === 'string' && typeof v.id === 'string' && Array.isArray(v.resources) && Array.isArray(v.types) }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string') }
function isManifestResource(value: unknown): value is StremioResource {
  if (typeof value === 'string') return value.trim().length > 0
  if (!value || typeof value !== 'object') return false
  const resource = value as Record<string, unknown>
  return typeof resource.name === 'string' && resource.name.trim().length > 0
    && (resource.types === undefined || isStringArray(resource.types))
    && (resource.idPrefixes === undefined || isStringArray(resource.idPrefixes))
}
function ManifestManager() {
  const [url, setUrl] = useState(''); const [items, setItems] = useState<ManifestRecord[]>(readManifestStore); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false)
  usePageMeta('Manifest Registry | AAK Movies', 'Register and inspect user-supplied Stremio-compatible addon manifests. This registry does not resolve streams.')
  const addManifest = async () => {
    setMessage(''); let parsed: URL
    try { parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error() } catch { setMessage('Enter a valid HTTPS manifest URL without embedded credentials.'); return }
    setBusy(true)
    try {
      const response = await fetch(parsed.href); if (!response.ok) throw new Error(`Manifest endpoint returned ${response.status}.`); if (new URL(response.url).protocol !== 'https:') throw new Error('Manifest redirects must remain on HTTPS.')
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object') throw new Error('Response is not a manifest object.')
      const manifest = data as Record<string, unknown>
      if (typeof manifest.name !== 'string' || !manifest.name.trim() || typeof manifest.id !== 'string' || !manifest.id.trim() || !Array.isArray(manifest.resources) || !manifest.resources.every(isManifestResource) || !isStringArray(manifest.types)) throw new Error('Manifest must declare a name, id, resources, and string types. Resource types and ID prefixes must also be string arrays when supplied.')
      const item: ManifestRecord = { url: parsed.href, name: manifest.name, id: manifest.id, resources: (manifest.resources as StremioResource[]).map(describeManifestResource), types: manifest.types }
      const next = [...items.filter(record => record.url !== item.url), item]; setItems(next); localStorage.setItem('aak-movies-manifests', JSON.stringify(next)); setUrl(''); setMessage(`Registered “${item.name}”. This registry does not resolve streams.`)
    } catch (e) { setMessage(`${e instanceof Error ? e.message : 'Could not read this manifest.'} Browser CORS may block direct requests.`) } finally { setBusy(false) }
  }
  const remove = (target: string) => { const next = items.filter(item => item.url !== target); setItems(next); localStorage.setItem('aak-movies-manifests', JSON.stringify(next)) }
  return <div className="page-wrap sources-page"><div className="page-intro"><div className="section-kicker">PLAYBACK INTEGRATIONS</div><h1>Your <em>sources.</em></h1><p>Register HTTPS Stremio-compatible manifest URLs. This stores declared addon metadata only; it does not resolve streams or torrents.</p></div><div className="profile-panel source-manager"><div className="manifest-list builtin-registry"><h3>Built-in manifest declarations</h3><p>Loaded from the two manifest JSON files you supplied. Shared service details are listed where declared; user-specific configuration URLs and credentials are not stored.</p>{builtInManifests.map(manifest => <article className="manifest-item builtin-registry-item" key={manifest.id}><div><strong>{manifest.name} <small>v{manifest.version}</small></strong><small>{manifest.id}</small><small>Types: {manifest.types.join(', ')}</small><small>Resources: {manifest.resources.map(resource => `${resource.name}${resource.types ? ` (${resource.types.join(', ')})` : ''}${resource.idPrefixes ? ` [IDs: ${resource.idPrefixes.join(', ')}]` : ''}`).join(', ')}</small><small>ID prefixes: {manifest.idPrefixes.join(', ') || 'Not declared'} · Catalogs: {manifest.catalogs}</small><small>Configurable: {manifest.configurable ? 'yes' : 'no'} · Configuration required: {manifest.configurationRequired === undefined ? 'not stated' : manifest.configurationRequired ? 'yes' : 'no'}</small><small>{manifest.lookupMessage}</small>{manifest.serviceUrl && <code>{manifest.serviceUrl}</code>}<a className="subtle-link" href={manifest.setupUrl} target="_blank" rel="noreferrer">Provider setup <ExternalLink size={13} /></a></div></article>)}</div><label htmlFor="manifestUrl">Stremio manifest URL</label><div className="manifest-add-row"><input id="manifestUrl" className="admin-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://addon.example/manifest.json" type="url" /><button className="button button-primary" onClick={addManifest} disabled={busy}>{busy ? 'Checking…' : 'Add manifest'}</button></div>{message && <p role="status" className="manifest-message">{message}</p>}<div className="manifest-list"><h3>Registered manifests ({items.length})</h3>{items.length === 0 && <p>No manifests added yet. Add an HTTPS manifest URL to inspect its declared resources and types.</p>}{items.map(item => <article className="manifest-item" key={item.url}><div><strong>{item.name}</strong><small>{item.id}</small><small>Types: {item.types.join(', ') || 'Not declared'} · Resources: {item.resources.join(', ') || 'Not declared'}</small><code>{item.url}</code></div><button className="button button-outline" onClick={() => remove(item.url)} aria-label={`Remove manifest ${item.name}`}>Remove</button></article>)}</div><p className="player-disclaimer">Manifest URLs are saved in this browser only. CORS may block inspection. Only add manifests you are authorized to access. A manifest is not a playable video URL; no stream resolution is implemented.</p></div></div>
}

function LibraryPage({ saved, toggleSaved }: { saved: Media[]; toggleSaved: (item: Media) => void }) { usePageMeta('My Library | AAK Movies', 'Your locally saved AAK Movies watchlist.'); return <div className="page-wrap library-page"><div className="page-intro"><div className="section-kicker">YOUR PERSONAL COLLECTION</div><h1>My <em>library.</em></h1><p>Keep movies and series you love close.</p></div><div className="library-persistence"><LockKeyhole size={14} /><span>Your saved titles last for this visit. Sign-in sync is not configured.</span></div>{saved.length ? <div className="discover-grid">{saved.map(item => <MediaCard item={item} saved toggleSaved={toggleSaved} key={mediaKey(item)} />)}</div> : <div className="empty-state library-empty"><div className="library-empty-icon"><Bookmark /></div><div className="section-kicker">A LITTLE ROOM FOR LATER</div><h3>Your watchlist is waiting.</h3><p>Save movies and series as you discover them and they’ll find a place here.</p><Link to="/discover" className="button button-primary">Explore titles <ArrowRight size={15} /></Link></div>}</div> }

function LiveTvPage() {
  const channels = useMemo(() => getConfiguredLiveChannels(), [])
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [playbackError, setPlaybackError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const player = useRef<HTMLVideoElement>(null)
  usePageMeta('Live TV | AAK Movies', 'Browse authorized live television channels on AAK Movies.')
  const categories = useMemo(() => ['All', ...new Set(channels.map(channel => channel.category))], [channels])
  const matchingChannels = useMemo(() => channels.filter(channel => (category === 'All' || channel.category === category) && `${channel.name} ${channel.category}`.toLowerCase().includes(query.trim().toLowerCase())), [channels, category, query])
  const activeChannel = channels.find(channel => channel.id === selectedId) ?? matchingChannels[0] ?? channels[0]
  const hlsSupported = activeChannel?.format !== 'hls' || Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'))
  useEffect(() => { setPlaybackError(''); setIsPlaying(false) }, [activeChannel?.id])
  const retryPlayback = () => { setPlaybackError(''); setIsPlaying(false); player.current?.load() }
  const mediaType = activeChannel?.format === 'hls' ? 'application/vnd.apple.mpegurl' : activeChannel?.format === 'mp4' ? 'video/mp4' : activeChannel?.format === 'webm' ? 'video/webm' : 'video/ogg'
  return <div className="page-wrap live-tv-page">
    <div className="page-intro live-tv-intro"><div className="section-kicker"><Radio size={14} /> AAK MOVIES · LIVE</div><h1>Live TV, <em>curated.</em></h1><p>A simple home for authorized channels, with a clear picture of what is available.</p></div>
    <section className="live-feature" aria-labelledby="live-feature-title">
      <div className="live-player-panel">
        <div className="live-player-stage">
          {activeChannel && hlsSupported && <video ref={player} key={activeChannel.id} controls playsInline preload="none" aria-label={`${activeChannel.name} live channel`} onPlaying={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onError={() => { setIsPlaying(false); setPlaybackError('This channel could not play. Please try again later.') }}><source src={activeChannel.playbackUrl} type={mediaType} /></video>}
          {activeChannel && !hlsSupported && <div className="live-player-state" role="status"><Tv size={25} /><strong>This browser cannot play this HLS channel.</strong><span>Try a browser with native HLS support.</span></div>}
          {!activeChannel && <div className="live-player-state live-player-setup" role="status"><div className="live-state-icon"><Radio size={25} /></div><span className="section-kicker">CHANNEL SETUP</span><strong>Your live lineup is waiting.</strong><span>No authorized channels are configured yet.</span></div>}
          {playbackError && <div className="live-player-error" role="alert"><p>{playbackError}</p><button type="button" className="button button-outline" onClick={retryPlayback}>Try again</button></div>}
          {activeChannel && isPlaying && <span className="live-on-air" role="status"><i /> LIVE</span>}
        </div>
        <div className="live-player-caption"><div><span className="section-kicker">{activeChannel ? activeChannel.category.toUpperCase() : 'FEATURED CHANNEL'}</span><h2 id="live-feature-title">{activeChannel?.name ?? 'A place for live television'}</h2><p>{activeChannel?.description ?? 'Authorized channel streams will appear here when they are configured and tested.'}</p></div>{activeChannel && <Tv size={21} aria-hidden="true" />}</div>
      </div>
      <aside className="live-lineup-card"><div className="section-kicker">ON THIS PAGE</div><h2>{channels.length ? `${channels.length} channel${channels.length === 1 ? '' : 's'}` : 'Your channel guide'}</h2><p>{channels.length ? 'Choose a channel to tune in.' : 'Live TV is not active until an authorized source is configured.'}</p><div className="live-lineup-divider" /><div className="live-lineup-note"><ShieldCheck size={17} /><span>Only use channel streams that you are authorized to show.</span></div><p className="live-setup-hint">Add reviewed channel entries in <code>src/liveTv.ts</code>. URLs must be HTTPS direct media files; HLS requires native browser support.</p></aside>
    </section>
    <section className="live-browse" aria-labelledby="live-browse-title">
      <div className="live-browse-heading"><div><div className="section-kicker">THE CHANNEL GUIDE</div><h2 id="live-browse-title">Browse channels</h2></div>{channels.length > 0 && <label className="search-field live-channel-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search channels" aria-label="Search live TV channels" /></label>}</div>
      {channels.length > 0 && <div className="live-category-filters" role="group" aria-label="Filter channels by category">{categories.map(item => <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} type="button" onClick={() => setCategory(item)}>{item}</button>)}</div>}
      {matchingChannels.length ? <div className="live-channel-grid">{matchingChannels.map(channel => <button key={channel.id} type="button" className={`live-channel-card ${activeChannel?.id === channel.id ? 'selected' : ''}`} aria-pressed={activeChannel?.id === channel.id} onClick={() => { setSelectedId(channel.id); setPlaybackError('') }}><span className="live-channel-logo">{channel.logoUrl && isSafeLiveTvLogo(channel.logoUrl) ? <img src={channel.logoUrl} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true }} /> : <Tv size={20} aria-hidden="true" />}</span><span className="live-channel-copy"><strong>{channel.name}</strong><small>{channel.category} · {channel.format.toUpperCase()}</small></span><Play size={15} aria-hidden="true" /></button>)}</div> : channels.length ? <div className="empty-state live-empty"><Search /><h3>No channels found.</h3><p>Try a different name or category.</p><button type="button" className="button button-outline" onClick={() => { setQuery(''); setCategory('All') }}>Clear filters</button></div> : <div className="empty-state live-empty"><Radio /><h3>No channels configured yet.</h3><p>After confirming retransmission rights, add an HTTPS channel entry to the Live TV registry. The guide will show its real name, category, and playback status here.</p></div>}
      {!channels.length && <p className="live-setup-footnote">No channel logos, schedules, or sample streams are included. Each configured URL should be tested in the target browsers before the channel is marked available.</p>}
    </section>
  </div>
}

function AboutPage() {
  const description = 'AAK Movies is a movie and television discovery interface for searching titles, exploring categories, and reviewing available streaming-provider information.'
  usePageMeta('About & Credits | AAK Movies', description)
  return <div className="info-page about-page"><div className="info-symbol"><Clapperboard /></div><div className="section-kicker">ABOUT AAK MOVIES</div><h1>Discover what to watch.</h1><p>{description} Movie and series details come from TMDB, and provider availability is reported by JustWatch through TMDB. Playback depends on the configured provider and supported source. Continue Watching stores local progress from compatible native video sources.</p><section className="tmdb-credit" aria-labelledby="tmdb-credit-title"><a className="tmdb-logo-link" href="https://www.themoviedb.org" target="_blank" rel="noreferrer" aria-label="The Movie Database (TMDB), opens in a new tab"><img src="/images/tmdb-logo.svg" alt="The Movie Database (TMDB)" /></a><div><div className="section-kicker">DATA & IMAGE CREDITS</div><h2 id="tmdb-credit-title">TMDB</h2><p>Film and television metadata and images are provided by The Movie Database (TMDB).</p><p className="tmdb-required-notice">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="subtle-link">Visit TMDB <ExternalLink size={13} /></a></div></section><Link to="/discover" className="button button-outline">Explore movies & series <ArrowRight size={15} /></Link></div>
}

function Profile({ accent, lastCustomAccent, setAccent }: { accent: AccentValue; lastCustomAccent: string | null; setAccent: (value: AccentValue) => void }) {
  usePageMeta('Profile & Preferences | AAK Movies', 'Personalize the AAK Movies interface and view account preferences.')
  return <div className="page-wrap profile-page"><div className="page-intro"><div className="section-kicker">YOUR AAK MOVIES</div><h1>Make it <em>yours.</em></h1><p>Choose how AAK Movies looks and open your saved titles.</p></div><div className="profile-panel"><div className="profile-heading"><div className="profile-avatar"><UserRound size={21} /></div><div><h2>Preferences and app options</h2><p>Sign-in and cross-device sync are not connected.</p></div></div><div className="panel-divider" /><AccentSettings accent={accent} lastCustomAccent={lastCustomAccent} setAccent={setAccent} /><div className="panel-divider" /><div className="settings-list"><div><div className="setting-icon"><Heart size={17} /></div><div><strong>Continue Watching</strong><p>Progress from compatible native video sources is saved in this browser.</p><Link to="/#continue-watching" className="subtle-link">View progress <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><Settings size={17} /></div><div><strong>Discovery preferences</strong><p>Choose movies, series, genres, and the available provider filter.</p><Link to="/discover" className="subtle-link">Open Discover <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><ShieldCheck size={17} /></div><div><strong>Privacy and data</strong><p>Read about local browser storage and metadata sources.</p><Link to="/privacy" className="subtle-link">Read privacy policy <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><Download size={17} /></div><div><strong>Install AAK Movies</strong><p>Add the site to a supported device from the browser.</p><Link to="/install" className="subtle-link">Install options <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><Info size={17} /></div><div><strong>About AAK Movies</strong><p>How discovery, availability, and playback are presented.</p><Link to="/about" className="subtle-link">About and credits <ArrowRight size={13} /></Link></div></div></div></div></div>
}

function AccentSettings({ accent, lastCustomAccent, setAccent, compact = false }: { accent: AccentValue; lastCustomAccent: string | null; setAccent: (value: AccentValue) => void; compact?: boolean }) {
  const currentColor = isHexAccent(accent) ? accent : accentPresets.find(item => item.id === accent)?.color ?? '#2563eb'
  const choices = getAccentChoices(lastCustomAccent)
  const isSelected = (value: AccentValue) => isHexAccent(value) ? currentColor.toLowerCase() === value.toLowerCase() : accent === value
  return <section className={`accent-settings ${compact ? 'accent-settings-compact' : ''}`} aria-labelledby={compact ? 'popup-accent-title' : 'accent-settings-title'}>
    <div><div className="section-kicker">APPEARANCE</div><h3 id={compact ? 'popup-accent-title' : 'accent-settings-title'}>Accent color</h3><p>Choose a color for interface highlights. Posters and provider artwork keep their original colors.</p></div>
    <div className="accent-palette" role="group" aria-label="Accent colors">{choices.map(choice => { const selected = isSelected(choice.value); return <button type="button" className={`accent-choice ${selected ? 'selected' : ''}`} key={choice.value} aria-label={`${choice.label} accent${selected ? ', selected' : ''}`} aria-pressed={selected} onClick={() => setAccent(choice.value)}><span style={{ backgroundColor: choice.color }} aria-hidden="true" />{choice.label}{selected && <Check size={14} aria-hidden="true" />}</button> })}</div>
    <label className="accent-custom-picker"><span>Custom color</span><span className="accent-custom-preview"><i style={{ backgroundColor: currentColor }} aria-hidden="true" /><code>{currentColor.toUpperCase()}</code></span><input type="color" value={currentColor} onChange={event => setAccent(event.target.value as `#${string}`)} aria-label="Choose a custom accent color" /></label>
    <div className="accent-current-row"><p className="accent-current" role="status">Current accent: {accentLabel(accent)} · {currentColor.toUpperCase()}</p>{accent !== 'blue' && <button type="button" className="accent-reset" onClick={() => setAccent('blue')}>Reset to Blue</button>}</div>
  </section>
}

function ProfilePopup({ accent, lastCustomAccent, setAccent, theme, setTheme, onClose }: { accent: AccentValue; lastCustomAccent: string | null; setAccent: (value: AccentValue) => void; theme: 'light' | 'night'; setTheme: (theme: 'light' | 'night') => void; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const node = dialog.current
    const focusable = () => [...(node?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])]
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [])
  return createPortal(<div className="profile-popup-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="profile-popup" role="dialog" aria-modal="true" aria-labelledby="profile-popup-title" ref={dialog} tabIndex={-1}>
      <div className="profile-popup-head"><div><div className="section-kicker">AAK MOVIES</div><h2 id="profile-popup-title">Preferences</h2></div><button className="profile-popup-close" type="button" onClick={onClose} aria-label="Close preferences"><X size={19} /></button></div>
      <div className="profile-popup-group"><div className="profile-popup-group-label">YOUR LIBRARY</div><Link to="/#continue-watching" onClick={onClose}><Play size={16} /><span>Continue Watching</span><ArrowRight size={14} /></Link><Link to="/library" onClick={onClose}><Bookmark size={16} /><span>My List</span><ArrowRight size={14} /></Link></div>
      <div className="profile-popup-group"><div className="profile-popup-group-label">PREFERENCES</div><button type="button" onClick={() => setTheme(theme === 'light' ? 'night' : 'light')}><Sun size={16} /><span>{theme === 'light' ? 'Switch to AMOLED night mode' : 'Switch to light theme'}</span>{theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}</button><AccentSettings accent={accent} lastCustomAccent={lastCustomAccent} setAccent={setAccent} compact /></div>
      <div className="profile-popup-group"><div className="profile-popup-group-label">APP</div><Link to="/install" onClick={onClose}><Download size={16} /><span>Download / Install</span><ArrowRight size={14} /></Link><Link to="/about" onClick={onClose}><Info size={16} /><span>About AAK Movies</span><ArrowRight size={14} /></Link></div>
      <p className="profile-popup-footnote">Progress and preferences are stored on this device. There is no account sync.</p>
    </section>
  </div>, document.body)
}

function ProviderDirectory() {
  const availabilityRegion = 'BD'
  const [category, setCategory] = useState<'all' | MediaType>('all')
  const [movies, setMovies] = useState<WatchProvider[]>([])
  const [tv, setTv] = useState<WatchProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  usePageMeta('Streaming Providers | AAK Movies', 'Browse the worldwide movie and TV streaming provider directory returned by TMDB. Availability varies by title and country.')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    getGlobalWatchProviders().then(catalog => {
      if (active) { setMovies(catalog.movies); setTv(catalog.tv) }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Provider list unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const list = category === 'movie' ? movies : category === 'tv' ? tv : mergeWatchProviders(movies, tv)
  return <div className="page-wrap provider-directory"><div className="page-intro"><div className="section-kicker"><Tv size={14} /> TMDB PROVIDER DIRECTORY</div><h1>Find your <em>service.</em></h1><p>Showing providers returned by TMDB worldwide, without a country filter. Availability varies by title and country.</p></div><div className="provider-directory-controls"><div className="media-switch" role="group" aria-label="Filter providers by content type">{(['all', 'movie', 'tv'] as const).map(value => <button type="button" key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => setCategory(value)}>{value === 'all' ? 'All' : value === 'movie' ? 'Movies' : 'TV Shows'}</button>)}</div></div>{loading ? <SkeletonGrid /> : error ? <div className="empty-state" role="alert"><Info /><h3>Provider directory unavailable</h3><p>{error}</p></div> : list.length ? <div className="provider-directory-grid">{list.map(item => <Link className="provider-directory-card" key={item.provider_id} to={'/discover?provider=' + item.provider_id + '&region=' + availabilityRegion}><ProviderLogo provider={item} size={54} alt="" /><span>{item.provider_name}</span><small>Discover available titles <ArrowRight size={13} /></small></Link>)}</div> : <div className="empty-state"><Info /><h3>No providers listed</h3><p>TMDB has no providers listed for this content type in its supported provider dataset.</p></div>}<p className="provider-attribution">Availability data by <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">JustWatch</a> via TMDB. Provider listings are shown for discovery only.</p></div>
}

function InstallPage({ installPrompt, installApp, isInstalled }: { installPrompt: DeferredInstallPrompt | null; installApp: () => Promise<void>; isInstalled: boolean }) {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(ua)
  const desktop = !ios && !android
  usePageMeta('Install AAK Movies | AAK Movies', 'Install AAK Movies as a progressive web app on supported phones, tablets, and desktop browsers.')
  return <div className="page-wrap install-page"><div className="page-intro"><div className="section-kicker"><Download size={14} /> AAK MOVIES FOR YOUR DEVICES</div><h1>Your cinema, <em>within reach.</em></h1><p>Add AAK Movies to your home screen or desktop. Installation is provided by your browser as a progressive web app.</p></div><section className="install-status-card" aria-live="polite"><div className="install-icon"><Smartphone size={23} /></div><div><strong>{isInstalled ? 'AAK Movies is installed' : 'Install AAK Movies'}</strong><p>{isInstalled ? 'This browser reports that AAK Movies is running in standalone mode.' : 'Your browser may offer a native install action on supported devices.'}</p></div>{installPrompt && !isInstalled && <button type="button" className="button button-primary" onClick={() => void installApp()}>Install app</button>}</section><div className="install-cards"><article className="install-card"><div className="section-kicker">ANDROID</div><h2>Install on Android</h2><p>{android && installPrompt ? 'Use the browser install prompt above to add the app.' : 'In Chrome or another supported browser, open the browser menu and choose “Install app” or “Add to Home screen”.'}</p></article><article className="install-card"><div className="section-kicker">IPHONE & IPAD</div><h2>Add to Home Screen</h2><p>{ios ? 'In Safari, tap Share, then choose “Add to Home Screen”. Confirm the app name to finish.' : 'Open AAK Movies in Safari, tap Share, then choose “Add to Home Screen”. iOS uses this manual Safari flow.'}</p></article><article className="install-card"><div className="section-kicker">DESKTOP</div><h2>Install in your browser</h2><p>{desktop && installPrompt ? 'Use the install action at the top of this page.' : 'In a supported desktop browser, use its install icon in the address bar or choose “Install AAK Movies” from the browser menu.'}</p></article></div><section className="install-note"><h2>Progressive web app</h2><p>The app shell and static interface can be cached for faster repeat visits. TMDB metadata and external playback require an internet connection. This project does not include or provide an Android APK.</p></section></div>
}
function Admin() { usePageMeta('Admin Dashboard | AAK Movies', 'Administration shell for AAK Movies. Protected server-side admin access is not configured.'); return <div className="page-wrap admin-page"><div className="page-intro"><div className="section-kicker"><ShieldCheck size={13} /> ADMINISTRATION</div><h1>Curate with <em>care.</em></h1><p>Manage permitted metadata and provider references.</p></div><div className="admin-alert"><LockKeyhole size={18} /><div><strong>Admin access is not configured.</strong><p>This is a dashboard shell. Add server-verified roles before enabling writes.</p></div></div><div className="admin-table"><div className="table-heading"><div><div className="section-kicker">CONTENT MANAGEMENT</div><h3>Playback source registry</h3></div><Link to="/sources" className="button button-outline">Open manifest registry</Link></div><p className="admin-footnote">AAK Player uses a configured external player mapping. Provider permission and playback have not been independently verified.</p></div></div> }

function DetailTrailerBackdrop({ artwork, title, videoKey }: { artwork: string; title: string; videoKey?: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(true)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  const [motionAllowed, setMotionAllowed] = useState(true)
  const [active, setActive] = useState(false)
  const [muted, setMuted] = useState(true)
  const [frameFailed, setFrameFailed] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setMotionAllowed(!motion.matches)
    const updatePage = () => setPageVisible(!document.hidden)
    updateMotion(); motion.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updatePage)
    const node = root.current
    const observer = node && 'IntersectionObserver' in window ? new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? true), { threshold: 0.15 }) : null
    if (node && observer) observer.observe(node)
    return () => { motion.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', updatePage); observer?.disconnect() }
  }, [])
  useEffect(() => {
    setActive(false); setMuted(true); setFrameFailed(false); setFrameReady(false)
    if (!videoKey || !motionAllowed || !inView || !pageVisible) return
    const timer = window.setTimeout(() => setActive(true), 2000)
    return () => window.clearTimeout(timer)
  }, [videoKey, motionAllowed, inView, pageVisible])
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: next ? 'mute' : 'unMute', args: [] }), 'https://www.youtube-nocookie.com')
  }
  return <div ref={root} className={`detail-trailer-backdrop ${active && !frameFailed ? 'is-playing' : ''} ${frameReady ? 'is-ready' : ''}`} aria-hidden="false">
    <div className="detail-backdrop-art" style={{ backgroundImage: `url('${artwork}')` }} aria-hidden="true" />
    {active && videoKey && !frameFailed && <iframe ref={frame} title={`${title} trailer background`} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoKey)}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&loop=1&playlist=${encodeURIComponent(videoKey)}&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture" tabIndex={-1} onLoad={() => setFrameReady(true)} onError={() => setFrameFailed(true)} />}
    <div className="detail-backdrop-scrim" aria-hidden="true" />
    {videoKey && motionAllowed && <button className="detail-trailer-mute" type="button" aria-label={muted ? 'Unmute trailer background' : 'Mute trailer background'} onClick={toggleMute}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}<span>{muted ? 'Muted' : 'Sound on'}</span></button>}
  </div>
}
function CastList({ members }: { members: CastMember[] }) { return <section className="cast-section"><div className="section-kicker">THE PEOPLE IN THE STORY</div><h3>Cast</h3><div className="cast-list">{members.map(member => <article className="cast-person" key={member.id}><div className="cast-photo">{member.profilePath ? <img src={`https://image.tmdb.org/t/p/w185${member.profilePath}`} alt={`${member.name}`} width="92" height="138" loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.classList.add('no-cast-photo') }} /> : <span aria-hidden="true">{member.name.slice(0, 1)}</span>}</div><strong>{member.name}</strong>{member.character && <small>{member.character}</small>}</article>)}</div></section> }
function Fact({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function PageState({ loading = false, error, onRetry }: { loading?: boolean; error?: string; onRetry?: () => void }) { return <div className="page-wrap"><div className="empty-state" role={error ? 'alert' : 'status'}>{loading ? <div className="loading-spinner" aria-label="Loading" /> : <Info />}<h3>{loading ? 'Loading title details…' : 'We couldn’t load this title.'}</h3>{error && <p>{error}</p>}{onRetry && <button className="button button-primary" onClick={onRetry}>Try again</button>}<Link className="button button-outline" to="/discover">Back to discover</Link></div></div> }
function InfoPage({ title, kicker, text }: { title: string; kicker: string; text: string }) { usePageMeta(`${kicker} | AAK Movies`, text); return <div className="info-page"><div className="info-symbol"><Clapperboard /></div><div className="section-kicker">{kicker}</div><h1>{title}</h1><p>{text}</p><Link to="/discover" className="button button-outline">Explore movies & series <ArrowRight size={15} /></Link></div> }
function Policy({ title, kicker, text }: { title: string; kicker: string; text: string }) { usePageMeta(`${title} | AAK Movies`, text); return <div className="page-wrap policy-page"><Link to="/" className="back-link"><ArrowLeft size={14} /> Back home</Link><div className="section-kicker">{kicker}</div><h1>{title}</h1><div className="policy-copy"><p>{text}</p><h3>Questions?</h3><p>Use the published AAK Movies contact address for questions about this policy.</p></div></div> }
function Footer() { return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><Link className="brand" to="/"><span className="brand-logo-plate"><img src="/images/aak-movies-logo.png" alt="" /></span><span>AAK Movies</span></Link><p>Movie and television discovery.</p></div><div className="footer-column"><span>EXPLORE</span><Link to="/discover">Discover</Link><Link to="/providers">Providers</Link><Link to="/install">Install app</Link><Link to="/live-tv">Live TV</Link><Link to="/library">My library</Link><Link to="/about">About</Link></div><div className="footer-column"><span>INFORMATION</span><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/copyright">Copyright & removal</Link><Link to="/sources">Manifest registry</Link></div></div><div className="footer-bottom"><span>© 2026 AAK Movies. All rights reserved.</span><span><Link to="/about">About &amp; credits</Link><span aria-hidden="true"> · </span><Link to="/admin">Admin</Link></span></div></footer> }

export default App
