import {
  ACESFilmicToneMapping, DirectionalLight, Group, HemisphereLight, IcosahedronGeometry,
  Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator,
  Quaternion, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
  type BufferGeometry, type Texture,
} from 'three'
import type { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import { warmAudio } from '../audio'
import { makeBubble3dEnvironment, makeBubble3dMaterial } from './bubbles3dAppearance'
import { makeBubble3dGeometry } from './bubbles3dGeometry'
import { isBubble3dShape, type Bubble3dShape } from './bubbles3dShapes'

export interface Bubble3dSpec {
  readonly id: number
  readonly shape: Bubble3dShape
  readonly color: string
  readonly size: number
  readonly x: number
  readonly y: number
  readonly z: number
}
interface Snapshot { readonly bubbles: ReadonlyArray<Bubble3dSpec>; readonly revision: number }
interface Body {
  readonly spec: Bubble3dSpec
  readonly mesh: Mesh<BufferGeometry, MeshPhysicalMaterial>
  readonly velocity: Vector3
  readonly spinAxis: Vector3
  readonly spinSpeed: number
}
interface Burst { readonly group: Group; readonly material: MeshBasicMaterial; age: number }

export const readBubbles3dSnapshot = (element: HTMLElement): Snapshot | undefined => {
  try {
    const value: unknown = JSON.parse(element.getAttribute('data-bubbles3d-state') ?? '')
    if (typeof value !== 'object' || value === null || !('revision' in value) || !('bubbles' in value)) return undefined
    if (!Number.isInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.bubbles) || value.bubbles.length > 60) return undefined
    const ids = new Set<number>()
    for (const bubble of value.bubbles as unknown[]) {
      if (typeof bubble !== 'object' || bubble === null) return undefined
      const spec = bubble as Partial<Bubble3dSpec>
      if (!isBubble3dShape(spec.shape)) return undefined
      if (!Number.isInteger(spec.id) || spec.id! < 0 || ids.has(spec.id!) || typeof spec.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(spec.color)) return undefined
      if (typeof spec.size !== 'number' || !Number.isFinite(spec.size) || spec.size < 0.35 || spec.size > 0.75) return undefined
      if ([spec.x, spec.y, spec.z].some(position => typeof position !== 'number' || !Number.isFinite(position) || Math.abs(position) > 1)) return undefined
      ids.add(spec.id!)
    }
    return value as Snapshot
  } catch { return undefined }
}

const failureRevision = (element: HTMLElement): number => {
  const snapshot = readBubbles3dSnapshot(element)
  if (snapshot) return snapshot.revision
  const revision = Number(element.getAttribute('data-bubbles3d-revision'))
  return Number.isInteger(revision) && revision >= 0 ? revision : 0
}

