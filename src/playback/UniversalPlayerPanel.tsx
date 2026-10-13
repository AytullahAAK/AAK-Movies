import { useEffect, useState } from 'react'
import { ExternalLink, FileVideo2 } from 'lucide-react'
import { builtInManifests, describeManifestResource } from './builtInManifests'
import { NativeVideoPlayer, type DirectMediaSource } from './NativeVideoPlayer'
import { getProgressKey, readWatchProgress, saveWatchProgress, removeWatchProgress, type WatchProgressContext } from './watchProgress'

export type UniversalMediaContext = {
  media_type: 'movie' | 'tv'
  tmdbId: number
  title: string
  poster?: string
  seasonNumber?: number
  episodeNumber?: number
  episodeId?: number
  episodeTitle?: string
}

type AddonStream = {
  id: string
  name?: string
  title?: string
  quality?: string
  language?: string
  size?: string | number
  sourceType?: string
  playbackKind: 'direct-video' | 'embed' | 'torrent' | 'external-link' | 'unsupported'
  url?: string
  contentType?: DirectMediaSource['contentType']
  externalUrl?: string
}
type AddonSourceState = { status: 'idle' | 'loading' | 'ready' | 'error'; message?: string; streams: AddonStream[] }

function isAddonStream(value: unknown): value is AddonStream {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const stream = value as Record<string, unknown>
  return typeof stream.id === 'string'
    && ['direct-video', 'embed', 'torrent', 'external-link', 'unsupported'].includes(String(stream.playbackKind))
    && ['name', 'title', 'quality', 'language', 'sourceType', 'url', 'externalUrl', 'contentType'].every(key => stream[key] === undefined || typeof stream[key] === 'string')
    && (stream.size === undefined || typeof stream.size === 'string' || typeof stream.size === 'number')
}

function emptyAddonStates(): Record<string, AddonSourceState> {
  return Object.fromEntries(builtInManifests.map(manifest => [manifest.provider, { status: 'idle', streams: [] }]))
}

