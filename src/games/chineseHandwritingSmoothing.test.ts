import { describe, expect, it } from 'vitest'
import { CHINESE_CHARACTERS, chineseHandwritingGuide } from './chineseHandwritingData'
import type { HandwritingPoint, HandwritingStroke } from './handwritingGeometry'
import { smoothChineseHandwritingPath } from './chineseHandwritingSmoothing'

type PathPart = { readonly command: 'M' | 'L' | 'Q'; readonly from: HandwritingPoint; readonly to: HandwritingPoint; readonly control?: HandwritingPoint }
const parts = (path: string): ReadonlyArray<PathPart> => {
  const tokens = path.split(/\s+/)
  const result: PathPart[] = []
  let from = { x: 0, y: 0 }
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++] as PathPart['command']
    expect(['M', 'L', 'Q']).toContain(command)
    const first = { x: Number(tokens[index++]), y: Number(tokens[index++]) }
    const control = command === 'Q' ? first : undefined
    const to = command === 'Q' ? { x: Number(tokens[index++]), y: Number(tokens[index++]) } : first
    expect([to.x, to.y, ...(control ? [control.x, control.y] : [])].every(Number.isFinite)).toBe(true)
    result.push({ command, from, to, ...(control ? { control } : {}) })
    from = to
  }
  return result
}
const samples = (part: PathPart): ReadonlyArray<HandwritingPoint> => Array.from({ length: 21 }, (_, index) => {
  const t = index / 20
  const u = 1 - t
  const c = part.control
  return c ? { x: u * u * part.from.x + 2 * u * t * c.x + t * t * part.to.x, y: u * u * part.from.y + 2 * u * t * c.y + t * t * part.to.y }
    : { x: part.from.x + (part.to.x - part.from.x) * t, y: part.from.y + (part.to.y - part.from.y) * t }
})
const distanceToSegment = (point: HandwritingPoint, a: HandwritingPoint, b: HandwritingPoint): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
}
const distanceToStroke = (point: HandwritingPoint, stroke: HandwritingStroke): number => Math.min(...stroke.slice(1).map((to, index) => distanceToSegment(point, stroke[index]!, to)))
const sourceIndex = (stroke: HandwritingStroke, point: HandwritingPoint): number => stroke.findIndex(candidate => candidate.x === point.x && candidate.y === point.y)

