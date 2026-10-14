import { Schema as S } from 'effect'
import type { StringKey } from '../i18n'

export const Shape = S.Literals([
  'circle', 'star', 'heart', 'triangle', 'oval', 'semicircle', 'donut', 'rectangle', 'diamond',
  'trapezoid', 'square', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon', 'decagon',
  'crescent', 'cross', 'arrow', 'lightning', 'kite', 'parallelogram', 'rightTriangle', 'capsule',
  'teardrop', 'egg', 'clover', 'flower', 'cloud', 'arch', 'chevron', 'sixPointStar', 'eightPointStar',
])
export type Shape = typeof Shape.Type
export const SHAPE_KEYS: Record<Shape, StringKey> = {
  circle: 'shapeCircle', star: 'shapeStar', heart: 'shapeHeart', triangle: 'shapeTriangle', oval: 'shapeOval',
  semicircle: 'shapeSemicircle', donut: 'shapeDonut', rectangle: 'shapeRectangle', diamond: 'shapeDiamond',
  trapezoid: 'shapeTrapezoid', square: 'shapeSquare', pentagon: 'shapePentagon', hexagon: 'shapeHexagon',
  heptagon: 'shapeHeptagon', octagon: 'shapeOctagon', nonagon: 'shapeNonagon', decagon: 'shapeDecagon',
  crescent: 'shapeCrescent', cross: 'shapeCross', arrow: 'shapeArrow', lightning: 'shapeLightning',
  kite: 'shapeKite', parallelogram: 'shapeParallelogram', rightTriangle: 'shapeRightTriangle', capsule: 'shapeCapsule',
  teardrop: 'shapeTeardrop', egg: 'shapeEgg', clover: 'shapeClover', flower: 'shapeFlower', cloud: 'shapeCloud',
  arch: 'shapeArch', chevron: 'shapeChevron', sixPointStar: 'shapeSixPointStar', eightPointStar: 'shapeEightPointStar',
}

export const polygonPoints = (sides: number): readonly (readonly [number, number])[] =>
  Number.isInteger(sides) && sides >= 3 && sides <= 10
    ? Array.from({ length: sides }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / sides
      return [50 + Math.cos(angle) * 36, 50 + Math.sin(angle) * 36] as const
    }) : []
const pointPath = (points: readonly (readonly [number, number])[]): string => points.map(([x, y], index) =>
  `${index === 0 ? 'M' : 'L'} ${x.toFixed(3)} ${y.toFixed(3)}`).join(' ') + ' Z'
const circle = 'M 50 14 A 36 36 0 1 1 50 86 A 36 36 0 1 1 50 14 Z'
export const starPoints = (tips: number): readonly (readonly [number, number])[] => {
  if (tips !== 5 && tips !== 6 && tips !== 8) return []
  const innerRadius = tips === 5 ? 18 : tips === 6 ? 20 : 23
  return Array.from({ length: tips * 2 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / tips
    const radius = index % 2 === 0 ? 38 : innerRadius
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius] as const
  })
}
export const petalPoints = (petals: number): readonly (readonly [number, number])[] => {
  if (petals !== 4 && petals !== 6) return []
  return Array.from({ length: petals * 16 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / (petals * 16)
    const radius = 29 + 9 * Math.cos(index * Math.PI / 8)
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius] as const
  })
}
export const SHAPE_PATHS: Record<Shape, string> = {
  circle,
  star: pointPath(starPoints(5)),
  heart: 'M 50 86 C 37 76 10 58 12 36 C 14 13 38 11 50 32 C 62 11 86 13 88 36 C 90 58 63 76 50 86 Z',
  triangle: 'M 45 18 Q 50 10 55 18 L 88 76 Q 93 85 82 85 L 18 85 Q 7 85 12 76 Z',
  oval: 'M 12 50 A 38 27 0 1 1 88 50 A 38 27 0 1 1 12 50 Z',
  semicircle: 'M 14 68 A 36 36 0 0 1 86 68 L 14 68 Z',
  donut: circle + ' M 50 33 A 17 17 0 1 1 50 67 A 17 17 0 1 1 50 33 Z',
  rectangle: 'M 20 24 H 80 Q 89 24 89 33 V 67 Q 89 76 80 76 H 20 Q 11 76 11 67 V 33 Q 11 24 20 24 Z',
  diamond: 'M 50 10 L 88 50 L 50 90 L 12 50 Z',
  trapezoid: 'M 30 18 L 70 18 L 90 82 L 10 82 Z',
  square: 'M 27 16 H 73 Q 84 16 84 27 V 73 Q 84 84 73 84 H 27 Q 16 84 16 73 V 27 Q 16 16 27 16 Z',
  pentagon: pointPath(polygonPoints(5)),
  hexagon: pointPath(polygonPoints(6)),
  heptagon: pointPath(polygonPoints(7)),
  octagon: pointPath(polygonPoints(8)),
  nonagon: pointPath(polygonPoints(9)),
  decagon: pointPath(polygonPoints(10)),
  crescent: 'M 76 16 C 34 10 12 27 12 50 C 12 76 34 90 76 84 C 51 82 38 66 38 50 C 38 34 51 18 76 16 Z',
  cross: 'M 36 12 H 64 V 36 H 88 V 64 H 64 V 88 H 36 V 64 H 12 V 36 H 36 Z',
  arrow: 'M 14 35 L 55 35 L 55 15 L 88 50 L 55 85 L 55 65 L 14 65 Z',
  lightning: 'M 58 10 L 20 56 L 46 56 L 34 90 L 80 40 L 54 40 Z',
  kite: 'M 50 12 L 82 42 L 50 90 L 18 42 Z',
  parallelogram: 'M 34 20 L 90 20 L 66 80 L 10 80 Z',
  rightTriangle: 'M 18 16 L 86 84 L 18 84 Z',
  capsule: 'M 36 24 H 64 A 26 26 0 0 1 64 76 H 36 A 26 26 0 0 1 36 24 Z',
  teardrop: 'M 50 12 C 42 30 18 42 18 63 C 18 81 33 90 50 90 C 67 90 82 81 82 63 C 82 42 58 30 50 12 Z',
  egg: 'M 50 12 C 35 12 22 39 22 61 C 22 80 34 88 50 88 C 66 88 78 80 78 61 C 78 39 65 12 50 12 Z',
  clover: pointPath(petalPoints(4)),
  flower: pointPath(petalPoints(6)),
  cloud: 'M 24 76 C 10 76 10 52 24 48 C 16 30 38 14 52 30 C 64 16 88 24 86 44 C 90 46 90 76 76 76 Z',
  arch: 'M 16 86 L 16 48 A 34 34 0 0 1 84 48 L 84 86 L 65 86 L 65 48 A 15 15 0 0 0 35 48 L 35 86 Z',
  chevron: 'M 14 20 L 50 56 L 86 20 L 86 50 L 50 86 L 14 50 Z',
  sixPointStar: pointPath(starPoints(6)),
  eightPointStar: pointPath(starPoints(8)),
}

export const EXTRA_SHAPES = [
  'star', 'heart', 'oval', 'semicircle', 'donut', 'rectangle', 'diamond', 'trapezoid',
  'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon', 'decagon',
  'crescent', 'cross', 'arrow', 'lightning', 'kite', 'parallelogram', 'rightTriangle', 'capsule',
  'teardrop', 'egg', 'clover', 'flower', 'cloud', 'arch', 'chevron', 'sixPointStar', 'eightPointStar',
] as const satisfies readonly Shape[]
