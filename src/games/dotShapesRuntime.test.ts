import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as Audio from '../audio'
import { createDotShapesRuntime, type DotShapesHandlers } from './dotShapesRuntime'

let time = 0
let frames: Map<number, FrameRequestCallback>
let cleanups: Array<() => void>
beforeEach(() => {
  time = 0
  frames = new Map()
  cleanups = []
  let frameId = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++frameId, callback); return frameId })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
})
afterEach(() => {
  cleanups.forEach(cleanup => cleanup())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
const pointer = (target: EventTarget, type: string, id = 1, x = 110, y = 90, pointerType = 'touch', stamp = time, button = 0,
  buttons = type === 'pointerdown' || type === 'pointermove' ? 1 : 0): PointerEvent => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y, button, buttons })
  Object.defineProperty(event, 'timeStamp', { value: stamp })
  target.dispatchEvent(event)
  return event
}
const point = (identifier: number, target: EventTarget, x = 110, y = 90) => ({ identifier, target, clientX: x, clientY: y })
const touch = (target: EventTarget, type: string, points: ReadonlyArray<ReturnType<typeof point>>, stamp = time, indexed = false): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    changedTouches: { value: indexed ? points : { length: points.length, item: (index: number) => points[index] ?? null } },
    timeStamp: { value: stamp },
  })
  target.dispatchEvent(event)
  return event
}
const click = (target: EventTarget, detail = 1, x = 110, y = 90): MouseEvent => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail, clientX: x, clientY: y })
  target.dispatchEvent(event)
  return event
}
const key = (target: EventTarget, name: string, shiftKey = false, repeat = false): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: name, shiftKey, repeat })
  target.dispatchEvent(event)
  return event
}
const runFrame = (): void => {
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach(callback => callback(time))
}
const fixture = () => {
  const board = document.createElement('div')
  board.dataset.dotShapesRevision = '7'
  board.setAttribute('tabindex', '0')
  const dot = document.createElement('button')
  dot.dataset.dotShapesId = '23'
  const child = document.createElement('span')
  dot.append(child)
  board.append(dot)
  document.body.append(board)
  let rect = new DOMRect(10, 20, 200, 140)
  vi.spyOn(board, 'getBoundingClientRect').mockImplementation(() => rect)
  const captures = new Set<number>()
  board.setPointerCapture = vi.fn(id => { captures.add(id) })
  board.hasPointerCapture = vi.fn(id => captures.has(id))
  board.releasePointerCapture = vi.fn(id => { captures.delete(id); pointer(board, 'lostpointercapture', id) })
  const order: string[] = []
  const handlers = {
    started: vi.fn<DotShapesHandlers['started']>(() => { order.push('start') }),
    moved: vi.fn<DotShapesHandlers['moved']>(() => { order.push('move') }),
    ended: vi.fn<DotShapesHandlers['ended']>(() => { order.push('end') }),
    cancelled: vi.fn<DotShapesHandlers['cancelled']>(() => { order.push('cancel') }),
    keyboard: vi.fn<DotShapesHandlers['keyboard']>(() => { order.push('key') }),
  }
  const cleanup = createDotShapesRuntime(board, handlers)
  cleanups.push(cleanup)
  return { board, dot, child, captures, handlers, cleanup, order, setRect: (next: DOMRect) => { rect = next } }
}

