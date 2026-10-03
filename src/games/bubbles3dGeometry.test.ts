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

  it.each(['hemisphere', 'ellipsoid', 'egg', 'frustum', 'hexagonalBipyramid'] as const)('closes every surface edge of %s with outward triangles', kind => {
    const geometry = makeBubble3dGeometry(kind)
    try {
      const positions = geometry.getAttribute('position')
      const indices = geometry.getIndex()
      const vertexIds = new Map<string, number>()
      const welded = Array.from({ length: positions.count }, (_, index) => {
        const key = [positions.getX(index), positions.getY(index), positions.getZ(index)].map(value => Math.round(value * 100000)).join(',')
        if (!vertexIds.has(key)) vertexIds.set(key, vertexIds.size)
        return vertexIds.get(key)!
      })
      const edges = new Map<string, { count: number; direction: number }>()
      let volume = 0
      const a = new Vector3()
      const b = new Vector3()
      const c = new Vector3()
      const cross = new Vector3()
      for (let offset = 0; offset < (indices?.count ?? positions.count); offset += 3) {
        const triangle = [0, 1, 2].map(index => indices?.getX(offset + index) ?? offset + index)
        const ids = triangle.map(index => welded[index]!)
        // Native spherical pole fans contain zero-area triangles at the axis.
        if (new Set(ids).size < 3) continue
        a.fromBufferAttribute(positions, triangle[0]!)
        b.fromBufferAttribute(positions, triangle[1]!)
        c.fromBufferAttribute(positions, triangle[2]!)
        volume += a.dot(cross.crossVectors(b, c)) / 6
        for (let index = 0; index < 3; index++) {
          const first = ids[index]!
          const second = ids[(index + 1) % 3]!
          const key = first < second ? `${first},${second}` : `${second},${first}`
          const edge = edges.get(key) ?? { count: 0, direction: 0 }
          edge.count++
          edge.direction += first < second ? 1 : -1
          edges.set(key, edge)
        }
      }
      expect(edges.size).toBeGreaterThan(0)
      expect([...edges.values()].every(edge => edge.count === 2 && edge.direction === 0)).toBe(true)
      expect(volume).toBeGreaterThan(0)
    } finally { geometry.dispose() }
  })

  const surfacePoint = (kind: Bubble3dShape, origin: Vector3, direction: Vector3): Vector3 | undefined => {
    const geometry = makeBubble3dGeometry(kind)
    const material = new MeshBasicMaterial()
    try {
      const mesh = new Mesh(geometry, material)
      mesh.updateMatrixWorld()
      return new Raycaster(origin, direction).intersectObject(mesh)[0]?.point.clone()
    } finally { geometry.dispose(); material.dispose() }
  }

  it('makes the hemisphere a squat rounded dome with a flat pickable cap', () => {
    const geometry = makeBubble3dGeometry('hemisphere')
    try {
      const bounds = geometry.boundingBox!
      const size = bounds.getSize(new Vector3())
      expect(size.y / size.x).toBeGreaterThan(0.5)
      expect(size.y / size.x).toBeLessThan(0.65)
      const positions = geometry.getAttribute('position')
      let capRadius = 0
      for (let index = 0; index < positions.count; index++) {
        if (Math.abs(positions.getY(index) - bounds.min.y) < 0.00001) capRadius = Math.max(capRadius, Math.hypot(positions.getX(index), positions.getZ(index)))
      }
      expect(capRadius).toBeLessThan(bounds.max.x * 0.9)
      const cap = surfacePoint('hemisphere', new Vector3(0.2, -3, 0.2), new Vector3(0, 1, 0))!
      expect(cap.y).toBeCloseTo(bounds.min.y, 5)
      const dome = surfacePoint('hemisphere', new Vector3(0.2, 3, 0.2), new Vector3(0, -1, 0))!
      expect(dome.y).toBeGreaterThan(0)
      expect(dome.y).toBeLessThan(bounds.max.y)
      expect(intersects('hemisphere', bounds.max.x * 0.85, bounds.min.y * 0.75)).toBe(true)
      expect(intersects('hemisphere', bounds.max.x * 0.85, bounds.max.y * 0.75)).toBe(false)
    } finally { geometry.dispose() }
  })

  it('gives the ellipsoid a symmetric elongated silhouette instead of a sphere or capsule', () => {
    const geometry = makeBubble3dGeometry('ellipsoid')
    try {
      const size = geometry.boundingBox!.getSize(new Vector3())
      expect(size.y / size.x).toBeGreaterThan(1.4)
      expect(size.y / size.x).toBeLessThan(1.6)
      expect(size.x).toBeCloseTo(size.z, 5)
      const upper = surfacePoint('ellipsoid', new Vector3(0, 0.5, 3), new Vector3(0, 0, -1))!
      const lower = surfacePoint('ellipsoid', new Vector3(0, -0.5, 3), new Vector3(0, 0, -1))!
      expect(upper.z).toBeCloseTo(lower.z, 5)
      expect(intersects('ellipsoid', 0.8, 0)).toBe(false)
      expect(intersects('sphere', 0.8, 0)).toBe(true)
      expect(intersects('ellipsoid', 0, 0.8)).toBe(true)
    } finally { geometry.dispose() }
  })

  it('rounds both ends of the egg while keeping its lower half wider', () => {
    const upper = surfacePoint('egg', new Vector3(0, 0.5, 3), new Vector3(0, 0, -1))!
    const lower = surfacePoint('egg', new Vector3(0, -0.5, 3), new Vector3(0, 0, -1))!
    expect(lower.z).toBeGreaterThan(upper.z * 1.2)
    expect(surfacePoint('egg', new Vector3(0.05, 3, 0), new Vector3(0, -1, 0))).toBeDefined()
    expect(surfacePoint('egg', new Vector3(0.05, -3, 0), new Vector3(0, 1, 0))).toBeDefined()
  })

  it('keeps a frustum visibly tapered with a broad capped top instead of a cone point', () => {
    const geometry = makeBubble3dGeometry('frustum')
    try {
      const { min, max } = geometry.boundingBox!
      const upper = surfacePoint('frustum', new Vector3(0, max.y * 0.7, 3), new Vector3(0, 0, -1))!
      const lower = surfacePoint('frustum', new Vector3(0, min.y * 0.7, 3), new Vector3(0, 0, -1))!
      expect(lower.z).toBeGreaterThan(upper.z * 1.3)
      const cap = surfacePoint('frustum', new Vector3(max.x * 0.25, 3, 0), new Vector3(0, -1, 0))!
      expect(cap.y).toBeCloseTo(max.y, 5)
    } finally { geometry.dispose() }
  })

  it('preserves six rounded equatorial corners and two tapered ends in the hexagonal bipyramid', () => {
    const radius = (angle: number): number => {
      const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle))
      const point = surfacePoint('hexagonalBipyramid', direction.clone().multiplyScalar(3), direction.negate())!
      return Math.hypot(point.x, point.z)
    }
    const corner = radius(0)
    const side = radius(Math.PI / 6)
    expect(corner).toBeGreaterThan(side * 1.05)
    for (let index = 1; index < 6; index++) expect(radius(index * Math.PI / 3)).toBeCloseTo(corner, 2)
    const upper = surfacePoint('hexagonalBipyramid', new Vector3(0, 0.7, 3), new Vector3(0, 0, -1))!
    const lower = surfacePoint('hexagonalBipyramid', new Vector3(0, -0.7, 3), new Vector3(0, 0, -1))!
    expect(upper.z).toBeCloseTo(lower.z, 5)
    expect(upper.z).toBeLessThan(side * 0.6)
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
