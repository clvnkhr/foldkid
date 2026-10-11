import { describe, expect, it } from 'vitest'
import { clampPoint, edgesFor, hasRoomFor, isPolygon, shapeKind, validId, validPoint } from './dotShapesDomain'

const triangle = [{ id: 0, x: 100, y: 100 }, { id: 1, x: 500, y: 100 }, { id: 2, x: 300, y: 500 }]
describe('Dot Shapes geometry', () => {
  it('connects sequential dots and only closes a noncollinear shape', () => {
    expect(edgesFor([])).toEqual([])
    expect(edgesFor(triangle.slice(0, 1))).toEqual([])
    expect(edgesFor(triangle.slice(0, 2)).map(edge => [edge.from.id, edge.to.id])).toEqual([[0, 1]])
    expect(edgesFor(triangle).map(edge => [edge.from.id, edge.to.id])).toEqual([[0, 1], [1, 2], [2, 0]])
    expect(new Set(edgesFor(triangle).map(edge => edge.color)).size).toBe(3)
    const collinear = triangle.map((point, index) => ({ ...point, x: 100 + index * 100, y: 100 + index * 100 }))
    expect(isPolygon(collinear)).toBe(false)
    expect(shapeKind(collinear)).toBe('line')
    expect(edgesFor(collinear)).toHaveLength(2)
  })

  it('recognizes crossing polygons whose signed area is zero', () => {
    const crossing = [{ x: 100, y: 100 }, { x: 500, y: 500 }, { x: 100, y: 500 }, { x: 500, y: 100 }]
    expect(isPolygon(crossing)).toBe(true)
    expect(shapeKind(crossing)).toBe('quadrilateral')
    expect(isPolygon([{ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 200, y: 200 }])).toBe(false)
  })

  it('names dots, lines and polygons by their number of corners', () => {
    expect(shapeKind([])).toBe('empty')
    expect(shapeKind(triangle.slice(0, 1))).toBe('dot')
    expect(shapeKind(triangle.slice(0, 2))).toBe('line')
    const names = ['triangle', 'quadrilateral', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon', 'decagon', 'polygon']
    for (let count = 3; count <= 11; count++) {
      const points = Array.from({ length: count }, (_, i) => ({ x: 500 + Math.cos(i * Math.PI * 2 / count) * 250, y: 350 + Math.sin(i * Math.PI * 2 / count) * 200 }))
      expect(shapeKind(points)).toBe(names[count - 3])
    }
  })

  it('rejects malformed positions and avoids duplicate dots while allowing a dot to move itself', () => {
    for (const id of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) expect(validId(id)).toBe(false)
    for (const point of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: -1, y: 0 }, { x: 1001, y: 0 }, { x: 0, y: 701 }]) expect(validPoint(point)).toBe(false)
    expect(validPoint({ x: 1000, y: 700 })).toBe(true)
    expect(clampPoint({ x: -50, y: 750 })).toEqual({ x: 44, y: 670 })
    expect(hasRoomFor(triangle, { x: 105, y: 100 })).toBe(false)
    expect(hasRoomFor(triangle, { x: 105, y: 100 }, 0)).toBe(true)
    expect(hasRoomFor(triangle, { x: 800, y: 500 })).toBe(true)
  })

  it('keeps dots and the keyboard cursor inside a narrow mobile board', () => {
    const low = clampPoint({ x: 0, y: 0 })
    const high = clampPoint({ x: 1000, y: 700 })
    expect(low).toEqual({ x: 44, y: 30 })
    expect(high).toEqual({ x: 956, y: 670 })
    // The visible dot ring is 22px wide and the cursor is 24px wide.
    expect(low.x / 1000 * 276).toBeGreaterThanOrEqual(12)
    expect(low.y / 700 * 320).toBeGreaterThanOrEqual(12)
    expect((1000 - high.x) / 1000 * 276).toBeGreaterThanOrEqual(12)
    expect((700 - high.y) / 700 * 320).toBeGreaterThanOrEqual(12)
  })
})
