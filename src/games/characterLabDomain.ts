import catalogue from './characterLabCatalogue.json'
import scripts from './characterLabScripts.json'
import { characters as radicalCharacters, radicals as dictionaryRadicals } from './chineseHandwritingRadicals.json'

export interface CharacterDecomposition {
  readonly character: string
  readonly ids: string
  readonly parts: ReadonlyArray<string>
}
export interface CharacterRecipe extends CharacterDecomposition {
  readonly parts: readonly [string, string]
}
type SourceRecipe = readonly [character: string, ids: string, parts: readonly [string, string]]
type SourceDecomposition = readonly [character: string, ids: string, parts: ReadonlyArray<string>]
const sourceRecipes = catalogue.recipes as unknown as ReadonlyArray<SourceRecipe>
const sourceAdditional = catalogue.decompositions as unknown as ReadonlyArray<SourceDecomposition>
const excludedForms = new Set([
  ...scripts.traditionalOnly.map(([character]) => character as string),
  ...scripts.modernGlyphAliases.map(([character]) => character as string),
])
const scriptAliases = new Map<string, string>([
  ...scripts.ingredientAliases.map(([original, simplified]) => [original!, simplified!] as const),
  ...scripts.modernGlyphAliases.map(([original, modern]) => [original!, modern!] as const),
])
// Positional/simplified combining forms, not arbitrary visual lookalikes. See SOURCES.md.
const standaloneForms: Readonly<Record<string, string>> = Object.freeze({
  '亻': '人', '忄': '心', '扌': '手', '氵': '水', '灬': '火', '讠': '言', '钅': '金', '犭': '犬',
  '礻': '示', '纟': '糸', '饣': '食', '刂': '刀', '⺈': '刀', '爫': '爪', '艹': '艸', '辶': '辵',
  '糹': '糸', '釒': '金', '飠': '食', '⺮': '竹', '⺗': '心', '㣺': '心', '⺌': '小', '⺍': '小',
  '氺': '水', '衤': '衣', '⺼': '肉', '⺧': '牛', '牜': '牛', '⺶': '羊', '⺷': '羊', '耂': '老', '肀': '聿', '𧾷': '足',
  // The game deliberately treats the two mouth/enclosure tile shapes as one piece.
  '囗': '口',
})
/** Explicit script and positional aliases only; ambiguous traditional forms have no invented replacement. */
export const canonicalCharacter = (character: string): string => {
  if (!scriptAliases.has(character) && !Object.hasOwn(standaloneForms, character)) return character
  let current = character
  const visited = new Set<string>()
  while (!visited.has(current)) {
    visited.add(current)
    const next = scriptAliases.get(current) ?? (Object.hasOwn(standaloneForms, current) ? standaloneForms[current] : undefined)
    if (!next || next === current) return current
    current = next
  }
  return character
}
export const isTraditionalCharacterLabForm = (character: string): boolean => excludedForms.has(character)
const noForms: ReadonlyArray<string> = Object.freeze([])
const variants = new Map<string, ReadonlyArray<string>>()
for (const original of new Set(Object.values(standaloneForms))) {
  variants.set(original, Object.freeze(Object.keys(standaloneForms).filter(form =>
    form !== '囗' && !excludedForms.has(form) && standaloneForms[form] === original)))
}
export const radicalForms = (character: string): ReadonlyArray<string> => variants.get(canonicalCharacter(character)) ?? noForms

// Keep raw source IDS in the pinned catalogue; modernize only playable ingredients,
// e.g. the simplified 宫 source uses 呂, which becomes the loose piece 吕.
const sourceDecompositions: ReadonlyArray<CharacterDecomposition> = [...sourceRecipes, ...sourceAdditional]
  .filter(([character]) => !excludedForms.has(character))
  .map(([character, ids, parts]) => Object.freeze({ character, ids, parts: Object.freeze(parts.map(canonicalCharacter)) }))
