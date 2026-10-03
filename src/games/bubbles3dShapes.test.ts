import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { BUBBLE3D_SHAPES, Bubble3dShape, bubble3dShapeDefinition, isBubble3dShape } from './bubbles3dShapes'

describe('3D bubble shape catalogue', () => {
  it('preserves the original shapes and appends five unique shapes with decorative glyphs', () => {
    expect(BUBBLE3D_SHAPES.map(shape => shape.id)).toEqual([
      'sphere', 'cube', 'cuboid', 'roundedCube', 'tetrahedron', 'octahedron', 'dodecahedron',
      'icosahedron', 'cone', 'cylinder', 'triangularPrism', 'pentagonalPrism', 'hexagonalPrism',
      'pyramid', 'triangularBipyramid', 'capsule', 'torus', 'torusKnot', 'star', 'heart',
      'crescent', 'gear', 'cross', 'diamond',
      'hemisphere', 'ellipsoid', 'egg', 'frustum', 'hexagonalBipyramid',
    ])
    expect(new Set(BUBBLE3D_SHAPES.map(shape => shape.id)).size).toBe(29)
    for (const shape of BUBBLE3D_SHAPES) {
      expect(shape.glyph.trim()).not.toBe('')
      expect(bubble3dShapeDefinition(shape.id)).toBe(shape)
      expect(S.decodeUnknownSync(Bubble3dShape)(shape.id)).toBe(shape.id)
      expect(isBubble3dShape(shape.id)).toBe(true)
    }
  })

  it.each(['Sphere', 'triangle', '', null, 0, { id: 'cube' }])('rejects unknown shape %j', value => {
    expect(isBubble3dShape(value)).toBe(false)
    expect(() => S.decodeUnknownSync(Bubble3dShape)(value)).toThrow()
  })
})
