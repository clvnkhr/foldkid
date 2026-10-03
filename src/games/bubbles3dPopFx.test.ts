import { afterEach, describe, expect, it, vi } from 'vitest'

import { BUBBLES3D_POP_FX_CAPACITY, BUBBLES3D_POP_FX_DURATION, BUBBLES3D_POP_FX_PARTICLES, createBubbles3dPopFx, type Bubble3dPopBurst } from './bubbles3dPopFx'

type Segment = { readonly kind: 'arc'; readonly x: number; readonly y: number; readonly radius: number; readonly start: number; readonly end: number } |
  { readonly kind: 'move' | 'line'; readonly x: number; readonly y: number }
interface Paint { readonly color: string; readonly alpha: number; readonly width: number; readonly path: ReadonlyArray<Segment> }
const drawing = () => {
  const fills: Paint[] = []
  const strokes: Paint[] = []
  let path: Segment[] = []
  const context = {
    clearRect: vi.fn(), beginPath: vi.fn(() => { path = [] }),
    arc: vi.fn((x: number, y: number, radius: number, start: number, end: number) => { path.push({ kind: 'arc', x, y, radius, start, end }) }),
    moveTo: vi.fn((x: number, y: number) => { path.push({ kind: 'move', x, y }) }),
    lineTo: vi.fn((x: number, y: number) => { path.push({ kind: 'line', x, y }) }),
    stroke: vi.fn(() => { strokes.push({ color: context.strokeStyle, alpha: context.globalAlpha, width: context.lineWidth, path: [...path] }) }),
    fill: vi.fn(() => { fills.push({ color: context.fillStyle, alpha: context.globalAlpha, width: context.lineWidth, path: [...path] }) }),
    globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, lineCap: 'butt', strokeStyle: '', fillStyle: '',
  }
  return { context, fills, strokes }
}
const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
}
const setup = (random = seeded(1234)) => {
  const host = document.createElement('div')
  const sceneCanvas = document.createElement('canvas')
  sceneCanvas.className = 'bubbles3d-canvas'
  host.append(sceneCanvas)
  document.body.append(host)
  const { context, fills, strokes } = drawing()
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const fx = createBubbles3dPopFx(host, random)
  fx.resize(400, 200)
  return { host, sceneCanvas, context, fills, strokes, getContext, fx }
}
const spec = (changes: Partial<Bubble3dPopBurst> = {}): Bubble3dPopBurst => ({ x: 100, y: 50, radius: 40, color: '#ff6584', rainbow: false, ...changes })
const trails = (strokes: ReadonlyArray<Paint>, color?: string): Paint[] => strokes.filter(paint =>
  (color === undefined || paint.color === color) && paint.path.length === 2 && paint.path[0]?.kind === 'move' && paint.path[1]?.kind === 'line')
