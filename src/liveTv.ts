export type LiveTvFormat = 'hls' | 'mp4' | 'webm' | 'ogg'

/** Parsed public playlist entry. A parsed entry is a candidate, not a verified stream. */
export type LiveTvChannel = {
  id: string
  name: string
  category: string
  description?: string
  logoUrl?: string
  playbackUrl: string
  format: LiveTvFormat
  tvgId?: string
  tvgName?: string
  rawCategory?: string
  rightsConfirmed?: true
  playbackTested?: true
}

export const liveTvPlaylistUrl = 'https://iptv-org.github.io/iptv/index.m3u'
export const liveTvChannels: readonly LiveTvChannel[] = []

const allowedExtensions: Record<LiveTvFormat, RegExp> = {
  hls: /\.m3u8$/i,
  mp4: /\.mp4$/i,
  webm: /\.webm$/i,
  ogg: /\.(?:ogg|ogv)$/i,
}
const formats = Object.entries(allowedExtensions) as [LiveTvFormat, RegExp][]
const sportsCategory = /(?:^|[^a-z])(?:sport|sports|football|soccer|basketball|baseball|cricket|tennis|rugby|hockey|golf|racing|motorsport|formula\s?1|boxing|wrestling|volleyball|badminton|athletics|olympic)(?:$|[^a-z])/i
let parsedCache: { at: number; channels: LiveTvChannel[] } | null = null
const catalogMaxAgeMs = 6 * 60 * 60 * 1000

function mediaFormat(url: URL): LiveTvFormat | null {
  return formats.find(([, extension]) => extension.test(url.pathname))?.[0] ?? null
}

export function isSafeLiveTvLogo(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch { return false }
}

function parseAttributes(line: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /(?:^|\s)([\w-]+)="([^"]*)"/g
  for (const match of line.matchAll(pattern)) attributes[match[1].toLowerCase()] = match[2].trim()
  return attributes
}

function stableId(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function cleanName(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function findInfoDelimiter(line: string) {
  let quoted = false
  for (let index = 8; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted
    else if (line[index] === ',' && !quoted) return index
  }
  return -1
}

function normalizedCategory(value: string | undefined) {
  const category = cleanName(value ?? '')
  if (!category) return 'Other'
  return category.split(';')[0].trim() || 'Other'
}

export function isSportsLiveChannel(channel: Pick<LiveTvChannel, 'category' | 'rawCategory'>) {
  return sportsCategory.test(`${channel.rawCategory ?? ''} ${channel.category}`)
}

type PlaylistParserState = { channels: LiveTvChannel[]; seen: Set<string>; metadata: { title: string; attributes: Record<string, string> } | null }

function parsePlaylistLines(lines: string[], state: PlaylistParserState) {
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF:')) {
      const comma = findInfoDelimiter(line)
      if (comma < 0) { state.metadata = null; continue }
      const info = line.slice(8, comma)
      const attributes = parseAttributes(info)
      const title = cleanName(line.slice(comma + 1)) || cleanName(attributes['tvg-name'] ?? '')
      state.metadata = title ? { title, attributes } : null
      continue
    }
    if (line.startsWith('#')) continue
    const current = state.metadata
    state.metadata = null
    if (!current) continue
    let streamUrl: URL
    try { streamUrl = new URL(line) } catch { continue }
    if (streamUrl.protocol !== 'https:' || streamUrl.username || streamUrl.password) continue
    const format = mediaFormat(streamUrl)
    if (!format) continue
    const rawCategory = cleanName(current.attributes['group-title'] ?? '')
    const category = normalizedCategory(rawCategory)
    const tvgId = cleanName(current.attributes['tvg-id'] ?? '')
    const tvgName = cleanName(current.attributes['tvg-name'] ?? '')
    const identity = `${(tvgId || current.title).toLocaleLowerCase()}\n${streamUrl.href}`
    if (state.seen.has(identity)) continue
    state.seen.add(identity)
    const logoUrl = isSafeLiveTvLogo(current.attributes['tvg-logo']) ? current.attributes['tvg-logo'] : undefined
    state.channels.push({
      id: stableId(identity),
      name: current.title,
      category,
      rawCategory: rawCategory || undefined,
      tvgId: tvgId || undefined,
      tvgName: tvgName || undefined,
      logoUrl,
      playbackUrl: streamUrl.href,
      format,
    })
  }
}

