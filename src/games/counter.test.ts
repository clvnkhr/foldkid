import { describe, expect, it } from 'vitest'
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
      pointerDownTime: 0, pressedButton: null,
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
