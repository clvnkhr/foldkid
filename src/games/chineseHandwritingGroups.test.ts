import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { translations, type Language } from '../i18n'
import { CHINESE_CHARACTERS as BASE_CHARACTERS } from './chineseHandwritingData'
import { BIANG_TARGET_INDEX, CHINESE_HANDWRITING_TARGETS as CHINESE_CHARACTERS } from './chineseHandwritingTargets'
import { BIANG_CHARACTER, BIANG_STROKE_COUNT } from './chineseHandwritingBiang'
import radicalData from './chineseHandwritingRadicals.json'
import {
  CHINESE_HANDWRITING_CATEGORIES, MAX_CHINESE_HANDWRITING_GROUP_SIZE,
  chineseCategoryLabel, findChineseHandwritingGroup, getChineseHandwritingCategory,
} from './chineseHandwritingGroups'

const charactersIn = (id: string): string => getChineseHandwritingCategory(id)!.groups
  .flatMap(group => group.indices.map(index => CHINESE_CHARACTERS[index]!.character)).join('')
const indexOf = (character: string): number => CHINESE_CHARACTERS.findIndex(entry => entry.character === character)
const categoryIndices = (id: string): ReadonlyArray<number> => getChineseHandwritingCategory(id)!.groups.flatMap(group => group.indices)
const radicalMemberships = new Map(radicalData.characters as unknown as ReadonlyArray<readonly [string, ReadonlyArray<number>]>)

