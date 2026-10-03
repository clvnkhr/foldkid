import {
  BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry,
  DodecahedronGeometry, ExtrudeGeometry, Float32BufferAttribute, IcosahedronGeometry, LatheGeometry,
  OctahedronGeometry, Path, PolyhedronGeometry, Shape, SphereGeometry,
  TetrahedronGeometry, TorusGeometry, TorusKnotGeometry, Triangle, Vector2, Vector3,
} from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

import type { Bubble3dShape } from './bubbles3dShapes'

const roundedPolygon = (points: ReadonlyArray<readonly [number, number]>, radius: number): Shape => {
  const shape = new Shape()
  const corners = points.map(([x, y], index) => {
    const vertex = new Vector2(x, y)
    const previous = new Vector2(...points[(index + points.length - 1) % points.length]!)
    const next = new Vector2(...points[(index + 1) % points.length]!)
    const distance = Math.min(radius, previous.distanceTo(vertex) * 0.35, next.distanceTo(vertex) * 0.35)
    return {
      vertex,
      entry: previous.sub(vertex).normalize().multiplyScalar(distance).add(vertex),
      exit: next.sub(vertex).normalize().multiplyScalar(distance).add(vertex),
    }
  })
  shape.moveTo(corners[0]!.entry.x, corners[0]!.entry.y)
  corners.forEach(({ vertex, exit }, index) => {
    shape.quadraticCurveTo(vertex.x, vertex.y, exit.x, exit.y)
    const next = corners[(index + 1) % corners.length]!.entry
    shape.lineTo(next.x, next.y)
  })
  shape.closePath()
  return shape
}

const smoothGeometry = (geometry: BufferGeometry): BufferGeometry => {
  // Welding only positions lets cap, side and bevel normals agree at their shared seams.
  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')
  const smooth = mergeVertices(geometry)
  geometry.dispose()
  smooth.computeVertexNormals()
  return smooth
}

const extrude = (shape: Shape): BufferGeometry => smoothGeometry(new ExtrudeGeometry(shape, {
  depth: 0.38, steps: 1, curveSegments: 8,
  bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.11, bevelSegments: 6,
}))

const star = (): BufferGeometry => extrude(roundedPolygon(Array.from({ length: 10 }, (_, index) => {
  const angle = Math.PI / 2 + index * Math.PI / 5
  const radius = index % 2 === 0 ? 1 : 0.46
  return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const
}), 0.14))

const heart = (): BufferGeometry => {
  const shape = new Shape()
  shape.moveTo(0, 0.36)
  shape.bezierCurveTo(-0.1, 0.36, -0.14, 0.69, -0.45, 0.79)
  shape.bezierCurveTo(-0.7, 0.91, -1.08, 0.65, -0.85, 0.28)
  shape.bezierCurveTo(-0.7, -0.12, -0.48, -0.55, -0.1, -0.88)
  shape.quadraticCurveTo(0, -1, 0.1, -0.88)
  shape.bezierCurveTo(0.48, -0.55, 0.7, -0.12, 0.85, 0.28)
  shape.bezierCurveTo(1.08, 0.65, 0.7, 0.91, 0.45, 0.79)
  shape.bezierCurveTo(0.14, 0.69, 0.1, 0.36, 0, 0.36)
  shape.closePath()
  return extrude(shape)
}

const crescent = (): BufferGeometry => {
  const shape = new Shape()
  shape.moveTo(0.25, 0.94)
  shape.bezierCurveTo(-0.25, 1.05, -1.08, 0.58, -1, 0)
  shape.bezierCurveTo(-1.08, -0.58, -0.25, -1.05, 0.25, -0.94)
  shape.quadraticCurveTo(0.41, -0.93, 0.26, -0.83)
  shape.bezierCurveTo(-0.2, -0.65, -0.48, -0.28, -0.48, 0)
  shape.bezierCurveTo(-0.48, 0.28, -0.2, 0.65, 0.26, 0.83)
  shape.quadraticCurveTo(0.41, 0.93, 0.25, 0.94)
  shape.closePath()
  return extrude(shape)
}

