import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsDragEnded, SettingsDragMoved, SettingsDragStarted } from './message'
import { settingsResizeStream } from './subscriptions'

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
const pointer = (target: EventTarget, type: string, pointerId: number, screenX = 100, button = 0): void => {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', screenX, button }))
}

describe('settings resize multitouch', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('keeps resizing owned by the original finger until that finger releases', async () => {
    const handle = document.createElement('div')
    document.body.append(handle)
    const messages: unknown[] = []
    const fiber = Effect.runFork(Stream.runForEach(settingsResizeStream(handle), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      pointer(handle, 'pointerdown', 1, 100)
      pointer(handle, 'pointerdown', 2, 200)
      pointer(document, 'pointermove', 2, 230)
      pointer(document, 'pointerup', 2, 230)
      pointer(document, 'pointermove', 1, 150)
      await tick()
      expect(messages).toEqual([SettingsDragStarted({ screenX: 100 }), SettingsDragMoved({ screenX: 150 })])
      pointer(document, 'pointerup', 1, 150)
      pointer(document, 'pointerup', 1, 150)
      pointer(handle, 'pointerdown', 2, 200)
      pointer(document, 'pointerup', 2, 220)
      await tick()
      expect(messages).toEqual([
        SettingsDragStarted({ screenX: 100 }), SettingsDragMoved({ screenX: 150 }), SettingsDragEnded(),
        SettingsDragStarted({ screenX: 200 }), SettingsDragMoved({ screenX: 220 }), SettingsDragEnded(),
      ])
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  for (const ending of ['pointercancel', 'lostpointercapture', 'blur'] as const) {
    it(`ends an owned resize once on ${ending} and releases its capture`, async () => {
      const handle = document.createElement('div')
      document.body.append(handle)
      const capture = vi.fn()
      const release = vi.fn()
      handle.setPointerCapture = capture
      handle.hasPointerCapture = () => true
      handle.releasePointerCapture = release
      const messages: unknown[] = []
      const fiber = Effect.runFork(Stream.runForEach(settingsResizeStream(handle), message => Effect.sync(() => { messages.push(message) })))
      try {
        await tick()
        pointer(handle, 'pointerdown', 1)
        if (ending === 'blur') window.dispatchEvent(new Event('blur'))
        else pointer(ending === 'lostpointercapture' ? handle : document, ending, 1)
        pointer(document, 'pointerup', 1)
        await tick()
        expect(messages).toEqual([SettingsDragStarted({ screenX: 100 }), SettingsDragEnded()])
        expect(capture).toHaveBeenCalledWith(1)
        expect(release).toHaveBeenCalledOnce()
        expect(release).toHaveBeenCalledWith(1)
      } finally {
        await Effect.runPromise(Fiber.interrupt(fiber))
      }
    })
  }

  it('uses document events without capture and removes listeners on interruption', async () => {
    const handle = document.createElement('div')
    document.body.append(handle)
    handle.setPointerCapture = () => { throw new Error('capture unavailable') }
    const release = vi.fn()
    handle.hasPointerCapture = () => true
    handle.releasePointerCapture = release
    const messages: unknown[] = []
    const fiber = Effect.runFork(Stream.runForEach(settingsResizeStream(handle), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      pointer(handle, 'pointerdown', 0, 100, 2)
      pointer(handle, 'pointerdown', 1, 120)
      pointer(document, 'pointermove', 1, 160)
      await tick()
      expect(messages).toEqual([SettingsDragStarted({ screenX: 120 }), SettingsDragMoved({ screenX: 160 })])
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(release).toHaveBeenCalledWith(1)
      pointer(document, 'pointerup', 1)
      pointer(handle, 'pointerdown', 2, 200)
      pointer(document, 'pointermove', 2, 240)
      window.dispatchEvent(new Event('blur'))
      await tick()
      expect(messages).toHaveLength(2)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  it('observes owned movement and the final release coordinate before child handlers stop propagation', async () => {
    const handle = document.createElement('div')
    const outside = document.createElement('button')
    document.body.append(handle, outside)
    handle.setPointerCapture = () => { throw new Error('capture unavailable') }
    outside.addEventListener('pointermove', event => event.stopPropagation())
    outside.addEventListener('pointerup', event => event.stopPropagation())
    const messages: unknown[] = []
    const fiber = Effect.runFork(Stream.runForEach(settingsResizeStream(handle), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      pointer(handle, 'pointerdown', 1, 100)
      pointer(outside, 'pointermove', 1, 140)
      pointer(outside, 'pointerup', 1, 160)
      await tick()
      expect(messages).toEqual([
        SettingsDragStarted({ screenX: 100 }), SettingsDragMoved({ screenX: 140 }), SettingsDragMoved({ screenX: 160 }), SettingsDragEnded(),
      ])
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })

  for (const interruptedBy of ['hidden document', 'closed panel'] as const) {
    it(`cancels when the ${interruptedBy} interrupts a resize and accepts a fresh finger`, async () => {
      const panel = document.createElement('div')
      panel.className = 'settings-panel'
      const handle = document.createElement('div')
      panel.append(handle)
      document.body.append(panel)
      const messages: unknown[] = []
      const release = vi.fn()
      handle.hasPointerCapture = () => true
      handle.releasePointerCapture = release
      const fiber = Effect.runFork(Stream.runForEach(settingsResizeStream(handle), message => Effect.sync(() => { messages.push(message) })))
      try {
        await tick()
        pointer(handle, 'pointerdown', 1, 100)
        if (interruptedBy === 'hidden document') {
          const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
          document.dispatchEvent(new Event('visibilitychange'))
          hidden.mockRestore()
        } else panel.style.display = 'none'
        await tick()
        expect(release).toHaveBeenCalledExactlyOnceWith(1)
        expect(messages).toEqual([SettingsDragStarted({ screenX: 100 }), SettingsDragEnded()])
        panel.style.display = ''
        pointer(handle, 'pointerdown', 2, 200)
        pointer(document, 'pointerup', 1, 100)
        pointer(document, 'pointerup', 2, 200)
        await tick()
        expect(messages).toEqual([
          SettingsDragStarted({ screenX: 100 }), SettingsDragEnded(), SettingsDragStarted({ screenX: 200 }), SettingsDragEnded(),
        ])
      } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
    })
  }

  it('rejects invalid IDs and positions without stranding the resize handle', async () => {
    const handle = document.createElement('div')
    document.body.append(handle)
    const messages: unknown[] = []
    const malformed = (type: string, id: number, x: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, { button: { value: 0 }, pointerId: { value: id }, screenX: { value: x } })
      handle.dispatchEvent(event)
    }
    const fiber = Effect.runFork(Stream.runForEach(settingsResizeStream(handle), message => Effect.sync(() => { messages.push(message) })))
    try {
      await tick()
      malformed('pointerdown', Number.NaN, 100)
      malformed('pointerdown', 1, Infinity)
      pointer(handle, 'pointerdown', 1, 100)
      malformed('pointermove', 1, Number.NaN)
      pointer(document, 'pointerup', 1, 140)
      await tick()
      expect(messages).toEqual([SettingsDragStarted({ screenX: 100 }), SettingsDragMoved({ screenX: 140 }), SettingsDragEnded()])
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
})