export const createBubbles3dWorld = () => {
  const scene = new Scene()
  const camera = new PerspectiveCamera(42, 1, 0.1, 40)
  camera.position.z = 12
  const hemisphere = new HemisphereLight(0xffffff, 0x3f416d, 0.8)
  const key = new DirectionalLight(0xffffff, 1.8)
  key.position.set(-4, 6, 7)
  const rim = new DirectionalLight(0xa9d9ff, 2.1)
  rim.position.set(5, -2, -3)
  scene.add(hemisphere, key, rim)
  const geometries = new Map<Bubble3dShape, BufferGeometry>()
  const geometryFor = (shape: Bubble3dShape): BufferGeometry => {
    const existing = geometries.get(shape)
    if (existing) return existing
    const geometry = makeBubble3dGeometry(shape)
    geometries.set(shape, geometry)
    return geometry
  }
  const particleGeometry = new IcosahedronGeometry(0.075, 0)
  const bodies = new Map<number, Body>()
  const difference = new Vector3()
  const relativeVelocity = new Vector3()
  const spin = new Quaternion()
  const bursts: Burst[] = []
  const raycaster = new Raycaster()
  let revision = -1
  let elapsed = 0

  const limits = (body: Body): Vector3 => {
    const height = Math.tan(camera.fov * Math.PI / 360) * (camera.position.z - body.mesh.position.z)
    return new Vector3(Math.max(body.spec.size, height * camera.aspect - body.spec.size - 0.12), height - body.spec.size - 0.12, 2.7)
  }
  const removeBurst = (burst: Burst): void => {
    scene.remove(burst.group)
    burst.material.dispose()
  }
  const burstAt = (body: Body): void => {
    const group = new Group()
    group.position.copy(body.mesh.position)
    const material = new MeshBasicMaterial({ color: body.spec.color, transparent: true, depthWrite: false })
    for (let index = 0; index < 14; index++) {
      const particle = new Mesh(particleGeometry, material)
      const angle = index * 2.399963229728653
      particle.userData.velocity = new Vector3(Math.sin(angle), Math.cos(angle), Math.sin(angle * 0.7)).normalize().multiplyScalar(2.7 + index % 3)
      group.add(particle)
    }
    scene.add(group)
    bursts.push({ group, material, age: 0 })
  }
  const apply = (snapshot: Snapshot, reducedMotion: boolean): void => {
    const reset = revision !== snapshot.revision
    revision = snapshot.revision
    if (reset) {
      for (const burst of bursts) removeBurst(burst)
      bursts.length = 0
    }
    const active = new Set(snapshot.bubbles.map(bubble => bubble.id))
    for (const [id, body] of bodies) {
      if (!reset && active.has(id)) continue
      if (!reset && body.mesh.visible && !reducedMotion) burstAt(body)
      scene.remove(body.mesh)
      body.mesh.material.dispose()
      bodies.delete(id)
    }
    for (const spec of snapshot.bubbles) {
      if (bodies.has(spec.id)) continue
      const material = makeBubble3dMaterial(spec.color)
      const mesh = new Mesh(geometryFor(spec.shape), material)
      mesh.scale.setScalar(spec.size)
      mesh.userData.bubbleId = spec.id
      mesh.userData.shape = spec.shape
      mesh.rotation.set(Math.sin(spec.id * 1.11 + 0.31) * 0.45, Math.cos(spec.id * 0.73 + 0.54) * 0.5, Math.sin(spec.id * 0.97 + 0.1) * Math.PI)
      mesh.position.z = spec.z * 2.5
      const body: Body = {
        spec, mesh,
        velocity: new Vector3(Math.sin(spec.id * 1.7) * 0.45, Math.cos(spec.id * 2.3) * 0.55, Math.sin(spec.id * 0.9 + 1) * 0.25),
        spinAxis: new Vector3(Math.sin(spec.id * 1.37 + 0.4), Math.cos(spec.id * 0.83 + 1.1), Math.sin(spec.id * 1.91 + 2.3)).normalize(),
        spinSpeed: 0.45 + ((spec.id * 11) % 17) / 20,
      }
      const bounds = limits(body)
      mesh.position.x = spec.x * bounds.x
      mesh.position.y = spec.y * bounds.y
      bodies.set(spec.id, body)
      scene.add(mesh)
    }
  }
  const resize = (width: number, height: number): void => {
    const previousAspect = camera.aspect
    camera.aspect = Math.max(1, width) / Math.max(1, height)
    camera.updateProjectionMatrix()
    for (const body of bodies.values()) {
      body.mesh.position.x *= camera.aspect / previousAspect
      const bounds = limits(body)
      body.mesh.position.x = Math.max(-bounds.x, Math.min(bounds.x, body.mesh.position.x))
      body.mesh.position.y = Math.max(-bounds.y, Math.min(bounds.y, body.mesh.position.y))
    }
  }
  const step = (delta: number, reducedMotion: boolean): void => {
    if (reducedMotion) {
      for (const burst of bursts) removeBurst(burst)
      bursts.length = 0
      return
    }
    const dt = Math.max(0, Math.min(delta, 0.04))
    elapsed += dt
    const moving = [...bodies.values()].filter(body => body.mesh.visible)
    for (const body of moving) {
      body.mesh.position.addScaledVector(body.velocity, dt)
      const bounds = limits(body)
      for (const axis of ['x', 'y', 'z'] as const) {
        if (Math.abs(body.mesh.position[axis]) > bounds[axis]) {
          body.mesh.position[axis] = Math.sign(body.mesh.position[axis]) * bounds[axis]
          body.velocity[axis] *= -1
        }
      }
      spin.setFromAxisAngle(body.spinAxis, body.spinSpeed * dt)
      body.mesh.quaternion.premultiply(spin).normalize()
      if (body.spec.shape === 'sphere') {
        const wobble = 1 + Math.sin(elapsed * 2 + body.spec.id) * 0.012
        body.mesh.scale.set(body.spec.size * wobble, body.spec.size / wobble, body.spec.size)
      }
    }
    for (let left = 0; left < moving.length; left++) {
      for (let right = left + 1; right < moving.length; right++) {
        const a = moving[left]!
        const b = moving[right]!
        difference.copy(b.mesh.position).sub(a.mesh.position)
        const distance = difference.length()
        const gap = a.spec.size + b.spec.size
        if (distance >= gap || distance < 0.001) continue
        const normal = difference.divideScalar(distance)
        a.mesh.position.addScaledVector(normal, -(gap - distance) / 2)
        b.mesh.position.addScaledVector(normal, (gap - distance) / 2)
        const approaching = relativeVelocity.copy(b.velocity).sub(a.velocity).dot(normal)
        if (approaching < 0) {
          a.velocity.addScaledVector(normal, approaching * 0.96)
          b.velocity.addScaledVector(normal, -approaching * 0.96)
        }
      }
    }
    for (let index = bursts.length - 1; index >= 0; index--) {
      const burst = bursts[index]!
      burst.age += dt
      if (burst.age >= 0.55) {
        removeBurst(burst)
        bursts.splice(index, 1)
        continue
      }
      burst.material.opacity = 1 - burst.age / 0.55
      for (const particle of burst.group.children) {
        const velocity = particle.userData.velocity as Vector3
        particle.position.copy(velocity).multiplyScalar(burst.age)
        particle.position.y -= burst.age * burst.age * 2
        particle.scale.setScalar(1 - burst.age)
      }
    }
  }
  const pick = (x: number, y: number, width: number, height: number): number | undefined => {
    if (width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height) return undefined
    camera.updateMatrixWorld()
    scene.updateMatrixWorld(true)
    raycaster.setFromCamera(new Vector2(x / width * 2 - 1, 1 - y / height * 2), camera)
    return raycaster.intersectObjects([...bodies.values()].filter(body => body.mesh.visible).map(body => body.mesh), false)[0]?.object.userData.bubbleId as number | undefined
  }
  const pop = (id: number, reducedMotion: boolean): boolean => {
    const body = bodies.get(id)
    if (!body?.mesh.visible) return false
    if (!reducedMotion) burstAt(body)
    body.mesh.visible = false
    return true
  }
  const dispose = (): void => {
    for (const body of bodies.values()) body.mesh.material.dispose()
    for (const burst of bursts) removeBurst(burst)
    bodies.clear()
    bursts.length = 0
    for (const geometry of geometries.values()) geometry.dispose()
    geometries.clear()
    particleGeometry.dispose()
    scene.clear()
  }
  return { scene, camera, apply, resize, step, pick, pop, dispose }
}