const gear = (): BufferGeometry => {
  const shape = roundedPolygon(Array.from({ length: 48 }, (_, index) => {
    const angle = index * Math.PI / 24
    const radius = index % 4 === 1 || index % 4 === 2 ? 1 : 0.77
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const
  }), 0.08)
  const hole = new Path()
  hole.absarc(0, 0, 0.31, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return extrude(shape)
}

const cross = (): BufferGeometry => extrude(roundedPolygon([
  [-0.3, 1], [0.3, 1], [0.3, 0.3], [1, 0.3], [1, -0.3], [0.3, -0.3],
  [0.3, -1], [-0.3, -1], [-0.3, -0.3], [-1, -0.3], [-1, 0.3], [-0.3, 0.3],
], 0.16))

const roundDirections = (() => {
  const sphere = new IcosahedronGeometry(1, 2)
  const positions = sphere.getAttribute('position')
  const unique = new Map<string, Vector3>()
  for (let index = 0; index < positions.count; index++) {
    const point = new Vector3().fromBufferAttribute(positions, index)
    unique.set(point.toArray().map(value => value.toFixed(5)).join(','), point)
  }
  sphere.dispose()
  return [...unique.values()]
})()

const roundedConvex = (base: BufferGeometry): BufferGeometry => {
  try {
    base.scale(0.8, 0.8, 0.8)
    const positions = base.getAttribute('position')
    const vertices = new Map<string, Vector3>()
    for (let index = 0; index < positions.count; index++) {
      const vertex = new Vector3().fromBufferAttribute(positions, index)
      vertices.set(vertex.toArray().map(value => value.toFixed(5)).join(','), vertex)
    }
    const hull = smoothGeometry(new ConvexGeometry([...vertices.values()].flatMap(vertex =>
      roundDirections.map(direction => vertex.clone().addScaledVector(direction, 0.18)),
    )))
    const hullPositions = hull.getAttribute('position')
    const baseIndices = base.getIndex()
    const triangleCount = (baseIndices?.count ?? positions.count) / 3
    const triangle = new Triangle()
    const point = new Vector3()
    const closest = new Vector3()
    const nearest = new Vector3()
    const normals: number[] = []
    for (let index = 0; index < hullPositions.count; index++) {
      point.fromBufferAttribute(hullPositions, index)
      let nearestDistance = Infinity
      for (let face = 0; face < triangleCount; face++) {
        triangle.a.fromBufferAttribute(positions, baseIndices?.getX(face * 3) ?? face * 3)
        triangle.b.fromBufferAttribute(positions, baseIndices?.getX(face * 3 + 1) ?? face * 3 + 1)
        triangle.c.fromBufferAttribute(positions, baseIndices?.getX(face * 3 + 2) ?? face * 3 + 2)
        triangle.closestPointToPoint(point, closest)
        const distance = point.distanceToSquared(closest)
        if (distance < nearestDistance) { nearestDistance = distance; nearest.copy(closest) }
      }
      const normal = point.sub(nearest).normalize()
      normals.push(normal.x, normal.y, normal.z)
    }
    hull.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    return hull
  } finally { base.dispose() }
}

const geometryFor = (kind: Bubble3dShape): BufferGeometry => {
  switch (kind) {
    case 'sphere': return new SphereGeometry(1, 32, 24)
    case 'cube': return new RoundedBoxGeometry(1.6, 1.6, 1.6, 4, 0.25)
    case 'cuboid': return new RoundedBoxGeometry(1.8, 1, 0.8, 4, 0.23)
    case 'roundedCube': return new RoundedBoxGeometry(1.6, 1.6, 1.6, 4, 0.52)
    case 'tetrahedron': return roundedConvex(new TetrahedronGeometry(1))
    case 'octahedron': return roundedConvex(new OctahedronGeometry(1))
    case 'dodecahedron': return roundedConvex(new DodecahedronGeometry(1))
    case 'icosahedron': return roundedConvex(new IcosahedronGeometry(1))
    case 'cone': return roundedConvex(new ConeGeometry(0.8, 1.7, 24))
    case 'cylinder': return roundedConvex(new CylinderGeometry(0.8, 0.8, 1.45, 24))
    case 'triangularPrism': return roundedConvex(new CylinderGeometry(0.9, 0.9, 1.45, 3))
    case 'pentagonalPrism': return roundedConvex(new CylinderGeometry(0.9, 0.9, 1.45, 5))
    case 'hexagonalPrism': return roundedConvex(new CylinderGeometry(0.9, 0.9, 1.45, 6))
    case 'pyramid': return roundedConvex(new ConeGeometry(1, 1.7, 4).rotateY(Math.PI / 4))
    case 'triangularBipyramid': return roundedConvex(new PolyhedronGeometry(
      [0, 1, 0, 0, -1, 0, 1, 0, 0, -0.5, 0, Math.sqrt(3) / 2, -0.5, 0, -Math.sqrt(3) / 2],
      [0, 3, 2, 0, 4, 3, 0, 2, 4, 1, 2, 3, 1, 3, 4, 1, 4, 2], 1, 0,
    ))
    case 'capsule': return new CapsuleGeometry(0.5, 1, 8, 24)
    case 'torus': return new TorusGeometry(0.75, 0.26, 16, 48)
    case 'torusKnot': return new TorusKnotGeometry(0.65, 0.19, 120, 12, 2, 3)
    case 'star': return star()
    case 'heart': return heart()
    case 'crescent': return crescent()
    case 'gear': return gear()
    case 'cross': return cross()
    case 'diamond': return roundedConvex(new LatheGeometry([
      new Vector2(0, -1), new Vector2(0.82, 0.2), new Vector2(0.82, 0.28),
      new Vector2(0.42, 0.72), new Vector2(0, 0.72),
    ], 8))
  }
}

// A common centered unit sphere bounds every orientation, including the extruded silhouettes.
export const makeBubble3dGeometry = (kind: Bubble3dShape): BufferGeometry => {
  const geometry = geometryFor(kind)
  geometry.computeBoundingBox()
  const center = geometry.boundingBox!.getCenter(new Vector3())
  geometry.translate(-center.x, -center.y, -center.z)
  geometry.computeBoundingSphere()
  const radius = geometry.boundingSphere!.radius
  geometry.scale(1 / radius, 1 / radius, 1 / radius)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
