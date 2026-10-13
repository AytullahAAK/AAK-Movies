import { handleTmdbProxy } from '../_tmdbProxy.ts'

export default function handler(request: Parameters<typeof handleTmdbProxy>[0], response: Parameters<typeof handleTmdbProxy>[1]) {
  return handleTmdbProxy(request, response)
}
