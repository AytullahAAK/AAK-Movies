import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createAddonHandler } from './api/addons/[provider].ts'

const allowedPaths = /^\/(?:trending\/all\/day|search\/(?:movie|tv|multi)|genre\/(?:movie|tv)\/list|movie\/\d+(?:\/external_ids)?|tv\/\d+(?:\/external_ids|\/season\/\d+)?)$/
const allowedQueryKeys = new Set(['query', 'include_adult', 'append_to_response', 'language', 'page', 'region', 'with_original_language'])

function localTmdbProxy(env: Record<string, string>, mode: string): Plugin {
  return {
    name: 'aak-tmdb-local-proxy',
    configureServer(server) {
      const addonHandler = createAddonHandler(() => env)
      server.middlewares.use(async (request, response, next) => {
        const req = request as typeof request & { url?: string; method?: string }
        const incoming = new URL(req.url ?? '/', 'http://localhost')
        if (incoming.pathname.startsWith('/api/addons/')) {
          await addonHandler(req, response)
          return
        }
        if (incoming.pathname !== '/api/tmdb-proxy' && !incoming.pathname.startsWith('/api/tmdb/')) return next()
        if (req.method !== 'GET') { response.statusCode = 405; response.end('Method not allowed'); return }
        const path = incoming.pathname === '/api/tmdb-proxy' ? incoming.searchParams.get('path') ?? '' : incoming.pathname.slice('/api/tmdb'.length)
        const tmdbPath = path.startsWith('/') ? path : `/${path}`
        if (tmdbPath === '/status') {
          const token = env.TMDB_READ_ACCESS_TOKEN
          const localApiKey = mode !== 'production' ? env.VITE_TMDB_API_KEY : undefined
          const configured = Boolean(token || localApiKey)
          response.statusCode = configured ? 200 : 503
          response.setHeader('Content-Type', 'application/json')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify({ configured, credential: token ? 'TMDB_READ_ACCESS_TOKEN' : localApiKey ? 'VITE_TMDB_API_KEY (local only)' : 'TMDB_READ_ACCESS_TOKEN', message: configured ? 'A credential is present. This does not verify that TMDB accepts it.' : 'TMDB credentials are not configured.' }))
          return
        }
        if (!allowedPaths.test(tmdbPath)) { response.statusCode = 404; response.end('TMDB route not allowed'); return }
        const token = env.TMDB_READ_ACCESS_TOKEN
        const localApiKey = mode !== 'production' ? env.VITE_TMDB_API_KEY : undefined
        if (!token && !localApiKey) { response.statusCode = 503; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ status_message: 'TMDB server credentials are not configured.' })); return }
        const target = new URL(`https://api.themoviedb.org/3${tmdbPath}`)
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
        } catch (cause) {
          server.config.logger.error(`[TMDB local proxy] Upstream request failed for ${tmdbPath}: ${cause instanceof Error ? cause.message : 'unknown error'}`)
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
    define: { 'import.meta.env.VITE_TMDB_CONFIGURED': JSON.stringify(mode !== 'production' && tmdbConfigured) },
  }
})