export interface Bubbles3dCallbacks {
  readonly popped: (id: number, revision: number) => void
  readonly ready: (revision: number) => void
  readonly unavailable: (revision: number) => void
}
type Renderer = Pick<WebGLRenderer, 'setSize' | 'setPixelRatio' | 'render' | 'dispose' | 'forceContextLoss' | 'setAnimationLoop'>
export interface RendererHandle { readonly renderer: Renderer; readonly environment?: Texture; readonly disposeEnvironment?: () => void }
type Contact = { readonly id: number; readonly revision: number; readonly x: number; readonly y: number }
const safely = (cleanup: () => void): void => { try { cleanup() } catch { /* Keep releasing the remaining resources. */ } }
const disposeRenderer = (handle: RendererHandle): void => {
  safely(() => handle.renderer.setAnimationLoop(null))
  safely(() => handle.disposeEnvironment?.())
  safely(() => handle.renderer.dispose())
  safely(() => handle.renderer.forceContextLoss())
}

const createRenderer = (canvas: HTMLCanvasElement): RendererHandle => {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.debug.onShaderError = () => { throw new Error('Unable to render 3D bubbles') }
  let room: RoomEnvironment | undefined
  let generator: PMREMGenerator | undefined
  try {
    room = makeBubble3dEnvironment()
    generator = new PMREMGenerator(renderer)
    const environment = generator.fromScene(room, 0.02)
    return { renderer, environment: environment.texture, disposeEnvironment: () => environment.dispose() }
  } catch (error) {
    disposeRenderer({ renderer })
    throw error
  } finally {
    safely(() => generator?.dispose())
    safely(() => room?.dispose())
  }
}

