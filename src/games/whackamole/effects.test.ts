import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWhackEffectsRuntime, mountWhackEffects } from './effects'

const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
const rect = (left = 0, top = 0, width = 100, height = 130): DOMRect => new DOMRect(left, top, width, height)
const fixture = (type = 1) => {
  const grid = document.createElement('div')
  grid.className = 'whack-grid'
  grid.dataset.whackTick = '30'
  const cells = Array.from({ length: 9 }, (_, index) => {
    const cell = document.createElement('button')
    cell.className = 'whack-cell whack-cell--up'
    cell.dataset.whackIndex = String(index)
    cell.dataset.whackType = String(type)
    const head = document.createElement('span')
    head.className = 'whack-mole-head'
    cell.append(head)
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(rect(20 + index % 3 * 110, 20 + Math.floor(index / 3) * 140))
    grid.append(cell)
    return cell
  })
  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(rect(10, 10, 350, 450))
  document.body.append(grid)
  return { grid, cells, cell: cells[0]! }
}
const click = (element: Element, detail = 0): void => { element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail })) }
const animationMock = () => {
  const runs: Array<{ frames: Keyframe[]; duration: number; cancel: ReturnType<typeof vi.fn>; finish: () => void; fail: () => void }> = []
  const animate = vi.fn((frames: Keyframe[], options: KeyframeAnimationOptions) => {
    let finish!: () => void
    let fail!: () => void
    const finished = new Promise<void>((resolve, reject) => { finish = resolve; fail = () => { reject(new Error('interrupted')) } })
    const cancel = vi.fn(fail)
    runs.push({ frames, duration: Number(options.duration), cancel, finish, fail })
    return { finished, cancel } as unknown as Animation
  })
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  return { animate, runs }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate)
  else Reflect.deleteProperty(Element.prototype, 'animate')
  document.body.replaceChildren()
})

