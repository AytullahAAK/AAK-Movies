const allowedPaths = /^\/(?:trending\/all\/day|search\/(?:movie|tv|multi)|genre\/(?:movie|tv)\/list|movie\/\d+(?:\/external_ids)?|tv\/\d+(?:\/external_ids|\/season\/\d+)?)$/
const allowedQueryKeys = new Set(['query', 'include_adult', 'append_to_response', 'language', 'page', 'region', 'with_original_language'])

type VercelRequest = { method?: string; url?: string }
type VercelResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string | Uint8Array) => void }

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') { response.statusCode = 405; response.setHeader('Allow', 'GET'); response.end('Method not allowed'); return }
  const incoming = new URL(request.url ?? '/', 'https://aak.invalid')
  const apiPath = incoming.searchParams.get('path') ?? ''
  const path = `/${apiPath.replace(/^\/+/, '')}`
  if (!allowedPaths.test(path)) { response.statusCode = 404; response.end('TMDB route not allowed'); return }
  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  const token = runtime.process?.env?.TMDB_READ_ACCESS_TOKEN
  if (!token) { response.statusCode = 503; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ status_message: 'TMDB Read Access Token is not configured on the server.' })); return }
  const target = new URL(`https://api.themoviedb.org/3${path}`)
  incoming.searchParams.forEach((value, key) => { if (allowedQueryKeys.has(key)) target.searchParams.set(key, value) })
  try {
    const upstream = await fetch(target, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    response.statusCode = upstream.status
    response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
    response.setHeader('Cache-Control', 'private, max-age=60')
    response.end(new Uint8Array(await upstream.arrayBuffer()))
  } catch (cause) {
    console.error('[TMDB proxy] Upstream request failed.', { path, cause })
    response.statusCode = 502
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ status_message: 'Could not reach TMDB.' }))
  }
}
