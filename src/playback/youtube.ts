export type YouTubePlayer = {
  destroy: () => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  playVideo: () => void
  pauseVideo: () => void
  getPlayerState: () => number
  getIframe: () => HTMLIFrameElement
}

export type YouTubePlayerEvent = { data: number; target: YouTubePlayer }
export type YouTubePlayerOptions = {
  videoId?: string
  playerVars?: Record<string, string | number>
  events: {
    onReady: (event: { target: YouTubePlayer }) => void
    onStateChange: (event: YouTubePlayerEvent) => void
    onError: (event?: unknown) => void
    onAutoplayBlocked: () => void
  }
}

export type YouTubeApi = {
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
  Player: new (element: HTMLIFrameElement | HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YouTubeApi> | null = null

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    let settled = false
    let priorReady: (() => void) | undefined
    let handler: (() => void) | undefined
    const script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
    const timeout = window.setTimeout(() => finish(new Error('YouTube player API did not become ready.')), 12000)
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (handler && window.onYouTubeIframeAPIReady === handler) window.onYouTubeIframeAPIReady = priorReady
      if (error) reject(error)
      else if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube player API is unavailable.'))
    }
    priorReady = window.onYouTubeIframeAPIReady
    handler = () => {
      try { priorReady?.() } catch (error) { console.warn('[YouTube] Existing API callback failed.', error) }
      finish()
    }
    window.onYouTubeIframeAPIReady = handler
    if (!script) {
      const nextScript = document.createElement('script')
      nextScript.src = 'https://www.youtube.com/iframe_api'
      nextScript.async = true
      nextScript.onerror = () => finish(new Error('YouTube player API could not be loaded.'))
      document.head.append(nextScript)
    } else {
      script.addEventListener('error', () => finish(new Error('YouTube player API could not be loaded.')), { once: true })
    }
  }).catch(error => {
    apiPromise = null
    throw error
  })
  return apiPromise
}

export function makeYouTubeEmbedUrl(videoKey: string, options: { autoplay: boolean; muted: boolean; controls: boolean; loop?: boolean }) {
  const params = new URLSearchParams({
    autoplay: options.autoplay ? '1' : '0',
    mute: options.muted ? '1' : '0',
    controls: options.controls ? '1' : '0',
    playsinline: '1',
    rel: '0',
    cc_load_policy: '0',
    enablejsapi: '1',
    origin: window.location.origin,
  })
  if (options.loop) {
    params.set('loop', '1')
    params.set('playlist', videoKey)
  }
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoKey)}?${params.toString()}`
}
