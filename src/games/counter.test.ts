import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Counter from './counter'
import { numberToWord, parseBallCount, parseBallFontSize } from './counter'

const resolveClick = [{ name: 'PlayClick' }, Counter.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Counter.SoundPlayed()] as const
const resolveSpeak = [{ name: 'Speak' }, Counter.SoundPlayed()] as const
const resolveBalls = [{ name: 'counterBalls' }, Counter.SoundPlayed()] as const
const resolvePresses = [{ name: 'counterPresses' }, Counter.SoundPlayed()] as const

describe('Counter', () => {
  it('init state', () => {
    expect(Counter.init).toStrictEqual({
      count: 0, fontSize: 3, holding: false, displayMode: 'number',
      pointerDownTime: 0, pressedButton: null, presses: [], tiltGravity: false,
    })
  })

  it('increment adds 1', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PressedIncrement({ duration: 0 })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.fontSize).toBe(3)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('decrement subtracts 1', () => {
    Story.story(
      Counter.update,
      Story.with({ ...Counter.init, count: 5 }),
      Story.message(Counter.PressedDecrement({ duration: 0 })),
      Story.model((model) => {
        expect(model.count).toBe(4)
        expect(model.fontSize).toBe(3)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('reset sets count to 0', () => {
    Story.story(
      Counter.update,
      Story.with({ ...Counter.init, count: 10 }),
      Story.message(Counter.ClickedReset()),
      Story.model((model) => {
        expect(model.count).toBe(0)
      }),
      Story.Command.resolveAll(resolveSwoosh, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('long press makes number bigger', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PressedIncrement({ duration: 2000 })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.fontSize).toBe(20)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('quick press after pointer-down rerender keeps number small', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'inc' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
        expect(model.pointerDownTime).toBe(100)
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedIncrement({ duration: 40 })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.fontSize).toBe(3)
        expect(model.holding).toBe(false)
        expect(model.pressedButton).toBeNull()
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('mobile tap duplicate pointerup and pointerleave increments only once', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'inc' })),
      Story.Command.expectNone(),
      Story.message(Counter.PressedIncrement({ duration: 40, button: 'inc' })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.pressedButton).toBeNull()
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
      Story.message(Counter.PressedIncrement({ duration: 45, button: 'inc' })),
      Story.model((model) => {
        expect(model.count).toBe(1)
      }),
      Story.Command.expectNone(),
    )
  })

  it('mobile tap duplicate pointerup and pointerleave decrements only once', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'dec' })),
      Story.Command.expectNone(),
      Story.message(Counter.PressedDecrement({ duration: 40, button: 'dec' })),
      Story.model((model) => {
        expect(model.count).toBe(-1)
        expect(model.pressedButton).toBeNull()
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
      Story.message(Counter.PressedDecrement({ duration: 45, button: 'dec' })),
      Story.model((model) => {
        expect(model.count).toBe(-1)
      }),
      Story.Command.expectNone(),
    )
  })

  it('keeps simultaneous presses independent and rejects duplicate, wrong-button, cancelled, and stale releases', () => {
    Story.story(
      (model: Counter.Model, message: Counter.Message) => Counter.update(model, message, 'en', true),
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ pointerId: 1, timeStamp: 100, button: 'inc' })),
      Story.message(Counter.PointerDown({ pointerId: 2, timeStamp: 200, button: 'dec' })),
      Story.message(Counter.PointerDown({ pointerId: 1, timeStamp: 300, button: 'dec' })),
      Story.message(Counter.PressedDecrement({ pointerId: 1, duration: 10 })),
      Story.model(model => {
        expect(model.count).toBe(0)
        expect(model.presses).toHaveLength(2)
      }),
      Story.message(Counter.PressedIncrement({ pointerId: 1, duration: 500 })),
      Story.message(Counter.PressedIncrement({ pointerId: 1, duration: 500 })),
      Story.model(model => expect(model).toMatchObject({ count: 1, holding: true, pressedButton: 'dec' })),
      Story.message(Counter.PressCancelled({ pointerId: 2 })),
      Story.message(Counter.PressedDecrement({ pointerId: 2, duration: 500 })),
      Story.model(model => expect(model).toMatchObject({ count: 1, holding: false, presses: [] })),
      Story.message(Counter.PointerDown({ pointerId: 3, timeStamp: 400, button: 'inc' })),
      Story.message(Counter.ClickedReset()),
      Story.message(Counter.PressedIncrement({ pointerId: 3, duration: 500 })),
      Story.model(model => expect(model).toMatchObject({ count: 0, holding: false, presses: [] })),
      Story.Command.expectNone(),
    )
  })

  it('rejects malformed hold IDs, timestamps, and durations', () => {
    for (const message of [
      Counter.PointerDown({ pointerId: Number.NaN, timeStamp: 100, button: 'inc' }),
      Counter.PointerDown({ pointerId: 1, timeStamp: Infinity, button: 'inc' }),
      Counter.PressedIncrement({ duration: Number.NaN }),
      Counter.PressedDecrement({ duration: -1 }),
    ]) expect(Counter.update(Counter.init, message)).toEqual([Counter.init, []])
  })

  it('renders initial state', () => {
    Scene.scene(
      { update: Counter.update, view: Counter.view },
      Scene.with(Counter.init),
      Scene.expect(Scene.selector('.counter-page')).toExist(),
      Scene.expect(Scene.selector('.counter-card')).toExist(),
      Scene.expect(Scene.text('0')).toExist(),
      Scene.expect(Scene.text('-1')).toExist(),
      Scene.expect(Scene.text('+1')).toExist(),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Mount.resolveAll(resolveBalls, resolvePresses),
      Scene.Command.expectNone(),
    )
  })

  it('pressing +1 increments display', () => {
    Scene.scene(
      { update: Counter.update, view: Counter.view },
      Scene.with(Counter.init),
      Scene.Mount.resolveAll(resolveBalls, resolvePresses),
      Scene.click(Scene.text('+1')),
      Scene.expect(Scene.text('1')).toExist(),
      Scene.Command.resolveAll(resolveClick, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('pointer down then up off-button still increments (window listener path)', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'inc' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
        expect(model.count).toBe(0)
        expect(model.pointerDownTime).toBe(100)
        expect(model.pressedButton).toBe('inc')
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedIncrement({ duration: 2000 })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.fontSize).toBe(20)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('dragging off the increment button still completes exactly once', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'inc' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
        expect(model.pressedButton).toBe('inc')
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedIncrement({ duration: 750, button: 'inc' })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.fontSize).toBeGreaterThan(3)
        expect(model.pressedButton).toBeNull()
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('pointer down then up off-button still decrements (window listener path)', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'dec' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
        expect(model.pointerDownTime).toBe(100)
        expect(model.pressedButton).toBe('dec')
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedDecrement({ duration: 0 })),
      Story.model((model) => {
        expect(model.count).toBe(-1)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('dragging off the decrement button still completes exactly once', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'dec' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
        expect(model.pressedButton).toBe('dec')
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedDecrement({ duration: 750, button: 'dec' })),
      Story.model((model) => {
        expect(model.count).toBe(-1)
        expect(model.fontSize).toBeGreaterThan(3)
        expect(model.pressedButton).toBeNull()
      }),
      Story.Command.resolveAll(resolveClick, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('SoundPlayed leaves model unchanged', () => {
    Story.story(
      Counter.update,
      Story.with({ ...Counter.init, count: 5 }),
      Story.message(Counter.SoundPlayed()),
      Story.model((model) => {
        expect(model.count).toBe(5)
      }),
      Story.Command.expectNone(),
    )
  })

  it('pointer down sets holding', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 250, button: 'inc' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
        expect(model.pointerDownTime).toBe(250)
        expect(model.pressedButton).toBe('inc')
      }),
      Story.Command.expectNone(),
    )
  })

  it('SetDisplayMode updates displayMode', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.SetDisplayMode({ value: 'word' })),
      Story.model((model) => {
        expect(model.displayMode).toBe('word')
      }),
      Story.Command.expectNone(),
    )
  })

  it('only enables tilt gravity through its explicit setting', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.SetTiltGravity({ value: true })),
      Story.model((model) => {
        expect(model.tiltGravity).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })

  it('renders word mode', () => {
    Scene.scene(
      { update: Counter.update, view: Counter.view },
      Scene.with({ ...Counter.init, count: 5, displayMode: 'word' }),
      Scene.expect(Scene.text('five')).toExist(),
      Scene.Mount.resolveAll(resolveBalls, resolvePresses),
      Scene.Command.expectNone(),
    )
  })

  it('renders both mode', () => {
    Scene.scene(
      { update: Counter.update, view: Counter.view },
      Scene.with({ ...Counter.init, count: 5, displayMode: 'both' }),
      Scene.expect(Scene.text('5 · five')).toExist(),
      Scene.Mount.resolveAll(resolveBalls, resolvePresses),
      Scene.Command.expectNone(),
    )
  })
})