const possibleDecompositions = new Map(sourceDecompositions.map(decomposition => [decomposition.character, decomposition]))
// Unicode counterparts can supply genuine modern components absent from the selected
// dictionary graph: 昜→𠃓 keeps 杨/汤/肠 available, and 習→习 keeps 褶/熠 available.
const modernIngredientBases = sourceDecompositions.flatMap(decomposition => decomposition.parts)
  .filter(character => !possibleDecompositions.has(character))
// Standard simplified counterparts such as 书 remain available even when their
// source describes no reliable inner structure; do not invent a split for them.
// Optional supplementary-plane additions need local glyph data first. Required
// source ingredients such as 𠃓 are retained separately above and rendered as SVG.
const standardModernBases = scripts.standardModernTargets.map(canonicalCharacter)
  .filter(character => !possibleDecompositions.has(character) && character.codePointAt(0)! <= 0xffff)
export const CHARACTER_LAB_BASES: ReadonlyArray<string> = Object.freeze([...new Set([
  ...catalogue.bases, ...Object.keys(standaloneForms), ...Object.values(standaloneForms), ...modernIngredientBases, ...standardModernBases,
])].filter(character => !excludedForms.has(character)))
const baseSet = new Set(CHARACTER_LAB_BASES)
const complete = new Map<string, boolean>()
const hasCompleteIngredients = (character: string, trail: ReadonlySet<string> = new Set()): boolean => {
  if (baseSet.has(character)) return true
  const cached = complete.get(character)
  if (cached !== undefined) return cached
  const decomposition = possibleDecompositions.get(character)
  if (!decomposition || trail.has(character)) return false
  const next = new Set([...trail, character])
  const result = decomposition.parts.length > 1 && decomposition.parts.every(part => hasCompleteIngredients(part, next))
  complete.set(character, result)
  return result
}
/** Traditional-only targets and unresolved ingredient chains never become playable tiles or outputs. */
export const CHARACTER_LAB_DECOMPOSITIONS: ReadonlyArray<CharacterDecomposition> = Object.freeze(
  sourceDecompositions.filter(decomposition => hasCompleteIngredients(decomposition.character)),
)
const activeDecompositions = new Map(CHARACTER_LAB_DECOMPOSITIONS.map(decomposition => [decomposition.character, decomposition]))
export const CHARACTER_LAB_RECIPES: ReadonlyArray<CharacterRecipe> = Object.freeze(sourceRecipes.flatMap(([character]) => {
  const decomposition = activeDecompositions.get(character)
  return decomposition && decomposition.parts.length === 2 ? [decomposition as CharacterRecipe] : []
}))
const decompositions = activeDecompositions
const pairKey = (a: string, b: string): string => [a, b].sort().join('\u0000')

export const CHARACTER_LAB_CHARACTERS: ReadonlyArray<string> = Object.freeze([
  ...CHARACTER_LAB_BASES, ...CHARACTER_LAB_DECOMPOSITIONS.map(recipe => recipe.character),
])
const known = new Set(CHARACTER_LAB_CHARACTERS)
export const isCharacterLabCharacter = (character: string): boolean => known.has(character)

/** Every valid source output for either combining forms or their full originals. */
export const mergeCandidates = (a: string, b: string): ReadonlyArray<string> => mergeGroupCandidates([a, b])

/** A deterministic representative for contact detection; gameplay samples mergeCandidates. */
export const mergeCharacters = (a: string, b: string): string | undefined => mergeCandidates(a, b)[0]

/** Immediate playable components, normalized from the unchanged source IDS. */
export const splitCharacter = (character: string): ReadonlyArray<string> => decompositions.get(canonicalCharacter(character))?.parts ?? []

