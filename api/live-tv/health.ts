import { lookup as dnsLookup } from 'node:dns/promises'
import { createHash } from 'node:crypto'
import { isIP, type LookupFunction } from 'node:net'
import { request as httpsRequest } from 'node:https'

type VercelRequest = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> }
type VercelResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }
type MediaFormat = 'hls' | 'mp4' | 'webm' | 'ogg'
type HealthState = 'online' | 'offline' | 'unknown'
type HealthResult = { online: boolean; state: HealthState; format: MediaFormat; message: string; checkedAt: number }
type ResolvedAddress = { address: string; family: number }

const resultCache = new Map<string, { expiresAt: number; result: HealthResult }>()
const requestCounts = new Map<string, { windowAt: number; count: number }>()
const resultCacheTtl = 5 * 60 * 1000
const requestWindow = 60 * 1000
const requestLimit = 45
const maxRedirects = 3
const maxPlaylistBytes = 4096
const totalProbeMs = 8500
const dnsProbeMs = 2200

function json(response: VercelResponse, status: number, value: Record<string, unknown>) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(JSON.stringify(value))
}

function formatFor(url: URL): MediaFormat | null {
  const path = url.pathname.toLowerCase()
  if (path.endsWith('.m3u8')) return 'hls'
  if (path.endsWith('.mp4')) return 'mp4'
  if (path.endsWith('.webm')) return 'webm'
  if (path.endsWith('.ogg') || path.endsWith('.ogv')) return 'ogg'
  return null
}

export function classifyLiveTvAvailability(status: number, supportedMediaResponse: boolean): HealthState {
  if (supportedMediaResponse) return 'online'
  if (status === 404 || status === 410) return 'offline'
  return 'unknown'
}

export function isPublicAddress(address: string, family: number) {
  if (family === 4) {
    const parts = address.split('.').map(Number)
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
    const [a, b, c] = parts
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && (b === 0 || b === 168) || a === 192 && b === 88 && c === 99 || a === 192 && b === 0 && c === 2) return false
    if (a === 198 && (b === 18 || b === 19 || b === 51) || a === 203 && b === 0 && c === 113) return false
    return true
  }
  const normalized = address.toLowerCase().split('%')[0]
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7)
    if (isIP(mapped) === 4) return isPublicAddress(mapped, 4)
    return false
  }
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff')) return false
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16)
  if (first < 0x2000 || first >= 0x4000) return false
  if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0:') || normalized.startsWith('2002:')) return false
  return true
}

async function resolvePublicAddress(hostname: string, timeoutMs: number) {
  const family = isIP(hostname)
  let answers: ResolvedAddress[]
  if (family) answers = [{ address: hostname, family }]
  else {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const lookup = dnsLookup(hostname, { all: true, verbatim: true }) as Promise<ResolvedAddress[]>
      answers = await Promise.race<ResolvedAddress[]>([
        lookup,
        new Promise<ResolvedAddress[]>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('DNS lookup timeout.')), timeoutMs) }),
      ])
    } finally { if (timer) clearTimeout(timer) }
  }
  if (!answers.length || answers.some(answer => !isPublicAddress(answer.address, answer.family))) throw new Error('Blocked non-public destination.')
  return answers[0]
}

type ProbeResponse = { status: number; contentType: string; location?: string; prefix: Uint8Array }

async function probeOnce(url: URL, format: MediaFormat, deadlineAt: number): Promise<ProbeResponse> {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) throw new Error('Probe timeout.')
  const destination = await resolvePublicAddress(url.hostname, Math.min(dnsProbeMs, remaining))
  const secureLookup = ((hostname: string, options: { all?: boolean }, callback: (error: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void) => {
    if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
      callback(Object.assign(new Error('Unexpected destination host.'), { code: 'EACCES' }), '', 0)
      return
    }
    if (options.all) callback(null, [{ address: destination.address, family: destination.family }])
    else callback(null, destination.address, destination.family)
  }) as LookupFunction

  return new Promise((resolve, reject) => {
    let settled = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error, value?: ProbeResponse) => {
      if (settled) return
      settled = true
      if (deadline) clearTimeout(deadline)
      if (error) reject(error); else if (value) resolve(value)
    }
    const request = httpsRequest(url, {
      method: 'GET',
      lookup: secureLookup,
      servername: url.hostname,
      headers: { Accept: '*/*', Range: `bytes=0-${format === 'hls' ? maxPlaylistBytes - 1 : 15}`, 'User-Agent': 'AAK-Movies-LiveTV-Health/1.0' },
      timeout: Math.min(5000, Math.max(1, deadlineAt - Date.now())),
    }, response => {
      const status = response.statusCode ?? 0
      const contentType = (response.headers['content-type'] ?? '').toString().split(';')[0].trim().toLowerCase()
      const location = response.headers.location
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy()
        finish(undefined, { status, contentType, location, prefix: new Uint8Array() })
        return
      }
      const chunks: Uint8Array[] = []
      let bytes = 0
      const maxBytes = format === 'hls' ? maxPlaylistBytes : 16
      response.on('data', (chunk: Buffer) => {
        const remaining = maxBytes - bytes
        if (remaining <= 0) { response.destroy(); return }
        const piece = new Uint8Array(chunk.subarray(0, remaining))
        chunks.push(piece)
        bytes += piece.byteLength
        if (bytes >= maxBytes) response.destroy()
      })
      response.on('end', () => {
        const prefix = new Uint8Array(bytes)
        let offset = 0
        for (const chunk of chunks) { prefix.set(chunk, offset); offset += chunk.byteLength }
        finish(undefined, { status, contentType, prefix })
      })
      response.on('close', () => {
        if (settled) return
        const prefix = new Uint8Array(bytes)
        let offset = 0
        for (const chunk of chunks) { prefix.set(chunk, offset); offset += chunk.byteLength }
        finish(undefined, { status, contentType, prefix })
      })
      response.on('error', error => finish(error))
    })
    request.on('timeout', () => request.destroy(new Error('Probe timeout.')))
    request.on('error', error => finish(error))
    deadline = setTimeout(() => request.destroy(new Error('Probe timeout.')), Math.max(1, deadlineAt - Date.now()))
    request.end()
  })
}

