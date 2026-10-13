export type MediaType = 'movie' | 'tv'
export type CatalogSort = 'trending' | 'popular' | 'top_rated' | 'newest'
export type WatchProvider = { provider_id: number; provider_name: string; logo_path: string; display_priority: number }
export type WatchMonetization = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy'
export type ProviderRegion = { code: string; label: string }
export const providerRegions: ProviderRegion[] = [
  { code: 'BD', label: 'Bangladesh' }, { code: 'US', label: 'United States' }, { code: 'GB', label: 'United Kingdom' },
  { code: 'IN', label: 'India' }, { code: 'CA', label: 'Canada' }, { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' }, { code: 'FR', label: 'France' }, { code: 'JP', label: 'Japan' },
]
export type Media = {
  id: number
  media_type: MediaType
  title: string
  original_title?: string
  release_date?: string
  first_air_date?: string
  poster: string
  backdrop: string
  overview: string
  vote_average?: number
  genre: string
  genre_ids?: number[]
  runtime?: string
  language: string
  number_of_seasons?: number
  number_of_episodes?: number
}
export type Movie = Media & { media_type: 'movie'; release_date?: string }
export type TvShow = Media & { media_type: 'tv'; first_air_date?: string; number_of_seasons?: number; number_of_episodes?: number }
export type TvSeason = { id: number; name: string; season_number: number; episode_count: number; overview: string; poster_path: string | null; air_date: string | null }
export type TvEpisode = { id: number; name: string; episode_number: number; season_number: number; overview: string; still_path: string | null; air_date: string | null; runtime: number | null }
export type CastMember = { id: number; name: string; character: string; profilePath: string | null }
export type MovieDetails = Movie & { runtimeMinutes?: number; cast: CastMember[]; trailerKey?: string; recommendations: Movie[] }
export type TvDetails = TvShow & { seasons: TvSeason[]; cast: CastMember[]; trailerKey?: string; recommendations: TvShow[] }

const photos = {
  dune: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1800&q=85',
  city: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=82',
  sea: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=900&q=82',
  mountain: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=82',
  portrait: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=82',
  desert: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=900&q=82',
  forest: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=82',
  road: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=82',
}

// Local-only artwork/title examples. No demo ratings are fabricated or displayed.
export const movies: Movie[] = [
  { id: 693134, media_type: 'movie', title: 'Dune: Part Two', release_date: '2024-03-01', poster: photos.dune, backdrop: photos.dune, overview: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.', genre: 'Sci-Fi', runtime: '2h 46m', language: 'English' },
  { id: 872585, media_type: 'movie', title: 'Oppenheimer', release_date: '2023-07-21', poster: photos.city, backdrop: photos.city, overview: 'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb.', genre: 'Drama', runtime: '3h 00m', language: 'English' },
  { id: 1022789, media_type: 'movie', title: 'Inside Out 2', release_date: '2024-06-14', poster: photos.sea, backdrop: photos.sea, overview: 'A new emotion joins Riley’s mind as she enters her teenage years.', genre: 'Animation', runtime: '1h 36m', language: 'English' },
  { id: 786892, media_type: 'movie', title: 'Furiosa: A Mad Max Saga', release_date: '2024-05-24', poster: photos.desert, backdrop: photos.desert, overview: 'The origin story of renegade warrior Furiosa.', genre: 'Action', runtime: '2h 29m', language: 'English' },
  { id: 1011985, media_type: 'movie', title: 'Kung Fu Panda 4', release_date: '2024-03-08', poster: photos.mountain, backdrop: photos.mountain, overview: 'Po must train a new warrior when he is chosen to become the spiritual leader of the Valley of Peace.', genre: 'Animation', runtime: '1h 34m', language: 'English' },
  { id: 967847, media_type: 'movie', title: 'Ghostlight', release_date: '2024-06-14', poster: photos.forest, backdrop: photos.forest, overview: 'A construction worker unexpectedly joins a local theatre group and finds connection in an unlikely place.', genre: 'Drama', runtime: '1h 55m', language: 'English' },
  { id: 1139829, media_type: 'movie', title: 'The Long Game', release_date: '2024-04-12', poster: photos.road, backdrop: photos.road, overview: 'In 1950s Texas, a group of Mexican American teenagers build a golf course and a future of their own.', genre: 'Drama', runtime: '1h 52m', language: 'English' },
]
export const hero = { ...movies[0], eyebrow: 'THE FILM EVENT OF THE YEAR', backdrop: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=2200&q=90' }
export const genres = ['All films', 'Action', 'Adventure', 'Animation', 'Comedy', 'Drama', 'Mystery', 'Sci-Fi', 'Thriller']

// Demo data is a local-development fallback only. Production always calls the
// same-origin API so missing/rejected credentials cannot be hidden by samples.
const useLocalDemoCatalog = Boolean(import.meta.env?.DEV && !import.meta.env?.VITE_TMDB_CONFIGURED)
const apiBase = '/api/tmdb/proxy'
const languageNames: Record<string, string> = { en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', es: 'Spanish', hi: 'Hindi', zh: 'Chinese', de: 'German', it: 'Italian' }
const imageUrl = (path: string | null | undefined, size: 'w500' | 'original' = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : photos.portrait
const yearOf = (date?: string) => date?.slice(0, 4) ?? ''

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(apiBase, window.location.origin)
  url.searchParams.set('path', path)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (import.meta.env.DEV) console.error('[TMDB] API request could not reach the same-origin proxy.', { path, cause })
    throw new Error('Could not reach the TMDB service. Please try again.')
  }
  if (!response.ok) {
    if (import.meta.env.DEV) console.error('[TMDB] API request failed.', { path, status: response.status })
    if (response.status === 401) throw new Error('TMDB rejected the server credentials (401). Check the TMDB Read Access Token configured for this deployment.')
    if (response.status === 403) throw new Error('TMDB denied this request (403). Check the token permissions and TMDB API access.')
    if (response.status === 404) {
      if (response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('TMDB could not find that title (404).')
      throw new Error('The TMDB API route returned 404. Check Vercel function routing and the production domain.')
    }
    if (response.status === 429) throw new Error('TMDB is receiving too many requests (429). Please wait and try again.')
    if (response.status === 503) throw new Error('TMDB is not configured for this deployment (503). Set TMDB_READ_ACCESS_TOKEN in Vercel Production variables, then create a new deployment.')
    if (response.status === 502) throw new Error('The server could not reach TMDB (502). Check the deployment function logs.')
    throw new Error(`TMDB request failed (${response.status}). Please try again.`)
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    if (import.meta.env.DEV) console.error('[TMDB] The API proxy returned a non-JSON response.', { path, contentType: response.headers.get('content-type') })
    throw new Error('The TMDB API returned an unexpected response. Check Vercel deployment protection and API routing.')
  }
  try {
    return await response.json() as T
  } catch (cause) {
    if (import.meta.env.DEV) console.error('[TMDB] The API proxy returned invalid JSON.', { path, cause })
    throw new Error('The TMDB API returned invalid data. Please try again later.')
  }
}

type TmdbItem = Record<string, any> & { id: number; media_type?: MediaType }
function normalizeMovie(item: TmdbItem, genresById: Record<number, string> = {}): Movie {
  const releaseDate = item.release_date ?? ''
  return { id: item.id, media_type: 'movie', title: item.title ?? 'Untitled film', original_title: item.original_title, release_date: releaseDate, poster: imageUrl(item.poster_path), backdrop: imageUrl(item.backdrop_path, 'original'), overview: item.overview ?? '', vote_average: Number.isFinite(item.vote_average) ? item.vote_average : undefined, genre: item.genres?.[0]?.name ?? item.genre_ids?.map((genreId: number) => genresById[genreId]).find(Boolean) ?? 'Film', genre_ids: item.genre_ids ?? item.genres?.map((genre: { id: number }) => genre.id), runtime: item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : undefined, language: languageNames[item.original_language] ?? item.original_language?.toUpperCase() ?? '' }
}
function normalizeTv(item: TmdbItem, genresById: Record<number, string> = {}): TvShow {
  const airDate = item.first_air_date ?? ''
  return { id: item.id, media_type: 'tv', title: item.name ?? 'Untitled series', original_title: item.original_name, first_air_date: airDate, poster: imageUrl(item.poster_path), backdrop: imageUrl(item.backdrop_path, 'original'), overview: item.overview ?? '', vote_average: Number.isFinite(item.vote_average) ? item.vote_average : undefined, genre: item.genres?.[0]?.name ?? item.genre_ids?.map((genreId: number) => genresById[genreId]).find(Boolean) ?? 'Series', genre_ids: item.genre_ids ?? item.genres?.map((genre: { id: number }) => genre.id), language: languageNames[item.original_language] ?? item.original_language?.toUpperCase() ?? '', number_of_seasons: Number.isFinite(item.number_of_seasons) ? item.number_of_seasons : undefined, number_of_episodes: Number.isFinite(item.number_of_episodes) ? item.number_of_episodes : undefined }
}
export function normalizeMedia(item: TmdbItem): Media | null {
  if (item.media_type === 'movie' || (!item.media_type && 'title' in item)) return normalizeMovie(item)
  if (item.media_type === 'tv' || (!item.media_type && 'name' in item)) return normalizeTv(item)
  return null
}
export const mediaYear = (item: Media) => yearOf(item.media_type === 'movie' ? item.release_date : item.first_air_date)
export const mediaDate = (item: Media) => item.media_type === 'movie' ? item.release_date : item.first_air_date
export const mediaTypeLabel = (item: Media) => item.media_type === 'movie' ? 'Movie' : 'TV Series'

const genreCache = new Map<MediaType, Promise<Record<number, string>>>()
function getGenreNames(type: MediaType): Promise<Record<number, string>> {
  const cached = genreCache.get(type)
  if (cached) return cached
  const request = tmdb<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`).then(result => Object.fromEntries(result.genres.map(item => [item.id, item.name])))
  genreCache.set(type, request)
  return request
}

export async function trendingAllDay(): Promise<Media[]> {
  if (useLocalDemoCatalog) return movies.map(item => ({ ...item }))
  const data = await tmdb<{ results: TmdbItem[] }>('/trending/all/day')
  return data.results.map(normalizeMedia).filter((item): item is Media => item !== null)
}
export async function getHomeCatalog(type: MediaType, sort: 'popular' | 'top_rated'): Promise<Media[]> {
  if (useLocalDemoCatalog) return sort === 'popular' && type === 'movie' ? movies.map(item => ({ ...item })) : []
  const path = `/${type}/${sort}`
  const [data, names] = await Promise.all([
    tmdb<{ results: TmdbItem[] }>(path), getGenreNames(type),
  ])
  return data.results.map(item => type === 'movie' ? normalizeMovie(item, names) : normalizeTv(item, names))
}
export async function getCatalogBySort(type: 'movie' | 'tv' | 'all', sort: CatalogSort): Promise<Media[]> {
  if (useLocalDemoCatalog) {
    if (type === 'tv' || sort === 'top_rated') return []
    return movies.map(item => ({ ...item }))
  }
  if (sort === 'trending') {
    const all = await trendingAllDay()
    return type === 'all' ? all : all.filter(item => item.media_type === type)
  }
  const types: MediaType[] = type === 'all' ? ['movie', 'tv'] : [type]
  return (await Promise.all(types.map(async mediaType => {
    if (sort !== 'newest') return getHomeCatalog(mediaType, sort)
    const [data, names] = await Promise.all([
      tmdb<{ results: TmdbItem[] }>(`/discover/${mediaType}`, { sort_by: mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc', include_adult: 'false' }),
      getGenreNames(mediaType),
    ])
    return data.results.map(item => mediaType === 'movie' ? normalizeMovie(item, names) : normalizeTv(item, names))
  }))).flat()
}
const discoverGenreIds: Record<string, Partial<Record<MediaType, number>>> = {
  Action: { movie: 28, tv: 10759 }, Adventure: { movie: 12, tv: 10759 }, Animation: { movie: 16, tv: 16 },
  Comedy: { movie: 35, tv: 35 }, Drama: { movie: 18, tv: 18 }, Mystery: { movie: 9648, tv: 9648 },
  'Sci-Fi': { movie: 878, tv: 10765 }, Thriller: { movie: 53 },
}
export function genreApiId(type: MediaType, genre: string): number | undefined { return discoverGenreIds[genre]?.[type] }
export async function getGenreCatalog(type: 'movie' | 'tv' | 'all', genre: string): Promise<Media[]> {
  if (useLocalDemoCatalog) return type === 'tv' ? [] : movies.filter(item => item.genre.toLowerCase() === genre.toLowerCase()).map(item => ({ ...item }))
  const types: MediaType[] = type === 'all' ? ['movie', 'tv'] : [type]
  return (await Promise.all(types.map(async mediaType => {
    const genreId = genreApiId(mediaType, genre)
    if (genreId === undefined) return []
    const [data, names] = await Promise.all([
      tmdb<{ results: TmdbItem[] }>(`/discover/${mediaType}`, { with_genres: String(genreId), sort_by: 'popularity.desc', include_adult: 'false' }),
      getGenreNames(mediaType),
    ])
    return data.results.map(item => mediaType === 'movie' ? normalizeMovie(item, names) : normalizeTv(item, names))
  }))).flat()
}

export async function getWatchProviders(type: MediaType, region?: string): Promise<WatchProvider[]> {
  const data = await tmdb<{ results?: WatchProvider[] }>(`/watch/providers/${type}`, region ? { watch_region: region } : {})
  return (data.results ?? []).filter(item => Number.isSafeInteger(item.provider_id) && !!item.provider_name)
}

export async function getGlobalWatchProviders() {
  const [movies, tv] = await Promise.all([getWatchProviders('movie'), getWatchProviders('tv')])
  return { movies, tv, all: mergeWatchProviders(movies, tv) }
}

export function getProviderLogoUrl(logoPath: string | null | undefined, size: 'w92' | 'w185' = 'w185'): string | null {
  const path = logoPath?.trim() ?? ''
  if (/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w92|w185)\/[A-Za-z0-9._/-]+$/i.test(path)) return path
  if (!path.startsWith('/') || path.startsWith('//') || !/^\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) return null
  return `https://image.tmdb.org/t/p/${size}${path}`
}

type AvailabilityResult = { results?: Record<string, Partial<Record<WatchMonetization, WatchProvider[]>> & { link?: string }> }
const availabilityCache = new Map<string, Promise<AvailabilityResult>>()
async function getAvailability(item: Media, region: string): Promise<AvailabilityResult> {
  const key = `${item.media_type}:${item.id}:${region}`
  let request = availabilityCache.get(key)
  if (!request) {
    request = tmdb<AvailabilityResult>(`/${item.media_type}/${item.id}/watch/providers`).catch(cause => { availabilityCache.delete(key); throw cause })
    availabilityCache.set(key, request)
  }
  return request
}

export async function getProviderCatalog(options: {
  query: string
  type: 'movie' | 'tv' | 'all'
  providerId: number
  region: string
  monetization: WatchMonetization[]
  anime?: boolean
  sort?: CatalogSort
}): Promise<Media[]> {
  const { query, type, providerId, region, monetization, anime = false, sort = 'popular' } = options
  if (!Number.isSafeInteger(providerId) || providerId <= 0 || !/^[A-Z]{2}$/.test(region) || !monetization.length) return []
  const types: MediaType[] = anime ? ['tv'] : type === 'all' ? ['movie', 'tv'] : [type]
  const allowedMethods = new Set(monetization)
  if (query.trim()) {
    const candidates = (await searchCatalog(query, type)).filter(item => !anime || item.media_type === 'tv' && item.genre_ids?.includes(16) && item.language === 'Japanese')
    const matches: Media[] = []
    let availabilityFailed = false
    let cursor = 0
    const workers = Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const index = cursor++
        const item = candidates[index]
        try {
          const regionData = (await getAvailability(item, region)).results?.[region]
          const found = [...allowedMethods].some(method => regionData?.[method]?.some(provider => provider.provider_id === providerId))
          if (found) matches.push(item)
        } catch (cause) {
          availabilityFailed = true
          if (import.meta.env.DEV) console.warn('[TMDB providers] Availability lookup failed.', { mediaType: item.media_type, id: item.id, region, cause })
        }
      }
    })
    await Promise.all(workers)
    if (availabilityFailed) throw new Error('Could not verify provider availability for every search result. Please retry the provider filter.')
    return candidates.filter(item => matches.some(match => match.media_type === item.media_type && match.id === item.id))
  }
  const results = await Promise.all(types.map(async mediaType => {
    const params: Record<string, string> = {
      watch_region: region,
      with_watch_providers: String(providerId),
      with_watch_monetization_types: monetization.join('|'),
      sort_by: sort === 'newest' ? mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc' : sort === 'top_rated' ? 'vote_average.desc' : 'popularity.desc',
      include_adult: 'false',
    }
    if (anime) { params.with_genres = '16'; params.with_original_language = 'ja' }
    const [data, names] = await Promise.all([
      tmdb<{ results: TmdbItem[] }>(`/discover/${mediaType}`, params), getGenreNames(mediaType),
    ])
    return data.results.map(item => mediaType === 'movie' ? normalizeMovie(item, names) : normalizeTv(item, names))
  }))
  return results.flat()
}

export function mergeWatchProviders(...groups: WatchProvider[][]): WatchProvider[] {
  const unique = new Map<number, WatchProvider>()
  for (const provider of groups.flat()) {
    const current = unique.get(provider.provider_id)
    if (!current || provider.display_priority < current.display_priority) unique.set(provider.provider_id, provider)
  }
  return [...unique.values()].sort((a, b) => a.display_priority - b.display_priority || a.provider_name.localeCompare(b.provider_name))
}
export async function searchMovies(query: string): Promise<Movie[]> {
  if (useLocalDemoCatalog) return query.trim() ? movies.filter(movie => movie.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : movies
  if (!query.trim()) return []
  const [data, names] = await Promise.all([tmdb<{ results: TmdbItem[] }>('/search/movie', { query, include_adult: 'false' }), getGenreNames('movie')])
  return data.results.map(item => normalizeMovie(item, names))
}
export async function searchTv(query: string): Promise<TvShow[]> {
  if (!query.trim()) return []
  if (useLocalDemoCatalog) return []
  const [data, names] = await Promise.all([tmdb<{ results: TmdbItem[] }>('/search/tv', { query, include_adult: 'false' }), getGenreNames('tv')])
  return data.results.map(item => normalizeTv(item, names))
}
export async function searchCatalog(query: string, type: 'movie' | 'tv' | 'all'): Promise<Media[]> {
  if (!query.trim() && !useLocalDemoCatalog) {
    const trending = await trendingAllDay()
    return type === 'all' ? trending : trending.filter(item => item.media_type === type)
  }
  if (type === 'movie') return searchMovies(query)
  if (type === 'tv') return searchTv(query)
  if (useLocalDemoCatalog) return query.trim() ? movies.filter(movie => movie.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) : movies
  const [data, movieGenres, tvGenres] = await Promise.all([tmdb<{ results: TmdbItem[] }>('/search/multi', { query, include_adult: 'false' }), getGenreNames('movie'), getGenreNames('tv')])
  return data.results.map(item => item.media_type === 'movie' ? normalizeMovie(item, movieGenres) : item.media_type === 'tv' ? normalizeTv(item, tvGenres) : null).filter((item): item is Media => item !== null)
}
let animeCatalogCache: Promise<TvShow[]> | undefined
export function animeTvCatalog(): Promise<TvShow[]> {
  if (useLocalDemoCatalog) return Promise.resolve([])
  if (!animeCatalogCache) animeCatalogCache = Promise.all([
    tmdb<{ results: TmdbItem[] }>('/discover/tv', { with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc', include_adult: 'false' }),
    getGenreNames('tv'),
  ]).then(([data, names]) => data.results.map(item => normalizeTv(item, names))).catch(cause => { animeCatalogCache = undefined; throw cause })
  return animeCatalogCache
}
export async function getMovieDetails(id: number): Promise<MovieDetails> {
  if (useLocalDemoCatalog) {
    const demo = movies.find(item => item.id === id)
    if (!demo) throw new Error('Configure local TMDB credentials to load other movie details.')
    return { ...demo, cast: [], recommendations: movies.filter(item => item.id !== id).slice(0, 5) }
  }
  const data = await tmdb<TmdbItem & { credits?: { cast?: { id: number; name: string; character?: string; profile_path?: string | null }[] }; videos?: { results?: { site: string; type: string; official?: boolean; key: string }[] }; recommendations?: { results?: TmdbItem[] } }>('/movie/' + id, { append_to_response: 'videos,credits,recommendations' })
  const videos = data.videos?.results ?? []
  return { ...normalizeMovie(data), runtimeMinutes: data.runtime, cast: (data.credits?.cast ?? []).slice(0, 12).map(person => ({ id: person.id, name: person.name, character: person.character ?? '', profilePath: person.profile_path ?? null })), trailerKey: videos.find(video => video.site === 'YouTube' && video.type === 'Trailer' && video.official)?.key ?? videos.find(video => video.site === 'YouTube' && video.type === 'Trailer')?.key, recommendations: (data.recommendations?.results ?? []).map(item => normalizeMovie(item)) }
}
export async function getTvDetails(id: number): Promise<TvDetails> {
  const data = await tmdb<TmdbItem & { seasons?: TvSeason[]; credits?: { cast?: { id: number; name: string; character?: string; profile_path?: string | null }[] }; videos?: { results?: { site: string; type: string; official?: boolean; key: string }[] }; recommendations?: { results?: TmdbItem[] } }>('/tv/' + id, { append_to_response: 'videos,credits,recommendations' })
  const videos = data.videos?.results ?? []
  return { ...normalizeTv(data), seasons: data.seasons ?? [], cast: (data.credits?.cast ?? []).slice(0, 12).map(person => ({ id: person.id, name: person.name, character: person.character ?? '', profilePath: person.profile_path ?? null })), trailerKey: videos.find(video => video.site === 'YouTube' && video.type === 'Trailer' && video.official)?.key ?? videos.find(video => video.site === 'YouTube' && video.type === 'Trailer')?.key, recommendations: (data.recommendations?.results ?? []).map(item => normalizeTv(item)) }
}
export async function getTvSeason(id: number, season: number): Promise<TvEpisode[]> {
  const data = await tmdb<{ episodes?: TvEpisode[] }>(`/tv/${id}/season/${season}`)
  return data.episodes ?? []
}

const trailerCache = new Map<string, Promise<string | undefined>>()
export function getMediaTrailerKey(media: Media): Promise<string | undefined> {
  const cacheKey = `${media.media_type}:${media.id}`
  const cached = trailerCache.get(cacheKey)
  if (cached) return cached
  if (useLocalDemoCatalog) return Promise.resolve(undefined)
  const path = media.media_type === 'movie' ? `/movie/${media.id}` : `/tv/${media.id}`
  const request = tmdb<{ videos?: { results?: { site: string; type: string; official?: boolean; key: string }[] } }>(path, { append_to_response: 'videos' })
    .then(data => {
      const trailers = data.videos?.results ?? []
      return trailers.find(video => video.site === 'YouTube' && video.type === 'Trailer' && video.official)?.key
        ?? trailers.find(video => video.site === 'YouTube' && video.type === 'Trailer')?.key
    })
  trailerCache.set(cacheKey, request)
  return request
}

export const demoHero = { ...hero, title: 'Dune: Part Two', eyebrow: 'FEATURED FROM YOUR DEMO CATALOG' }