describe('numberToWord', () => {
  it('converts to English words', () => {
    expect(numberToWord(0, 'en')).toBe('zero')
    expect(numberToWord(5, 'en')).toBe('five')
    expect(numberToWord(13, 'en')).toBe('thirteen')
    expect(numberToWord(42, 'en')).toBe('forty-two')
  })

  it('converts to German words', () => {
    expect(numberToWord(5, 'de')).toBe('fünf')
  })

  it('converts to French words', () => {
    expect(numberToWord(5, 'fr')).toBe('cinq')
  })

  it('converts to Malay words', () => {
    expect(numberToWord(5, 'ms')).toBe('lima')
  })

  it('converts to Chinese words', () => {
    expect(numberToWord(0, 'zh')).toBe('零')
    expect(numberToWord(5, 'zh')).toBe('五')
    expect(numberToWord(10, 'zh')).toBe('十')
    expect(numberToWord(13, 'zh')).toBe('十三')
    expect(numberToWord(21, 'zh')).toBe('二十一')
    expect(numberToWord(100, 'zh')).toBe('一百')
    expect(numberToWord(110, 'zh')).toBe('一百一十')
  })

  it('converts to Cantonese words', () => {
    expect(numberToWord(0, 'zh-HK')).toBe('零')
    expect(numberToWord(5, 'zh-HK')).toBe('五')
    expect(numberToWord(10, 'zh-HK')).toBe('十')
    expect(numberToWord(100, 'zh-HK')).toBe('一百')
  })

  it('uses kosong for Malay zero', () => {
    expect(numberToWord(0, 'ms')).toBe('kosong')
    expect(numberToWord(5, 'ms')).toBe('lima')
  })

  it('converts to Japanese words', () => {
    expect(numberToWord(0, 'ja')).toBe('零')
    expect(numberToWord(5, 'ja')).toBe('五')
    expect(numberToWord(10, 'ja')).toBe('十')
    expect(numberToWord(13, 'ja')).toBe('十三')
    expect(numberToWord(100, 'ja')).toBe('百')
  })

  it('falls back for unknown language', () => {
    expect(numberToWord(5, 'xx')).toBe('5')
  })
})