async function probe(urlValue: string): Promise<HealthResult> {
  let current: URL
  try { current = new URL(urlValue) } catch { throw new Error('Enter a valid direct media URL.') }
  const format = formatFor(current)
  if (current.protocol !== 'https:' || current.username || current.password || !format || current.href.length > 4096) throw new Error('Only direct HTTPS HLS, MP4, WebM, and Ogg stream URLs can be checked.')
  const deadlineAt = Date.now() + totalProbeMs
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (Date.now() >= deadlineAt) break
    const result = await probeOnce(current, format, deadlineAt)
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.location || redirects === maxRedirects) break
      const redirected = new URL(result.location, current)
      if (redirected.protocol !== 'https:' || redirected.username || redirected.password) break
      current = redirected
      continue
    }
    const successfulStatus = result.status === 200 || result.status === 206
    const bytes = result.prefix
    const prefixText = new TextDecoder().decode(bytes)
    const isHlsPlaylist = prefixText.trimStart().startsWith('#EXTM3U')
    const hasExpectedSignature = format === 'hls' ? isHlsPlaylist
      : format === 'mp4' ? bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp'
        : format === 'webm' ? bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
          : bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === 'OggS'
    const expectedMime = format === 'hls' ? /(?:mpegurl|m3u8|vnd\.apple\.mpegurl)/i.test(result.contentType)
      : format === 'mp4' ? /(?:video\/mp4|application\/mp4)/i.test(result.contentType)
        : format === 'webm' ? /video\/webm/i.test(result.contentType)
          : /video\/(?:ogg|ogv)/i.test(result.contentType)
    const online = successfulStatus && hasExpectedSignature && (expectedMime || result.contentType === 'application/octet-stream')
    const state = classifyLiveTvAvailability(result.status, online)
    const message = state === 'online' ? 'Stream endpoint returned a supported media response.' : state === 'offline' ? 'Stream endpoint returned a confirmed not-found response.' : 'The endpoint did not provide enough evidence to confirm availability.'
    return { online, state, format, message, checkedAt: Date.now() }
  }
  return { online: false, state: 'unknown', format, message: 'The endpoint could not be checked reliably.', checkedAt: Date.now() }
}

function readUrl(request: VercelRequest): string {
  if (request.body && typeof request.body === 'object' && !Array.isArray(request.body)) {
    const value = (request.body as Record<string, unknown>).url
    return typeof value === 'string' ? value : ''
  }
  if (typeof request.body === 'string') {
    try { const value: unknown = JSON.parse(request.body); return value && typeof value === 'object' && 'url' in value && typeof value.url === 'string' ? value.url : '' } catch { return '' }
  }
  return ''
}

function callerKey(request: VercelRequest) {
  const value = request.headers?.['x-forwarded-for']
  return (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || 'unknown'
}

export function createLiveTvHealthHandler(probeStream: (url: string) => Promise<HealthResult> = probe) {
  return async function handler(request: VercelRequest, response: VercelResponse) {
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); json(response, 405, { message: 'Method not allowed.' }); return }
    const caller = callerKey(request)
    const now = Date.now()
    const count = requestCounts.get(caller)
    if (count && now - count.windowAt < requestWindow && count.count >= requestLimit) { json(response, 429, { message: 'Too many channel checks. Please wait a moment.' }); return }
    requestCounts.set(caller, count && now - count.windowAt < requestWindow ? { ...count, count: count.count + 1 } : { windowAt: now, count: 1 })
    if (requestCounts.size > 5000) {
      for (const [key, item] of requestCounts) if (now - item.windowAt >= requestWindow) requestCounts.delete(key)
      while (requestCounts.size > 5000) requestCounts.delete(requestCounts.keys().next().value as string)
    }
    const value = readUrl(request)
    let parsed: URL
    try { parsed = new URL(value) } catch { json(response, 400, { message: 'Enter a valid direct media URL.' }); return }
    if (parsed.href.length > 4096 || parsed.protocol !== 'https:' || parsed.username || parsed.password || !formatFor(parsed)) {
      json(response, 400, { message: 'Only direct HTTPS HLS, MP4, WebM, and Ogg stream URLs can be checked.' }); return
    }
    const cacheKey = createHash('sha256').update(parsed.href).digest('hex')
    const cached = resultCache.get(cacheKey)
    if (cached && cached.expiresAt > now) { json(response, 200, cached.result); return }
    try {
      const result = await probeStream(parsed.href)
      resultCache.set(cacheKey, { expiresAt: now + (result.state === 'unknown' ? 45_000 : resultCacheTtl), result })
      if (resultCache.size > 1000) {
        for (const [key, item] of resultCache) if (item.expiresAt <= now) resultCache.delete(key)
        while (resultCache.size > 1000) resultCache.delete(resultCache.keys().next().value as string)
      }
      json(response, 200, result)
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'network error'
      console.warn('[Live TV health] A bounded stream check failed.', { reason })
      const result: HealthResult = { online: false, state: 'unknown', format: formatFor(parsed)!, message: 'The endpoint could not be checked reliably.', checkedAt: now }
      resultCache.set(cacheKey, { expiresAt: now + Math.min(resultCacheTtl, 60_000), result })
      json(response, 200, result)
    }
  }
}

export default createLiveTvHealthHandler()
