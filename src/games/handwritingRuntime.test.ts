import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import { createHandwritingRuntime, type HandwritingHandlers } from './handwritingRuntime'

let time = 0
let frames: Map<number, FrameRequestCallback>
let cleanups: Array<() => void>
beforeEach(() => {
  time = 0
  frames = new Map()
  cleanups = []
  let nextFrame = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
})
afterEach(() => {
  cleanups.forEach(cleanup => cleanup())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const pointer = (target: EventTarget, type: string, id: number, x = 80, y = 40, pointerType = 'touch', button = 0, stamp = time, buttons = type === 'pointerdown' || type === 'pointermove' ? 1 : 0): PointerEvent => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y, button, buttons })
  Object.defineProperty(event, 'timeStamp', { value: stamp })
  target.dispatchEvent(event)
  return event
}
const touchPoint = (identifier: number, target: EventTarget, x = 80, y = 40) => ({ identifier, target, clientX: x, clientY: y })
const touch = (target: EventTarget, type: string, points: ReadonlyArray<ReturnType<typeof touchPoint>>, stamp = time, indexed = false): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    changedTouches: { value: indexed ? points : { length: points.length, item: (index: number) => points[index] ?? null } },
    timeStamp: { value: stamp },
  })
  target.dispatchEvent(event)
  return event
}
const key = (target: EventTarget, name: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: name })
  target.dispatchEvent(event)
  return event
}
const runFrame = (): void => {
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach(callback => callback(time))
}
const fixture = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('data-handwriting-revision', '7')
  svg.setAttribute('tabindex', '0')
  // happy-dom supplies an identity matrix without using the mocked layout.
  Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => null })
  let rect = { left: 10, top: 20, width: 200, height: 100 }
  vi.spyOn(svg, 'getBoundingClientRect').mockImplementation(() => ({ ...rect, x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, toJSON: () => ({}) }))
  const captures = new Set<number>()
  svg.setPointerCapture = vi.fn(id => { captures.add(id) })
  svg.hasPointerCapture = vi.fn(id => captures.has(id))
  svg.releasePointerCapture = vi.fn(id => { captures.delete(id); pointer(svg, 'lostpointercapture', id) })
  document.body.append(svg)
  const order: string[] = []
  const handlers = {
    started: vi.fn<HandwritingHandlers['started']>(() => { order.push('start') }),
    moved: vi.fn<HandwritingHandlers['moved']>(() => { order.push('move') }),
    ended: vi.fn<HandwritingHandlers['ended']>(() => { order.push('end') }),
    cancelled: vi.fn<HandwritingHandlers['cancelled']>(() => { order.push('cancel') }),
  }
  const cleanup = createHandwritingRuntime(svg, handlers)
  cleanups.push(cleanup)
  return { svg, handlers, captures, cleanup, order, setRect: (next: typeof rect) => { rect = next } }
}

