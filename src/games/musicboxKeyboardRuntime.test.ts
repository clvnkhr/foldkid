import { Effect, Fiber, Stream } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPianoPointerRuntime } from './musicboxKeyboardRuntime'

type NoteMessage = { type: 'on' | 'off'; pitch: string }
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const pointer = (target: EventTarget, type: string, id: number, x = 10, y = 10, pointerType = 'pen', timeStamp?: number): void => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y })
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}
const touch = (target: EventTarget, type: string, contacts: ReadonlyArray<{ identifier: number; clientX: number; clientY: number }>, nativeList = false, timeStamp?: number): void => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'changedTouches', { value: nativeList ? { length: contacts.length, item: (index: number) => contacts[index] ?? null } : contacts })
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}
const keyboard = () => {
  const element = document.createElement('div')
  const c = document.createElement('div')
  const d = document.createElement('div')
  c.dataset.pitch = 'C4'
  d.dataset.pitch = 'D4'
  element.append(c, d)
  document.body.append(element)
  element.setPointerCapture = vi.fn()
  element.hasPointerCapture = () => true
  element.releasePointerCapture = vi.fn()
  return { element, c, d }
}

const originalElementsFromPoint = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint')
beforeEach(() => Object.defineProperty(document, 'elementsFromPoint', { configurable: true, writable: true, value: () => [] }))
afterEach(() => {
  vi.restoreAllMocks()
  if (originalElementsFromPoint) Object.defineProperty(document, 'elementsFromPoint', originalElementsFromPoint)
  else delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint
})