describe('counter ball attribute parsing', () => {
  it('maps a full hold to a much larger ball while preserving the tap size', () => {
    expect(Counter.ballRadius(3)).toBe(11)
    expect(Counter.ballRadius(20)).toBe(90)
  })

  it('parses finite integer ball counts and preserves negative direction', () => {
    expect(parseBallCount('12')).toBe(12)
    expect(parseBallCount('-4')).toBe(-4)
    expect(parseBallCount('3.9')).toBe(3)
  })

  it('falls back to zero for invalid ball counts', () => {
    expect(parseBallCount(null)).toBe(0)
    expect(parseBallCount('NaN')).toBe(0)
    expect(parseBallCount('Infinity')).toBe(0)
  })

  it('parses finite font sizes within the animation range', () => {
    expect(parseBallFontSize('10')).toBe(10)
    expect(parseBallFontSize('0')).toBe(3)
    expect(parseBallFontSize('99')).toBe(20)
  })

  it('falls back to the default font size for invalid values', () => {
    expect(parseBallFontSize(null)).toBe(3)
    expect(parseBallFontSize('NaN')).toBe(3)
    expect(parseBallFontSize('Infinity')).toBe(3)
  })
})

describe('counter orientation gravity', () => {
  it('uses one-and-a-half times the previous base gravity', () => {
    expect(Counter.BASE_GRAVITY).toBe(3900 * 1.5)
  })

  it('maps portrait device tilt to screen gravity', () => {
    expect(Counter.orientationGravity(90, 0)).toEqual([0, 1])
    expect(Counter.orientationGravity(0, 90)).toEqual([1, 0])
    expect(Counter.orientationGravity(-90, 0)).toEqual([0, -1])
  })

  it('preserves the projected magnitude of gravity', () => {
    const gentleTilt = Counter.orientationGravity(30, 0)
    const diagonalTilt = Counter.orientationGravity(45, 45)

    expect(gentleTilt?.[0]).toBeCloseTo(0)
    expect(gentleTilt?.[1]).toBeCloseTo(0.5)
    expect(Math.hypot(...diagonalTilt!)).toBeCloseTo(Math.sqrt(0.75))
  })

  it('rotates device axes into both iPhone landscape orientations', () => {
    const landscapeRight = Counter.orientationGravity(0, 90, 90)
    const landscapeLeft = Counter.orientationGravity(0, -90, -90)

    expect(landscapeRight?.[0]).toBeCloseTo(0)
    expect(landscapeRight?.[1]).toBeCloseTo(1)
    expect(landscapeLeft?.[0]).toBeCloseTo(0)
    expect(landscapeLeft?.[1]).toBeCloseTo(1)
  })

  it('ignores unavailable readings and near-flat sensor noise', () => {
    expect(Counter.orientationGravity(null, 0)).toBeUndefined()
    expect(Counter.orientationGravity(0, null)).toBeUndefined()
    expect(Counter.orientationGravity(0, 0)).toEqual([0, 0])
  })
})

