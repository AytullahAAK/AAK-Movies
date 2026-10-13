export type MediaType = 'movie' | 'tv'
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
  runtime?: string
  language: string
  number_of_seasons?: number
  number_of_episodes?: number
}
export type Movie = Media & { media_type: 'movie'; release_date?: string }
export type TvShow = Media & { media_type: 'tv'; first_air_date?: string; number_of_seasons?: number; number_of_episodes?: number }
export type TvSeason = { id: number; name: string; season_number: number; episode_count: number; overview: string; poster_path: string | null; air_date: string | null }
export type TvEpisode = { id: number; name: string; episode_number: number; season_number: number; overview: string; still_path: string | null; air_date: string | null; runtime: number | null }
export type MovieDetails = Movie & { runtimeMinutes?: number; cast: string[]; trailerKey?: string; recommendations: Movie[] }
export type TvDetails = TvShow & { seasons: TvSeason[]; cast: string[]; trailerKey?: string; recommendations: TvShow[] }

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
const useLocalDemoCatalog = import.meta.env.DEV && !import.meta.env.VITE_TMDB_CONFIGURED
const apiBase = '/api/tmdb-proxy'
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
  return { id: item.id, media_type: 'movie', title: item.title ?? 'Untitled film', original_title: item.original_title, release_date: releaseDate, poster: imageUrl(item.poster_path), backdrop: imageUrl(item.backdrop_path, 'original'), overview: item.overview ?? '', vote_average: Number.isFinite(item.vote_average) ? item.vote_average : undefined, genre: item.genres?.[0]?.name ?? item.genre_ids?.map((genreId: number) => genresById[genreId]).find(Boolean) ?? 'Film', runtime: item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : undefined, language: languageNames[item.original_language] ?? item.original_language?.toUpperCase() ?? '' }
}
function normalizeTv(item: TmdbItem, genresById: Record<number, string> = {}): TvShow {
  const airDate = item.first_air_date ?? ''
  return { id: item.id, media_type: 'tv', title: item.name ?? 'Untitled series', original_title: item.original_name, first_air_date: airDate, poster: imageUrl(item.poster_path), backdrop: imageUrl(item.backdrop_path, 'original'), overview: item.overview ?? '', vote_average: Number.isFinite(item.vote_average) ? item.vote_average : undefined, genre: item.genres?.[0]?.name ?? item.genre_ids?.map((genreId: number) => genresById[genreId]).find(Boolean) ?? 'Series', language: languageNames[item.original_language] ?? item.original_language?.toUpperCase() ?? '', number_of_seasons: Number.isFinite(item.number_of_seasons) ? item.number_of_seasons : undefined, number_of_episodes: Number.isFinite(item.number_of_episodes) ? item.number_of_episodes : undefined }
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
export async function getMovieDetails(id: number): Promise<MovieDetails> {
  if (useLocalDemoCatalog) {
    const demo = movies.find(item => item.id === id)
    if (!demo) throw new Error('Configure local TMDB credentials to load other movie details.')
    return { ...demo, cast: [], recommendations: movies.filter(item => item.id !== id).slice(0, 5) }
  }
  const data = await tmdb<TmdbItem & { credits?: { cast?: { name: string }[] }; videos?: { results?: { site: string; type: string; official?: boolean; key: string }[] }; recommendations?: { results?: TmdbItem[] } }>('/movie/' + id, { append_to_response: 'videos,credits,recommendations' })
  const videos = data.videos?.results ?? []
  return { ...normalizeMovie(data), runtimeMinutes: data.runtime, cast: (data.credits?.cast ?? []).slice(0, 10).map(person => person.name), trailerKey: videos.find(video => video.site === 'YouTube' && video.type === 'Trailer' && video.official)?.key ?? videos.find(video => video.site === 'YouTube' && video.type === 'Trailer')?.key, recommendations: (data.recommendations?.results ?? []).map(item => normalizeMovie(item)) }
}
export async function getTvDetails(id: number): Promise<TvDetails> {
  const data = await tmdb<TmdbItem & { seasons?: TvSeason[]; credits?: { cast?: { name: string }[] }; videos?: { results?: { site: string; type: string; official?: boolean; key: string }[] }; recommendations?: { results?: TmdbItem[] } }>('/tv/' + id, { append_to_response: 'videos,credits,recommendations' })
  const videos = data.videos?.results ?? []
  return { ...normalizeTv(data), seasons: data.seasons ?? [], cast: (data.credits?.cast ?? []).slice(0, 10).map(person => person.name), trailerKey: videos.find(video => video.site === 'YouTube' && video.type === 'Trailer' && video.official)?.key ?? videos.find(video => video.site === 'YouTube' && video.type === 'Trailer')?.key, recommendations: (data.recommendations?.results ?? []).map(item => normalizeTv(item)) }
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
