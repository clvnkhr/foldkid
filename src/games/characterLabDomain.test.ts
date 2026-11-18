import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import catalogue from './characterLabCatalogue.json'
import {
  CHARACTER_LAB_BASES, CHARACTER_LAB_CHARACTERS, CHARACTER_LAB_COMMON_RADICALS, CHARACTER_LAB_DECOMPOSITIONS, CHARACTER_LAB_PALETTE, CHARACTER_LAB_RECIPES, MAX_CHARACTER_LAB_COMPONENTS,
  baseComponents, canonicalCharacter, characterColors, characterComponentCount, characterHash, isCharacterLabCharacter, mergeCandidates, mergeCharacters, mergeGroupCandidates, multiJoinPatterns, radicalForms, selectCharacterPalette, splitCharacter,
} from './characterLabDomain'

type Node = string | { readonly operator: string; readonly children: ReadonlyArray<Node> }
const ARITY: Readonly<Record<string, number>> = { '⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2 }
const parse = (ids: string): Node => {
  const characters = [...ids]
  let cursor = 0
  const consume = (): Node => {
    const character = characters[cursor++]
    if (!character) throw new Error('Incomplete IDS')
    const arity = ARITY[character]
    return arity ? { operator: character, children: Array.from({ length: arity }, consume) } : character
  }
  const result = consume()
  if (cursor !== characters.length) throw new Error('Trailing IDS')
  return result
}
const serialize = (node: Node): string => typeof node === 'string' ? node : node.operator + node.children.map(serialize).join('')
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  })
  return .2126 * r! + .7152 * g! + .0722 * b!
}
const contrast = (a: string, b: string): number => {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
}

