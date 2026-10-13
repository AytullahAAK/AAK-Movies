import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const allowedPaths = /^\/(?:trending\/all\/day|search\/(?:movie|tv|multi)|genre\/(?:movie|tv)\/list|movie\/\d+|tv\/\d+(?:\/season\/\d+)?)$/
const allowedQueryKeys = new Set(['query', 'include_adult', 'append_to_response', 'language', 'page', 'region', 'with_original_language'])

function localTmdbProxy(env: Record<string, string>, mode: string): Plugin {
  return {
    name: 'aak-tmdb-local-proxy',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const req = request as typeof request & { url?: string; method?: string }
        const incoming = new URL(req.url ?? '/', 'http://localhost')
        if (!incoming.pathname.startsWith('/api/tmdb/')) return next()
        if (req.method !== 'GET') { response.statusCode = 405; response.end('Method not allowed'); return }
        const path = incoming.pathname.slice('/api/tmdb'.length)
        if (!allowedPaths.test(path)) { response.statusCode = 404; response.end('TMDB route not allowed'); return }
        const token = env.TMDB_READ_ACCESS_TOKEN
        const localApiKey = mode !== 'production' ? env.VITE_TMDB_API_KEY : undefined
        if (!token && !localApiKey) { response.statusCode = 503; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ status_message: 'TMDB server credentials are not configured.' })); return }
        const target = new URL(`https://api.themoviedb.org/3${path}`)
        incoming.searchParams.forEach((value, key) => { if (allowedQueryKeys.has(key)) target.searchParams.set(key, value) })
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`
        else if (localApiKey) target.searchParams.set('api_key', localApiKey)
        try {
          const upstream = await fetch(target, { headers })
          response.statusCode = upstream.status
          response.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
          response.setHeader('Cache-Control', 'private, max-age=60')
          response.end(new Uint8Array(await upstream.arrayBuffer()))
        } catch {
          response.statusCode = 502
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ status_message: 'Could not reach TMDB.' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const tmdbConfigured = Boolean(env.TMDB_READ_ACCESS_TOKEN || (mode !== 'production' && env.VITE_TMDB_API_KEY))
  return {
    plugins: [react(), localTmdbProxy(env, mode)],
    define: { 'import.meta.env.VITE_TMDB_CONFIGURED': JSON.stringify(tmdbConfigured) },
  }
})