describe('Chinese handwriting categories and small groups', () => {
  it('adds Biang as a separate vector-backed target without changing the source catalogue', () => {
    expect(BASE_CHARACTERS).toHaveLength(3673)
    expect(BIANG_TARGET_INDEX).toBe(BASE_CHARACTERS.length)
    expect(CHINESE_CHARACTERS.slice(0, BASE_CHARACTERS.length)).toEqual(BASE_CHARACTERS)
    expect(CHINESE_CHARACTERS).toHaveLength(BASE_CHARACTERS.length + 1)
    const category = getChineseHandwritingCategory('biang')!
    expect(category.kind).toBe('special')
    expect(category.groups).toEqual([{ indices: [BIANG_TARGET_INDEX] }])
    expect(charactersIn('biang')).toBe(BIANG_CHARACTER)
    expect(findChineseHandwritingGroup(BIANG_TARGET_INDEX)!.categoryId).toBe('biang')
    expect(categoryIndices(`stroke-${BIANG_STROKE_COUNT}`)).toContain(BIANG_TARGET_INDEX)
    expect(categoryIndices('component-162')).toContain(BIANG_TARGET_INDEX)
    expect(findChineseHandwritingGroup(BIANG_TARGET_INDEX, `stroke-${BIANG_STROKE_COUNT}`)!.categoryId).toBe(`stroke-${BIANG_STROKE_COUNT}`)
    expect(findChineseHandwritingGroup(BIANG_TARGET_INDEX, 'component-162')!.categoryId).toBe('component-162')
    expect(Object.isFrozen(CHINESE_CHARACTERS)).toBe(true)
    expect(Object.isFrozen(CHINESE_CHARACTERS[BIANG_TARGET_INDEX])).toBe(true)
  })

  it('keeps every character reachable through both a family and its stroke count in groups of at most twenty', () => {
    expect(MAX_CHINESE_HANDWRITING_GROUP_SIZE).toBe(20)
    const indices = CHINESE_HANDWRITING_CATEGORIES.flatMap(category => category.groups.flatMap(group => group.indices))
    expect(indices.length).toBeGreaterThan(CHINESE_CHARACTERS.length * 2)
    expect(new Set(indices).size).toBe(CHINESE_CHARACTERS.length)
    expect([...new Set(indices)].sort((left, right) => left - right)).toEqual(CHINESE_CHARACTERS.map((_, index) => index))
    const familyIndices = CHINESE_HANDWRITING_CATEGORIES.filter(category => category.kind !== 'strokes')
      .flatMap(category => category.groups.flatMap(group => group.indices))
    expect(new Set(familyIndices).size).toBe(CHINESE_CHARACTERS.length)
    expect(new Set(CHINESE_HANDWRITING_CATEGORIES.map(category => category.id)).size).toBe(CHINESE_HANDWRITING_CATEGORIES.length)
    for (const category of CHINESE_HANDWRITING_CATEGORIES) {
      const members = category.groups.flatMap(group => group.indices)
      expect(new Set(members).size, category.id).toBe(members.length)
      expect(category.groups.length, category.id).toBeGreaterThan(0)
      for (const group of category.groups) {
        expect(group.indices.length, category.id).toBeGreaterThan(0)
        expect(group.indices.length, category.id).toBeLessThanOrEqual(20)
        expect(group.indices.every(index => Number.isSafeInteger(index) && index >= 0 && index < CHINESE_CHARACTERS.length)).toBe(true)
      }
    }
  })

  it('starts with useful themes instead of a long sequence of arbitrary pages', () => {
    expect(CHINESE_HANDWRITING_CATEGORIES[0]!.id).toBe('numbers')
    expect(charactersIn('numbers')).toBe('一二三四五六七八九十零百千万')
    expect(charactersIn('family')).toContain('父母爸妈')
    expect(charactersIn('animals')).toContain('猫狗牛羊马鸟鱼虫兔')
    expect(charactersIn('food')).toContain('米饭菜肉蛋')
    expect(charactersIn('colors')).toContain('红黄蓝绿黑白')
    expect(charactersIn('positions')).toContain('上下中左右前后里外')
    expect(charactersIn('time')).toContain('春夏秋冬')
    const themes = CHINESE_HANDWRITING_CATEGORIES.filter(category => category.kind === 'theme')
    expect(themes).toHaveLength(21)
    expect(themes.every(category => category.groups.length === 1)).toBe(true)
  })

  it('includes every matching character in each stroke-count category, including characters in familiar themes', () => {
    const categories = CHINESE_HANDWRITING_CATEGORIES.filter(category => category.kind === 'strokes')
    expect(categories.length).toBeGreaterThan(0)
    const strokeCounts = categories.map(category => category.strokeCount!)
    expect(strokeCounts).toEqual([...strokeCounts].sort((left, right) => left - right))
    expect(categories.some(category => category.groups.length > 1)).toBe(true)
    for (const category of categories) {
      expect(category.id).toBe(`stroke-${category.strokeCount}`)
      const indices = category.groups.flatMap(group => group.indices)
      expect(indices).toEqual(CHINESE_CHARACTERS.flatMap((entry, index) => entry.strokeCount === category.strokeCount ? [index] : []))
      expect(indices).toEqual([...indices].sort((left, right) => left - right))
      expect(category.groups.slice(0, -1).every(group => group.indices.length === 20)).toBe(true)
    }
    for (const character of '一二三人木心日月') {
      const index = indexOf(character)
      expect(categoryIndices(`stroke-${CHINESE_CHARACTERS[index]!.strokeCount}`), character).toContain(index)
      expect(findChineseHandwritingGroup(index)!.categoryId).not.toMatch(/^stroke-/)
    }
    expect(charactersIn('stroke-2')).toContain('二')
    expect(charactersIn('stroke-2')).toContain('人')
  })

  it('includes all Unicode dictionary-radical matches in each family, including themed and alternative memberships', () => {
    const components = CHINESE_HANDWRITING_CATEGORIES.filter(category => category.kind === 'component')
    expect(components).toHaveLength(208)
    for (const category of components) {
      expect(categoryIndices(category.id)).toEqual(CHINESE_CHARACTERS.flatMap((entry, index) =>
        (index === BIANG_TARGET_INDEX ? category.radicalNumber === 162 : radicalMemberships.get(entry.character)!.includes(category.radicalNumber)) ? [index] : []))
      expect(category.groups.slice(0, -1).every(group => group.indices.length === 20)).toBe(true)
    }
    for (const character of '木林森') expect(charactersIn('component-75')).toContain(character)
    for (const character of '水江河清') expect(charactersIn('component-85')).toContain(character)
    for (const character of '心想怕') expect(charactersIn('component-61')).toContain(character)
    for (const character of '金钢银') expect(charactersIn('component-167')).toContain(character)
    expect(charactersIn('component-5')).toContain('习')
    expect(charactersIn('component-15')).toContain('习')
    expect(getChineseHandwritingCategory('component-120')!.component).toBe('糸 / 纟')
    expect(getChineseHandwritingCategory('component-149')!.component).toBe('言 / 讠')
    expect(getChineseHandwritingCategory('component-167')!.component).toBe('金 / 钅')
  })

  it('finds the precise category and group for every character and rejects unknown selections', () => {
    for (let index = 0; index < CHINESE_CHARACTERS.length; index++) {
      const location = findChineseHandwritingGroup(index)!
      const category = getChineseHandwritingCategory(location.categoryId)!
      expect(category.groups[location.groupIndex]!.indices).toContain(index)
      expect(category.kind).not.toBe('strokes')
    }
    for (const invalid of [-1, 1.5, NaN, Infinity, CHINESE_CHARACTERS.length]) expect(findChineseHandwritingGroup(invalid)).toBeUndefined()
    for (const invalid of ['', 'unknown', '__proto__', 'numbers-0', 'stroke-0']) expect(getChineseHandwritingCategory(invalid)).toBeUndefined()
  })

  it('preserves a requested overlapping category and otherwise prefers a familiar theme then its first-listed radical', () => {
    const wood = indexOf('木')
    expect(findChineseHandwritingGroup(wood)!.categoryId).toBe('nature')
    expect(findChineseHandwritingGroup(wood, 'component-75')!.categoryId).toBe('component-75')
    expect(findChineseHandwritingGroup(wood, 'stroke-4')!.categoryId).toBe('stroke-4')
    expect(findChineseHandwritingGroup(wood, 'numbers')!.categoryId).toBe('nature')
    expect(findChineseHandwritingGroup(wood, 'unknown')!.categoryId).toBe('nature')
    expect(findChineseHandwritingGroup(indexOf('清'))!.categoryId).toBe('component-85')
    for (const entry of radicalData.characters as unknown as ReadonlyArray<readonly [string, ReadonlyArray<number>]>) {
      const index = indexOf(entry[0])
      const canonical = findChineseHandwritingGroup(index)!
      const category = getChineseHandwritingCategory(canonical.categoryId)!
      if (category.kind === 'component') expect(category.radicalNumber, entry[0]).toBe(entry[1][0])
    }
    for (const category of CHINESE_HANDWRITING_CATEGORIES) for (const group of category.groups) for (const index of group.indices) {
      const location = findChineseHandwritingGroup(index, category.id)!
      expect(location.categoryId).toBe(category.id)
      expect(category.groups[location.groupIndex]!.indices).toContain(index)
    }
  })

  it('localizes both semantic categories and stroke-count categories without English fallbacks', () => {
    for (const language of Object.keys(translations) as Language[]) {
      for (const category of CHINESE_HANDWRITING_CATEGORIES) {
        const label = chineseCategoryLabel(category, language)
        expect(label.length).toBeGreaterThan(0)
        expect(label).not.toContain('undefined')
        expect(label).not.toContain('chineseHandwriting')
      }
    }
    expect(chineseCategoryLabel(getChineseHandwritingCategory('numbers')!, 'en')).toBe('Numbers')
    const strokeCategory = CHINESE_HANDWRITING_CATEGORIES.find(category => category.strokeCount === 6)!
    expect(chineseCategoryLabel(strokeCategory, 'en')).toBe('6 strokes')
    expect(chineseCategoryLabel(strokeCategory, 'zh')).toContain('6')
    expect(chineseCategoryLabel(strokeCategory, 'fa')).toContain('۶')
    expect(chineseCategoryLabel(getChineseHandwritingCategory('component-75')!, 'en')).toContain('木')
    expect(chineseCategoryLabel(getChineseHandwritingCategory('component-75')!, 'zh')).toContain('木')
  })

  it('pins the complete Unicode radical metadata independently of grouping code and keeps it small and local', () => {
    expect(radicalData.unihanSha256).toBe('f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e')
    expect(radicalData.radicalsSha256).toBe('826f83be25cd18fb8a5015a514704504e1982e840ea14d058bf583e1cc620c83')
    const hash = createHash('sha256').update(JSON.stringify(radicalData.characters)).digest('hex')
    expect(hash).toBe('1c7a321ea969e296dfa8a4a229ebc1d5e3f5ec630f02b11896802ae21a564eb8')
    expect(radicalData.classificationSha256).toBe(hash)
    expect(radicalMemberships.size).toBe(BASE_CHARACTERS.length)
    expect([...radicalMemberships.keys()].sort()).toEqual(BASE_CHARACTERS.map(entry => entry.character).sort())
    expect(radicalData.notice).toContain('Not an exhaustive visual-component decomposition')
    const bytes = readFileSync('src/games/chineseHandwritingRadicals.json')
    expect(bytes.byteLength).toBeLessThan(55_000)
    expect(gzipSync(bytes).byteLength).toBeLessThan(17_000)
  })

  it('exposes immutable categories, groups, and lookup results', () => {
    expect(Object.isFrozen(CHINESE_HANDWRITING_CATEGORIES)).toBe(true)
    for (const category of CHINESE_HANDWRITING_CATEGORIES) {
      expect(Object.isFrozen(category)).toBe(true)
      expect(Object.isFrozen(category.groups)).toBe(true)
      for (const group of category.groups) {
        expect(Object.isFrozen(group)).toBe(true)
        expect(Object.isFrozen(group.indices)).toBe(true)
      }
    }
    expect(Object.isFrozen(findChineseHandwritingGroup(0))).toBe(true)
  })
})