describe('Character Lab verified compositions', () => {
  it('ships the comprehensive pinned source with distinct characters and documented ambiguous pairs', () => {
    expect(catalogue.sourceCommit).toBe('bddc96d41bef78427ed0e034e9f7e31d71fd1b92')
    expect(catalogue.sourceSha256).toBe('744bb05d5b0742e9ee35c37791f94d56a173349b3367569e7ca11e510364d203')
    expect(catalogue.license).toBe('LGPL-3.0-or-later')
    expect(CHARACTER_LAB_RECIPES).toHaveLength(8517)
    expect(CHARACTER_LAB_DECOMPOSITIONS).toHaveLength(9073)
    expect(CHARACTER_LAB_CHARACTERS.length).toBeGreaterThan(9400)
    expect(new Set(CHARACTER_LAB_RECIPES.map(recipe => recipe.character)).size).toBe(CHARACTER_LAB_RECIPES.length)
    const collisionKeys = CHARACTER_LAB_RECIPES.map(recipe => [...recipe.parts].sort().join(''))
    expect(collisionKeys.length - new Set(collisionKeys).size).toBe(112)
    expect(new Set(CHARACTER_LAB_CHARACTERS).size).toBe(CHARACTER_LAB_CHARACTERS.length)
    for (const character of CHARACTER_LAB_CHARACTERS) {
      expect([...character]).toHaveLength(1)
      expect(character).toMatch(/^\p{Script=Han}$/u)
    }
    for (const recipe of CHARACTER_LAB_DECOMPOSITIONS) {
      expect(recipe.ids).not.toContain('？')
      expect(recipe.parts).not.toContain(recipe.character)
      expect(CHARACTER_LAB_BASES).not.toContain(recipe.character)
      for (const part of recipe.parts) expect(CHARACTER_LAB_CHARACTERS).toContain(part)
    }
  })

  it('keeps every component faithful to the source IDS, including ternary and anonymous subtrees', () => {
    const byCharacter = new Map<string, string>([
      ...catalogue.baseDecompositions.map(row => [row[0]!, row[1]!] as const),
      ...CHARACTER_LAB_DECOMPOSITIONS.map(recipe => [recipe.character, recipe.ids] as const),
    ])
    for (const recipe of CHARACTER_LAB_DECOMPOSITIONS) {
      const tree = parse(recipe.ids)
      expect(typeof tree).toBe('object')
      if (typeof tree === 'string') continue
      let cursor = 0
      const consume = (node: Node): void => {
        const part = recipe.parts[cursor]
        if (part !== undefined && (typeof node === 'string' ? node === part : byCharacter.get(part) === serialize(node))) cursor++
        else if (typeof node !== 'string') node.children.forEach(consume)
        else throw new Error(`Unsupported source component in ${recipe.character}: ${node}`)
      }
      tree.children.forEach(consume)
      expect(cursor, recipe.character).toBe(recipe.parts.length)
      expect(splitCharacter(recipe.character)).toEqual(recipe.parts)
    }
  })

  it('retains every valid source-backed collision output without duplicate weighting', () => {
    for (const recipe of CHARACTER_LAB_RECIPES) {
      const outputs = mergeCandidates(...recipe.parts)
      expect(outputs, recipe.character).toContain(recipe.character)
      expect(new Set(outputs).size).toBe(outputs.length)
      expect(mergeCandidates(recipe.parts[1], recipe.parts[0]), recipe.character).toBe(outputs)
      expect(Object.isFrozen(outputs)).toBe(true)
      expect(mergeCharacters(...recipe.parts)).toBe(outputs[0])
    }
    for (const recipe of CHARACTER_LAB_DECOMPOSITIONS) expect(mergeGroupCandidates(recipe.parts), recipe.character).toContain(recipe.character)
    expect(mergeCandidates('口', '口')).toEqual(expect.arrayContaining(['吕', '吅']))
    expect(mergeCandidates('木', '水')).toContain('沐')
    expect(mergeCandidates('人', '木')).toContain('休')
  })

  it.each([
    ['日', '月', '明'], ['木', '木', '林'], ['木', '林', '森'], ['人', '人', '从'], ['人', '从', '众'],
    ['亻', '木', '休'], ['女', '子', '好'], ['宀', '子', '字'], ['氵', '青', '清'], ['讠', '青', '请'],
    ['一', '一', '二'], ['一', '二', '三'], ['门', '口', '问'], ['门', '日', '间'],
  ])('combines the supported structural pair %s + %s into %s in either collision order', (a, b, result) => {
    expect(mergeCandidates(a, b)).toContain(result)
    expect(mergeCandidates(b, a)).toContain(result)
  })

  it('does not guess from shared dictionary radicals, semantic associations, or unsupported lookalikes', () => {
    for (const [a, b] of [['明', '明'], ['木', 'unknown'], ['', '日'], ['日月', '木'], ['𰻝', '木']]) {
      expect(mergeCharacters(a!, b!)).toBeUndefined()
    }
    expect(mergeCandidates('木', '口')).toEqual(expect.arrayContaining(['杏', '呆']))
    expect(mergeCandidates('木', '一')).toContain('本')
    expect(isCharacterLabCharacter('unknown')).toBe(false)
  })

  it('pops every supported compound within the board capacity and keeps bases intact', () => {
    expect(baseComponents('森')).toEqual(['木', '木', '木'])
    expect(baseComponents('众')).toEqual(['人', '人', '人'])
    expect(baseComponents('清')).toEqual(['水', '龶', '月'])
    expect(baseComponents('休')).toEqual(['人', '木'])
    for (const character of CHARACTER_LAB_CHARACTERS) {
      const parts = baseComponents(character)
      expect(parts.length).toBeGreaterThanOrEqual(1)
      expect(parts.length).toBeLessThanOrEqual(MAX_CHARACTER_LAB_COMPONENTS)
      expect(characterComponentCount(character)).toBe(parts.length)
      expect(Object.isFrozen(parts)).toBe(true)
      expect(baseComponents(character)).toBe(parts)
      for (const part of parts) expect(CHARACTER_LAB_BASES).toContain(part)
    }
    for (const character of CHARACTER_LAB_BASES) {
      expect(splitCharacter(character)).toEqual([])
      expect(baseComponents(character)).toEqual([canonicalCharacter(character)])
    }
    for (const invalid of ['', 'unknown', '𰻝', '木木']) {
      expect(splitCharacter(invalid)).toEqual([])
      expect(baseComponents(invalid)).toEqual([])
    }
  })

  it('offers every supported canonical character with the familiar shortcuts first', () => {
    expect(CHARACTER_LAB_COMMON_RADICALS).toHaveLength(16)
    expect(CHARACTER_LAB_PALETTE.length).toBeGreaterThan(9000)
    const choices = [...CHARACTER_LAB_COMMON_RADICALS, ...CHARACTER_LAB_PALETTE]
    expect(new Set(choices).size).toBe(choices.length)
    for (const character of choices) {
      expect(isCharacterLabCharacter(character)).toBe(true)
      expect(canonicalCharacter(character)).toBe(character)
      expect(baseComponents(character).length).toBeGreaterThan(0)
    }
    expect(new Set(choices)).toEqual(new Set(CHARACTER_LAB_CHARACTERS.map(canonicalCharacter)))
    expect(CHARACTER_LAB_PALETTE.slice(0, 8)).toEqual([...'青明林森好休清字'])
    expect(CHARACTER_LAB_PALETTE).toContain('明')
    expect(CHARACTER_LAB_PALETTE).toContain('林')
    expect(Object.isFrozen(CHARACTER_LAB_PALETTE)).toBe(true)
    expect(Object.isFrozen(CHARACTER_LAB_COMMON_RADICALS)).toBe(true)
    expect(Object.isFrozen(CHARACTER_LAB_CHARACTERS)).toBe(true)
    expect(Object.isFrozen(CHARACTER_LAB_RECIPES[0])).toBe(true)
    expect(Object.isFrozen(CHARACTER_LAB_RECIPES[0]!.parts)).toBe(true)
  })

  it('includes common formerly unsupported structures and complex simplified/traditional characters', () => {
    for (const character of [...'学画脑哭語國鬱鑫膀嚷耀謝曉']) {
      expect(CHARACTER_LAB_PALETTE, character).toContain(character)
      expect(splitCharacter(character).length, character).toBeGreaterThanOrEqual(2)
      expect(baseComponents(character).length, character).toBeGreaterThanOrEqual(2)
    }
    expect(baseComponents('学')).toEqual(['小', '冖', '子'])
    expect(baseComponents('哭')).toEqual(['口', '口', '犬'])
    expect(baseComponents('鑫')).toEqual(['金', '金', '金'])
    expect(baseComponents('豔')).toHaveLength(16)
  })

  it('finds exact characters or component combinations without hiding the fixed radicals', () => {
    expect(selectCharacterPalette('')).toBe(CHARACTER_LAB_PALETTE)
    expect(selectCharacterPalette('  \n')).toBe(CHARACTER_LAB_PALETTE)
    const heart = selectCharacterPalette('心')
    expect(heart).toContain('情')
    expect(heart).toContain('想')
    expect(heart).not.toContain('心')
    expect(selectCharacterPalette('忄')).toBe(heart)
    expect(selectCharacterPalette('清')[0]).toBe('清')
    const sunMoon = selectCharacterPalette('日 月')
    expect(sunMoon[0]).toBe('月')
    expect(sunMoon).toContain('明')
    expect(sunMoon).not.toContain('情')
    expect(selectCharacterPalette('木木')).toContain('林')
    expect(selectCharacterPalette('木木')).not.toContain('杏')
    expect(selectCharacterPalette('⺗')).toContain('情')
    for (const query of ['not Chinese', '木?', '𰻝', '__proto__', '木'.repeat(MAX_CHARACTER_LAB_COMPONENTS + 1)]) expect(selectCharacterPalette(query)).toEqual([])
    expect(Object.isFrozen(selectCharacterPalette('心'))).toBe(true)
  })

  it.each([
    ['亻', '人'], ['忄', '心'], ['扌', '手'], ['氵', '水'], ['灬', '火'], ['讠', '言'], ['钅', '金'], ['犭', '犬'],
    ['礻', '示'], ['纟', '糸'], ['饣', '食'], ['刂', '刀'], ['⺈', '刀'], ['爫', '爪'], ['艹', '艸'], ['辶', '辵'],
    ['糹', '糸'], ['釒', '金'], ['飠', '食'], ['⺮', '竹'], ['⺗', '心'], ['㣺', '心'], ['⺌', '小'], ['⺍', '小'],
    ['氺', '水'], ['衤', '衣'], ['⺼', '肉'], ['⺧', '牛'], ['牜', '牛'], ['⺶', '羊'], ['⺷', '羊'], ['耂', '老'], ['肀', '聿'], ['𧾷', '足'],
  ])('identifies combining form %s as standalone %s for dropping, splitting, and colors', (form, original) => {
    expect(canonicalCharacter(form)).toBe(original)
    expect(canonicalCharacter(original)).toBe(original)
    expect(radicalForms(original)).toContain(form)
    expect(radicalForms(form)).toBe(radicalForms(original))
    expect(Object.isFrozen(radicalForms(original))).toBe(true)
    expect(isCharacterLabCharacter(original)).toBe(true)
    expect(baseComponents(form)).toEqual([original])
    expect(characterColors(form)).toBe(characterColors(original))
  })

  it('only normalizes explicit source-backed forms, preserving ambiguous standalone characters', () => {
    for (const value of ['木', '王', '玉', '月', '阝', '草', '丝', '', 'unknown', '__proto__', 'constructor', 'toString']) {
      expect(canonicalCharacter(value)).toBe(value)
      expect(radicalForms(value)).toEqual([])
    }
    expect(radicalForms('刀')).toEqual(['刂', '⺈'])
  })

  it.each([
    ['人', '木', '休'], ['水', '青', '清'], ['心', '白', '怕'], ['手', '白', '拍'],
    ['言', '青', '请'], ['犬', '苗', '猫'], ['金', '同', '铜'], ['艸', '化', '花'],
  ])('accepts full-form ingredients %s + %s when the catalogue contains their combining recipe', (a, b, result) => {
    expect(mergeCandidates(a, b)).toContain(result)
    expect(mergeCandidates(b, a)).toContain(result)
  })

  it('shares complete candidate pools across full and combining forms without linguistic lookalike substitutions', () => {
    for (const [a, b, expected] of [
      ['人', '门', ['闪', '们']], ['人', '言', ['信', '认']], ['水', '白', ['泉', '泊']], ['人', '匕', ['仑', '化']],
    ] as const) expect(mergeCandidates(a, b)).toEqual(expect.arrayContaining([...expected]))
    expect(mergeCandidates('人', '门')).toBe(mergeCandidates('亻', '门'))
    expect(mergeCandidates('人', '言')).toBe(mergeCandidates('讠', '人'))
    expect(mergeCandidates('水', '白')).toBe(mergeCandidates('氵', '白'))
    expect(canonicalCharacter('囗')).toBe('口')
    expect(mergeCandidates('囗', '口')).toBe(mergeCandidates('口', '口'))
    expect(characterColors('囗')).toBe(characterColors('口'))
    expect(CHARACTER_LAB_PALETTE).not.toContain('囗')
    expect(radicalForms('口')).toEqual([])
  })

  it('joins repeated three-piece ingredients directly and indexes larger groups by touching pairs', () => {
    for (const [part, result] of [['口', '品'], ['木', '森'], ['日', '晶'], ['水', '淼'], ['火', '焱'], ['金', '鑫']]) {
      expect(mergeGroupCandidates([part!, part!, part!])).toContain(result)
      expect(multiJoinPatterns(part!, part!).some(pattern => pattern.parts.length === 3 && pattern.parts.every(value => value === part))).toBe(true)
    }
    const patterns = multiJoinPatterns('口', '口')
    expect(Object.isFrozen(patterns)).toBe(true)
    expect(patterns.map(pattern => pattern.parts.length)).toEqual(patterns.map(pattern => pattern.parts.length).sort((a, b) => a - b))
    for (const pattern of patterns) {
      expect(Object.isFrozen(pattern)).toBe(true)
      expect(Object.isFrozen(pattern.parts)).toBe(true)
      expect(pattern.parts.filter(part => part === '口').length).toBeGreaterThanOrEqual(2)
      expect(mergeGroupCandidates(pattern.parts).length).toBeGreaterThan(0)
    }
    expect(new Set(patterns.map(pattern => pattern.parts.join(''))).size).toBe(patterns.length)
    for (const parts of [[], ['木'], ['unknown', '木'], ['木木', '木'], Array.from({ length: MAX_CHARACTER_LAB_COMPONENTS + 1 }, () => '木')]) expect(mergeGroupCandidates(parts)).toEqual([])
    expect(multiJoinPatterns('unknown', '木')).toEqual([])
  })

  it('regroups verified ingredients after an earlier pair joined, without replacing literal candidate pools', () => {
    for (const mouths of ['吕', '回', '吅']) {
      expect(mergeCandidates(mouths, '口')).toContain('品')
      expect(mergeCandidates(mouths, '犬')).toContain('哭')
    }
    // This source has no named two-piece precursor for 京, so its three tiles join directly.
    expect(mergeCandidates('亠', '口')).toEqual([])
    expect(mergeGroupCandidates(['亠', '口', '小'])).toContain('京')
    expect(mergeCandidates('木', '林')).toEqual(['森'])
    expect(mergeCandidates('日', '月')).toEqual(['明'])
    expect(mergeCandidates('林', 'unknown')).toEqual([])
    expect(mergeGroupCandidates(Array.from({ length: MAX_CHARACTER_LAB_COMPONENTS }, () => '林'))).toEqual([])
  })

  it('keeps original data licensing and source material available alongside the app', () => {
    expect(readFileSync('public/character-lab/COPYING.txt', 'utf8')).toContain('dictionary.txt is derived from')
    expect(readFileSync('public/character-lab/LGPL-3.0.txt', 'utf8')).toContain('GNU LESSER GENERAL PUBLIC LICENSE')
    expect(readFileSync('public/character-lab/GPL-3.0.txt', 'utf8')).toContain('GNU GENERAL PUBLIC LICENSE')
    const sources = readFileSync('public/character-lab/SOURCES.md', 'utf8')
    expect(sources).toContain(catalogue.sourceCommit)
    expect(sources).toContain(catalogue.sourceSha256)
    expect(sources).toContain('not an etymological claim')
    expect(createHash('sha256').update(JSON.stringify(catalogue.recipes)).digest('hex'))
      .toBe('d9a240c48725860c9dcbb1af7c175227561eed6d098f51a2f60627657cb4c2f8')
    expect(createHash('sha256').update(JSON.stringify(catalogue.recipes.slice(0, 300))).digest('hex'))
      .toBe('40468f52657baf8ec920790ce84cc743fff7844c1d7b03222dde07f4383f0d81')
    expect(createHash('sha256').update(JSON.stringify(catalogue.decompositions)).digest('hex'))
      .toBe('3fe9edfb20169a3030108a3c17281ff2836727592e5c8203d7f247f9add9b1a2')
  })
})

