import catalogue from './chineseHandwritingCatalogue.json'
import type { HandwritingGuide, HandwritingPoint, HandwritingStroke } from './handwritingPaths'

// Original stroke sequence and pen direction: Hanzi Writer Data 2.0.1 / Make Me a Hanzi.
// Copyright 1999 Arphic Technology Co., Ltd.; Arphic Public License.
// FoldKid adaptation, 2026-11-18: single-character selection, board coordinates and resampling.
// Sources, exact version/checksums, coverage and license: public/chinese-handwriting/SOURCES.md.
type Median = ReadonlyArray<readonly [number, number]>
type Row = readonly [character: string, pinyin: string, tableIndex: number, strokeCount: number, medians: string]
const rows = catalogue.characters as unknown as ReadonlyArray<Row>

// Familiar, concrete characters first. All remaining entries keep the mainland common-character table order.
const familiar = [...new Set('一二三四五六七八九十人口手大小上下中山水火木土日月天地白云雨雪风田目耳牙心女子儿男女父母爸妈我你他她它好不有无是来去开关多少长短高低左右里外前后早晚年天星期花草树叶果米饭面鱼鸟虫马牛羊狗猫兔车门书笔衣鞋红黄蓝绿黑白'.split(''))]
const familiarOrder = new Map(familiar.map((character, index) => [character, index]))
const orderedRows = [...rows].sort((left, right) => {
  const a = familiarOrder.get(left[0])
  const b = familiarOrder.get(right[0])
  return a !== undefined && b !== undefined ? a - b : a !== undefined ? -1 : b !== undefined ? 1 : left[2] - right[2]
})

export interface ChineseCharacter {
  readonly character: string
  readonly pinyin: string
  readonly strokeCount: number
  readonly tableIndex: number
}

export const CHINESE_CHARACTERS: ReadonlyArray<ChineseCharacter> = Object.freeze(orderedRows.map(([character, pinyin, tableIndex, strokeCount]) =>
  Object.freeze({ character, pinyin, tableIndex, strokeCount }),
))

/** Decode one character only. Delta varints and float64 escapes retain every source coordinate exactly. */
export const decodeChineseHandwritingMedians = (encoded: string, strokeCount: number): ReadonlyArray<Median> => {
  if (!Number.isSafeInteger(strokeCount) || strokeCount < 1 || strokeCount > 64) throw new Error('Invalid Chinese stroke count')
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  let offset = 0
  const readInteger = (): number => {
    let value = 0
    let multiplier = 1
    for (let count = 0; count < 6; count++) {
      const byte = bytes[offset++]
      if (byte === undefined) throw new Error('Incomplete Chinese stroke data')
      value += (byte & 127) * multiplier
      if (byte < 128) return value
      multiplier *= 128
    }
    throw new Error('Invalid Chinese stroke integer')
  }
  const readCoordinate = (previous: number): number => {
    const integer = readInteger()
    let coordinate: number
    if (integer === 0) {
      if (offset + 8 > bytes.length) throw new Error('Incomplete Chinese stroke coordinate')
      coordinate = view.getFloat64(offset, true)
      offset += 8
    } else {
      const zigzag = integer - 1
      coordinate = previous + (zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2)
    }
    if (!Number.isFinite(coordinate) || Math.abs(coordinate) > 2048) throw new Error('Invalid Chinese stroke coordinate')
    return coordinate
  }
  const medians: Median[] = []
  for (let index = 0; index < strokeCount; index++) {
    const length = readInteger()
    if (length < 2 || length > 256) throw new Error('Invalid Chinese stroke length')
    const median: Array<readonly [number, number]> = []
    let x = 0
    let y = 0
    for (let pointIndex = 0; pointIndex < length; pointIndex++) {
      x = readCoordinate(x)
      y = readCoordinate(y)
      median.push([x, y])
    }
    medians.push(median)
  }
  if (offset !== bytes.length) throw new Error('Unexpected Chinese stroke data')
  return medians
}

const point = ([x, y]: readonly [number, number]): HandwritingPoint => ({ x: 10 + x * 140 / 1024, y: 10 + (900 - y) * 140 / 1024 })
const resample = (median: Median): HandwritingStroke => {
  const points: HandwritingPoint[] = [point(median[0]!)]
  for (let index = 1; index < median.length; index++) {
    const from = point(median[index - 1]!)
    const to = point(median[index]!)
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2.5))
    for (let step = 1; step <= count; step++) points.push({ x: from.x + (to.x - from.x) * step / count, y: from.y + (to.y - from.y) * step / count })
  }
  return Object.freeze(points.map(value => Object.freeze(value)))
}

// Resample only the characters actually visited, rather than allocating thousands of guides at startup.
const guides = new Map<number, HandwritingGuide>()
export const chineseHandwritingGuide = (index: number): HandwritingGuide => {
  const validIndex = Number.isSafeInteger(index) && index >= 0 && index < orderedRows.length ? index : 0
  const cached = guides.get(validIndex)
  if (cached) return cached
  const row = orderedRows[validIndex]!
  const guide = Object.freeze({
    text: row[0], emoji: '', width: 160, height: 160,
    strokes: Object.freeze(decodeChineseHandwritingMedians(row[4], row[3]).map(resample)),
  })
  guides.set(validIndex, guide)
  return guide
}
