type VercelRequest = { method?: string }
type VercelResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }

/** Public configuration diagnostic. Reports presence only, never credential contents. */
export default function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end(JSON.stringify({ configured: false, message: 'Method not allowed.' }))
    return
  }

  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  const configured = Boolean(runtime.process?.env?.TMDB_READ_ACCESS_TOKEN)
  response.statusCode = configured ? 200 : 503
  response.end(JSON.stringify({
    configured,
    credential: 'TMDB_READ_ACCESS_TOKEN',
    authMethod: 'Authorization: Bearer',
    message: configured ? 'Server credential is present. This does not verify that TMDB accepts it.' : 'TMDB_READ_ACCESS_TOKEN is missing from this deployment environment.',
  }))
}
