import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function importTypeScript(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8')
  const { outputText: code } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

const progress = await importTypeScript('src/playback/watchProgress.ts')
const theme = await importTypeScript('src/theme.ts')
const audioPreference = await importTypeScript('src/playback/audioPreference.ts')
const youtube = await importTypeScript('src/playback/youtube.ts')

const movie = { media_type: 'movie', tmdbId: 550, title: 'Example Film', poster: '/poster.jpg' }
const episode = { media_type: 'tv', tmdbId: 1396, seriesId: 1396, seasonNumber: 2, episodeNumber: 3, episodeId: 42, title: 'Example Series', poster: '/episode.jpg', episodeTitle: 'Episode Name' }

test('local playback progress is distinct per movie and TV episode', () => {
  assert.equal(progress.getProgressKey(movie), 'movie:550')
  assert.equal(progress.getProgressKey(episode), 'tv:1396:2:3')
  assert.notEqual(progress.getProgressKey(episode), progress.getProgressKey({ ...episode, episodeNumber: 4 }))
})

test('playback progress deduplicates, sorts newest first, and clears at the 95 percent completion threshold', () => {
  const first = progress.upsertProgress([], movie, 300, 1200, 10)
  assert.equal(first.length, 1)
  const updated = progress.upsertProgress(first, movie, 480, 1200, 20)
  assert.equal(updated.length, 1)
  assert.equal(updated[0].position, 480)
  const second = progress.upsertProgress(updated, episode, 600, 1200, 30)
  assert.deepEqual(second.map(item => item.key), ['tv:1396:2:3', 'movie:550'])
  assert.equal(progress.isProgressComplete(1139, 1200), false)
  assert.equal(progress.isProgressComplete(1140, 1200), true)
  assert.equal(progress.upsertProgress(second, episode, 1140, 1200, 40).some(item => item.key === 'tv:1396:2:3'), false)
})

function luminance(hex) {
  const values = hex.slice(1).match(/.{2}/g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
}

function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + .05) / (low + .05)
}

test('the default and custom accent colors retain readable contrast in light and AMOLED themes', () => {
  assert.equal(theme.defaultAccent, '#42D9FF')
  for (const choice of [theme.defaultAccent, '#9c59c7', '#242424', '#f0c442']) {
    const colors = theme.getAccentColors(choice)
    assert.ok(contrastRatio(colors.light, '#ffffff') >= 4.5, `${choice} light contrast`)
    assert.ok(contrastRatio(colors.night, '#000000') >= 4.5, `${choice} night contrast`)
    assert.ok(contrastRatio(colors.lightForeground, colors.light) >= 4.5, `${choice} light accent surface text`)
    assert.ok(contrastRatio(colors.nightForeground, colors.night) >= 4.5, `${choice} night accent surface text`)
  }
  assert.equal(theme.isAccentValue('#ff8800'), true)
  assert.equal(theme.isAccentValue('#fff'), false)
  assert.equal(theme.isAccentValue('blue'), false)
})

test('custom accent values are validated and named independently from the default', () => {
  assert.equal(theme.accentLabel(theme.defaultAccent), 'Default')
  assert.equal(theme.accentLabel('#9842c8'), 'Custom')
  assert.equal(theme.isHexAccent('#42d9ff'), true)
  assert.equal(theme.isHexAccent('#42d9f'), false)
})

test('accent preference storage has a safe in-memory fallback when browser storage is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('storage blocked') } })
  try {
    assert.equal(theme.readPreference(theme.lastCustomAccentPreferenceKey), null)
    assert.equal(theme.writePreference(theme.lastCustomAccentPreferenceKey, '#9c59c7'), false)
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})

test('last custom accent persists while the active accent returns to the default', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } })
  try {
    assert.equal(theme.storeCustomAccent('#A14FC7'), true)
    assert.equal(theme.readPreference(theme.lastCustomAccentPreferenceKey), '#a14fc7')
    theme.writePreference(theme.accentPreferenceKey, theme.defaultAccent)
    assert.equal(theme.readPreference(theme.accentPreferenceKey), theme.defaultAccent)
    assert.equal(theme.readPreference(theme.lastCustomAccentPreferenceKey), '#a14fc7')
    assert.equal(theme.storeCustomAccent(theme.defaultAccent), false)
    assert.equal(theme.readPreference(theme.lastCustomAccentPreferenceKey), '#a14fc7')
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})

test('audio preference persists explicit mute choices and defaults safely to muted', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map()
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  try {
    assert.equal(audioPreference.readAudioMutedPreference(), true)
    const seen = []
    const unsubscribe = audioPreference.subscribeAudioMutedPreference(value => seen.push(value))
    audioPreference.writeAudioMutedPreference(false)
    assert.equal(audioPreference.readAudioMutedPreference(), false)
    audioPreference.writeAudioMutedPreference(true)
    assert.equal(audioPreference.readAudioMutedPreference(), true)
    assert.deepEqual(seen, [false, true])
    unsubscribe()
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
  }
})

test('native video volume changes update the shared audio preference', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map([[audioPreference.audioPreferenceKey, 'true']])
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } })
  const listeners = new Map()
  const video = {
    muted: false,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type),
  }
  try {
    const cleanup = audioPreference.syncVideoAudioPreference(video)
    assert.equal(video.muted, true)
    listeners.get('volumechange')()
    video.muted = false
    listeners.get('volumechange')()
    assert.equal(audioPreference.readAudioMutedPreference(), false)
    cleanup()
    assert.equal(listeners.has('volumechange'), false)
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
  }
})

test('YouTube trailers avoid forcing captions and leave quality selection to YouTube', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://aak.example' } } })
  try {
    const url = youtube.makeYouTubeEmbedUrl('trailer123', { autoplay: true, muted: true, controls: false })
    const parsed = new URL(url)
    assert.equal(parsed.searchParams.get('cc_load_policy'), '0')
    assert.equal(parsed.searchParams.get('mute'), '1')
    assert.equal(parsed.searchParams.get('controls'), '0')
    assert.equal(parsed.searchParams.has('vq'), false)
    assert.equal(parsed.searchParams.has('suggestedQuality'), false)
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else delete globalThis.window
  }
})
