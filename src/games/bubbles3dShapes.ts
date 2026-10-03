import { Schema as S } from 'effect'

export const MIN_BUBBLE3D_SIZE = 0.35
export const MAX_BUBBLE3D_SIZE = 1.7

export const BUBBLE3D_SHAPES = [
  { id: 'sphere', glyph: '●' },
  { id: 'cube', glyph: '◼' },
  { id: 'cuboid', glyph: '▰' },
  { id: 'roundedCube', glyph: '▣' },
  { id: 'tetrahedron', glyph: '▲' },
  { id: 'octahedron', glyph: '◇' },
  { id: 'dodecahedron', glyph: '⬟' },
  { id: 'icosahedron', glyph: '◈' },
  { id: 'cone', glyph: '△' },
  { id: 'cylinder', glyph: '▤' },
  { id: 'triangularPrism', glyph: '◭' },
  { id: 'pentagonalPrism', glyph: '⬠' },
  { id: 'hexagonalPrism', glyph: '⬡' },
  { id: 'pyramid', glyph: '▴' },
  { id: 'triangularBipyramid', glyph: '✧' },
  { id: 'capsule', glyph: '⬭' },
  { id: 'torus', glyph: '◎' },
  { id: 'torusKnot', glyph: '❀' },
  { id: 'star', glyph: '★' },
  { id: 'heart', glyph: '♥' },
  { id: 'crescent', glyph: '☾' },
  { id: 'gear', glyph: '⚙' },
  { id: 'cross', glyph: '✚' },
  { id: 'diamond', glyph: '◆' },
] as const

export const Bubble3dShape = S.Literals(BUBBLE3D_SHAPES.map(shape => shape.id))
export type Bubble3dShape = typeof Bubble3dShape.Type

export const isBubble3dShape = (value: unknown): value is Bubble3dShape =>
  BUBBLE3D_SHAPES.some(shape => shape.id === value)

export const bubble3dShapeDefinition = (kind: Bubble3dShape) => BUBBLE3D_SHAPES.find(shape => shape.id === kind)!
