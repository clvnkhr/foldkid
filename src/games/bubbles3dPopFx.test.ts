import { afterEach, describe, expect, it, vi } from 'vitest'

import { BUBBLES3D_POP_FX_CAPACITY, BUBBLES3D_POP_FX_DURATION, createBubbles3dPopFx, type Bubble3dPopBurst } from './bubbles3dPopFx'

interface Fill { readonly color: string | CanvasGradient | CanvasPattern; readonly alpha: number }
const drawing = () => {
  const fills: Fill[] = []
  const context = {
    clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn(),
    fill: vi.fn(() => { fills.push({ color: context.fillStyle, alpha: context.globalAlpha }) }),
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '',
  }
  return { context, fills }
}
const setup = () => {
  const host = document.createElement('div')
  const sceneCanvas = document.createElement('canvas')
  sceneCanvas.className = 'bubbles3d-canvas'
  host.append(sceneCanvas)
  document.body.append(host)
  const { context, fills } = drawing()
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const fx = createBubbles3dPopFx(host)
  fx.resize(400, 200)
  return { host, sceneCanvas, context, fills, getContext, fx }
}
const spec = (changes: Partial<Bubble3dPopBurst> = {}): Bubble3dPopBurst => ({ x: 100, y: 50, radius: 40, color: '#ff6584', rainbow: false, ...changes })

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

  it('draws a ring and eight flat dots in the supplied CSS-pixel position and radius', () => {
    const { context, fills, fx } = setup()
    try {
      fx.burst(spec())
      expect(fx.step(0, false)).toBe(true)
      expect(context.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 400, 200)
      expect(context.arc.mock.calls[0]).toEqual([100, 50, 24.8, 0, Math.PI * 2])
      expect(context.arc.mock.calls[1]).toEqual([112, 50, 2.4, 0, Math.PI * 2])
      expect(context.stroke).toHaveBeenCalledOnce()
      expect(context.fill).toHaveBeenCalledTimes(8)
      expect(fills).toEqual(Array.from({ length: 8 }, () => ({ color: '#ff6584', alpha: 1 })))
      expect(context.globalAlpha).toBe(1)
    } finally { fx.dispose() }
  })

  it('moves dots outward and fades the effect over its bounded lifetime', () => {
    const { context, fills, fx } = setup()
    try {
      fx.burst(spec())
      expect(fx.step(BUBBLES3D_POP_FX_DURATION / 2, false)).toBe(true)
      expect(context.arc.mock.calls[0]).toEqual([100, 50, 36.8, 0, Math.PI * 2])
      expect(context.arc.mock.calls[1]![0]).toBe(137)
      expect(fills.every(fill => fill.alpha === 0.5)).toBe(true)
      expect(fx.step(BUBBLES3D_POP_FX_DURATION / 2, false)).toBe(false)
      const clearCalls = context.clearRect.mock.calls.length
      const arcs = context.arc.mock.calls.length
      for (let frame = 0; frame < 100; frame++) expect(fx.step(1 / 60, false)).toBe(false)
      expect(context.clearRect).toHaveBeenCalledTimes(clearCalls)
      expect(context.arc).toHaveBeenCalledTimes(arcs)
    } finally { fx.dispose() }
  })

  it('keeps simultaneous pops within a fixed twelve-burst, ninety-six-dot pool', () => {
    const { context, getContext, fx } = setup()
    try {
      for (let id = 0; id < 40; id++) fx.burst(spec({ x: id, y: 10 }))
      expect(fx.step(0, false)).toBe(true)
      expect(context.stroke).toHaveBeenCalledTimes(BUBBLES3D_POP_FX_CAPACITY)
      expect(context.fill).toHaveBeenCalledTimes(BUBBLES3D_POP_FX_CAPACITY * 8)
      const ringPositions = context.arc.mock.calls.filter((_, index) => index % 9 === 0).map(call => call[0]).sort((a, b) => a! - b!)
      expect(ringPositions).toEqual(Array.from({ length: 12 }, (_, index) => 28 + index))
      expect(getContext).toHaveBeenCalledOnce()
    } finally { fx.dispose() }
  })

  it('renders rainbow dots without gradients, images, or extra canvases', () => {
    const { host, context, fills, fx } = setup()
    try {
      fx.burst(spec({ rainbow: true }))
      fx.step(0, false)
      expect(new Set(fills.map(fill => fill.color)).size).toBe(8)
      expect(context.strokeStyle).toBe('#ffffff')
      expect(host.querySelectorAll('.bubbles3d-pop-fx')).toHaveLength(1)
    } finally { fx.dispose() }
  })

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
    const { context, fx } = setup()
    try {
      fx.burst(spec())
      for (const delta of [NaN, Infinity, -1]) expect(fx.step(delta, false)).toBe(true)
      expect(context.arc.mock.calls.filter((_, index) => index % 9 === 0).every(call => call[2] === 24.8)).toBe(true)
      expect(fx.step(10, false)).toBe(false)
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
      expect(fx.step(0.15, false)).toBe(false)
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
