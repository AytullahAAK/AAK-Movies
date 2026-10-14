type MediaType = 'movie' | 'tv'
type Provider = 'torrentio' | 'hdhub'
type AddonEnv = Record<string, string | undefined>
type VercelRequest = { method?: string; url?: string }
type VercelResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string | Uint8Array) => void }
type StremioResource = string | { name: string; types?: unknown; idPrefixes?: unknown }

const addonHosts: Record<Provider, string> = {
  torrentio: 'torrentio.strem.fun',
  hdhub: 'hdhub.thevolecitor.qzz.io',
}

function send(response: VercelResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

function runtimeEnv(): AddonEnv {
  const runtime = globalThis as typeof globalThis & { process?: { env?: AddonEnv } }
  return runtime.process?.env ?? {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw Object.assign(new Error(`Upstream returned HTTP ${response.status}.`), { upstreamStatus: response.status })
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('Upstream returned a non-JSON response.')
  const text = await response.text()
  if (text.length > 1_000_000) throw new Error('Upstream response exceeded the size limit.')
  try { return JSON.parse(text) as unknown } catch { throw new Error('Upstream returned invalid JSON.') }
}

function getConfiguredManifestUrl(provider: Provider, env: AddonEnv): URL | null {
  const setting = provider === 'torrentio' ? env.TORRENTIO_MANIFEST_URL : env.HDHUB_MANIFEST_URL
  if (!setting?.trim()) return null
  let url: URL
  try { url = new URL(setting) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname.toLowerCase() !== addonHosts[provider] || !/\/manifest\.json\/?$/i.test(url.pathname)) return null
  return url
}

function manifestSupports(manifest: Record<string, unknown>, mediaType: MediaType, requestedId: string) {
  const stremioType = mediaType === 'movie' ? 'movie' : 'series'
  if (!readArray(manifest.types).includes(stremioType)) return false
  const streamResource = readArray(manifest.resources).find((resource): resource is StremioResource => typeof resource === 'string' ? resource === 'stream' : isRecord(resource) && resource.name === 'stream')
  if (!streamResource) return false
  const declaredTypes = typeof streamResource === 'object' && !Array.isArray(streamResource) ? readArray(streamResource.types) : []
  if (declaredTypes.length && !declaredTypes.includes(stremioType)) return false
  const declaredPrefixes = typeof streamResource === 'object' && !Array.isArray(streamResource)
    ? readArray(streamResource.idPrefixes)
    : readArray(manifest.idPrefixes)
  if (!declaredPrefixes.length) return true
  const baseId = requestedId.split(':', 1)[0]
  return declaredPrefixes.some(prefix => typeof prefix === 'string' && baseId.startsWith(prefix))
}

function classifyStream(value: Record<string, unknown>, embedHosts: Set<string>) {
  const mediaUrlValue = typeof value.url === 'string' ? value.url : ''
  let mediaUrl: URL | null = null
  try { mediaUrl = new URL(mediaUrlValue) } catch { /* Non-URL Stremio entries are classified below. */ }
  if (mediaUrl?.protocol === 'https:' && !mediaUrl.username && !mediaUrl.password) {
    const extension = mediaUrl.pathname.toLowerCase().split('.').pop()
    const contentType = extension === 'mp4' ? 'video/mp4' : extension === 'webm' ? 'video/webm' : extension === 'ogg' ? 'video/ogg' : null
    if (contentType) return { playbackKind: 'direct-video' as const, url: mediaUrl.href, contentType }
    if (embedHosts.has(mediaUrl.hostname.toLowerCase())) return { playbackKind: 'embed' as const, url: mediaUrl.href }
  }
  if (typeof value.infoHash === 'string' || mediaUrl?.protocol === 'magnet:') return { playbackKind: 'torrent' as const }
  const externalUrlValue = typeof value.externalUrl === 'string' ? value.externalUrl : ''
  let externalUrl: URL | null = null
  try { externalUrl = new URL(externalUrlValue) } catch { /* External link is optional. */ }
  if (externalUrl?.protocol === 'https:' && !externalUrl.username && !externalUrl.password) return { playbackKind: 'external-link' as const, externalUrl: externalUrl.href }
  return { playbackKind: 'unsupported' as const }
}

export function createAddonHandler(getEnv: () => AddonEnv = runtimeEnv) {
  return async function handler(request: VercelRequest, response: VercelResponse) {
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); send(response, 405, { message: 'Method not allowed.' }); return }
    const incoming = new URL(request.url ?? '/', 'https://aak.invalid')
    const providerPart = incoming.pathname.match(/^\/api\/addons\/(torrentio|hdhub)$/)?.[1]
    if (!providerPart) { send(response, 404, { message: 'Unknown addon provider.' }); return }
    const provider = providerPart as Provider
    const env = getEnv()
    if (env.ENABLE_AUTHORIZED_ADDON_LOOKUPS !== 'true') {
      const manifestVariable = provider === 'torrentio' ? 'TORRENTIO_MANIFEST_URL' : 'HDHUB_MANIFEST_URL'
      const manifestConfigured = getConfiguredManifestUrl(provider, env) !== null
      const missing = ['ENABLE_AUTHORIZED_ADDON_LOOKUPS=true']
      if (!manifestConfigured) missing.push(`a valid ${manifestVariable}`)
      if (!env.TMDB_READ_ACCESS_TOKEN) missing.push('TMDB_READ_ACCESS_TOKEN')
      send(response, 503, { code: 'ADDON_LOOKUP_NOT_CONFIGURED', provider, required: missing, message: `${provider === 'torrentio' ? 'Torrentio' : 'HdHub'} lookups are disabled. The operator must review provider permissions and configure ${missing.join(', ')} on the server.` })
      return
    }

    const manifestUrl = getConfiguredManifestUrl(provider, env)
    if (!manifestUrl) {
      const variable = provider === 'torrentio' ? 'TORRENTIO_MANIFEST_URL' : 'HDHUB_MANIFEST_URL'
      send(response, 503, { code: 'ADDON_MANIFEST_NOT_CONFIGURED', provider, required: [variable], message: `Set a configured HTTPS ${variable} on the server before using ${provider === 'torrentio' ? 'Torrentio' : 'HdHub'}.` })
      return
    }

    const mediaType = incoming.searchParams.get('media_type')
    const tmdbId = Number(incoming.searchParams.get('tmdb_id'))
    const seasonNumberParam = incoming.searchParams.get('season_number')
    const episodeNumberParam = incoming.searchParams.get('episode_number')
    const seasonNumber = Number(seasonNumberParam)
    const episodeNumber = Number(episodeNumberParam)
    if (mediaType !== 'movie' && mediaType !== 'tv') { send(response, 400, { message: 'media_type must be movie or tv.' }); return }
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) { send(response, 400, { message: 'tmdb_id must be a positive integer.' }); return }
    if (mediaType === 'tv' && (!seasonNumberParam?.trim() || !episodeNumberParam?.trim() || !Number.isSafeInteger(seasonNumber) || seasonNumber < 0 || !Number.isSafeInteger(episodeNumber) || episodeNumber <= 0)) {
      send(response, 400, { message: 'TV lookups require a non-negative season number and a positive episode number.' }); return
    }
    const tmdbToken = env.TMDB_READ_ACCESS_TOKEN
    if (!tmdbToken) { send(response, 503, { code: 'TMDB_TOKEN_NOT_CONFIGURED', provider, required: ['TMDB_READ_ACCESS_TOKEN'], message: 'TMDB_READ_ACCESS_TOKEN is required to map this TMDB title to an addon-supported IMDb ID.' }); return }

    try {
      const idPath = mediaType === 'movie' ? `/movie/${tmdbId}/external_ids` : `/tv/${tmdbId}/external_ids`
      const externalResponse = await fetch(`https://api.themoviedb.org/3${idPath}`, {
        headers: { Authorization: `Bearer ${tmdbToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      })
      const externalIds = await readJson(externalResponse)
      const imdbId = isRecord(externalIds) && typeof externalIds.imdb_id === 'string' && /^tt\d+$/.test(externalIds.imdb_id) ? externalIds.imdb_id : null
      if (!imdbId) { send(response, 422, { message: 'TMDB did not provide an IMDb ID supported by this addon.' }); return }
      const stremioType = mediaType === 'movie' ? 'movie' : 'series'
      const videoId = mediaType === 'movie' ? imdbId : `${imdbId}:${seasonNumber}:${episodeNumber}`

      const manifestResponse = await fetch(manifestUrl, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(10000) })
      const manifestValue = await readJson(manifestResponse)
      if (!isRecord(manifestValue) || !Array.isArray(manifestValue.types) || !Array.isArray(manifestValue.resources)) throw new Error('Addon manifest is missing required types/resources.')
      if (!manifestSupports(manifestValue, mediaType, videoId)) { send(response, 422, { message: 'This addon manifest does not declare stream support for the selected media type and ID.' }); return }

      const streamUrl = new URL(manifestUrl.href)
      // IDs are constrained above to IMDb digits plus numeric episode suffixes.
      // Stremio's documented video ID uses literal colons for series episodes.
      streamUrl.pathname = `${streamUrl.pathname.replace(/\/manifest\.json\/?$/i, '')}/stream/${stremioType}/${videoId}.json`.replace(/\/+/g, '/')
      const streamResponse = await fetch(streamUrl, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const streamValue = await readJson(streamResponse)
      if (!isRecord(streamValue) || !Array.isArray(streamValue.streams) || !streamValue.streams.every(isRecord)) throw new Error('Addon stream response has an invalid shape.')
      const embedHosts = new Set((env.AUTHORIZED_EMBED_HOSTS ?? '').split(',').map(host => host.trim().toLowerCase()).filter(Boolean))
      const streams = streamValue.streams.map((entry, index) => {
        const classified = classifyStream(entry, embedHosts)
        return {
          id: `${provider}-${index}`,
          name: typeof entry.name === 'string' ? entry.name : undefined,
          title: typeof entry.title === 'string' ? entry.title : undefined,
          quality: typeof entry.quality === 'string' ? entry.quality : undefined,
          language: typeof entry.language === 'string' ? entry.language : undefined,
          size: typeof entry.size === 'string' || typeof entry.size === 'number' ? entry.size : undefined,
          sourceType: typeof entry.type === 'string' ? entry.type : undefined,
          ...classified,
        }
      })
      send(response, 200, { code: 'ADDON_LOOKUP_OK', provider, media_type: mediaType, id: videoId, streams })
    } catch (cause) {
      const upstreamStatus = isRecord(cause) && typeof cause.upstreamStatus === 'number' ? cause.upstreamStatus : undefined
      console.error('[Addon lookup] Request failed.', { provider, status: upstreamStatus ?? 'network-or-invalid-response' })
      const status = upstreamStatus === 429 ? 429 : upstreamStatus === 401 || upstreamStatus === 403 ? upstreamStatus : 502
      const message = status === 429 ? `${provider} is rate limiting requests. Please try again later.`
        : status === 401 || status === 403 ? `${provider} rejected this configured addon request. Check its server-side configuration.`
          : `${provider} is unavailable or returned an invalid response.`
      send(response, status, { code: status === 429 ? 'ADDON_RATE_LIMITED' : status === 401 || status === 403 ? 'ADDON_ACCESS_DENIED' : 'ADDON_UPSTREAM_ERROR', provider, message })
    }
  }
}

export default createAddonHandler()
