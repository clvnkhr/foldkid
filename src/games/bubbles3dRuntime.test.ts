import { Euler, Group, Mesh, PerspectiveCamera, Quaternion, Scene, Vector3, type BufferGeometry, type MeshPhysicalMaterial } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as Audio from '../audio'
import { createBubbles3dRuntime, createBubbles3dWorld, readBubbles3dSnapshot, type Bubble3dSpec, type RendererHandle } from './bubbles3dRuntime'
import { BUBBLE3D_SHAPES, MAX_BUBBLE3D_SIZE, MIN_BUBBLE3D_SIZE } from './bubbles3dShapes'

const specs: Bubble3dSpec[] = [
  { id: 0, shape: 'sphere', color: '#ff6584', rainbow: false, size: 0.6, x: -0.5, y: 0, z: 0 },
  { id: 1, shape: 'cube', color: '#5bcafa', rainbow: false, size: 0.6, x: 0.5, y: 0, z: 0 },
]
const pointer = (target: EventTarget, type: string, id: number, x: number, y: number, timeStamp?: number): void => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y })
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}
const touch = (target: EventTarget, type: string, contacts: ReadonlyArray<{ identifier: number; clientX: number; clientY: number }>, nativeList = false, timeStamp?: number): void => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const changedTouches = nativeList ? { length: contacts.length, item: (index: number) => contacts[index] ?? null } : contacts
  Object.defineProperty(event, 'changedTouches', { value: changedTouches })
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}
const stage = (bubbles: ReadonlyArray<Bubble3dSpec> = specs) => {
  const host = document.createElement('div')
  host.setAttribute('data-bubbles3d-state', JSON.stringify({ revision: 0, bubbles }))
  host.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400)
  document.body.append(host)
  return host
}
const fakeRenderer = () => {
  let scene: Scene | undefined
  let camera: PerspectiveCamera | undefined
  const renderer: RendererHandle['renderer'] = {
    setSize: vi.fn(), setPixelRatio: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(), setAnimationLoop: vi.fn(),
    render: vi.fn((value, viewpoint) => {
      scene = value as Scene
      camera = viewpoint as PerspectiveCamera
      scene.updateMatrixWorld(true)
      camera.updateMatrixWorld()
    }),
  }
  const handle: RendererHandle = { renderer, disposeEnvironment: vi.fn() }
  const point = (id: number, localPoint?: Vector3): Vector3 => {
    const bubble = scene!.children.find(child => child.userData.bubbleId === id)!
    bubble.updateMatrixWorld()
    const projected = (localPoint ? bubble.localToWorld(localPoint.clone()) : bubble.position.clone()).project(camera!)
    return new Vector3((projected.x + 1) * 200, (1 - projected.y) * 200, 0)
  }
  return { handle, renderer, point, scene: () => scene! }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('3D bubble world', () => {
  const meshesIn = (scene: Scene) => scene.children.filter(child => child instanceof Mesh) as Array<Mesh<BufferGeometry, MeshPhysicalMaterial>>
  const expectContained = (world: ReturnType<typeof createBubbles3dWorld>): void => {
    const verticalSlope = Math.tan(world.camera.fov * Math.PI / 360)
    const horizontalSlope = verticalSlope * world.camera.aspect
    for (const mesh of meshesIn(world.scene)) {
      const radius = Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z)
      const distance = world.camera.position.z - mesh.position.z
      expect([...mesh.position.toArray(), ...mesh.scale.toArray()].every(Number.isFinite)).toBe(true)
      expect(radius).toBeGreaterThan(0)
      expect((distance * verticalSlope - Math.abs(mesh.position.y)) / Math.hypot(1, verticalSlope)).toBeGreaterThanOrEqual(radius - 0.000001)
      expect((distance * horizontalSlope - Math.abs(mesh.position.x)) / Math.hypot(1, horizontalSlope)).toBeGreaterThanOrEqual(radius - 0.000001)
      expect(Math.abs(mesh.position.z)).toBeLessThanOrEqual(2.7)
    }
  }

  it('keeps the full rotating held-size bubble inside narrow and short viewports after collisions and resizing', () => {
    const world = createBubbles3dWorld()
    try {
      world.apply({ revision: 0, bubbles: [
        { ...specs[0]!, size: MAX_BUBBLE3D_SIZE, x: 1, y: 1, z: 1 },
        { ...specs[1]!, size: MIN_BUBBLE3D_SIZE, x: -1, y: -1, z: -1 },
        { ...specs[0]!, id: 2, shape: 'gear', size: MAX_BUBBLE3D_SIZE, x: 0.95, y: -0.95, z: 0.7 },
      ] }, false)
      for (const [width, height] of [[400, 400], [320, 900], [900, 180], [32, 1024], [180, 900], [400, 400]]) {
        world.resize(width!, height!)
        expectContained(world)
        for (let frame = 0; frame < 100; frame++) {
          world.step(0.04, false)
          expectContained(world)
        }
      }
      world.resize(0, Number.NaN)
      expectContained(world)
    } finally { world.dispose() }
  })

  it('preserves the tap-to-hold size ratio and never resizes survivors when another bubble is added or popped', () => {
    const world = createBubbles3dWorld()
    const bubbles = [
      { ...specs[1]!, id: 0, size: MIN_BUBBLE3D_SIZE },
      { ...specs[1]!, id: 1, size: MAX_BUBBLE3D_SIZE },
    ]
    try {
      world.resize(90, 900)
      world.apply({ revision: 0, bubbles }, true)
      const [tap, held] = meshesIn(world.scene)
      expect(held!.scale.x / tap!.scale.x).toBeCloseTo(MAX_BUBBLE3D_SIZE / MIN_BUBBLE3D_SIZE)
      expect(held!.scale.x).toBeLessThan(MAX_BUBBLE3D_SIZE)
      const original = tap!.scale.clone()
      world.apply({ revision: 0, bubbles: [...bubbles, { ...bubbles[1]!, id: 2 }] }, true)
      expect(tap!.scale).toEqual(original)
      expect(world.pop(2, true)).toBe(true)
      world.apply({ revision: 0, bubbles }, true)
      expect(tap!.scale).toEqual(original)
      world.resize(400, 400)
      expect(tap!.scale.x).toBeCloseTo(MIN_BUBBLE3D_SIZE)
      expect(held!.scale.x).toBeCloseTo(MAX_BUBBLE3D_SIZE)
      expect(held!.scale.x / tap!.scale.x).toBeCloseTo(MAX_BUBBLE3D_SIZE / MIN_BUBBLE3D_SIZE)
    } finally { world.dispose() }
  })

  it('uses the drawn radius for collisions and proportionate pop bursts', () => {
    const world = createBubbles3dWorld()
    try {
      world.resize(100, 400)
      world.apply({ revision: 0, bubbles: [
        { ...specs[1]!, id: 0, size: MAX_BUBBLE3D_SIZE, x: 0, z: -0.05 },
        { ...specs[1]!, id: 1, size: MAX_BUBBLE3D_SIZE, x: 0, z: 0.05 },
      ] }, false)
      const [first, second] = meshesIn(world.scene)
      world.step(0, false)
      const gap = first!.scale.x + second!.scale.x
      expect(gap).toBeLessThan(MAX_BUBBLE3D_SIZE * 2)
      expect(first!.position.distanceTo(second!.position)).toBeCloseTo(gap)
      expectContained(world)
      world.apply({ revision: 1, bubbles: [
        { ...specs[1]!, id: 2, size: MIN_BUBBLE3D_SIZE },
        { ...specs[1]!, id: 3, size: MAX_BUBBLE3D_SIZE },
      ] }, false)
      const [tap, held] = meshesIn(world.scene)
      world.pop(2, false)
      world.pop(3, false)
      const bursts = world.scene.children.filter(child => child instanceof Group)
      expect(bursts[0]!.scale.x).toBeCloseTo(tap!.scale.x / 0.6)
      expect(bursts[1]!.scale.x).toBeCloseTo(held!.scale.x / 0.6)
    } finally { world.dispose() }
  })

  it('raycasts the larger visible area of a held bubble', () => {
    const world = createBubbles3dWorld()
    try {
      world.resize(400, 400)
      world.apply({ revision: 0, bubbles: [{ ...specs[0]!, size: MAX_BUBBLE3D_SIZE, x: 0 }] }, true)
      expect(world.pick(250, 200, 400, 400)).toBe(0)
      world.apply({ revision: 1, bubbles: [{ ...specs[0]!, size: MIN_BUBBLE3D_SIZE, x: 0 }] }, true)
      expect(world.pick(250, 200, 400, 400)).toBeUndefined()
      expect(world.pick(200, 200, 400, 400)).toBe(0)
    } finally { world.dispose() }
  })

  it('caches colorful rainbow surfaces separately without tinting solid bubbles and disposes their resources', () => {
    const world = createBubbles3dWorld()
    const baseDisposed = vi.fn()
    const rainbowDisposed = vi.fn()
    const particlesDisposed = vi.fn()
    try {
      world.apply({ revision: 0, bubbles: [
        { ...specs[0]! }, { ...specs[0]!, id: 1, rainbow: true }, { ...specs[0]!, id: 2, rainbow: true },
      ] }, true)
      const [solid, rainbow, repeated] = meshesIn(world.scene)
      expect(solid!.geometry).not.toBe(rainbow!.geometry)
      expect(rainbow!.geometry).toBe(repeated!.geometry)
      expect(solid!.geometry.getAttribute('color')).toBeUndefined()
      expect(solid!.material.vertexColors).toBe(false)
      expect(rainbow!.material.vertexColors).toBe(true)
      expect(rainbow!.material.color.getHexString()).toBe('ffffff')
      expect(rainbow!.material.attenuationColor.getHexString()).toBe('ffffff')
      expect(rainbow!.material.iridescence).toBeGreaterThan(solid!.material.iridescence)
      const colors = rainbow!.geometry.getAttribute('color')
      expect(colors.count).toBe(rainbow!.geometry.getAttribute('position').count)
      expect(Array.from(colors.array).every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true)
      const hues = new Set(Array.from({ length: colors.count }, (_, index) => [colors.getX(index), colors.getY(index), colors.getZ(index)].map(value => value.toFixed(2)).join(',')))
      expect(hues.size).toBeGreaterThan(50)
      solid!.geometry.addEventListener('dispose', baseDisposed)
      rainbow!.geometry.addEventListener('dispose', rainbowDisposed)
      world.pop(1, false)
      const burst = world.scene.children.find(child => child instanceof Group)!
      const particle = burst.children[0] as Mesh
      expect(particle.geometry.getAttribute('color')).toBeDefined()
      particle.geometry.addEventListener('dispose', particlesDisposed)
    } finally { world.dispose() }
    expect(baseDisposed).toHaveBeenCalledOnce()
    expect(rainbowDisposed).toHaveBeenCalledOnce()
    expect(particlesDisposed).toHaveBeenCalledOnce()
  })

  it('uses perspective depth and actual Three.js raycasts for the nearest shape', () => {
    const world = createBubbles3dWorld()
    try {
      world.resize(400, 400)
      world.apply({ revision: 0, bubbles: [{ ...specs[0]!, x: 0, z: 0.8 }, { ...specs[1]!, x: 0, z: -0.8 }] }, false)
      expect(world.pick(200, 200, 400, 400)).toBe(0)
      expect(world.pick(0, 0, 400, 400)).toBeUndefined()
      expect(world.pick(0, 0, 0, 0)).toBeUndefined()
      expect(world.pop(0, false)).toBe(true)
      expect(world.pop(0, false)).toBe(false)
      expect(world.pick(200, 200, 400, 400)).toBe(1)
    } finally { world.dispose() }
  })

  it('freely tumbles every shape around independent axes and freezes position, rotation, and scale for reduced motion', () => {
    const world = createBubbles3dWorld()
    try {
      world.apply({ revision: 0, bubbles: BUBBLE3D_SHAPES.map((shape, id) => ({ ...specs[0]!, id, shape: shape.id })) }, false)
      const meshes = world.scene.children.filter(child => child instanceof Mesh) as Array<Mesh<BufferGeometry, MeshPhysicalMaterial>>
      const original = meshes.map(mesh => ({ position: mesh.position.clone(), orientation: mesh.quaternion.clone(), scale: mesh.scale.clone() }))
      expect(new Set(original.map(transform => transform.orientation.toArray().join(','))).size).toBeGreaterThan(10)
      world.step(0.04, true)
      for (const [index, mesh] of meshes.entries()) {
        expect(mesh.position).toEqual(original[index]!.position)
        expect(mesh.quaternion.equals(original[index]!.orientation)).toBe(true)
        expect(mesh.scale).toEqual(original[index]!.scale)
      }
      world.step(0.04, false)
      const rotations = meshes.map((mesh, index) => mesh.quaternion.clone().multiply(original[index]!.orientation.clone().invert()).normalize())
      for (const [index, rotation] of rotations.entries()) {
        expect(Math.abs(rotation.x)).toBeGreaterThan(0.00001)
        expect(Math.abs(rotation.y)).toBeGreaterThan(0.00001)
        expect(Math.abs(rotation.z)).toBeGreaterThan(0.00001)
        expect(meshes[index]!.quaternion.length()).toBeCloseTo(1)
        expect(rotation.angleTo(new Quaternion())).toBeGreaterThan(0.001)
      }
      expect(new Set(rotations.map(rotation => rotation.toArray().join(','))).size).toBe(meshes.length)
      expect(new Set(rotations.map(rotation => rotation.angleTo(new Quaternion()).toFixed(6))).size).toBeGreaterThan(10)
      const spun = meshes.map(mesh => mesh.quaternion.clone())
      world.apply({ revision: 0, bubbles: BUBBLE3D_SHAPES.map((shape, id) => ({ ...specs[0]!, id, shape: shape.id })).slice(1) }, false)
      for (const [index, mesh] of meshes.slice(1).entries()) expect(mesh.quaternion.equals(spun[index + 1]!)).toBe(true)
      const frozen = meshes.map(mesh => ({ position: mesh.position.clone(), orientation: mesh.quaternion.clone(), scale: mesh.scale.clone() }))
      world.step(1, true)
      for (const [index, mesh] of meshes.entries()) {
        expect(mesh.position).toEqual(frozen[index]!.position)
        expect(mesh.quaternion.equals(frozen[index]!.orientation)).toBe(true)
        expect(mesh.scale).toEqual(frozen[index]!.scale)
      }
    } finally { world.dispose() }
  })

  it('shares geometry only between matching shape kinds and disposes each cached geometry and material once', () => {
    const world = createBubbles3dWorld()
    const geometryDisposed = vi.fn()
    const cubeGeometryDisposed = vi.fn()
    const materialDisposed = vi.fn()
    const survivingMaterialDisposed = vi.fn()
    try {
      world.apply({ revision: 0, bubbles: [...specs, { ...specs[0]!, id: 2 }] }, false)
      const meshes = world.scene.children.filter(child => child instanceof Mesh) as Array<Mesh<BufferGeometry, MeshPhysicalMaterial>>
      expect(meshes[0]!.geometry).toBe(meshes[2]!.geometry)
      expect(meshes[0]!.geometry).not.toBe(meshes[1]!.geometry)
      meshes[0]!.geometry.addEventListener('dispose', geometryDisposed)
      meshes[1]!.geometry.addEventListener('dispose', cubeGeometryDisposed)
      meshes[0]!.material.addEventListener('dispose', materialDisposed)
      meshes[1]!.material.addEventListener('dispose', survivingMaterialDisposed)
      const original = meshes.map(mesh => mesh.position.clone())
      world.step(1, true)
      expect(meshes.map(mesh => mesh.position)).toEqual(original)
      world.step(0.02, false)
      expect(meshes[0]!.position.equals(original[0]!)).toBe(false)
      world.pop(0, false)
      expect(world.scene.children.some(child => child.type === 'Group')).toBe(true)
      for (let index = 0; index < 20; index++) world.step(0.04, false)
      expect(world.scene.children.some(child => child.type === 'Group')).toBe(false)
      world.apply({ revision: 1, bubbles: [{ ...specs[0]!, id: 3 }, { ...specs[1]!, id: 4 }] }, false)
      const replacements = world.scene.children.filter(child => child instanceof Mesh) as Array<Mesh<BufferGeometry, MeshPhysicalMaterial>>
      expect(replacements[0]!.geometry).toBe(meshes[0]!.geometry)
      expect(replacements[1]!.geometry).toBe(meshes[1]!.geometry)
      expect(geometryDisposed).not.toHaveBeenCalled()
      expect(cubeGeometryDisposed).not.toHaveBeenCalled()
      expect(materialDisposed).toHaveBeenCalledOnce()
      expect(survivingMaterialDisposed).toHaveBeenCalledOnce()
    } finally { world.dispose() }
    expect(geometryDisposed).toHaveBeenCalledOnce()
    expect(cubeGeometryDisposed).toHaveBeenCalledOnce()
    expect(materialDisposed).toHaveBeenCalledOnce()
    expect(survivingMaterialDisposed).toHaveBeenCalledOnce()
    expect(world.scene.children).toEqual([])
  })

  it('picks rotated solid meshes while respecting the empty center of a torus', () => {
    const world = createBubbles3dWorld()
    const project = (point: Vector3): Vector3 => {
      world.camera.updateMatrixWorld()
      const projected = point.clone().project(world.camera)
      return new Vector3((projected.x + 1) * 200, (1 - projected.y) * 200, 0)
    }
    const meshes = () => world.scene.children.filter(child => child instanceof Mesh) as Array<Mesh<BufferGeometry, MeshPhysicalMaterial>>
    try {
      world.resize(400, 400)
      world.apply({ revision: 0, bubbles: [{ ...specs[0]!, shape: 'torus', x: 0, z: 0.8 }, { ...specs[0]!, id: 1, x: 0, z: -0.8 }] }, false)
      const ring = meshes().find(mesh => mesh.userData.bubbleId === 0)!
      ring.quaternion.identity()
      expect(world.pick(200, 200, 400, 400)).toBe(1)
      ring.updateMatrixWorld()
      const rim = project(ring.localToWorld(new Vector3(0.75, 0, 0)))
      expect(world.pick(rim.x, rim.y, 400, 400)).toBe(0)
      expect(world.pop(1, true)).toBe(true)
      expect(world.pick(200, 200, 400, 400)).toBeUndefined()
      for (const shape of ['tetrahedron', 'star', 'cube'] as const) {
        world.apply({ revision: 1, bubbles: [{ ...specs[0]!, shape, x: 0, z: 0 }] }, true)
        const mesh = meshes()[0]!
        mesh.quaternion.setFromEuler(new Euler(0.67, 0.93, -0.41))
        const center = project(mesh.position)
        expect(world.pick(center.x, center.y, 400, 400)).toBe(0)
        expect(world.pick(center.x + 90, center.y + 90, 400, 400)).toBeUndefined()
        world.apply({ revision: 2, bubbles: [] }, true)
      }
    } finally { world.dispose() }
  })

  it('rejects invalid or duplicate DOM snapshots before constructing meshes', () => {
    const host = stage()
    try {
      expect(readBubbles3dSnapshot(host)?.bubbles).toEqual(specs)
      const everyShape = BUBBLE3D_SHAPES.map((shape, id) => ({ ...specs[0]!, id, shape: shape.id }))
      host.setAttribute('data-bubbles3d-state', JSON.stringify({ revision: 0, bubbles: everyShape }))
      expect(readBubbles3dSnapshot(host)?.bubbles).toEqual(everyShape)
      const sizeBounds = [{ ...specs[0]!, size: MIN_BUBBLE3D_SIZE }, { ...specs[1]!, size: MAX_BUBBLE3D_SIZE, rainbow: true }]
      host.setAttribute('data-bubbles3d-state', JSON.stringify({ revision: 0, bubbles: sizeBounds }))
      expect(readBubbles3dSnapshot(host)?.bubbles).toEqual(sizeBounds)
      for (const bubbles of [[specs[0], specs[0]], [{ ...specs[0], x: 2 }], [{ ...specs[0], size: MIN_BUBBLE3D_SIZE - 0.00001 }], [{ ...specs[0], size: MAX_BUBBLE3D_SIZE + 0.00001 }], [{ ...specs[0], size: Number.POSITIVE_INFINITY }], [{ ...specs[0], color: 'red' }], [{ ...specs[0], shape: 'unknown' }], [{ ...specs[0], shape: null }], [{ ...specs[0], shape: undefined }], [{ ...specs[0], rainbow: undefined }], [{ ...specs[0], rainbow: 'true' }]]) {
        host.setAttribute('data-bubbles3d-state', JSON.stringify({ revision: 0, bubbles }))
        expect(readBubbles3dSnapshot(host)).toBeUndefined()
      }
      host.setAttribute('data-bubbles3d-state', '{broken')
      expect(readBubbles3dSnapshot(host)).toBeUndefined()
    } finally { host.remove() }
  })
})

