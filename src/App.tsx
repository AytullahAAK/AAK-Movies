import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ArrowDownWideNarrow, ArrowLeft, ArrowRight, ArrowUp, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Compass, Download, ExternalLink, Film, Heart, House, Info, Library, ListFilter, LockKeyhole, Magnet, Mic, MicOff, MonitorPlay, Moon, Play, Radio, Search, Settings, ShieldCheck, Smartphone, Sparkles, Star, Sun, Tv, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { animeTvCatalog, dedupeMediaByIdentity, getDiscoverCatalogPage, genres, genreApiId, getGenreCatalog, getGlobalWatchProviders, getHomeCatalog, getMediaTrailerKey, getMovieDetails, getProviderLogoUrl, getTvDetails, getTvSeason, mediaDate, mediaTypeLabel, mediaYear, mergeWatchProviders, movies, prioritizeHomepageProviders, trendingAllDay, type CastMember, type DiscoverCatalogFilters, type Media, type Movie, type MovieDetails, type TvDetails, type TvEpisode, type TvShow, type WatchMonetization, type WatchProvider } from './data'
import { getExternalPlayerUrl, nxshaPlaybackSource, type PlaybackTarget } from './playback/sources'
import { UniversalPlayerPanel } from './playback/UniversalPlayerPanel'
import { FullscreenButton } from './playback/FullscreenButton'
import { builtInManifests, describeManifestResource, type StremioResource } from './playback/builtInManifests'
import { readWatchProgress, removeWatchProgress, subscribeWatchProgress, type WatchProgress } from './playback/watchProgress'
import { accentLabel, accentPreferenceKey, defaultAccent, getAccentColors, isAccentValue, isHexAccent, lastCustomAccentPreferenceKey, readPreference, storeCustomAccent, writePreference, type AccentValue } from './theme'
import { useHorizontalDrag } from './useHorizontalDrag'
import { checkLiveTvHealth, isSafeLiveTvLogo, isSportsLiveChannel, loadLiveTvCatalog, type LiveTvChannel } from './liveTv'
import { LiveTvPlayer } from './playback/LiveTvPlayer'
import { HeroTrailerPlayer } from './home/HeroTrailerPlayer'
import { buildHeroCarousel, getHeroSwipeDirection, getNextHeroIndex, isCurrentHeroEvent, YOUR_NAME_TMDB_ID } from './home/heroCarousel'
import { readAudioMutedPreference, subscribeAudioMutedPreference, writeAudioMutedPreference } from './playback/audioPreference'
import { loadYouTubeApi, makeYouTubeEmbedUrl, type YouTubePlayer } from './playback/youtube'
import { useSpeechRecognition } from './useSpeechRecognition'
import { isSupabaseAuthConfigured, supabaseAuthClient } from './auth/supabase'
import type { Session } from '@supabase/supabase-js'

function mediaKey(item: Media) { return `${item.media_type}:${item.id}` }
function isSaved(saved: Media[], item: Media) { return saved.some(value => mediaKey(value) === mediaKey(item)) }

type DeferredInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }> }
function App() {
  const [profileOpen, setProfileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
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
    const initialAccent = isAccentValue(value) ? value : defaultAccent
    applyAccent(initialAccent)
    return initialAccent
  })
  const [lastCustomAccent, setLastCustomAccent] = useState<string | null>(() => {
    const savedCustom = readPreference(lastCustomAccentPreferenceKey)
    if (isHexAccent(savedCustom ?? '') && savedCustom?.toLowerCase() !== defaultAccent.toLowerCase()) return savedCustom
    const current = readPreference(accentPreferenceKey)
    return isHexAccent(current ?? '') && current?.toLowerCase() !== defaultAccent.toLowerCase() ? current : null
  })
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [player, setPlayer] = useState<'nxsha' | 'universal'>(() => {
    const queryValue = new URLSearchParams(window.location.search).get('player')
    const savedValue = readPreference('aak-movies-player')
    return queryValue === 'universal' || (queryValue !== 'nxsha' && savedValue === 'universal') ? 'universal' : 'nxsha'
  })
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseAuthConfigured)
  const [isInstalled, setIsInstalled] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const reloadAfterUpdate = useRef(false)
  useEffect(() => { document.documentElement.dataset.theme = theme; writePreference('aak-movies-theme', theme); const meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]'); if (meta) meta.content = theme === 'night' ? '#000000' : '#e9e8e4' }, [theme])
  useEffect(() => { applyAccent(accent); writePreference(accentPreferenceKey, accent) }, [accent])
  const updateAccent = (value: AccentValue) => {
    if (isHexAccent(value) && value.toLowerCase() !== defaultAccent.toLowerCase()) {
      setLastCustomAccent(value)
      storeCustomAccent(value)
    }
    setAccent(value)
  }
  const updatePlayer = (value: 'nxsha' | 'universal') => {
    setPlayer(value)
    writePreference('aak-movies-player', value)
    const params = new URLSearchParams(location.search)
    if (params.has('player')) {
      params.delete('player')
      const search = params.toString()
      navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true })
    }
  }
  useEffect(() => {
    const requestedPlayer = new URLSearchParams(location.search).get('player')
    if (requestedPlayer === 'nxsha' || requestedPlayer === 'universal') updatePlayer(requestedPlayer)
  }, [location.search])
  useEffect(() => {
    if (!supabaseAuthClient) { setAuthReady(true); return }
    let active = true
    const { data: { subscription } } = supabaseAuthClient.auth.onAuthStateChange((_event, session) => {
      if (active) { setAuthSession(session); setAuthReady(true) }
    })
    void supabaseAuthClient.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) console.warn('[Auth] Session restore failed.', { message: error.message })
      setAuthSession(data.session)
      setAuthReady(true)
    }).catch(cause => {
      if (active) {
        console.warn('[Auth] Session restore failed.', cause)
        setAuthSession(null)
        setAuthReady(true)
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
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
      <Route path="/tv/:id" element={<TvDetailsPage key={location.pathname} saved={saved} toggleSaved={toggleSaved} player={player} onPlayerChange={updatePlayer} />} />
      <Route path="/tv/:id/season/:seasonNumber" element={<TvSeasonPage key={location.pathname} />} />
      <Route path="/watch/movie/:id" element={<MovieWatchPage key={location.pathname} player={player} onPlayerChange={updatePlayer} />} />
      <Route path="/watch/tv/:id/:seasonNumber/:episodeNumber" element={<LegacyEpisodeRedirect />} />
      <Route path="/watch/:id" element={<MovieWatchPage key={location.pathname} player={player} onPlayerChange={updatePlayer} />} />
      <Route path="/sources" element={<ManifestManager />} />
      <Route path="/library" element={<LibraryPage saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/profile" element={<Profile accent={accent} lastCustomAccent={lastCustomAccent} setAccent={updateAccent} player={player} onPlayerChange={updatePlayer} authReady={authReady} session={authSession} />} />
      <Route path="/auth/callback" element={<AuthCallbackPage authReady={authReady} session={authSession} />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<InfoPage title="Contact information unavailable." kicker="CONTACT" text="A public support contact is not configured for this demonstration." />} />
      <Route path="/privacy" element={<Policy title="Privacy, in plain language." kicker="PRIVACY" text="This demo stores saved titles and manifest URLs in browser storage. TMDB searches and metadata requests are sent to TMDB. Never configure private credentials in a client bundle for production." />} />
      <Route path="/terms" element={<Policy title="A few ground rules." kicker="TERMS" text="AAK Movies is a discovery interface. Film and series metadata is supplied by TMDB. Viewing availability, licensing, and playback rights vary by territory and provider." />} />
      <Route path="/copyright" element={<Policy title="Content & copyright." kicker="RIGHTS & REMOVAL" text="AAK Movies does not host movie or television files. External playback is handled by providers. Rights holders should contact the AAK Movies operator with the title, rights documentation, and contact information." />} />
      <Route path="*" element={<InfoPage title="A scene missing from the reel." kicker="404" text="We couldn’t find that page. Return to the collection and find a new favorite." />} />
    </Routes></main>
    <BottomNavigation />
    <BackToTop />
    <Footer />{toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    {profileOpen && <ProfilePopup accent={accent} lastCustomAccent={lastCustomAccent} setAccent={updateAccent} theme={theme} setTheme={setTheme} player={player} onPlayerChange={updatePlayer} authReady={authReady} session={authSession} onClose={() => setProfileOpen(false)} />}
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

function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 480)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  if (!visible) return null
  return <button type="button" className="back-to-top" aria-label="Back to top" title="Back to top" onClick={() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' })
  }}><ArrowUp size={17} aria-hidden="true" /></button>
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
  const [muted, setMuted] = useState(readAudioMutedPreference)
  const [actualMuted, setActualMuted] = useState(readAudioMutedPreference)
  const [heroVisible, setHeroVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  const [progress, setProgress] = useState<WatchProgress[]>(readWatchProgress)
  const heroRef = useRef<HTMLElement>(null)
  const heroPlaybackToggle = useRef<(() => void) | null>(null)
  const heroSetMuted = useRef<((muted: boolean) => void) | null>(null)
  const heroTouchStart = useRef<{ x: number; y: number } | null>(null)
  const suppressHeroClickUntil = useRef(0)
  const registerHeroPlaybackToggle = useCallback((toggle: (() => void) | null) => { heroPlaybackToggle.current = toggle }, [])
  const registerHeroSetMuted = useCallback((setPlayerMuted: ((muted: boolean) => void) | null) => { heroSetMuted.current = setPlayerMuted }, [])
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
    getGlobalWatchProviders().then(catalog => { if (active) setProviders(catalog.all) }).catch(cause => { if (active) console.warn('[TMDB providers] Could not load provider catalog.', cause) }).finally(() => { if (active) setProviderLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => subscribeWatchProgress(() => setProgress(readWatchProgress())), [])
  useEffect(() => subscribeAudioMutedPreference(setMuted), [])
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
    {previewKey && heroVisible && pageVisible && <HeroTrailerPlayer key={`${activeKey}:${previewKey}:${trailerAttempt}`} mediaKey={activeKey} videoKey={previewKey} muted={muted} onEnded={onHeroEnded} onError={onHeroError} onPlayingChange={onHeroPlayingChange} onRetry={onHeroRetry} onRegisterToggle={registerHeroPlaybackToggle} onRegisterSetMuted={registerHeroSetMuted} onMutedChange={(key, value) => { if (isCurrentHeroEvent(key, activeKeyRef.current)) setActualMuted(value) }} />}
    <div className="hero-scrim" aria-hidden="true" />
    <div className="hero-content"><div className="eyebrow"><Sparkles size={13} /> {isMovie ? 'FEATURED FILM' : 'FEATURED SERIES'}</div><h1 aria-live="polite">{activeItem.title}</h1><div className="hero-meta">{mediaYear(activeItem) && <><span>{mediaYear(activeItem)}</span><i /></>}<span>{mediaTypeLabel(activeItem)}</span><i /><span>{activeItem.genre}</span>{activeItem.vote_average !== undefined && <><i /><span className="rated"><Star size={12} fill="currentColor" /> {activeItem.vote_average.toFixed(1)}</span></>}</div><p>{activeItem.overview || 'Discover the story and details.'}</p><div className="hero-actions"><Link className="button button-primary" to={watchPath}>{isMovie ? <><Play size={17} fill="currentColor" /> Watch now</> : <>Explore series <ArrowRight size={15} /></>}</Link><Link className="button button-quiet" to={titlePath}><Info size={17} /> More details <ArrowRight size={15} /></Link></div><div className="hero-caption"><span className="caption-line" /> AAK MOVIES COLLECTION</div></div>
    <div className="hero-controls"><div className="hero-step-controls"><button className="circle-control" onClick={event => { event.stopPropagation(); goToFeatured(-1) }} aria-label="Previous featured title"><ChevronLeft size={17} /></button><button className="circle-control" onClick={event => { event.stopPropagation(); goToFeatured(1) }} aria-label="Next featured title"><ChevronRight size={17} /></button></div>{previewKey && <button className="hero-mute" onClick={event => { event.stopPropagation(); const nextMuted = !actualMuted; writeAudioMutedPreference(nextMuted); setMuted(nextMuted); setActualMuted(nextMuted); heroSetMuted.current?.(nextMuted) }} aria-label={actualMuted ? 'Unmute trailer preview' : 'Mute trailer preview'} title={actualMuted ? 'Unmute preview' : 'Mute preview'}>{actualMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}<span>{actualMuted ? 'Muted' : 'Sound on'}</span></button>}<div className="hero-index" aria-label={`Featured title ${currentIndex + 1} of ${featured.length}`}><span>{String(currentIndex + 1).padStart(2, '0')}</span><div /><span>{String(featured.length).padStart(2, '0')}</span></div></div>
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
  type DiscoverPageState = { key: string; results: Media[]; page: number; totalPages: number; loading: boolean; loadingMore: boolean; error: string }
  const params = new URLSearchParams(location.search)
  const getCategory = (): DiscoverCategory => params.get('collection') === 'anime' ? 'anime' : (params.get('media') === 'movie' || params.get('media') === 'tv') ? params.get('media') as 'movie' | 'tv' : 'all'
  const [category, setCategory] = useState<DiscoverCategory>(getCategory)
  const [query, setQuery] = useState(params.get('query') ?? '')
  const [selectedGenre, setSelectedGenre] = useState(params.get('genre') ?? 'All films')
  const [year, setYear] = useState(params.get('year') ?? 'Any year')
  const [language, setLanguage] = useState(params.get('language') ?? 'Any language')
  const [sort, setSort] = useState(params.get('sort') ?? 'popular')
  const [providerId, setProviderId] = useState(params.get('provider') ?? '')
  const [monetization, setMonetization] = useState(params.get('monetization') ?? 'streaming')
  const [pageState, setPageState] = useState<DiscoverPageState>({ key: '', results: [], page: 0, totalPages: 1, loading: true, loadingMore: false, error: '' })
  const sentinel = useRef<HTMLDivElement>(null)
  const request = useRef<{ key: string; controller: AbortController; page: number; totalPages: number; loading: boolean } | null>(null)
  const animeMode = category === 'anime'
  const mediaFilter = animeMode ? 'tv' : category
  const region = 'BD'

  usePageMeta(category === 'anime' ? 'Anime — Discover | AAK Movies' : category === 'tv' ? 'TV Shows — Discover | AAK Movies' : category === 'movie' ? 'Movies — Discover | AAK Movies' : 'Movies & TV — Discover | AAK Movies', 'Search and filter movies, anime, and TV series by title, genre, year, and language.')
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

  const filters = useMemo<DiscoverCatalogFilters>(() => ({
    query,
    type: mediaFilter as 'movie' | 'tv' | 'all',
    anime: animeMode,
    genre: selectedGenre,
    year,
    language,
    sort: sort as DiscoverCatalogFilters['sort'],
    providerId: providerId ? Number(providerId) : undefined,
    region,
    monetization: (monetization === 'rent-buy' ? ['rent', 'buy'] : monetization === 'subscription' ? ['flatrate'] : monetization === 'all' ? ['flatrate', 'free', 'ads', 'rent', 'buy'] : ['flatrate', 'free', 'ads']) as WatchMonetization[],
  }), [query, mediaFilter, animeMode, selectedGenre, year, language, sort, providerId, region, monetization])
  const filterKey = JSON.stringify(filters)

  const loadPage = useCallback((reset = false) => {
    let current = request.current
    if (reset) {
      current?.controller.abort()
      current = { key: filterKey, controller: new AbortController(), page: 0, totalPages: 1, loading: false }
      request.current = current
      setPageState({ key: filterKey, results: [], page: 0, totalPages: 1, loading: true, loadingMore: false, error: '' })
    }
    if (!current || current.key !== filterKey || current.loading || current.page >= current.totalPages) return
    current.loading = true
    const requestedPage = current.page + 1
    setPageState(state => state.key === filterKey ? { ...state, loading: requestedPage === 1, loadingMore: requestedPage > 1, error: '' } : state)
    void getDiscoverCatalogPage(filters, requestedPage, current.controller.signal).then(response => {
      if (request.current !== current || current.controller.signal.aborted) return
      current.page = requestedPage
      current.totalPages = response.totalPages
      current.loading = false
      setPageState(state => {
        if (state.key !== filterKey) return state
        const results = dedupeMediaByIdentity(requestedPage === 1 ? response.results : [...state.results, ...response.results])
        return { ...state, results, page: requestedPage, totalPages: response.totalPages, loading: false, loadingMore: false, error: '' }
      })
    }).catch(cause => {
      if (request.current !== current || current.controller.signal.aborted) return
      current.loading = false
      const message = cause instanceof Error ? cause.message : 'Catalog unavailable.'
      setPageState(state => state.key === filterKey ? { ...state, loading: false, loadingMore: false, error: message } : state)
    })
  }, [filters, filterKey])

  useEffect(() => {
    loadPage(true)
    return () => {
      if (request.current?.key === filterKey) request.current.controller.abort()
    }
  }, [loadPage, filterKey])

  const updateUrl = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(location.search)
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key)
    navigate('/discover' + (next.size ? '?' + next.toString() : ''), { replace: true })
  }
  const onVoiceTranscript = useCallback((transcript: string) => {
    setQuery(transcript)
    const next = new URLSearchParams(location.search)
    next.set('query', transcript)
    navigate('/discover?' + next.toString(), { replace: true })
  }, [location.search, navigate])
  const voice = useSpeechRecognition(onVoiceTranscript)
  useEffect(() => {
    const node = sentinel.current
    if (!node || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) loadPage(false)
    }, { rootMargin: '560px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadPage, pageState.page, pageState.totalPages, pageState.loading, pageState.error])

  const filtered = useMemo(() => {
    let list = pageState.results.filter(item =>
      (!animeMode || item.media_type === 'tv') &&
      (!animeMode || !query.trim() || item.title.toLowerCase().includes(query.trim().toLowerCase())) &&
      (selectedGenre === 'All films' || (genreApiId(item.media_type, selectedGenre) !== undefined ? item.genre_ids?.includes(genreApiId(item.media_type, selectedGenre)!) : item.genre.toLowerCase() === selectedGenre.toLowerCase())) &&
      (year === 'Any year' || mediaYear(item) === year) &&
      (language === 'Any language' || item.language === language))
    if (sort === 'top_rated') list = [...list].sort((a, b) => (b.vote_average ?? -1) - (a.vote_average ?? -1))
    if (sort === 'newest') list = [...list].sort((a, b) => mediaDate(b)?.localeCompare(mediaDate(a) ?? '') ?? 0)
    return list
  }, [pageState.results, selectedGenre, year, language, sort, animeMode, query])

  const chooseCategory = (value: DiscoverCategory) => {
    setCategory(value)
    setSelectedGenre(value === 'anime' ? 'Animation' : 'All films')
    updateUrl({ media: value === 'anime' ? 'tv' : value, collection: value === 'anime' ? 'anime' : null, genre: value === 'anime' ? 'Animation' : null, language: value === 'anime' ? 'Japanese' : null })
  }
  const clearFilters = () => {
    setQuery('')
    setProviderId('')
    updateUrl({ query: null, genre: null, year: null, language: null, provider: null, monetization: null, sort: null, collection: null })
  }
  const hasMore = pageState.page > 0 && pageState.page < pageState.totalPages
  const initialLoading = pageState.loading && pageState.page === 0

  return <div className="page-wrap discover-page">
    <div className="page-intro discover-welcome"><div className="section-kicker"><Sparkles size={13} /> YOUR NEXT STORY STARTS HERE</div><h1 className="discover-welcome-name">Ayatullah Al Khomeini</h1><p>Find a new favorite from a world of movies, anime, and television.</p></div>
    <div className="media-switch" role="group" aria-label="Choose content category">{(['all', 'movie', 'anime', 'tv'] as const).map(value => <button key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => chooseCategory(value)}>{value === 'movie' ? 'Movies' : value === 'tv' ? 'TV Shows' : value === 'anime' ? 'Anime' : 'All'}</button>)}</div>
    <div className="discover-tools">
      <form className="search-field discover-search" role="search" onSubmit={event => { event.preventDefault(); updateUrl({ query: query.trim() || null }) }}>
        <Search size={19} aria-hidden="true" />
        <label className="sr-only" htmlFor="discover-query">Search titles</label>
        <input id="discover-query" value={query} onChange={event => { setQuery(event.target.value); updateUrl({ query: event.target.value || null }) }} placeholder={'Search ' + (animeMode ? 'anime' : mediaFilter === 'movie' ? 'movies' : mediaFilter === 'tv' ? 'TV shows' : 'movies and TV shows') + '…'} aria-label={animeMode ? 'Search anime' : mediaFilter === 'movie' ? 'Search movies' : mediaFilter === 'tv' ? 'Search TV shows' : 'Search movies and TV shows'} />
        <button type="button" className={'voice-search' + (voice.listening ? ' is-listening' : '')} onClick={voice.listening ? voice.stop : voice.start} disabled={!voice.supported} aria-label={voice.listening ? 'Stop voice search' : 'Start voice search'} aria-pressed={voice.listening} title={voice.supported ? (voice.listening ? 'Stop voice search' : 'Search by voice') : 'Voice search is not supported in this browser'}><span className="sr-only">{voice.listening ? 'Listening' : 'Voice search'}</span>{voice.listening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}</button>
        {query && <button type="button" className="search-clear" onClick={() => { setQuery(''); updateUrl({ query: null }) }} aria-label="Clear search"><X size={17} /></button>}
        <button type="submit" className="search-submit" aria-label="Search titles"><span>Search</span><ArrowRight size={15} aria-hidden="true" /></button>
      </form>
      {!voice.supported && <p className="voice-search-note" role="status">Voice search is not supported in this browser. You can still type your search.</p>}
      {voice.error && <p className="voice-search-note" role="status">{voice.error}</p>}
      <div className="filter-row"><div className="genre-filter">{genres.map(item => <button type="button" key={item} className={selectedGenre === item ? 'filter-chip active' : 'filter-chip'} onClick={() => { setSelectedGenre(item); updateUrl({ genre: item === 'All films' ? null : item }) }}>{item === 'All films' ? 'All genres' : item}</button>)}</div>
        <div className="select-filters">
          <label><ListFilter size={14} /><select value={year} onChange={event => { setYear(event.target.value); updateUrl({ year: event.target.value === 'Any year' ? null : event.target.value }) }} aria-label="Filter by year"><option>Any year</option>{Array.from({ length: 8 }, (_, index) => String(new Date().getFullYear() - index)).map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <label><ListFilter size={14} /><select value={language} onChange={event => { setLanguage(event.target.value); updateUrl({ language: event.target.value === 'Any language' ? null : event.target.value }) }} aria-label="Filter by language"><option>Any language</option>{['English', 'Japanese', 'Korean', 'French', 'Spanish', 'Hindi'].map(value => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>
          <label><ArrowDownWideNarrow size={14} /><select value={sort} onChange={event => { setSort(event.target.value); updateUrl({ sort: event.target.value }) }} aria-label="Sort results"><option value="trending">Trending</option><option value="popular">Popular</option><option value="top_rated">Top rated</option><option value="newest">Newest</option></select><ChevronDown size={13} /></label>
        </div>
      </div>
    </div>
    <div className="results-head"><span>{initialLoading ? 'Finding titles…' : providerId ? filtered.length + ' matching titles' : filtered.length + (filtered.length === 1 ? ' title to explore' : ' titles to explore')}</span><span>COLLECTED WITH CARE</span></div>
    {pageState.error && <div className="catalog-error" role="alert"><span>{pageState.error}</span> <button type="button" className="button button-outline" onClick={() => loadPage(false)}>Retry</button></div>}
    {initialLoading ? <SkeletonGrid /> : filtered.length ? <div className="discover-grid">{filtered.map(item => <MediaCard item={item} saved={isSaved(saved, item)} toggleSaved={toggleSaved} key={item.media_type + ':' + item.id} />)}</div> : !pageState.error && pageState.page > 0 ? <div className="empty-state"><Search /><h3>{hasMore ? 'No matches on this page yet.' : 'No titles found in this frame.'}</h3><p>{hasMore ? 'Keep scrolling to check the remaining TMDB pages for these filters.' : providerId ? 'No matching titles were returned for this provider and availability type.' : 'Try another title or loosen your filters.'}</p>{!hasMore && <button type="button" className="button button-outline" onClick={clearFilters}>Clear filters</button>}</div> : null}
    {pageState.loadingMore && <div className="load-more-status" role="status">Loading more titles…</div>}
    {!pageState.error && pageState.page > 0 && !hasMore && <p className="catalog-end-note">You’ve reached the end of TMDB’s available results for these filters.</p>}
    {hasMore && <div ref={sentinel} className="discover-load-sentinel" aria-hidden="true" />}
    {hasMore && typeof IntersectionObserver === 'undefined' && <button type="button" className="button button-outline discover-load-more" onClick={() => loadPage(false)} disabled={pageState.loading || pageState.loadingMore}>{pageState.loadingMore ? 'Loading…' : 'Load more titles'}</button>}
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
  const [paused, setPaused] = useState(false)
  const prioritizedProviders = prioritizeHomepageProviders(providers)
  const onBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
  }
  return <section className="provider-section" aria-label="Streaming provider logos"><div className="provider-strip-controls"><Link to="/providers" className="subtle-link">See all providers <ArrowRight size={14} /></Link></div>{loading ? <><span className="sr-only" role="status">Loading provider logos.</span><div className="provider-carousel provider-carousel-loading" aria-hidden="true">{Array.from({ length: 8 }).map((_, index) => <span key={index} />)}</div></> : prioritizedProviders.length ? <div className={'provider-marquee' + (paused ? ' is-paused' : '')} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={onBlur}><div className="provider-marquee-track" style={{ animationDuration: `${Math.max(26, prioritizedProviders.length * 3.5)}s` }}><div className="provider-marquee-group" role="list">{prioritizedProviders.map(provider => <Link role="listitem" className="provider-tile" key={provider.provider_id} to={`/discover?provider=${provider.provider_id}&region=BD`} aria-label={`Discover titles on ${provider.provider_name}`} title={provider.provider_name}><ProviderLogo provider={provider} size={58} /></Link>)}</div><div className="provider-marquee-group provider-marquee-copy" aria-hidden="true">{prioritizedProviders.map(provider => <span className="provider-tile" key={provider.provider_id}><ProviderLogo provider={provider} size={58} alt="" /></span>)}</div></div></div> : <span className="sr-only" role="status">No provider listings are currently returned by TMDB.</span>}</section>
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
  const [trailerOpen, setTrailerOpen] = useState(false)
  const trailerButton = useRef<HTMLButtonElement>(null)
  const toggleBackgroundTrailer = useRef<() => void>(() => undefined)
  usePageMeta(movie ? `${movie.title} — Movie Details | AAK Movies` : 'Movie details | AAK Movies', movie?.overview || 'Movie details and recommendations on AAK Movies.', 'video.movie')
  useEffect(() => { let active = true; setLoading(true); setError(''); const local = movies.find(item => item.id === numericId); setMovie(local ? { ...local, cast: [], recommendations: [] } : null); if (!Number.isInteger(numericId) || numericId <= 0) { setError('This movie ID is invalid.'); setLoading(false); return } getMovieDetails(numericId).then(data => { if (active) setMovie(data) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Movie details unavailable.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [numericId])
  if (!movie && (loading || error)) return <PageState loading={loading} error={error} />
  if (!movie) return <PageState error="Movie not found." />
  const detailed = movie
  const year = mediaYear(movie)
  const toggleBanner = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest('a,button,input,select,textarea,[role="button"]')) return
    toggleBackgroundTrailer.current()
  }
  const handleBannerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    toggleBackgroundTrailer.current()
  }
  return <><section className="detail-hero" role="group" tabIndex={0} aria-label={`${movie.title} banner. Press Enter or Space to pause or resume the background trailer.`} onClick={toggleBanner} onKeyDown={handleBannerKeyDown}><DetailHeroArtwork artwork={movie.backdrop} videoKey={movie.officialTrailerKey} title={movie.title} suspended={trailerOpen} onRegisterToggle={toggleBackgroundTrailer} /><div className="detail-content"><Link to="/discover" className="back-link"><ArrowLeft size={14} /> Back to discover</Link><div className="section-kicker">AAK MOVIES FEATURE · MOVIE</div><h1>{movie.title}</h1><div className="hero-meta">{year && <span>{year}</span>}<i /><span>{movie.runtime ?? 'Runtime unavailable'}</span><i /><span>{movie.genre}</span>{movie.vote_average !== undefined && <><i /><span className="rated"><Star size={13} fill="currentColor" /> {movie.vote_average.toFixed(1)}</span></>}</div><p>{movie.overview || 'No synopsis is available from TMDB.'}</p><div className="hero-actions"><Link className="button button-primary" to={`/watch/movie/${movie.id}`}><Play size={17} fill="currentColor" /> Watch now</Link><button className="button button-quiet" onClick={() => toggleSaved(movie)}>{isSaved(saved, movie) ? <Check size={17} /> : <Bookmark size={17} />}{isSaved(saved, movie) ? 'In your library' : 'Add to library'}</button><button ref={trailerButton} className="button button-quiet" type="button" disabled={!detailed.trailerKey} onClick={event => { event.stopPropagation(); setTrailerOpen(true) }}><Play size={16} />{detailed.trailerKey ? 'Watch Trailer' : 'Trailer unavailable'}</button></div></div><img className="detail-poster" src={movie.poster} alt={`${movie.title} poster`} /></section><div className="detail-body"><div className="detail-facts"><Fact label="RELEASED" value={year || 'Not listed'} /><Fact label="LANGUAGE" value={movie.language || 'Not listed'} /><Fact label="GENRE" value={movie.genre} />{movie.vote_average !== undefined && <Fact label="TMDB RATING" value={`${movie.vote_average.toFixed(1)} / 10`} />}</div><DetailTrailerInline videoKey={detailed.trailerKey} title={movie.title} open={trailerOpen} onClose={() => { setTrailerOpen(false); requestAnimationFrame(() => trailerButton.current?.focus()) }} />{detailed.cast.length > 0 && <CastList members={detailed.cast} />}<MediaRow title="Recommended movies" kicker="KEEP THE FEELING GOING" items={detailed.recommendations} saved={saved} toggleSaved={toggleSaved} /></div></>
}

function TvDetailsPage({ saved, toggleSaved, player, onPlayerChange }: { saved: Media[]; toggleSaved: (item: Media) => void; player: 'nxsha' | 'universal'; onPlayerChange: (value: 'nxsha' | 'universal') => void }) {
  const { id } = useParams(); const numericId = Number(id); const location = useLocation(); const navigate = useNavigate(); const [show, setShow] = useState<TvDetails | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [episodes, setEpisodes] = useState<TvEpisode[]>([]); const [seasonLoading, setSeasonLoading] = useState(false); const [seasonError, setSeasonError] = useState(''); const [seasonNo, setSeasonNo] = useState<number | null>(null); const [episodeNo, setEpisodeNo] = useState<number | null>(null); const requestedEpisode = useRef<number | undefined>(undefined)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const trailerButton = useRef<HTMLButtonElement>(null)
  const toggleBackgroundTrailer = useRef<() => void>(() => undefined)
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
  const toggleBanner = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest('a,button,input,select,textarea,[role="button"]')) return
    toggleBackgroundTrailer.current()
  }
  const handleBannerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    toggleBackgroundTrailer.current()
  }
  const episode = episodes.find(item => item.episode_number === episodeNo && item.season_number === selectedSeason?.season_number)
  const episodeIndex = episode ? episodes.findIndex(item => item.id === episode.id) : -1
  const previous = episodeIndex > 0 ? episodes[episodeIndex - 1] : undefined
  const next = episodeIndex >= 0 && episodeIndex < episodes.length - 1 ? episodes[episodeIndex + 1] : undefined
  const selectEpisode = (number: number) => { setEpisodeNo(number); requestedEpisode.current = number; const params = new URLSearchParams(location.search); if (selectedSeason) params.set('season', String(selectedSeason.season_number)); params.set('episode', String(number)); navigate(`/tv/${show.id}?${params.toString()}`) }
  const selectSeason = (number: number) => { setSeasonNo(number); setEpisodeNo(null); requestedEpisode.current = undefined; navigate(`/tv/${show.id}?season=${number}`) }
  const target: PlaybackTarget | null = episode && selectedSeason ? { media_type: 'tv', id: show.id, season_number: selectedSeason.season_number, episode_number: episode.episode_number } : null
  const nxshaUrl = target ? getExternalPlayerUrl(nxshaPlaybackSource, target) : null
  return <><section className="detail-hero" role="group" tabIndex={0} aria-label={`${show.title} banner. Press Enter or Space to pause or resume the background trailer.`} onClick={toggleBanner} onKeyDown={handleBannerKeyDown}><DetailHeroArtwork artwork={show.backdrop} videoKey={show.officialTrailerKey} title={show.title} suspended={trailerOpen} onRegisterToggle={toggleBackgroundTrailer} /><div className="detail-content"><Link to="/discover?media=tv" className="back-link"><ArrowLeft size={14} /> Back to TV shows</Link><div className="section-kicker">AAK MOVIES FEATURE · TV SERIES</div><h1>{show.title}</h1><div className="hero-meta">{year && <span>{year}</span>}<i /><span>{show.number_of_seasons === undefined ? 'Seasons unavailable' : `${show.number_of_seasons} ${show.number_of_seasons === 1 ? 'season' : 'seasons'}`}</span><i /><span>{show.number_of_episodes === undefined ? 'Episodes unavailable' : `${show.number_of_episodes} episodes`}</span>{show.vote_average !== undefined && <><i /><span className="rated"><Star size={13} fill="currentColor" /> {show.vote_average.toFixed(1)}</span></>}</div><p>{show.overview || 'No synopsis is available from TMDB.'}</p><div className="hero-actions"><button className="button button-quiet" onClick={() => toggleSaved(show)}>{isSaved(saved, show) ? <Check size={17} /> : <Bookmark size={17} />}{isSaved(saved, show) ? 'In your library' : 'Add to library'}</button><button ref={trailerButton} className="button button-quiet" type="button" disabled={!show.trailerKey} onClick={event => { event.stopPropagation(); setTrailerOpen(true) }}><Play size={16} />{show.trailerKey ? 'Watch Trailer' : 'Trailer unavailable'}</button></div></div><img className="detail-poster" src={show.poster} alt={`${show.title} poster`} /></section><div className="detail-body"><div className="detail-facts"><Fact label="FIRST AIRED" value={year || 'Not listed'} /><Fact label="SEASONS" value={show.number_of_seasons?.toString() ?? 'Not listed'} /><Fact label="EPISODES" value={show.number_of_episodes?.toString() ?? 'Not listed'} /><Fact label="GENRE" value={show.genre} /></div><DetailTrailerInline videoKey={show.trailerKey} title={show.title} open={trailerOpen} onClose={() => { setTrailerOpen(false); requestAnimationFrame(() => trailerButton.current?.focus()) }} />{show.cast.length > 0 && <CastList members={show.cast} />}<section className="season-list inline-episode-guide"><div className="section-kicker">EPISODE GUIDE</div><h3>Choose a season and episode</h3><label className="inline-season-select">Season<select value={selectedSeason?.season_number ?? ''} onChange={event => selectSeason(Number(event.target.value))} aria-label="Choose a season" disabled={!availableSeasons.length}>{availableSeasons.map(season => <option key={season.id} value={season.season_number}>{season.name || `Season ${season.season_number}`}</option>)}</select></label>{seasonError && <p className="form-error" role="alert">{seasonError}</p>}{seasonLoading ? <p className="season-status" role="status">Loading episodes…</p> : episodes.length ? <div className="inline-episode-layout"><div className="episode-list" aria-label="Episodes">{episodes.map(item => <button className={`inline-episode-card ${episode?.id === item.id ? 'selected' : ''}`} key={item.id} type="button" aria-pressed={episode?.id === item.id} onClick={() => selectEpisode(item.episode_number)}><span className="episode-number">{String(item.episode_number).padStart(2, '0')}</span><span className="episode-copy"><strong>{item.name || `Episode ${item.episode_number}`}</strong><small>{item.air_date || 'Air date not listed'}{item.runtime ? ` · ${item.runtime} min` : ''}</small></span><Play size={15} aria-hidden="true" /></button>)}</div><div className="inline-tv-playback">{episode && <div className="selected-episode"><div className="section-kicker">SEASON {episode.season_number} · EPISODE {episode.episode_number}</div><h4>{episode.name || `Episode ${episode.episode_number}`}</h4><p>{episode.overview || 'No episode synopsis is available from TMDB.'}</p></div>}<PlayerChoices selected={player} onChange={onPlayerChange} />{player === 'nxsha' && nxshaUrl ? <ExternalIframePlayer key={nxshaUrl} title={`AAK Player for ${show.title}, season ${selectedSeason?.season_number}, episode ${episode?.episode_number}`} src={nxshaUrl} /> : player === 'universal' && episode && selectedSeason ? <UniversalPlayerPanel contextLabel={`${show.title} S${selectedSeason.season_number}E${episode.episode_number}`} mediaContext={{ media_type: 'tv', tmdbId: show.id, title: show.title, poster: episode.still_path ? `https://image.tmdb.org/t/p/w500${episode.still_path}` : show.poster, seasonNumber: selectedSeason.season_number, episodeNumber: episode.episode_number, episodeId: episode.id, episodeTitle: episode.name }} /> : <p className="season-status" role="status">Choose an episode to view playback options.</p>}<nav className="episode-neighbors" aria-label="Episode navigation">{previous ? <button className="button button-outline" type="button" onClick={() => selectEpisode(previous.episode_number)}><ArrowLeft size={14} /> Previous · E{previous.episode_number}</button> : <span />}{next ? <button className="button button-outline" type="button" onClick={() => selectEpisode(next.episode_number)}>Next · E{next.episode_number} <ArrowRight size={14} /></button> : <span />}</nav></div></div> : !seasonError && <p className="season-status" role="status">TMDB has not listed episodes for this season.</p>}</section><MediaRow title="Recommended TV series" kicker="MORE SERIES TO DISCOVER" items={show.recommendations} saved={saved} toggleSaved={toggleSaved} /></div></>
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

function MovieWatchPage({ player, onPlayerChange }: { player: 'nxsha' | 'universal'; onPlayerChange: (value: 'nxsha' | 'universal') => void }) {
  const { id } = useParams()
  const numericId = Number(id)
  const [movie, setMovie] = useState<Movie | null>(movies.find(item => item.id === numericId) ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const target: PlaybackTarget | null = movie ? { media_type: 'movie', id: movie.id } : null
  const url = target ? getExternalPlayerUrl(nxshaPlaybackSource, target) : null
  usePageMeta(movie ? `Watch ${movie.title} | AAK Movies` : 'Movie player | AAK Movies', 'Movie playback choices on AAK Movies.')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    if (!Number.isSafeInteger(numericId) || numericId <= 0) { setError('This movie ID is invalid.'); setLoading(false); return () => { active = false } }
    getMovieDetails(numericId).then(data => { if (active) setMovie(data) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Movie unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [numericId, attempt])
  if (loading) return <PageState loading />
  if (error || !movie || !url) return <PageState error={error || 'A playback source is not configured for this movie.'} onRetry={() => setAttempt(value => value + 1)} />
  return <div className="watch-page"><div className="watch-top"><Link to={`/movie/${movie.id}`} className="back-link"><ArrowLeft size={14} /> Back to {movie.title}</Link><span className="watch-title">MOVIE PLAYER <i /> {movie.title}</span></div><PlayerChoices selected={player} onChange={onPlayerChange} /><div className="watch-player-content">{player === 'nxsha' ? <ExternalIframePlayer key={url} title={`AAK Player for ${movie.title}`} src={url} /> : <UniversalPlayerPanel contextLabel={movie.title} mediaContext={{ media_type: 'movie', tmdbId: movie.id, title: movie.title, poster: movie.poster }} />}</div><div className="watch-information"><div><div className="section-kicker">MOVIE</div><h1>{movie.title}</h1><p>{mediaYear(movie)} <i /> {movie.runtime ?? 'Runtime unavailable'}</p></div><Link className="button button-quiet" to={`/movie/${movie.id}`}>Movie details <ArrowRight size={15} /></Link></div></div>
}

function PlayerChoices({ selected, onChange, compact = false }: { selected: 'nxsha' | 'universal'; onChange: (value: 'nxsha' | 'universal') => void; compact?: boolean }) {
  return <div className={`player-choices${compact ? ' player-choices-compact' : ''}`} role="group" aria-label="Choose a player">
    <button type="button" className={selected === 'nxsha' ? 'selected' : ''} aria-pressed={selected === 'nxsha'} onClick={() => onChange('nxsha')}><MonitorPlay size={17} /><span>AAK Player</span><small>Nxsha external player</small></button>
    <button type="button" className={selected === 'universal' ? 'selected' : ''} aria-pressed={selected === 'universal'} onClick={() => onChange('universal')}><Magnet size={17} /><span>Torrent</span><small>Built-in addon sources</small></button>
  </div>
}

function ExternalIframePlayer({ src, title }: { src: string; title: string }) {
  const stage = useRef<HTMLDivElement>(null)
  const playerShell = useRef<HTMLElement>(null)
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [frameTimedOut, setFrameTimedOut] = useState(false)
  useEffect(() => { setFrameLoaded(false); setFrameTimedOut(false) }, [src])
  useEffect(() => {
    if (frameLoaded) return
    const timer = window.setTimeout(() => {
      setFrameTimedOut(true)
      console.warn('[Nxsha] The iframe did not finish loading before the timeout.', { source: nxshaPlaybackSource.name })
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [src, frameLoaded])
  return <section className="external-player" ref={playerShell}>
    <div className="player-frame" ref={stage}>
      <iframe title={title} src={src} loading="eager" sandbox="allow-scripts allow-same-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" onLoad={() => { setFrameLoaded(true); setFrameTimedOut(false) }} onError={() => console.warn('[Nxsha] The browser reported an iframe load error. Cross-origin player state is not available.')} />
      {frameTimedOut && !frameLoaded ? <div className="iframe-error" role="alert">Player could not load. Please try again.</div> : !frameLoaded && <div className="iframe-loading" role="status"><div className="loading-spinner" /><span>Loading player…</span></div>}
    </div>
    <div className="player-note"><div className="player-note-controls"><FullscreenButton targetRef={playerShell} hideWhenActive /></div></div>
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

function LiveChannelLogo({ channel, className = '' }: { channel: LiveTvChannel; className?: string }) {
  const [failed, setFailed] = useState(false)
  const logo = !failed && isSafeLiveTvLogo(channel.logoUrl)
  return <span className={'live-channel-logo ' + className} aria-hidden="true">{logo ? <img src={channel.logoUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Tv size={20} aria-hidden="true" />}</span>
}

type LiveTvHealthState = 'unchecked' | 'checking' | 'online' | 'offline' | 'unknown'
type LiveTvHealthRecord = { state: LiveTvHealthState; message?: string; checkedAt?: number }
const liveHealthFreshForMs = 5 * 60 * 1000
const liveChannelRowHeight = 52
const liveCategoryHeadingHeight = 27

type LiveTvListEntry = { kind: 'category'; category: string } | { kind: 'channel'; channel: LiveTvChannel }

function liveListEntryHeight(entry: LiveTvListEntry) {
  return entry.kind === 'category' ? liveCategoryHeadingHeight : liveChannelRowHeight
}

function lowerBound(values: number[], target: number) {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (values[middle] < target) low = middle + 1
    else high = middle
  }
  return low
}

function liveHealthText(state: LiveTvHealthState) {
  return state === 'online' ? 'Verified reachable' : state === 'offline' ? 'Verified unavailable' : state === 'checking' ? 'Checking' : state === 'unknown' ? 'Unverified' : 'Not checked'
}

function LiveTvPage() {
  const [channels, setChannels] = useState<LiveTvChannel[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [health, setHealth] = useState<Record<string, LiveTvHealthRecord>>({})
  const healthRef = useRef<Record<string, LiveTvHealthRecord>>({})
  const healthQueue = useRef<LiveTvChannel[]>([])
  const healthPending = useRef(new Set<string>())
  const healthControllers = useRef(new Map<string, AbortController>())
  const healthWorkers = useRef(0)
  const pageActive = useRef(false)
  const drainHealthQueue = useRef<() => void>(() => undefined)
  const [category, setCategory] = useState('All Channels')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [refreshChecks, setRefreshChecks] = useState(0)
  const listScroll = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 420 })
  usePageMeta('Live TV | AAK Movies', 'Browse the IPTV-org public channel index. Availability checks are bounded and do not guarantee browser playback or streaming rights.')

  useEffect(() => {
    const controller = new AbortController()
    setCatalogLoading(true)
    setCatalogError('')
    loadLiveTvCatalog(controller.signal)
      .then(items => { if (!controller.signal.aborted) setChannels(items) })
      .catch(cause => { if (!controller.signal.aborted) setCatalogError(cause instanceof Error ? cause.message : 'The channel list could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false) })
    return () => controller.abort()
  }, [catalogAttempt])

  const categoryOptions = useMemo(() => {
    const available = Array.from(new Set(channels.map(channel => channel.category))).sort((a, b) => a.localeCompare(b))
    const options = ['All Channels']
    if (channels.some(isSportsLiveChannel)) options.push('Sports')
    const popular = ['News', 'Movies', 'Music', 'Entertainment', 'Kids', 'Documentary']
      .filter(label => available.some(value => value.toLocaleLowerCase().includes(label.toLocaleLowerCase())))
    options.push(...popular)
    options.push(...available.filter(value => !popular.some(label => value.toLocaleLowerCase().includes(label.toLocaleLowerCase())) && !isSportsLiveChannel({ category: value })))
    return options.slice(0, 10)
  }, [channels])

  const matchingChannels = useMemo(() => channels.filter(channel => {
    const categoryMatch = category === 'All Channels'
      || category === 'Sports' && isSportsLiveChannel(channel)
      || category !== 'All Channels' && category !== 'Sports' && channel.category.toLocaleLowerCase().includes(category.toLocaleLowerCase())
    const textMatch = (channel.name + ' ' + channel.tvgName + ' ' + channel.tvgId + ' ' + channel.category).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    return categoryMatch && textMatch
  }).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), [channels, category, query])

  const liveListEntries = useMemo(() => {
    const entries: LiveTvListEntry[] = []
    let previousCategory = ''
    for (const channel of matchingChannels) {
      if (channel.category !== previousCategory) {
        entries.push({ kind: 'category', category: channel.category })
        previousCategory = channel.category
      }
      entries.push({ kind: 'channel', channel })
    }
    return entries
  }, [matchingChannels])
  const liveListOffsets = useMemo(() => {
    let offset = 0
    return liveListEntries.map(entry => {
      const current = offset
      offset += liveListEntryHeight(entry)
      return current
    })
  }, [liveListEntries])
  const totalLiveListHeight = liveListEntries.length ? liveListOffsets[liveListOffsets.length - 1] + liveListEntryHeight(liveListEntries[liveListEntries.length - 1]) : 0
  const overscanPixels = liveChannelRowHeight * 8
  const visibleStart = Math.min(liveListEntries.length, lowerBound(liveListOffsets, Math.max(0, viewport.top - overscanPixels)))
  const visibleEnd = Math.min(liveListEntries.length, lowerBound(liveListOffsets, viewport.top + viewport.height + overscanPixels) + 1)
  const visibleEntries = liveListEntries.slice(visibleStart, visibleEnd)
  const visibleChannels = visibleEntries.flatMap(entry => entry.kind === 'channel' ? [entry.channel] : [])
  const visibleKey = visibleChannels.map(channel => channel.id).join('|')
  const selectedChannel = channels.find(channel => channel.id === selectedId)
  const filteredSelectedIndex = selectedChannel ? matchingChannels.findIndex(channel => channel.id === selectedChannel.id) : -1
  const previousChannel = filteredSelectedIndex > 0 ? matchingChannels[filteredSelectedIndex - 1] : undefined
  const nextChannel = filteredSelectedIndex >= 0 && filteredSelectedIndex < matchingChannels.length - 1 ? matchingChannels[filteredSelectedIndex + 1] : undefined

  useEffect(() => {
    pageActive.current = true
    document.body.classList.add('live-tv-active')
    return () => {
      pageActive.current = false
      document.body.classList.remove('live-tv-active')
      healthControllers.current.forEach(controller => controller.abort())
      healthControllers.current.clear()
      healthQueue.current = []
      healthPending.current.clear()
    }
  }, [])

  const publishHealth = (channelId: string, value: LiveTvHealthRecord) => {
    if (!pageActive.current) return
    const existing = healthRef.current[channelId]
    if (existing?.checkedAt && value.checkedAt && value.checkedAt < existing.checkedAt) return
    const next = { ...healthRef.current, [channelId]: value }
    healthRef.current = next
    setHealth(next)
  }

  const runHealthCheck = (channel: LiveTvChannel) => {
    const controller = new AbortController()
    healthControllers.current.set(channel.id, controller)
    healthWorkers.current += 1
    void checkLiveTvHealth(channel, controller.signal)
      .then(result => publishHealth(channel.id, { state: result.state, message: result.message, checkedAt: result.checkedAt ?? Date.now() }))
      .catch(cause => {
        if (controller.signal.aborted) return
        publishHealth(channel.id, { state: 'unknown', message: cause instanceof Error ? cause.message : 'Status could not be verified.', checkedAt: Date.now() })
      })
      .finally(() => {
        healthControllers.current.delete(channel.id)
        healthPending.current.delete(channel.id)
        healthWorkers.current = Math.max(0, healthWorkers.current - 1)
        drainHealthQueue.current()
      })
  }

  drainHealthQueue.current = () => {
    while (pageActive.current && healthWorkers.current < 3 && healthQueue.current.length) {
      const channel = healthQueue.current.shift()
      if (channel && healthPending.current.has(channel.id)) runHealthCheck(channel)
    }
  }

  useEffect(() => {
    if (!channels.length || catalogLoading || catalogError) return
    const prioritized = selectedChannel ? [selectedChannel, ...visibleChannels.filter(item => item.id !== selectedChannel.id)] : visibleChannels
    if (selectedChannel && healthPending.current.has(selectedChannel.id) && !healthControllers.current.has(selectedChannel.id)) {
      healthQueue.current = healthQueue.current.filter(item => item.id !== selectedChannel.id)
      healthQueue.current.unshift(selectedChannel)
    }
    const now = Date.now()
    for (const channel of prioritized) {
      const existing = healthRef.current[channel.id]
      if (healthPending.current.has(channel.id) || existing?.state === 'checking') continue
      if (existing?.checkedAt && now - existing.checkedAt < liveHealthFreshForMs) continue
      healthPending.current.add(channel.id)
      if (channel.id === selectedId) healthQueue.current.unshift(channel)
      else healthQueue.current.push(channel)
      publishHealth(channel.id, { state: 'checking' })
    }
    drainHealthQueue.current()
  }, [channels.length, catalogLoading, catalogError, selectedId, visibleKey, refreshChecks])

  useEffect(() => {
    const element = listScroll.current
    if (!element) return
    const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [channels.length, catalogLoading, catalogError])

  useEffect(() => {
    const timer = window.setTimeout(() => setRefreshChecks(value => value + 1), liveHealthFreshForMs)
    return () => window.clearTimeout(timer)
  }, [refreshChecks])

  useEffect(() => {
    if (selectedId && !matchingChannels.some(channel => channel.id === selectedId)) setSelectedId('')
  }, [selectedId, matchingChannels])

  useEffect(() => {
    if (listScroll.current) listScroll.current.scrollTop = 0
  }, [category, query])

  const updatePlayerStatus = (channelId: string, state: 'online' | 'offline' | 'unknown', message?: string) => {
    publishHealth(channelId, { state, message, checkedAt: Date.now() })
  }
  const refreshVisibleHealth = () => {
    for (const channel of visibleChannels) {
      healthControllers.current.get(channel.id)?.abort()
      healthPending.current.delete(channel.id)
      healthQueue.current = healthQueue.current.filter(item => item.id !== channel.id)
      publishHealth(channel.id, { state: 'unknown' })
    }
    setRefreshChecks(value => value + 1)
  }
  const onListScroll = () => {
    const element = listScroll.current
    if (element) setViewport({ top: element.scrollTop, height: element.clientHeight })
  }
  const beforeSpacer = liveListOffsets[visibleStart] ?? totalLiveListHeight
  const afterSpacer = Math.max(0, totalLiveListHeight - (liveListOffsets[visibleEnd] ?? totalLiveListHeight))

  return <div className="page-wrap live-tv-page" role="region" aria-label="Live TV channel guide">
    <section className="live-player-panel" aria-label="Live channel player">
      {selectedChannel
        ? <LiveTvPlayer key={selectedChannel.id} channel={selectedChannel} onPrevious={previousChannel ? () => setSelectedId(previousChannel.id) : undefined} onNext={nextChannel ? () => setSelectedId(nextChannel.id) : undefined} onStatus={(state, message) => updatePlayerStatus(selectedChannel.id, state, message)} />
        : <div className="live-tv-empty-stage"><div className="live-player-state" role="status"><div className="live-state-icon"><Radio size={25} /></div><span className="section-kicker">{catalogLoading ? 'PREPARING CHANNEL GUIDE' : 'IPTV-ORG PUBLIC INDEX'}</span><strong>{catalogLoading ? 'Loading channel listings…' : catalogError ? 'The guide is unavailable.' : 'Choose a channel to start.'}</strong><span>{catalogError || 'Select any listed channel. New and unchecked channels remain available to browse.'}</span></div></div>}
    </section>

    <section className="live-guide" aria-label="Channel search and listings">
      <div className="live-search-row">
        <label className="search-field live-channel-search"><Search size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search channels by name" aria-label="Search live TV channels by name" /><span className="live-channel-count" aria-live="polite">{matchingChannels.length.toLocaleString()} {matchingChannels.length === 1 ? 'channel' : 'channels'}</span></label>
        {query && <button type="button" className="live-clear-search" aria-label="Clear channel search" onClick={() => setQuery('')}><X size={17} /><span>Clear</span></button>}
        {visibleChannels.length > 0 && <button type="button" className="live-refresh" onClick={refreshVisibleHealth} aria-label="Refresh channel status for visible channels">Refresh</button>}
      </div>

      {!catalogLoading && !catalogError && channels.length > 0 && <div className="live-category-filters" role="tablist" aria-label="Channel categories">{categoryOptions.map((item, index) => <button key={item} id={'live-tab-' + index} role="tab" aria-selected={category === item} aria-controls="live-channel-rows" tabIndex={category === item ? 0 : -1} className={category === item ? 'active' : ''} type="button" onClick={() => { setCategory(item); if (listScroll.current) listScroll.current.scrollTop = 0; setViewport(current => ({ ...current, top: 0 })) }}>{item}</button>)}</div>}

      <div className="live-channel-list-header"><span>{category === 'All Channels' ? 'Channel directory' : category}</span><span>{matchingChannels.length.toLocaleString()} matching listings</span></div>
      <div className="live-channel-scroll" id="live-channel-rows" role="tabpanel" aria-labelledby={'live-tab-' + categoryOptions.indexOf(category)} tabIndex={0} ref={listScroll} onScroll={onListScroll}>
        {catalogLoading ? <div className="live-catalog-loading" role="status"><span className="loading-spinner" />Loading and parsing channel listings…</div>
          : catalogError ? <div className="empty-state live-empty" role="alert"><Radio /><h3>Channel guide unavailable.</h3><p>{catalogError}</p><button type="button" className="button button-outline" onClick={() => { setChannels([]); setCatalogError(''); setCatalogAttempt(value => value + 1) }}>Try again</button></div>
            : matchingChannels.length === 0 ? <div className="empty-state live-empty" role="status"><Search /><h3>No matching channels.</h3><p>Try another channel name or category.</p></div>
              : <div className="live-channel-groups" role="group" aria-label={`${matchingChannels.length} matching IPTV-org channel listings`}>
                {beforeSpacer > 0 && <div className="live-list-spacer" aria-hidden="true" style={{ height: beforeSpacer }} />}
                {visibleEntries.map((entry, index) => entry.kind === 'category'
                  ? <h3 className="live-channel-group-title" key={`category-${visibleStart + index}-${entry.category}`}>{entry.category}</h3>
                  : <button className={`live-channel-item${selectedId === entry.channel.id ? ' selected' : ''}`} type="button" aria-pressed={selectedId === entry.channel.id} key={entry.channel.id} onClick={() => setSelectedId(entry.channel.id)}>
                    <LiveChannelLogo channel={entry.channel} />
                    <strong>{entry.channel.name}</strong>
                    {(() => { const status = health[entry.channel.id]?.state ?? 'unchecked'; const label = liveHealthText(status); return <span className={`live-channel-dot is-${status}`} aria-label={`Status: ${label}`} title={health[entry.channel.id]?.message || label}><i aria-hidden="true" /></span> })()}
                  </button>)}
                {afterSpacer > 0 && <div className="live-list-spacer" aria-hidden="true" style={{ height: afterSpacer }} />}
              </div>}
      </div>
    </section>
  </div>
}

function AboutPage() {
  const description = 'AAK Movies is a movie and television discovery interface for searching titles, exploring categories, and reviewing available streaming-provider information.'
  usePageMeta('About & Credits | AAK Movies', description)
  return <div className="info-page about-page"><div className="info-symbol"><Clapperboard /></div><div className="section-kicker">ABOUT AAK MOVIES</div><h1>Discover what to watch.</h1><p>{description} Movie and series details come from TMDB, and provider availability is reported by JustWatch through TMDB. Playback depends on the configured provider and supported source. Continue Watching stores local progress from compatible native video sources.</p><section className="tmdb-credit" aria-labelledby="tmdb-credit-title"><a className="tmdb-logo-link" href="https://www.themoviedb.org" target="_blank" rel="noreferrer" aria-label="The Movie Database (TMDB), opens in a new tab"><img src="/images/tmdb-logo.svg" alt="The Movie Database (TMDB)" /></a><div><div className="section-kicker">DATA & IMAGE CREDITS</div><h2 id="tmdb-credit-title">TMDB</h2><p>Film and television metadata and images are provided by The Movie Database (TMDB).</p><p className="tmdb-required-notice">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="subtle-link">Visit TMDB <ExternalLink size={13} /></a></div></section><Link to="/discover" className="button button-outline">Explore movies & series <ArrowRight size={15} /></Link></div>
}

function Profile({ accent, lastCustomAccent, setAccent, player, onPlayerChange, authReady, session }: { accent: AccentValue; lastCustomAccent: string | null; setAccent: (value: AccentValue) => void; player: 'nxsha' | 'universal'; onPlayerChange: (value: 'nxsha' | 'universal') => void; authReady: boolean; session: Session | null }) {
  usePageMeta('Profile & Preferences | AAK Movies', 'Personalize the AAK Movies interface and view account preferences.')
  return <div className="page-wrap profile-page"><div className="page-intro"><div className="section-kicker">YOUR AAK MOVIES</div><h1>Make it <em>yours.</em></h1><p>Manage your account, playback source, and viewing preferences.</p></div><div className="profile-panel"><div className="profile-heading"><div className="profile-avatar"><UserRound size={21} /></div><div><h2>Profile and preferences</h2><p>Account access is provided by Supabase when configured.</p></div></div><div className="panel-divider" /><AccountAccessPanel authReady={authReady} session={session} /><div className="panel-divider" /><div className="profile-source-setting"><div className="section-kicker">SOURCE</div><h3>Preferred player</h3><PlayerChoices selected={player} onChange={onPlayerChange} compact /></div><div className="panel-divider" /><AccentSettings accent={accent} lastCustomAccent={lastCustomAccent} setAccent={setAccent} /><div className="panel-divider" /><div className="settings-list"><div><div className="setting-icon"><Heart size={17} /></div><div><strong>Continue Watching</strong><p>Progress from compatible native video sources is saved in this browser.</p><Link to="/#continue-watching" className="subtle-link">View progress <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><Settings size={17} /></div><div><strong>Discovery preferences</strong><p>Choose movies, series, genres, and the available provider filter.</p><Link to="/discover" className="subtle-link">Open Discover <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><ShieldCheck size={17} /></div><div><strong>Privacy and data</strong><p>Read about local browser storage and metadata sources.</p><Link to="/privacy" className="subtle-link">Read privacy policy <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><Download size={17} /></div><div><strong>Install AAK Movies</strong><p>Add the site to a supported device from the browser.</p><Link to="/install" className="subtle-link">Install options <ArrowRight size={13} /></Link></div></div><div><div className="setting-icon"><Info size={17} /></div><div><strong>About AAK Movies</strong><p>How discovery, availability, and playback are presented.</p><Link to="/about" className="subtle-link">About and credits <ArrowRight size={13} /></Link></div></div></div></div></div>
}

function AccentSettings({ accent, lastCustomAccent, setAccent, compact = false }: { accent: AccentValue; lastCustomAccent: string | null; setAccent: (value: AccentValue) => void; compact?: boolean }) {
  const currentColor = isHexAccent(accent) ? accent.toUpperCase() : defaultAccent
  const savedCustom = lastCustomAccent && isHexAccent(lastCustomAccent) && lastCustomAccent.toLowerCase() !== defaultAccent.toLowerCase() ? lastCustomAccent.toUpperCase() : null
  const [hexDraft, setHexDraft] = useState(currentColor)
  useEffect(() => setHexDraft(currentColor), [currentColor])
  const invalidHex = !isHexAccent(hexDraft)
  const updateHex = (value: string) => {
    setHexDraft(value)
    if (isHexAccent(value)) setAccent(value.toUpperCase() as AccentValue)
  }
  return <section className={`accent-settings ${compact ? 'accent-settings-compact' : ''}`} aria-labelledby={compact ? 'popup-accent-title' : 'accent-settings-title'}>
    <div><div className="section-kicker">APPEARANCE</div><h3 id={compact ? 'popup-accent-title' : 'accent-settings-title'}>Accent color</h3><p>Choose a color for interface highlights. Posters and provider artwork keep their original colors.</p></div>
    <div className="accent-choice-row"><button type="button" className={`accent-choice ${currentColor.toLowerCase() === defaultAccent.toLowerCase() ? 'selected' : ''}`} aria-pressed={currentColor.toLowerCase() === defaultAccent.toLowerCase()} onClick={() => setAccent(defaultAccent)}><span style={{ backgroundColor: defaultAccent }} aria-hidden="true" />Default · {defaultAccent}</button>{savedCustom && <button type="button" className={`accent-choice ${currentColor.toLowerCase() === savedCustom.toLowerCase() ? 'selected' : ''}`} aria-pressed={currentColor.toLowerCase() === savedCustom.toLowerCase()} onClick={() => setAccent(savedCustom as AccentValue)}><span style={{ backgroundColor: savedCustom }} aria-hidden="true" />Your custom color · {savedCustom}</button>}</div>
    <label className="accent-custom-picker"><span>Custom Color</span><span className="accent-custom-preview"><i style={{ backgroundColor: currentColor }} aria-hidden="true" /><code>{currentColor}</code></span><input type="color" value={currentColor} onChange={event => setAccent(event.target.value.toUpperCase() as `#${string}`)} aria-label="Choose a custom accent color" /></label>
    <label className="accent-hex-input"><span>Hex value</span><input type="text" inputMode="text" autoCapitalize="characters" spellCheck={false} value={hexDraft} onChange={event => updateHex(event.target.value)} onBlur={() => { if (invalidHex) setHexDraft(currentColor) }} aria-label="Accent color hexadecimal value" aria-invalid={invalidHex} aria-describedby={invalidHex ? 'accent-hex-error' : undefined} maxLength={7} placeholder="#42D9FF" /></label>
    {invalidHex && <p id="accent-hex-error" className="accent-hex-error" role="status">Enter a valid six-digit hex color, such as #42D9FF.</p>}
    <div className="accent-current-row"><p className="accent-current" role="status">Current accent: {accentLabel(accent)} · {currentColor}</p></div>
  </section>
}

function AccountAccessPanel({ authReady, session, compact = false }: { authReady: boolean; session: Session | null; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const redirectTo = `${window.location.origin}/auth/callback`

  const continueWithGoogle = async () => {
    if (!supabaseAuthClient) return
    setPending(true); setError(''); setMessage('')
    try {
      const { error: authError } = await supabaseAuthClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
      if (authError) setError(authError.message)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Google sign-in could not start.') }
    finally { setPending(false) }
  }
  const continueWithEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabaseAuthClient) return
    setPending(true); setError(''); setMessage('')
    try {
      const { error: authError } = await supabaseAuthClient.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } })
      if (authError) setError(authError.message)
      else setMessage('If this address can sign in, a secure sign-in link will arrive by email.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The email sign-in request could not be sent.') }
    finally { setPending(false) }
  }
  const signOut = async () => {
    if (!supabaseAuthClient) return
    setPending(true); setError(''); setMessage('')
    try {
      const { error: authError } = await supabaseAuthClient.auth.signOut()
      if (authError) setError(authError.message)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign out could not be completed.') }
    finally { setPending(false) }
  }

  return <section className={`account-access ${compact ? 'account-access-compact' : ''}`} aria-label="Account access">
    <div className="section-kicker">ACCOUNT</div>
    {!authReady ? <p role="status">Checking account session…</p> : !isSupabaseAuthConfigured ? <div className="auth-not-configured"><strong>Sign-in is not configured.</strong><p>Google and email access need a Supabase project with Auth providers enabled. See the setup steps in the README.</p></div> : session ? <div className="signed-in-account"><div className="signed-in-avatar"><UserRound size={18} /></div><div><strong>{typeof session.user.user_metadata?.full_name === 'string' ? session.user.user_metadata.full_name : 'Signed in'}</strong><p>{session.user.email || 'Email not provided by the account provider.'}</p></div><button className="button button-outline" type="button" onClick={() => void signOut()} disabled={pending}>{pending ? 'Working…' : 'Sign out'}</button></div> : <>
      <button className="button button-outline auth-google-button" type="button" onClick={() => void continueWithGoogle()} disabled={pending}><ExternalLink size={16} />{pending ? 'Connecting…' : 'Continue with Google'}</button>
      <form className="auth-email-form" onSubmit={event => void continueWithEmail(event)}><label htmlFor={compact ? 'popup-account-email' : 'profile-account-email'}>Continue with email</label><div><input id={compact ? 'popup-account-email' : 'profile-account-email'} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /><button className="button button-primary" type="submit" disabled={pending || !email.trim()}>{pending ? 'Sending…' : 'Send link'}</button></div></form>
      <p className="auth-help-text">A secure one-time link is sent by Supabase. AAK Movies never asks for or stores your password.</p>
    </>}
    {message && <p className="auth-message" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
  </section>
}

function AuthCallbackPage({ authReady, session }: { authReady: boolean; session: Session | null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const providerError = new URLSearchParams(location.search).get('error_description')
  usePageMeta('Completing sign-in | AAK Movies', 'Completing account authentication.')
  useEffect(() => { if (session) navigate('/profile', { replace: true }) }, [session, navigate])
  return <div className="info-page auth-callback-page"><div className="section-kicker">ACCOUNT ACCESS</div><h1>{providerError ? 'Sign-in could not be completed.' : 'Finishing sign-in.'}</h1><p role={providerError ? 'alert' : 'status'}>{providerError ? providerError : session ? 'Your account is ready.' : authReady ? 'No active session was returned. Return to preferences and try again.' : 'Verifying your account with the authentication provider…'}</p><Link to="/profile" className="button button-outline">Back to profile</Link></div>
}

function ProfilePopup({ accent, lastCustomAccent, setAccent, theme, setTheme, player, onPlayerChange, authReady, session, onClose }: { accent: AccentValue; lastCustomAccent: string | null; setAccent: (value: AccentValue) => void; theme: 'light' | 'night'; setTheme: (theme: 'light' | 'night') => void; player: 'nxsha' | 'universal'; onPlayerChange: (value: 'nxsha' | 'universal') => void; authReady: boolean; session: Session | null; onClose: () => void }) {
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
      <div className="profile-popup-group profile-source-group"><div className="profile-popup-group-label">SOURCE</div><PlayerChoices selected={player} onChange={onPlayerChange} compact /></div>
      <div className="profile-popup-group"><AccountAccessPanel authReady={authReady} session={session} compact /></div>
      <div className="profile-popup-group"><div className="profile-popup-group-label">PREFERENCES</div><button type="button" onClick={() => setTheme(theme === 'light' ? 'night' : 'light')}><Sun size={16} /><span>{theme === 'light' ? 'Switch to AMOLED night mode' : 'Switch to light theme'}</span>{theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}</button><AccentSettings accent={accent} lastCustomAccent={lastCustomAccent} setAccent={setAccent} compact /></div>
      <div className="profile-popup-group"><div className="profile-popup-group-label">YOUR LIBRARY</div><Link to="/#continue-watching" onClick={onClose}><Play size={16} /><span>Continue Watching</span><ArrowRight size={14} /></Link><Link to="/library" onClick={onClose}><Bookmark size={16} /><span>My List</span><ArrowRight size={14} /></Link></div>
      <div className="profile-popup-group"><div className="profile-popup-group-label">APP</div><Link to="/sources" onClick={onClose}><Settings size={16} /><span>Manifest registry</span><ArrowRight size={14} /></Link><Link to="/install" onClick={onClose}><Download size={16} /><span>Download / Install</span><ArrowRight size={14} /></Link><Link to="/about" onClick={onClose}><Info size={16} /><span>About AAK Movies</span><ArrowRight size={14} /></Link></div>
      <p className="profile-popup-footnote">Playback and appearance preferences are saved on this device. Watch progress is not cloud-synced.</p>
    </section>
  </div>, document.body)
}
function ProviderDirectory() {
  const availabilityRegion = 'BD'
  const [movies, setMovies] = useState<WatchProvider[]>([])
  const [tv, setTv] = useState<WatchProvider[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  usePageMeta('Streaming Providers | AAK Movies', 'Search the worldwide movie and television provider records returned by TMDB. Availability varies by title and country.')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    getGlobalWatchProviders().then(catalog => {
      if (active) { setMovies(catalog.movies); setTv(catalog.tv) }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Provider list unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const allProviders = mergeWatchProviders(movies, tv)
  const filtered = allProviders.filter(provider => provider.provider_name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <div className="page-wrap provider-directory"><div className="page-intro"><div className="section-kicker"><Tv size={14} /> TMDB PROVIDER DIRECTORY</div><h1>Find your <em>service.</em></h1><p>Search the worldwide provider records returned by TMDB, without a country filter. Availability varies by title and country.</p></div><div className="provider-directory-controls"><label className="search-field provider-directory-search" htmlFor="provider-directory-query"><Search size={19} aria-hidden="true" /><input id="provider-directory-query" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search providers by name" aria-label="Search providers by name" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear provider search"><X size={17} /></button>}</label></div>{loading ? <SkeletonGrid /> : error ? <div className="empty-state" role="alert"><Info /><h3>Provider directory unavailable</h3><p>{error}</p></div> : filtered.length ? <div className="provider-directory-grid" aria-live="polite">{filtered.map(item => <Link className="provider-directory-card" key={item.provider_id} to={'/discover?provider=' + item.provider_id + '&region=' + availabilityRegion}><ProviderLogo provider={item} size={54} alt="" /><span>{item.provider_name}</span><small>Discover available titles <ArrowRight size={13} /></small></Link>)}</div> : <div className="empty-state" role="status"><Info /><h3>{allProviders.length ? 'No providers match that name.' : 'No providers listed.'}</h3><p>{allProviders.length ? 'Try another provider name.' : 'TMDB has not returned any provider records for its supported dataset.'}</p></div>}<p className="provider-attribution">Availability data by <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">JustWatch</a> via TMDB. Provider listings are shown for discovery only.</p></div>
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

function DetailHeroArtwork({ artwork, videoKey, title, suspended, onRegisterToggle }: { artwork: string; videoKey?: string; title: string; suspended: boolean; onRegisterToggle: { current: () => void } }) {
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YouTubePlayer | null>(null)
  const suspendedRef = useRef(suspended)
  const statusRef = useRef<'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'blocked' | 'error'>(videoKey ? 'loading' : 'idle')
  const userPaused = useRef(false)
  const played = useRef(false)
  const wasPlayingBeforeSuspend = useRef(false)
  const toggleRef = useRef<() => void>(() => undefined)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'blocked' | 'error'>(videoKey ? 'loading' : 'idle')
  suspendedRef.current = suspended
  statusRef.current = status
  const setPhase = (next: typeof statusRef.current) => { statusRef.current = next; setStatus(next) }
  const hasTrailer = Boolean(videoKey && /^[\w-]{11}$/.test(videoKey))

  useEffect(() => {
    let cancelled = false
    let failed = false
    let instance: YouTubePlayer | null = null
    userPaused.current = false
    played.current = false
    setPhase(hasTrailer ? 'loading' : 'idle')
    if (!hasTrailer || !host.current) return

    const fail = (cause: unknown) => {
      if (cancelled || failed) return
      failed = true
      setPhase('error')
      const diagnostic = cause instanceof Error ? cause.message : typeof cause === 'object' && cause !== null && 'data' in cause ? cause.data : 'player-error'
      console.warn('[Detail trailer] Background trailer could not start.', { title, error: diagnostic })
      const current = instance
      if (player.current === current) player.current = null
      try { current?.destroy() } catch (cleanupCause) { console.warn('[Detail trailer] Background player cleanup failed.', cleanupCause) }
      host.current?.replaceChildren()
    }

    void loadYouTubeApi().then(api => {
      if (cancelled || !host.current) return
      try {
        const frame = document.createElement('iframe')
        frame.title = 'Background trailer for ' + title
        frame.tabIndex = -1
        frame.allow = 'autoplay; encrypted-media; picture-in-picture'
        frame.src = makeYouTubeEmbedUrl(videoKey!, { autoplay: true, muted: true, controls: false })
        host.current.replaceChildren(frame)
        instance = new api.Player(frame, {
          events: {
            onReady: ({ target }) => {
              if (cancelled || failed) return
              player.current = target
              target.getIframe().title = 'Background trailer for ' + title
              target.getIframe().tabIndex = -1
              target.mute()
              setPhase('ready')
              if (!suspendedRef.current && !userPaused.current) {
                setPhase('loading')
                target.playVideo()
              }
            },
            onStateChange: event => {
              if (cancelled || failed || player.current !== event.target) return
              if (event.data === api.PlayerState.PLAYING) {
                if (suspendedRef.current || userPaused.current) {
                  try { event.target.pauseVideo() } catch (cause) { console.warn('[Detail trailer] Could not pause the background trailer.', { title, cause }) }
                  setPhase('paused')
                  return
                }
                played.current = true
                setPhase('playing')
              } else if (event.data === api.PlayerState.BUFFERING) {
                if (userPaused.current) {
                  try { event.target.pauseVideo() } catch { /* The player can finish teardown between events. */ }
                  setPhase('paused')
                } else setPhase('loading')
              } else if (event.data === api.PlayerState.PAUSED || event.data === api.PlayerState.ENDED) {
                setPhase(played.current ? 'paused' : 'ready')
              } else if (event.data === api.PlayerState.CUED) {
                setPhase('ready')
              }
            },
            onError: cause => fail(cause ?? new Error('YouTube reported a background trailer error.')),
            onAutoplayBlocked: () => {
              if (cancelled || failed) return
              setPhase('blocked')
              console.info('[Detail trailer] Muted background autoplay was blocked.', { title })
            },
          },
        })
        player.current = instance
      } catch (cause) { fail(cause) }
    }).catch(fail)

    return () => {
      cancelled = true
      const current = instance
      if (player.current === current) player.current = null
      try { current?.destroy() } catch (cause) { console.warn('[Detail trailer] Background player cleanup failed.', { title, cause }) }
      host.current?.replaceChildren()
    }
  }, [videoKey, title])

  useEffect(() => {
    const current = player.current
    if (!current) return
    if (suspended) {
      wasPlayingBeforeSuspend.current = statusRef.current === 'playing' || statusRef.current === 'loading'
      try { current.pauseVideo() } catch (cause) { console.warn('[Detail trailer] Background pause failed.', { title, cause }) }
      setPhase('paused')
      return
    }
    if (wasPlayingBeforeSuspend.current) {
      wasPlayingBeforeSuspend.current = false
      if (!userPaused.current) {
        try { current.playVideo(); setPhase('loading') } catch (cause) { console.warn('[Detail trailer] Background resume failed.', { title, cause }) }
      }
    }
  }, [suspended, title, videoKey])

  toggleRef.current = () => {
    if (suspendedRef.current || !hasTrailer) return
    const currentStatus = statusRef.current
    if (currentStatus === 'playing' || currentStatus === 'loading') {
      userPaused.current = true
      try { player.current?.pauseVideo() } catch (cause) { console.warn('[Detail trailer] Background pause failed.', { title, cause }) }
      setPhase('paused')
      return
    }
    if (currentStatus === 'error' || currentStatus === 'idle') return
    userPaused.current = false
    try { player.current?.playVideo(); setPhase('loading') } catch (cause) { console.warn('[Detail trailer] Background resume failed.', { title, cause }) }
  }
  useEffect(() => {
    const registeredToggle = () => toggleRef.current()
    onRegisterToggle.current = registeredToggle
    return () => { if (onRegisterToggle.current === registeredToggle) onRegisterToggle.current = () => undefined }
  }, [onRegisterToggle, videoKey, title])

  return <div className={'detail-trailer-backdrop' + (status === 'playing' ? ' is-playing' : '')}>
    <div className="detail-backdrop-art" style={{ backgroundImage: 'url("' + artwork + '")' }} aria-hidden="true" />
    <div className="detail-youtube-host" ref={host} aria-hidden="true" />
    <div className="detail-backdrop-scrim" aria-hidden="true" />
  </div>
}

function DetailTrailerInline({ videoKey, title, open, onClose }: { videoKey?: string; title: string; open: boolean; onClose: () => void }) {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frame = window.requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [open])
  if (!open || !videoKey) return null
  return <section ref={root} className="detail-trailer-inline" aria-label={`${title} trailer`}>
    <div className="detail-trailer-close-row"><button type="button" className="detail-trailer-close-inline" onClick={onClose} aria-label="Close trailer">×</button></div>
    <div className="detail-trailer-inline-frame">
      <iframe
        className="detail-youtube-iframe-inline"
        title={`${title} trailer`}
        src={makeYouTubeEmbedUrl(videoKey, { autoplay: true, muted: true, controls: true })}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  </section>
}
function CastList({ members }: { members: CastMember[] }) { return <section className="cast-section"><div className="section-kicker">THE PEOPLE IN THE STORY</div><h3>Cast</h3><div className="cast-list">{members.map(member => <article className="cast-person" key={member.id}><div className="cast-photo">{member.profilePath ? <img src={`https://image.tmdb.org/t/p/w185${member.profilePath}`} alt={`${member.name}`} width="92" height="138" loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement?.classList.add('no-cast-photo') }} /> : <span aria-hidden="true">{member.name.slice(0, 1)}</span>}</div><strong>{member.name}</strong>{member.character && <small>{member.character}</small>}</article>)}</div></section> }
function Fact({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function PageState({ loading = false, error, onRetry }: { loading?: boolean; error?: string; onRetry?: () => void }) { return <div className="page-wrap"><div className="empty-state" role={error ? 'alert' : 'status'}>{loading ? <div className="loading-spinner" aria-label="Loading" /> : <Info />}<h3>{loading ? 'Loading title details…' : 'We couldn’t load this title.'}</h3>{error && <p>{error}</p>}{onRetry && <button className="button button-primary" onClick={onRetry}>Try again</button>}<Link className="button button-outline" to="/discover">Back to discover</Link></div></div> }
function InfoPage({ title, kicker, text }: { title: string; kicker: string; text: string }) { usePageMeta(`${kicker} | AAK Movies`, text); return <div className="info-page"><div className="info-symbol"><Clapperboard /></div><div className="section-kicker">{kicker}</div><h1>{title}</h1><p>{text}</p><Link to="/discover" className="button button-outline">Explore movies & series <ArrowRight size={15} /></Link></div> }
function Policy({ title, kicker, text }: { title: string; kicker: string; text: string }) { usePageMeta(`${title} | AAK Movies`, text); return <div className="page-wrap policy-page"><Link to="/" className="back-link"><ArrowLeft size={14} /> Back home</Link><div className="section-kicker">{kicker}</div><h1>{title}</h1><div className="policy-copy"><p>{text}</p><h3>Questions?</h3><p>Use the published AAK Movies contact address for questions about this policy.</p></div></div> }
function Footer() { return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><Link className="brand" to="/"><span className="brand-logo-plate"><img src="/images/aak-movies-logo.png" alt="" /></span><span>AAK Movies</span></Link><p>Movie and television discovery.</p></div><div className="footer-column"><span>EXPLORE</span><Link to="/discover">Discover</Link><Link to="/providers">Providers</Link><Link to="/install">Install app</Link><Link to="/live-tv">Live TV</Link><Link to="/library">My library</Link><Link to="/about">About</Link></div><div className="footer-column"><span>INFORMATION</span><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/copyright">Copyright & removal</Link><Link to="/sources">Manifest registry</Link></div></div><div className="footer-bottom"><span>© 2026 AAK Movies. All rights reserved.</span><span><Link to="/about">About &amp; credits</Link><span aria-hidden="true"> · </span><Link to="/admin">Admin</Link></span></div></footer> }

export default App
