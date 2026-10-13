/**
 * Sanitized metadata copied from the two supplied manifest.json files and
 * checked against their published setup pages. No per-user config URLs,
 * signatures, provider keys, or returned streams belong in this registry.
 */
export type BuiltInManifest = {
  id: string
  provider: 'torrentio' | 'hdhub'
  name: string
  version: string
  description: string
  types: string[]
  resources: { name: string; types?: string[]; idPrefixes?: string[] }[]
  idPrefixes: string[]
  catalogs: number
  configurable: boolean
  configurationRequired?: boolean
  setupUrl: string
  serviceUrl?: string
  lookupStatus: 'disabled-unlicensed-scraper' | 'needs-user-config'
  lookupMessage: string
}

export type StremioResource = string | { name: string; types?: string[]; idPrefixes?: string[] }

export function describeManifestResource(resource: StremioResource) {
  if (typeof resource === 'string') return resource
  const types = resource.types?.length ? ` (${resource.types.join(', ')})` : ''
  const prefixes = resource.idPrefixes?.length ? ` [IDs: ${resource.idPrefixes.join(', ')}]` : ''
  return `${resource.name}${types}${prefixes}`
}

export const builtInManifests: BuiltInManifest[] = [
  {
    id: 'com.stremio.torrentio.addon',
    provider: 'torrentio',
    name: 'Torrentio',
    version: '0.0.15',
    description: 'Provides torrent streams from scraped torrent providers.',
    types: ['movie', 'series', 'anime', 'other'],
    resources: [{ name: 'stream', types: ['movie', 'series', 'anime'], idPrefixes: ['tt', 'kitsu'] }],
    idPrefixes: [],
    catalogs: 0,
    configurable: true,
    configurationRequired: false,
    setupUrl: 'https://torrentio.strem.fun',
    serviceUrl: 'https://torrentio.strem.fun/manifest.json',
    lookupStatus: 'disabled-unlicensed-scraper',
    lookupMessage: 'This addon returns scraped torrent listings. Enable it only with a configured provider and content you are authorized to access.',
  },
  {
    id: 'com.stremio.HdHub',
    provider: 'hdhub',
    name: 'HdHub',
    version: '1.0.7',
    description: 'Watch movies and series from HdHub.',
    types: ['movie', 'series', 'HdHub'],
    resources: [{ name: 'stream' }, { name: 'catalog' }],
    idPrefixes: ['tt', 'tmdb:', 'kitsu:'],
    catalogs: 0,
    configurable: true,
    setupUrl: 'https://hdhub.thevolecitor.qzz.io/',
    lookupStatus: 'needs-user-config',
    lookupMessage: 'Generate a configured manifest URL on HdHub and add it as a server environment variable. This app does not store per-user addon credentials.',
  },
]
