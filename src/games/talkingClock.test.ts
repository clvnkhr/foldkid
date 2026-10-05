import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import { adjustForSecondCrossing, CheckCurrentTime, init, mountTalkingClock, SetTime, timeFromHourHandAngle, timeFromMinuteHandAngle, timePhrase, update, windingAngles, WindToNow, type Message } from './talkingClock'

const pointerContact = (target: EventTarget, type: string, id: number, x: number, y: number, timeStamp: number, pointerType = 'touch', button = 0): void => {
  const event = new PointerEvent(type, { bubbles: true, pointerId: id, pointerType, button, clientX: x, clientY: y })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}
const touchContact = (target: EventTarget, type: string, contacts: readonly { id: number; x: number; y: number; target: Element }[], timeStamp: number): void => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const touches = contacts.map(contact => ({ identifier: contact.id, clientX: contact.x, clientY: contact.y, target: contact.target }))
  Object.defineProperties(event, { changedTouches: { value: { length: touches.length, item: (index: number) => touches[index] ?? null } }, timeStamp: { value: timeStamp } })
  target.dispatchEvent(event)
}
const mountedClock = async () => {
  const face = document.createElement('div')
  Object.assign(face.dataset, { hour: '3', minute: '0', second: '0', live: 'false' })
  face.getBoundingClientRect = () => new DOMRect(0, 0, 200, 200)
  const hour = document.createElement('span')
  const minute = document.createElement('span')
  hour.className = 'clock-hand--hour'
  minute.className = 'clock-hand--minute'
  face.append(hour, minute)
  face.setPointerCapture = vi.fn()
  face.hasPointerCapture = () => true
  face.releasePointerCapture = vi.fn()
  document.body.append(face)
  const messages: Message[] = []
  const fiber = Effect.runFork(Stream.runForEach(mountTalkingClock(face), message => Effect.sync(() => { messages.push(message) })))
  await new Promise(resolve => setTimeout(resolve, 0))
  return { face, hour, minute, messages, cleanup: async () => { await Effect.runPromise(Fiber.interrupt(fiber)); face.remove() } }
}

