/** Ideal transparent inks: RGB channels are transmitted fractions of white light.
 * Layering inks multiplies their transmittances; real opaque paints vary by pigment. */
export type RGB = readonly [number, number, number]
export const COLOR_NAMES = ['red', 'orange', 'brown', 'yellow', 'olive', 'chartreuse', 'green', 'emerald', 'cyan', 'teal', 'azure', 'blue', 'navy', 'violet', 'purple', 'magenta', 'rose', 'maroon', 'black', 'gray', 'pink', 'apricot', 'paleYellow', 'paleChartreuse', 'paleGreen', 'mint', 'paleCyan', 'lightAzure', 'periwinkle', 'lilac', 'paleMagenta', 'rosePink'] as const
export type ColorName = typeof COLOR_NAMES[number]
export interface Swatch { readonly rgb: RGB; readonly name: ColorName }
export const INKS: readonly Swatch[] = [
  { rgb: [0, 255, 255], name: 'cyan' }, { rgb: [255, 0, 255], name: 'magenta' },
  { rgb: [255, 255, 0], name: 'yellow' }, { rgb: [255, 0, 0], name: 'red' },
  { rgb: [0, 255, 0], name: 'green' }, { rgb: [0, 0, 255], name: 'blue' },
  { rgb: [255, 128, 0], name: 'orange' }, { rgb: [128, 255, 0], name: 'chartreuse' },
  { rgb: [0, 255, 128], name: 'emerald' }, { rgb: [0, 128, 255], name: 'azure' },
  { rgb: [128, 0, 255], name: 'violet' }, { rgb: [255, 0, 128], name: 'rose' },
  { rgb: [255, 160, 160], name: 'red' }, { rgb: [160, 255, 160], name: 'green' },
  { rgb: [160, 160, 255], name: 'blue' }, { rgb: [160, 255, 255], name: 'cyan' },
  { rgb: [255, 160, 255], name: 'magenta' }, { rgb: [255, 255, 160], name: 'yellow' },
]
export const mix = (inks: readonly RGB[]): RGB => [0, 1, 2].map(channel =>
  Math.round(255 * inks.reduce((value, rgb) => value * rgb[channel]! / 255, 1)),
) as unknown as RGB
export const hex = (rgb: RGB): string => `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`

/** Conventional hue families, with established names for their darker shades. */
export const nameColor = (rgb: RGB): ColorName => {
  const [r, g, b] = rgb
  const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low
  if (high < 20) return 'black'
  if (delta < 20) return 'gray'
  const hue = ((high === r ? (g - b) / delta : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360
  if (low >= 70 && high >= 220) {
    if (hue < 15 || hue >= 345) return 'pink'
    if (hue < 45) return 'apricot'
    if (hue < 75) return 'paleYellow'
    if (hue < 105) return 'paleChartreuse'
    if (hue < 135) return 'paleGreen'
    if (hue < 165) return 'mint'
    if (hue < 195) return 'paleCyan'
    if (hue < 225) return 'lightAzure'
    if (hue < 255) return 'periwinkle'
    if (hue < 285) return 'lilac'
    if (hue < 315) return 'paleMagenta'
    return 'rosePink'
  }
  if (hue < 15 || hue >= 345) return high < 150 ? 'maroon' : 'red'
  if (hue < 45) return high < 190 ? 'brown' : 'orange'
  if (hue < 75) return high < 190 ? 'olive' : 'yellow'
  if (hue < 105) return 'chartreuse'
  if (hue < 135) return 'green'
  if (hue < 165) return 'emerald'
  if (hue < 195) return high < 190 ? 'teal' : 'cyan'
  if (hue < 225) return 'azure'
  if (hue < 255) return high < 150 ? 'navy' : 'blue'
  if (hue < 285) return 'violet'
  if (hue < 315) return high < 190 ? 'purple' : 'magenta'
  return 'rose'
}
export interface Recipe { readonly sources: readonly number[]; readonly result: Swatch }
const recipes = (length: 2 | 3): readonly Recipe[] => {
  const result: Recipe[] = []
  for (let a = 0; a < INKS.length; a++) for (let b = a + 1; b < INKS.length; b++) {
    const add = (sources: readonly number[]) => {
      const rgb = mix(sources.map(index => INKS[index]!.rgb))
      // A visibly unchanged ink is not an informative mixing question.
      if (sources.some(index => hex(INKS[index]!.rgb) === hex(rgb))) return
      result.push({ sources, result: { rgb, name: nameColor(rgb) } })
    }
    if (length === 2) add([a, b])
    else for (let c = b + 1; c < INKS.length; c++) add([a, b, c])
  }
  return result
}
export const RECIPES = { 2: recipes(2), 3: recipes(3) } as const
export interface Puzzle { readonly recipe: number; readonly choices: readonly Swatch[]; readonly answer: number; readonly seed: number }
export const DEFAULT_SEED = 0xc0104f00
const random = (seed: number, count: number): readonly [number, number] => {
  const next = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0
  return [Math.floor(next / 0x100000000 * count), next]
}
export const makePuzzle = (seed: number, length: 2 | 3, previous = -1): Puzzle => {
  const pool = RECIPES[length]
  const names = [...new Set(pool.filter((_, index) => index !== previous).map(recipe => recipe.result.name))]
  let chosen: number
  ;[chosen, seed] = random(seed, names.length)
  const candidates = pool.map((recipe, index) => ({ recipe, index }))
    .filter(({ recipe, index }) => recipe.result.name === names[chosen] && index !== previous)
  const available = candidates.length ? candidates : pool.map((recipe, index) => ({ recipe, index }))
  ;[chosen, seed] = random(seed, available.length)
  const selected = available[chosen]!
  const alternatives = [...new Map(pool.map(recipe => [recipe.result.name, recipe.result])).values()]
    .filter(color => color.name !== selected.recipe.result.name)
  const choices: Swatch[] = [selected.recipe.result]
  for (let index = 0; index < 3; index++) {
    ;[chosen, seed] = random(seed, alternatives.length)
    choices.push(alternatives.splice(chosen, 1)[0]!)
  }
  ;[chosen, seed] = random(seed, choices.length)
  const first = choices[chosen]!
  choices[chosen] = choices[0]!
  choices[0] = first
  return { recipe: selected.index, choices, answer: chosen, seed }
}