const leaves = new Map<string, ReadonlyArray<string>>()
export const MAX_CHARACTER_LAB_COMPONENTS = 60
const noComponents: ReadonlyArray<string> = Object.freeze([])
const collectBases = (character: string, visited: ReadonlySet<string>): ReadonlyArray<string> => {
  const cached = leaves.get(character)
  if (cached) return cached
  if (!known.has(character) || visited.has(character)) return noComponents
  if (baseSet.has(character)) {
    const result = Object.freeze([canonicalCharacter(character)])
    leaves.set(character, result)
    return result
  }
  const recipe = decompositions.get(character)
  if (!recipe) return noComponents
  const next = new Set([...visited, character])
  const parts = recipe.parts.map(part => collectBases(part, next))
  const total = parts.reduce((count, part) => count + part.length, 0)
  const result = parts.length > 1 && parts.every(part => part.length > 0) && total <= MAX_CHARACTER_LAB_COMPONENTS
    ? Object.freeze(parts.flat()) : noComponents
  leaves.set(character, result)
  return result
}

/** Tap-to-pop uses base radicals: 森 becomes three 木 pieces, even when it was dropped directly. */
export const baseComponents = (character: string): ReadonlyArray<string> => {
  const canonical = canonicalCharacter(character)
  return leaves.get(canonical) ?? collectBases(canonical, new Set())
}

/** Cached counts keep capacity checks independent of decomposition depth. */
export const characterComponentCount = (character: string): number => baseComponents(character).length

// Concrete everyday pieces first; ordering is a teaching choice, not a lexical frequency claim.
const everydayPriority = [...'一人口大小日月木水火土女之子手心目耳山石田禾米艸竹言金门宀犬虫鸟马鱼牛羊衣食足车十力刀又']
const unicodeRadicals = dictionaryRadicals as unknown as ReadonlyArray<readonly [number, string]>
const allCombiners = new Set([
  ...CHARACTER_LAB_BASES.map(canonicalCharacter),
  ...unicodeRadicals.flatMap(([, label]) => label.split(/\s*\/\s*/u).map(canonicalCharacter)),
].filter(character => known.has(character)))
const familiarRadicals = [...new Set(everydayPriority.map(canonicalCharacter))].filter(character => allCombiners.has(character))
const familiarSet = new Set(familiarRadicals)
// The handwriting importer writes all 3,500 first-level TGH characters first,
// ordered by table index. Reuse its small metadata, not the stroke geometry.
const commonTargets = new Set(radicalCharacters.slice(0, 3500).map(([character]) => character as string))
const ingredientFrequency = new Map<string, number>()
const score = (character: string, weight: number): void => {
  const ingredient = canonicalCharacter(character)
  ingredientFrequency.set(ingredient, (ingredientFrequency.get(ingredient) ?? 0) + weight)
}
for (const decomposition of CHARACTER_LAB_DECOMPOSITIONS) {
  if (!commonTargets.has(decomposition.character)) continue
  decomposition.parts.forEach(ingredient => score(ingredient, 2))
  baseComponents(decomposition.character).forEach(ingredient => score(ingredient, 1))
}
/** Every basic combiner, with everyday pieces and common-character ingredients ahead of rare structures. */
export const CHARACTER_LAB_COMMON_RADICALS: ReadonlyArray<string> = Object.freeze([
  ...familiarRadicals,
  ...[...allCombiners].filter(character => !familiarSet.has(character)).sort((first, second) =>
    (ingredientFrequency.get(second) ?? 0) - (ingredientFrequency.get(first) ?? 0) || first.codePointAt(0)! - second.codePointAt(0)!),
])
const common = new Set(CHARACTER_LAB_COMMON_RADICALS)
export const CHARACTER_LAB_PALETTE: ReadonlyArray<string> = Object.freeze([...new Set([
  ...'青明林森好休清字家',
  ...'木日月人亻女子口火水氵土心忄扌讠艹宀门马石田力目一十寸又也大小白王玉山钅雨虫米禾',
  ...'刀犬示爪糸食辵',
  ...CHARACTER_LAB_CHARACTERS,
].map(canonicalCharacter))].filter(character => known.has(character) && !common.has(character)))

