import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import { mergeCharacters, mergeGroupCandidates } from './characterLabDomain'
import { createCharacterLabRuntime, type CharacterLabRuntimeHandlers } from './characterLabRuntime'

let time = 0
let frames: Map<number, FrameRequestCallback>
let cleanups: Array<() => void>
let resizeCallbacks: Array<() => void>
beforeEach(() => {
  time = 0
  frames = new Map()
  cleanups = []
  resizeCallbacks = []
  let nextFrame = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  vi.spyOn(window.performance, 'now').mockImplementation(() => time)
  vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallbacks.push(callback) }
    observe() {}
    disconnect() {}
  })
})
afterEach(() => {
  cleanups.forEach(cleanup => cleanup())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const runFrames = (count = 1, elapsed = 16): void => {
  for (let index = 0; index < count; index++) {
    time += elapsed
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach(callback => callback(time))
  }
}
const pointer = (target: EventTarget, type: string, id = 1, x = 160, y = 120, pointerType = 'touch', stamp = time, button = 0): PointerEvent => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y, button,
    buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0 })
  Object.defineProperty(event, 'timeStamp', { value: stamp })
  target.dispatchEvent(event)
  return event
}
const native = (target: EventTarget, type: string, points: ReadonlyArray<{ identifier: number; target: EventTarget; clientX: number; clientY: number }>, stamp = time, indexed = false): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    changedTouches: { value: indexed ? points : { length: points.length, item: (index: number) => points[index] ?? null } },
    timeStamp: { value: stamp },
  })
  target.dispatchEvent(event)
  return event
}
interface Spec { id: number; character: string; x: number; y: number; delay?: number; spin?: number }
const fixture = (specs: ReadonlyArray<Spec> = [{ id: 0, character: '明', x: .3, y: .2 }], dimensions: readonly [number, number] = [500, 500], groups = false) => {
  const stage = document.createElement('div')
  stage.setAttribute('data-character-lab-revision', '7')
  let width = dimensions[0]
  let height = dimensions[1]
  stage.getBoundingClientRect = () => new DOMRect(10, 20, width, height)
  const pieces = new Map<number, HTMLButtonElement>()
  const add = (spec: Spec): HTMLButtonElement => {
    const piece = document.createElement('button')
    piece.className = 'character-lab-piece'
    piece.type = 'button'
    for (const [name, value] of Object.entries({ 'data-character-lab-id': spec.id, 'data-character-lab-character': spec.character,
      'data-x': spec.x, 'data-y': spec.y, 'data-vx': 0, 'data-vy': 0, 'data-angle': .2, 'data-spin': spec.spin ?? 2, 'data-merge-delay': spec.delay ?? 0 })) piece.setAttribute(name, String(value))
    piece.style.left = `${spec.x * 100}%`
    piece.style.top = `${spec.y * 100}%`
    piece.style.transform = 'translate(-50%,-50%)'
    Object.defineProperty(piece, 'offsetWidth', { value: 64 })
    const captured = new Set<number>()
    piece.setPointerCapture = vi.fn(id => { captured.add(id) })
    piece.hasPointerCapture = vi.fn(id => captured.has(id))
    piece.releasePointerCapture = vi.fn(id => { captured.delete(id); pointer(piece, 'lostpointercapture', id, 0, 0, 'pen') })
    stage.append(piece)
    pieces.set(spec.id, piece)
    return piece
  }
  specs.forEach(add)
  document.body.append(stage)
  const handlers = { collision: vi.fn<CharacterLabRuntimeHandlers['collision']>(), tapped: vi.fn<CharacterLabRuntimeHandlers['tapped']>(),
    groupCollision: groups ? vi.fn<NonNullable<CharacterLabRuntimeHandlers['groupCollision']>>() : undefined }
  const cleanup = createCharacterLabRuntime(stage, handlers)
  cleanups.push(cleanup)
  return { stage, pieces, handlers, cleanup, add, resize: (w: number, h: number) => { width = w; height = h; resizeCallbacks.forEach(callback => callback()) } }
}
const pose = (piece: HTMLElement) => {
  const match = piece.style.transform.match(/translate3d\(([-\d.e]+)px,([-\d.e]+)px,0\) rotate\(([-\d.e]+)rad\)/)!
  return { x: Number(match[1]) + 32, y: Number(match[2]) + 32, angle: Number(match[3]) }
}

