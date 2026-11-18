import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { advanceHandwritingStroke } from './handwritingPaths'
import { smoothChineseHandwritingPath } from './chineseHandwritingSmoothing'
import { BIANG_CHARACTER, BIANG_COMPONENTS, BIANG_EIGHT_REGION, BIANG_PINYIN, BIANG_STROKE_COUNT, biangHandwritingGuide } from './chineseHandwritingBiang'

describe('font-independent simplified Biang vector guide', () => {
  it('uses the requested Unicode identity and common 42-stroke mainland form', () => {
    const guide = biangHandwritingGuide()
    expect([...BIANG_CHARACTER]).toHaveLength(1)
    expect(BIANG_CHARACTER.codePointAt(0)).toBe(0x30edd)
    expect(BIANG_PINYIN).toBe('biáng')
    expect(guide).toMatchObject({ text: BIANG_CHARACTER, emoji: '', width: 160, height: 160 })
    expect(guide.strokes).toHaveLength(BIANG_STROKE_COUNT)
    expect(BIANG_STROKE_COUNT).toBe(42)
    expect(BIANG_COMPONENTS.map(({ component, start, count }) => [component, start, count])).toEqual([
      ['穴', 0, 5], ['言', 5, 7], ['幺', 12, 3], ['幺', 15, 3],
      ['长', 18, 4], ['长', 22, 4], ['马', 26, 3], ['心', 29, 4],
      ['月', 33, 4], ['刂', 37, 2], ['辶', 39, 3],
    ])
  })

  it('keeps the roof above the inner rows, long forms either side of the horse, and the sweep below everything', () => {
    const strokes = biangHandwritingGuide().strokes
    const bounds = (start: number, count: number) => {
      const points = strokes.slice(start, start + count).flat()
      return { minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)), minY: Math.min(...points.map(point => point.y)), maxY: Math.max(...points.map(point => point.y)) }
    }
    const roof = bounds(0, 5)
    const speech = bounds(5, 7)
    const leftTwist = bounds(12, 3)
    const rightTwist = bounds(15, 3)
    const leftLong = bounds(18, 4)
    const rightLong = bounds(22, 4)
    const horse = bounds(26, 3)
    const heart = bounds(29, 4)
    const moon = bounds(33, 4)
    const blade = bounds(37, 2)
    const sweep = bounds(41, 1)
    expect(roof.maxY).toBeLessThan(speech.minY)
    expect(leftTwist.maxX).toBeLessThan(speech.minX)
    expect(rightTwist.minX).toBeGreaterThan(speech.maxX)
    expect(leftLong.maxX).toBeLessThan(horse.minX)
    expect(rightLong.minX).toBeGreaterThan(horse.maxX)
    expect(moon.maxX).toBeLessThan(leftLong.minX)
    expect(blade.minX).toBeGreaterThan(rightLong.maxX)
    expect(heart.minY).toBeGreaterThan(horse.maxY)
    expect(sweep.maxY).toBeGreaterThan(heart.maxY)
    expect(sweep.minX).toBeLessThan(moon.minX)
    expect(sweep.maxX).toBeGreaterThan(blade.maxX)
  })

  it('keeps each directed stroke drawable with the existing forgiving tracing geometry', () => {
    const guide = biangHandwritingGuide()
    for (const stroke of guide.strokes) {
      expect(stroke.length).toBeGreaterThanOrEqual(2)
      expect(stroke.length).toBeLessThanOrEqual(256)
      let progress = advanceHandwritingStroke(stroke, 0, stroke[0]!, stroke[0]!)
      for (let index = 1; index < stroke.length; index++) {
        const point = stroke[index]!
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
        expect(point.x).toBeGreaterThanOrEqual(10)
        expect(point.x).toBeLessThanOrEqual(150)
        expect(point.y).toBeGreaterThanOrEqual(10)
        expect(point.y).toBeLessThanOrEqual(150)
        expect(Math.hypot(point.x - stroke[index - 1]!.x, point.y - stroke[index - 1]!.y)).toBeLessThanOrEqual(1.500001)
        progress = advanceHandwritingStroke(stroke, progress, stroke[index - 1]!, point)
      }
      expect(progress).toBe(stroke.length)
    }
    // Its final stroke starts at the left margin and finishes along the baseline to the right.
    const sweep = guide.strokes.at(-1)!
    expect(sweep.at(-1)!.x - sweep[0]!.x).toBeGreaterThan(130)
    const roofDot = guide.strokes[0]!
    expect(roofDot.at(-1)!.y).toBeGreaterThan(roofDot[0]!.y)
    const leftLong = guide.strokes[20]!
    expect(leftLong.some(point => point.y > 110)).toBe(true)
  })

  it('tucks 八 under the existing roof while keeping the right-hand blade outside it', () => {
    const guide = biangHandwritingGuide()
    const eight = guide.strokes.slice(3, 5).flat()
    const moon = guide.strokes.slice(33, 37).flat()
    const blade = guide.strokes.slice(37, 39).flat()
    const eightLeft = Math.min(...eight.map(point => point.x))
    const eightRight = Math.max(...eight.map(point => point.x))
    const bladeLeft = Math.min(...blade.map(point => point.x))
    expect(eightLeft).toBe(BIANG_EIGHT_REGION.x)
    expect(eightRight).toBe(BIANG_EIGHT_REGION.x + BIANG_EIGHT_REGION.width)
    expect(eightLeft - Math.max(...moon.map(point => point.x))).toBeGreaterThanOrEqual(3)
    expect(bladeLeft - eightRight).toBeGreaterThanOrEqual(3)
    expect(guide.strokes[4]!.at(-1)!.x).toBeLessThanOrEqual(bladeLeft - 3)
    expect(Math.min(...eight.map(point => point.y))).toBeGreaterThanOrEqual(23)
    expect(Math.max(...eight.map(point => point.y))).toBeLessThanOrEqual(34)
    // First three roof strokes retain the original whole-穴 fit exactly.
    const roofSource = [
      [[425, 789], [560, 680]], [[229, 582], [172, 375]], [[268, 544], [719, 468]],
    ] as const
    for (const [index, endpoints] of roofSource.entries()) {
      const fit = ([x, y]: readonly [number, number]) => ({ x: 32 + (x - 157) / 775 * 116, y: 12 + (789 - y) / 753 * 22 })
      expect(guide.strokes[index]![0]).toEqual(fit(endpoints[0]))
      expect(guide.strokes[index]!.at(-1)!.x).toBeCloseTo(fit(endpoints[1]).x, 12)
      expect(guide.strokes[index]!.at(-1)!.y).toBeCloseTo(fit(endpoints[1]).y, 12)
    }
  })

  it('leaves clear stroke-edge space between the heart and final surrounding sweep', () => {
    const strokes = biangHandwritingGuide().strokes
    const heart = strokes.slice(29, 33).flat()
    const sweep = strokes[41]!
    const heartBottom = Math.max(...heart.map(point => point.y))
    const sweepTop = Math.min(...sweep.map(point => point.y))
    expect(heartBottom).toBeLessThanOrEqual(131)
    expect(sweepTop).toBeGreaterThanOrEqual(141)
    // At the actual 3-unit ink width, at least five board units of air remain.
    expect(sweepTop - heartBottom - 3).toBeGreaterThanOrEqual(5)
    const pointSegmentDistance = (point: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) => {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const squared = dx * dx + dy * dy
      const t = squared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared))
      return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy)
    }
    let separation = Infinity
    for (const point of heart) for (let index = 1; index < sweep.length; index++) {
      separation = Math.min(separation, pointSegmentDistance(point, sweep[index - 1]!, sweep[index]!))
    }
    expect(separation - 3).toBeGreaterThanOrEqual(5)
  })

  it('supports stronger smoothing on every completed and growing stroke without changing its endpoints or source', () => {
    const guide = biangHandwritingGuide()
    const source = JSON.stringify(guide)
    for (const stroke of guide.strokes) for (let count = 1; count <= stroke.length; count++) {
      const prefix = stroke.slice(0, count)
      const path = smoothChineseHandwritingPath(prefix, 'strong')
      expect(path).toMatch(/^M /)
      expect(path).not.toMatch(/NaN|Infinity|undefined/)
      expect(path.startsWith(`M ${prefix[0]!.x} ${prefix[0]!.y}`)).toBe(true)
      expect(path.endsWith(`L ${prefix.at(-1)!.x} ${prefix.at(-1)!.y}`)).toBe(true)
    }
    expect(JSON.stringify(guide)).toBe(source)
    expect(biangHandwritingGuide()).toBe(guide)
    expect(Object.isFrozen(guide)).toBe(true)
    expect(Object.isFrozen(guide.strokes)).toBe(true)
    expect(guide.strokes.every(stroke => Object.isFrozen(stroke) && stroke.every(Object.isFrozen))).toBe(true)
    expect(Object.isFrozen(BIANG_COMPONENTS)).toBe(true)
  })

  it('ships precise source, license and variant documentation for the vector composition', () => {
    const sources = readFileSync('public/chinese-handwriting/BIANG.md', 'utf8')
    expect(sources).toContain('U+30EDD')
    expect(sources).toContain('42-stroke')
    expect(sources).toContain('43-stroke')
    expect(sources).toContain('言 does not become 讠')
    expect(sources).toContain('Hanzi Writer Data 2.0.1')
    expect(sources).toContain('Arphic Public License')
    expect(sources).toContain('c240022c63ef755281a3e46b2c01c89d69713e5c00d3da29306b27b33b6a5fa3')
    expect(sources).toContain('recognition points')
  })
})
