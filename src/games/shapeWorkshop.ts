import { Effect, Match as M, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html, type Html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { t } from '../i18n'

export type Point = readonly [x: number, y: number]
export interface Bounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface PolygonGeometry { readonly kind: 'polygon'; readonly points: readonly Point[] }
export interface PathGeometry { readonly kind: 'path'; readonly d: string; readonly bounds: Bounds; readonly area: number }
export type Geometry = PolygonGeometry | PathGeometry
export interface ScreenRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

type ShapeNameKey =
  | 'shapeCircle'
  | 'shapeTriangle'
  | 'shapeSquare'
  | 'shapeRectangle'
  | 'shapePentagon'
  | 'shapeHexagon'
  | 'shapeOctagon'
  | 'shapeDiamond'
  | 'shapeRhombus'
  | 'shapeTrapezoid'
  | 'shapeSemicircle'

export interface WorkshopPiece {
  readonly geometry: Geometry
  readonly nameKey: ShapeNameKey
  readonly color: string
}

export interface WorkshopPuzzle {
  readonly id: string
  readonly nameKey: ShapeNameKey
  readonly icon: string
  readonly silhouette: Geometry
  readonly pieces: readonly WorkshopPiece[]
}

const polygon = (...points: Point[]): PolygonGeometry => ({ kind: 'polygon', points })
const path = (d: string, bounds: Bounds, area: number): PathGeometry => ({ kind: 'path', d, bounds, area })
const point = (x: number, y: number): Point => [x, y]
const palette = ['#f97316', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'] as const
const equilateralHeight = (side: number): number => side * Math.sqrt(3) / 2
const regularVertices = (centerX: number, centerY: number, radius: number, sides: number, rotation = -Math.PI / 2): readonly Point[] =>
  Array.from({ length: sides }, (_, index) => point(
    centerX + radius * Math.cos(rotation + index * Math.PI * 2 / sides),
    centerY + radius * Math.sin(rotation + index * Math.PI * 2 / sides),
  ))
const triangleFan = (vertices: readonly Point[], center: Point, colorOffset = 0): readonly WorkshopPiece[] =>
  vertices.map((vertex, index) => ({
    geometry: polygon(center, vertex, vertices[(index + 1) % vertices.length]!),
    nameKey: 'shapeTriangle',
    color: palette[(index + colorOffset) % palette.length]!,
  }))

const square = polygon(point(50, 30), point(190, 30), point(190, 170), point(50, 170))
const circleBounds: Bounds = { x: 50, y: 30, width: 140, height: 140 }
const circleArea = Math.PI * 70 * 70
const circle = path('M 50 100 A 70 70 0 0 1 190 100 A 70 70 0 0 1 50 100 Z', circleBounds, circleArea)
const upperSemicircle = path('M 50 100 A 70 70 0 0 1 190 100 L 50 100 Z', { x: 50, y: 30, width: 140, height: 70 }, circleArea / 2)
const lowerSemicircle = path('M 50 100 A 70 70 0 0 0 190 100 L 50 100 Z', { x: 50, y: 100, width: 140, height: 70 }, circleArea / 2)

const rhombusHalfHeight = equilateralHeight(100)
const rhombusTop = point(120, 100 - rhombusHalfHeight)
const rhombusLeft = point(70, 100)
const rhombusRight = point(170, 100)
const rhombusBottom = point(120, 100 + rhombusHalfHeight)

const smallTriangleHeight = equilateralHeight(80)
const trapezoidTopY = 55
const trapezoidBottomY = trapezoidTopY + smallTriangleHeight
const largeTriangleTop = point(120, 30)
const largeTriangleMiddleY = 30 + smallTriangleHeight
const largeTriangleBottomY = 30 + smallTriangleHeight * 2

const hexSide = 70
const hexHalfWidth = equilateralHeight(hexSide)
const hexCenter = point(120, 100)
const hexVertices = [
  point(120, 30),
  point(120 + hexHalfWidth, 65),
  point(120 + hexHalfWidth, 135),
  point(120, 170),
  point(120 - hexHalfWidth, 135),
  point(120 - hexHalfWidth, 65),
] as const

const wideRectangle = polygon(point(40, 50), point(200, 50), point(200, 150), point(40, 150))
const twoSquareRectangle = polygon(point(30, 55), point(210, 55), point(210, 145), point(30, 145))
const pentagonCenter = point(120, 104)
const pentagonVertices = regularVertices(120, 104, 76, 5)
const octagonCenter = point(120, 100)
const octagonVertices = regularVertices(120, 100, 75, 8, -Math.PI / 8)

const largeRhombusUpperRight = point((rhombusTop[0] + rhombusRight[0]) / 2, (rhombusTop[1] + rhombusRight[1]) / 2)
const largeRhombusLowerRight = point((rhombusRight[0] + rhombusBottom[0]) / 2, (rhombusRight[1] + rhombusBottom[1]) / 2)
const largeRhombusLowerLeft = point((rhombusBottom[0] + rhombusLeft[0]) / 2, (rhombusBottom[1] + rhombusLeft[1]) / 2)
const largeRhombusUpperLeft = point((rhombusLeft[0] + rhombusTop[0]) / 2, (rhombusLeft[1] + rhombusTop[1]) / 2)
const largeRhombusCenter = point(120, 100)

const flatHexSide = 60
const flatHexHalfHeight = equilateralHeight(flatHexSide)
const flatHexTopY = 100 - flatHexHalfHeight
const flatHexBottomY = 100 + flatHexHalfHeight
const flatHexVertices = [
  point(90, flatHexTopY),
  point(150, flatHexTopY),
  point(180, 100),
  point(150, flatHexBottomY),
  point(90, flatHexBottomY),
  point(60, 100),
] as const
const flatHexTopMiddle = point(120, flatHexTopY)
const flatHexBottomMiddle = point(120, flatHexBottomY)

const mosaicOctagonVertices = [
  point(85, 25), point(155, 25), point(195, 65), point(195, 135),
  point(155, 175), point(85, 175), point(45, 135), point(45, 65),
] as const

export const WORKSHOP_PUZZLES: readonly WorkshopPuzzle[] = [
  {
    id: 'triangles-square', nameKey: 'shapeSquare', icon: '■', silhouette: square,
    pieces: [
      { geometry: polygon(point(50, 30), point(190, 30), point(190, 170)), nameKey: 'shapeTriangle', color: palette[0] },
      { geometry: polygon(point(50, 30), point(190, 170), point(50, 170)), nameKey: 'shapeTriangle', color: palette[1] },
    ],
  },
  {
    id: 'semicircles-circle', nameKey: 'shapeCircle', icon: '●', silhouette: circle,
    pieces: [
      { geometry: upperSemicircle, nameKey: 'shapeSemicircle', color: palette[2] },
      { geometry: lowerSemicircle, nameKey: 'shapeSemicircle', color: palette[4] },
    ],
  },
  {
    id: 'triangles-rhombus', nameKey: 'shapeRhombus', icon: '◆',
    silhouette: polygon(rhombusTop, rhombusRight, rhombusBottom, rhombusLeft),
    pieces: [
      { geometry: polygon(rhombusTop, rhombusLeft, rhombusRight), nameKey: 'shapeTriangle', color: palette[3] },
      { geometry: polygon(rhombusLeft, rhombusRight, rhombusBottom), nameKey: 'shapeTriangle', color: palette[5] },
    ],
  },
  {
    id: 'triangles-trapezoid', nameKey: 'shapeTrapezoid', icon: '⏢',
    silhouette: polygon(point(80, trapezoidTopY), point(160, trapezoidTopY), point(200, trapezoidBottomY), point(40, trapezoidBottomY)),
    pieces: [
      { geometry: polygon(point(40, trapezoidBottomY), point(120, trapezoidBottomY), point(80, trapezoidTopY)), nameKey: 'shapeTriangle', color: palette[0] },
      { geometry: polygon(point(80, trapezoidTopY), point(160, trapezoidTopY), point(120, trapezoidBottomY)), nameKey: 'shapeTriangle', color: palette[1] },
      { geometry: polygon(point(120, trapezoidBottomY), point(200, trapezoidBottomY), point(160, trapezoidTopY)), nameKey: 'shapeTriangle', color: palette[2] },
    ],
  },
  {
    id: 'triangles-large-triangle', nameKey: 'shapeTriangle', icon: '▲',
    silhouette: polygon(largeTriangleTop, point(200, largeTriangleBottomY), point(40, largeTriangleBottomY)),
    pieces: [
      { geometry: polygon(largeTriangleTop, point(80, largeTriangleMiddleY), point(160, largeTriangleMiddleY)), nameKey: 'shapeTriangle', color: palette[0] },
      { geometry: polygon(point(40, largeTriangleBottomY), point(120, largeTriangleBottomY), point(80, largeTriangleMiddleY)), nameKey: 'shapeTriangle', color: palette[1] },
      { geometry: polygon(point(80, largeTriangleMiddleY), point(160, largeTriangleMiddleY), point(120, largeTriangleBottomY)), nameKey: 'shapeTriangle', color: palette[2] },
      { geometry: polygon(point(120, largeTriangleBottomY), point(200, largeTriangleBottomY), point(160, largeTriangleMiddleY)), nameKey: 'shapeTriangle', color: palette[3] },
    ],
  },
  {
    id: 'triangles-hexagon', nameKey: 'shapeHexagon', icon: '⬢', silhouette: polygon(...hexVertices),
    pieces: hexVertices.map((vertex, index) => ({
      geometry: polygon(hexCenter, vertex, hexVertices[(index + 1) % hexVertices.length]!),
      nameKey: 'shapeTriangle' as const,
      color: palette[index]!,
    })),
  },
  {
    id: 'squares-large-square', nameKey: 'shapeSquare', icon: '■', silhouette: square,
    pieces: [
      { geometry: polygon(point(50, 30), point(120, 30), point(120, 100), point(50, 100)), nameKey: 'shapeSquare', color: palette[0] },
      { geometry: polygon(point(120, 30), point(190, 30), point(190, 100), point(120, 100)), nameKey: 'shapeSquare', color: palette[1] },
      { geometry: polygon(point(50, 100), point(120, 100), point(120, 170), point(50, 170)), nameKey: 'shapeSquare', color: palette[2] },
      { geometry: polygon(point(120, 100), point(190, 100), point(190, 170), point(120, 170)), nameKey: 'shapeSquare', color: palette[4] },
    ],
  },
  {
    id: 'squares-rectangle', nameKey: 'shapeRectangle', icon: '▬', silhouette: twoSquareRectangle,
    pieces: [
      { geometry: polygon(point(30, 55), point(120, 55), point(120, 145), point(30, 145)), nameKey: 'shapeSquare', color: palette[2] },
      { geometry: polygon(point(120, 55), point(210, 55), point(210, 145), point(120, 145)), nameKey: 'shapeSquare', color: palette[4] },
    ],
  },
  {
    id: 'rectangles-square', nameKey: 'shapeSquare', icon: '■', silhouette: square,
    pieces: [
      { geometry: polygon(point(50, 30), point(190, 30), point(190, 100), point(50, 100)), nameKey: 'shapeRectangle', color: palette[1] },
      { geometry: polygon(point(50, 100), point(190, 100), point(190, 170), point(50, 170)), nameKey: 'shapeRectangle', color: palette[5] },
    ],
  },
  {
    id: 'triangles-rectangle', nameKey: 'shapeRectangle', icon: '▬', silhouette: wideRectangle,
    pieces: [
      { geometry: polygon(point(40, 50), point(200, 50), point(200, 150)), nameKey: 'shapeTriangle', color: palette[0] },
      { geometry: polygon(point(40, 50), point(200, 150), point(40, 150)), nameKey: 'shapeTriangle', color: palette[3] },
    ],
  },
  {
    id: 'rhombi-hexagon', nameKey: 'shapeHexagon', icon: '⬢', silhouette: polygon(...hexVertices),
    pieces: [
      { geometry: polygon(hexCenter, hexVertices[0], hexVertices[1], hexVertices[2]), nameKey: 'shapeRhombus', color: palette[1] },
      { geometry: polygon(hexCenter, hexVertices[2], hexVertices[3], hexVertices[4]), nameKey: 'shapeRhombus', color: palette[3] },
      { geometry: polygon(hexCenter, hexVertices[4], hexVertices[5], hexVertices[0]), nameKey: 'shapeRhombus', color: palette[5] },
    ],
  },
  {
    id: 'trapezoids-hexagon', nameKey: 'shapeHexagon', icon: '⬢', silhouette: polygon(...hexVertices),
    pieces: [
      { geometry: polygon(hexVertices[0], hexVertices[1], hexVertices[2], hexVertices[3]), nameKey: 'shapeTrapezoid', color: palette[0] },
      { geometry: polygon(hexVertices[3], hexVertices[4], hexVertices[5], hexVertices[0]), nameKey: 'shapeTrapezoid', color: palette[2] },
    ],
  },
  {
    id: 'triangles-pentagon', nameKey: 'shapePentagon', icon: '⬟', silhouette: polygon(...pentagonVertices),
    pieces: triangleFan(pentagonVertices, pentagonCenter, 1),
  },
  {
    id: 'triangles-octagon', nameKey: 'shapeOctagon', icon: '🛑', silhouette: polygon(...octagonVertices),
    pieces: triangleFan(octagonVertices, octagonCenter, 3),
  },
  {
    id: 'trapezoids-square', nameKey: 'shapeSquare', icon: '■', silhouette: square,
    pieces: [
      { geometry: polygon(point(50, 30), point(95, 30), point(145, 170), point(50, 170)), nameKey: 'shapeTrapezoid', color: palette[2] },
      { geometry: polygon(point(95, 30), point(190, 30), point(190, 170), point(145, 170)), nameKey: 'shapeTrapezoid', color: palette[4] },
    ],
  },
  {
    id: 'triangles-square-pinwheel', nameKey: 'shapeSquare', icon: '■', silhouette: square,
    pieces: [
      { geometry: polygon(point(50, 30), point(190, 30), point(120, 100)), nameKey: 'shapeTriangle', color: palette[0] },
      { geometry: polygon(point(190, 30), point(190, 170), point(120, 100)), nameKey: 'shapeTriangle', color: palette[1] },
      { geometry: polygon(point(190, 170), point(50, 170), point(120, 100)), nameKey: 'shapeTriangle', color: palette[2] },
      { geometry: polygon(point(50, 170), point(50, 30), point(120, 100)), nameKey: 'shapeTriangle', color: palette[4] },
    ],
  },
  {
    id: 'rhombi-large-rhombus', nameKey: 'shapeRhombus', icon: '◆',
    silhouette: polygon(rhombusTop, rhombusRight, rhombusBottom, rhombusLeft),
    pieces: [
      { geometry: polygon(rhombusTop, largeRhombusUpperRight, largeRhombusCenter, largeRhombusUpperLeft), nameKey: 'shapeRhombus', color: palette[0] },
      { geometry: polygon(largeRhombusUpperRight, rhombusRight, largeRhombusLowerRight, largeRhombusCenter), nameKey: 'shapeRhombus', color: palette[1] },
      { geometry: polygon(largeRhombusUpperLeft, largeRhombusCenter, largeRhombusLowerLeft, rhombusLeft), nameKey: 'shapeRhombus', color: palette[3] },
      { geometry: polygon(largeRhombusCenter, largeRhombusLowerRight, rhombusBottom, largeRhombusLowerLeft), nameKey: 'shapeRhombus', color: palette[5] },
    ],
  },
  {
    id: 'rectangles-rectangle-mosaic', nameKey: 'shapeRectangle', icon: '▬', silhouette: wideRectangle,
    pieces: [
      { geometry: polygon(point(40, 50), point(120, 50), point(120, 100), point(40, 100)), nameKey: 'shapeRectangle', color: palette[0] },
      { geometry: polygon(point(120, 50), point(200, 50), point(200, 100), point(120, 100)), nameKey: 'shapeRectangle', color: palette[2] },
      { geometry: polygon(point(40, 100), point(120, 100), point(120, 150), point(40, 150)), nameKey: 'shapeRectangle', color: palette[4] },
      { geometry: polygon(point(120, 100), point(200, 100), point(200, 150), point(120, 150)), nameKey: 'shapeRectangle', color: palette[1] },
    ],
  },
  {
    id: 'trapezoids-rectangle', nameKey: 'shapeRectangle', icon: '▬', silhouette: wideRectangle,
    pieces: [
      { geometry: polygon(point(40, 50), point(90, 50), point(150, 150), point(40, 150)), nameKey: 'shapeTrapezoid', color: palette[3] },
      { geometry: polygon(point(90, 50), point(200, 50), point(200, 150), point(150, 150)), nameKey: 'shapeTrapezoid', color: palette[5] },
    ],
  },
  {
    id: 'pentagons-hexagon', nameKey: 'shapeHexagon', icon: '⬢', silhouette: polygon(...flatHexVertices),
    pieces: [
      { geometry: polygon(flatHexTopMiddle, flatHexVertices[1], flatHexVertices[2], flatHexVertices[3], flatHexBottomMiddle), nameKey: 'shapePentagon', color: palette[1] },
      { geometry: polygon(flatHexTopMiddle, flatHexBottomMiddle, flatHexVertices[4], flatHexVertices[5], flatHexVertices[0]), nameKey: 'shapePentagon', color: palette[4] },
    ],
  },
  {
    id: 'triangle-and-trapezoid-triangle', nameKey: 'shapeTriangle', icon: '▲',
    silhouette: polygon(largeTriangleTop, point(200, largeTriangleBottomY), point(40, largeTriangleBottomY)),
    pieces: [
      { geometry: polygon(largeTriangleTop, point(160, largeTriangleMiddleY), point(80, largeTriangleMiddleY)), nameKey: 'shapeTriangle', color: palette[0] },
      { geometry: polygon(point(80, largeTriangleMiddleY), point(160, largeTriangleMiddleY), point(200, largeTriangleBottomY), point(40, largeTriangleBottomY)), nameKey: 'shapeTrapezoid', color: palette[4] },
    ],
  },
  {
    id: 'mixed-octagon-mosaic', nameKey: 'shapeOctagon', icon: '🛑', silhouette: polygon(...mosaicOctagonVertices),
    pieces: [
      { geometry: polygon(point(85, 65), point(155, 65), point(155, 135), point(85, 135)), nameKey: 'shapeSquare', color: palette[4] },
      { geometry: polygon(point(85, 25), point(155, 25), point(155, 65), point(85, 65)), nameKey: 'shapeRectangle', color: palette[0] },
      { geometry: polygon(point(155, 65), point(195, 65), point(195, 135), point(155, 135)), nameKey: 'shapeRectangle', color: palette[1] },
      { geometry: polygon(point(85, 135), point(155, 135), point(155, 175), point(85, 175)), nameKey: 'shapeRectangle', color: palette[2] },
      { geometry: polygon(point(45, 65), point(85, 65), point(85, 135), point(45, 135)), nameKey: 'shapeRectangle', color: palette[3] },
      { geometry: polygon(point(85, 25), point(85, 65), point(45, 65)), nameKey: 'shapeTriangle', color: palette[5] },
      { geometry: polygon(point(155, 25), point(195, 65), point(155, 65)), nameKey: 'shapeTriangle', color: palette[5] },
      { geometry: polygon(point(195, 135), point(155, 175), point(155, 135)), nameKey: 'shapeTriangle', color: palette[5] },
      { geometry: polygon(point(85, 135), point(85, 175), point(45, 135)), nameKey: 'shapeTriangle', color: palette[5] },
    ],
  },
]

export const polygonArea = (points: readonly Point[]): number => Math.abs(points.reduce((sum, [x, y], index) => {
  const [nextX, nextY] = points[(index + 1) % points.length] ?? [x, y]
  return sum + x * nextY - nextX * y
}, 0)) / 2

export const geometryArea = (geometry: Geometry): number =>
  geometry.kind === 'polygon' ? polygonArea(geometry.points) : geometry.area

export const geometryPath = (geometry: Geometry): string => {
  if (geometry.kind === 'path') return geometry.d
  const [first, ...rest] = geometry.points
  if (!first) return ''
  return `M ${first[0]} ${first[1]} ${rest.map(([x, y]) => `L ${x} ${y}`).join(' ')} Z`
}

export const geometryBounds = (geometry: Geometry): Bounds => {
  if (geometry.kind === 'path') return geometry.bounds
  if (geometry.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const xs = geometry.points.map(([x]) => x)
  const ys = geometry.points.map(([, y]) => y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

export const puzzlePieceArea = (puzzle: WorkshopPuzzle): number =>
  puzzle.pieces.reduce((sum, piece) => sum + geometryArea(piece.geometry), 0)

export const boundsContain = (outer: Bounds, inner: Bounds, tolerance = 1e-8): boolean =>
  inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance &&
  inner.x + inner.width <= outer.x + outer.width + tolerance &&
  inner.y + inner.height <= outer.y + outer.height + tolerance

const crossProduct = (a: Point, b: Point, c: Point): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

const pointOnSegment = (candidate: Point, start: Point, end: Point, tolerance: number): boolean =>
  Math.abs(crossProduct(start, end, candidate)) <= tolerance &&
  candidate[0] >= Math.min(start[0], end[0]) - tolerance && candidate[0] <= Math.max(start[0], end[0]) + tolerance &&
  candidate[1] >= Math.min(start[1], end[1]) - tolerance && candidate[1] <= Math.max(start[1], end[1]) + tolerance

const pointInPolygon = (candidate: Point, vertices: readonly Point[], includeBoundary: boolean, tolerance: number): boolean => {
  if (vertices.length < 3) return false
  let inside = false
  for (let index = 0; index < vertices.length; index++) {
    const start = vertices[index]!
    const end = vertices[(index + 1) % vertices.length]!
    if (pointOnSegment(candidate, start, end, tolerance)) return includeBoundary
    const crossesRay = (start[1] > candidate[1]) !== (end[1] > candidate[1]) &&
      candidate[0] < (end[0] - start[0]) * (candidate[1] - start[1]) / (end[1] - start[1]) + start[0]
    if (crossesRay) inside = !inside
  }
  return inside
}

const segmentsProperlyCross = (a: Point, b: Point, c: Point, d: Point, tolerance: number): boolean => {
  const abC = crossProduct(a, b, c)
  const abD = crossProduct(a, b, d)
  const cdA = crossProduct(c, d, a)
  const cdB = crossProduct(c, d, b)
  return abC * abD < -tolerance && cdA * cdB < -tolerance
}

const polygonCenter = (vertices: readonly Point[]): Point => {
  const [x, y] = vertices.reduce(([sumX, sumY], [vertexX, vertexY]) => [sumX + vertexX, sumY + vertexY], [0, 0])
  return point(x / vertices.length, y / vertices.length)
}

const polygonsOverlap = (left: PolygonGeometry, right: PolygonGeometry, tolerance: number): boolean => {
  for (let leftIndex = 0; leftIndex < left.points.length; leftIndex++) {
    const leftStart = left.points[leftIndex]!
    const leftEnd = left.points[(leftIndex + 1) % left.points.length]!
    for (let rightIndex = 0; rightIndex < right.points.length; rightIndex++) {
      const rightStart = right.points[rightIndex]!
      const rightEnd = right.points[(rightIndex + 1) % right.points.length]!
      if (segmentsProperlyCross(leftStart, leftEnd, rightStart, rightEnd, tolerance)) return true
    }
  }
  return pointInPolygon(polygonCenter(left.points), right.points, false, tolerance) ||
    pointInPolygon(polygonCenter(right.points), left.points, false, tolerance)
}

export const puzzleHasExactCoverage = (puzzle: WorkshopPuzzle, tolerance = 1e-8): boolean => {
  const silhouette = puzzle.silhouette
  const silhouetteBounds = geometryBounds(silhouette)
  if (Math.abs(puzzlePieceArea(puzzle) - geometryArea(silhouette)) > tolerance ||
    puzzle.pieces.some(piece => !boundsContain(silhouetteBounds, geometryBounds(piece.geometry), tolerance))) return false

  if (silhouette.kind === 'path' || puzzle.pieces.some(piece => piece.geometry.kind === 'path')) return true
  const polygons = puzzle.pieces.map(piece => piece.geometry as PolygonGeometry)
  if (polygons.some(piece => piece.points.some((vertex, index) => {
    const next = piece.points[(index + 1) % piece.points.length]!
    const midpoint = point((vertex[0] + next[0]) / 2, (vertex[1] + next[1]) / 2)
    return !pointInPolygon(vertex, silhouette.points, true, tolerance) ||
      !pointInPolygon(midpoint, silhouette.points, true, tolerance)
  }))) return false

  return polygons.every((left, leftIndex) =>
    polygons.slice(leftIndex + 1).every(right => !polygonsOverlap(left, right, tolerance)))
}

export const Model = S.Struct({
  roundIndex: S.Number,
  placedPieceIds: S.Array(S.Number),
  flyingPieceTokens: S.Array(S.Number),
  animationToken: S.Number,
  revision: S.Number,
})
export type Model = typeof Model.Type
export const init: Model = { roundIndex: 0, placedPieceIds: [], flyingPieceTokens: [], animationToken: 0, revision: 0 }

export const TapPiece = m('ShapeWorkshopTapPiece', { index: S.Number })
export const PieceFlightFinished = m('ShapeWorkshopPieceFlightFinished', { index: S.Number, token: S.Number })
export const NextPuzzle = m('ShapeWorkshopNextPuzzle')
export const ReplayPuzzle = m('ShapeWorkshopReplayPuzzle')
export const Message = S.Union([TapPiece, PieceFlightFinished, NextPuzzle, ReplayPuzzle])
export type Message = typeof Message.Type

export const normalizeRoundIndex = (index: number): number => {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.trunc(index))
}

export const normalizePuzzleIndex = (roundIndex: number): number =>
  normalizeRoundIndex(roundIndex) % WORKSHOP_PUZZLES.length

export const currentPuzzle = (model: Pick<Model, 'roundIndex'>): WorkshopPuzzle =>
  WORKSHOP_PUZZLES[normalizePuzzleIndex(model.roundIndex)] ?? WORKSHOP_PUZZLES[0]!

export const validPlacedPieceIds = (model: Model): readonly number[] => {
  const puzzle = currentPuzzle(model)
  return [...new Set(model.placedPieceIds.filter(index => Number.isInteger(index) && index >= 0 && index < puzzle.pieces.length))]
}

export const validFlyingPieceIds = (model: Model): readonly number[] => {
  const puzzle = currentPuzzle(model)
  const placed = new Set(validPlacedPieceIds(model))
  return puzzle.pieces.flatMap((_, index) =>
    Number.isInteger(model.flyingPieceTokens[index]) && model.flyingPieceTokens[index]! > 0 && !placed.has(index) ? [index] : [])
}

export const isPuzzleComplete = (model: Model): boolean =>
  validPlacedPieceIds(model).length === currentPuzzle(model).pieces.length

const paddedGeometryBounds = (geometry: Geometry, padding = 8): Bounds => {
  const bounds = geometryBounds(geometry)
  return { x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 }
}

export const geometryScreenRect = (viewport: ScreenRect, viewBox: Bounds, geometry: Bounds): ScreenRect => {
  if (viewport.width <= 0 || viewport.height <= 0 || viewBox.width <= 0 || viewBox.height <= 0) return { ...viewport }
  const scale = Math.min(viewport.width / viewBox.width, viewport.height / viewBox.height)
  const renderedWidth = viewBox.width * scale
  const renderedHeight = viewBox.height * scale
  return {
    left: viewport.left + (viewport.width - renderedWidth) / 2 + (geometry.x - viewBox.x) * scale,
    top: viewport.top + (viewport.height - renderedHeight) / 2 + (geometry.y - viewBox.y) * scale,
    width: geometry.width * scale,
    height: geometry.height * scale,
  }
}

const flightTransform = (source: ScreenRect, target: ScreenRect): { readonly transform: string; readonly originX: number; readonly originY: number } => {
  const sourceCenterX = source.left + source.width / 2
  const sourceCenterY = source.top + source.height / 2
  const targetCenterX = target.left + target.width / 2
  const targetCenterY = target.top + target.height / 2
  return {
    transform: `translate(${sourceCenterX - targetCenterX}px, ${sourceCenterY - targetCenterY}px) scale(${source.width / target.width}, ${source.height / target.height})`,
    originX: targetCenterX,
    originY: targetCenterY,
  }
}

const flyPieceCommand = (index: number, token: number, geometry: Geometry): Command.Command<Message> => ({
  name: 'ShapeWorkshopFlyPiece',
  effect: Effect.gen(function* () {
    yield* Render.afterCommit
    return yield* Effect.promise(async () => {
      const finished = PieceFlightFinished({ index, token })
      if (typeof document === 'undefined' || typeof window === 'undefined' ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return finished

      const page = document.querySelector<HTMLElement>('.shape-workshop-page')
      if (!page) return finished
      const sourceSvg = page.querySelector<SVGSVGElement>(`button.shape-workshop-piece-button[data-piece-index="${index}"] .shape-workshop-piece-svg`)
      const targetSvg = page.querySelector<SVGSVGElement>('.shape-workshop-target-svg')
      const targetPath = targetSvg?.querySelector<SVGPathElement>(`path[data-target-piece-index="${index}"]`)
      if (!sourceSvg || !targetSvg || !targetPath) return finished

      const sourceViewport = sourceSvg.getBoundingClientRect()
      const targetViewport = targetSvg.getBoundingClientRect()
      if (sourceViewport.width <= 0 || sourceViewport.height <= 0 || targetViewport.width <= 0 || targetViewport.height <= 0) return finished

      const bounds = geometryBounds(geometry)
      const source = geometryScreenRect(sourceViewport, paddedGeometryBounds(geometry), bounds)
      const target = geometryScreenRect(targetViewport, { x: 0, y: 0, width: 240, height: 200 }, bounds)
      if (target.width <= 0 || target.height <= 0) return finished

      const flight = targetSvg.cloneNode(false) as SVGSVGElement
      flight.setAttribute('class', 'shape-workshop-flight')
      flight.setAttribute('aria-hidden', 'true')
      flight.removeAttribute('aria-label')
      flight.removeAttribute('role')
      flight.style.left = `${targetViewport.left}px`
      flight.style.top = `${targetViewport.top}px`
      flight.style.width = `${targetViewport.width}px`
      flight.style.height = `${targetViewport.height}px`
      flight.dataset.flightToken = token.toString()
      const flightPath = targetPath.cloneNode(true) as SVGPathElement
      flightPath.setAttribute('class', 'shape-workshop-flight-piece')
      flightPath.removeAttribute('data-target-piece-index')
      flight.append(flightPath)
      page.append(flight)

      const start = flightTransform(source, target)
      flight.style.transformOrigin = `${start.originX - targetViewport.left}px ${start.originY - targetViewport.top}px`
      let observer: MutationObserver | undefined
      let interruptedByRender = false
      let retainedForSettle = false
      try {
        if (typeof flight.animate !== 'function') return finished
        const animation = flight.animate([
          { transform: start.transform, opacity: .94, filter: 'drop-shadow(0 4px 6px rgb(15 23 42 / .28))' },
          { transform: 'translate(0, 0) scale(1.08)', opacity: 1, filter: 'drop-shadow(0 8px 12px rgb(15 23 42 / .24))', offset: .78 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'drop-shadow(0 0 7px rgb(251 191 36 / .85))' },
        ], { duration: 520, easing: 'cubic-bezier(.22, .8, .3, 1)', fill: 'both' })
        const interrupted = typeof MutationObserver === 'undefined'
          ? new Promise<void>(() => undefined)
          : new Promise<void>(resolve => {
              observer = new MutationObserver(() => {
                if (!page.isConnected || !targetPath.isConnected || !targetPath.classList.contains('shape-workshop-slot--receiving')) {
                  interruptedByRender = true
                  resolve()
                }
              })
              observer.observe(page, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] })
            })
        await Promise.race([
          animation.finished.catch(() => undefined),
          new Promise<void>(resolve => window.setTimeout(resolve, 700)),
          interrupted,
        ])
        animation.cancel()
        if (!interruptedByRender) {
          retainedForSettle = true
          window.setTimeout(() => flight.remove(), 80)
        }
        return finished
      } finally {
        observer?.disconnect()
        if (!retainedForSettle) flight.remove()
      }
    })
  }),
})

export const update = (model: Model, message: Message): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      ShapeWorkshopTapPiece: ({ index }) => {
        const puzzle = currentPuzzle(model)
        const piece = puzzle.pieces[index]
        if (!Number.isInteger(index) || !piece || isPuzzleComplete(model) || validFlyingPieceIds(model).includes(index) || validPlacedPieceIds(model).includes(index)) return [model, []]
        const token = Math.max(0, Math.trunc(model.animationToken)) + 1
        const flyingPieceTokens = puzzle.pieces.map((_, pieceIndex) =>
          Number.isInteger(model.flyingPieceTokens[pieceIndex]) ? model.flyingPieceTokens[pieceIndex]! : -1)
        flyingPieceTokens[index] = token
        return [{ ...model, flyingPieceTokens, animationToken: token }, [flyPieceCommand(index, token, piece.geometry)]]
      },
      ShapeWorkshopPieceFlightFinished: ({ index, token }) => {
        if (!validFlyingPieceIds(model).includes(index) || model.flyingPieceTokens[index] !== token) return [model, []]
        const flyingPieceTokens = currentPuzzle(model).pieces.map((_, pieceIndex) =>
          Number.isInteger(model.flyingPieceTokens[pieceIndex]) ? model.flyingPieceTokens[pieceIndex]! : -1)
        flyingPieceTokens[index] = -1
        return [{ ...model, placedPieceIds: [...validPlacedPieceIds(model), index], flyingPieceTokens }, []]
      },
      ShapeWorkshopNextPuzzle: () => isPuzzleComplete(model)
        ? [{ ...model, roundIndex: normalizeRoundIndex(model.roundIndex) + 1, placedPieceIds: [], flyingPieceTokens: [], animationToken: model.animationToken + 1, revision: model.revision + 1 }, []]
        : [model, []],
      ShapeWorkshopReplayPuzzle: () => [{ ...model, roundIndex: normalizeRoundIndex(model.roundIndex), placedPieceIds: [], flyingPieceTokens: [], animationToken: model.animationToken + 1, revision: model.revision + 1 }, []],
    }),
  )