describe('talking clock', () => {
  it('keeps a clock hand owned by its original finger through unrelated touches', async () => {
    const face = document.createElement('div')
    face.dataset.hour = '3'
    face.dataset.minute = '0'
    face.dataset.second = '0'
    face.dataset.live = 'false'
    face.getBoundingClientRect = () => new DOMRect(0, 0, 200, 200)
    const hour = document.createElement('span')
    const minute = document.createElement('span')
    hour.className = 'clock-hand--hour'
    minute.className = 'clock-hand--minute'
    face.append(hour, minute)
    document.body.append(face)
    face.setPointerCapture = () => { throw new Error('unsupported capture') }
    face.hasPointerCapture = () => true
    face.releasePointerCapture = vi.fn()
    const messages: Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(mountTalkingClock(face), message => Effect.sync(() => { messages.push(message) })))
    const pointer = (target: EventTarget, type: string, id: number, x: number, y: number): void => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x, clientY: y }))
    }
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      pointer(hour, 'pointerdown', 1, 100, 0)
      pointer(minute, 'pointerdown', 2, 100, 0)
      pointer(document, 'pointermove', 2, 200, 100)
      pointer(document, 'pointerup', 2, 200, 100)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(face.classList.contains('clock-face--dragging')).toBe(true)
      expect(messages.filter(message => message._tag === 'TalkingClockSetTime')).toEqual([])

      pointer(document, 'pointermove', 1, 100, 200)
      pointer(document, 'pointerup', 1, 100, 200)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages.filter(message => message._tag === 'TalkingClockSetTime')).toEqual([SetTime({ hour: 6, minute: 0, second: 0 })])
      expect(messages.filter(message => message._tag === 'TalkingClockSpeakTime')).toHaveLength(1)
      expect(face.classList.contains('clock-face--dragging')).toBe(false)

      pointer(minute, 'pointerdown', 3, 100, 0)
      pointer(document, 'pointermove', 3, 200, 100)
      pointer(document, 'pointercancel', 3, 200, 100)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages.filter(message => message._tag === 'TalkingClockSpeakTime')).toHaveLength(1)
      expect(face.classList.contains('clock-face--dragging')).toBe(false)

      face.setPointerCapture = vi.fn()
      hour.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 4, pointerType: 'pen', clientX: 100, clientY: 0 }))
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(face.releasePointerCapture).toHaveBeenCalledWith(4)
      expect(face.classList.contains('clock-face--dragging')).toBe(false)
      const count = messages.length
      pointer(document, 'pointermove', 4, 200, 100)
      pointer(document, 'pointerup', 4, 200, 100)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages).toHaveLength(count)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      face.remove()
    }
  })

  it.each([true, false])('handles native touches and pointer duplicates in either order (native first: %s)', async nativeFirst => {
    const { face, hour, minute, messages, cleanup } = await mountedClock()
    const touch = { id: 11, x: 100, y: 0, target: hour }
    try {
      pointerContact(hour, 'pointerdown', 9, 100, 0, 90, 'pen', 2)
      expect(face.classList.contains('clock-face--dragging')).toBe(false)
      if (nativeFirst) touchContact(face, 'touchstart', [touch], 100)
      pointerContact(hour, 'pointerdown', 1, 100, 0, 101)
      if (!nativeFirst) touchContact(face, 'touchstart', [touch], 120)
      touchContact(face, 'touchstart', [{ id: 12, x: 100, y: 0, target: minute }], 121)
      pointerContact(document, 'pointermove', 1, 200, 100, 122)
      pointerContact(document, 'pointerup', 1, 200, 100, 123)
      pointerContact(face, 'lostpointercapture', 1, 200, 100, 124)
      touchContact(document, 'touchend', [{ id: 12, x: 200, y: 100, target: minute }], 125)
      expect(face.classList.contains('clock-face--dragging')).toBe(true)
      touchContact(document, 'touchend', [{ ...touch, x: 100, y: 200 }], 126)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages.filter(message => message._tag === 'TalkingClockSetTime')).toEqual([SetTime({ hour: 6, minute: 0, second: 0 })])
      expect(messages.filter(message => message._tag === 'TalkingClockSpeakTime')).toHaveLength(1)
      expect(face.setPointerCapture).not.toHaveBeenCalled()

      // Pointer-only contacts still work after native contacts finish, including
      // their final release coordinate when there was no move event.
      pointerContact(minute, 'pointerdown', 2, 100, 0, 200)
      pointerContact(document, 'pointerup', 2, 200, 100, 220)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages.filter(message => message._tag === 'TalkingClockSetTime').at(-1)).toEqual(SetTime({ hour: 3, minute: 15, second: 0 }))
      expect(messages.filter(message => message._tag === 'TalkingClockSpeakTime')).toHaveLength(2)
    } finally { await cleanup() }
  })

  it.each([true, false])('cancels the owning native contact through pointercancel (native first: %s)', async nativeFirst => {
    const { face, hour, messages, cleanup } = await mountedClock()
    const touch = { id: 11, x: 100, y: 0, target: hour }
    try {
      if (nativeFirst) touchContact(face, 'touchstart', [touch], 100)
      pointerContact(hour, 'pointerdown', 1, 100, 0, 101)
      if (!nativeFirst) touchContact(face, 'touchstart', [touch], 120)
      pointerContact(document, 'pointercancel', 1, 100, 200, 125)
      touchContact(document, 'touchend', [{ ...touch, y: 200 }], 126)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(face.classList.contains('clock-face--dragging')).toBe(false)
      expect(messages.filter(message => message._tag === 'TalkingClockSetTime' || message._tag === 'TalkingClockSpeakTime')).toEqual([])
      // The same pointer ID can be used by a fresh independent gesture.
      pointerContact(hour, 'pointerdown', 1, 100, 0, 200)
      pointerContact(document, 'pointerup', 1, 100, 200, 220)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages.filter(message => message._tag === 'TalkingClockSpeakTime')).toHaveLength(1)
    } finally { await cleanup() }
  })

  it.each(['blur', 'hidden'])('releases an interrupted clock contact on %s', async interruption => {
    const { face, hour, messages, cleanup } = await mountedClock()
    try {
      pointerContact(hour, 'pointerdown', 1, 100, 0, 100, 'pen')
      if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
      else {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
        document.dispatchEvent(new Event('visibilitychange'))
      }
      expect(face.classList.contains('clock-face--dragging')).toBe(false)
      expect(face.releasePointerCapture).toHaveBeenCalledWith(1)
      pointerContact(document, 'pointerup', 1, 100, 200, 120, 'pen')
      touchContact(face, 'touchstart', [{ id: 11, x: 100, y: 0, target: hour }], 200)
      touchContact(document, 'touchcancel', [{ id: 11, x: 100, y: 200, target: hour }], 220)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(messages.filter(message => message._tag === 'TalkingClockSetTime' || message._tag === 'TalkingClockSpeakTime')).toEqual([])
      expect(face.classList.contains('clock-face--dragging')).toBe(false)
    } finally { await cleanup(); vi.restoreAllMocks() }
  })

  it('starts at the supplied current time', () => {
    expect(init(new Date(2026, 7, 4, 14, 37, 42))).toMatchObject({ hour: 2, minute: 37, second: 42, phraseStyle: 'digital', live: true, isWinding: false })
  })

  it('uses familiar figures of speech', () => {
    expect(timePhrase(10, 0)).toBe("10 o'clock")
    expect(timePhrase(10, 10)).toBe('10 minutes past 10')
    expect(timePhrase(2, 15)).toBe('quarter past 2')
    expect(timePhrase(4, 30)).toBe('half past 4')
    expect(timePhrase(7, 45)).toBe('quarter to 8')
    expect(timePhrase(11, 50)).toBe('10 minutes to 12')
  })

  it('supports a digital speaking style', () => {
    expect(timePhrase(2, 0, 'digital')).toBe("2 o'clock")
    expect(timePhrase(2, 5, 'digital')).toBe('2:05')
    expect(timePhrase(2, 30, 'digital')).toBe('half past 2')
  })

  it('clamps hand movement to a valid clock time', () => {
    const [next] = update(init(new Date(2026, 7, 4, 10, 0)), SetTime({ hour: 13, minute: 99 }))
    expect(next).toMatchObject({ hour: 1, minute: 59 })
    expect(next.live).toBe(true)
  })

  it('wraps hours in either direction', () => {
    const start = init(new Date(2026, 7, 4, 23, 55))
    const [afterMidnight] = update(start, SetTime({ hour: start.hour + 1, minute: 0 }))
    const [backAgain] = update(afterMidnight, SetTime({ hour: afterMidnight.hour - 1, minute: 55 }))
    expect(afterMidnight).toMatchObject({ hour: 0, minute: 0 })
    expect(backAgain).toMatchObject({ hour: 11, minute: 55 })
  })

  it('ticks only while it is in current-time mode', () => {
    const live = init(new Date(2026, 7, 4, 10, 0, 0))
    const [ticked] = update(live, CheckCurrentTime({ hour: 10, minute: 0, second: 1, key: 'tick' }), true)
    const [manual] = update(ticked, SetTime({ hour: 4, minute: 30 }))
    const [stillManual] = update(manual, CheckCurrentTime({ hour: 10, minute: 1, second: 2, key: 'tick-2' }), true)
    const [resumed] = update(stillManual, WindToNow({ hour: 10, minute: 1, second: 3 }))
    expect(ticked.live).toBe(true)
    expect(stillManual).toMatchObject({ hour: 4, minute: 30, live: true })
    expect(resumed).toMatchObject({ hour: 10, minute: 1, second: 3, live: true, isWinding: true })
  })

  it('drives minutes and hours when the seconds hand crosses 12', () => {
    expect(adjustForSecondCrossing(3, 24, 59, 0)).toEqual({ hour: 3, minute: 25 })
    expect(adjustForSecondCrossing(3, 25, 0, 59)).toEqual({ hour: 3, minute: 24 })
    expect(adjustForSecondCrossing(11, 59, 59, 0)).toEqual({ hour: 0, minute: 0 })
    expect(adjustForSecondCrossing(0, 0, 0, 59)).toEqual({ hour: 11, minute: 59 })
  })

  it('derives the whole time from the hour hand position', () => {
    expect(timeFromHourHandAngle(0)).toEqual({ hour: 0, minute: 0, second: 0 })
    expect(timeFromHourHandAngle(90)).toEqual({ hour: 3, minute: 0, second: 0 })
    expect(timeFromHourHandAngle(97.5)).toEqual({ hour: 3, minute: 15, second: 0 })
    expect(timeFromHourHandAngle(359.5)).toEqual({ hour: 11, minute: 59, second: 0 })
  })

  it('derives minutes and seconds from the minute hand position', () => {
    expect(timeFromMinuteHandAngle(0)).toEqual({ minute: 0, second: 0 })
    expect(timeFromMinuteHandAngle(90)).toEqual({ minute: 15, second: 0 })
    expect(timeFromMinuteHandAngle(93)).toEqual({ minute: 15, second: 30 })
    expect(timeFromMinuteHandAngle(359.9)).toEqual({ minute: 59, second: 59 })
  })

  it('winds through the full elapsed time rather than directly to hand parameters', () => {
    const forward = windingAngles({ hour: 1, minute: 0, second: 0 }, { hour: 3, minute: 0, second: 0 })
    expect(forward.deltaSeconds).toBe(7200)
    expect(forward.minute).toBe(720)
    expect(forward.hour).toBe(90)
    const backward = windingAngles({ hour: 11, minute: 0, second: 0 }, { hour: 9, minute: 0, second: 0 })
    expect(backward.deltaSeconds).toBe(-7200)
    expect(backward.minute).toBe(-720)
  })

  it('does not start a wind when already synced', () => {
    const now = new Date(2026, 7, 4, 14, 37, 42)
    const model = init(now)
    const [next, commands] = update(model, WindToNow({ hour: 2, minute: 37, second: 42 }))
    expect(next.isWinding).toBe(false)
    expect(commands).toHaveLength(0)
  })
})