describe('counter ball dragging', () => {
  const pointer = (
    target: EventTarget,
    type: string,
    pointerType: 'mouse' | 'pen' | 'touch',
    pointerId: number,
    x: number,
    y: number,
    timeStamp?: number,
  ): void => {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId,
      pointerType,
    })
    if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    target.dispatchEvent(event)
  }

  const touch = (
    dispatchTarget: Element,
    touchTarget: Element,
    type: string,
    identifier: number,
    x: number,
    y: number,
    timeStamp: number,
  ): Event => {
    const event = new Event(type, { bubbles: true, cancelable: true })
    const touchPoint = { identifier, clientX: x, clientY: y, target: touchTarget } as unknown as Touch
    const changedTouches = {
      0: touchPoint,
      length: 1,
      item: (index: number) => index === 0 ? touchPoint : null,
    } as unknown as TouchList
    Object.defineProperties(event, {
      changedTouches: { value: changedTouches },
      timeStamp: { value: timeStamp },
    })
    dispatchTarget.dispatchEvent(event)
    return event
  }

  const ballPosition = (ball: HTMLElement): readonly [number, number] => {
    const match = ball.style.transform.match(/translate3d\(([-\d.]+)px,([-\d.]+)px,0\)/)
    if (!match) throw new Error(`Unexpected ball transform: ${ball.style.transform}`)
    return [Number(match[1]), Number(match[2])]
  }

  it('lets a mouse pick up, move, and drop a ball', async () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-count', '1')
    parent.setAttribute('data-fontsize', '3')
    parent.setAttribute('data-tilt-gravity', 'false')
    parent.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)
    document.body.appendChild(parent)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fiber = Effect.runFork(Stream.runDrain(Counter.mountCounterBalls(parent)))

    try {
      await new Promise(resolve => setTimeout(resolve, 40))
      const ball = parent.querySelector<HTMLElement>('.ball')
      expect(ball).not.toBeNull()
      const [left, top] = ballPosition(ball!)
      const radius = Number.parseFloat(ball!.style.width) / 2
      const captured = new Set<number>()
      ball!.setPointerCapture = id => { captured.add(id) }
      ball!.hasPointerCapture = id => captured.has(id)
      ball!.releasePointerCapture = id => { captured.delete(id) }

      pointer(ball!, 'pointerdown', 'mouse', 7, left + radius, top + radius, 100)
      expect(ball!.classList.contains('ball--dragging')).toBe(true)
      expect(captured.has(7)).toBe(true)

      pointer(parent, 'pointermove', 'mouse', 7, 80, 80, 500)
      expect(ballPosition(ball!)).toEqual([69, 69])

      pointer(parent, 'pointerup', 'mouse', 7, 80, 80, 510)
      expect(ball!.classList.contains('ball--dragging')).toBe(false)
      expect(captured.has(7)).toBe(false)

      await new Promise(resolve => setTimeout(resolve, 40))
      expect(ballPosition(ball!)[1]).toBeGreaterThan(69)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      random.mockRestore()
      parent.remove()
    }
  })

  it('uses cancellable touch events to drag on iOS without pointer capture', async () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-count', '1')
    parent.setAttribute('data-fontsize', '3')
    parent.setAttribute('data-tilt-gravity', 'false')
    parent.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)
    document.body.appendChild(parent)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fiber = Effect.runFork(Stream.runDrain(Counter.mountCounterBalls(parent)))

    try {
      await new Promise(resolve => setTimeout(resolve, 40))
      const ball = parent.querySelector<HTMLElement>('.ball')!
      const [left, top] = ballPosition(ball)
      const radius = Number.parseFloat(ball.style.width) / 2

      const start = touch(ball, ball, 'touchstart', 7, left + radius, top + radius, 100)
      expect(ball.classList.contains('ball--dragging')).toBe(true)
      expect(start.defaultPrevented).toBe(true)

      const move = touch(ball, ball, 'touchmove', 7, 80, 80, 500)
      expect(ballPosition(ball)).toEqual([69, 69])
      expect(move.defaultPrevented).toBe(true)

      const end = touch(ball, ball, 'touchend', 7, 80, 80, 510)
      expect(ball.classList.contains('ball--dragging')).toBe(false)
      expect(end.defaultPrevented).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 40))
      expect(ballPosition(ball)[1]).toBeGreaterThan(69)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      random.mockRestore()
      parent.remove()
    }
  })

  for (const nativeTouch of [false, true]) {
    it(`drags touch pointers with a TouchEvent constructor${nativeTouch ? ' and adopts the native touch stream' : ' and no native touch stream'}`, async () => {
      vi.stubGlobal('TouchEvent', class {})
      const parent = document.createElement('div')
      parent.setAttribute('data-count', '1')
      parent.setAttribute('data-fontsize', '3')
      parent.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)
      document.body.append(parent)
      const fiber = Effect.runFork(Stream.runDrain(Counter.mountCounterBalls(parent)))
      try {
        await new Promise(resolve => setTimeout(resolve, 40))
        const ball = parent.querySelector<HTMLElement>('.ball')!
        const [left, top] = ballPosition(ball)
        const radius = Number.parseFloat(ball.style.width) / 2
        const capture = vi.fn()
        ball.setPointerCapture = capture
        pointer(ball, 'pointerdown', 'touch', 7, left + radius, top + radius, 100)
        expect(ball.classList.contains('ball--dragging')).toBe(true)
        expect(capture).not.toHaveBeenCalled()
        if (nativeTouch) touch(ball, ball, 'touchstart', 3, left + radius, top + radius, 110)
        pointer(document, 'pointermove', 'touch', 7, 80, 80, 200)
        if (nativeTouch) touch(ball, ball, 'touchmove', 3, 80, 80, 200)
        expect(ballPosition(ball)).toEqual([69, 69])
        pointer(document, 'pointerup', 'touch', 7, 80, 80, 210)
        if (nativeTouch) {
          expect(ball.classList.contains('ball--dragging')).toBe(true)
          touch(ball, ball, 'touchend', 3, 80, 80, 220)
        }
        expect(ball.classList.contains('ball--dragging')).toBe(false)
      } finally {
        await Effect.runPromise(Fiber.interrupt(fiber))
        vi.unstubAllGlobals()
        parent.remove()
      }
    })
  }

  it('keeps a ball owned by its original finger and accepts pointers after native touches', async () => {
    const parent = document.createElement('div')
    const outside = document.createElement('div')
    parent.setAttribute('data-count', '1')
    parent.setAttribute('data-fontsize', '3')
    parent.getBoundingClientRect = () => new DOMRect(0, 0, 300, 200)
    document.body.append(parent, outside)
    const fiber = Effect.runFork(Stream.runDrain(Counter.mountCounterBalls(parent)))
    try {
      await new Promise(resolve => setTimeout(resolve, 40))
      const ball = parent.querySelector<HTMLElement>('.ball')!
      const [left, top] = ballPosition(ball)
      const radius = Number.parseFloat(ball.style.width) / 2
      pointer(ball, 'pointerdown', 'touch', 7, left + radius, top + radius, 100)
      // Another finger on the same ball must not adopt the first finger's drag.
      touch(ball, ball, 'touchstart', 3, left + radius + 5, top + radius, 110)
      touch(ball, ball, 'touchend', 3, left + radius + 5, top + radius, 120)
      expect(ball.classList.contains('ball--dragging')).toBe(true)
      pointer(document, 'pointermove', 'touch', 7, 80, 80, 200)
      expect(ballPosition(ball)).toEqual([69, 69])
      pointer(document, 'pointerup', 'touch', 7, 80, 80, 210)
      pointer(ball, 'pointerdown', 'touch', 8, 80, 80, 300)
      expect(ball.classList.contains('ball--dragging')).toBe(true)
      window.dispatchEvent(new Event('blur'))
      expect(ball.classList.contains('ball--dragging')).toBe(false)
      pointer(ball, 'pointerdown', 'pen', 9, 80, 80, 400)
      pointer(ball, 'lostpointercapture', 'pen', 9, 80, 80, 410)
      expect(ball.classList.contains('ball--dragging')).toBe(false)
      touch(ball, ball, 'touchstart', 5, 80, 80, 500)
      pointer(ball, 'pointerdown', 'touch', 10, 80, 80, 510)
      pointer(document, 'pointercancel', 'touch', 10, 80, 80, 520)
      expect(ball.classList.contains('ball--dragging')).toBe(false)
      touch(ball, ball, 'touchend', 5, 80, 80, 530)
      outside.addEventListener('touchend', event => event.stopPropagation())
      outside.addEventListener('pointerup', event => event.stopPropagation())
      touch(ball, ball, 'touchstart', 6, 80, 80, 600)
      touch(outside, ball, 'touchmove', 6, 100, 100, 650)
      touch(outside, ball, 'touchend', 6, 100, 100, 660)
      expect(ball.classList.contains('ball--dragging')).toBe(false)
      expect(ballPosition(ball)).toEqual([89, 89])
      pointer(ball, 'pointerdown', 'pen', 11, 100, 100, 700)
      pointer(outside, 'pointerup', 'pen', 11, 100, 100, 750)
      expect(ball.classList.contains('ball--dragging')).toBe(false)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      parent.remove()
      outside.remove()
    }
  })

  it('flings a dropped ball with the measured pointer velocity', async () => {
    const parent = document.createElement('div')
    parent.setAttribute('data-count', '1')
    parent.setAttribute('data-fontsize', '3')
    parent.setAttribute('data-tilt-gravity', 'false')
    parent.getBoundingClientRect = () => new DOMRect(0, 0, 400, 240)
    document.body.appendChild(parent)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fiber = Effect.runFork(Stream.runDrain(Counter.mountCounterBalls(parent)))

    try {
      await new Promise(resolve => setTimeout(resolve, 40))
      const ball = parent.querySelector<HTMLElement>('.ball')!
      const [left, top] = ballPosition(ball)
      const radius = Number.parseFloat(ball.style.width) / 2
      const centerX = left + radius
      const centerY = top + radius

      touch(ball, ball, 'touchstart', 3, centerX, centerY, 100)
      touch(ball, ball, 'touchmove', 3, centerX + 40, centerY, 200)
      touch(ball, ball, 'touchend', 3, centerX + 40, centerY, 210)
      const releasedLeft = ballPosition(ball)[0]

      await new Promise(resolve => setTimeout(resolve, 35))
      expect(ballPosition(ball)[0]).toBeGreaterThan(releasedLeft)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      random.mockRestore()
      parent.remove()
    }
  })
})