describe('3D bubble runtime', () => {
  it('pops different freely oriented shapes independently through mixed native and pointer contacts', () => {
    const host = stage([
      { ...specs[0]!, shape: 'tetrahedron', x: -0.6, y: -0.3 },
      { ...specs[1]!, shape: 'star', x: 0.6, y: -0.3 },
      { ...specs[0]!, id: 2, shape: 'torus', x: 0, y: 0.6 },
    ])
    const fake = fakeRenderer()
    const popped = vi.fn()
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const tetrahedron = fake.point(0)
      const star = fake.point(1)
      const torus = fake.point(2, new Vector3(0.75, 0, 0))
      const native = { identifier: 11, clientX: star.x, clientY: star.y }
      pointer(canvas, 'pointerdown', 1, tetrahedron.x, tetrahedron.y, 100)
      touch(canvas, 'touchstart', [native], true, 200)
      pointer(canvas, 'pointerdown', 2, torus.x, torus.y, 300)
      pointer(document, 'pointerup', 2, torus.x, torus.y)
      touch(document, 'touchend', [native], true)
      pointer(document, 'pointerup', 1, tetrahedron.x, tetrahedron.y)
      expect(popped.mock.calls).toEqual([[2, 0], [1, 0], [0, 0]])
      expect(fake.scene().children.filter(child => child.userData.bubbleId !== undefined).every(child => !child.visible)).toBe(true)
    } finally { cleanup(); host.remove() }
  })

  it('ignores secondary mouse and pen buttons', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      for (const pointerType of ['mouse', 'pen']) {
        canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType, pointerId: 1, clientX: left.x, clientY: left.y }))
        pointer(document, 'pointerup', 1, left.x, left.y)
      }
      expect(popped).not.toHaveBeenCalled()
      expect(fake.scene().children.find(child => child.userData.bubbleId === 0)?.visible).toBe(true)
    } finally { cleanup(); host.remove() }
  })

  it('lets independent touch pointers pop on qualifying releases without capturing or duplicating', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    const warm = vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    vi.spyOn(HTMLCanvasElement.prototype, 'setPointerCapture').mockImplementation(() => { throw new Error('capture unavailable') })
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      const right = fake.point(1)
      expect(typeof TouchEvent).toBe('function')
      pointer(canvas, 'pointerdown', 1, left.x, left.y)
      pointer(canvas, 'pointerdown', 2, right.x, right.y)
      pointer(canvas, 'pointerdown', 3, left.x, left.y)
      expect(warm).not.toHaveBeenCalled()
      pointer(document, 'pointerup', 2, right.x, right.y)
      pointer(document, 'pointerup', 1, left.x, left.y)
      pointer(document, 'pointerup', 3, left.x, left.y)
      expect(popped.mock.calls).toEqual([[1, 0], [0, 0]])
      expect(warm).toHaveBeenCalledTimes(2)
    } finally { cleanup(); host.remove() }
  })

  it('transfers native touches without duplicate pointer releases and preserves unrelated fingers', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      const right = fake.point(1)
      const first = { identifier: 11, clientX: left.x, clientY: left.y }
      const second = { identifier: 12, clientX: right.x, clientY: right.y }
      pointer(canvas, 'pointerdown', 1, left.x, left.y)
      touch(canvas, 'touchstart', [first, second])
      pointer(document, 'pointerup', 1, left.x, left.y)
      touch(document, 'touchcancel', [first])
      touch(document, 'touchend', [second])
      expect(popped.mock.calls).toEqual([[1, 0]])
      expect(fake.scene().children.find(child => child.userData.bubbleId === 0)?.visible).toBe(true)
    } finally { cleanup(); host.remove() }
  })

  it('adopts only the matching pointer from a noniterable TouchList and preserves other held pointers', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      const right = fake.point(1)
      const first = { identifier: 11, clientX: left.x, clientY: left.y }
      pointer(canvas, 'pointerdown', 1, left.x, left.y)
      pointer(canvas, 'pointerdown', 2, right.x, right.y)
      touch(canvas, 'touchstart', [first], true)
      pointer(document, 'pointerup', 2, right.x, right.y)
      pointer(document, 'pointerup', 1, left.x, left.y)
      expect(popped.mock.calls).toEqual([[1, 0]])
      touch(document, 'touchend', [first], true)
      expect(popped.mock.calls).toEqual([[1, 0], [0, 0]])
    } finally { cleanup(); host.remove() }
  })

  it('accepts a new pointer-only touch after native touch events have arrived', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      const right = fake.point(1)
      const first = { identifier: 11, clientX: left.x, clientY: left.y }
      touch(canvas, 'touchstart', [first])
      pointer(canvas, 'pointerdown', 2, right.x, right.y)
      pointer(document, 'pointerup', 2, right.x, right.y)
      expect(popped.mock.calls).toEqual([[1, 0]])
      touch(document, 'touchend', [first])
      expect(popped.mock.calls).toEqual([[1, 0], [0, 0]])
    } finally { cleanup(); host.remove() }
  })

  it('pairs native-first contacts without reviving them after either cancellation stream', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      const right = fake.point(1)
      const first = { identifier: 11, clientX: left.x, clientY: left.y }
      const second = { identifier: 12, clientX: right.x, clientY: right.y }
      touch(canvas, 'touchstart', [first], true, 100)
      pointer(canvas, 'pointerdown', 1, left.x, left.y, 120)
      touch(document, 'touchcancel', [first], true)
      pointer(document, 'pointerup', 1, left.x, left.y)
      touch(canvas, 'touchstart', [second], true, 200)
      pointer(canvas, 'pointerdown', 2, right.x, right.y, 220)
      pointer(document, 'pointercancel', 2, right.x, right.y)
      touch(document, 'touchend', [second], true)
      expect(popped).not.toHaveBeenCalled()
      expect(fake.scene().children.filter(child => child.userData.bubbleId !== undefined).every(child => child.visible)).toBe(true)
      // Once the native stream is gone, a future pointer-only gesture works.
      pointer(canvas, 'pointerdown', 3, left.x, left.y, 400)
      pointer(document, 'pointerup', 3, left.x, left.y)
      expect(popped).toHaveBeenCalledExactlyOnceWith(0, 0)
    } finally { cleanup(); host.remove() }
  })

  it('does not cancel native ownership on deliberate capture loss or pair another finger', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      const first = { identifier: 11, clientX: left.x, clientY: left.y }
      pointer(canvas, 'pointerdown', 1, left.x, left.y, 100)
      touch(canvas, 'touchstart', [first], true, 120)
      pointer(canvas, 'lostpointercapture', 1, left.x, left.y)
      pointer(canvas, 'pointerdown', 2, left.x, left.y, 125)
      touch(document, 'touchcancel', [first], true)
      pointer(document, 'pointerup', 1, left.x, left.y)
      pointer(document, 'pointerup', 2, left.x, left.y)
      expect(popped).toHaveBeenCalledExactlyOnceWith(0, 0)
    } finally { cleanup(); host.remove() }
  })

  for (const interruption of ['blur', 'hidden'] as const) {
    it(`clears both contact streams and capture on ${interruption} so late releases cannot pop bubbles`, () => {
      const host = stage()
      const fake = fakeRenderer()
      const popped = vi.fn()
      vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
      vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
      vi.spyOn(HTMLCanvasElement.prototype, 'hasPointerCapture').mockReturnValue(true)
      const release = vi.spyOn(HTMLCanvasElement.prototype, 'releasePointerCapture').mockImplementation(() => {})
      const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
      try {
        const canvas = host.querySelector('canvas')!
        const left = fake.point(0)
        const right = fake.point(1)
        const second = { identifier: 12, clientX: right.x, clientY: right.y }
        pointer(canvas, 'pointerdown', 1, left.x, left.y)
        touch(canvas, 'touchstart', [second], true)
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
        else {
          const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
          document.dispatchEvent(new Event('visibilitychange'))
          hidden.mockRestore()
        }
        expect(release).toHaveBeenCalledExactlyOnceWith(1)
        pointer(document, 'pointerup', 1, left.x, left.y)
        touch(document, 'touchend', [second], true)
        expect(popped).not.toHaveBeenCalled()
        pointer(canvas, 'pointerdown', 2, right.x, right.y)
        pointer(document, 'pointerup', 2, right.x, right.y)
        expect(popped).toHaveBeenCalledExactlyOnceWith(1, 0)
      } finally { cleanup(); host.remove() }
    })
  }

  it('ignores canceled, moved, and stale touches while keeping current bubbles playable', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    const ready = vi.fn()
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready, unavailable: vi.fn() }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      pointer(canvas, 'pointerdown', 1, left.x, left.y)
      pointer(document, 'pointercancel', 1, left.x, left.y)
      pointer(canvas, 'pointerdown', 2, left.x, left.y)
      pointer(document, 'pointerup', 2, left.x + 50, left.y)
      pointer(canvas, 'pointerdown', 3, left.x, left.y)
      host.setAttribute('data-bubbles3d-state', JSON.stringify({ revision: 1, bubbles: [{ ...specs[0], id: 10 }] }))
      pointer(document, 'pointerup', 3, left.x, left.y)
      expect(popped).not.toHaveBeenCalled()
      expect(ready.mock.calls).toEqual([[0], [1]])
      const fresh = fake.point(10)
      pointer(canvas, 'pointerdown', 4, fresh.x, fresh.y)
      pointer(document, 'pointerup', 4, fresh.x, fresh.y)
      expect(popped).toHaveBeenCalledExactlyOnceWith(10, 1)
    } finally { cleanup(); host.remove() }
  })

  it('provides a playable reduced-motion scene and fully releases resources on unmount', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    const removeMotionListener = vi.fn()
    const motion = { matches: true, addEventListener: vi.fn(), removeEventListener: removeMotionListener } as unknown as MediaQueryList
    vi.spyOn(window, 'matchMedia').mockReturnValue(motion)
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const release = vi.spyOn(HTMLCanvasElement.prototype, 'releasePointerCapture').mockImplementation(() => {})
    vi.spyOn(HTMLCanvasElement.prototype, 'hasPointerCapture').mockReturnValue(true)
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    const canvas = host.querySelector('canvas')!
    const left = fake.point(0)
    const right = fake.point(1)
    pointer(canvas, 'pointerdown', 1, left.x, left.y)
    pointer(document, 'pointerup', 1, left.x, left.y)
    pointer(canvas, 'pointerdown', 2, right.x, right.y)
    expect(popped).toHaveBeenCalledExactlyOnceWith(0, 0)
    expect(fake.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null)
    expect(fake.scene().children.some(child => child.type === 'Group')).toBe(false)
    cleanup()
    cleanup()
    expect(release).toHaveBeenCalledWith(2)
    expect(fake.renderer.dispose).toHaveBeenCalledOnce()
    expect(fake.handle.disposeEnvironment).toHaveBeenCalledOnce()
    expect(removeMotionListener).toHaveBeenCalledOnce()
    expect(host.querySelector('canvas')).toBeNull()
    pointer(document, 'pointerup', 2, right.x, right.y)
    expect(popped).toHaveBeenCalledTimes(1)
    host.remove()
  })

  it('uses a window resize fallback and releases the scene on context loss', () => {
    const host = stage()
    const fake = fakeRenderer()
    const unavailable = vi.fn()
    vi.stubGlobal('ResizeObserver', undefined)
    const cleanup = createBubbles3dRuntime(host, { popped: vi.fn(), ready: vi.fn(), unavailable }, () => fake.handle)
    try {
      const calls = vi.mocked(fake.renderer.setSize).mock.calls.length
      window.dispatchEvent(new Event('resize'))
      expect(fake.renderer.setSize).toHaveBeenCalledTimes(calls + 1)
      host.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(unavailable).toHaveBeenCalledExactlyOnceWith(0)
      expect(fake.renderer.dispose).toHaveBeenCalledOnce()
      const stoppedCalls = vi.mocked(fake.renderer.setSize).mock.calls.length
      window.dispatchEvent(new Event('resize'))
      expect(fake.renderer.setSize).toHaveBeenCalledTimes(stoppedCalls)
    } finally { cleanup(); host.remove() }
  })

  it('safely reports initialization and drawing failures', () => {
    const host = stage()
    const unavailable = vi.fn()
    const failed = createBubbles3dRuntime(host, { popped: vi.fn(), ready: vi.fn(), unavailable }, () => { throw new Error('WebGL unavailable') })
    expect(unavailable).toHaveBeenCalledExactlyOnceWith(0)
    expect(host.querySelector('canvas')).toBeNull()
    failed()
    const fake = fakeRenderer()
    vi.mocked(fake.renderer.render).mockImplementation(() => { throw new Error('render failed') })
    const cleanup = createBubbles3dRuntime(host, { popped: vi.fn(), ready: vi.fn(), unavailable }, () => fake.handle)
    expect(fake.renderer.dispose).toHaveBeenCalledOnce()
    expect(fake.renderer.forceContextLoss).toHaveBeenCalledOnce()
    expect(host.querySelector('canvas')).toBeNull()
    cleanup()
    host.remove()
  })

  it('keeps a valid pop when audio warm-up throws and falls back if reduced-motion painting fails', () => {
    const host = stage()
    const fake = fakeRenderer()
    const popped = vi.fn()
    const unavailable = vi.fn()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => { throw new Error('Audio unavailable') })
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 400))
    const cleanup = createBubbles3dRuntime(host, { popped, ready: vi.fn(), unavailable }, () => fake.handle)
    try {
      const canvas = host.querySelector('canvas')!
      const left = fake.point(0)
      pointer(canvas, 'pointerdown', 1, left.x, left.y)
      vi.mocked(fake.renderer.render).mockImplementation(() => { throw new Error('GPU lost') })
      expect(() => pointer(document, 'pointerup', 1, left.x, left.y)).not.toThrow()
      expect(popped).toHaveBeenCalledExactlyOnceWith(0, 0)
      expect(unavailable).toHaveBeenCalledExactlyOnceWith(0)
      expect(host.querySelector('canvas')).toBeNull()
    } finally { cleanup(); host.remove() }
  })

  it('releases graphics resources even if one cleanup method throws', () => {
    const host = stage()
    const fake = fakeRenderer()
    vi.mocked(fake.handle.disposeEnvironment!).mockImplementation(() => { throw new Error('Environment disposal failed') })
    vi.mocked(fake.renderer.dispose).mockImplementation(() => { throw new Error('Renderer disposal failed') })
    const cleanup = createBubbles3dRuntime(host, { popped: vi.fn(), ready: vi.fn(), unavailable: vi.fn() }, () => fake.handle)
    try {
      expect(() => cleanup()).not.toThrow()
      expect(fake.renderer.forceContextLoss).toHaveBeenCalledOnce()
      expect(host.querySelector('canvas')).toBeNull()
      cleanup()
      expect(fake.renderer.dispose).toHaveBeenCalledOnce()
    } finally { cleanup(); host.remove() }
  })

  it('cleans up when attaching the generated canvas fails', () => {
    const host = stage()
    host.setAttribute('data-bubbles3d-state', JSON.stringify({ revision: 3, bubbles: specs }))
    const fake = fakeRenderer()
    const unavailable = vi.fn()
    vi.spyOn(host, 'append').mockImplementation(() => { throw new Error('Host detached') })
    const cleanup = createBubbles3dRuntime(host, { popped: vi.fn(), ready: vi.fn(), unavailable }, () => fake.handle)
    expect(unavailable).toHaveBeenCalledExactlyOnceWith(3)
    expect(fake.renderer.dispose).toHaveBeenCalledOnce()
    expect(fake.renderer.forceContextLoss).toHaveBeenCalledOnce()
    expect(host.querySelector('canvas')).toBeNull()
    cleanup()
    host.remove()
  })

  it('falls back for the current revision when a DOM snapshot becomes invalid', async () => {
    const host = stage()
    host.setAttribute('data-bubbles3d-revision', '3')
    const fake = fakeRenderer()
    const unavailable = vi.fn()
    const cleanup = createBubbles3dRuntime(host, { popped: vi.fn(), ready: vi.fn(), unavailable }, () => fake.handle)
    try {
      host.setAttribute('data-bubbles3d-state', '{invalid')
      await vi.waitFor(() => expect(unavailable).toHaveBeenCalledExactlyOnceWith(3))
      expect(fake.renderer.dispose).toHaveBeenCalledOnce()
      expect(host.querySelector('canvas')).toBeNull()
    } finally { cleanup(); host.remove() }
  })
})