export interface CharacterJoinPattern { readonly parts: ReadonlyArray<string> }
interface JoinIndex {
  readonly outputs: ReadonlyMap<string, ReadonlyArray<string>>
  readonly patterns: ReadonlyMap<string, ReadonlyArray<CharacterJoinPattern>>
}
const groupKey = (parts: ReadonlyArray<string>): string => parts.map(canonicalCharacter).sort().join('\u0000')
const noPatterns: ReadonlyArray<CharacterJoinPattern> = Object.freeze([])
let joinIndex: JoinIndex | undefined
const getJoinIndex = (): JoinIndex => {
  if (joinIndex) return joinIndex
  const outputs = new Map<string, string[]>()
  const patterns = new Map<string, CharacterJoinPattern[]>()
  const indexed = new Set<string>()
  const add = (character: string, ingredients: ReadonlyArray<string>): void => {
    if (ingredients.length < 2 || ingredients.length > MAX_CHARACTER_LAB_COMPONENTS) return
    const parts = ingredients.map(canonicalCharacter).sort()
    const key = parts.join('\u0000')
    const candidates = outputs.get(key) ?? []
    if (!candidates.includes(character)) candidates.push(character)
    outputs.set(key, candidates)
    if (parts.length < 3 || indexed.has(key)) return
    indexed.add(key)
    const pattern = Object.freeze({ parts: Object.freeze(parts) })
    const pairs = new Set<string>()
    for (let first = 0; first < parts.length; first++) for (let second = first + 1; second < parts.length; second++) {
      const pair = pairKey(parts[first]!, parts[second]!)
      if (pairs.has(pair)) continue
      pairs.add(pair)
      const matches = patterns.get(pair) ?? []
      matches.push(pattern)
      patterns.set(pair, matches)
    }
  }
  for (const decomposition of CHARACTER_LAB_DECOMPOSITIONS) {
    add(decomposition.character, decomposition.parts)
    add(decomposition.character, baseComponents(decomposition.character))
  }
  joinIndex = Object.freeze({
    outputs: new Map([...outputs].map(([key, candidates]) => [key, Object.freeze(candidates)])),
    patterns: new Map([...patterns].map(([key, matches]) => [key, Object.freeze(matches.sort((first, second) => first.parts.length - second.parts.length))])),
  })
  return joinIndex
}

/** Multisets preserve repeated ingredients: 品 needs three 口, not one nearby 口. */
export const mergeGroupCandidates = (parts: ReadonlyArray<string>): ReadonlyArray<string> => {
  if (parts.length < 2 || parts.length > MAX_CHARACTER_LAB_COMPONENTS || parts.some(part => !known.has(canonicalCharacter(part)))) return noForms
  const index = getJoinIndex()
  const literal = index.outputs.get(groupKey(parts))
  if (literal) return literal
  // A previous pair may already have joined: regroup its verified base ingredients
  // only when no literal recipe exists, so 吕 + 口 can still become the three-mouth 品.
  const components = parts.map(baseComponents)
  const total = components.reduce((count, values) => count + values.length, 0)
  return total <= MAX_CHARACTER_LAB_COMPONENTS && components.every(values => values.length > 0)
    ? index.outputs.get(groupKey(components.flat())) ?? noForms : noForms
}

/** Pair-indexed multi-piece recipes keep the collision runtime independent of catalogue size. */
export const multiJoinPatterns = (a: string, b: string): ReadonlyArray<CharacterJoinPattern> => known.has(canonicalCharacter(a)) && known.has(canonicalCharacter(b))
  ? getJoinIndex().patterns.get(pairKey(canonicalCharacter(a), canonicalCharacter(b))) ?? noPatterns : noPatterns

