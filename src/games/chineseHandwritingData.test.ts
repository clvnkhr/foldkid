import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import catalogue from './chineseHandwritingCatalogue.json'
import { CHINESE_CHARACTERS, chineseHandwritingGuide, decodeChineseHandwritingMedians } from './chineseHandwritingData'

type EncodedRow = readonly [string, string, number, number, string]
const encodedRows = catalogue.characters as unknown as ReadonlyArray<EncodedRow>
const rows = encodedRows.map(([character, pinyin, tableIndex, strokeCount, encoded]) => [character, pinyin, tableIndex, decodeChineseHandwritingMedians(encoded, strokeCount)] as const)
const source = new Map(rows.map(row => [row[0], row]))
const indexOf = (character: string): number => CHINESE_CHARACTERS.findIndex(entry => entry.character === character)
const guideFor = (character: string) => chineseHandwritingGuide(indexOf(character))

describe('simplified Chinese handwriting catalogue', () => {
  it('includes all 3500 first-level mainland common characters and the available simple characters', () => {
    expect(CHINESE_CHARACTERS).toHaveLength(3673)
    expect(new Set(CHINESE_CHARACTERS.map(entry => entry.character)).size).toBe(3673)
    expect(CHINESE_CHARACTERS.filter(entry => entry.strokeCount <= 6)).toHaveLength(771)
    expect(CHINESE_CHARACTERS.filter(entry => entry.tableIndex <= 3500).map(entry => entry.tableIndex).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 3500 }, (_, index) => index + 1))
    expect(CHINESE_CHARACTERS.slice(0, 10).map(entry => entry.character)).toEqual(['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'])
  })

  it('provides single characters, correct simplified everyday forms and mainland pinyin', () => {
    for (const entry of CHINESE_CHARACTERS) {
      expect([...entry.character]).toHaveLength(1)
      expect(entry.character).toMatch(/^\p{Script=Han}$/u)
      expect(entry.pinyin.length).toBeGreaterThan(0)
      expect(entry.strokeCount).toBe(source.get(entry.character)![3].length)
    }
    for (const character of '爸妈你我吃喝睡玩猫狗车书门鸟鱼爱学习') expect(indexOf(character), character).toBeGreaterThanOrEqual(0)
    for (const traditionalOnly of '媽學國書車魚鳥') expect(indexOf(traditionalOnly), traditionalOnly).toBe(-1)
    expect(CHINESE_CHARACTERS[indexOf('妈')]!.pinyin).toBe('mā')
    expect(CHINESE_CHARACTERS[indexOf('水')]!.pinyin).toBe('shuǐ')
    expect(CHINESE_CHARACTERS[indexOf('爱')]!.pinyin).toBe('ài')
  })

  it('losslessly decodes the entire upstream geometry, including fractional coordinate escapes', () => {
    const digest = createHash('sha256')
    for (const [, , , medians] of rows) {
      const count = Buffer.alloc(4)
      count.writeUInt32LE(medians.length)
      digest.update(count)
      for (const stroke of medians) {
        const buffer = Buffer.alloc(4 + stroke.length * 16)
        buffer.writeUInt32LE(stroke.length)
        stroke.forEach(([x, y], index) => {
          buffer.writeDoubleLE(x, 4 + index * 16)
          buffer.writeDoubleLE(y, 12 + index * 16)
        })
        digest.update(buffer)
      }
    }
    // Fingerprint computed from the unencoded, pinned upstream medians by the importer.
    const upstreamFingerprint = '8d84e0d0ac9fec259e58015a9feaac36f0171643c03ffa7641c0d359f94efada'
    expect(digest.digest('hex')).toBe(upstreamFingerprint)
    expect(catalogue.medianSha256).toBe(upstreamFingerprint)
    expect(source.get('菌')![3][5]![0]).toEqual([619.75, 459])
  })

  it('rejects corrupt encoded geometry and invalid stroke metadata', () => {
    const encoded = encodedRows[0]![4]
    for (const count of [0, -1, 1.5, Infinity, NaN, 65]) expect(() => decodeChineseHandwritingMedians(encoded, count)).toThrow()
    for (const corrupt of ['', '!', btoa('\x02\x80'), btoa('\x02\x00'), btoa('\xff'.repeat(7)), btoa(atob(encoded) + '\0')]) {
      expect(() => decodeChineseHandwritingMedians(corrupt, 1)).toThrow()
    }
  })

  it('preserves every original median point, stroke index and pen direction when fitting guides', () => {
    const failures: string[] = []
    for (let index = 0; index < CHINESE_CHARACTERS.length; index++) {
      const entry = CHINESE_CHARACTERS[index]!
      const original = source.get(entry.character)![3]
      const guide = chineseHandwritingGuide(index)
      if (guide.text !== entry.character || guide.emoji !== '' || guide.width !== 160 || guide.height !== 160 || guide.strokes.length !== original.length) failures.push(`${entry.character}: guide metadata`)
      for (let strokeIndex = 0; strokeIndex < original.length; strokeIndex++) {
        const median = original[strokeIndex]!
        const stroke = guide.strokes[strokeIndex]!
        let previousPosition = 0
        for (const [x, y] of median) {
          const fitted = { x: 10 + x * 140 / 1024, y: 10 + (900 - y) * 140 / 1024 }
          const offset = stroke.slice(previousPosition).findIndex(point => Math.hypot(point.x - fitted.x, point.y - fitted.y) < 0.000001)
          if (offset < 0) failures.push(`${entry.character}: stroke ${strokeIndex} changed median or direction`)
          previousPosition += Math.max(0, offset)
        }
        for (let pointIndex = 0; pointIndex < stroke.length; pointIndex++) {
          const point = stroke[pointIndex]!
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x <= 10 || point.x >= 150 || point.y <= 10 || point.y >= 150) failures.push(`${entry.character}: point outside board`)
          if (pointIndex > 0) {
            const before = stroke[pointIndex - 1]!
            if (Math.hypot(point.x - before.x, point.y - before.y) > 2.500001) failures.push(`${entry.character}: gap between samples`)
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('keeps familiar horizontal, vertical, enclosing and closing strokes in their teaching sequence', () => {
    const horizontal = guideFor('一').strokes[0]!
    expect(horizontal.at(-1)!.x).toBeGreaterThan(horizontal[0]!.x)
    const ten = guideFor('十').strokes
    expect(ten).toHaveLength(2)
    expect(ten[0]!.at(-1)!.x - ten[0]![0]!.x).toBeGreaterThan(100)
    expect(ten[1]!.at(-1)!.y - ten[1]![0]!.y).toBeGreaterThan(100)
    const mouth = guideFor('口').strokes
    expect(mouth).toHaveLength(3)
    expect(mouth[0]!.at(-1)!.y).toBeGreaterThan(mouth[0]![0]!.y)
    expect(mouth[1]!.at(-1)!.x).toBeGreaterThan(mouth[1]![0]!.x)
    expect(mouth[1]!.at(-1)!.y).toBeGreaterThan(mouth[1]![0]!.y)
    expect(mouth[2]!.at(-1)!.x).toBeGreaterThan(mouth[2]![0]!.x)
    expect(Math.min(...mouth[2]!.map(point => point.y))).toBeGreaterThan(Math.min(...mouth[1]!.map(point => point.y)))
    expect(guideFor('日').strokes).toHaveLength(4)
    expect(guideFor('田').strokes).toHaveLength(5)
    expect(guideFor('女').strokes).toHaveLength(3)
    expect(guideFor('书').strokes).toHaveLength(4)
    expect(guideFor('学').strokes).toHaveLength(8)
    expect(guideFor('爱').strokes).toHaveLength(10)
  })

  it('returns stable immutable guides and safely falls back for malformed indices', () => {
    const first = chineseHandwritingGuide(0)
    expect(chineseHandwritingGuide(0)).toBe(first)
    for (const invalid of [-1, 1.2, Infinity, NaN, CHINESE_CHARACTERS.length]) expect(chineseHandwritingGuide(invalid)).toBe(first)
    expect(Object.isFrozen(CHINESE_CHARACTERS)).toBe(true)
    expect(Object.isFrozen(CHINESE_CHARACTERS[0])).toBe(true)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.strokes)).toBe(true)
    expect(Object.isFrozen(first.strokes[0])).toBe(true)
    expect(Object.isFrozen(first.strokes[0]![0])).toBe(true)
  })

  it('ships clear derivative notices, original licenses and a bounded entirely local data bundle', () => {
    expect(catalogue.notice).toContain('Copyright 1999 Arphic Technology Co., Ltd.')
    expect(catalogue.notice).toContain('2026-11-18')
    expect(catalogue.notice).toContain('unchanged ordered medians')
    const arphic = readFileSync(resolve('public/chinese-handwriting/ARPHICPL.TXT'), 'utf8')
    expect(arphic).toContain('ARPHIC PUBLIC LICENSE')
    expect(arphic).toContain('Copyright (C) 1999 Arphic Technology Co., Ltd.')
    const unicode = readFileSync(resolve('public/chinese-handwriting/UNICODE-LICENSE.txt'), 'utf8')
    expect(unicode).toContain('UNICODE LICENSE V3')
    const sources = readFileSync(resolve('public/chinese-handwriting/SOURCES.md'), 'utf8')
    expect(sources).toContain('ad1a9905cada18d07630acc27d438b070d753ec0')
    expect(sources).toContain('Twenty-seven rare simple characters')
    const data = readFileSync(resolve('src/games/chineseHandwritingCatalogue.json'))
    expect(data.byteLength).toBeLessThan(900_000)
    expect(gzipSync(data).byteLength).toBeLessThan(625_000)
  })
})
