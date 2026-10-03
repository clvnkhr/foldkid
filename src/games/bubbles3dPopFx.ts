export interface Bubble3dPopBurst {
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly color: string
  readonly rainbow: boolean
}
export interface Bubbles3dPopFx {
  readonly resize: (width: number, height: number) => void
  readonly burst: (spec: Bubble3dPopBurst) => void
  readonly step: (delta: number, reducedMotion: boolean) => boolean
  readonly clear: () => void
  readonly dispose: () => void
}
export const BUBBLES3D_POP_FX_DURATION = 0.35
export const BUBBLES3D_POP_FX_CAPACITY = 12
const DOTS = 8
const TAU = Math.PI * 2
const DIRECTIONS = Array.from({ length: DOTS }, (_, index) => ({ x: Math.cos(index / DOTS * TAU), y: Math.sin(index / DOTS * TAU) }))
const RAINBOW = ['#ff4757', '#ff7f00', '#ffd93d', '#2ed573', '#1e90ff', '#a855f7', '#ff69b4', '#7ce5df'] as const
interface Burst { active: boolean; x: number; y: number; radius: number; color: string; rainbow: boolean; age: number }

/** A fixed pool of flat rings and dots, driven by the existing scene loop. */
export const createBubbles3dPopFx = (host: HTMLElement): Bubbles3dPopFx => {
  const bursts: Burst[] = Array.from({ length: BUBBLES3D_POP_FX_CAPACITY }, () => ({ active: false, x: 0, y: 0, radius: 0, color: '', rainbow: false, age: 0 }))
  let canvas: HTMLCanvasElement | undefined
  let context: CanvasRenderingContext2D | undefined
  let width = 0
  let height = 0
  let nextSlot = 0
  let painted = false
  let failed = false
  let disposed = false
  const dropCanvas = (): void => {
    const current = canvas
    canvas = undefined
    context = undefined
    if (!current) return
    current.remove()
    // Release the backing store, including when a caller retains this API.
    try { current.width = 0; current.height = 0 } catch { /* The detached surface can still be collected. */ }
  }
  const fail = (): void => {
    failed = true
    painted = false
    for (const burst of bursts) burst.active = false
    dropCanvas()
  }
  const clear = (): void => {
    for (const burst of bursts) burst.active = false
    nextSlot = 0
    if (context && painted) {
      try { context.clearRect(0, 0, canvas!.width, canvas!.height) } catch { fail() }
    }
    painted = false
  }
  const sizeCanvas = (target: HTMLCanvasElement): void => {
    // One backing pixel per CSS pixel keeps the overlay cheap on Retina too.
    const bufferWidth = Math.max(1, width)
    const bufferHeight = Math.max(1, height)
    if (target.width !== bufferWidth) target.width = bufferWidth
    if (target.height !== bufferHeight) target.height = bufferHeight
  }
  const acquire = (): CanvasRenderingContext2D | undefined => {
    if (context || failed || disposed || width <= 0 || height <= 0) return context
    const candidate = host.ownerDocument.createElement('canvas')
    candidate.className = 'bubbles3d-pop-fx'
    candidate.setAttribute('aria-hidden', 'true')
    Object.assign(candidate.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none' })
    try {
      sizeCanvas(candidate)
      const drawing = candidate.getContext('2d')
      if (!drawing) { failed = true; candidate.width = 0; candidate.height = 0; return undefined }
      host.append(candidate)
      canvas = candidate
      context = drawing
      return drawing
    } catch {
      candidate.remove()
      try { candidate.width = 0; candidate.height = 0 } catch { /* No attached resources remain. */ }
      failed = true
      return undefined
    }
  }
  const resize = (nextWidth: number, nextHeight: number): void => {
    if (disposed) return
    const normalizedWidth = Number.isFinite(nextWidth) && nextWidth > 0 ? Math.ceil(nextWidth) : 0
    const normalizedHeight = Number.isFinite(nextHeight) && nextHeight > 0 ? Math.ceil(nextHeight) : 0
    if (normalizedWidth === width && normalizedHeight === height) return
    clear()
    width = normalizedWidth
    height = normalizedHeight
    if (canvas) {
      try { sizeCanvas(canvas) } catch { fail() }
    }
  }
  const burst = (spec: Bubble3dPopBurst): void => {
    if (disposed || failed || width <= 0 || height <= 0 || !Number.isFinite(spec.x) || !Number.isFinite(spec.y) || !Number.isFinite(spec.radius) || spec.radius <= 0 ||
      typeof spec.color !== 'string' || spec.color.trim() === '' || typeof spec.rainbow !== 'boolean' || !acquire()) return
    const active = bursts[nextSlot]!
    nextSlot = (nextSlot + 1) % bursts.length
    active.active = true
    active.x = spec.x
    active.y = spec.y
    active.radius = Math.min(spec.radius, Math.max(width, height))
    active.color = spec.color
    active.rainbow = spec.rainbow
    active.age = 0
  }
  const step = (delta: number, reducedMotion: boolean): boolean => {
    if (disposed || failed) return false
    if (reducedMotion) { clear(); return false }
    if (!context || (!painted && !bursts.some(burst => burst.active))) return false
    const dt = Number.isFinite(delta) && delta > 0 ? delta : 0
    let active = false
    try {
      context.clearRect(0, 0, canvas!.width, canvas!.height)
      painted = false
      for (const burst of bursts) {
        if (!burst.active) continue
        burst.age += dt
        if (burst.age >= BUBBLES3D_POP_FX_DURATION) { burst.active = false; continue }
        active = true
        const progress = burst.age / BUBBLES3D_POP_FX_DURATION
        const opacity = 1 - progress
        context.globalAlpha = opacity * 0.75
        context.strokeStyle = burst.rainbow ? '#ffffff' : burst.color
        context.lineWidth = 2
        context.beginPath()
        context.arc(burst.x, burst.y, burst.radius * (0.62 + progress * 0.6), 0, TAU)
        context.stroke()
        context.globalAlpha = opacity
        context.fillStyle = burst.color
        const travel = burst.radius * (0.3 + progress * 0.75) + progress * 20
        const radius = Math.max(1, Math.min(4, burst.radius * 0.06)) * (1 - progress * 0.55)
        for (let index = 0; index < DOTS; index++) {
          const direction = DIRECTIONS[index]!
          if (burst.rainbow) context.fillStyle = RAINBOW[index]!
          context.beginPath()
          context.arc(burst.x + direction.x * travel, burst.y + direction.y * travel, radius, 0, TAU)
          context.fill()
        }
        painted = true
      }
      context.globalAlpha = 1
      return active
    } catch { fail(); return false }
  }
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    bursts.length = 0
    painted = false
    dropCanvas()
  }
  return { resize, burst, step, clear, dispose }
}