type WorkshopTextKey = 'shapeWorkshopTitle' | 'shapeWorkshopRound' | 'shapeWorkshopPrompt' | 'shapeWorkshopTapPiece' | 'shapeWorkshopComplete' | 'shapeWorkshopNext' | 'shapeWorkshopReplay'
const wt = (key: WorkshopTextKey, language: string): string => t(key, language)

const paddedViewBox = (geometry: Geometry, padding = 8): string => {
  const bounds = paddedGeometryBounds(geometry, padding)
  return `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`
}

const puzzleEquation = (puzzle: WorkshopPuzzle, language: string): string => {
  const counts = new Map<ShapeNameKey, number>()
  for (const piece of puzzle.pieces) counts.set(piece.nameKey, (counts.get(piece.nameKey) ?? 0) + 1)
  const ingredients = [...counts].map(([nameKey, count]) =>
    count === 1 ? t(nameKey, language) : `${count} × ${t(nameKey, language)}`)
  return `${ingredients.join(' + ')} = ${t(puzzle.nameKey, language)}`
}

export const view = (model: Model, language: string = 'en'): Html => {
  const h = html<Message>()
  const puzzle = currentPuzzle(model)
  const placed = new Set(validPlacedPieceIds(model))
  const flying = new Set(validFlyingPieceIds(model))
  const complete = isPuzzleComplete(model)
  const shapeName = t(puzzle.nameKey, language)
  const targetSvg = h.svg([
    h.Class('shape-workshop-target-svg'), h.ViewBox('0 0 240 200'), h.Attribute('role', 'img'),
    h.Attribute('aria-label', `${wt('shapeWorkshopPrompt', language)} ${shapeName}`),
    h.Attribute('aria-busy', String(flying.size > 0)),
  ], [
    h.path([h.Class('shape-workshop-outline'), h.D(geometryPath(puzzle.silhouette))], []),
    ...puzzle.pieces.map((piece, index) => h.path([
      h.D(geometryPath(piece.geometry)),
      h.Class(placed.has(index) ? 'shape-workshop-piece' : `shape-workshop-slot${flying.has(index) ? ' shape-workshop-slot--receiving' : ''}`),
      h.Style({ '--shape-workshop-color': piece.color }),
      h.DataAttribute('target-piece-index', index.toString()),
      h.Attribute('aria-hidden', 'true'),
    ], [])),
  ])

  const target = complete
    ? h.button([
        h.Class('shape-workshop-target shape-workshop-target--complete'), h.OnClick(ReplayPuzzle()),
        h.Attribute('aria-label', `${wt('shapeWorkshopReplay', language)}: ${shapeName}`), h.Key(`complete-${model.revision}`),
      ], [targetSvg])
    : h.div([h.Class('shape-workshop-target'), h.Key(`building-${model.revision}`)], [targetSvg])

  return h.div([h.Class('page shape-workshop-page')], [
    h.div([h.Class('card shape-workshop-card')], [
      h.div([h.Class('shape-workshop-heading')], [
        h.div([], [
          h.h1([h.Class('title')], [wt('shapeWorkshopTitle', language)]),
          h.p([h.Class('shape-workshop-prompt')], [wt('shapeWorkshopPrompt', language)]),
        ]),
        h.span([h.Class('shape-workshop-progress'), h.Attribute('dir', 'ltr')], [`${wt('shapeWorkshopRound', language)} ${normalizeRoundIndex(model.roundIndex) + 1}`]),
      ]),
      target,
      h.div([h.Class('shape-workshop-status'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite')], complete
        ? [
            h.span([h.Class('shape-workshop-identity-icon'), h.Attribute('aria-hidden', 'true')], [puzzle.icon]),
            h.div([], [
              h.strong([h.Attribute('dir', 'ltr')], [puzzleEquation(puzzle, language)]),
              h.div([h.Class('shape-workshop-complete-text')], [wt('shapeWorkshopComplete', language)]),
            ]),
          ]
        : [
            h.span([], [wt('shapeWorkshopTapPiece', language)]),
            h.span([h.Class('shape-workshop-piece-count'), h.Attribute('dir', 'ltr')], [`${placed.size + flying.size}/${puzzle.pieces.length}`]),
          ]),
      h.div([h.Class('shape-workshop-tray'), h.Attribute('role', 'group'), h.Attribute('aria-label', wt('shapeWorkshopTapPiece', language)), h.Attribute('aria-busy', String(flying.size > 0))], [
        ...puzzle.pieces.map((piece, index) => h.button([
          h.Class(`shape-workshop-piece-button${flying.has(index) ? ' shape-workshop-piece-button--flying' : ''}`), h.OnClick(TapPiece({ index })), h.Disabled(placed.has(index) || flying.has(index)),
          h.Attribute('aria-pressed', String(placed.has(index) || flying.has(index))), h.Attribute('aria-label', `${wt('shapeWorkshopTapPiece', language)} ${index + 1}: ${t(piece.nameKey, language)}`),
          h.DataAttribute('piece-index', index.toString()), h.Style({ '--shape-workshop-color': piece.color }),
        ], [
          h.svg([h.Class('shape-workshop-piece-svg'), h.ViewBox(paddedViewBox(piece.geometry)), h.Attribute('aria-hidden', 'true')], [
            h.path([h.D(geometryPath(piece.geometry))], []),
          ]),
        ])),
      ]),
      h.div([h.Class('shape-workshop-actions')], [
        h.button([h.Class('btn btn-secondary'), h.OnClick(ReplayPuzzle())], [wt('shapeWorkshopReplay', language)]),
        h.button([h.Class('btn btn-primary'), h.OnClick(NextPuzzle()), h.Disabled(!complete)], [wt('shapeWorkshopNext', language)]),
      ]),
    ]),
  ])
}
