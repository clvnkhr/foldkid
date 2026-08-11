import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Counter from './counter'
import { numberToWord, parseBallCount, parseBallFontSize } from './counter'

const resolveClick = [{ name: 'PlayClick' }, Counter.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Counter.SoundPlayed()] as const
const resolveSpeak = [{ name: 'Speak' }, Counter.SoundPlayed()] as const
const resolveBalls = [{ name: 'counterBalls' }, Counter.SoundPlayed()] as const

describe('Counter', () => {
  it('init state', () => {
    expect(Counter.init).toStrictEqual({
      count: 0, fontSize: 3, holding: false, displayMode: 'number',
      pointerDownTime: 0, pressedButton: null, tiltGravity: false,
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
      Scene.Mount.resolveAll(resolveBalls),
      Scene.Command.expectNone(),
    )
  })

  it('pressing +1 increments display', () => {
    Scene.scene(
      { update: Counter.update, view: Counter.view },
      Scene.with(Counter.init),
      Scene.Mount.resolveAll(resolveBalls),
      Scene.pointerDown(Scene.text('+1')),
      Scene.expect(Scene.selector('.counter-size-btn--charging')).toExist(),
      Scene.pointerUp(Scene.text('+1')),
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
      Scene.Mount.resolveAll(resolveBalls),
      Scene.Command.expectNone(),
    )
  })

  it('renders both mode', () => {
    Scene.scene(
      { update: Counter.update, view: Counter.view },
      Scene.with({ ...Counter.init, count: 5, displayMode: 'both' }),
      Scene.expect(Scene.text('5 · five')).toExist(),
      Scene.Mount.resolveAll(resolveBalls),
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
    target: Element,
    type: string,
    pointerType: 'mouse' | 'pen',
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