export function UniversalPlayerPanel({ contextLabel = 'Personal video', mediaContext }: { contextLabel?: string; mediaContext?: UniversalMediaContext }) {
  const [title, setTitle] = useState(contextLabel)
  const [source, setSource] = useState<DirectMediaSource | null>(null)
  const [mediaError, setMediaError] = useState('')
  const [playerKey, setPlayerKey] = useState(0)
  const [addonSources, setAddonSources] = useState<Record<string, AddonSourceState>>(emptyAddonStates)
  const [embedSource, setEmbedSource] = useState<{ url: string; title: string } | null>(null)
  const [externalSource, setExternalSource] = useState<string | null>(null)
  const contextKey = mediaContext ? `${mediaContext.media_type}:${mediaContext.tmdbId}:${mediaContext.seasonNumber ?? ''}:${mediaContext.episodeNumber ?? ''}` : ''
  const progressContext: WatchProgressContext | null = mediaContext ? {
    media_type: mediaContext.media_type,
    tmdbId: mediaContext.tmdbId,
    seriesId: mediaContext.media_type === 'tv' ? mediaContext.tmdbId : undefined,
    seasonNumber: mediaContext.seasonNumber,
    episodeNumber: mediaContext.episodeNumber,
    episodeId: mediaContext.episodeId,
    title: mediaContext.title,
    poster: mediaContext.poster ?? '',
    episodeTitle: mediaContext.media_type === 'tv' ? mediaContext.episodeTitle : undefined,
  } : null
  const savedProgress = progressContext ? readWatchProgress().find(item => item.key === getProgressKey(progressContext)) : undefined
  const recordProgress = progressContext ? (position: number, duration: number) => saveWatchProgress(progressContext, position, duration) : undefined
  const completeProgress = progressContext ? () => removeWatchProgress(getProgressKey(progressContext)) : undefined

  useEffect(() => {
    setTitle(contextLabel)
    setSource(null)
    setEmbedSource(null)
    setExternalSource(null)
    setMediaError('')
    setPlayerKey(key => key + 1)
  }, [contextKey, contextLabel])

  useEffect(() => {
    if (!mediaContext) {
      setAddonSources(emptyAddonStates())
      return
    }
    const controller = new AbortController()
    const loadingStates = emptyAddonStates()
    for (const manifest of builtInManifests) loadingStates[manifest.provider] = { status: 'loading', streams: [] }
    setAddonSources(loadingStates)

    const startRequests = () => {
      for (const manifest of builtInManifests) {
        const query = new URLSearchParams({ media_type: mediaContext.media_type, tmdb_id: String(mediaContext.tmdbId) })
        if (mediaContext.media_type === 'tv') {
          query.set('season_number', String(mediaContext.seasonNumber))
          query.set('episode_number', String(mediaContext.episodeNumber))
        }
        void fetch(`/api/addons/${manifest.provider}?${query.toString()}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
          .then(async response => {
            let payload: unknown
            try {
              if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('Non-JSON response')
              payload = await response.json()
            } catch (cause) {
              console.warn('[Addon sources] The API returned an invalid response.', { provider: manifest.provider, status: response.status, cause })
              throw new Error(`${manifest.name} source list is unavailable. Please try again.`)
            }
            if (!response.ok) {
              const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : `${manifest.name} is unavailable.`
              throw new Error(message)
            }
            if (!payload || typeof payload !== 'object' || !('streams' in payload) || !Array.isArray(payload.streams)) throw new Error(`${manifest.name} returned an invalid response.`)
            if (controller.signal.aborted) return
            if (!payload.streams.every(isAddonStream)) throw new Error(`${manifest.name} returned an invalid source entry.`)
            const streams = payload.streams
            setAddonSources(current => ({ ...current, [manifest.provider]: { status: 'ready', streams } }))
          })
          .catch(cause => {
            if (controller.signal.aborted) return
            console.warn('[Addon sources] Request failed.', { provider: manifest.provider, message: cause instanceof Error ? cause.message : 'network error' })
            setAddonSources(current => ({ ...current, [manifest.provider]: { status: 'error', streams: [], message: cause instanceof Error ? cause.message : `${manifest.name} is unavailable.` } }))
          })
      }
    }
    // Defer by one task so React StrictMode's immediate development cleanup can
    // cancel its probe mount before any network requests are issued.
    const startTimer = window.setTimeout(startRequests, 0)
    return () => { window.clearTimeout(startTimer); controller.abort() }
  }, [contextKey])

  const selectAddonStream = (stream: AddonStream) => {
    setMediaError('')
    setEmbedSource(null)
    setExternalSource(null)
    setSource(null)
    if (stream.playbackKind === 'direct-video' && stream.url && stream.contentType) {
      setSource({ url: stream.url, contentType: stream.contentType })
      setTitle(stream.title || stream.name || contextLabel)
      setPlayerKey(key => key + 1)
    } else if (stream.playbackKind === 'embed' && stream.url) {
      setEmbedSource({ url: stream.url, title: stream.title || stream.name || contextLabel })
    } else if (stream.playbackKind === 'external-link' && stream.externalUrl) {
      setExternalSource(stream.externalUrl)
    } else if (stream.playbackKind === 'torrent') {
      setMediaError('This source needs a compatible authorized streaming service.')
    } else {
      setMediaError('This source format is not supported.')
    }
  }

  return <section className="universal-player" aria-label="Universal Player">
    <div className="universal-heading">
      <div><div className="section-kicker">TORRENT</div><h2>Addon sources</h2></div>
      <span className="source-kind"><FileVideo2 size={15} /> One player interface</span>
    </div>

    {mediaContext && <p className="universal-context" role="status">{mediaContext.title} · {mediaContext.media_type === 'movie' ? 'Movie' : 'TV series'} · TMDB ID {mediaContext.tmdbId}{mediaContext.media_type === 'tv' && Number.isSafeInteger(mediaContext.seasonNumber) && Number.isSafeInteger(mediaContext.episodeNumber) ? ` · S${mediaContext.seasonNumber}E${mediaContext.episodeNumber}` : ''}</p>}

    {source && <div className="native-player-wrap" key={playerKey}>
      <NativeVideoPlayer source={source} title={title.trim() || 'Video'} resumeAtSeconds={savedProgress?.position ?? 0} onProgress={recordProgress} onComplete={completeProgress} onError={() => setMediaError('This media could not be played. Check the file format, URL, and whether the host permits playback.')} />
    </div>}
    {embedSource && <div className="addon-embed-wrap"><iframe title={embedSource.title} src={embedSource.url} loading="eager" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" /><span>Loading player…</span></div>}
    {externalSource && <a className="button button-outline" href={externalSource} target="_blank" rel="noreferrer">Open source <ExternalLink size={14} /></a>}
    {mediaError && <p role="alert" className="form-error">{mediaError}</p>}

    <div className="builtin-source-sections" aria-label="Built-in addon sources">
      {builtInManifests.map(manifest => <section className="addon-source-section" key={manifest.id} aria-labelledby={`addon-${manifest.name}`}>
        <div className="addon-source-heading"><div><div className="section-kicker">BUILT-IN ADDON</div><h3 id={`addon-${manifest.name}`}>{manifest.name} Sources</h3></div><span className="addon-source-status">{addonSources[manifest.provider].status === 'loading' ? 'Loading' : addonSources[manifest.provider].status === 'error' ? 'Unavailable' : addonSources[manifest.provider].status === 'ready' ? `${addonSources[manifest.provider].streams.length} sources` : manifest.lookupStatus === 'needs-user-config' ? 'Setup required' : 'Not connected'}</span></div>
        <p>{manifest.lookupMessage}</p>
        <div className="addon-source-meta"><span>Types: {manifest.types.join(', ')}</span><span>Resources: {manifest.resources.map(describeManifestResource).join(', ')}</span><span>ID prefixes: {manifest.idPrefixes.join(', ') || 'Not declared'}</span></div>
        {addonSources[manifest.provider].status === 'loading' && <p className="addon-source-pending" role="status">Loading {manifest.name} sources…</p>}
        {addonSources[manifest.provider].status === 'error' && <p className="addon-source-error" role="alert">{addonSources[manifest.provider].message}</p>}
        {addonSources[manifest.provider].status === 'ready' && addonSources[manifest.provider].streams.length === 0 && <p className="addon-source-pending" role="status">No compatible sources found.</p>}
        {addonSources[manifest.provider].streams.map((stream, index) => <article className="addon-stream-entry" key={stream.id || `${manifest.provider}-${index}`}>
          <div><strong>{stream.title || stream.name || 'Source'}</strong>{stream.title && stream.name && <small>{stream.name}</small>}<div className="addon-stream-meta">{stream.quality && <span>{stream.quality}</span>}{stream.language && <span>{stream.language}</span>}{stream.size !== undefined && <span>{String(stream.size)}</span>}{stream.sourceType && <span>{stream.sourceType}</span>}</div></div>
          <button className="button button-outline" type="button" onClick={() => selectAddonStream(stream)}>Select source</button>
        </article>)}
        {!mediaContext && <p className="addon-source-pending" role="status">Open this player from a movie or TV episode to search sources.</p>}
        <a className="subtle-link" href={manifest.setupUrl} target="_blank" rel="noreferrer">Configure {manifest.name} <ExternalLink size={14} /></a>
      </section>)}
    </div>
  </section>
}
