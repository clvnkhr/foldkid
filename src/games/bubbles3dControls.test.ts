import { Effect, Fiber, Stream } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as Audio from '../audio'
import { multitouchClickStream } from '../multitouch'
import { BUBBLES3D_MAX_HOLD, createBubbles3dControls, type Bubble3dCreation } from './bubbles3dControls'
import { bubble3dSizeForDuration, MAX_BUBBLE3D_HOLD_MS } from './bubbles3dCreation'
import { MAX_BUBBLE3D_SIZE, MIN_BUBBLE3D_SIZE } from './bubbles3dShapes'

let time = 0
let frames: Map<number, FrameRequestCallback>
let motion: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
beforeEach(() => {
  time = 0
  frames = new Map()
  let frameId = 0
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++frameId, callback); return frameId })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id) })
  vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
  motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.spyOn(window, 'matchMedia').mockReturnValue(motion as unknown as MediaQueryList)
})
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

const fixture = () => {
  const host = document.createElement('div')
  host.dataset.bubbles3dRevision = '4'
  host.dataset.bubbles3dNextCreationId = '7'
  const red = document.createElement('button')
  const blue = document.createElement('button')
  for (const button of [red, blue]) {
    button.className = 'bubbles3d-color-button'
    button.dataset.shape = 'sphere'
    button.dataset.multitouchOwned = 'true'
    button.setPointerCapture = vi.fn()
    button.hasPointerCapture = () => true
    button.releasePointerCapture = vi.fn(id => pointer(button, 'lostpointercapture', id))
  }
  red.dataset.color = '#FF4757'
  blue.dataset.color = '#1E90FF'
  blue.dataset.shape = 'cube'
  host.append(red, blue)
  document.body.append(host)
  const creations: Bubble3dCreation[] = []
  const cleanup = createBubbles3dControls(host, creation => { creations.push(creation) })
  return { host, red, blue, creations, cleanup }
}
const pointer = (target: EventTarget, type: string, id: number, x = 10, y = 10, pointerType = 'touch', stamp = time, button = 0): void => {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType, clientX: x, clientY: y, button })
  Object.defineProperty(event, 'timeStamp', { value: stamp })
  target.dispatchEvent(event)
}
const contact = (identifier: number, target: EventTarget, x = 10, y = 10) => ({ identifier, target, clientX: x, clientY: y })
const touch = (target: EventTarget, type: string, contacts: ReadonlyArray<ReturnType<typeof contact>>, stamp = time): void => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  // Old WebKit TouchList exposes item/length without an iterator.
  Object.defineProperties(event, {
    changedTouches: { value: { length: contacts.length, item: (index: number) => contacts[index] ?? null } },
    timeStamp: { value: stamp },
  })
  target.dispatchEvent(event)
}
const key = (target: EventTarget, type: string, value: string, repeat = false): void => {
  target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: value, repeat }))
}
const click = (target: EventTarget, detail = 0): void => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail })) }
const expected = (overrides: Partial<Bubble3dCreation> = {}): Bubble3dCreation => ({ color: '#FF4757', shape: 'sphere', revision: 4, creationId: 7, duration: 0, ...overrides })