const componentCounts = new Map<string, ReadonlyMap<string, number>>()
const countComponents = (character: string): ReadonlyMap<string, number> => {
  const cached = componentCounts.get(character)
  if (cached) return cached
  const counts = new Map<string, number>()
  for (const part of baseComponents(character)) counts.set(part, (counts.get(part) ?? 0) + 1)
  componentCounts.set(character, counts)
  return counts
}
const characterSelector = (choices: ReadonlyArray<string>) => {
  const members = new Set(choices)
  let previousQuery = ''
  let previousSelection = choices
  return (query: string): ReadonlyArray<string> => {
    const normalized = [...query.normalize('NFC')].filter(character => !/\s/u.test(character)).map(canonicalCharacter).join('')
    if (normalized === previousQuery) return previousSelection
    const characters = [...normalized]
    let selection: ReadonlyArray<string>
    if (characters.length === 0) selection = choices
    else if (characters.length > MAX_CHARACTER_LAB_COMPONENTS || characters.some(character => !/^\p{Script=Han}$/u.test(character) || !known.has(character))) selection = noComponents
    else {
      const exact = [...new Set(characters.filter(character => members.has(character)))]
      const required = new Map<string, number>()
      for (const character of characters) for (const [part, count] of countComponents(character)) required.set(part, (required.get(part) ?? 0) + count)
      const exactSet = new Set(exact)
      selection = Object.freeze([...exact, ...choices.filter(character => {
        if (exactSet.has(character)) return false
        const counts = countComponents(character)
        for (const [part, count] of required) if ((counts.get(part) ?? 0) < count) return false
        return true
      })])
    }
    previousQuery = normalized
    previousSelection = selection
    return selection
  }
}
/** Find actual characters or all compounds containing the entered base components. */
export const selectCharacterPalette = characterSelector(CHARACTER_LAB_PALETTE)
/** Search the fixed combiner bank too, so moving a basic piece upward never hides it. */
const matchingCombiners = characterSelector(CHARACTER_LAB_COMMON_RADICALS)
let previousCombinerQuery = ''
let previousCombiners = CHARACTER_LAB_COMMON_RADICALS
export const selectCharacterCombiners = (query: string): ReadonlyArray<string> => {
  if (query === previousCombinerQuery) return previousCombiners
  const matches = matchingCombiners(query)
  const characters = [...query.normalize('NFC')].filter(character => !/\s/u.test(character)).map(canonicalCharacter)
  let selection = matches
  if (matches.length === 0 && characters.length > 0 && characters.length <= MAX_CHARACTER_LAB_COMPONENTS && characters.every(character => known.has(character))) {
    const ingredients = new Set(characters.flatMap(baseComponents))
    selection = Object.freeze(CHARACTER_LAB_COMMON_RADICALS.filter(character => ingredients.has(character)))
  }
  previousCombinerQuery = query
  previousCombiners = selection
  return selection
}

export const characterHash = (character: string): number => {
  let value = 0x811c9dc5
  for (const point of character) value = Math.imul(value ^ point.codePointAt(0)!, 0x01000193)
  return value >>> 0
}

const hsl = (hue: number, saturation: number, lightness: number): string => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1))
  const m = lightness - chroma / 2
  const [r, g, b] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x]
    : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${[r, g, b].map(value => Math.round((value + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

export interface CharacterColorTheme { readonly background: string; readonly ink: string; readonly border: string }
export interface CharacterColors { readonly hue: number; readonly light: CharacterColorTheme; readonly dark: CharacterColorTheme }
const colors = new Map<string, CharacterColors>()
export const characterColors = (character: string): CharacterColors => {
  character = canonicalCharacter(character)
  const cached = colors.get(character)
  if (cached) return cached
  const hash = characterHash(character)
  const hue = hash % 360
  const saturation = ((hash >>> 8) % 12) / 100
  const lightness = ((hash >>> 16) % 4) / 100
  const result = Object.freeze({
    hue,
    light: Object.freeze({ background: hsl(hue, .68 + saturation, .89 + lightness), ink: '#17223b', border: hsl(hue, .58, .3) }),
    dark: Object.freeze({ background: hsl(hue, .45 + saturation, .19 + lightness), ink: '#f8fafc', border: hsl(hue, .68, .64) }),
  })
  colors.set(character, result)
  return result
}