describe('Character Lab deterministic theme colors', () => {
  it('hashes characters rather than piece IDs and supports supplementary Unicode codepoints', () => {
    expect(characterHash('a')).toBe(3826002220)
    expect(characterHash('木')).toBe(characterHash('木'))
    expect(characterHash('木')).not.toBe(characterHash('日'))
    expect(characterHash('𰻝')).not.toBe(characterHash('𰻞'))
    expect(characterHash('')).toBe(2166136261)
  })

  it('gives every supported character readable hex colors in both themes', () => {
    const hues = new Set<number>()
    for (const character of CHARACTER_LAB_CHARACTERS) {
      const value = characterColors(character)
      expect(value.hue).toBeGreaterThanOrEqual(0)
      expect(value.hue).toBeLessThan(360)
      expect(Object.isFrozen(value)).toBe(true)
      expect(characterColors(character)).toBe(value)
      hues.add(value.hue)
      for (const theme of [value.light, value.dark]) {
        for (const color of [theme.background, theme.ink, theme.border]) expect(color).toMatch(/^#[a-f0-9]{6}$/)
        expect(contrast(theme.ink, theme.background), character).toBeGreaterThanOrEqual(7)
        expect(contrast(theme.border, theme.background), character).toBeGreaterThanOrEqual(3)
      }
      expect(value.light).not.toEqual(value.dark)
    }
    expect(hues.size).toBe(360)
  })
})
