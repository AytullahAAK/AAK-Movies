import { handleTmdbProxy, type TmdbProxyRequest, type TmdbProxyResponse } from './_tmdbProxy.ts'

export default function handler(request: TmdbProxyRequest, response: TmdbProxyResponse) {
  return handleTmdbProxy(request, response)
}
