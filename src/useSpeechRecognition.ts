import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechResult = { transcript: string }
type SpeechEvent = { results: ArrayLike<ArrayLike<SpeechResult>>; resultIndex: number }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function messageForSpeechError(error: string | undefined) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Microphone permission was denied. Allow access in your browser settings to use voice search.'
  if (error === 'audio-capture') return 'No microphone is available. Check the microphone and try again.'
  if (error === 'network') return 'Voice recognition is unavailable right now. Try typing your search.'
  return 'Voice search stopped unexpectedly. Try again or type your search.'
}

export function useSpeechRecognition(onTranscript: (transcript: string) => void) {
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const callback = useRef(onTranscript)
  callback.current = onTranscript
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const supported = Boolean(getSpeechRecognitionConstructor())

  const stop = useCallback(() => {
    try { recognition.current?.stop() } catch { /* Recognition may already be stopping. */ }
    setListening(false)
  }, [])

  const start = useCallback(() => {
    setError('')
    const Constructor = getSpeechRecognitionConstructor()
    if (!Constructor) {
      setError('Voice search is not supported in this browser. You can still type your search.')
      return
    }
    if (recognition.current) {
      try { recognition.current.stop() } catch { /* The existing session will end before a new one is created. */ }
      recognition.current = null
    }
    try {
      const next = new Constructor()
      next.lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
      next.continuous = false
      next.interimResults = false
      next.maxAlternatives = 1
      next.onresult = event => {
        const result = event.results[event.resultIndex]
        const transcript = result?.[0]?.transcript?.trim()
        if (transcript) callback.current(transcript)
      }
      next.onerror = event => {
        setError(messageForSpeechError(event.error))
        setListening(false)
      }
      next.onend = () => setListening(false)
      recognition.current = next
      next.start()
      setListening(true)
    } catch (cause) {
      console.warn('[Voice search] Could not start speech recognition.', cause)
      setError('Voice search could not start. Check microphone access or type your search.')
      setListening(false)
      recognition.current = null
    }
  }, [])

  useEffect(() => () => {
    try { recognition.current?.abort() } catch { /* Component is unmounting. */ }
    recognition.current = null
  }, [])

  return { listening, error, supported, start, stop }
}
