export const accentPresets = [
  { id: 'blue', label: 'Blue', color: '#2563eb' },
  { id: 'sky-blue', label: 'Sky Blue', color: '#1684d8' },
  { id: 'cyan', label: 'Cyan', color: '#0891b2' },
  { id: 'teal', label: 'Teal', color: '#0f8a83' },
  { id: 'emerald', label: 'Emerald', color: '#07835d' },
  { id: 'green', label: 'Green', color: '#25803d' },
  { id: 'amber', label: 'Amber', color: '#a85a00' },
  { id: 'orange', label: 'Orange', color: '#c6530b' },
  { id: 'coral', label: 'Coral', color: '#cf5144' },
  { id: 'rose', label: 'Rose', color: '#be315b' },
  { id: 'pink', label: 'Pink', color: '#c02b87' },
  { id: 'violet', label: 'Violet', color: '#7044ca' },
  { id: 'purple', label: 'Purple', color: '#7933b0' },
  { id: 'indigo', label: 'Indigo', color: '#4f46bd' },
  { id: 'slate', label: 'Slate', color: '#52657d' },
] as const

export type AccentPreset = typeof accentPresets[number]['id']
export type AccentValue = AccentPreset | `#${string}`

export const accentPreferenceKey = 'aak-movies-accent'
export const lastCustomAccentPreferenceKey = 'aak-movies-last-custom-accent'

export function readPreference(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null } catch { return null }
}

export function writePreference(key: string, value: string): boolean {
  try { globalThis.localStorage?.setItem(key, value); return true } catch { return false }
}

export function storeCustomAccent(value: string): boolean {
  return isHexAccent(value) ? writePreference(lastCustomAccentPreferenceKey, value.toLowerCase()) : false
}

export type AccentChoice = { value: AccentValue; label: string; color: string; isLastCustom: boolean }

export function getAccentChoices(lastCustomColor: string | null): AccentChoice[] {
  const validCustom = lastCustomColor && isHexAccent(lastCustomColor) ? lastCustomColor.toLowerCase() as `#${string}` : null
  const matchingPreset = validCustom ? accentPresets.find(item => item.color.toLowerCase() === validCustom) : undefined
  const choices: AccentChoice[] = []
  if (validCustom) choices.push({
    value: validCustom,
    label: matchingPreset ? `Your last custom color · ${matchingPreset.label}` : 'Your last custom color',
    color: validCustom,
    isLastCustom: true,
  })
  for (const preset of accentPresets) {
    if (matchingPreset?.id === preset.id) continue
    choices.push({ value: preset.id, label: preset.label, color: preset.color, isLastCustom: false })
  }
  return choices
}

export function isHexAccent(value: string): value is `#${string}` {
  return /^#[\da-f]{6}$/i.test(value)
}

export function isAccentValue(value: string | null): value is AccentValue {
  return !!value && (isHexAccent(value) || accentPresets.some(item => item.id === value))
}

function luminance(hex: string) {
  const values = hex.slice(1).match(/.{2}/g)?.map(value => parseInt(value, 16) / 255) ?? [0, 0, 0]
  const linear = values.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + .05) / (low + .05)
}

function mix(hex: string, target: string, amount: number) {
  const from = hex.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16))
  const to = target.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16))
  return `#${from.map((value, index) => Math.round(value * (1 - amount) + to[index] * amount).toString(16).padStart(2, '0')).join('')}`
}

function accentForBackground(color: string, background: string, targetContrast: number) {
  if (contrast(color, background) >= targetContrast) return color
  const target = background === '#000000' ? '#ffffff' : '#101827'
  for (let amount = .05; amount <= .9; amount += .05) {
    const candidate = mix(color, target, amount)
    if (contrast(candidate, background) >= targetContrast) return candidate
  }
  return target
}

export function getAccentColors(value: AccentValue) {
  const raw = isHexAccent(value) ? value : accentPresets.find(item => item.id === value)?.color ?? '#2563eb'
  const light = accentForBackground(raw, '#ffffff', 4.5)
  const night = accentForBackground(raw, '#000000', 4.5)
  const foreground = (background: string) => contrast('#000000', background) >= contrast('#ffffff', background) ? '#000000' : '#ffffff'
  return {
    light,
    night,
    lightForeground: foreground(light),
    nightForeground: foreground(night),
  }
}

export function accentLabel(value: AccentValue) {
  return isHexAccent(value) ? 'Custom' : accentPresets.find(item => item.id === value)?.label ?? 'Blue'
}