describe('3D creation controls', () => {
  it('uses one hold limit for charge, payload durations, and size growth', () => {
    expect(BUBBLES3D_MAX_HOLD).toBe(MAX_BUBBLE3D_HOLD_MS)
    expect(bubble3dSizeForDuration(0)).toBe(MIN_BUBBLE3D_SIZE)
    expect(bubble3dSizeForDuration(-100)).toBe(MIN_BUBBLE3D_SIZE)
    expect(bubble3dSizeForDuration(MAX_BUBBLE3D_HOLD_MS / 2)).toBeCloseTo((MIN_BUBBLE3D_SIZE + MAX_BUBBLE3D_SIZE) / 2)
    expect(bubble3dSizeForDuration(MAX_BUBBLE3D_HOLD_MS)).toBe(MAX_BUBBLE3D_SIZE)
    expect(bubble3dSizeForDuration(MAX_BUBBLE3D_HOLD_MS * 2)).toBe(MAX_BUBBLE3D_SIZE)
  })

  it('captures independent color, shape, and revision contexts and allocates IDs in release order', () => {
    const { red, blue, creations, cleanup } = fixture()
    try {
      pointer(red, 'pointerdown', 1)
      time = 100
      pointer(blue, 'pointerdown', 2)
      red.dataset.shape = 'heart'
      red.dataset.color = '#1E90FF'
      time = 700
      pointer(document, 'pointerup', 2)
      time = 1000
      pointer(document, 'pointerup', 1)
      expect(creations).toEqual([
        expected({ color: '#1E90FF', shape: 'cube', duration: 600 }),
        expected({ creationId: 8, duration: 1000 }),
      ])
      expect(Audio.warmAudio).toHaveBeenCalledTimes(2)
    } finally { cleanup() }
  })

  it('keeps two fingers charging the same button and caps each independent hold', () => {
    const { red, creations, cleanup } = fixture()
    try {
      pointer(red, 'pointerdown', 1)
      time = 100
      pointer(red, 'pointerdown', 2, 20)
      expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(true)
      expect(frames.size).toBe(1)
      time = 500
      pointer(document, 'pointerup', 1)
      expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(true)
      expect(parseFloat(red.style.getPropertyValue('--bubbles3d-charge-pct'))).toBeCloseTo(400 / 30)
      time = 5000
      pointer(document, 'pointerup', 2, 20)
      expect(creations).toEqual([expected({ duration: 500 }), expected({ creationId: 8, duration: BUBBLES3D_MAX_HOLD })])
      expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(false)
      expect(red.style.getPropertyValue('--bubbles3d-charge-pct')).toBe('')
      expect(frames.size).toBe(0)
    } finally { cleanup() }
  })

  it('transfers pointer-first native touches without resetting duration or canceling on capture loss', () => {
    const { red, creations, cleanup } = fixture()
    const first = contact(11, red)
    try {
      pointer(red, 'pointerdown', 1, 10, 10, 'touch', 100)
      time = 50
      touch(red, 'touchstart', [first], 120)
      expect(red.releasePointerCapture).toHaveBeenCalledWith(1)
      time = 500
      pointer(document, 'pointerup', 1)
      expect(creations).toEqual([])
      time = 800
      touch(document, 'touchend', [first])
      click(red, 1)
      expect(creations).toEqual([expected({ duration: 800 })])
    } finally { cleanup() }
  })

  it('pairs native-first events only once and cancels aliases without resurrecting a released touch', () => {
    const { red, creations, cleanup } = fixture()
    const first = contact(11, red)
    try {
      touch(red, 'touchstart', [first], 100)
      pointer(red, 'pointerdown', 1, 10, 10, 'touch', 120)
      pointer(red, 'pointerdown', 2, 10, 10, 'touch', 125)
      time = 400
      touch(document, 'touchcancel', [first])
      pointer(document, 'pointerup', 1)
      pointer(document, 'pointerup', 2)
      expect(creations).toEqual([expected({ duration: 400 })])
      time = 500
      touch(red, 'touchstart', [first], 200)
      pointer(red, 'pointerdown', 3, 10, 10, 'touch', 220)
      pointer(document, 'pointercancel', 3)
      touch(document, 'touchend', [first])
      click(red, 1)
      expect(creations).toHaveLength(1)
    } finally { cleanup() }
  })

  it('cancels an adopted native hold when only its paired pointer reports movement', () => {
    const { red, creations, cleanup } = fixture()
    const first = contact(11, red)
    try {
      touch(red, 'touchstart', [first], 100)
      pointer(red, 'pointerdown', 1, 10, 10, 'touch', 120)
      pointer(document, 'pointermove', 1, 60)
      pointer(document, 'pointerup', 1, 10)
      touch(document, 'touchend', [first])
      expect(creations).toEqual([])
      expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(false)
      expect(frames.size).toBe(0)
    } finally { cleanup() }
  })

  it('keeps the root multitouch handler from activating owned creation controls', async () => {
    const { red, creations, cleanup } = fixture()
    // Ownership also wins if a click marker is accidentally present.
    red.dataset.multitouchClick = ''
    const addListener = vi.spyOn(document, 'addEventListener')
    const fiber = Effect.runFork(Stream.runDrain(multitouchClickStream(document.body)))
    try {
      await vi.waitFor(() => expect(addListener).toHaveBeenCalledWith('touchstart', expect.any(Function), { capture: true, passive: true }))
      const first = contact(11, red)
      pointer(red, 'pointerdown', 1, 10, 10, 'touch', 100)
      touch(red, 'touchstart', [first], 120)
      time = 500
      pointer(document, 'pointerup', 1)
      touch(document, 'touchend', [first])
      click(red, 1)
      expect(creations).toEqual([expected({ duration: 500 })])
      expect(Audio.warmAudio).toHaveBeenCalledTimes(1)
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)); cleanup() }
  })

  it('preserves unmatched fingers and later pointer-only gestures on the same button', () => {
    const { red, creations, cleanup } = fixture()
    const first = contact(11, red)
    try {
      pointer(red, 'pointerdown', 1, 20, 10, 'touch', 100)
      touch(red, 'touchstart', [first], 120)
      time = 300
      touch(document, 'touchend', [first])
      expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(true)
      time = 500
      pointer(document, 'pointerup', 1, 20)
      touch(red, 'touchstart', [first], 200)
      pointer(red, 'pointerdown', 2, 10, 10, 'touch', 300)
      time = 700
      touch(document, 'touchend', [first])
      pointer(document, 'pointerup', 2)
      expect(creations.map(creation => creation.creationId)).toEqual([7, 8, 9, 10])
    } finally { cleanup() }
  })

  it('cancels pointer/native moves, cancellations, lost capture, and secondary buttons', () => {
    const { red, creations, cleanup } = fixture()
    try {
      for (const type of ['pointercancel', 'lostpointercapture']) {
        pointer(red, 'pointerdown', 1)
        pointer(type === 'lostpointercapture' ? red : document, type, 1)
        pointer(document, 'pointerup', 1)
      }
      pointer(red, 'pointerdown', 2)
      pointer(document, 'pointermove', 2, 60)
      pointer(document, 'pointerup', 2, 10)
      const first = contact(11, red)
      touch(red, 'touchstart', [first])
      touch(document, 'touchmove', [{ ...first, clientX: 60 }])
      touch(document, 'touchend', [first])
      touch(red, 'touchstart', [first])
      touch(document, 'touchend', [{ ...first, clientX: 60 }])
      for (const type of ['mouse', 'pen']) {
        pointer(red, 'pointerdown', 3, 10, 10, type, 0, 2)
        pointer(document, 'pointerup', 3)
      }
      expect(creations).toEqual([])
      expect(Audio.warmAudio).not.toHaveBeenCalled()
      expect(frames.size).toBe(0)
    } finally { cleanup() }
  })

  it('allows a captured mouse or pen release outside the button, including unavailable capture', () => {
    const { red, creations, cleanup } = fixture()
    red.setPointerCapture = () => { throw new Error('Unsupported capture') }
    try {
      pointer(red, 'pointerdown', 1, 10, 10, 'mouse')
      time = 600
      pointer(document, 'pointerup', 1, 200, 200, 'mouse')
      click(red, 1)
      pointer(red, 'pointerdown', 2, 10, 10, 'pen')
      time = 1000
      pointer(document, 'pointerup', 2, 200, 200, 'pen')
      expect(creations).toEqual([expected({ duration: 600 }), expected({ creationId: 8, duration: 400 })])
    } finally { cleanup() }
  })

  it('supports native keyboard holds and deduplicates native activation clicks', () => {
    const { red, creations, cleanup } = fixture()
    try {
      key(red, 'keydown', ' ')
      key(red, 'keydown', ' ', true)
      click(red)
      red.dataset.shape = 'heart'
      time = 700
      key(document, 'keyup', ' ')
      click(red)
      expect(creations).toEqual([expected({ duration: 700 })])
      time = 1000
      key(red, 'keydown', 'Enter')
      click(red)
      time = 1700
      key(document, 'keyup', 'Enter')
      click(red)
      time = 2000
      click(red)
      expect(creations).toEqual([
        expected({ duration: 700 }), expected({ shape: 'heart', duration: 700, creationId: 8 }),
        expected({ shape: 'heart', creationId: 9 }),
      ])
    } finally { cleanup() }
  })

  it('unlocks audio at keyboard down while deferring creation until a long hold releases', () => {
    const { red, creations, cleanup } = fixture()
    try {
      key(red, 'keydown', ' ')
      expect(Audio.warmAudio).toHaveBeenCalledOnce()
      expect(creations).toEqual([])
      time = 10000
      key(document, 'keyup', ' ')
      expect(creations).toEqual([expected({ duration: MAX_BUBBLE3D_HOLD_MS })])
    } finally { cleanup() }
  })

  it('supports assistive click activation, rainbow, and unavailable audio', () => {
    const { red, creations, cleanup } = fixture()
    vi.mocked(Audio.warmAudio).mockImplementation(() => { throw new Error('No audio') })
    red.dataset.color = 'rainbow'
    try {
      click(red)
      pointer(red, 'pointerdown', 1)
      time = 700
      pointer(document, 'pointerup', 1)
      expect(creations).toEqual([expected({ color: 'rainbow' }), expected({ color: 'rainbow', duration: 700, creationId: 8 })])
    } finally { cleanup() }
  })

  it('rejects malformed contexts and disabled buttons', () => {
    const { host, red, creations, cleanup } = fixture()
    try {
      for (const [attribute, invalid, original] of [['color', 'red', '#FF4757'], ['shape', 'missing', 'sphere']] as const) {
        red.dataset[attribute] = invalid
        pointer(red, 'pointerdown', 1)
        pointer(document, 'pointerup', 1)
        click(red)
        red.dataset[attribute] = original
      }
      for (const invalid of ['NaN', '-1', '', '0.5']) {
        host.dataset.bubbles3dRevision = invalid
        click(red)
      }
      host.dataset.bubbles3dRevision = '4'
      red.disabled = true
      key(red, 'keydown', 'Enter')
      key(document, 'keyup', 'Enter')
      pointer(red, 'pointerdown', 1)
      pointer(document, 'pointerup', 1)
      click(red)
      expect(creations).toEqual([])
      expect(frames.size).toBe(0)
    } finally { cleanup() }
  })

  it('invalidates a stale revision before document releases and observes reset cleanup', async () => {
    const { host, red, creations, cleanup } = fixture()
    try {
      pointer(red, 'pointerdown', 1)
      host.dataset.bubbles3dRevision = '5'
      pointer(document, 'pointerup', 1)
      expect(creations).toEqual([])
      pointer(red, 'pointerdown', 2)
      host.dataset.bubbles3dRevision = '6'
      await vi.waitFor(() => expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(false))
      expect(red.releasePointerCapture).toHaveBeenCalledWith(2)
      pointer(document, 'pointerup', 2)
      pointer(red, 'pointerdown', 3)
      time = 100
      pointer(document, 'pointerup', 3)
      expect(creations).toEqual([expected({ revision: 6, duration: 100 })])
    } finally { cleanup() }
  })

  for (const interruption of ['blur', 'hidden'] as const) {
    it(`cancels pointer, native, and keyboard holds on ${interruption}`, () => {
      const { red, blue, creations, cleanup } = fixture()
      const first = contact(11, blue)
      try {
        pointer(red, 'pointerdown', 1)
        touch(blue, 'touchstart', [first])
        key(red, 'keydown', ' ')
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
        else {
          const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
          document.dispatchEvent(new Event('visibilitychange'))
          hidden.mockRestore()
        }
        pointer(document, 'pointerup', 1)
        touch(document, 'touchend', [first])
        key(document, 'keyup', ' ')
        expect(creations).toEqual([])
        expect(frames.size).toBe(0)
        time = 1000
        pointer(red, 'pointerdown', 2)
        pointer(document, 'pointerup', 2)
        expect(creations).toEqual([expected()])
      } finally { cleanup() }
    })
  }

  it('keeps reduced-motion holds fully functional without an animation loop', () => {
    motion.matches = true
    const { red, creations, cleanup } = fixture()
    try {
      pointer(red, 'pointerdown', 1)
      expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(true)
      expect(frames.size).toBe(0)
      time = 2500
      pointer(document, 'pointerup', 1)
      expect(creations).toEqual([expected({ duration: 2500 })])
    } finally { cleanup() }
  })

  it('releases listeners, capture, animation, and charge styles on unmount', () => {
    const { red, creations, cleanup } = fixture()
    pointer(red, 'pointerdown', 1)
    cleanup()
    cleanup()
    expect(red.releasePointerCapture).toHaveBeenCalledTimes(1)
    expect(red.classList.contains('bubbles3d-color-button--charging')).toBe(false)
    expect(red.style.getPropertyValue('--bubbles3d-charge-pct')).toBe('')
    expect(frames.size).toBe(0)
    expect(motion.removeEventListener).toHaveBeenCalledOnce()
    pointer(document, 'pointerup', 1)
    key(red, 'keydown', 'Enter')
    key(document, 'keyup', 'Enter')
    click(red)
    expect(creations).toEqual([])
  })

  it('advances IDs from committed host state and continues across remounts', () => {
    const { host, red, creations, cleanup } = fixture()
    try {
      pointer(red, 'pointerdown', 1)
      red.disabled = true
      pointer(document, 'pointerup', 1)
      red.disabled = false
      host.dataset.bubbles3dNextCreationId = '50'
      time = 1000
      click(red)
      expect(creations).toEqual([expected({ creationId: 50 })])
    } finally { cleanup() }
    host.dataset.bubbles3dNextCreationId = '51'
    const next: Bubble3dCreation[] = []
    const unmount = createBubbles3dControls(host, creation => { next.push(creation) })
    try { click(red); expect(next).toEqual([expected({ creationId: 51 })]) } finally { unmount() }
  })
})
