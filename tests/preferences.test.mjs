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

test('all named and custom accent colors retain readable contrast in light and AMOLED themes', () => {
  assert.equal(theme.accentPresets.length, 15)
  for (const choice of [...theme.accentPresets.map(item => item.id), '#9c59c7']) {
    const colors = theme.getAccentColors(choice)
    assert.ok(contrastRatio(colors.light, '#ffffff') >= 4.5, `${choice} light contrast`)
    assert.ok(contrastRatio(colors.night, '#000000') >= 4.5, `${choice} night contrast`)
    assert.ok(contrastRatio(colors.lightForeground, colors.light) >= 4.5, `${choice} light accent surface text`)
    assert.ok(contrastRatio(colors.nightForeground, colors.night) >= 4.5, `${choice} night accent surface text`)
  }
  assert.equal(theme.isAccentValue('#ff8800'), true)
  assert.equal(theme.isAccentValue('#fff'), false)
  assert.equal(theme.isAccentValue('blue'), true)
})

test('last custom accent is prioritized without duplicating a matching preset', () => {
  const custom = theme.getAccentChoices('#9842c8')
  assert.equal(custom[0].value, '#9842c8')
  assert.equal(custom[0].label, 'Your last custom color')
  assert.equal(custom.length, theme.accentPresets.length + 1)
  const matchingPreset = theme.getAccentChoices('#2563EB')
  assert.equal(matchingPreset[0].label, 'Your last custom color · Blue')
  assert.equal(matchingPreset[0].color, '#2563eb')
  assert.equal(matchingPreset.length, theme.accentPresets.length)
  assert.equal(matchingPreset.some(item => item.label === 'Blue'), false)
  assert.equal(theme.getAccentChoices('invalid').length, theme.accentPresets.length)
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

test('custom accent persists across later preset selections', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } })
  try {
    assert.equal(theme.storeCustomAccent('#A14FC7'), true)
    assert.equal(theme.readPreference(theme.lastCustomAccentPreferenceKey), '#a14fc7')
    theme.writePreference(theme.accentPreferenceKey, 'rose')
    assert.equal(theme.readPreference(theme.accentPreferenceKey), 'rose')
    assert.equal(theme.readPreference(theme.lastCustomAccentPreferenceKey), '#a14fc7')
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
})
