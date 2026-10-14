import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'
import { t } from '../i18n'
import { EXTRA_SHAPES, Shape, SHAPE_KEYS, SHAPE_PATHS, petalPoints, polygonPoints, starPoints } from './shapeMatchShapes'

describe('Shape Match geometry', () => {
  it('has thirty-four distinct closed silhouettes with a translated name in every language', () => {
    expect(Object.keys(SHAPE_PATHS)).toHaveLength(34)
    expect(new Set(Object.values(SHAPE_PATHS)).size).toBe(34)
    for (const [shape, path] of Object.entries(SHAPE_PATHS)) {
      expect(S.is(Shape)(shape)).toBe(true)
      expect(path.startsWith('M')).toBe(true)
      expect(path.endsWith('Z')).toBe(true)
      expect(path).not.toMatch(/NaN|Infinity/)
      for (const language of ['en', 'zh', 'fr', 'de', 'fa', 'ms', 'zh-HK', 'ja']) {
        expect(t(SHAPE_KEYS[shape as Shape], language).trim().length).toBeGreaterThan(0)
      }
    }
    expect(EXTRA_SHAPES).toHaveLength(31)
    expect(new Set(EXTRA_SHAPES).size).toBe(31)
  })

  it.each([[5, 'pentagon'], [6, 'hexagon'], [7, 'heptagon'], [8, 'octagon'], [9, 'nonagon'], [10, 'decagon']] as const)(
    'draws a %s-sided %s with evenly spaced vertices inside the bubble canvas', (sides, shape) => {
      const points = polygonPoints(sides)
      expect(points).toHaveLength(sides)
      expect(SHAPE_PATHS[shape].match(/[ML]/g)).toHaveLength(sides)
      for (const [index, [x, y]] of points.entries()) {
        expect(x).toBeGreaterThanOrEqual(14)
        expect(x).toBeLessThanOrEqual(86)
        expect(y).toBeGreaterThanOrEqual(14)
        expect(y).toBeLessThanOrEqual(86)
        expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(36)
        const next = points[(index + 1) % sides]!
        expect(Math.hypot(next[0] - x, next[1] - y)).toBeCloseTo(72 * Math.sin(Math.PI / sides))
      }
    },
  )

  it('draws a five-point star with alternating outer tips and inner corners', () => {
    const coordinates = [...SHAPE_PATHS.star.matchAll(/[ML] ([\d.]+) ([\d.]+)/g)]
    expect(coordinates).toHaveLength(10)
    for (const [index, match] of coordinates.entries()) {
      expect(Math.hypot(Number(match[1]) - 50, Number(match[2]) - 50)).toBeCloseTo(index % 2 === 0 ? 38 : 18, 2)
    }
  })

  it('retains both donut contours so even-odd rendering leaves its center empty', () => {
    expect(SHAPE_PATHS.donut.match(/M /g)).toHaveLength(2)
    expect(SHAPE_PATHS.donut.match(/Z/g)).toHaveLength(2)
    expect(SHAPE_PATHS.donut).toContain('A 36 36')
    expect(SHAPE_PATHS.donut).toContain('A 17 17')
  })

  it('draws a semicircle as a half-circle arc with one straight closing edge', () => {
    expect(SHAPE_PATHS.semicircle).toMatch(/M 14 68 A 36 36 0 0 1 86 68 L 14 68 Z/)
  })

  it.each([-1, 0, 2, 3.5, 11, NaN, Infinity])('rejects unsupported polygon vertex count %s', sides => {
    expect(polygonPoints(sides)).toEqual([])
  })

  it('preserves the original shape order and appends the seventeen new schema ids', () => {
    const before = ['circle', 'star', 'heart', 'triangle', 'oval', 'semicircle', 'donut', 'rectangle', 'diamond',
      'trapezoid', 'square', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon', 'decagon']
    const added = ['crescent', 'cross', 'arrow', 'lightning', 'kite', 'parallelogram', 'rightTriangle', 'capsule',
      'teardrop', 'egg', 'clover', 'flower', 'cloud', 'arch', 'chevron', 'sixPointStar', 'eightPointStar']
    expect(Object.keys(SHAPE_PATHS)).toEqual([...before, ...added])
    for (const shape of added) expect(S.decodeUnknownSync(Shape)(shape)).toBe(shape)
    expect(S.is(Shape)('ninePointStar')).toBe(false)
  })

  it.each([[5, 'star', 18], [6, 'sixPointStar', 20], [8, 'eightPointStar', 23]] as const)(
    'draws %s points for %s, alternating outer tips and inner corners', (tips, shape, innerRadius) => {
      const points = starPoints(tips)
      expect(points).toHaveLength(tips * 2)
      expect(SHAPE_PATHS[shape].match(/[ML]/g)).toHaveLength(tips * 2)
      for (const [index, [x, y]] of points.entries()) {
        expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(index % 2 === 0 ? 38 : innerRadius)
        expect(x).toBeGreaterThanOrEqual(12)
        expect(x).toBeLessThanOrEqual(88)
        expect(y).toBeGreaterThanOrEqual(12)
        expect(y).toBeLessThanOrEqual(88)
      }
    },
  )

  it.each([[4, 'clover'], [6, 'flower']] as const)('draws exactly %s rounded lobes for %s', (petals, shape) => {
    const points = petalPoints(petals)
    const radii = points.map(([x, y]) => Math.hypot(x - 50, y - 50))
    const peaks = radii.filter((radius, index) => radius > radii[(index + radii.length - 1) % radii.length]! && radius > radii[(index + 1) % radii.length]!)
    expect(peaks).toHaveLength(petals)
    expect(peaks.every(radius => Math.abs(radius - 38) < .0001)).toBe(true)
    expect(SHAPE_PATHS[shape].match(/[ML]/g)).toHaveLength(petals * 16)
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(12)
      expect(x).toBeLessThanOrEqual(88)
      expect(y).toBeGreaterThanOrEqual(12)
      expect(y).toBeLessThanOrEqual(88)
    }
  })

  it('keeps a right angle in the right triangle and unequal diagonals in the kite', () => {
    const triangle = [...SHAPE_PATHS.rightTriangle.matchAll(/[ML] ([\d.]+) ([\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])])
    expect(triangle).toEqual([[18, 16], [86, 84], [18, 84]])
    const [first, second, right] = triangle
    expect((first![0]! - right![0]!) * (second![0]! - right![0]!) + (first![1]! - right![1]!) * (second![1]! - right![1]!)).toBe(0)
    expect(SHAPE_PATHS.kite).not.toBe(SHAPE_PATHS.diamond)
    expect(SHAPE_PATHS.kite).toContain('82 42')
    expect(SHAPE_PATHS.diamond).toContain('88 50')
  })

  it('leaves the arch open at the bottom with its inner arc curving above the gap', () => {
    expect(SHAPE_PATHS.arch).toContain('A 34 34 0 0 1 84 48')
    expect(SHAPE_PATHS.arch).toContain('L 65 86 L 65 48 A 15 15 0 0 0 35 48 L 35 86')
    expect(SHAPE_PATHS.arch.match(/M /g)).toHaveLength(1)
  })

  it('draws the crescent as a recessed continuous contour and avoids simply rotating an existing shape', () => {
    expect(SHAPE_PATHS.crescent.match(/C /g)).toHaveLength(4)
    expect(SHAPE_PATHS.crescent).toContain('38 50')
    expect(SHAPE_PATHS.crescent.match(/M /g)).toHaveLength(1)
    expect(SHAPE_PATHS.capsule).toContain('H 64 A 26 26')
    expect(SHAPE_PATHS.capsule).not.toBe(SHAPE_PATHS.oval)
    expect(SHAPE_PATHS.egg).not.toBe(SHAPE_PATHS.oval)
    expect(SHAPE_PATHS.chevron).not.toBe(SHAPE_PATHS.arrow)
  })

  it.each([-1, 0, 3, 7, NaN, Infinity])('rejects unsupported star and petal counts %s', count => {
    expect(starPoints(count)).toEqual([])
    expect(petalPoints(count)).toEqual([])
  })
})