describe('handwriting SVG input runtime', () => {
  it.each(['mouse', 'pen', 'touch', 'native'])('focuses the board without scrolling for an accepted %s contact', input => {
    const { svg, handlers } = fixture()
    const focus = vi.spyOn(svg, 'focus')
    expect(document.activeElement).not.toBe(svg)
    if (input === 'native') touch(svg, 'touchstart', [touchPoint(1, svg)])
    else pointer(svg, 'pointerdown', 1, 80, 40, input)
    expect(document.activeElement).toBe(svg)
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(handlers.started).toHaveBeenCalledTimes(1)
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('leaves focus unchanged when a contact has invalid geometry or starts in distant letterboxing', () => {
    const { svg, handlers, setRect } = fixture()
    const focus = vi.spyOn(svg, 'focus')
    const previous = document.activeElement
    pointer(svg, 'pointerdown', 1, 30, 40)
    setRect({ left: 10, top: 20, width: 0, height: 100 })
    touch(svg, 'touchstart', [touchPoint(2, svg)])
    expect(focus).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(previous)
    expect(handlers.started).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it.each(['pointer', 'native'])('allows nearby letterboxing for %s tracing while ignoring distant starts and cleaning up on release', input => {
    const { svg, handlers, captures } = fixture()
    const accepted = input === 'native'
      ? touch(svg, 'touchstart', [touchPoint(1, svg, 163, 40)])
      : pointer(svg, 'pointerdown', 1, 163, 40)
    const rejected = input === 'native'
      ? touch(svg, 'touchstart', [touchPoint(2, svg, 179, 40)])
      : pointer(svg, 'pointerdown', 2, 179, 40)
    expect(accepted.defaultPrevented).toBe(true)
    expect(rejected.defaultPrevented).toBe(false)
    expect(handlers.started.mock.calls).toEqual([[0, 103, 20, 7]])
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    expect(captures.size).toBe(0)
    expect(svg.setPointerCapture).not.toHaveBeenCalled()
    if (input === 'native') {
      touch(document, 'touchend', [touchPoint(1, svg, 165, 42)])
      touch(document, 'touchend', [touchPoint(2, svg, 179, 40)])
    } else {
      pointer(document, 'pointerup', 1, 165, 42)
      pointer(document, 'pointerup', 2, 179, 40)
    }
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 105, y: 22 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(captures.size).toBe(0)
    expect(frames.size).toBe(0)
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it.each(['missing', 'throwing'])('keeps tracing functional with a %s SVG focus API', availability => {
    const { svg, handlers } = fixture()
    if (availability === 'missing') Object.defineProperty(svg, 'focus', { value: undefined })
    else vi.spyOn(svg, 'focus').mockImplementation(() => { throw new Error('SVG focus unavailable') })
    pointer(svg, 'pointerdown', 1, 80, 40, 'pen')
    expect(handlers.started.mock.calls).toEqual([[0, 20, 20, 7]])
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 1, 90, 50, 'pen')
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
  })

  it('lets two pointer fingers trace independently and releases only the completed contact', () => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 3)
    pointer(svg, 'pointerdown', 4, 130, 70)
    expect(handlers.started.mock.calls).toEqual([[0, 20, 20, 7], [1, 70, 50, 7]])
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    pointer(document, 'pointermove', 3, 90, 50)
    pointer(document, 'pointermove', 4, 140, 80)
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    runFrame()
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }], 7], [1, [{ x: 80, y: 60 }], 7]])
    pointer(document, 'pointerup', 3, 90, 50)
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(captures.size).toBe(0)
    expect(svg.setPointerCapture).not.toHaveBeenCalled()
    pointer(document, 'pointermove', 4, 150, 90)
    pointer(document, 'pointerup', 4, 150, 90)
    expect(handlers.ended.mock.calls).toEqual([[0, 7], [1, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(2)
    expect(frames.size).toBe(0)
  })

  it('keeps a finger stroke alive through early capture loss before native touch can adopt it', () => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 100)
    expect(svg.setPointerCapture).not.toHaveBeenCalled()
    expect(captures.size).toBe(0)
    pointer(svg, 'lostpointercapture', 1, 80, 40, 'touch', 0, 110)
    pointer(document, 'pointermove', 1, 90, 50, 'touch', -1, 115)
    expect(handlers.cancelled).not.toHaveBeenCalled()
    touch(svg, 'touchstart', [touchPoint(-11, svg, 90, 50)], 120)
    expect(handlers.started.mock.calls).toEqual([[0, 20, 20, 7]])
    pointer(svg, 'lostpointercapture', 1, 90, 50, 'touch', 0, 125)
    touch(document, 'touchmove', [touchPoint(-11, svg, 100, 60)], 130)
    pointer(document, 'pointerup', 1, 100, 60, 'touch', 0, 140)
    expect(handlers.ended).not.toHaveBeenCalled()
    touch(document, 'touchend', [touchPoint(-11, svg, 110, 70)], 150)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }, { x: 40, y: 40 }, { x: 50, y: 50 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
  })

  it('keeps pointer-only finger tracing on document listeners after capture loss while actual cancellation still cancels', () => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 100)
    pointer(svg, 'lostpointercapture', 1, 80, 40, 'touch', 0, 105)
    pointer(document, 'pointermove', 1, 90, 50, 'touch', -1, 110)
    pointer(document, 'pointerup', 1, 100, 60, 'touch', 0, 120)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }, { x: 40, y: 40 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    pointer(svg, 'pointerdown', 2, 80, 40, 'touch', 0, 200)
    pointer(document, 'pointermove', 2, 90, 50, 'touch', -1, 210)
    pointer(document, 'pointercancel', 2, 90, 50, 'touch', 0, 220)
    pointer(document, 'pointerup', 2, 90, 50, 'touch', 0, 230)
    runFrame()
    expect(handlers.cancelled.mock.calls).toEqual([[1, 7]])
    expect(handlers.moved).toHaveBeenCalledTimes(1)
    expect(handlers.ended).toHaveBeenCalledTimes(1)
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    expect(svg.setPointerCapture).not.toHaveBeenCalled()
    expect(captures.size).toBe(0)
    expect(frames.size).toBe(0)
  })

  it.each(['mouse', 'pen'])('retains %s capture and cancels its queued points when capture is lost', pointerType => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, pointerType, 0, 100)
    expect(svg.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1)
    expect(captures).toEqual(new Set([1]))
    pointer(document, 'pointermove', 1, 90, 50, pointerType, -1, 110)
    pointer(svg, 'lostpointercapture', 1, 90, 50, pointerType, 0, 120)
    pointer(document, 'pointerup', 1, 100, 60, pointerType, 0, 130)
    runFrame()
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    expect(captures.size).toBe(0)
    expect(frames.size).toBe(0)
  })

  it('batches all ordered coalesced points and flushes the release point before ending', () => {
    const { svg, handlers, order } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'pen')
    const event = new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'pen', buttons: 1, clientX: 110, clientY: 70 })
    Object.defineProperties(event, {
      timeStamp: { value: 30 },
      getCoalescedEvents: { value: () => [
        { clientX: 90, clientY: 50, timeStamp: 10 },
        { clientX: 100, clientY: 60, timeStamp: 20 },
        { clientX: 100, clientY: 60, timeStamp: 21 },
      ] },
    })
    document.dispatchEvent(event)
    expect(handlers.moved).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 1, 120, 80, 'pen', 0, 40)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }, { x: 40, y: 40 }, { x: 50, y: 50 }, { x: 60, y: 60 }], 7]])
    expect(order).toEqual(['start', 'move', 'end'])
    expect(vi.mocked(Audio.warmAudio).mock.invocationCallOrder[0]).toBeLessThan(handlers.moved.mock.invocationCallOrder[0]!)
    expect(frames.size).toBe(0)
    runFrame()
    expect(handlers.moved).toHaveBeenCalledTimes(1)
  })

  it('falls back to the main move event when coalesced events are unavailable or throw', () => {
    const { svg, handlers } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'mouse')
    const event = new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 90, clientY: 50 })
    Object.defineProperty(event, 'getCoalescedEvents', { value: () => { throw new Error('unsupported') } })
    document.dispatchEvent(event)
    runFrame()
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }], 7]])
  })

  it.each(['mouse', 'pen'])('cancels a %s contact whose primary release was missed', pointerType => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, pointerType)
    pointer(document, 'pointermove', 1, 90, 50, pointerType)
    expect(frames.size).toBe(1)
    // A secondary button can still be down after the primary release is lost.
    pointer(document, 'pointermove', 1, 100, 60, pointerType, -1, 20, 2)
    pointer(document, 'pointerup', 1, 100, 60, pointerType)
    runFrame()
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    expect(captures.size).toBe(0)
    expect(frames.size).toBe(0)
  })

  it.each(['mouse', 'pen'])('preserves a %s stroke through secondary release and ends once on primary release', pointerType => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, pointerType)
    pointer(document, 'pointermove', 1, 90, 50, pointerType, -1, 10, 3)
    pointer(document, 'pointerup', 1, 140, 90, pointerType, 2, 20, 1)
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    expect(captures).toEqual(new Set([1]))
    pointer(document, 'pointermove', 1, 100, 60, pointerType, -1, 30, 1)
    // The primary release qualifies even while a secondary button remains held.
    pointer(document, 'pointerup', 1, 110, 70, pointerType, 0, 40, 2)
    pointer(document, 'pointerup', 1, 110, 70, pointerType, 0, 50, 0)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }, { x: 40, y: 40 }, { x: 50, y: 50 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    expect(captures.size).toBe(0)
    expect(frames.size).toBe(0)
    pointer(svg, 'pointerdown', 2, 80, 40, pointerType)
    pointer(document, 'pointercancel', 2, 80, 40, pointerType, 2, 60, 1)
    expect(handlers.cancelled.mock.calls).toEqual([[1, 7]])
    expect(handlers.ended).toHaveBeenCalledTimes(1)
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it.each(['mouse', 'pen'])('cancels a %s secondary release with no primary press instead of finishing', pointerType => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, pointerType)
    pointer(document, 'pointerup', 1, 80, 40, pointerType, 2, 10, 0)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    expect(captures.size).toBe(0)
  })

  it.each(['frame', 'release'])('splits a delayed 600-point coalesced %s flush into ordered model-sized batches', flushOn => {
    const { svg, handlers, order } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'pen')
    const points = Array.from({ length: 600 }, (_, index) => ({ clientX: 60 + index % 80, clientY: 30, timeStamp: index + 1 }))
    const last = points.at(-1)!
    const event = new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'pen', buttons: 1, clientX: last.clientX, clientY: last.clientY })
    Object.defineProperties(event, { timeStamp: { value: 600 }, getCoalescedEvents: { value: () => points } })
    document.dispatchEvent(event)
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    if (flushOn === 'frame') runFrame()
    pointer(document, 'pointerup', 1, last.clientX, last.clientY, 'pen', 0, 601)
    expect(handlers.moved.mock.calls.map(([, batch]) => batch.length)).toEqual([256, 256, 88])
    expect(handlers.moved.mock.calls.flatMap(([, batch]) => batch)).toEqual(points.map(point => ({ x: point.clientX - 60, y: 10 })))
    expect(handlers.moved.mock.calls.every(([id, , revision]) => id === 0 && revision === 7)).toBe(true)
    expect(order).toEqual(['start', 'move', 'move', 'move', 'end'])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    expect(handlers.cancelled).not.toHaveBeenCalled()
  })

  it('preserves zero-button touch input before and after native touch adopts it', () => {
    const { svg, handlers } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 100, 0)
    pointer(document, 'pointermove', 1, 90, 50, 'touch', -1, 110, 0)
    touch(svg, 'touchstart', [touchPoint(11, svg, 90, 50)], 120)
    touch(document, 'touchmove', [touchPoint(11, svg, 100, 60)], 130)
    pointer(document, 'pointerup', 1, 100, 60, 'touch', 0, 140, 0)
    expect(handlers.ended).not.toHaveBeenCalled()
    touch(document, 'touchend', [touchPoint(11, svg, 110, 70)], 150)
    expect(handlers.started).toHaveBeenCalledTimes(1)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }, { x: 40, y: 40 }, { x: 50, y: 50 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it('transfers pointer-first native touch without a second stroke or capture-loss cancellation', () => {
    const { svg, handlers, captures } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 100)
    touch(svg, 'touchstart', [touchPoint(11, svg)], 120)
    expect(handlers.started).toHaveBeenCalledTimes(1)
    expect(captures.size).toBe(0)
    expect(handlers.cancelled).not.toHaveBeenCalled()
    pointer(document, 'pointermove', 1, 100, 60, 'touch', 0, 130)
    touch(document, 'touchmove', [touchPoint(11, svg, 100, 60)], 135)
    pointer(document, 'pointerup', 1, 100, 60, 'touch', 0, 140)
    expect(handlers.ended).not.toHaveBeenCalled()
    touch(document, 'touchend', [touchPoint(11, svg, 110, 70)], 150)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 40, y: 40 }, { x: 50, y: 50 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it('pairs native-first touch only once and preserves other simultaneous contacts', () => {
    const { svg, handlers } = fixture()
    touch(svg, 'touchstart', [touchPoint(11, svg)], 100)
    pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 120)
    pointer(svg, 'pointerdown', 2, 80, 40, 'touch', 0, 125)
    expect(handlers.started).toHaveBeenCalledTimes(2)
    pointer(svg, 'lostpointercapture', 1)
    pointer(document, 'pointercancel', 1)
    touch(document, 'touchend', [touchPoint(11, svg)])
    pointer(document, 'pointerup', 2)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.ended.mock.calls).toEqual([[1, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it('keeps pointer-only contacts working after a partial native stream and across later gestures', () => {
    const { svg, handlers } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 100)
    pointer(svg, 'pointerdown', 2, 130, 70, 'touch', 0, 105)
    touch(svg, 'touchstart', [touchPoint(11, svg)], 120)
    pointer(svg, 'pointerdown', 3, 80, 40, 'touch', 0, 300)
    pointer(document, 'pointerup', 2, 140, 80, 'touch', 0, 310)
    touch(document, 'touchend', [touchPoint(11, svg)], 315)
    pointer(document, 'pointerup', 3, 90, 50, 'touch', 0, 320)
    expect(handlers.started).toHaveBeenCalledTimes(3)
    expect(handlers.ended.mock.calls).toEqual([[1, 7], [0, 7], [2, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(3)
  })

  it.each([
    { first: 'pointer', identifier: -1 }, { first: 'native', identifier: -1 },
    { first: 'pointer', identifier: -32768 }, { first: 'native', identifier: -32768 },
    { first: 'pointer', identifier: -Number.MAX_SAFE_INTEGER }, { first: 'native', identifier: -Number.MAX_SAFE_INTEGER },
  ])('pairs a signed native ID $identifier when $first starts first without duplicate completion', ({ first, identifier }) => {
    const { svg, handlers } = fixture()
    if (first === 'pointer') {
      pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 100)
      touch(svg, 'touchstart', [touchPoint(identifier, svg)], 120)
    } else {
      touch(svg, 'touchstart', [touchPoint(identifier, svg)], 100)
      pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 120)
    }
    expect(handlers.started.mock.calls).toEqual([[0, 20, 20, 7]])
    const duplicated = touch(svg, 'touchstart', [touchPoint(identifier, svg)], 125)
    expect(duplicated.defaultPrevented).toBe(false)
    expect(handlers.started).toHaveBeenCalledTimes(1)
    pointer(document, 'pointermove', 1, 90, 50, 'touch', -1, 130)
    touch(document, 'touchmove', [touchPoint(identifier, svg, 90, 50)], 135)
    pointer(document, 'pointerup', 1, 90, 50, 'touch', 0, 140)
    expect(handlers.ended).not.toHaveBeenCalled()
    touch(document, 'touchend', [touchPoint(identifier, svg, 100, 60)], 145)
    touch(document, 'touchend', [touchPoint(identifier, svg, 100, 60)], 150)
    pointer(document, 'pointerup', 1, 100, 60, 'touch', 0, 155)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }, { x: 40, y: 40 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    expect(svg.setPointerCapture).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it.each(['pointer', 'native'])('adopts a moved %s-first contact when the later event retains its original down coordinates', first => {
    const { svg, handlers, order } = fixture()
    if (first === 'pointer') {
      pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 100)
      pointer(document, 'pointermove', 1, 90, 50, 'touch', -1, 110)
      touch(svg, 'touchstart', [touchPoint(-11, svg)], 120)
    } else {
      touch(svg, 'touchstart', [touchPoint(-11, svg)], 100)
      touch(document, 'touchmove', [touchPoint(-11, svg, 90, 50)], 110)
      pointer(svg, 'pointerdown', 1, 80, 40, 'touch', 0, 120)
    }
    expect(handlers.started.mock.calls).toEqual([[0, 20, 20, 7]])
    expect(frames.size).toBe(1)
    expect(handlers.moved).not.toHaveBeenCalled()
    pointer(document, 'pointermove', 1, 100, 60, 'touch', -1, 130)
    touch(document, 'touchmove', [touchPoint(-11, svg, 100, 60)], 135)
    pointer(document, 'pointerup', 1, 100, 60, 'touch', 0, 140)
    expect(handlers.ended).not.toHaveBeenCalled()
    touch(document, 'touchend', [touchPoint(-11, svg, 110, 70)], 150)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }, { x: 40, y: 40 }, { x: 50, y: 50 }], 7]])
    expect(order).toEqual(['start', 'move', 'end'])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    expect(svg.setPointerCapture).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it('keeps signed native contacts independent through document movement, release, cancellation, and later reuse', () => {
    const { svg, handlers } = fixture()
    touch(svg, 'touchstart', [touchPoint(-1, svg), touchPoint(-2, svg, 130, 70)], 100)
    expect(handlers.started.mock.calls).toEqual([[0, 20, 20, 7], [1, 70, 50, 7]])
    touch(document, 'touchmove', [touchPoint(-2, svg, 140, 80), touchPoint(-1, svg, 90, 50)], 110, true)
    runFrame()
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }], 7], [1, [{ x: 80, y: 60 }], 7]])
    touch(document, 'touchmove', [touchPoint(-1, svg, 100, 60), touchPoint(-2, svg, 150, 90)], 120)
    touch(document, 'touchcancel', [touchPoint(-1, svg, 100, 60)], 125)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    touch(document, 'touchend', [touchPoint(-2, svg, 155, 95)], 130)
    touch(document, 'touchend', [touchPoint(-1, svg, 100, 60)], 135)
    expect(handlers.moved.mock.calls).toEqual([
      [0, [{ x: 30, y: 30 }], 7], [1, [{ x: 80, y: 60 }], 7],
      [1, [{ x: 90, y: 70 }, { x: 95, y: 75 }], 7],
    ])
    expect(handlers.ended.mock.calls).toEqual([[1, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(0)
    touch(svg, 'touchstart', [touchPoint(-1, svg)], 200)
    touch(document, 'touchend', [touchPoint(-1, svg, 90, 50)], 210)
    expect(handlers.started.mock.calls[2]).toEqual([2, 20, 20, 7])
    expect(handlers.ended.mock.calls).toEqual([[1, 7], [2, 7]])
    expect(handlers.cancelled).toHaveBeenCalledTimes(1)
    expect(Audio.warmAudio).toHaveBeenCalledTimes(2)
  })

  it.each([NaN, Infinity, -Infinity, 0.5, -0.5, Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1])('ignores malformed native ID %s without blocking a valid signed contact', identifier => {
    const { svg, handlers } = fixture()
    expect(touch(svg, 'touchstart', [touchPoint(identifier, svg)], 100).defaultPrevented).toBe(false)
    expect(handlers.started).not.toHaveBeenCalled()
    touch(svg, 'touchstart', [touchPoint(-1, svg)], 110)
    touch(document, 'touchmove', [touchPoint(identifier, svg, 100, 60)], 120)
    touch(document, 'touchend', [touchPoint(identifier, svg, 100, 60)], 130)
    touch(document, 'touchcancel', [touchPoint(identifier, svg, 100, 60)], 135)
    expect(handlers.started.mock.calls).toEqual([[0, 20, 20, 7]])
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    touch(document, 'touchend', [touchPoint(-1, svg, 90, 50)], 140)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }], 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it('traces multiple native contacts using both noniterable and indexed TouchLists', () => {
    const { svg, handlers } = fixture()
    touch(svg, 'touchstart', [touchPoint(1, svg), touchPoint(2, svg, 130, 70)])
    touch(document, 'touchmove', [touchPoint(2, svg, 140, 80), touchPoint(1, svg, 90, 50)], 20, true)
    runFrame()
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }], 7], [1, [{ x: 80, y: 60 }], 7]])
    touch(document, 'touchend', [touchPoint(2, svg, 140, 80)], 30)
    touch(document, 'touchend', [touchPoint(1, svg, 90, 50)], 35)
    expect(handlers.ended.mock.calls).toEqual([[1, 7], [0, 7]])
  })

  it('does not pair different original targets or later contacts at identical coordinates', () => {
    const { svg, handlers } = fixture()
    const path = document.createElementNS(svg.namespaceURI, 'path')
    svg.append(path)
    touch(svg, 'touchstart', [touchPoint(1, path)], 100)
    pointer(svg, 'pointerdown', 2, 80, 40, 'touch', 0, 110)
    pointer(path, 'pointerdown', 3, 80, 40, 'touch', 0, 180)
    expect(handlers.started).toHaveBeenCalledTimes(3)
  })

  it('rejects secondary buttons, malformed IDs, invalid points, and missing revisions', () => {
    const { svg, handlers } = fixture()
    pointer(svg, 'pointerdown', 1, 80, 40, 'mouse', 2)
    pointer(svg, 'pointerdown', 2, 80, 40, 'pen', 2)
    pointer(svg, 'pointerdown', -1)
    pointer(svg, 'pointerdown', 1.5)
    pointer(svg, 'pointerdown', 3, NaN)
    touch(svg, 'touchstart', [touchPoint(NaN, svg), touchPoint(Infinity, svg), touchPoint(1.5, svg)])
    svg.removeAttribute('data-handwriting-revision')
    pointer(svg, 'pointerdown', 4)
    svg.setAttribute('data-handwriting-revision', 'Infinity')
    pointer(svg, 'pointerdown', 5)
    expect(handlers.started).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('ignores zero or malformed geometry and starts in distant letterboxing', () => {
    const { svg, handlers, setRect } = fixture()
    pointer(svg, 'pointerdown', 1, 30, 40)
    setRect({ left: 10, top: 20, width: 0, height: 100 })
    pointer(svg, 'pointerdown', 2)
    setRect({ left: 10, top: 20, width: Infinity, height: 100 })
    pointer(svg, 'pointerdown', 3)
    setRect({ left: 10, top: 20, width: 200, height: 100 })
    svg.setAttribute('viewBox', '0 0 0 100')
    pointer(svg, 'pointerdown', 4)
    svg.setAttribute('viewBox', '0 0 nope 100')
    pointer(svg, 'pointerdown', 5)
    expect(handlers.started).not.toHaveBeenCalled()
  })

  it('uses current meet geometry after resize and preserves outside movement coordinates', () => {
    const { svg, handlers, setRect } = fixture()
    pointer(svg, 'pointerdown', 1)
    pointer(document, 'pointermove', 1, 220, 0)
    runFrame()
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 160, y: -20 }], 7]])
    setRect({ left: 10, top: 20, width: 100, height: 200 })
    pointer(document, 'pointermove', 1, 30, 90, 'touch', 0, 20)
    runFrame()
    expect(handlers.moved.mock.calls[1]).toEqual([0, [{ x: 20, y: 20 }], 7])
    svg.setAttribute('viewBox', '10 20 100 100')
    pointer(document, 'pointermove', 1, 40, 100, 'touch', 0, 30)
    runFrame()
    expect(handlers.moved.mock.calls[2]).toEqual([0, [{ x: 40, y: 50 }], 7])
  })

  it('inverts usable screen matrices and falls back when the matrix is missing or invalid', () => {
    const { svg, handlers } = fixture()
    const matrix = vi.fn(() => ({ inverse: () => ({ a: 0.5, b: 0, c: 0, d: 0.5, e: -10, f: -5 }) }))
    Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: matrix })
    pointer(svg, 'pointerdown', 1, 80, 40)
    expect(handlers.started.mock.calls[0]).toEqual([0, 30, 15, 7])
    matrix.mockImplementation(() => { throw new Error('detached') })
    pointer(svg, 'pointerdown', 2)
    expect(handlers.started.mock.calls[1]).toEqual([1, 20, 20, 7])
    matrix.mockImplementation(() => ({ inverse: () => ({ a: NaN, b: 0, c: 0, d: 0, e: 0, f: 0 }) }))
    pointer(svg, 'pointerdown', 3)
    expect(handlers.started.mock.calls[2]).toEqual([2, 20, 20, 7])
    matrix.mockImplementation(() => ({ inverse: () => ({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }) }))
    pointer(svg, 'pointerdown', 4)
    expect(handlers.started.mock.calls[3]).toEqual([3, 20, 20, 7])
  })

  it('supports none and explicitly aligned slice fallback when CTM is absent', () => {
    const { svg, handlers } = fixture()
    svg.setAttribute('preserveAspectRatio', 'none')
    pointer(svg, 'pointerdown', 1, 80, 40)
    expect(handlers.started.mock.calls[0]).toEqual([0, 35, 20, 7])
    svg.setAttribute('preserveAspectRatio', 'xMaxYMax slice')
    pointer(svg, 'pointerdown', 2, 80, 40)
    expect(handlers.started.mock.calls[1]).toEqual([1, 35, 60, 7])
  })

  it('discards queued points on pointercancel, touchcancel, and unrelated capture loss', () => {
    const { svg, handlers } = fixture()
    pointer(svg, 'pointerdown', 1)
    pointer(document, 'pointermove', 1, 90, 50)
    pointer(document, 'pointercancel', 1)
    touch(svg, 'touchstart', [touchPoint(2, svg)])
    touch(document, 'touchmove', [touchPoint(2, svg, 90, 50)])
    touch(document, 'touchcancel', [touchPoint(2, svg)])
    pointer(svg, 'pointerdown', 3, 80, 40, 'pen')
    pointer(svg, 'lostpointercapture', 3)
    pointer(document, 'pointerup', 1)
    touch(document, 'touchend', [touchPoint(2, svg)])
    runFrame()
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7], [1, 7], [2, 7]])
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('observes revision changes and rejects old events before the observer callback', async () => {
    const { svg, handlers } = fixture()
    pointer(svg, 'pointerdown', 1)
    pointer(document, 'pointermove', 1, 90, 50)
    touch(svg, 'touchstart', [touchPoint(2, svg, 130, 70)])
    svg.setAttribute('data-handwriting-revision', '8')
    await vi.waitFor(() => { expect(handlers.cancelled).toHaveBeenCalledTimes(2) })
    runFrame()
    pointer(document, 'pointerup', 1)
    touch(document, 'touchend', [touchPoint(2, svg, 130, 70)])
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(handlers.ended).not.toHaveBeenCalled()
    pointer(svg, 'pointerdown', 3)
    svg.setAttribute('data-handwriting-revision', '9')
    pointer(document, 'pointerup', 3)
    expect(handlers.cancelled.mock.calls).toEqual(expect.arrayContaining([[0, 7], [1, 7], [2, 8]]))
    expect(handlers.cancelled).toHaveBeenCalledTimes(3)
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('cancels on blur and hidden visibility without stale release feedback', () => {
    const { svg, handlers } = fixture()
    pointer(svg, 'pointerdown', 1)
    window.dispatchEvent(new Event('blur'))
    pointer(document, 'pointerup', 1)
    touch(svg, 'touchstart', [touchPoint(2, svg)])
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    touch(document, 'touchend', [touchPoint(2, svg)])
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7], [1, 7]])
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('keeps document release fallback and synchronous movement when capture and RAF are missing', () => {
    const { svg, handlers } = fixture()
    svg.setPointerCapture = () => { throw new Error('capture unavailable') }
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => { throw new Error('RAF unavailable') })
    pointer(svg, 'pointerdown', 1, 80, 40, 'mouse')
    pointer(document, 'pointermove', 1, 90, 50)
    expect(handlers.moved.mock.calls).toEqual([[0, [{ x: 30, y: 30 }], 7]])
    vi.mocked(Audio.warmAudio).mockImplementation(() => { throw new Error('audio unavailable') })
    pointer(document, 'pointerup', 1, 100, 60)
    expect(handlers.ended.mock.calls).toEqual([[0, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
  })

  it('prevents board keyboard scrolling and warms only tracing keys while leaving Tab native', () => {
    const { svg, handlers, cleanup } = fixture()
    for (const name of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ']) expect(key(svg, name).defaultPrevented).toBe(true)
    expect(key(svg, 'Tab').defaultPrevented).toBe(false)
    expect(key(svg, 'a').defaultPrevented).toBe(false)
    expect(Audio.warmAudio).toHaveBeenCalledTimes(6)
    expect(handlers.started).not.toHaveBeenCalled()
    cleanup()
    expect(key(svg, 'ArrowUp').defaultPrevented).toBe(false)
    expect(Audio.warmAudio).toHaveBeenCalledTimes(6)
  })

  it('owns every listener, animation, observer, and capture through idempotent cleanup', () => {
    const addDocument = vi.spyOn(document, 'addEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const addWindow = vi.spyOn(window, 'addEventListener')
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { svg, handlers, cleanup, captures } = fixture()
    const removeSvg = vi.spyOn(svg, 'removeEventListener')
    pointer(svg, 'pointerdown', 1)
    pointer(document, 'pointermove', 1, 90, 50)
    touch(svg, 'touchstart', [touchPoint(2, svg, 130, 70)])
    expect(frames.size).toBe(1)
    cleanup()
    cleanup()
    expect(captures.size).toBe(0)
    expect(frames.size).toBe(0)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7], [1, 7]])
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledWith(svg, expect.objectContaining({ attributeFilter: ['data-handwriting-revision', 'viewBox', 'preserveAspectRatio'] }))
    for (const [name, handler] of addDocument.mock.calls.filter(([name]) => ['pointermove', 'pointerup', 'pointercancel', 'touchmove', 'touchend', 'touchcancel', 'visibilitychange'].includes(name))) {
      expect(removeDocument.mock.calls.some(([removedName, removedHandler]) => removedName === name && removedHandler === handler)).toBe(true)
    }
    const blurHandler = addWindow.mock.calls.find(([name]) => name === 'blur')?.[1]
    expect(removeWindow).toHaveBeenCalledWith('blur', blurHandler)
    expect(removeSvg.mock.calls.map(([name]) => name)).toEqual(['pointerdown', 'lostpointercapture', 'touchstart', 'keydown'])
    pointer(svg, 'pointerdown', 3)
    pointer(document, 'pointerup', 1)
    touch(document, 'touchend', [touchPoint(2, svg, 130, 70)])
    svg.setAttribute('data-handwriting-revision', '8')
    runFrame()
    expect(handlers.started).toHaveBeenCalledTimes(2)
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })
})