const relative = (paints: ReadonlyArray<Paint>, x: number, y: number) => paints.map(paint => ({
  ...paint, path: paint.path.map(segment => ({ ...segment, x: segment.x - x, y: segment.y - y })),
}))
const expectFinite = (paints: ReadonlyArray<Paint>): void => {
  for (const paint of paints) {
    expect(paint.alpha).toBeGreaterThanOrEqual(0)
    expect(paint.alpha).toBeLessThanOrEqual(1)
    expect(paint.width).toBeGreaterThan(0)
    for (const segment of paint.path) {
      expect(Number.isFinite(segment.x) && Number.isFinite(segment.y)).toBe(true)
      if (segment.kind === 'arc') {
        expect(Number.isFinite(segment.radius) && Number.isFinite(segment.start) && Number.isFinite(segment.end)).toBe(true)
        expect(segment.radius).toBeGreaterThan(0)
      }
    }
  }
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

describe('flat 3D bubble pop effects', () => {
  it('lazily creates one decorative, pointerless overlay above the scene at a cheap pixel ratio', () => {
    const { host, sceneCanvas, context, getContext, fx } = setup()
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    try {
      expect(host.children).toHaveLength(1)
      expect(getContext).not.toHaveBeenCalled()
      expect(fx.step(0.1, false)).toBe(false)
      expect(context.clearRect).not.toHaveBeenCalled()
      fx.burst(spec())
      const overlay = host.querySelector<HTMLCanvasElement>('.bubbles3d-pop-fx')!
      expect([...host.children]).toEqual([sceneCanvas, overlay])
      expect(overlay.getAttribute('aria-hidden')).toBe('true')
      expect(overlay.style.position).toBe('absolute')
      expect(overlay.style.inset).toBe('0')
      expect(overlay.style.width).toBe('100%')
      expect(overlay.style.height).toBe('100%')
      expect(overlay.style.pointerEvents).toBe('none')
      expect([overlay.width, overlay.height]).toEqual([400, 200])
      fx.burst(spec({ x: 200 }))
      expect(getContext).toHaveBeenCalledExactlyOnceWith('2d')
      expect(host.querySelectorAll('.bubbles3d-pop-fx')).toHaveLength(1)
      expect(requestFrame).not.toHaveBeenCalled()
    } finally { fx.dispose() }
  })

  it('adds a brief center flash, broken rim, varied droplets and white glints', () => {
    const { context, fills, strokes, fx } = setup()
    try {
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(true)
      expect(context.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 400, 200)
      expect(fills.some(paint => paint.color === '#ffffff' && paint.path.some(segment => segment.kind === 'arc' && segment.x === 100 && segment.y === 50))).toBe(true)
      const rim = strokes[0]!.path.filter(segment => segment.kind === 'arc')
      expect(rim).toHaveLength(2)
      for (const arc of rim) if (arc.kind === 'arc') {
        expect([arc.x, arc.y]).toEqual([100, 50])
        expect(arc.end - arc.start).toBeGreaterThan(0)
        expect(arc.end - arc.start).toBeLessThan(Math.PI * 2)
      }
      if (rim[0]?.kind === 'arc' && rim[1]?.kind === 'arc') expect(rim[0].end - rim[0].start).not.toBeCloseTo(rim[1].end - rim[1].start)
      const fillStart = fills.length
      const strokeStart = strokes.length
      fx.step(0.07, false)
      const droplets = fills.slice(fillStart).filter(paint => paint.color === spec().color)
      const particles = trails(strokes.slice(strokeStart), spec().color)
      expect(particles.length).toBeGreaterThanOrEqual(8)
      expect(particles.length).toBeLessThanOrEqual(BUBBLES3D_POP_FX_PARTICLES)
      expect(droplets.length).toBeGreaterThan(0)
      expect(new Set(particles.map(paint => paint.width)).size).toBeGreaterThan(3)
      expect(strokes.slice(strokeStart).some(paint => paint.color === '#ffffff' && paint.path.length === 4)).toBe(true)
      expectFinite([...fills, ...strokes])
      expect(context.globalAlpha).toBe(1)
    } finally { fx.dispose() }
  })

  it('moves varied particles outward, fades them, and does no work after their bounded lifetime', () => {
    const { context, strokes, fx } = setup()
    try {
      fx.burst(spec())
      expect(fx.step(0.04, false)).toBe(true)
      const early = trails(strokes, spec().color)
      const start = strokes.length
      expect(fx.step(0.08, false)).toBe(true)
      const later = trails(strokes.slice(start), spec().color)
      expect(later).toHaveLength(early.length)
      const distance = (paint: Paint): number => Math.hypot(paint.path[1]!.x - 100, paint.path[1]!.y - 50)
      expect(later.reduce((sum, paint) => sum + distance(paint), 0)).toBeGreaterThan(early.reduce((sum, paint) => sum + distance(paint), 0))
      expect(later.every((paint, index) => paint.alpha < early[index]!.alpha)).toBe(true)
      expect(fx.step(BUBBLES3D_POP_FX_DURATION, false)).toBe(false)
      const counts = () => [context.clearRect, context.arc, context.moveTo, context.lineTo, context.stroke, context.fill].map(mock => mock.mock.calls.length)
      const idle = counts()
      for (let frame = 0; frame < 100; frame++) expect(fx.step(1 / 60, false)).toBe(false)
      expect(counts()).toEqual(idle)
    } finally { fx.dispose() }
  })

  it('keeps simultaneous pops within a fixed twelve-burst, 144-particle pool', () => {
    const { fills, strokes, getContext, fx } = setup(() => 1)
    try {
      for (let id = 0; id < 40; id++) fx.burst(spec({ x: id * 1000, y: 10 }))
      expect(fx.step(0.07, false)).toBe(true)
      expect(trails(strokes, spec().color)).toHaveLength(BUBBLES3D_POP_FX_CAPACITY * BUBBLES3D_POP_FX_PARTICLES)
      expect(fills.length + strokes.length).toBeLessThanOrEqual(BUBBLES3D_POP_FX_CAPACITY * (BUBBLES3D_POP_FX_PARTICLES * 3 + 2))
      const visiblePops = [...new Set(strokes.flatMap(paint => paint.path.map(segment => Math.round(segment.x / 1000))))].sort((a, b) => a - b)
      expect(visiblePops).toEqual(Array.from({ length: 12 }, (_, index) => 28 + index))
      expect(getContext).toHaveBeenCalledOnce()
    } finally { fx.dispose() }
  })

  it('renders rainbow-colored trails and white highlights without extra canvases', () => {
    const { host, fills, strokes, fx } = setup()
    try {
      fx.burst(spec({ rainbow: true }))
      fx.step(0.07, false)
      expect(new Set(trails(strokes).map(paint => paint.color)).size).toBeGreaterThanOrEqual(6)
      expect([...fills, ...strokes].some(paint => paint.color === '#ffffff')).toBe(true)
      expect(host.querySelectorAll('.bubbles3d-pop-fx')).toHaveLength(1)
    } finally { fx.dispose() }
  })

  it('reproduces a seeded burst and varies the next pop instead of repeating an even pattern', () => {
    const first = setup(seeded(1234))
    let original: { fills: Paint[]; strokes: Paint[] }
    try {
      first.fx.burst(spec())
      first.fx.step(0.07, false)
      original = { fills: [...first.fills], strokes: [...first.strokes] }
      first.fx.clear()
      const fillStart = first.fills.length
      const strokeStart = first.strokes.length
      first.fx.burst(spec())
      first.fx.step(0.07, false)
      expect({ fills: first.fills.slice(fillStart), strokes: first.strokes.slice(strokeStart) }).not.toEqual(original)
    } finally { first.fx.dispose() }
    const repeated = setup(seeded(1234))
    try {
      repeated.fx.burst(spec())
      repeated.fx.step(0.07, false)
      expect({ fills: repeated.fills, strokes: repeated.strokes }).toEqual(original!)
    } finally { repeated.fx.dispose() }
  })

  it('samples randomness only when a valid burst is born', () => {
    const random = vi.fn(seeded(50))
    const { fx } = setup(random)
    try {
      expect(random).not.toHaveBeenCalled()
      fx.burst(spec({ radius: -1 }))
      expect(random).not.toHaveBeenCalled()
      fx.burst(spec())
      const samples = random.mock.calls.length
      expect(samples).toBeGreaterThan(0)
      for (let frame = 0; frame < 5; frame++) fx.step(0.02, false)
      fx.resize(400, 200)
      expect(random).toHaveBeenCalledTimes(samples)
      fx.clear()
      fx.burst(spec())
      expect(random.mock.calls.length).toBeGreaterThan(samples)
    } finally { fx.dispose() }
  })

  it('keeps the supplied CSS-pixel center and scales feedback with the popped radius', () => {
    const base = setup(seeded(7))
    let original: { fills: ReturnType<typeof relative>; strokes: ReturnType<typeof relative> }
    let smallRadius: number
    try {
      base.fx.burst(spec({ radius: 20 }))
      base.fx.step(0.07, false)
      original = { fills: relative(base.fills, 100, 50), strokes: relative(base.strokes, 100, 50) }
      smallRadius = Math.max(...base.context.arc.mock.calls.map(call => call[2]))
    } finally { base.fx.dispose() }
    const moved = setup(seeded(7))
    try {
      moved.fx.burst(spec({ x: 210, y: 120, radius: 20 }))
      moved.fx.step(0.07, false)
      const translated = { fills: relative(moved.fills, 210, 120), strokes: relative(moved.strokes, 210, 120) }
      // Decimal projection differences are harmless; compare rounded CSS pixels.
      const rounded = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_, item: unknown) => typeof item === 'number' ? Math.round(item * 1e7) / 1e7 : item))
      expect(rounded(translated)).toEqual(rounded(original!))
    } finally { moved.fx.dispose() }
    const large = setup(seeded(7))
    try {
      large.fx.burst(spec({ radius: 80 }))
      large.fx.step(0.07, false)
      expect(Math.max(...large.context.arc.mock.calls.map(call => call[2]))).toBeGreaterThan(smallRadius)
      expectFinite([...large.fills, ...large.strokes])
    } finally { large.fx.dispose() }
  })

  for (const invalid of [-2, 2, NaN, Infinity, 'throws'] as const) {
    it(`keeps malformed random output (${invalid}) finite and harmless`, () => {
      const { fills, strokes, fx } = setup(() => {
        if (invalid === 'throws') throw new Error('Random unavailable')
        return invalid
      })
      try {
        expect(() => fx.burst(spec())).not.toThrow()
        expect(fx.step(0.07, false)).toBe(true)
        expect(trails(strokes, spec().color).length).toBeGreaterThanOrEqual(8)
        expect(trails(strokes, spec().color).length).toBeLessThanOrEqual(BUBBLES3D_POP_FX_PARTICLES)
        expectFinite([...fills, ...strokes])
        expect(fx.step(BUBBLES3D_POP_FX_DURATION, false)).toBe(false)
      } finally { fx.dispose() }
    })
  }

  it('ignores malformed positions, radii, colors, and geometry without acquiring canvas', () => {
    const { getContext, fx } = setup()
    try {
      for (const invalid of [spec({ x: NaN }), spec({ y: Infinity }), spec({ radius: -1 }), spec({ radius: 0 }), spec({ radius: Infinity }), spec({ color: '' })]) fx.burst(invalid)
      expect(fx.step(0, false)).toBe(false)
      expect(getContext).not.toHaveBeenCalled()
      for (const [width, height] of [[0, 10], [10, -1], [Infinity, 10], [10, NaN]]) {
        fx.resize(width!, height!)
        fx.burst(spec())
        expect(fx.step(0, false)).toBe(false)
      }
      expect(getContext).not.toHaveBeenCalled()
      fx.resize(12.5, 7.25)
      fx.burst(spec({ radius: 2 }))
      expect(fx.step(0, false)).toBe(true)
    } finally { fx.dispose() }
  })

  it('handles invalid deltas safely and expires a burst after a long interrupted frame', () => {
    const { context, fills, strokes, fx } = setup()
    try {
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(true)
      const initialFills = [...fills]
      const initialStrokes = [...strokes]
      for (const delta of [NaN, Infinity, -1]) {
        const fillStart = fills.length
        const strokeStart = strokes.length
        expect(fx.step(delta, false)).toBe(true)
        expect(fills.slice(fillStart)).toEqual(initialFills)
        expect(strokes.slice(strokeStart)).toEqual(initialStrokes)
      }
      expectFinite([...fills, ...strokes])
      expect(fx.step(10, false)).toBe(false)
      expect(context.globalAlpha).toBe(1)
    } finally { fx.dispose() }
  })

  it('clears immediately under reduced motion and draws nothing afterward', () => {
    const { context, fx } = setup()
    try {
      fx.burst(spec())
      fx.step(0.1, false)
      expect(fx.step(0, true)).toBe(false)
      const clears = context.clearRect.mock.calls.length
      const arcs = context.arc.mock.calls.length
      expect(fx.step(0.1, false)).toBe(false)
      expect(context.clearRect).toHaveBeenCalledTimes(clears)
      expect(context.arc).toHaveBeenCalledTimes(arcs)
      fx.burst(spec())
      expect(fx.step(0, true)).toBe(false)
      expect(fx.step(0.1, false)).toBe(false)
    } finally { fx.dispose() }
  })

  it('clears on explicit clear and resize, reuses the context, and handles zero geometry after acquisition', () => {
    const { host, context, getContext, fx } = setup()
    try {
      fx.burst(spec())
      fx.step(0, false)
      fx.clear()
      expect(fx.step(0.1, false)).toBe(false)
      fx.burst(spec())
      fx.step(0, false)
      fx.resize(800, 600)
      const overlay = host.querySelector<HTMLCanvasElement>('.bubbles3d-pop-fx')!
      expect([overlay.width, overlay.height]).toEqual([800, 600])
      expect(fx.step(0, false)).toBe(false)
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(true)
      fx.resize(0, 0)
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(false)
      expect(getContext).toHaveBeenCalledOnce()
      expect(context.clearRect).toHaveBeenCalled()
    } finally { fx.dispose() }
  })

  it('preserves active effects and performs no canvas work for the same normalized size', () => {
    const { host, context, fx } = setup()
    try {
      fx.resize(400.2, 200.2)
      fx.burst(spec())
      expect(fx.step(0.1, false)).toBe(true)
      const overlay = host.querySelector<HTMLCanvasElement>('.bubbles3d-pop-fx')!
      const width = vi.spyOn(overlay, 'width', 'set')
      const height = vi.spyOn(overlay, 'height', 'set')
      const clears = context.clearRect.mock.calls.length
      const arcs = context.arc.mock.calls.length
      fx.resize(400.2, 200.2)
      fx.resize(400.8, 200.8)
      expect(context.clearRect).toHaveBeenCalledTimes(clears)
      expect(context.arc).toHaveBeenCalledTimes(arcs)
      expect(width).not.toHaveBeenCalled()
      expect(height).not.toHaveBeenCalled()
      expect(fx.step(0.1, false)).toBe(true)
      expect(fx.step(BUBBLES3D_POP_FX_DURATION, false)).toBe(false)
      expect([overlay.width, overlay.height]).toEqual([401, 201])
      width.mockRestore()
      height.mockRestore()
    } finally { fx.dispose() }
  })

  for (const failure of ['missing', 'throws'] as const) {
    it(`degrades to an idle no-op when canvas context ${failure}`, () => {
      const { host, getContext, fx } = setup()
      if (failure === 'missing') getContext.mockReturnValue(null)
      else getContext.mockImplementation(() => { throw new Error('Canvas unavailable') })
      try {
        expect(() => fx.burst(spec())).not.toThrow()
        expect(fx.step(0, false)).toBe(false)
        fx.burst(spec())
        fx.resize(500, 300)
        expect(fx.step(0, false)).toBe(false)
        expect(getContext).toHaveBeenCalledOnce()
        expect(host.querySelector('.bubbles3d-pop-fx')).toBeNull()
      } finally { fx.dispose() }
    })
  }

  it('contains rendering errors and releases the failed canvas without breaking the scene', () => {
    const { host, sceneCanvas, context, getContext, fx } = setup()
    context.arc.mockImplementation(() => { throw new Error('Context lost') })
    try {
      fx.burst(spec())
      const overlay = host.querySelector<HTMLCanvasElement>('.bubbles3d-pop-fx')!
      expect(fx.step(0, false)).toBe(false)
      expect(host.children).toHaveLength(1)
      expect(host.firstChild).toBe(sceneCanvas)
      expect([overlay.width, overlay.height]).toEqual([0, 0])
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(false)
      expect(getContext).toHaveBeenCalledOnce()
    } finally { fx.dispose() }
  })

  it('contains a failing clear operation and disables further effect drawing', () => {
    const { host, context, getContext, fx } = setup()
    try {
      fx.burst(spec())
      fx.step(0, false)
      context.clearRect.mockImplementation(() => { throw new Error('Surface unavailable') })
      expect(() => fx.clear()).not.toThrow()
      expect(host.querySelector('.bubbles3d-pop-fx')).toBeNull()
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(false)
      expect(getContext).toHaveBeenCalledOnce()
    } finally { fx.dispose() }
  })

  it('contains an attachment failure without keeping a generated surface', () => {
    const { host, sceneCanvas, getContext, fx } = setup()
    vi.spyOn(host, 'append').mockImplementation(() => { throw new Error('Host unavailable') })
    try {
      expect(() => fx.burst(spec())).not.toThrow()
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(false)
      expect([...host.children]).toEqual([sceneCanvas])
      expect(getContext).toHaveBeenCalledOnce()
    } finally { fx.dispose() }
  })

  it('never acquires a surface when disposed without any pops', () => {
    const { host, sceneCanvas, context, getContext, fx } = setup()
    fx.clear()
    fx.resize(200, 200)
    fx.dispose()
    fx.burst(spec())
    expect(fx.step(0, false)).toBe(false)
    expect([...host.children]).toEqual([sceneCanvas])
    expect(getContext).not.toHaveBeenCalled()
    expect(context.clearRect).not.toHaveBeenCalled()
  })

  it('releases the surface and backing store on disposal and stays inert', () => {
    const { host, sceneCanvas, context, fx } = setup()
    fx.burst(spec())
    fx.step(0, false)
    const overlay = host.querySelector<HTMLCanvasElement>('.bubbles3d-pop-fx')!
    fx.dispose()
    fx.dispose()
    expect([...host.children]).toEqual([sceneCanvas])
    expect([overlay.width, overlay.height]).toEqual([0, 0])
    const calls = context.clearRect.mock.calls.length
    fx.resize(100, 100)
    fx.burst(spec())
    fx.clear()
    expect(fx.step(0, false)).toBe(false)
    expect(context.clearRect).toHaveBeenCalledTimes(calls)
  })
})
