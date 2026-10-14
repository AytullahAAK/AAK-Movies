export const defaultAccent = '#42D9FF' as const
export type AccentValue = `#${string}`

export const accentPreferenceKey = 'aak-movies-accent'
export const lastCustomAccentPreferenceKey = 'aak-movies-last-custom-accent'

export function readPreference(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null } catch { return null }
}

export function writePreference(key: string, value: string): boolean {
  try { globalThis.localStorage?.setItem(key, value); return true } catch { return false }
}

export function storeCustomAccent(value: string): boolean {
  return isHexAccent(value) && value.toLowerCase() !== defaultAccent.toLowerCase()
    ? writePreference(lastCustomAccentPreferenceKey, value.toLowerCase())
    : false
}

export function isHexAccent(value: string): value is `#${string}` {
  return /^#[\da-f]{6}$/i.test(value)
}

export function isAccentValue(value: string | null): value is AccentValue {
  return !!value && isHexAccent(value)
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

export function getAccentColors(value: string) {
  const raw = isHexAccent(value) ? value : defaultAccent
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
  return value.toLowerCase() === defaultAccent.toLowerCase() ? 'Default' : 'Custom'
}