describe('whack-a-mole hit effects', () => {
  it('launches a local text-free burst only on click, before the clicked mole is removed', () => {
    const { animate } = animationMock()
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    cell.addEventListener('click', () => { cell.dataset.whackType = '0' })
    try {
      cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))
      cell.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }))
      expect(grid.querySelector('.whack-fx-layer')).toBeNull()
      click(cell.firstElementChild!)
      const layer = grid.querySelector('.whack-fx-layer')!
      expect(layer.parentElement).toBe(grid)
      expect(layer.getAttribute('aria-hidden')).toBe('true')
      expect(layer.textContent).toBe('')
      expect(layer.querySelectorAll('.whack-fx-particle')).toHaveLength(12)
      expect(layer.querySelectorAll('.whack-fx-ring')).toHaveLength(1)
      expect(layer.querySelectorAll('.whack-fx-puff')).toHaveLength(1)
      expect(animate).toHaveBeenCalledTimes(14)
      expect(cell.dataset.whackType).toBe('0')
      click(cell)
      expect(animate).toHaveBeenCalledTimes(14)
    } finally { cleanup() }
  })

  it.each([
    [1, 'whack-fx-confetti', 12], [2, 'whack-fx-streak', 12],
    [3, 'whack-fx-star', 14], [4, 'whack-fx-petal', 10],
  ])('gives type %i distinct small shapes and varied trajectories', (type, shape, count) => {
    const { runs } = animationMock()
    const { grid, cell } = fixture(type as number)
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      click(cell, 1)
      const layer = grid.querySelector('.whack-fx-layer')!
      expect(layer.textContent).toBe('')
      expect(layer.querySelectorAll('.whack-fx-particle')).toHaveLength(count as number)
      expect(layer.querySelectorAll(`.${shape}`).length).toBeGreaterThan(0)
      if (type === 4) expect(layer.querySelectorAll('.whack-fx-heart')).toHaveLength(4)
      for (const svg of layer.querySelectorAll('svg')) {
        expect(svg.getAttribute('focusable')).toBe('false')
        expect(svg.querySelector('path')?.getAttribute('d')).toBeTruthy()
      }
      const paths = runs.slice(2).map(run => run.frames[run.frames.length - 1]!.transform)
      expect(new Set(paths).size).toBe(count)
      expect(new Set(runs.slice(2).map(run => run.duration)).size).toBeGreaterThan(1)
      expect(runs.every(run => run.duration > 0 && run.duration <= 700)).toBe(true)
    } finally { cleanup() }
  })

  it('consumes each stale mole once, while allowing separate cells, changed types, and the next tick', () => {
    animationMock()
    const { grid, cell, cells } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      click(cell); click(cell)
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(1)
      click(cells[1]!)
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(2)
      cell.dataset.whackType = '3'
      click(cell)
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(3)
      grid.dataset.whackTick = '29'
      click(cell)
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(4)
    } finally { cleanup() }
  })

  it.each([
    ['whackType', '0'], ['whackType', '5'], ['whackType', '1.5'], ['whackType', ''],
    ['whackIndex', '-1'], ['whackIndex', '9'], ['whackIndex', '0.5'], ['whackIndex', ''],
    ['whackTick', '0'], ['whackTick', '31'], ['whackTick', 'NaN'], ['whackTick', ''],
  ])('ignores invalid %s=%s', (key, value) => {
    const { animate } = animationMock()
    const { grid, cell } = fixture()
    const element = key === 'whackTick' ? grid : cell
    element.dataset[key] = value
    const cleanup = createWhackEffectsRuntime(grid)
    try { click(cell); expect(animate).not.toHaveBeenCalled(); expect(grid.querySelector('.whack-fx-layer')).toBeNull() }
    finally { cleanup() }
  })

  it('ignores disabled, inert, inactive, nested-grid, canceled, and detached activations', () => {
    const { animate } = animationMock()
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      cell.disabled = true; click(cell); cell.disabled = false
      grid.setAttribute('inert', ''); click(cell); grid.removeAttribute('inert')
      cell.classList.remove('whack-cell--up'); click(cell); cell.classList.add('whack-cell--up')
      const inner = document.createElement('div'); inner.className = 'whack-grid'; grid.append(inner); inner.append(cell)
      click(cell); grid.append(cell)
      const canceled = new MouseEvent('click', { bubbles: true, cancelable: true }); canceled.preventDefault(); cell.dispatchEvent(canceled)
      grid.remove(); click(cell)
      expect(animate).not.toHaveBeenCalled()
    } finally { cleanup() }
  })

  it.each([rect(0, 0, 0, 130), rect(0, 0, -100, 130), rect(NaN), rect(0, 0, Infinity), rect(500, 500)])('ignores unusable or out-of-board geometry %#', geometry => {
    const { animate } = animationMock()
    const { grid, cell } = fixture()
    vi.mocked(cell.getBoundingClientRect).mockReturnValue(geometry)
    const cleanup = createWhackEffectsRuntime(grid)
    try { click(cell); expect(animate).not.toHaveBeenCalled() } finally { cleanup() }
  })

  it('reads fresh local geometry after the board moves or resizes', () => {
    animationMock()
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      click(cell)
      expect(grid.querySelector<HTMLElement>('.whack-fx-burst')!.style.left).toBe('60px')
      vi.mocked(grid.getBoundingClientRect).mockReturnValue(rect(100, 200, 500, 700))
      vi.mocked(cell.getBoundingClientRect).mockReturnValue(rect(140, 230, 150, 200))
      grid.dataset.whackTick = '29'
      click(cell)
      const next = grid.querySelectorAll<HTMLElement>('.whack-fx-burst')[1]!
      expect(next.style.left).toBe('115px')
      expect(next.style.top).toBe('140px')
    } finally { cleanup() }
  })

  it('uses brief static feedback under reduced motion and releases its timer', () => {
    vi.useFakeTimers()
    const { animate } = animationMock()
    const motion = { matches: true }
    vi.spyOn(window, 'matchMedia').mockReturnValue(motion as MediaQueryList)
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      click(cell)
      expect(animate).not.toHaveBeenCalled()
      expect(grid.querySelector('.whack-fx-reduced')).not.toBeNull()
      expect(grid.querySelectorAll('.whack-fx-particle')).toHaveLength(0)
      vi.advanceTimersByTime(179)
      expect(grid.querySelector('.whack-fx-layer')).not.toBeNull()
      vi.advanceTimersByTime(1)
      expect(grid.querySelector('.whack-fx-layer')).toBeNull()
      expect(vi.getTimerCount()).toBe(0)
    } finally { cleanup() }
  })

  it.each(['missing', 'throwing'])('finishes static feedback safely with %s animation APIs', async mode => {
    vi.useFakeTimers()
    const { animate } = animationMock()
    if (mode === 'missing') Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined })
    else animate.mockImplementation(() => { throw new Error('unsupported') })
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      expect(() => click(cell)).not.toThrow()
      await Promise.resolve()
      expect(grid.querySelector('.whack-fx-reduced')).not.toBeNull()
      expect(grid.querySelectorAll('.whack-fx-particle')).toHaveLength(0)
      vi.advanceTimersByTime(180)
      expect(grid.querySelector('.whack-fx-layer')).toBeNull()
    } finally { cleanup() }
  })

  it('keeps static feedback visible after a later animation fails and earlier animations cancel', async () => {
    vi.useFakeTimers()
    const { animate, runs } = animationMock()
    const original = animate.getMockImplementation()!
    let calls = 0
    animate.mockImplementation((frames, options) => {
      if (++calls === 4) throw new Error('animation quota reached')
      return original(frames, options)
    })
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      click(cell)
      await Promise.resolve()
      expect(runs).toHaveLength(3)
      expect(runs.every(run => run.cancel.mock.calls.length === 1)).toBe(true)
      expect(grid.querySelector('.whack-fx-reduced')).not.toBeNull()
      expect(grid.querySelectorAll('.whack-fx-particle')).toHaveLength(0)
      vi.advanceTimersByTime(179)
      expect(grid.querySelector('.whack-fx-layer')).not.toBeNull()
      vi.advanceTimersByTime(1)
      expect(grid.querySelector('.whack-fx-layer')).toBeNull()
    } finally { cleanup() }
  })

  it.each(['finish', 'fail'] as const)('removes decoration once all animations %s', async outcome => {
    vi.useFakeTimers()
    const { runs } = animationMock()
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      click(cell)
      runs.slice(0, 2).forEach(run => run[outcome]())
      await Promise.resolve()
      expect(grid.querySelector('.whack-fx-ring')).toBeNull()
      expect(grid.querySelector('.whack-fx-puff')).toBeNull()
      expect(grid.querySelector('.whack-fx-burst')).not.toBeNull()
      runs.slice(2).forEach(run => run[outcome]())
      await Promise.resolve()
      expect(grid.querySelector('.whack-fx-layer')).toBeNull()
      expect(runs.every(run => run.cancel.mock.calls.length === 1)).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally { cleanup() }
  })

  it('caps rapid simultaneous bursts and removes never-settling animations with a timeout', () => {
    vi.useFakeTimers()
    const { runs } = animationMock()
    const { grid, cells } = fixture(3)
    const cleanup = createWhackEffectsRuntime(grid)
    try {
      cells.forEach(cell => click(cell))
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(6)
      expect(grid.querySelectorAll('.whack-fx-particle')).toHaveLength(84)
      expect(runs.slice(0, 48).every(run => run.cancel.mock.calls.length === 1)).toBe(true)
      vi.advanceTimersByTime(1000)
      expect(grid.querySelector('.whack-fx-layer')).toBeNull()
      expect(runs.every(run => run.cancel.mock.calls.length === 1)).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
    } finally { cleanup() }
  })

  it('releases the listener, every animation, timers, and overlay on repeated unmount', () => {
    vi.useFakeTimers()
    const { animate, runs } = animationMock()
    const { grid, cell } = fixture()
    const cleanup = createWhackEffectsRuntime(grid)
    click(cell)
    cleanup(); cleanup()
    expect(grid.querySelector('.whack-fx-layer')).toBeNull()
    expect(runs.every(run => run.cancel.mock.calls.length === 1)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    cell.dataset.whackType = '3'; click(cell)
    expect(animate).toHaveBeenCalledTimes(14)
  })

  it('owns the mounted runtime for exactly the stream lifetime', async () => {
    const { animate, runs } = animationMock()
    const { grid, cell } = fixture()
    const add = vi.spyOn(grid, 'addEventListener')
    const remove = vi.spyOn(grid, 'removeEventListener')
    const fiber = Effect.runFork(Stream.runDrain(mountWhackEffects(grid)))
    try {
      await vi.waitFor(() => { expect(add).toHaveBeenCalledWith('click', expect.any(Function), true) })
      click(cell)
      expect(animate).toHaveBeenCalledTimes(14)
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(remove).toHaveBeenCalledWith('click', expect.any(Function), true)
      expect(grid.querySelector('.whack-fx-layer')).toBeNull()
      expect(runs.every(run => run.cancel.mock.calls.length === 1)).toBe(true)
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
})