function newPlaylistParserState(): PlaylistParserState {
  return { channels: [], seen: new Set(), metadata: null }
}

export function parseIptvPlaylist(text: string): LiveTvChannel[] {
  const state = newPlaylistParserState()
  parsePlaylistLines(text.split(/\r?\n/), state)
  return state.channels
}

export async function parseIptvPlaylistAsync(text: string, signal?: AbortSignal): Promise<LiveTvChannel[]> {
  const lines = text.split(/\r?\n/)
  const state = newPlaylistParserState()
  const batchSize = 1600
  for (let start = 0; start < lines.length; start += batchSize) {
    if (signal?.aborted) throw new DOMException('The channel list request was cancelled.', 'AbortError')
    parsePlaylistLines(lines.slice(start, start + batchSize), state)
    if (start + batchSize < lines.length) await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
  return state.channels
}

export function isConfiguredLiveChannel(channel: LiveTvChannel): boolean {
  if (!channel.id.trim() || !channel.name.trim() || !channel.category.trim() || channel.rightsConfirmed !== true || channel.playbackTested !== true) return false
  try {
    const url = new URL(channel.playbackUrl)
    const extension = allowedExtensions[channel.format]
    return Boolean(extension) && url.protocol === 'https:' && !url.username && !url.password && extension.test(url.pathname)
  } catch { return false }
}

export function getConfiguredLiveChannels(channels: readonly LiveTvChannel[] = liveTvChannels): LiveTvChannel[] {
  return channels.filter(isConfiguredLiveChannel)
}

export async function loadLiveTvCatalog(signal?: AbortSignal): Promise<LiveTvChannel[]> {
  if (parsedCache && Date.now() - parsedCache.at < catalogMaxAgeMs) return parsedCache.channels
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('The channel list request timed out.', 'TimeoutError')), 25000)
  try {
    const response = await fetch(liveTvPlaylistUrl, { headers: { Accept: 'audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain;q=0.9, */*;q=0.5' }, signal: controller.signal })
    if (!response.ok) throw new Error(`Channel list request failed (HTTP ${response.status}).`)
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > 30_000_000) throw new Error('The channel list is larger than the supported size.')
    const reader = response.body?.getReader()
    let text = ''
    if (reader) {
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const result = await reader.read()
        if (result.done) break
        size += result.value.byteLength
        if (size > 30_000_000) { await reader.cancel(); throw new Error('The channel list is larger than the supported size.') }
        chunks.push(result.value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      text = new TextDecoder().decode(bytes)
    } else text = await response.text()
    if (!text.trimStart().startsWith('#EXTM3U')) throw new Error('The channel list did not contain a valid M3U playlist.')
    const channels = await parseIptvPlaylistAsync(text, controller.signal)
    if (!channels.length) throw new Error('No supported HTTPS video channels were found in the playlist.')
    parsedCache = { at: Date.now(), channels }
    return channels
  } catch (cause) {
    if (!signal?.aborted && controller.signal.aborted) throw new Error('The channel list request timed out.')
    throw cause
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

export type LiveTvHealthState = 'online' | 'offline' | 'unknown'
export type LiveTvHealth = { online: boolean; state: LiveTvHealthState; format?: LiveTvFormat; message?: string; checkedAt?: number }

export async function checkLiveTvHealth(channel: LiveTvChannel, signal?: AbortSignal): Promise<LiveTvHealth> {
  const controller = new AbortController()
  const onAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('The stream status check timed out.', 'TimeoutError')), 11000)
  try {
    const response = await fetch('/api/live-tv/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: channel.playbackUrl }),
      signal: controller.signal,
    })
    let payload: unknown
    try { payload = await response.json() } catch { throw new Error('Stream status could not be checked.') }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Stream status returned an invalid response.')
    const record = payload as Record<string, unknown>
    if (!response.ok) throw new Error(typeof record.message === 'string' ? record.message : 'Stream status could not be checked.')
    if (typeof record.online !== 'boolean') throw new Error('Stream status returned an invalid response.')
    const state: LiveTvHealthState = record.state === 'online' || record.state === 'offline' || record.state === 'unknown'
      ? record.state
      : record.online ? 'online' : 'offline'
    return {
      online: state === 'online',
      state,
      format: typeof record.format === 'string' && formats.some(([format]) => format === record.format) ? record.format as LiveTvFormat : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
      checkedAt: typeof record.checkedAt === 'number' ? record.checkedAt : undefined,
    }
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}