describe('counter wall reflection', () => {
  it.each([
    { wall: 'left', velocity: [-100, 40], normal: [1, 0], reflected: [72, 28.8] },
    { wall: 'right', velocity: [100, 40], normal: [-1, 0], reflected: [-72, 28.8] },
    { wall: 'top', velocity: [40, -100], normal: [0, 1], reflected: [28.8, 72] },
    { wall: 'bottom', velocity: [40, 100], normal: [0, -1], reflected: [28.8, -72] },
  ])('makes a damped specular reflection at the $wall wall', ({ velocity, normal, reflected }) => {
    const result = Counter.dampedSpecularReflection(velocity[0]!, velocity[1]!, normal[0]!, normal[1]!)

    expect(result[0]).toBeCloseTo(reflected[0]!)
    expect(result[1]).toBeCloseTo(reflected[1]!)
    expect(Math.hypot(...result)).toBeCloseTo(Math.hypot(...velocity) * Counter.WALL_RESTITUTION)
  })
})

describe('counter button touch controls', () => {
  const touch = (target: HTMLElement, type: string, identifier: number, timeStamp: number): Event => {
    const point = { identifier, target, clientX: 20, clientY: 20 } as unknown as Touch
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperties(event, {
      changedTouches: { value: { length: 1, item: (index: number) => index === 0 ? point : null } },
      timeStamp: { value: timeStamp },
    })
    target.dispatchEvent(event)
    return event
  }
  const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
  const pointer = (button: HTMLElement, type: string, pointerId: number, timeStamp: number, pointerType = 'touch'): void => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType, button: 0, clientX: 20, clientY: 20 })
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    button.dispatchEvent(event)
  }

  it('finishes each finger with its own hold duration while another finger stays held', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button data-counter-button="inc">+1</button><button data-counter-button="dec">-1</button>'
    document.body.append(root)
    const [increment, decrement] = [...root.querySelectorAll<HTMLElement>('button')]
    let model = Counter.init
    const messages: Counter.Message[] = []
    const nativeClick = vi.fn()
    increment!.addEventListener('click', nativeClick)
    const fiber = Effect.runFork(Stream.runForEach(Counter.mountCounterPresses(root), message => Effect.sync(() => {
      messages.push(message)
      model = Counter.update(model, message, 'en', true)[0]
    })))
    try {
      await tick()
      touch(increment!, 'touchstart', 1, 100)
      touch(decrement!, 'touchstart', 2, 400)
      await tick()
      expect(model.presses).toHaveLength(2)
      const end = touch(increment!, 'touchend', 1, 600)
      await tick()
      expect(end.defaultPrevented).toBe(true)
      expect(model).toMatchObject({ count: 1, holding: true, pressedButton: 'dec', fontSize: 7 })
      expect(messages).toContainEqual(Counter.PressedIncrement({ pointerId: -2, button: 'inc', duration: 500 }))
      increment!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
      expect(nativeClick).not.toHaveBeenCalled()
      increment!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
      expect(nativeClick).toHaveBeenCalledOnce()
      touch(decrement!, 'touchcancel', 2, 800)
      touch(increment!, 'touchend', 1, 900)
      await tick()
      expect(model).toMatchObject({ count: 1, holding: false, presses: [] })
      expect(messages.filter(message => message._tag === 'CounterPressedIncrement')).toHaveLength(1)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      root.remove()
    }
  })

  it('supports pointer capture failures and releases captures and listeners on interruption', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button data-counter-button="inc">+1</button>'
    document.body.append(root)
    const button = root.querySelector<HTMLElement>('button')!
    button.setPointerCapture = () => { throw new Error('unsupported') }
    const messages: Counter.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Counter.mountCounterPresses(root), message => Effect.sync(() => { messages.push(message) })))
    const pointer = (type: string, id: number, timeStamp: number): void => {
      const event = new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'pen' })
      Object.defineProperty(event, 'timeStamp', { value: timeStamp })
      button.dispatchEvent(event)
    }
    try {
      await tick()
      pointer('pointerdown', 1, 100)
      pointer('pointerdown', 2, 200)
      pointer('pointerup', 1, 400)
      pointer('pointercancel', 2, 500)
      await tick()
      expect(messages.map(message => message._tag)).toEqual(['CounterPointerDown', 'CounterPointerDown', 'CounterPressedIncrement', 'CounterPressCancelled'])
      await Effect.runPromise(Fiber.interrupt(fiber))
      pointer('pointerdown', 3, 600)
      pointer('pointerup', 3, 700)
      await tick()
      expect(messages).toHaveLength(4)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      root.remove()
    }
  })

  for (const nativeTouch of [false, true]) {
    it(`finishes a touch press once with a TouchEvent constructor${nativeTouch ? ' and pointer/native delivery' : ' and pointer-only delivery'}`, async () => {
      vi.stubGlobal('TouchEvent', class {})
      const root = document.createElement('div')
      root.innerHTML = '<button data-counter-button="inc">+1</button>'
      document.body.append(root)
      const button = root.querySelector<HTMLElement>('button')!
      const messages: Counter.Message[] = []
      const fiber = Effect.runFork(Stream.runForEach(Counter.mountCounterPresses(root), message => Effect.sync(() => { messages.push(message) })))
      try {
        await tick()
        pointer(button, 'pointerdown', 7, 100)
        if (nativeTouch) touch(button, 'touchstart', 3, 120)
        pointer(button, 'pointerup', 7, 600)
        if (nativeTouch) touch(button, 'touchend', 3, 600)
        await tick()
        expect(messages).toEqual([
          Counter.PointerDown({ pointerId: 7, button: 'inc', timeStamp: 100 }),
          Counter.PressedIncrement({ pointerId: 7, button: 'inc', duration: 500 }),
        ])
      } finally {
        await Effect.runPromise(Fiber.interrupt(fiber))
        vi.unstubAllGlobals()
        root.remove()
      }
    })
  }

  it('accepts pointer-only touches after native input and cancels lost captures and hidden contacts', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button data-counter-button="inc">+1</button>'
    document.body.append(root)
    const button = root.querySelector<HTMLElement>('button')!
    let model = Counter.init
    const fiber = Effect.runFork(Stream.runForEach(Counter.mountCounterPresses(root), message => Effect.sync(() => {
      model = Counter.update(model, message, 'en', true)[0]
    })))
    try {
      await tick()
      touch(button, 'touchstart', 1, 100)
      touch(button, 'touchend', 1, 200)
      pointer(button, 'pointerdown', 7, 300)
      pointer(button, 'pointerup', 7, 400)
      await tick()
      expect(model.count).toBe(2)
      pointer(button, 'pointerdown', 8, 500, 'pen')
      pointer(button, 'lostpointercapture', 8, 600, 'pen')
      pointer(button, 'pointerup', 8, 700, 'pen')
      touch(button, 'touchstart', 2, 800)
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
      document.dispatchEvent(new Event('visibilitychange'))
      touch(button, 'touchend', 2, 900)
      await tick()
      expect(model).toMatchObject({ count: 2, holding: false, presses: [] })
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      vi.restoreAllMocks()
      root.remove()
    }
  })

  it('pairs native-first contacts once and does not confuse a later finger at the same point', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button data-counter-button="inc">+1</button>'
    document.body.append(root)
    const button = root.querySelector<HTMLElement>('button')!
    const nativeClick = vi.fn()
    button.addEventListener('click', nativeClick)
    let model = Counter.init
    const fiber = Effect.runFork(Stream.runForEach(Counter.mountCounterPresses(root), message => Effect.sync(() => {
      model = Counter.update(model, message, 'en', true)[0]
    })))
    try {
      await tick()
      touch(button, 'touchstart', 1, 100)
      pointer(button, 'pointerdown', 7, 110)
      pointer(button, 'pointercancel', 7, 200)
      touch(button, 'touchend', 1, 210)
      await tick()
      expect(model).toMatchObject({ count: 0, presses: [] })
      touch(button, 'touchstart', 2, 300)
      pointer(button, 'pointerdown', 8, 310)
      pointer(button, 'pointerup', 8, 400)
      pointer(button, 'lostpointercapture', 8, 410)
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(nativeClick).not.toHaveBeenCalled()
      touch(button, 'touchend', 2, 420)
      touch(button, 'touchstart', 3, 500)
      pointer(button, 'pointerdown', 9, 510)
      touch(button, 'touchend', 3, 600)
      pointer(button, 'pointerup', 9, 610)
      await tick()
      expect(model).toMatchObject({ count: 2, presses: [] })
      pointer(button, 'pointerdown', 10, 700)
      touch(button, 'touchstart', 4, 900)
      pointer(button, 'pointerup', 10, 1000)
      touch(button, 'touchend', 4, 1100)
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 11, pointerType: 'pen', button: 2 }))
      pointer(button, 'pointerup', 11, 1200, 'pen')
      await tick()
      expect(model).toMatchObject({ count: 4, presses: [] })
      button.addEventListener('pointerup', event => event.stopPropagation())
      button.addEventListener('touchend', event => event.stopPropagation())
      pointer(button, 'pointerdown', 12, 1300)
      pointer(button, 'pointerup', 12, 1400)
      touch(button, 'touchstart', 5, 1500)
      touch(button, 'touchend', 5, 1600)
      await tick()
      expect(model).toMatchObject({ count: 6, presses: [] })
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      root.remove()
    }
  })

  it('allows real mouse clicks after touch and keeps reset releases from stealing a new press', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<button data-counter-button="inc">+1</button>'
    document.body.append(root)
    const button = root.querySelector<HTMLElement>('button')!
    const nativeClick = vi.fn()
    button.addEventListener('click', nativeClick)
    let model = Counter.init
    const fiber = Effect.runFork(Stream.runForEach(Counter.mountCounterPresses(root), message => Effect.sync(() => {
      model = Counter.update(model, message, 'en', true)[0]
    })))
    try {
      await tick()
      pointer(button, 'pointerdown', 7, 100)
      touch(button, 'touchstart', 3, 110)
      await tick()
      model = Counter.update(model, Counter.ClickedReset(), 'en', true)[0]
      touch(button, 'touchstart', 4, 200)
      touch(button, 'touchend', 3, 250)
      await tick()
      expect(model).toMatchObject({ count: 0, holding: true })
      touch(button, 'touchend', 4, 300)
      await tick()
      expect(model).toMatchObject({ count: 1, holding: false })
      const mouseClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
      Object.defineProperty(mouseClick, 'sourceCapabilities', { value: { firesTouchEvents: false } })
      button.dispatchEvent(mouseClick)
      expect(nativeClick).toHaveBeenCalledOnce()
      pointer(button, 'pointerdown', 8, 400, 'mouse')
      pointer(button, 'pointerup', 8, 450, 'mouse')
      const duplicateClick = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })
      Object.defineProperty(duplicateClick, 'sourceCapabilities', { value: { firesTouchEvents: false } })
      button.dispatchEvent(duplicateClick)
      await tick()
      expect(model.count).toBe(2)
      expect(nativeClick).toHaveBeenCalledOnce()
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      root.remove()
    }
  })
})