describe('piano multitouch runtime', () => {
  it('ignores secondary mouse and pen buttons', async () => {
    const { element, c } = keyboard()
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([c])
    const messages: NoteMessage[] = []
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote: vi.fn() })
    const fiber = Effect.runFork(Stream.runForEach(mount(element), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      for (const pointerType of ['mouse', 'pen']) {
        c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, pointerType, pointerId: 1, clientX: 10, clientY: 10 }))
        pointer(document, 'pointerup', 1)
      }
      await tick()
      expect(messages).toEqual([])
      expect(element.setPointerCapture).not.toHaveBeenCalled()
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)); element.remove() }
  })

  it('holds a pitch until its last finger releases and ignores unrelated contacts', async () => {
    const { element, c, d } = keyboard()
    vi.spyOn(document, 'elementsFromPoint').mockImplementation(x => x < 50 ? [c] : [d])
    const messages: NoteMessage[] = []
    const stopNote = vi.fn()
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote })
    const fiber = Effect.runFork(Stream.runForEach(mount(element), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      expect(typeof TouchEvent).toBe('function')
      pointer(c, 'pointerdown', 1, 10, 10, 'touch')
      pointer(c, 'pointerdown', 2, 10, 10, 'touch')
      pointer(document, 'pointermove', 3, 60)
      pointer(document, 'pointerup', 3)
      await tick()
      expect(messages).toEqual([{ type: 'on', pitch: 'C4' }])

      pointer(document, 'pointerup', 1)
      await tick()
      expect(messages).toHaveLength(1)

      pointer(document, 'pointercancel', 2)
      await tick()
      expect(messages).toEqual([{ type: 'on', pitch: 'C4' }, { type: 'off', pitch: 'C4' }])
      expect(stopNote).not.toHaveBeenCalled()
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      element.remove()
    }
  })

  it('slides each finger independently and releases outside the keyboard without capture', async () => {
    const { element, c, d } = keyboard()
    element.setPointerCapture = () => { throw new Error('unsupported capture') }
    vi.spyOn(document, 'elementsFromPoint').mockImplementation((x, y) => y > 100 ? [] : x < 50 ? [c] : [d])
    const messages: NoteMessage[] = []
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote: vi.fn() })
    const fiber = Effect.runFork(Stream.runForEach(mount(element), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      pointer(c, 'pointerdown', 1)
      pointer(d, 'pointerdown', 2, 60)
      pointer(document, 'pointermove', 1, 60)
      pointer(document, 'pointerup', 2, 60)
      pointer(document, 'pointermove', 1, 60, 200)
      pointer(document, 'pointermove', 1)
      pointer(document, 'pointerup', 1)
      await tick()
      expect(messages).toEqual([
        { type: 'on', pitch: 'C4' }, { type: 'on', pitch: 'D4' },
        { type: 'off', pitch: 'C4' }, { type: 'off', pitch: 'D4' },
        { type: 'on', pitch: 'C4' }, { type: 'off', pitch: 'C4' },
      ])
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      element.remove()
    }
  })

  it('shares held pitches between keyboards and releases captures and notes on unmount', async () => {
    const top = keyboard()
    const bottom = keyboard()
    vi.spyOn(document, 'elementsFromPoint').mockImplementation(x => [x < 50 ? top.c : bottom.c])
    const messages: NoteMessage[] = []
    const stopNote = vi.fn()
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote })
    const topFiber = Effect.runFork(Stream.runForEach(mount(top.element), message => Effect.sync(() => { messages.push(message) })))
    const bottomFiber = Effect.runFork(Stream.runForEach(mount(bottom.element), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      pointer(top.c, 'pointerdown', 1)
      pointer(bottom.c, 'pointerdown', 2, 60)
      await tick()
      expect(messages).toEqual([{ type: 'on', pitch: 'C4' }])
      await Effect.runPromise(Fiber.interrupt(topFiber))
      expect(stopNote).not.toHaveBeenCalled()
      expect(top.element.releasePointerCapture).toHaveBeenCalledWith(1)
      await Effect.runPromise(Fiber.interrupt(bottomFiber))
      expect(stopNote).toHaveBeenCalledExactlyOnceWith('C4')
      pointer(top.c, 'pointerdown', 3)
      pointer(document, 'pointerup', 3)
      await tick()
      expect(messages).toHaveLength(1)
    } finally {
      await Effect.runPromise(Fiber.interrupt(topFiber))
      await Effect.runPromise(Fiber.interrupt(bottomFiber))
      top.element.remove()
      bottom.element.remove()
    }
  })

  it('uses every changed touch on WebKit without duplicating pointer events', async () => {
    const { element, c, d } = keyboard()
    vi.spyOn(document, 'elementsFromPoint').mockImplementation(x => x < 50 ? [c] : [d])
    const messages: NoteMessage[] = []
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote: vi.fn() })
    const fiber = Effect.runFork(Stream.runForEach(mount(element), message => Effect.sync(() => { messages.push(message) })))
    const first = { identifier: 1, clientX: 10, clientY: 10 }
    const second = { identifier: 2, clientX: 10, clientY: 10 }
    try {
      await tick()
      pointer(c, 'pointerdown', 1, 10, 10, 'touch')
      touch(c, 'touchstart', [first, second])
      touch(document, 'touchmove', [{ ...second, clientX: 60 }])
      pointer(document, 'pointerup', 1, 10, 10, 'touch')
      touch(document, 'touchend', [first])
      touch(document, 'touchcancel', [{ ...second, clientX: 60 }])
      await tick()
      expect(messages).toEqual([
        { type: 'on', pitch: 'C4' }, { type: 'on', pitch: 'D4' },
        { type: 'off', pitch: 'C4' }, { type: 'off', pitch: 'D4' },
      ])
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      element.remove()
    }
  })

  it('pairs a native-first touch with one pointer and honors cancellation in either stream', async () => {
    const { element, c } = keyboard()
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([c])
    const messages: NoteMessage[] = []
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote: vi.fn() })
    const fiber = Effect.runFork(Stream.runForEach(mount(element), message => Effect.sync(() => { messages.push(message) })))
    const first = { identifier: 11, clientX: 10, clientY: 10 }
    try {
      await tick()
      touch(c, 'touchstart', [first], true, 100)
      pointer(c, 'pointerdown', 1, 10, 10, 'touch', 120)
      pointer(element, 'lostpointercapture', 1)
      // A separate finger at the same position remains its own owner.
      pointer(c, 'pointerdown', 2, 10, 10, 'touch', 125)
      touch(document, 'touchcancel', [first], true)
      pointer(document, 'pointerup', 1)
      await tick()
      expect(messages).toEqual([{ type: 'on', pitch: 'C4' }])
      pointer(document, 'pointerup', 2)
      touch(c, 'touchstart', [{ ...first, identifier: 12 }], true, 200)
      pointer(c, 'pointerdown', 3, 10, 10, 'touch', 220)
      pointer(document, 'pointercancel', 3)
      touch(document, 'touchend', [{ ...first, identifier: 12 }], true)
      await tick()
      expect(messages).toEqual([
        { type: 'on', pitch: 'C4' }, { type: 'off', pitch: 'C4' },
        { type: 'on', pitch: 'C4' }, { type: 'off', pitch: 'C4' },
      ])
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)); element.remove() }
  })

  it('preserves unpaired same-pitch fingers and later pointer-only contacts', async () => {
    const { element, c } = keyboard()
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([c])
    const messages: NoteMessage[] = []
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote: vi.fn() })
    const fiber = Effect.runFork(Stream.runForEach(mount(element), message => Effect.sync(() => { messages.push(message) })))
    const first = { identifier: 11, clientX: 10, clientY: 10 }
    try {
      await tick()
      pointer(c, 'pointerdown', 1, 20, 10, 'touch', 100)
      touch(c, 'touchstart', [first], true, 120)
      touch(document, 'touchend', [first], true)
      await tick()
      expect(messages).toEqual([{ type: 'on', pitch: 'C4' }])
      pointer(document, 'pointerup', 1)
      touch(c, 'touchstart', [first], true, 200)
      pointer(c, 'pointerdown', 2, 10, 10, 'touch', 300)
      touch(document, 'touchend', [first], true)
      await tick()
      expect(messages).toHaveLength(3)
      pointer(document, 'pointerup', 2)
      await tick()
      expect(messages).toEqual([
        { type: 'on', pitch: 'C4' }, { type: 'off', pitch: 'C4' },
        { type: 'on', pitch: 'C4' }, { type: 'off', pitch: 'C4' },
      ])
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)); element.remove() }
  })

  for (const interruption of ['blur', 'hidden'] as const) {
    it(`releases pointer and native notes on ${interruption} and ignores old releases`, async () => {
      const { element, c, d } = keyboard()
      vi.spyOn(document, 'elementsFromPoint').mockImplementation(x => x < 50 ? [c] : [d])
      const messages: NoteMessage[] = []
      const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote: vi.fn() })
      const fiber = Effect.runFork(Stream.runForEach(mount(element), message => Effect.sync(() => { messages.push(message) })))
      const first = { identifier: 11, clientX: 60, clientY: 10 }
      try {
        await tick()
        pointer(c, 'pointerdown', 1)
        touch(d, 'touchstart', [first], true)
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
        else {
          const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
          document.dispatchEvent(new Event('visibilitychange'))
          hidden.mockRestore()
        }
        pointer(document, 'pointerup', 1)
        touch(document, 'touchend', [first], true)
        await tick()
        expect(messages).toEqual([
          { type: 'on', pitch: 'C4' }, { type: 'on', pitch: 'D4' },
          { type: 'off', pitch: 'C4' }, { type: 'off', pitch: 'D4' },
        ])
        expect(element.releasePointerCapture).toHaveBeenCalledWith(1)
        pointer(c, 'pointerdown', 2)
        pointer(document, 'pointerup', 2)
        await tick()
        expect(messages.slice(-2)).toEqual([{ type: 'on', pitch: 'C4' }, { type: 'off', pitch: 'C4' }])
      } finally { await Effect.runPromise(Fiber.interrupt(fiber)); element.remove() }
    })
  }

  it('completes unmount cleanup even when stopping an audio note throws', async () => {
    const { element, c, d } = keyboard()
    vi.spyOn(document, 'elementsFromPoint').mockImplementation(x => x < 50 ? [c] : [d])
    const stopNote = vi.fn(() => { throw new Error('Audio unavailable') })
    const mount = createPianoPointerRuntime<NoteMessage>({ document, noteOn: pitch => ({ type: 'on', pitch }), noteOff: pitch => ({ type: 'off', pitch }), stopNote })
    const fiber = Effect.runFork(Stream.runDrain(mount(element)))
    try {
      await tick()
      pointer(c, 'pointerdown', 1)
      pointer(d, 'pointerdown', 2, 60)
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(stopNote.mock.calls).toEqual([['C4'], ['D4']])
      expect(element.releasePointerCapture).toHaveBeenCalledWith(1)
      expect(element.releasePointerCapture).toHaveBeenCalledWith(2)
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)); element.remove() }
  })
})
