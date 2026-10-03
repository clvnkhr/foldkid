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
export const BUBBLES3D_POP_FX_DURATION = 0.52
export const BUBBLES3D_POP_FX_CAPACITY = 12
export const BUBBLES3D_POP_FX_PARTICLES = 12
const TAU = Math.PI * 2
const RAINBOW = ['#ff4757', '#ff7f00', '#ffd93d', '#2ed573', '#1e90ff', '#a855f7', '#ff69b4', '#7ce5df'] as const
interface Particle {
  x: number; y: number; dx: number; dy: number; travel: number; curve: number
  size: number; delay: number; life: number; kind: number; color: string
}
interface Burst {
  active: boolean; x: number; y: number; radius: number; color: string; age: number; life: number
  count: number; ringAngle: number; ringGap: number; ringScale: number; particles: Particle[]
}

/** Flat droplets and glints, randomized once per pop and driven by the scene loop. */
export const createBubbles3dPopFx = (host: HTMLElement, random: () => number = Math.random): Bubbles3dPopFx => {
  const bursts: Burst[] = Array.from({ length: BUBBLES3D_POP_FX_CAPACITY }, () => ({
    active: false, x: 0, y: 0, radius: 0, color: '', age: 0, life: 0,
    count: 0, ringAngle: 0, ringGap: 0, ringScale: 0,
    particles: Array.from({ length: BUBBLES3D_POP_FX_PARTICLES }, () => ({
      x: 0, y: 0, dx: 0, dy: 0, travel: 0, curve: 0, size: 0, delay: 0, life: 0, kind: 0, color: '',
    })),
  }))
  const unit = (): number => {
    try {
      const value = random()
      return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5
    } catch { return 0.5 }
  }
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
    active.age = 0
    active.life = BUBBLES3D_POP_FX_DURATION * (0.8 + unit() * 0.2)
    active.count = Math.min(BUBBLES3D_POP_FX_PARTICLES, 8 + Math.floor(unit() * 5))
    active.ringAngle = unit() * TAU
    active.ringGap = 0.35 + unit() * 0.75
    active.ringScale = 0.8 + unit() * 0.3
    const palette = Math.floor(unit() * RAINBOW.length) % RAINBOW.length
    for (let index = 0; index < active.count; index++) {
      const particle = active.particles[index]!
      const angle = active.ringAngle + index / active.count * TAU + (unit() - 0.5) * 1.1
      const offset = active.radius * (0.2 + unit() * 0.6)
      particle.dx = Math.cos(angle)
      particle.dy = Math.sin(angle)
      particle.x = particle.dx * offset
      particle.y = particle.dy * offset
      particle.travel = (active.radius * 0.55 + 22) * (0.65 + unit() * 0.95)
      particle.curve = (unit() - 0.5) * particle.travel * 0.6
      particle.size = Math.max(2, Math.min(5.2, active.radius * 0.09)) * (0.7 + unit() * 0.6)
      particle.delay = unit() * 0.035
      particle.life = (active.life - particle.delay) * (0.62 + unit() * 0.38)
      particle.kind = index === 0 ? 1 : Math.min(2, Math.floor(unit() * 3))
      particle.color = spec.rainbow ? RAINBOW[(palette + index) % RAINBOW.length]! : spec.color
    }
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
        if (burst.age >= burst.life) { burst.active = false; continue }
        let live = false
        // The rim breaks apart quickly, rather than leaving a perfect expanding circle.
        const rimProgress = burst.age / 0.18
        if (rimProgress < 1) {
          live = true
          const rimRadius = burst.radius * (burst.ringScale + rimProgress * 0.5)
          const secondAngle = burst.ringAngle + Math.PI + burst.ringGap
          context.globalAlpha = (1 - rimProgress) * 0.8
          context.strokeStyle = burst.color
          context.lineWidth = 2
          context.beginPath()
          context.arc(burst.x, burst.y, rimRadius, burst.ringAngle, burst.ringAngle + Math.PI - burst.ringGap)
          context.moveTo(burst.x + Math.cos(secondAngle) * rimRadius, burst.y + Math.sin(secondAngle) * rimRadius)
          context.arc(burst.x, burst.y, rimRadius, secondAngle, secondAngle + Math.PI * 0.65)
          context.stroke()
        }
        if (burst.age < 0.06) {
          live = true
          context.globalAlpha = (1 - burst.age / 0.06) * 0.75
          context.fillStyle = '#ffffff'
          context.beginPath()
          context.arc(burst.x, burst.y, burst.radius * (0.32 + burst.age * 3), 0, TAU)
          context.fill()
        }
        for (let index = 0; index < burst.count; index++) {
          const particle = burst.particles[index]!
          const age = burst.age - particle.delay
          if (age < 0) { live = true; continue }
          if (age >= particle.life) continue
          live = true
          const progress = age / particle.life
          const spread = 1 - (1 - progress) ** 3
          const curve = particle.curve * progress * progress
          const x = burst.x + particle.x + particle.dx * particle.travel * spread - particle.dy * curve
          const y = burst.y + particle.y + particle.dy * particle.travel * spread + particle.dx * curve + 12 * progress * progress
          const size = particle.size * (1 - progress * 0.45)
          const opacity = 1 - progress ** 1.3
          context.globalAlpha = opacity * 0.5
          context.strokeStyle = particle.color
          context.lineWidth = Math.max(1, size * 0.7)
          const tail = size * (particle.kind === 2 ? 4 : 2)
          context.beginPath()
          context.moveTo(x - particle.dx * tail, y - particle.dy * tail)
          context.lineTo(x, y)
          context.stroke()
          context.globalAlpha = opacity
          if (particle.kind === 1) {
            const length = size * 1.8
            context.strokeStyle = '#ffffff'
            context.lineWidth = 1.4
            context.beginPath()
            context.moveTo(x - particle.dx * length, y - particle.dy * length)
            context.lineTo(x + particle.dx * length, y + particle.dy * length)
            context.moveTo(x + particle.dy * length * 0.65, y - particle.dx * length * 0.65)
            context.lineTo(x - particle.dy * length * 0.65, y + particle.dx * length * 0.65)
            context.stroke()
          } else {
            context.fillStyle = particle.color
            context.beginPath()
            context.arc(x, y, size, 0, TAU)
            context.fill()
            context.globalAlpha = opacity * 0.85
            context.fillStyle = '#ffffff'
            context.beginPath()
            context.arc(x - size * 0.25, y - size * 0.25, size * 0.32, 0, TAU)
            context.fill()
          }
        }
        if (live) { active = true; painted = true }
        else burst.active = false
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