export const createBubbles3dRuntime = (host: HTMLElement, callbacks: Bubbles3dCallbacks, rendererFactory: (canvas: HTMLCanvasElement) => RendererHandle = createRenderer): (() => void) => {
  const canvas = host.ownerDocument.createElement('canvas')
  canvas.className = 'bubbles3d-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  let handle: RendererHandle
  try { handle = rendererFactory(canvas) } catch {
    callbacks.unavailable(failureRevision(host))
    return () => {}
  }
  let createdWorld: ReturnType<typeof createBubbles3dWorld> | undefined
  try {
    createdWorld = createBubbles3dWorld()
    if (handle.environment) createdWorld.scene.environment = handle.environment
    host.append(canvas)
  } catch {
    safely(() => createdWorld?.dispose())
    disposeRenderer(handle)
    canvas.remove()
    callbacks.unavailable(failureRevision(host))
    return () => {}
  }
  const world = createdWorld
  const document = host.ownerDocument
  let motion: MediaQueryList | undefined
  try { motion = document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)') } catch { /* Motion preferences can be unavailable. */ }
  let reducedMotion = motion?.matches ?? false
  let snapshot: Snapshot = { revision: -1, bubbles: [] }
  let stopped = false
  let lastTime: number | undefined
  const pointers = new Map<number, Contact>()
  const pointerStarts = new Map<number, number>()
  const touchPointerIds = new Set<number>()
  const touches = new Map<number, Contact>()
  const nativeTouchStarts = new Map<number, { x: number; y: number; time: number; pointerId?: number }>()
  const nativePointerIds = new Map<number, number>()
  const releaseCapture = (id: number): void => {
    try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id) } catch { /* Document listeners also own releases. */ }
  }
  const clearContacts = (): void => {
    const ids = [...pointers.keys()]
    pointers.clear()
    pointerStarts.clear()
    touches.clear()
    nativeTouchStarts.clear()
    nativePointerIds.clear()
    touchPointerIds.clear()
    for (const id of ids) releaseCapture(id)
  }
  const visibilityChanged = (): void => { if (document.hidden) clearContacts() }
  const eachTouch = (event: TouchEvent, action: (touch: Touch) => void): void => {
    for (let index = 0; index < event.changedTouches.length; index++) {
      const touch = event.changedTouches.item?.(index) ?? event.changedTouches[index]
      if (touch) action(touch)
    }
  }
  const sync = (): void => {
    const next = readBubbles3dSnapshot(host)
    if (!next) { fail(); return }
    if (next.revision !== snapshot.revision) {
      clearContacts()
      callbacks.ready(next.revision)
    }
    snapshot = next
    world.apply(snapshot, reducedMotion)
  }
  const paint = (): void => { handle.renderer.render(world.scene, world.camera) }
  const pick = (x: number, y: number): number | undefined => {
    const bounds = canvas.getBoundingClientRect()
    return world.pick(x - bounds.left, y - bounds.top, bounds.width, bounds.height)
  }
  const contact = (x: number, y: number): Contact | undefined => {
    try {
      sync()
      if (stopped) return undefined
      const id = pick(x, y)
      return id === undefined ? undefined : { id, revision: snapshot.revision, x, y }
    } catch { fail(); return undefined }
  }
  const finish = (held: Contact, x: number, y: number): void => {
    try {
      sync()
      if (stopped || held.revision !== snapshot.revision || Math.hypot(held.x - x, held.y - y) > 35 || !world.pop(held.id, reducedMotion)) return
      try { warmAudio() } catch { /* Audio failure must still allow a pop. */ }
      callbacks.popped(held.id, held.revision)
      if (reducedMotion) paint()
    } catch { fail() }
  }
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || pointers.has(event.pointerId) || nativePointerIds.has(event.pointerId)) return
    if (event.pointerType === 'touch') {
      const native = [...nativeTouchStarts].find(([, touch]) => touch.pointerId === undefined && Math.abs(event.timeStamp - touch.time) <= 40 && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) <= 1)
      if (native) {
        native[1].pointerId = event.pointerId
        nativePointerIds.set(event.pointerId, native[0])
        event.preventDefault()
        return
      }
    }
    const held = contact(event.clientX, event.clientY)
    if (!held) return
    event.preventDefault()
    pointers.set(event.pointerId, held)
    pointerStarts.set(event.pointerId, event.timeStamp)
    if (event.pointerType === 'touch') touchPointerIds.add(event.pointerId)
    try { canvas.setPointerCapture(event.pointerId) } catch { /* Document listeners also own releases. */ }
  }
  const up = (event: PointerEvent): void => {
    const nativeId = nativePointerIds.get(event.pointerId)
    if (nativeId !== undefined) {
      if (event.type === 'lostpointercapture') return
      nativePointerIds.delete(event.pointerId)
      if (event.type === 'pointercancel') {
        touches.delete(nativeId)
        nativeTouchStarts.delete(nativeId)
      }
      return
    }
    const held = pointers.get(event.pointerId)
    if (!held) return
    pointers.delete(event.pointerId)
    pointerStarts.delete(event.pointerId)
    touchPointerIds.delete(event.pointerId)
    releaseCapture(event.pointerId)
    if (event.type === 'pointerup') finish(held, event.clientX, event.clientY)
  }
  const touchStart = (event: TouchEvent): void => {
    eachTouch(event, touch => {
      if (touches.has(touch.identifier)) return
      const pointerId = [...touchPointerIds].find(id => {
        const held = pointers.get(id)
        return held && Math.abs(event.timeStamp - pointerStarts.get(id)!) <= 40 && Math.hypot(held.x - touch.clientX, held.y - touch.clientY) <= 1
      })
      const held = pointerId === undefined ? contact(touch.clientX, touch.clientY) : pointers.get(pointerId)
      if (!held) return
      event.preventDefault()
      nativeTouchStarts.set(touch.identifier, { x: touch.clientX, y: touch.clientY, time: event.timeStamp })
      touches.set(touch.identifier, held)
      if (pointerId !== undefined) {
        pointers.delete(pointerId)
        pointerStarts.delete(pointerId)
        touchPointerIds.delete(pointerId)
        nativeTouchStarts.get(touch.identifier)!.pointerId = pointerId
        nativePointerIds.set(pointerId, touch.identifier)
        releaseCapture(pointerId)
      }
    })
  }
  const touchEnd = (event: TouchEvent): void => {
    eachTouch(event, touch => {
      const held = touches.get(touch.identifier)
      if (!held) return
      touches.delete(touch.identifier)
      const pointerId = nativeTouchStarts.get(touch.identifier)?.pointerId
      if (pointerId !== undefined) nativePointerIds.delete(pointerId)
      nativeTouchStarts.delete(touch.identifier)
      if (event.type === 'touchend') finish(held, touch.clientX, touch.clientY)
    })
  }
  const frame = (time: number): void => {
    if (stopped) return
    try {
      world.step(lastTime === undefined ? 0 : (time - lastTime) / 1000, reducedMotion)
      lastTime = time
      paint()
    } catch { fail() }
  }
  const resize = (): void => {
    if (stopped) return
    try {
      const bounds = host.getBoundingClientRect()
      handle.renderer.setPixelRatio(Math.min(document.defaultView?.devicePixelRatio ?? 1, 1.5))
      handle.renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false)
      world.resize(bounds.width, bounds.height)
      paint()
    } catch { fail() }
  }
  const refresh = (): void => {
    if (stopped) return
    try { sync(); if (!stopped) paint() } catch { fail() }
  }
  const motionChanged = (): void => {
    if (stopped) return
    try {
      reducedMotion = motion?.matches ?? false
      world.step(0, reducedMotion)
      lastTime = undefined
      handle.renderer.setAnimationLoop(reducedMotion ? null : frame)
      refresh()
    } catch { fail() }
  }
  const contextLost = (event: Event): void => { event.preventDefault(); fail() }
  let observer: MutationObserver | undefined
  let resizeObserver: ResizeObserver | undefined
  const cleanup = (): void => {
    if (stopped) return
    stopped = true
    observer?.disconnect()
    resizeObserver?.disconnect()
    document.defaultView?.removeEventListener('resize', resize)
    motion?.removeEventListener?.('change', motionChanged)
    if (!motion?.removeEventListener) motion?.removeListener?.(motionChanged)
    canvas.removeEventListener('pointerdown', down)
    document.removeEventListener('pointerup', up, { capture: true })
    document.removeEventListener('pointercancel', up, { capture: true })
    canvas.removeEventListener('lostpointercapture', up)
    canvas.removeEventListener('touchstart', touchStart)
    document.removeEventListener('touchend', touchEnd, { capture: true })
    document.removeEventListener('touchcancel', touchEnd, { capture: true })
    canvas.removeEventListener('webglcontextlost', contextLost)
    document.removeEventListener('visibilitychange', visibilityChanged)
    document.defaultView?.removeEventListener('blur', clearContacts)
    clearContacts()
    safely(() => world.dispose())
    disposeRenderer(handle)
    canvas.remove()
  }
  const fail = (): void => {
    if (stopped) return
    const revision = failureRevision(host)
    cleanup()
    callbacks.unavailable(revision)
  }
  try {
    canvas.addEventListener('pointerdown', down, { passive: false })
    document.addEventListener('pointerup', up, { capture: true })
    document.addEventListener('pointercancel', up, { capture: true })
    canvas.addEventListener('lostpointercapture', up)
    canvas.addEventListener('touchstart', touchStart, { passive: false })
    document.addEventListener('touchend', touchEnd, { capture: true })
    document.addEventListener('touchcancel', touchEnd, { capture: true })
    canvas.addEventListener('webglcontextlost', contextLost)
    document.addEventListener('visibilitychange', visibilityChanged)
    document.defaultView?.addEventListener('blur', clearContacts)
    motion?.addEventListener?.('change', motionChanged)
    if (!motion?.addEventListener) motion?.addListener?.(motionChanged)
    observer = new MutationObserver(refresh)
    observer.observe(host, { attributes: true, attributeFilter: ['data-bubbles3d-state'] })
    if (typeof ResizeObserver === 'undefined') document.defaultView?.addEventListener('resize', resize)
    else {
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(host)
    }
    resize()
    refresh()
    if (!stopped) handle.renderer.setAnimationLoop(reducedMotion ? null : frame)
  } catch { fail() }
  return cleanup
}
