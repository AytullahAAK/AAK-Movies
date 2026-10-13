import { useState, type FormEvent } from 'react'
import { ExternalLink, FileVideo2, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { builtInManifests, describeManifestResource } from './builtInManifests'
import { NativeVideoPlayer, type DirectMediaSource } from './NativeVideoPlayer'

function parseDirectMediaUrl(value: string): DirectMediaSource {
  if (!value.trim()) throw new Error('Enter a direct HTTPS video URL.')
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Use a secure HTTPS direct video URL without embedded credentials.')
  }
  const extension = parsed.pathname.toLowerCase().split('.').pop()
  const contentType = extension === 'mp4' || extension === 'm4v' ? 'video/mp4'
    : extension === 'webm' ? 'video/webm'
      : extension === 'ogg' || extension === 'ogv' ? 'video/ogg' : null
  if (!contentType) {
    throw new Error('Use a direct MP4, WebM, or Ogg file URL. A webpage, embed, torrent, or manifest URL is not a video file.')
  }
  return { url: parsed.href, contentType }
}

export function UniversalPlayerPanel({ contextLabel = 'Personal video' }: { contextLabel?: string }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState(contextLabel)
  const [source, setSource] = useState<DirectMediaSource | null>(null)
  const [error, setError] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [selectedManifest, setSelectedManifest] = useState('')
  const [playerKey, setPlayerKey] = useState(0)

  const play = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMediaError('')
    try {
      const directSource = parseDirectMediaUrl(url.trim())
      setSource(directSource)
      setPlayerKey(key => key + 1)
    } catch (cause) {
      setSource(null)
      setError(cause instanceof Error ? cause.message : 'Enter a valid direct media URL.')
    }
  }

  return <section className="universal-player" aria-label="Universal Player">
    <div className="universal-heading">
      <div><div className="section-kicker">UNIVERSAL PLAYER</div><h2>Choose an authorized source</h2></div>
      <span className="source-kind"><FileVideo2 size={15} /> Direct media & manifest registry</span>
    </div>

    <form className="universal-direct-form" onSubmit={play}>
      <label>Video title
        <input className="admin-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="Video title" />
      </label>
      <label>Direct HTTPS video URL
        <input className="admin-input" value={url} onChange={event => setUrl(event.target.value)} type="url" inputMode="url" placeholder="https://media.example/video.mp4" aria-describedby="direct-url-help" />
      </label>
      <div className="direct-form-actions"><button className="button button-primary" type="submit">Play direct video</button><span id="direct-url-help">MP4, WebM, or Ogg only. A webpage, iframe, or torrent manifest is not a direct video file.</span></div>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {source && <div className="native-player-wrap" key={playerKey}>
      <NativeVideoPlayer source={source} title={title.trim() || 'Video'} onError={() => setMediaError('This media could not be played. Check the file format, URL, and whether the host permits playback.')} />
    </div>}
    {mediaError && <p role="alert" className="form-error">{mediaError}</p>}

    <fieldset className="builtin-source-list">
      <legend>Built-in Stremio manifest metadata</legend>
      <p className="builtin-intro">These supplied manifests are registered here for inspection. A manifest is not a video stream.</p>
      {builtInManifests.map(manifest => <label className={`builtin-source-card ${selectedManifest === manifest.id ? 'is-selected' : ''}`} key={manifest.id}>
        <input type="radio" name="builtin-manifest" value={manifest.id} checked={selectedManifest === manifest.id} onChange={() => setSelectedManifest(manifest.id)} />
        <span className="builtin-source-copy"><strong>{manifest.name} <small>v{manifest.version}</small></strong><span>{manifest.description}</span><small>ID: {manifest.id}</small><small>Types: {manifest.types.join(', ')}</small><small>Resources: {manifest.resources.map(describeManifestResource).join(', ')}</small><small>ID prefixes: {manifest.idPrefixes.join(', ') || 'Not declared'} · Catalogs: {manifest.catalogs === 0 ? 'none' : manifest.catalogs}</small><small>Configurable: {manifest.configurable ? 'yes' : 'no'} · Configuration required: {manifest.configurationRequired === undefined ? 'not stated' : manifest.configurationRequired ? 'yes' : 'no'}</small></span>
      </label>)}
      <p className="manifest-disabled-note"><LockKeyhole size={15} /> Stream lookup is disabled. The supplied JSON contains no addon base URL or configuration schema. Torrentio declares scraped torrent streams; HdHub’s authorization and usable endpoint are not established. A TMDB ID is not automatically a supported addon ID.</p>
      <Link className="subtle-link" to="/sources"><ExternalLink size={14} /> Open the manifest registry</Link>
    </fieldset>
    <p className="player-disclaimer">Use direct media only when you are authorized to play it. Browser support and host access policies still apply.</p>
  </section>
}