describe('Character Lab physics runtime', () => {
  it('adopts authored normalized spawns and paints gravity and rotation without double offsets', () => {
    const { pieces } = fixture()
    const piece = pieces.get(0)!
    expect(piece.style.left).toBe('0px')
    expect(piece.style.top).toBe('0px')
    expect(pose(piece)).toEqual({ x: 150, y: 100, angle: .2 })
    runFrames(25)
    expect(pose(piece).y).toBeGreaterThan(200)
    expect(pose(piece).angle).toBeGreaterThan(.5)
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('animates and handles the 120th piece while leaving overflow pieces outside the runtime', () => {
    const { pieces, handlers, cleanup } = fixture(Array.from({ length: 121 }, (_, id) => ({
      id, character: '明', x: (id % 12 + .5) / 12, y: (Math.floor(id / 12) + .5) / 11, delay: 5000,
    })), [2000, 2000], true)
    for (let id = 0; id < 120; id++) expect(pieces.get(id)!.style.left).toBe('0px')
    const last = pieces.get(119)!
    const overflow = pieces.get(120)!
    expect(overflow.style.left).not.toBe('0px')
    const initial = pose(last)
    runFrames(1)
    expect(pose(last).y).toBeGreaterThan(initial.y)
    expect(pose(last).angle).toBeGreaterThan(initial.angle)
    const current = pose(last)
    pointer(last, 'pointerdown', 1, current.x + 10, current.y + 20, 'pen', 100)
    pointer(document, 'pointermove', 1, current.x - 90, current.y - 80, 'pen', 120)
    expect(pose(last).x).toBeCloseTo(current.x - 100)
    expect(pose(last).y).toBeCloseTo(current.y - 100)
    pointer(document, 'pointercancel', 1, current.x - 90, current.y - 80, 'pen', 125)
    last.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
    expect(handlers.tapped).toHaveBeenCalledOnce()
    expect(handlers.tapped.mock.calls[0]![0]).toBe(119)
    handlers.tapped.mockClear()
    const fallback = vi.fn()
    overflow.addEventListener('click', fallback)
    overflow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
    expect(handlers.tapped).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledOnce()
    cleanup()
    expect(last.style.left).not.toBe('0px')
    expect(last.style.transform).toBe('translate(-50%,-50%)')
    expect(frames.size).toBe(0)
  })

  it.each(['mouse', 'pen', 'touch'])('emits one current-pose tap on a qualifying %s release and suppresses its click', type => {
    const { pieces, handlers } = fixture()
    const piece = pieces.get(0)!
    const fallback = vi.fn()
    piece.addEventListener('click', fallback)
    pointer(piece, 'pointerdown', 1, 160, 120, type, 100)
    expect(handlers.tapped).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 1, 160, 120, type, 110)
    piece.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
    expect(handlers.tapped).toHaveBeenCalledExactlyOnceWith(0, 7, .3, .2, 0, 0, .2)
    expect(Audio.warmAudio).toHaveBeenCalledOnce()
    expect(fallback).not.toHaveBeenCalled()
    if (type === 'touch') expect(piece.setPointerCapture).not.toHaveBeenCalled()
    else expect(piece.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it.each(['pointer-first', 'native-first'] as const)('pairs %s native finger streams and ignores lost implicit capture', order => {
    const { pieces, handlers } = fixture()
    const piece = pieces.get(0)!
    const point = { identifier: -839, target: piece, clientX: 160, clientY: 120 }
    if (order === 'pointer-first') {
      pointer(piece, 'pointerdown', 13, 160, 120, 'touch', 100)
      native(piece, 'touchstart', [point], 101)
    } else {
      native(piece, 'touchstart', [point], 100, true)
      pointer(piece, 'pointerdown', 13, 160, 120, 'touch', 101)
    }
    pointer(piece, 'lostpointercapture', 13, 160, 120, 'touch', 102)
    pointer(document, 'pointerup', 13, 160, 120, 'touch', 110)
    native(document, 'touchend', [point], 111)
    expect(handlers.tapped).toHaveBeenCalledOnce()
    expect(Audio.warmAudio).toHaveBeenCalledOnce()
    expect(piece.setPointerCapture).not.toHaveBeenCalled()
    expect(piece.classList.contains('character-lab-piece--dragging')).toBe(false)
  })

  it('allows independent native fingers to drag pieces even when an unrelated finger touches the background', () => {
    const { stage, pieces, handlers } = fixture([{ id: 0, character: '日', x: .3, y: .2 }, { id: 1, character: '木', x: .7, y: .2 }])
    const a = pieces.get(0)!
    const b = pieces.get(1)!
    const first = { identifier: -2, target: a, clientX: 160, clientY: 120 }
    const second = { identifier: 92, target: b, clientX: 360, clientY: 120 }
    native(stage, 'touchstart', [{ identifier: 3, target: stage, clientX: 20, clientY: 30 }], 99)
    native(a, 'touchstart', [first], 100)
    native(b, 'touchstart', [second], 102)
    native(document, 'touchmove', [{ ...first, clientX: 110, clientY: 220 }, { ...second, clientX: 410, clientY: 320 }], 120, true)
    expect(pose(a).x).toBe(100)
    expect(pose(a).y).toBe(200)
    expect(pose(b).x).toBe(400)
    expect(pose(b).y).toBe(300)
    native(document, 'touchend', [{ ...first, clientX: 110, clientY: 220 }, { ...second, clientX: 410, clientY: 320 }], 130)
    expect(handlers.tapped).not.toHaveBeenCalled()
    expect(a.classList.contains('character-lab-piece--dragging')).toBe(false)
    expect(b.classList.contains('character-lab-piece--dragging')).toBe(false)
  })

  it('flings and rotates an off-centre drag rather than splitting it', () => {
    const { pieces, handlers } = fixture()
    const piece = pieces.get(0)!
    pointer(piece, 'pointerdown', 1, 172, 120, 'pen', 100)
    pointer(document, 'pointermove', 1, 362, 220, 'pen', 120)
    pointer(document, 'pointerup', 1, 362, 220, 'pen', 125)
    const released = pose(piece)
    runFrames(3)
    expect(pose(piece).x).toBeGreaterThan(released.x)
    expect(pose(piece).angle).not.toBe(released.angle)
    expect(handlers.tapped).not.toHaveBeenCalled()
  })

  it('merges swept compatible contacts when a quick drag jumps over the target between frames', () => {
    const { pieces, handlers } = fixture([{ id: 0, character: '日', x: .2, y: .2 }, { id: 1, character: '月', x: .6, y: .2 }])
    pointer(pieces.get(0)!, 'pointerdown', 1, 110, 120, 'touch', 100)
    pointer(document, 'pointermove', 1, 460, 120, 'touch', 120)
    expect(handlers.collision).toHaveBeenCalledOnce()
    expect(handlers.collision.mock.calls[0]!.slice(0, 4)).toEqual([0, 1, .6, .2])
    pointer(document, 'pointerup', 1, 460, 120, 'touch', 125)
    expect(handlers.tapped).not.toHaveBeenCalled()
  })

  it('emits a compatible collision once while semantic replacement is pending', () => {
    const { handlers } = fixture([{ id: 0, character: '日', x: .4, y: .2 }, { id: 1, character: '月', x: .49, y: .2 }])
    runFrames(15)
    expect(handlers.collision).toHaveBeenCalledOnce()
    expect(handlers.collision.mock.calls[0]![7]).toBe(7)
  })

  it('prioritizes three touching mouths over their two-piece precursor and reserves every piece once', () => {
    const { handlers, pieces } = fixture([
      { id: 0, character: '口', x: .3, y: .2 }, { id: 1, character: '囗', x: .42, y: .2 }, { id: 2, character: '口', x: .54, y: .2 },
    ], [500, 500], true)
    expect(mergeGroupCandidates(['口', '囗', '口'])).toContain('品')
    runFrames(25)
    expect(handlers.groupCollision).toHaveBeenCalledOnce()
    expect(handlers.groupCollision!.mock.calls[0]![0]).toEqual([0, 1, 2])
    expect(handlers.groupCollision!.mock.calls[0]![6]).toBe(7)
    expect(handlers.collision).not.toHaveBeenCalled()
    pointer(pieces.get(2)!, 'pointerdown', 1, 280, 120, 'touch', 450)
    pointer(document, 'pointerup', 1, 280, 120, 'touch', 460)
    expect(handlers.tapped).not.toHaveBeenCalled()
  })

  it('joins three distinct touching components when no pair can form an intermediate character', () => {
    expect(mergeCharacters('亠', '口')).toBeUndefined()
    expect(mergeCharacters('亠', '小')).toBeUndefined()
    expect(mergeCharacters('口', '小')).toBeUndefined()
    expect(mergeGroupCandidates(['亠', '口', '小'])).toContain('京')
    const { handlers } = fixture([
      { id: 0, character: '亠', x: .3, y: .2 }, { id: 1, character: '口', x: .42, y: .2 }, { id: 2, character: '小', x: .54, y: .2 },
    ], [500, 500], true)
    runFrames(1)
    expect(handlers.groupCollision).toHaveBeenCalledOnce()
    expect(handlers.groupCollision!.mock.calls[0]![0]).toEqual([0, 1, 2])
    expect(handlers.collision).not.toHaveBeenCalled()
  })

  it('requires the third component to touch the selected group rather than collecting a distant or unrelated piece', () => {
    const { handlers } = fixture([
      { id: 0, character: '亠', x: .2, y: .2 }, { id: 1, character: '口', x: .32, y: .2 },
      { id: 2, character: '明', x: .44, y: .2 }, { id: 3, character: '小', x: .56, y: .2 },
    ], [500, 500], true)
    runFrames(1)
    expect(handlers.groupCollision).not.toHaveBeenCalled()
    expect(handlers.collision).not.toHaveBeenCalled()
  })

  it('detects a swept three-piece join when dragging jumps over an incompatible pair', () => {
    const { pieces, handlers } = fixture([
      { id: 0, character: '亠', x: .2, y: .2 }, { id: 1, character: '口', x: .6, y: .2 }, { id: 2, character: '小', x: .72, y: .2 },
    ], [500, 500], true)
    pointer(pieces.get(0)!, 'pointerdown', 1, 110, 120, 'touch', 100)
    pointer(document, 'pointermove', 1, 460, 120, 'touch', 120)
    expect(handlers.groupCollision).toHaveBeenCalledOnce()
    expect(handlers.groupCollision!.mock.calls[0]!.slice(0, 3)).toEqual([[0, 1, 2], .64, .2])
    expect(handlers.collision).not.toHaveBeenCalled()
    pointer(document, 'pointercancel', 1, 460, 120, 'touch', 125)
    expect(handlers.tapped).not.toHaveBeenCalled()
  })

  it('honors every component’s split grace and clears group reservations across epochs and cleanup', () => {
    const { stage, pieces, handlers, cleanup } = fixture([
      { id: 0, character: '亠', x: .3, y: .2 }, { id: 1, character: '口', x: .42, y: .2 }, { id: 2, character: '小', x: .54, y: .2, delay: 1000 },
    ], [500, 500], true)
    runFrames(58)
    expect(handlers.groupCollision).not.toHaveBeenCalled()
    runFrames(8)
    expect(handlers.groupCollision).toHaveBeenCalledOnce()
    stage.setAttribute('data-character-lab-revision', '8')
    pointer(pieces.get(0)!, 'pointerdown', 3, 160, 120, 'touch')
    pointer(document, 'pointercancel', 3, 160, 120, 'touch')
    runFrames(1)
    expect(handlers.groupCollision).toHaveBeenCalledOnce()
    runFrames(65)
    expect(handlers.groupCollision).toHaveBeenCalledTimes(2)
    expect(handlers.groupCollision!.mock.calls[1]![6]).toBe(8)
    cleanup()
    runFrames(10)
    expect(handlers.groupCollision).toHaveBeenCalledTimes(2)
  })

  it('respects split grace and does not report incompatible collisions', () => {
    const compatible = fixture([{ id: 0, character: '日', x: .4, y: .2, delay: 1000 }, { id: 1, character: '月', x: .49, y: .2, delay: 1000 }])
    runFrames(58)
    expect(compatible.handlers.collision).not.toHaveBeenCalled()
    runFrames(8)
    expect(compatible.handlers.collision).toHaveBeenCalledOnce()
    compatible.cleanup()
    const incompatible = fixture([{ id: 2, character: '木', x: .4, y: .2 }, { id: 3, character: '金', x: .49, y: .2 }])
    runFrames(12)
    expect(incompatible.handlers.collision).not.toHaveBeenCalled()
  })

  it('cancels paired fingers, blurred drags and removed pieces without taps or audio unlock', async () => {
    const { stage, pieces, handlers } = fixture()
    const piece = pieces.get(0)!
    pointer(piece, 'pointerdown', 1, 160, 120, 'touch', 100)
    native(piece, 'touchstart', [{ identifier: -7, target: piece, clientX: 160, clientY: 120 }], 101)
    pointer(document, 'pointercancel', 1, 160, 120, 'touch', 102)
    native(document, 'touchend', [{ identifier: -7, target: piece, clientX: 160, clientY: 120 }], 103)
    pointer(piece, 'pointerdown', 2, 160, 120, 'pen', 110)
    window.dispatchEvent(new Event('blur'))
    pointer(document, 'pointerup', 2, 160, 120, 'pen', 112)
    pointer(piece, 'pointerdown', 3, 160, 120, 'touch', 120)
    piece.remove()
    await vi.waitFor(() => expect(piece.classList.contains('character-lab-piece--dragging')).toBe(false))
    pointer(document, 'pointerup', 3, 160, 120, 'touch', 122)
    expect(handlers.tapped).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    expect(stage.children).toHaveLength(0)
  })

  it('pauses hidden-page animation, cancels its contacts, and resumes without a large catch-up step', () => {
    let hidden = false
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    const { pieces, handlers } = fixture()
    const piece = pieces.get(0)!
    pointer(piece, 'pointerdown', 1, 160, 120, 'touch', 100)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    pointer(document, 'pointerup', 1, 160, 120, 'touch', 110)
    expect(handlers.tapped).not.toHaveBeenCalled()
    time = 50000
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    runFrames(1)
    expect(pose(piece).y).toBeGreaterThan(100)
    expect(pose(piece).y).toBeLessThan(102)
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('keeps gravity and collision behavior under reduced motion while softening ambient spin', () => {
    const normal = fixture()
    runFrames(25)
    const normalPose = pose(normal.pieces.get(0)!)
    normal.cleanup()
    const media: MediaQueryList = { matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(() => true) }
    vi.spyOn(window, 'matchMedia').mockReturnValue(media)
    const reduced = fixture()
    runFrames(25)
    const reducedPose = pose(reduced.pieces.get(0)!)
    expect(reducedPose.y).toBeCloseTo(normalPose.y)
    expect(reducedPose.angle - .2).toBeCloseTo((normalPose.angle - .2) * .35)
  })

  it('waits for usable geometry before adopting the normalized spawn', () => {
    const { pieces, resize } = fixture(undefined, [0, 0])
    const piece = pieces.get(0)!
    expect(piece.style.left).toBe('30%')
    resize(500, 500)
    runFrames(1)
    expect(pose(piece).x).toBe(150)
    expect(pose(piece).y).toBeGreaterThanOrEqual(100)
    expect(pose(piece).y).toBeLessThan(102)
  })

  it('rejects old contacts on epoch changes and snapshots the fresh position for keyboard activation', () => {
    const { stage, pieces, handlers, cleanup } = fixture()
    const piece = pieces.get(0)!
    pointer(piece, 'pointerdown', 1, 160, 120, 'pen', 100)
    stage.setAttribute('data-character-lab-revision', '8')
    pointer(document, 'pointerup', 1, 160, 120, 'pen', 110)
    expect(handlers.tapped).not.toHaveBeenCalled()
    runFrames(8)
    const current = pose(piece)
    const fallback = vi.fn()
    piece.addEventListener('click', fallback)
    piece.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
    expect(handlers.tapped).toHaveBeenCalledOnce()
    expect(handlers.tapped.mock.calls[0]!.slice(0, 4)).toEqual([0, 8, current.x / 500, current.y / 500])
    expect(fallback).not.toHaveBeenCalled()
    cleanup()
    expect(piece.style.left).toBe('30%')
    expect(piece.style.top).toBe('20%')
    expect(piece.style.transform).toBe('translate(-50%,-50%)')
  })

  it('reconciles new model pieces without respawning surviving motion and rescales on resize', async () => {
    const { pieces, add, resize } = fixture()
    const first = pieces.get(0)!
    runFrames(8)
    const before = pose(first)
    const added = add({ id: 4, character: '女', x: .8, y: .1 })
    await vi.waitFor(() => expect(added.style.left).toBe('0px'))
    expect(pose(first)).toEqual(before)
    expect(pose(added).x).toBe(400)
    resize(1000, 1000)
    runFrames(1, 0)
    expect(pose(first).x).toBeCloseTo(before.x * 2)
    expect(pose(first).y).toBeCloseTo(before.y * 2)
  })

  it('cleans up animation, observers, captures and authored fallback styles idempotently', () => {
    const { stage, pieces, cleanup, handlers } = fixture()
    const piece = pieces.get(0)!
    pointer(piece, 'pointerdown', 1, 160, 120, 'pen', 100)
    cleanup()
    cleanup()
    expect(frames.size).toBe(0)
    expect(piece.style.left).toBe('30%')
    expect(piece.style.top).toBe('20%')
    expect(piece.style.transform).toBe('translate(-50%,-50%)')
    expect(piece.releasePointerCapture).toHaveBeenCalledWith(1)
    pointer(document, 'pointerup', 1, 160, 120, 'pen', 120)
    stage.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
    runFrames(1)
    expect(handlers.tapped).not.toHaveBeenCalled()
  })

  it('falls back safely without observers or RAF and releases its timer on cleanup', () => {
    vi.useFakeTimers()
    vi.stubGlobal('MutationObserver', undefined)
    vi.stubGlobal('ResizeObserver', undefined)
    vi.stubGlobal('requestAnimationFrame', undefined)
    const { pieces, cleanup } = fixture()
    time = 50
    vi.advanceTimersByTime(50)
    expect(pose(pieces.get(0)!).y).toBeGreaterThan(100)
    cleanup()
    expect(vi.getTimerCount()).toBe(0)
  })
})
