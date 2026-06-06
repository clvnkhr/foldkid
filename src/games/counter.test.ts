import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Counter from './counter'
import { numberToWord } from './counter'

const resolveClick = [{ name: 'PlayClick' }, Counter.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Counter.SoundPlayed()] as const
const resolveSpeak = [{ name: 'Speak' }, Counter.SoundPlayed()] as const
const resolveBalls = [{ name: 'counterBalls' }, Counter.SoundPlayed()] as const

describe('Counter', () => {
  it('init state', () => {
    expect(Counter.init).toStrictEqual({
      count: 0, fontSize: 3, holding: false, rate: 0.85, pitch: 1.1, displayMode: 'number',
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

  it('renders initial state', () => {
    Scene.scene(
      { update: Counter.update, view: Counter.view },
      Scene.with(Counter.init),
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
      Scene.pointerUp(Scene.text('+1')),
      Scene.expect(Scene.text('1')).toExist(),
      Scene.Command.resolveAll(resolveClick, resolveSpeak),
      Scene.Command.expectNone(),
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
      Story.message(Counter.PointerDown()),
      Story.model((model) => {
        expect(model.holding).toBe(true)
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

  it('falls back for unknown language', () => {
    expect(numberToWord(5, 'xx')).toBe('5')
  })
})