describe('Counter global state', () => {
  it('PointerDown then PressedIncrement works without module-level state', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'inc' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedIncrement({ duration: 500 })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(
        [{ name: 'PlayClick' }, Counter.SoundPlayed()],
        [{ name: 'Speak' }, Counter.SoundPlayed()],
      ),
      Story.Command.expectNone(),
    )
  })

  it('consecutive increments without pointer down between them', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PressedIncrement({ duration: 100 })),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(
        [{ name: 'PlayClick' }, Counter.SoundPlayed()],
        [{ name: 'Speak' }, Counter.SoundPlayed()],
      ),
      Story.Command.expectNone(),
    )
  })

  it('pointer down then decrement works (window listener path)', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.PointerDown({ timeStamp: 100, button: 'dec' })),
      Story.model((model) => {
        expect(model.holding).toBe(true)
      }),
      Story.Command.expectNone(),
      Story.message(Counter.PressedDecrement({ duration: 0 })),
      Story.model((model) => {
        expect(model.count).toBe(-1)
        expect(model.holding).toBe(false)
      }),
      Story.Command.resolveAll(
        [{ name: 'PlayClick' }, Counter.SoundPlayed()],
        [{ name: 'Speak' }, Counter.SoundPlayed()],
      ),
      Story.Command.expectNone(),
    )
  })
})