describe('Dot Shapes board input', () => {
  it.each(['touch', 'native', 'mouse', 'pen'])('starts and focuses a %s contact without warming audio on down', input => {
    const { board, dot, child, handlers, captures } = fixture()
    const focus = vi.spyOn(dot, 'focus')
    if (input === 'native') touch(board, 'touchstart', [point(-12, child)])
    else pointer(child, 'pointerdown', 1, 110, 90, input)
    expect(handlers.started.mock.calls).toEqual([[0, 500, 350, 23, 7]])
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(document.activeElement).toBe(dot)
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    if (input === 'mouse' || input === 'pen') expect(captures.has(1)).toBe(true)
    else expect(board.setPointerCapture).not.toHaveBeenCalled()
  })

  it('batches latest movement and flushes the fresh release point before committing', () => {
    const { board, handlers, order } = fixture()
    pointer(board, 'pointerdown')
    pointer(document, 'pointermove', 1, 120, 100)
    pointer(document, 'pointermove', 1, 130, 110)
    expect(handlers.moved).not.toHaveBeenCalled()
    runFrame()
    expect(handlers.moved.mock.calls).toEqual([[0, 600, 450, 7]])
    pointer(document, 'pointermove', 1, 140, 120)
    pointer(document, 'pointerup', 1, 150, 104)
    expect(handlers.moved.mock.calls[1]).toEqual([0, 700, 420, 7])
    expect(handlers.ended.mock.calls).toEqual([[0, 700, 420, true, 7]])
    expect(order).toEqual(['start', 'move', 'move', 'end'])
    expect(frames.size).toBe(0)
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it('distinguishes a tap from a blank-board drag using client-pixel movement, including out-and-back drags', () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown', 1)
    pointer(document, 'pointerup', 1, 118, 90)
    expect(handlers.ended.mock.calls[0]).toEqual([0, 540, 350, false, 7])
    pointer(board, 'pointerdown', 2)
    pointer(document, 'pointermove', 2, 119, 90)
    pointer(document, 'pointerup', 2, 110, 90)
    expect(handlers.ended.mock.calls[1]).toEqual([1, 500, 350, true, 7])
  })

  it.each([false, true])('supports independent signed native touches with indexed=%s', indexed => {
    const { board, dot, handlers } = fixture()
    touch(board, 'touchstart', [point(-Number.MAX_SAFE_INTEGER, dot), point(9, board, 50, 60)], 0, indexed)
    touch(document, 'touchmove', [point(-Number.MAX_SAFE_INTEGER, dot, 120, 100), point(9, board, 60, 70)], 1, indexed)
    runFrame()
    expect(handlers.started.mock.calls).toEqual([[0, 500, 350, 23, 7], [1, 200, 200, null, 7]])
    expect(handlers.moved.mock.calls).toEqual([[0, 550, 400, 7], [1, 250, 250, 7]])
    touch(document, 'touchend', [point(-Number.MAX_SAFE_INTEGER, dot, 125, 105)], 2, indexed)
    touch(document, 'touchcancel', [point(9, board, 60, 70)], 3, indexed)
    expect(handlers.ended.mock.calls).toEqual([[0, 575, 425, true, 7]])
    expect(handlers.cancelled.mock.calls).toEqual([[1, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    touch(board, 'touchstart', [point(-Number.MAX_SAFE_INTEGER, dot)], 4, indexed)
    expect(handlers.started.mock.calls[2]?.[0]).toBe(2)
  })

  it.each(['pointer-first', 'native-first'])('pairs %s streams even after movement and a delayed start at the original point', order => {
    const { board, dot, child, handlers } = fixture()
    if (order === 'pointer-first') {
      pointer(child, 'pointerdown', 1, 110, 90, 'touch', 0)
      pointer(document, 'pointermove', 1, 125, 105, 'touch', 2)
      touch(board, 'touchstart', [point(-24, dot)], 4)
    } else {
      touch(board, 'touchstart', [point(-24, child)], 0)
      touch(document, 'touchmove', [point(-24, child, 125, 105)], 2)
      pointer(dot, 'pointerdown', 1, 110, 90, 'touch', 4)
    }
    pointer(document, 'pointermove', 1, 200, 150, 'touch', 5)
    touch(document, 'touchmove', [point(-24, dot, 130, 110)], 6)
    pointer(board, 'lostpointercapture', 1, 130, 110, 'touch', 7)
    pointer(document, 'pointerup', 1, 130, 110, 'touch', 8)
    touch(document, 'touchend', [point(-24, dot, 135, 115)], 9)
    expect(handlers.started).toHaveBeenCalledTimes(1)
    expect(handlers.moved.mock.calls).toEqual([[0, 625, 475, 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 625, 475, true, 7]])
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it('allows one pointer/native pair per finger while preserving coincident independent fingers', () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown', 1)
    pointer(board, 'pointerdown', 2)
    touch(board, 'touchstart', [point(-1, board), point(-2, board)], 1)
    expect(handlers.started).toHaveBeenCalledTimes(2)
    touch(document, 'touchend', [point(-1, board), point(-2, board)], 2)
    expect(handlers.ended).toHaveBeenCalledTimes(2)
    pointer(document, 'pointerup', 1); pointer(document, 'pointerup', 2)
    expect(handlers.ended).toHaveBeenCalledTimes(2)
  })

  it.each(['pointer-first', 'native-first'])('caps contacts at 32, preserves %s adoption at capacity, and reuses a released slot', order => {
    const { board, handlers } = fixture()
    if (order === 'pointer-first') {
      for (let index = 0; index < 32; index++) pointer(board, 'pointerdown', index + 1, 30 + index * 5, 60)
    } else {
      touch(board, 'touchstart', Array.from({ length: 32 }, (_, index) => point(-index - 1, board, 30 + index * 5, 60)))
    }
    pointer(board, 'pointerdown', 100, 110, 130)
    touch(board, 'touchstart', [point(-100, board, 110, 130)])
    expect(handlers.started).toHaveBeenCalledTimes(32)
    if (order === 'pointer-first') touch(board, 'touchstart', [point(-1, board, 30, 60)], 1)
    else pointer(board, 'pointerdown', 1, 30, 60, 'touch', 1)
    expect(handlers.started).toHaveBeenCalledTimes(32)
    touch(document, 'touchend', [point(-1, board, 30, 60)], 2)
    pointer(document, 'pointerup', 1, 30, 60, 'touch', 3)
    expect(handlers.ended.mock.calls).toEqual([[0, 100, 200, false, 7]])
    touch(board, 'touchstart', [point(-1, board, 110, 130)], 4)
    expect(handlers.started).toHaveBeenCalledTimes(33)
    expect(handlers.started.mock.calls[32]).toEqual([32, 500, 550, null, 7])
  })

  it('keeps distant or late native starts independent of existing pointer contacts', () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown', 1)
    touch(board, 'touchstart', [point(-1, board, 115, 90)], 0)
    touch(board, 'touchstart', [point(-2, board)], 41)
    expect(handlers.started).toHaveBeenCalledTimes(3)
  })

  it('continues an unpaired finger stream after lost capture and zero-buttons movement', () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown')
    pointer(board, 'lostpointercapture')
    pointer(document, 'pointermove', 1, 130, 110, 'touch', 1, 0, 0)
    pointer(document, 'pointerup', 1, 140, 120, 'touch', 2)
    expect(handlers.cancelled).not.toHaveBeenCalled()
    expect(handlers.ended.mock.calls).toEqual([[0, 650, 500, true, 7]])
  })

  it.each(['pointercancel', 'touchcancel'])('discards pending movement on %s and suppresses its ghost click', cancellation => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown')
    touch(board, 'touchstart', [point(-1, board)], 1)
    touch(document, 'touchmove', [point(-1, board, 130, 110)], 2)
    if (cancellation === 'pointercancel') pointer(document, cancellation, 1, 130, 110, 'touch', 3)
    else touch(document, cancellation, [point(-1, board, 130, 110)], 3)
    runFrame(); click(board)
    expect(handlers.started).toHaveBeenCalledTimes(1)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it.each(['lostpointercapture', 'released-buttons'])('cancels mouse drawing on %s', cause => {
    const { board, handlers, captures } = fixture()
    pointer(board, 'pointerdown', 1, 110, 90, 'mouse')
    if (cause === 'lostpointercapture') pointer(board, cause, 1, 110, 90, 'mouse')
    else pointer(document, 'pointermove', 1, 130, 110, 'mouse', 1, 0, 0)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(captures.size).toBe(0)
  })

  it('waits for the primary mouse button release and rejects unsupported buttons', () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown', 1, 110, 90, 'mouse', 0, 2)
    expect(handlers.started).not.toHaveBeenCalled()
    pointer(board, 'pointerdown', 1, 110, 90, 'mouse')
    pointer(document, 'pointerup', 1, 110, 90, 'mouse', 1, 2, 1)
    expect(handlers.ended).not.toHaveBeenCalled()
    pointer(document, 'pointerup', 1, 110, 90, 'mouse', 2)
    expect(handlers.ended).toHaveBeenCalledTimes(1)
  })

  it('uses document movement when capture fails and synchronous movement when RAF fails', () => {
    const { board, handlers } = fixture()
    vi.mocked(board.setPointerCapture).mockImplementation(() => { throw new Error('capture unavailable') })
    vi.mocked(window.requestAnimationFrame).mockImplementation(() => { throw new Error('RAF unavailable') })
    expect(() => pointer(board, 'pointerdown', 1, 110, 90, 'pen')).not.toThrow()
    pointer(document, 'pointermove', 1, 120, 100, 'pen', 1)
    expect(handlers.moved.mock.calls).toEqual([[0, 550, 400, 7]])
    pointer(document, 'pointerup', 1, 130, 110, 'pen', 2)
    expect(handlers.ended.mock.calls).toEqual([[0, 600, 450, true, 7]])
  })

  it('uses fresh scaled inner geometry, accounting for borders, and clamps an outside release', () => {
    const { board, handlers, setRect } = fixture()
    Object.defineProperties(board, {
      clientWidth: { configurable: true, value: 200 }, clientHeight: { configurable: true, value: 140 },
      offsetWidth: { configurable: true, value: 220 }, offsetHeight: { configurable: true, value: 160 },
      clientLeft: { configurable: true, value: 10 }, clientTop: { configurable: true, value: 10 },
    })
    setRect(new DOMRect(10, 20, 440, 320))
    pointer(board, 'pointerdown', 1, 230, 180)
    expect(handlers.started.mock.calls).toEqual([[0, 500, 350, null, 7]])
    setRect(new DOMRect(20, 30, 220, 160))
    pointer(document, 'pointermove', 1, 140, 120, 'touch', 1)
    runFrame()
    expect(handlers.moved.mock.calls).toEqual([[0, 550, 400, 7]])
    pointer(document, 'pointerup', 1, 300, -100, 'touch', 2)
    expect(handlers.ended.mock.calls).toEqual([[0, 1000, 0, true, 7]])
  })

  it.each([new DOMRect(0, 0, 0, 100), new DOMRect(NaN, 0, 100, 100), new DOMRect(0, 0, Infinity, 100)])('ignores invalid geometry %#', geometry => {
    const { board, handlers, setRect } = fixture()
    setRect(geometry)
    pointer(board, 'pointerdown')
    touch(board, 'touchstart', [point(-1, board)])
    click(board)
    expect(handlers.started).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('rejects malformed IDs, targets, revisions, coordinates, and out-of-board starts', () => {
    const { board, dot, handlers } = fixture()
    pointer(board, 'pointerdown', -1)
    pointer(board, 'pointerdown', 0.5)
    pointer(board, 'pointerdown', 1, 500, 500)
    pointer(board, 'pointerdown', 1, NaN, 90)
    touch(board, 'touchstart', [point(NaN, board), point(0.5, board), point(1, document.body)])
    dot.dataset.dotShapesId = '-1'; pointer(dot, 'pointerdown')
    dot.dataset.dotShapesId = '23'; dot.disabled = true; pointer(dot, 'pointerdown'); dot.disabled = false
    board.dataset.dotShapesRevision = ''; pointer(board, 'pointerdown')
    board.dataset.dotShapesRevision = '-1'; touch(board, 'touchstart', [point(-1, board)])
    board.dataset.dotShapesRevision = '7'; board.setAttribute('inert', ''); pointer(board, 'pointerdown')
    expect(handlers.started).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
  })

  it('ignores stale movement timestamps and cancels an unusable final point', () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown', 1, 110, 90, 'touch', 5)
    pointer(document, 'pointermove', 1, 130, 110, 'touch', 4)
    expect(frames.size).toBe(0)
    pointer(document, 'pointerup', 1, Infinity, 110, 'touch', 6)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.ended).not.toHaveBeenCalled()
  })

  it('invalidates contacts immediately on the next event and through the revision observer', async () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown', 1)
    pointer(document, 'pointermove', 1, 130, 110)
    board.dataset.dotShapesRevision = '8'
    pointer(document, 'pointerup', 1, 140, 120)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.moved).not.toHaveBeenCalled()
    expect(handlers.ended).not.toHaveBeenCalled()
    pointer(board, 'pointerdown', 2)
    board.dataset.dotShapesRevision = '9'
    await vi.waitFor(() => { expect(handlers.cancelled.mock.calls).toEqual([[0, 7], [1, 8]]) })
    expect(frames.size).toBe(0)
  })

  it.each(['blur', 'hidden', 'detached'])('cancels all independent contacts when %s', cause => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown', 1)
    touch(board, 'touchstart', [point(-2, board, 50, 60)], 1)
    if (cause === 'blur') window.dispatchEvent(new Event('blur'))
    else if (cause === 'hidden') { vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')) }
    else { board.remove(); pointer(document, 'pointermove', 1) }
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7], [1, 7]])
  })

  it('supports rapid click-only placement without pointer APIs', () => {
    const { board, dot, handlers, order } = fixture()
    click(board); click(board, 1, 130, 110); click(dot, 1, 150, 130)
    expect(handlers.started.mock.calls).toEqual([[0, 500, 350, null, 7], [1, 600, 450, null, 7], [2, 700, 550, 23, 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 500, 350, false, 7], [1, 600, 450, false, 7], [2, 700, 550, false, 7]])
    expect(order).toEqual(['start', 'end', 'start', 'end', 'start', 'end'])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(3)
  })

  it('suppresses pointer/native compatibility clicks, including active contacts and canceled contacts', () => {
    const { board, handlers } = fixture()
    pointer(board, 'pointerdown')
    click(board)
    pointer(document, 'pointerup')
    click(board); click(board, 0)
    expect(handlers.started).toHaveBeenCalledTimes(1)
    expect(handlers.ended).toHaveBeenCalledTimes(1)
    expect(handlers.keyboard).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it.each(['mouse', 'pen'])('suppresses a captured %s dot release click retargeted to the board', input => {
    const { board, dot, handlers } = fixture()
    pointer(dot, 'pointerdown', 1, 110, 90, input)
    pointer(board, 'pointerup', 1, 125, 100, input, 1)
    expect(click(board, 1, 125, 100).defaultPrevented).toBe(true)
    expect(handlers.started.mock.calls).toEqual([[0, 500, 350, 23, 7]])
    expect(handlers.ended.mock.calls).toEqual([[0, 575, 400, true, 7]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    // A new contact still works immediately after the original release.
    pointer(board, 'pointerdown', 2, 160, 130, input, 2)
    pointer(board, 'pointerup', 2, 160, 130, input, 3)
    expect(handlers.started).toHaveBeenCalledTimes(2)
    expect(handlers.ended).toHaveBeenCalledTimes(2)
  })

  it('suppresses a removed dot touch click retargeted to the board while retaining assistive activation', () => {
    const { board, dot, handlers } = fixture()
    pointer(dot, 'pointerdown')
    touch(board, 'touchstart', [point(-1, dot)], 1)
    dot.remove()
    board.dataset.dotShapesRevision = '8'
    touch(document, 'touchend', [point(-1, dot)], 2)
    click(board)
    expect(handlers.started).toHaveBeenCalledTimes(1)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7]])
    expect(handlers.ended).not.toHaveBeenCalled()
    expect(Audio.warmAudio).not.toHaveBeenCalled()
    click(board, 0)
    expect(handlers.keyboard.mock.calls).toEqual([['Enter', null, false, 8]])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
  })

  it('routes assistive activation to the current keyboard cursor or focused dot', () => {
    const { board, child, handlers } = fixture()
    click(board, 0); click(child, 0)
    expect(handlers.keyboard.mock.calls).toEqual([['Enter', null, false, 7], ['Enter', 23, false, 7]])
    expect(handlers.started).not.toHaveBeenCalled()
  })

  it('handles keyboard directions and actions, suppresses activation repeats, and dedupes generated clicks', () => {
    const { board, dot, child, handlers } = fixture()
    expect(key(child, 'ArrowLeft', true).defaultPrevented).toBe(true)
    key(dot, 'Enter'); key(dot, 'Enter', false, true); click(dot, 0)
    key(board, ' '); key(board, ' ', false, true); click(board, 0)
    key(board, 'Backspace'); key(board, 'Escape'); key(board, 'x')
    expect(handlers.keyboard.mock.calls).toEqual([
      ['ArrowLeft', 23, true, 7], ['Enter', 23, false, 7], [' ', null, false, 7], ['Backspace', null, false, 7], ['Escape', null, false, 7],
    ])
    expect(handlers.started).not.toHaveBeenCalled()
    expect(Audio.warmAudio).toHaveBeenCalledTimes(5)
  })

  it('keeps keyboard placement available after Undo removes the focused dot', () => {
    const { board, dot, handlers } = fixture()
    handlers.keyboard.mockImplementation(name => {
      if (name === 'Backspace') {
        dot.remove()
        board.dataset.dotShapesRevision = '8'
      }
    })
    dot.focus()
    expect(document.activeElement).toBe(dot)
    expect(key(dot, 'Backspace').defaultPrevented).toBe(true)
    expect(dot.isConnected).toBe(false)
    expect(document.activeElement).toBe(board)
    key(document.activeElement!, 'ArrowRight')
    key(document.activeElement!, 'Enter')
    expect(handlers.keyboard.mock.calls).toEqual([
      ['Backspace', 23, false, 7], ['ArrowRight', null, false, 8], ['Enter', null, false, 8],
    ])
    expect(Audio.warmAudio).toHaveBeenCalledTimes(3)
  })

  it('releases listeners, captures, pending frames, observer, and contacts on repeated cleanup', () => {
    const docRemove = vi.spyOn(document, 'removeEventListener')
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { board, handlers, captures, cleanup } = fixture()
    pointer(board, 'pointerdown', 1, 110, 90, 'mouse')
    touch(board, 'touchstart', [point(-2, board, 50, 60)], 1)
    pointer(document, 'pointermove', 1, 130, 110, 'mouse', 2)
    expect(frames.size).toBe(1)
    cleanup(); cleanup()
    expect(captures.size).toBe(0)
    expect(frames.size).toBe(0)
    expect(handlers.cancelled.mock.calls).toEqual([[0, 7], [1, 7]])
    expect(disconnect).toHaveBeenCalledTimes(1)
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'touchmove', 'touchend', 'touchcancel']) {
      expect(docRemove).toHaveBeenCalledWith(type, expect.any(Function), true)
    }
    pointer(board, 'pointerdown', 3); click(board, 0); key(board, 'Enter'); runFrame()
    expect(handlers.started).toHaveBeenCalledTimes(2)
    expect(handlers.keyboard).not.toHaveBeenCalled()
    expect(handlers.moved).not.toHaveBeenCalled()
  })
})
