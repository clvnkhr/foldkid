import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { makeBubble3dGeometry } from './bubbles3dGeometry'
import { BUBBLE3D_SHAPES, type Bubble3dShape } from './bubbles3dShapes'

describe('3D bubble geometries', () => {
  it.each(BUBBLE3D_SHAPES.map(shape => shape.id))('bounds every orientation of %s and provides valid renderable triangles', kind => {
    const geometry = makeBubble3dGeometry(kind)
    try {
      const positions = geometry.getAttribute('position')
      const normals = geometry.getAttribute('normal')
      expect(positions.count).toBeGreaterThan(3)
      expect(positions.count).toBeLessThan(8000)
      expect(normals.count).toBe(positions.count)
      let furthest = 0
      for (let index = 0; index < positions.count; index++) {
        const position = new Vector3().fromBufferAttribute(positions, index)
        const normal = new Vector3().fromBufferAttribute(normals, index)
        expect([...position.toArray(), ...normal.toArray()].every(Number.isFinite)).toBe(true)
        expect(normal.length()).toBeCloseTo(1, 4)
        furthest = Math.max(furthest, position.length())
      }
      expect(furthest).toBeCloseTo(1, 5)
      expect(geometry.boundingBox!.getCenter(new Vector3()).length()).toBeLessThan(0.000001)
      expect(geometry.boundingSphere!.center.length()).toBeLessThan(0.000001)
      expect(geometry.boundingSphere!.radius).toBeCloseTo(1, 5)
      const indices = geometry.getIndex()
      if (indices) {
        expect(indices.count % 3).toBe(0)
        expect(Array.from(indices.array).every(index => Number.isInteger(index) && index >= 0 && index < positions.count)).toBe(true)
      } else expect(positions.count % 3).toBe(0)
    } finally { geometry.dispose() }
  })

  const intersects = (kind: Bubble3dShape, x: number, y: number): boolean => {
    const geometry = makeBubble3dGeometry(kind)
    const material = new MeshBasicMaterial({ side: DoubleSide })
    try {
      const mesh = new Mesh(geometry, material)
      mesh.updateMatrixWorld()
      return new Raycaster(new Vector3(x, y, 3), new Vector3(0, 0, -1)).intersectObject(mesh).length > 0
    } finally { geometry.dispose(); material.dispose() }
  }

  it('keeps the gear and torus center holes open to ray picking', () => {
    expect(intersects('gear', 0, 0)).toBe(false)
    expect(intersects('gear', 0.6, 0)).toBe(true)
    expect(intersects('torus', 0, 0)).toBe(false)
    expect(intersects('torus', 0.7, 0)).toBe(true)
  })

  it('keeps the crescent concave and the cross corners empty', () => {
    expect(intersects('crescent', 0, 0)).toBe(false)
    expect(intersects('crescent', -0.5, 0)).toBe(true)
    expect(intersects('cross', 0, 0)).toBe(true)
    expect(intersects('cross', 0.55, 0.55)).toBe(false)
  })

  it('keeps the heart notch and star points recognizable', () => {
    expect(intersects('heart', 0, 0.6)).toBe(false)
    expect(intersects('heart', 0.35, 0.6)).toBe(true)
    expect(intersects('star', 0, 0.8)).toBe(true)
    expect(intersects('star', 0.5, 0.7)).toBe(false)
  })

  it.each(['cube', 'cuboid', 'roundedCube'] as const)('rounds the actual corners of %s', kind => {
    const geometry = makeBubble3dGeometry(kind)
    try {
      const { max } = geometry.boundingBox!
      expect(intersects(kind, max.x * 0.97, max.y * 0.97)).toBe(false)
      expect(intersects(kind, max.x * 0.8, max.y * 0.8)).toBe(true)
    } finally { geometry.dispose() }
  })

  it('curves the cylinder rim by shrinking its top profile', () => {
    const geometry = makeBubble3dGeometry('cylinder')
    try {
      const positions = geometry.getAttribute('position')
      const maxY = geometry.boundingBox!.max.y
      let topRadius = 0
      let barrelRadius = 0
      for (let index = 0; index < positions.count; index++) {
        const radius = Math.hypot(positions.getX(index), positions.getZ(index))
        if (Math.abs(positions.getY(index) - maxY) < 0.00001) topRadius = Math.max(topRadius, radius)
        barrelRadius = Math.max(barrelRadius, radius)
      }
      expect(topRadius).toBeLessThan(barrelRadius * 0.9)
    } finally { geometry.dispose() }
  })

  it.each(['star', 'heart', 'crescent', 'gear', 'cross'] as const)('makes %s a plump solid', kind => {
    const geometry = makeBubble3dGeometry(kind)
    try {
      const size = geometry.boundingBox!.getSize(new Vector3())
      expect(size.z / Math.max(size.x, size.y)).toBeGreaterThan(0.3)
    } finally { geometry.dispose() }
  })

  it.each(BUBBLE3D_SHAPES.map(shape => shape.id))('keeps shared surface normals continuous for %s', kind => {
    const geometry = makeBubble3dGeometry(kind)
    try {
      const positions = geometry.getAttribute('position')
      const normals = geometry.getAttribute('normal')
      const shared = new Map<string, Vector3>()
      for (let index = 0; index < positions.count; index++) {
        const position = new Vector3().fromBufferAttribute(positions, index)
        const normal = new Vector3().fromBufferAttribute(normals, index)
        const key = position.toArray().map(value => value.toFixed(5)).join(',')
        const previous = shared.get(key)
        if (previous) expect(previous.dot(normal)).toBeGreaterThan(0.999)
        else shared.set(key, normal)
      }
    } finally { geometry.dispose() }
  })
})
