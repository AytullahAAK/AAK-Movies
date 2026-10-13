import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownWideNarrow, ArrowLeft, ArrowRight, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Compass, ExternalLink, Film, Heart, House, Info, Instagram, Library, ListFilter, LockKeyhole, Magnet, Mail, Menu, MonitorPlay, Moon, Play, Search, Settings, ShieldCheck, Sparkles, Star, Sun, Tv, Twitter, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { animeTvCatalog, demoHero, genres, getMediaTrailerKey, getMovieDetails, getTvDetails, getTvSeason, mediaDate, mediaTypeLabel, mediaYear, movies, searchCatalog, trendingAllDay, type CastMember, type Media, type Movie, type MovieDetails, type TvDetails, type TvEpisode, type TvShow } from './data'
import { getExternalPlayerUrl, nxshaPlaybackSource, type PlaybackTarget } from './playback/sources'
import { UniversalPlayerPanel } from './playback/UniversalPlayerPanel'
import { builtInManifests, describeManifestResource, type StremioResource } from './playback/builtInManifests'

function mediaKey(item: Media) { return `${item.media_type}:${item.id}` }
function isSaved(saved: Media[], item: Media) { return saved.some(value => mediaKey(value) === mediaKey(item)) }

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'night'>(() => {
    const savedTheme = localStorage.getItem('aak-movies-theme')
    const initialTheme = savedTheme === 'light' || savedTheme === 'night' ? savedTheme : window.matchMedia('(max-width: 700px)').matches ? 'night' : 'light'
    document.documentElement.dataset.theme = initialTheme
    return initialTheme
  })
  const [saved, setSaved] = useState<Media[]>([])
  const [toast, setToast] = useState('')
  const location = useLocation()
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('aak-movies-theme', theme) }, [theme])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); setMenuOpen(false) }, [location.pathname])
  const toggleSaved = (item: Media) => { const exists = saved.some(value => mediaKey(value) === mediaKey(item)); setSaved(current => exists ? current.filter(value => mediaKey(value) !== mediaKey(item)) : [...current, item]); setToast(exists ? 'Removed from your library' : 'Added to your library'); window.setTimeout(() => setToast(''), 2300) }
  return <div className="app-shell">
    <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} theme={theme} setTheme={setTheme} />
    <main><Routes>
      <Route path="/" element={<Home saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/discover" element={<Discover saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/movie/:id" element={<MovieDetailsPage key={location.pathname} saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/tv/:id" element={<TvDetailsPage key={location.pathname} saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/tv/:id/season/:seasonNumber" element={<TvSeasonPage key={location.pathname} />} />
      <Route path="/watch/movie/:id" element={<MovieWatchPage key={location.pathname} />} />
      <Route path="/watch/tv/:id/:seasonNumber/:episodeNumber" element={<LegacyEpisodeRedirect />} />
      <Route path="/watch/:id" element={<MovieWatchPage key={location.pathname} />} />
      <Route path="/sources" element={<ManifestManager />} />
      <Route path="/library" element={<LibraryPage saved={saved} toggleSaved={toggleSaved} />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/about" element={<InfoPage title="A quieter kind of cinema." kicker="OUR STORY" text="AAK Movies is a home for the films and series that stay with you. We bring thoughtfully chosen stories together so discovering your next favorite feels like part of the experience." />} />
      <Route path="/contact" element={<InfoPage title="We’re all ears." kicker="CONTACT" text="Have a recommendation or question? Reach the AAK Movies team through your organization’s published contact address." />} />
      <Route path="/privacy" element={<Policy title="Privacy, in plain language." kicker="PRIVACY" text="This demo stores saved titles and manifest URLs in browser storage. TMDB searches and metadata requests are sent to TMDB. Never configure private credentials in a client bundle for production." />} />
      <Route path="/terms" element={<Policy title="A few ground rules." kicker="TERMS" text="AAK Movies is a discovery interface. Film and series metadata is supplied by TMDB. Viewing availability, licensing, and playback rights vary by territory and provider." />} />
      <Route path="/copyright" element={<Policy title="Content & copyright." kicker="RIGHTS & REMOVAL" text="AAK Movies does not host movie or television files. External playback is handled by providers. Rights holders should contact the AAK Movies operator with the title, rights documentation, and contact information." />} />
      <Route path="*" element={<InfoPage title="A scene missing from the reel." kicker="404" text="We couldn’t find that page. Return to the collection and find a new favorite." />} />
    </Routes></main>
    <BottomNavigation />
    <Footer />{toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>
}

function Header({ menuOpen, setMenuOpen, theme, setTheme }: { menuOpen: boolean; setMenuOpen: (open: boolean) => void; theme: 'light' | 'night'; setTheme: (theme: 'light' | 'night') => void }) {
  return <header className="site-header"><Link className="brand" to="/" aria-label="AAK Movies home"><span className="brand-logo-plate"><img src="/images/aak-movies-logo.png" alt="" /></span><span>AAK Movies</span></Link>
    <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation"><NavLink to="/discover"><Compass size={15} />Discover</NavLink><NavLink to="/library"><Library size={15} />My library</NavLink><NavLink to="/sources"><Settings size={15} />Sources</NavLink><NavLink to="/about" className="mobile-link">About</NavLink></nav>
    <div className="header-actions"><button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'night' : 'light')} aria-label={theme === 'light' ? 'Switch to AMOLED night mode' : 'Switch to light mode'} title={theme === 'light' ? 'Night mode' : 'Light mode'}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><Link to="/discover" className="header-search" aria-label="Search movies and TV shows"><Search size={17} /></Link><Link to="/profile" className="avatar" aria-label="Your profile">A</Link><button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>{menuOpen ? <X /> : <Menu />}</button></div>
  </header>
}

function BottomNavigation() {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const isDiscover = location.pathname === '/discover'
  const media = query.get('media') ?? 'movie'
  const genre = query.get('genre')
  const language = query.get('language')
  const collection = query.get('collection')
  const items = [
    { label: 'Home', to: '/', icon: House, active: location.pathname === '/' },
    { label: 'Search', to: '/discover', icon: Search, active: isDiscover && !genre && !language && media === 'movie' && !query.get('media') },
    { label: 'Movies', to: '/discover?media=movie', icon: Film, active: isDiscover && query.get('media') === 'movie' && !genre },
    { label: 'TV Shows', to: '/discover?media=tv', icon: Tv, active: isDiscover && media === 'tv' && !genre },
    { label: 'Anime', to: '/discover?media=tv&collection=anime&genre=Animation&language=Japanese', icon: Sparkles, active: isDiscover && media === 'tv' && collection === 'anime' },
    { label: 'Profile', to: '/profile', icon: UserRound, active: location.pathname === '/profile' },
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
  const [trending, setTrending] = useState<Media[]>(import.meta.env.DEV ? [demoHero] : [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [trailer, setTrailer] = useState<{ mediaKey: string; key: string } | null>(null)
  const [muted, setMuted] = useState(true)
  const [heroVisible, setHeroVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  const heroRef = useRef<HTMLElement>(null)
  const previewFrame = useRef<HTMLIFrameElement>(null)
  usePageMeta('AAK Movies — Discover Movies & TV Series', 'Explore trending movies and television series on AAK Movies.')
  useEffect(() => { let active = true; trendingAllDay().then(items => { if (active) setTrending(items) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Catalog unavailable.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  const featured = trending.length ? trending.slice(0, 4) : import.meta.env.DEV ? [demoHero] : []
  const currentIndex = featured.length ? activeIndex % featured.length : 0
  const activeItem = featured[currentIndex]
  const activeKey = activeItem ? mediaKey(activeItem) : ''
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
    setMuted(true)
    if (!activeItem || !heroVisible || !pageVisible) return
    let current = true
    const timer = window.setTimeout(() => {
      getMediaTrailerKey(activeItem).then(key => { if (current && key) setTrailer({ mediaKey: activeKey, key }) }).catch(() => { /* Keep the artwork when TMDB has no reachable trailer. */ })
    }, 2000)
    return () => { current = false; window.clearTimeout(timer) }
  }, [activeItem, activeKey, heroVisible, pageVisible])
  const goToFeatured = (direction: number) => { if (featured.length) setActiveIndex((currentIndex + direction + featured.length) % featured.length) }
  if (!activeItem) return <>
    <section ref={heroRef} className="hero hero-empty" aria-label="Featured titles">
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-content"><div className="eyebrow"><Sparkles size={13} /> AAK MOVIES</div><h1>{loading ? 'Loading today’s titles.' : 'Today’s titles are unavailable.'}</h1><p role={error ? 'alert' : 'status'}>{loading ? 'Loading titles…' : error}</p><Link className="button button-quiet" to="/discover">Explore titles <ArrowRight size={15} /></Link></div>
    </section>
    <section className="content-section">{loading && <SkeletonRow title="Trending today" />}{error && <div className="empty-state" role="alert"><Info /><h3>We couldn’t load the catalog</h3><p>{error}</p><Link className="button button-outline" to="/discover">Try search</Link></div>}</section>
  </>
  const isMovie = activeItem.media_type === 'movie'
  const titlePath = isMovie ? `/movie/${activeItem.id}` : `/tv/${activeItem.id}`
  const watchPath = isMovie ? `/watch/movie/${activeItem.id}` : titlePath
  const previewKey = trailer?.mediaKey === activeKey ? trailer.key : null
  const toggleMute = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    previewFrame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: nextMuted ? 'mute' : 'unMute', args: [] }), 'https://www.youtube-nocookie.com')
  }
  const trendingMovies = trending.filter((item): item is Movie => item.media_type === 'movie')
  const trendingShows = trending.filter((item): item is TvShow => item.media_type === 'tv')
  return <><section ref={heroRef} className="hero" aria-label="Featured titles">
    <div className="hero-ambient" style={{ backgroundImage: `url('${activeItem.backdrop}')` }} aria-hidden="true" />
    <div key={activeKey} className="hero-artwork" style={{ backgroundImage: `url('${activeItem.backdrop}')` }} aria-hidden="true" />
    {previewKey && heroVisible && pageVisible && <div className="hero-preview-layer" aria-hidden="true"><iframe ref={previewFrame} title="Muted featured trailer preview" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(previewKey)}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture" tabIndex={-1} /></div>}
    <div className="hero-scrim" aria-hidden="true" />
    <div className="hero-content"><div className="eyebrow"><Sparkles size={13} /> {isMovie ? 'FEATURED FILM' : 'FEATURED SERIES'}</div><h1 aria-live="polite">{activeItem.title}</h1><div className="hero-meta">{mediaYear(activeItem) && <><span>{mediaYear(activeItem)}</span><i /></>}<span>{mediaTypeLabel(activeItem)}</span><i /><span>{activeItem.genre}</span>{activeItem.vote_average !== undefined && <><i /><span className="rated"><Star size={12} fill="currentColor" /> {activeItem.vote_average.toFixed(1)}</span></>}</div><p>{activeItem.overview || 'Discover the story and details.'}</p><div className="hero-actions"><Link className="button button-primary" to={watchPath}>{isMovie ? <><Play size={17} fill="currentColor" /> Watch now</> : <>Explore series <ArrowRight size={15} /></>}</Link><Link className="button button-quiet" to={titlePath}><Info size={17} /> More details <ArrowRight size={15} /></Link></div><div className="hero-caption"><span className="caption-line" /> AAK MOVIES COLLECTION</div></div>
    <div className="hero-controls"><div className="hero-step-controls"><button className="circle-control" onClick={() => goToFeatured(-1)} aria-label="Previous featured title"><ChevronLeft size={17} /></button><button className="circle-control" onClick={() => goToFeatured(1)} aria-label="Next featured title"><ChevronRight size={17} /></button></div>{previewKey && <button className="hero-mute" onClick={toggleMute} aria-label={muted ? 'Unmute trailer preview' : 'Mute trailer preview'} title={muted ? 'Unmute preview' : 'Mute preview'}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}<span>{muted ? 'Muted' : 'Sound on'}</span></button>}<div className="hero-index" aria-label={`Featured title ${currentIndex + 1} of ${featured.length}`}><span>{String(currentIndex + 1).padStart(2, '0')}</span><div /><span>{String(featured.length).padStart(2, '0')}</span></div></div>
  </section>
  <section className="content-section"><div className="section-heading"><div><div className="section-kicker">HANDPICKED FOR YOU</div><h2>Stories worth staying in for<span>.</span></h2></div><Link className="text-link" to="/discover">Explore all titles <ArrowRight size={15} /></Link></div><div className="genre-chips">{['All films', 'Drama', 'Sci-Fi', 'Thriller', 'Adventure', 'Documentary'].map((genre, index) => <Link className={index === 0 ? 'genre-chip selected' : 'genre-chip'} to={`/discover?genre=${encodeURIComponent(genre)}`} key={genre}>{genre}</Link>)}</div>
    {error && <p className="catalog-error" role="status">{error}</p>}{loading && <SkeletonRow title="Trending today" />}<MediaRow title="Trending movies today" kicker="TMDB TRENDING · DAY" items={trendingMovies.slice(0, 8)} saved={saved} toggleSaved={toggleSaved} />{trendingShows.length > 0 && <MediaRow title="Trending TV series today" kicker="TMDB TRENDING · DAY" items={trendingShows.slice(0, 8)} saved={saved} toggleSaved={toggleSaved} />}</section>
     <section className="collection-banner" style={{ backgroundImage: `linear-gradient(90deg, rgba(18,20,24,.92), rgba(18,20,24,.54)),url('${trending[3]?.backdrop ?? trending[0]?.backdrop ?? ''}')` }}><div><div className="section-kicker">THE AAK MOVIES COLLECTION</div><h2>The edge of<br />the unknown.</h2><p>For nights when you want to get lost in another world.</p><Link to="/discover?media=all" className="button button-outline">Explore movies & series <ArrowRight size={15} /></Link></div><div className="collection-orb">A<span>AK</span></div></section>
   <div className="content-section compact-section"><MediaRow title="More movies to discover" kicker="TRENDING MOVIES" items={trendingMovies.slice(3, 8)} saved={saved} toggleSaved={toggleSaved} /></div></>
}

function Discover({ saved, toggleSaved }: { saved: Media[]; toggleSaved: (item: Media) => void }) {
  const location = useLocation(); const navigate = useNavigate()
  const initial = new URLSearchParams(location.search).get('media')
  const animeMode = new URLSearchParams(location.search).get('collection') === 'anime'
  const [mediaFilter, setMediaFilter] = useState<'movie' | 'tv' | 'all'>(initial === 'tv' || initial === 'all' ? initial : 'movie')
  const [query, setQuery] = useState(''); const [selectedGenre, setSelectedGenre] = useState('All films'); const [year, setYear] = useState('Any year'); const [language, setLanguage] = useState(new URLSearchParams(location.search).get('language') ?? 'Any language'); const [sort, setSort] = useState('Popular'); const [results, setResults] = useState<Media[]>(import.meta.env.DEV ? movies : []); const [error, setError] = useState(''); const [loading, setLoading] = useState(!import.meta.env.DEV)
  usePageMeta(`${animeMode ? 'Anime' : mediaFilter === 'tv' ? 'TV Shows' : mediaFilter === 'all' ? 'Movies & TV Shows' : 'Movies'} — Discover | AAK Movies`, 'Search and filter movies and TV series by title, genre, year, or language.')
  useEffect(() => { const params = new URLSearchParams(location.search); setSelectedGenre(params.get('genre') ?? 'All films'); setLanguage(params.get('language') ?? 'Any language'); const media = params.get('media'); setMediaFilter(media === 'tv' || media === 'all' ? media : 'movie') }, [location.search])
  useEffect(() => { let active = true; setLoading(true); setError(''); const timer = window.setTimeout(() => { (animeMode ? animeTvCatalog() : searchCatalog(query, mediaFilter)).then(data => { if (active) setResults(data) }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Catalog unavailable.') }).finally(() => { if (active) setLoading(false) }) }, animeMode ? 0 : 250); return () => { active = false; clearTimeout(timer) } }, [query, mediaFilter, animeMode])
  const filtered = useMemo(() => { let list = results.filter(item => (!animeMode || item.media_type === 'tv') && (!animeMode || !query.trim() || item.title.toLowerCase().includes(query.trim().toLowerCase())) && (selectedGenre === 'All films' || item.genre.toLowerCase() === selectedGenre.toLowerCase()) && (year === 'Any year' || mediaYear(item) === year) && (language === 'Any language' || item.language === language)); if (sort === 'Top rated') list = [...list].sort((a, b) => (b.vote_average ?? -1) - (a.vote_average ?? -1)); if (sort === 'Newest') list = [...list].sort((a, b) => mediaDate(b)?.localeCompare(mediaDate(a) ?? '') ?? 0); return list }, [results, selectedGenre, year, language, sort, animeMode, query])
  const chooseMedia = (value: 'movie' | 'tv' | 'all') => { setMediaFilter(value); setSelectedGenre('All films'); setLanguage('Any language'); navigate(value === 'movie' ? '/discover' : `/discover?media=${value}`, { replace: true }) }
  return <div className="page-wrap"><div className="page-intro"><div className="section-kicker">A WORLD OF STORIES</div><h1>Find your next<br /><em>favorite.</em></h1><p>A thoughtfully gathered collection of movies and series for wherever your curiosity takes you.</p></div>
    <div className="media-switch" role="group" aria-label="Choose content type">{(['movie', 'tv', 'all'] as const).map(value => <button key={value} className={mediaFilter === value ? 'active' : ''} aria-pressed={mediaFilter === value} onClick={() => chooseMedia(value)}>{value === 'movie' ? 'Movies' : value === 'tv' ? 'TV Shows' : 'All'}</button>)}</div>
    <div className="discover-tools"><label className="search-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${animeMode ? 'anime' : mediaFilter === 'movie' ? 'movies' : mediaFilter === 'tv' ? 'TV shows' : 'movies and TV shows'}…`} aria-label={animeMode ? 'Search anime' : 'Search movies and TV shows'} />{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}</label><div className="filter-row"><div className="genre-filter">{genres.map(item => <button key={item} className={selectedGenre === item ? 'filter-chip active' : 'filter-chip'} onClick={() => { setSelectedGenre(item); navigate(item === 'All films' ? '/discover' : `/discover?genre=${encodeURIComponent(item)}&media=${mediaFilter}`, { replace: true }) }}>{item}</button>)}</div><div className="select-filters"><label><ListFilter size={14} /><select value={year} onChange={e => setYear(e.target.value)} aria-label="Filter by year"><option>Any year</option>{['2026', '2025', '2024', '2023', '2022', '2021'].map(v => <option key={v}>{v}</option>)}</select><ChevronDown size={13} /></label><label><ListFilter size={14} /><select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Filter by language"><option>Any language</option>{['English', 'Japanese', 'Korean', 'French', 'Spanish', 'Hindi'].map(v => <option key={v}>{v}</option>)}</select><ChevronDown size={13} /></label><label><ArrowDownWideNarrow size={14} /><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort results"><option>Popular</option><option>Top rated</option><option>Newest</option></select><ChevronDown size={13} /></label></div></div></div>
     <div className="results-head"><span>{loading ? 'Finding titles…' : `${filtered.length} ${filtered.length === 1 ? 'title' : 'titles'} to explore`}</span><span>COLLECTED WITH CARE</span></div>{error ? <div className="empty-state" role="alert"><Info /><h3>We couldn’t load the catalog</h3><p>{error}</p><button className="button button-outline" onClick={() => setQuery(`${query} `)}>Try again</button></div> : loading ? <SkeletonGrid /> : filtered.length ? <div className="discover-grid">{filtered.map(item => <MediaCard item={item} saved={isSaved(saved, item)} toggleSaved={toggleSaved} key={`${item.media_type}-${item.id}`} />)}</div> : <div className="empty-state"><Search /><h3>No titles found in this frame.</h3><p>Try another title or loosen your filters.</p><button className="button button-outline" onClick={() => { setQuery(''); setSelectedGenre('All films'); setYear('Any year'); setLanguage('Any language') }}>Clear filters</button></div>}</div>
}

function MediaRow({ title, kicker, items, saved, toggleSaved }: { title: string; kicker: string; items: Media[]; saved: Media[]; toggleSaved: (item: Media) => void }) {
  const [offset, setOffset] = useState(0); const ordered = items.length ? [...items.slice(offset), ...items.slice(0, offset)] : []
  if (!items.length) return null
  return <section className="movie-row"><div className="row-heading"><div><div className="section-kicker">{kicker}</div><h3>{title}</h3></div><div className="row-controls"><Link to="/discover?media=all" className="subtle-link">View all <ArrowRight size={14} /></Link><button className="circle-control" onClick={() => setOffset((offset + 1) % items.length)} aria-label={`Show more ${title}`}><ArrowRight size={15} /></button></div></div><div className="poster-grid">{ordered.slice(0, 8).map(item => <MediaCard key={`${item.media_type}-${item.id}`} item={item} saved={isSaved(saved, item)} toggleSaved={toggleSaved} />)}</div></section>
}
function MediaCard({ item, saved, toggleSaved }: { item: Media; saved: boolean; toggleSaved: (item: Media) => void }) {
  const path = item.media_type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`
  return <article className="movie-card"><Link to={path} className="poster-link" aria-label={`View ${item.title}, ${mediaTypeLabel(item)}`}><div className="poster-wrap"><img src={item.poster} alt={`${item.title} poster`} loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('image-fallback') }} /><span className="poster-play"><Play size={18} fill="currentColor" /></span>{item.vote_average !== undefined && <span className="poster-rating"><Star size={11} fill="currentColor" />{item.vote_average.toFixed(1)}</span>}<span className="media-badge">{item.media_type === 'movie' ? 'FILM' : 'SERIES'}</span></div></Link><button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={() => toggleSaved(item)} aria-label={saved ? `Remove ${item.title} from library` : `Save ${item.title}`}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} /></button><div className="poster-info"><Link to={path} className="poster-title">{item.title}</Link><span>{mediaYear(item) || 'Year unavailable'}<i />{item.genre}</span></div></article>
}
function SkeletonGrid() { return <div className="discover-grid" aria-label="Loading titles">{Array.from({ length: 8 }).map((_, i) => <div className="skeleton-card" key={i}><div className="skeleton-poster" /><div className="skeleton-line" /><div className="skeleton-short" /></div>)}</div> }
function SkeletonRow({ title }: { title: string }) { return <section className="movie-row" aria-label={`Loading ${title}`}><div className="row-heading"><h3>{title}</h3></div><SkeletonGrid /></section> }

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
  const { id } = useParams(); const numericId = Number(id); const location = useLocation(); const navigate = useNavigate(); const [show, setShow] = useState<TvDetails | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [episodes, setEpisodes] = useState<TvEpisode[]>([]); const [seasonLoading, setSeasonLoading] = useState(false); const [seasonError, setSeasonError] = useState(''); const [seasonNo, setSeasonNo] = useState<number | null>(null); const [episodeNo, setEpisodeNo] = useState<number | null>(null); const [player, setPlayer] = useState<'nxsha' | 'universal'>('nxsha'); const requestedEpisode = useRef<number | undefined>(undefined)
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
  return <><section className="detail-hero"><DetailTrailerBackdrop artwork={show.backdrop} title={show.title} videoKey={show.trailerKey} /><div className="detail-content"><Link to="/discover?media=tv" className="back-link"><ArrowLeft size={14} /> Back to TV shows</Link><div className="section-kicker">AAK MOVIES FEATURE · TV SERIES</div><h1>{show.title}</h1><div className="hero-meta">{year && <span>{year}</span>}<i /><span>{show.number_of_seasons === undefined ? 'Seasons unavailable' : `${show.number_of_seasons} ${show.number_of_seasons === 1 ? 'season' : 'seasons'}`}</span><i /><span>{show.number_of_episodes === undefined ? 'Episodes unavailable' : `${show.number_of_episodes} episodes`}</span>{show.vote_average !== undefined && <><i /><span className="rated"><Star size={13} fill="currentColor" /> {show.vote_average.toFixed(1)}</span></>}</div><p>{show.overview || 'No synopsis is available from TMDB.'}</p><div className="hero-actions"><button className="button button-quiet" onClick={() => toggleSaved(show)}>{isSaved(saved, show) ? <Check size={17} /> : <Bookmark size={17} />}{isSaved(saved, show) ? 'In your library' : 'Add to library'}</button></div></div><img className="detail-poster" src={show.poster} alt={`${show.title} poster`} /></section><div className="detail-body"><div className="detail-facts"><Fact label="FIRST AIRED" value={year || 'Not listed'} /><Fact label="SEASONS" value={show.number_of_seasons?.toString() ?? 'Not listed'} /><Fact label="EPISODES" value={show.number_of_episodes?.toString() ?? 'Not listed'} /><Fact label="GENRE" value={show.genre} /></div>{show.cast.length > 0 && <CastList members={show.cast} />}<section className="season-list inline-episode-guide"><div className="section-kicker">EPISODE GUIDE</div><h3>Choose a season and episode</h3><label className="inline-season-select">Season<select value={selectedSeason?.season_number ?? ''} onChange={event => selectSeason(Number(event.target.value))} aria-label="Choose a season" disabled={!availableSeasons.length}>{availableSeasons.map(season => <option key={season.id} value={season.season_number}>{season.name || `Season ${season.season_number}`}</option>)}</select></label>{seasonError && <p className="form-error" role="alert">{seasonError}</p>}{seasonLoading ? <p className="season-status" role="status">Loading episodes…</p> : episodes.length ? <div className="inline-episode-layout"><div className="episode-list" aria-label="Episodes">{episodes.map(item => <button className={`inline-episode-card ${episode?.id === item.id ? 'selected' : ''}`} key={item.id} type="button" aria-pressed={episode?.id === item.id} onClick={() => selectEpisode(item.episode_number)}><span className="episode-number">{String(item.episode_number).padStart(2, '0')}</span><span className="episode-copy"><strong>{item.name || `Episode ${item.episode_number}`}</strong><small>{item.air_date || 'Air date not listed'}{item.runtime ? ` · ${item.runtime} min` : ''}</small></span><Play size={15} aria-hidden="true" /></button>)}</div><div className="inline-tv-playback">{episode && <div className="selected-episode"><div className="section-kicker">SEASON {episode.season_number} · EPISODE {episode.episode_number}</div><h4>{episode.name || `Episode ${episode.episode_number}`}</h4><p>{episode.overview || 'No episode synopsis is available from TMDB.'}</p></div>}<PlayerChoices selected={player} onChange={setPlayer} />{player === 'nxsha' && nxshaUrl ? <ExternalIframePlayer key={nxshaUrl} title={`Default player for ${show.title}, season ${selectedSeason?.season_number}, episode ${episode?.episode_number}`} src={nxshaUrl} /> : player === 'universal' && episode && selectedSeason ? <UniversalPlayerPanel contextLabel={`${show.title} S${selectedSeason.season_number}E${episode.episode_number}`} mediaContext={{ media_type: 'tv', tmdbId: show.id, title: show.title, seasonNumber: selectedSeason.season_number, episodeNumber: episode.episode_number }} /> : <p className="season-status" role="status">Choose an episode to view playback options.</p>}<nav className="episode-neighbors" aria-label="Episode navigation">{previous ? <button className="button button-outline" type="button" onClick={() => selectEpisode(previous.episode_number)}><ArrowLeft size={14} /> Previous · E{previous.episode_number}</button> : <span />}{next ? <button className="button button-outline" type="button" onClick={() => selectEpisode(next.episode_number)}>Next · E{next.episode_number} <ArrowRight size={14} /></button> : <span />}</nav></div></div> : !seasonError && <p className="season-status" role="status">TMDB has not listed episodes for this season.</p>}</section><MediaRow title="Recommended TV series" kicker="MORE SERIES TO DISCOVER" items={show.recommendations} saved={saved} toggleSaved={toggleSaved} /></div></>
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
  const numericId = Number(id)
  const [movie, setMovie] = useState<Movie | null>(movies.find(item => item.id === numericId) ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [player, setPlayer] = useState<'nxsha' | 'universal'>('nxsha')
  const target: PlaybackTarget | null = movie ? { media_type: 'movie', id: movie.id } : null
  const url = target ? getExternalPlayerUrl(nxshaPlaybackSource, target) : null
  usePageMeta(movie ? `Watch ${movie.title} | AAK Movies` : 'Movie player | AAK Movies', 'Movie playback choices on AAK Movies.')
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setPlayer('nxsha')
    if (!Number.isSafeInteger(numericId) || numericId <= 0) { setError('This movie ID is invalid.'); setLoading(false); return () => { active = false } }
    getMovieDetails(numericId).then(data => { if (active) setMovie(data) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Movie unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [numericId, attempt])
  if (loading) return <PageState loading />
  if (error || !movie || !url) return <PageState error={error || 'A playback source is not configured for this movie.'} onRetry={() => setAttempt(value => value + 1)} />
  return <div className="watch-page"><div className="watch-top"><Link to={`/movie/${movie.id}`} className="back-link"><ArrowLeft size={14} /> Back to {movie.title}</Link><span className="watch-title">MOVIE PLAYER <i /> {movie.title}</span></div><PlayerChoices selected={player} onChange={setPlayer} /><div className="watch-player-content">{player === 'nxsha' ? <ExternalIframePlayer key={url} title={`${nxshaPlaybackSource.name} player for ${movie.title}`} src={url} /> : <UniversalPlayerPanel contextLabel={movie.title} mediaContext={{ media_type: 'movie', tmdbId: movie.id, title: movie.title }} />}</div><div className="watch-information"><div><div className="section-kicker">MOVIE</div><h1>{movie.title}</h1><p>{mediaYear(movie)} <i /> {movie.runtime ?? 'Runtime unavailable'}</p></div><Link className="button button-quiet" to={`/movie/${movie.id}`}>Movie details <ArrowRight size={15} /></Link></div></div>
}

function PlayerChoices({ selected, onChange }: { selected: 'nxsha' | 'universal'; onChange: (value: 'nxsha' | 'universal') => void }) {
  return <div className="player-choices" role="group" aria-label="Choose a player">
    <button type="button" className={selected === 'nxsha' ? 'selected' : ''} aria-pressed={selected === 'nxsha'} onClick={() => onChange('nxsha')}><MonitorPlay size={17} /><span>Default</span><small>Nxsha</small></button>
    <button type="button" className={selected === 'universal' ? 'selected' : ''} aria-pressed={selected === 'universal'} onClick={() => onChange('universal')}><Magnet size={17} /><span>Torrent</span><small>Addon sources</small></button>
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
    <div className="player-note"><span>{nxshaPlaybackSource.name} Player</span><div><button type="button" onClick={() => setAttempt(value => value + 1)}>Reload</button><a href={src} target="_blank" rel="noreferrer">Open player</a></div></div>
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
function Profile() { usePageMeta('Profile & Preferences | AAK Movies', 'Profile and viewing preferences for AAK Movies.'); return <div className="page-wrap profile-page"><div className="page-intro"><div className="section-kicker">YOUR AAK MOVIES</div><h1>Make it <em>yours.</em></h1><p>A personal space for saved films and viewing settings.</p></div><div className="profile-panel"><div className="profile-heading"><div className="profile-avatar">A</div><div><h2>Welcome to AAK Movies</h2><p>Account sign-in is not connected in this demo.</p></div></div><div className="panel-divider" /><div className="settings-list"><div><div className="setting-icon"><Heart size={17} /></div><div><strong>Personal recommendations</strong><p>Available when account support is connected.</p></div></div><div><div className="setting-icon"><Settings size={17} /></div><div><strong>Viewing preferences</strong><p>Language and subtitle preferences are not stored yet.</p></div></div><div><div className="setting-icon"><ShieldCheck size={17} /></div><div><strong>Privacy & data</strong><p>Understand how your data is handled.</p></div><Link to="/privacy" className="subtle-link">Read policy <ArrowRight size={13} /></Link></div></div></div></div> }
function Admin() { usePageMeta('Admin Dashboard | AAK Movies', 'Administration shell for AAK Movies. Protected server-side admin access is not configured.'); return <div className="page-wrap admin-page"><div className="page-intro"><div className="section-kicker"><ShieldCheck size={13} /> ADMINISTRATION</div><h1>Curate with <em>care.</em></h1><p>Manage permitted metadata and provider references.</p></div><div className="admin-alert"><LockKeyhole size={18} /><div><strong>Admin access is not configured.</strong><p>This is a dashboard shell. Add server-verified roles before enabling writes.</p></div></div><div className="admin-table"><div className="table-heading"><div><div className="section-kicker">CONTENT MANAGEMENT</div><h3>Playback source registry</h3></div><Link to="/sources" className="button button-outline">Open manifest registry</Link></div><p className="admin-footnote">Nxsha has explicit movie and TV episode URL mappings. Provider permission, supported IDs, and playback remain unverified.</p></div></div> }

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
function Footer() { return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><Link className="brand" to="/"><span className="brand-logo-plate"><img src="/images/aak-movies-logo.png" alt="" /></span><span>AAK Movies</span></Link><p>Cinema, considered.</p><div className="social-links"><a href="https://instagram.com" aria-label="Instagram"><Instagram size={16} /></a><a href="https://twitter.com" aria-label="Twitter"><Twitter size={16} /></a><a href="mailto:contact@example.org" aria-label="Contact by email"><Mail size={16} /></a></div></div><div className="footer-column"><span>EXPLORE</span><Link to="/discover">Discover</Link><Link to="/library">My library</Link><Link to="/about">Our story</Link></div><div className="footer-column"><span>INFORMATION</span><Link to="/contact">Contact</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/copyright">Copyright & removal</Link><Link to="/sources">Manifest registry</Link></div><div className="footer-note"><span>MADE FOR FILM LOVERS</span><p>A little more intention.<br />A lot more imagination.</p><span className="footer-spark">✳</span></div></div><div className="footer-bottom"><span>© 2026 AAK Movies. All rights reserved.</span><span>Film and TV information provided by <strong>TMDB</strong>. This product uses the TMDB API but is not endorsed or certified by TMDB.</span><Link to="/admin">Admin</Link></div></footer> }

export default App