describe('Chinese handwriting display smoothing', () => {
  it('safely renders stronger curves across the complete character library without changing source geometry', () => {
    const failures: string[] = []
    const fail = (message: string): void => { if (failures.length < 20) failures.push(message) }
    let checkedStrokes = 0
    for (let index = 0; index < CHINESE_CHARACTERS.length; index++) {
      const guide = chineseHandwritingGuide(index)
      const before = JSON.stringify(guide)
      for (const [strokeIndex, stroke] of guide.strokes.entries()) {
        const label = `${guide.text}, stroke ${strokeIndex + 1}`
        const tokens = smoothChineseHandwritingPath(stroke, 'strong').split(/\s+/)
        let cursor = 0
        let position = stroke[0]!
        let previousControl = -1
        let first = true
        let invalid = false
        while (cursor < tokens.length) {
          const command = tokens[cursor++]
          if ((first ? command !== 'M' : command !== 'L' && command !== 'Q') ||
            cursor + (command === 'Q' ? 4 : 2) > tokens.length) {
            fail(`${label}: malformed path commands`)
            invalid = true
            break
          }
          const coordinate = { x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) }
          const control = command === 'Q' ? coordinate : undefined
          const next = control ? { x: Number(tokens[cursor++]), y: Number(tokens[cursor++]) } : coordinate
          if (![coordinate.x, coordinate.y, next.x, next.y].every(Number.isFinite)) {
            fail(`${label}: non-finite display coordinate`)
            invalid = true
            break
          }
          if (first && (next.x !== stroke[0]!.x || next.y !== stroke[0]!.y)) fail(`${label}: moved starting point`)
          if (control) {
            const source = stroke.findIndex((point, sourceIndex) => sourceIndex > previousControl && point.x === control.x && point.y === control.y)
            if (source < 0) fail(`${label}: changed source bend or stroke direction`)
            previousControl = source
            for (const t of [.25, .5, .75]) {
              const u = 1 - t
              const sample = { x: u * u * position.x + 2 * u * t * control.x + t * t * next.x,
                y: u * u * position.y + 2 * u * t * control.y + t * t * next.y }
              let nearest = Infinity
              for (let segment = 1; segment < stroke.length; segment++) nearest = Math.min(nearest, distanceToSegment(sample, stroke[segment - 1]!, stroke[segment]!))
              // The approved radius-8 quadratic can deviate by at most two board units.
              if (nearest > 2.000001) fail(`${label}: smoothing leaves the source corridor`)
            }
          }
          first = false
          position = next
        }
        if (!invalid && (position.x !== stroke.at(-1)!.x || position.y !== stroke.at(-1)!.y)) fail(`${label}: moved ending point`)
        checkedStrokes++
      }
      if (JSON.stringify(guide) !== before) fail(`${guide.text}: mutated source geometry`)
    }
    expect(CHINESE_CHARACTERS).toHaveLength(3673)
    expect(checkedStrokes).toBeGreaterThan(CHINESE_CHARACTERS.length)
    expect(failures).toEqual([])
  })

  it('rounds a corner rather than replacing its straight legs or moving endpoints', () => {
    const stroke = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const path = parts(smoothChineseHandwritingPath(stroke))
    expect(path[0]!.to).toEqual(stroke[0])
    expect(path.at(-1)!.to).toEqual(stroke.at(-1))
    const curve = path.find(part => part.command === 'Q')!
    expect(curve.from).toEqual({ x: 7, y: 0 })
    expect(curve.control).toEqual({ x: 10, y: 0 })
    expect(curve.to).toEqual({ x: 10, y: 3 })
    for (const point of samples(curve)) {
      expect(point.x).toBeGreaterThanOrEqual(7)
      expect(point.x).toBeLessThanOrEqual(10)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(3)
      expect(distanceToStroke(point, stroke)).toBeLessThanOrEqual(.750001)
    }
  })

  it('gives resampled straight runs the same rounding as their original median vertices', () => {
    const original = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]
    const resampled = Array.from({ length: 9 }, (_, index) => ({ x: index * 2.5, y: 0 }))
      .concat(Array.from({ length: 8 }, (_, index) => ({ x: 20, y: (index + 1) * 2.5 })))
    expect(smoothChineseHandwritingPath(resampled)).toBe(smoothChineseHandwritingPath(original))
  })

  it.each(['gentle', 'strong'] as const)('keeps hooks and reversals instead of cutting across a tight return: %s', strength => {
    for (const end of [{ x: 0, y: 0 }, { x: 2, y: 4 }]) {
      const original = [{ x: 0, y: 0 }, { x: 10, y: 0 }, end]
      const path = parts(smoothChineseHandwritingPath(original, strength))
      expect(path.map(part => part.command)).toEqual(['M', 'L', 'L'])
      expect(path.map(part => part.to)).toEqual(original)
    }
  })

  it.each(['gentle', 'strong'] as const)('caps short legs so adjacent corners cannot overlap or reverse the pen: %s', strength => {
    const original = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]
    const path = parts(smoothChineseHandwritingPath(original, strength))
    for (const part of path.slice(1)) {
      expect(part.to.x).toBeGreaterThanOrEqual(part.from.x)
      expect(part.to.y).toBeGreaterThanOrEqual(part.from.y)
      for (const point of samples(part)) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(2)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(1)
      }
    }
  })

  it('keeps gentle as the default and gives the stronger preview a larger bounded curve', () => {
    const stroke = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }]
    expect(smoothChineseHandwritingPath(stroke)).toBe(smoothChineseHandwritingPath(stroke, 'gentle'))
    const gentle = parts(smoothChineseHandwritingPath(stroke, 'gentle')).find(part => part.control)!
    const strong = parts(smoothChineseHandwritingPath(stroke, 'strong')).find(part => part.control)!
    expect(gentle.from).toEqual({ x: 27, y: 0 })
    expect(strong.from).toEqual({ x: 22, y: 0 })
    expect(strong.to).toEqual({ x: 30, y: 8 })
    expect(Math.max(...samples(strong).map(point => distanceToStroke(point, stroke)))).toBe(2)
    expect(Math.max(...samples(gentle).map(point => distanceToStroke(point, stroke)))).toBe(.75)
    expect(smoothChineseHandwritingPath(stroke, 'unsupported' as 'gentle')).toBe(smoothChineseHandwritingPath(stroke))
  })

  it.each([... '猫睡餐鹰'])('compares gentle and stronger %s curves without changing its source, order or endpoints', character => {
    const guide = chineseHandwritingGuide(CHINESE_CHARACTERS.findIndex(entry => entry.character === character))
    const before = JSON.stringify(guide)
    let largestTrimDifference = 0
    for (const stroke of guide.strokes) {
      const gentle = parts(smoothChineseHandwritingPath(stroke, 'gentle')).filter(part => part.control)
      const strong = parts(smoothChineseHandwritingPath(stroke, 'strong'))
      expect(strong[0]!.to).toEqual(stroke[0])
      expect(strong.at(-1)!.to).toEqual(stroke.at(-1))
      const strongCurves = strong.filter(part => part.control)
      expect(strongCurves).toHaveLength(gentle.length)
      let previousControl = -1
      for (const [index, curve] of strongCurves.entries()) {
        const source = sourceIndex(stroke, curve.control!)
        expect(source).toBeGreaterThan(previousControl)
        previousControl = source
        expect(curve.control).toEqual(gentle[index]!.control)
        largestTrimDifference = Math.max(largestTrimDifference, Math.hypot(curve.from.x - gentle[index]!.from.x, curve.from.y - gentle[index]!.from.y))
      }
      for (const part of strong.slice(1)) for (const point of samples(part)) expect(distanceToStroke(point, stroke)).toBeLessThanOrEqual(2.000001)
    }
    expect(largestTrimDifference).toBeGreaterThan(1.5)
    expect(JSON.stringify(guide)).toBe(before)
  })

  it.each([... '一口水心女妈'])('preserves %s source data, stroke direction and endpoints without display overshoot', character => {
    const guide = chineseHandwritingGuide(CHINESE_CHARACTERS.findIndex(entry => entry.character === character))
    const before = JSON.stringify(guide)
    let curves = 0
    for (const stroke of guide.strokes) {
      const path = parts(smoothChineseHandwritingPath(stroke))
      expect(path[0]!.to).toEqual(stroke[0])
      expect(path.at(-1)!.to).toEqual(stroke.at(-1))
      let previousControl = -1
      for (const part of path.slice(1)) {
        if (part.control) {
          const source = sourceIndex(stroke, part.control)
          expect(source).toBeGreaterThan(previousControl)
          previousControl = source
          curves++
        }
        for (const point of samples(part)) expect(distanceToStroke(point, stroke)).toBeLessThanOrEqual(.750001)
      }
    }
    expect(curves).toBeGreaterThan(0)
    expect(JSON.stringify(guide)).toBe(before)
  })

  it.each(['gentle', 'strong'] as const)('keeps every partial ink endpoint fixed while the stroke is being traced: %s', strength => {
    for (const character of '水猫睡餐鹰') {
      const guide = chineseHandwritingGuide(CHINESE_CHARACTERS.findIndex(entry => entry.character === character))
      for (const stroke of guide.strokes) for (let length = 1; length <= stroke.length; length++) {
        const prefix = stroke.slice(0, length)
        const path = parts(smoothChineseHandwritingPath(prefix, strength))
        expect(path[0]!.to).toEqual(prefix[0])
        expect(path.at(-1)!.to).toEqual(prefix.at(-1))
      }
    }
  })

  it('handles empty, duplicate, single-point and tiny strokes safely', () => {
    expect(smoothChineseHandwritingPath([])).toBe('')
    const point = Object.freeze({ x: 1.25, y: -2.5 })
    const duplicate = Object.freeze([point, point, { ...point }])
    expect(smoothChineseHandwritingPath(duplicate)).toBe('M 1.25 -2.5 L 1.25 -2.5')
    expect(smoothChineseHandwritingPath([point])).toBe(smoothChineseHandwritingPath(duplicate))
    const tiny = [{ x: 0, y: 0 }, { x: 1e-200, y: 0 }, { x: 1e-200, y: 1e-200 }]
    expect(parts(smoothChineseHandwritingPath(tiny)).at(-1)!.to).toEqual(tiny.at(-1))
  })

  it('rejects malformed coordinates rather than bridging missing portions of a stroke', () => {
    const valid = { x: 0, y: 0 }
    for (const invalid of [{ x: NaN, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: -Infinity }, { x: 10000, y: 0 }, { x: '1', y: 0 }, null, undefined]) {
      expect(smoothChineseHandwritingPath([valid, invalid, valid] as unknown as HandwritingStroke)).toBe('')
    }
    expect(smoothChineseHandwritingPath(new Array(3) as HandwritingStroke)).toBe('')
    expect(smoothChineseHandwritingPath(null as unknown as HandwritingStroke)).toBe('')
  })
})
