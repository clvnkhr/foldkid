import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Counter from './counter'

const resolveClick = [{ name: 'PlayClick' }, Counter.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Counter.SoundPlayed()] as const
const resolveSpeak = [{ name: 'Speak' }, Counter.SoundPlayed()] as const
const resolveBalls = [{ name: 'counterBalls' }, Counter.SoundPlayed()] as const

describe('Counter', () => {
  it('init state', () => {
    expect(Counter.init).toStrictEqual({
      count: 0, fontSize: 3, holding: false, rate: 0.85, pitch: 1.1, language: 'en', showSettings: false,
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
      Scene.expect(Scene.text('⚙')).toExist(),
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

  it('settings toggle shows and hides panel', () => {
    Story.story(
      Counter.update,
      Story.with(Counter.init),
      Story.message(Counter.ClickedSettings()),
      Story.model((model) => {
        expect(model.showSettings).toBe(true)
      }),
      Story.Command.expectNone(),
    )

    Story.story(
      Counter.update,
      Story.with({ ...Counter.init, showSettings: true }),
      Story.message(Counter.ClickedSettings()),
      Story.model((model) => {
        expect(model.showSettings).toBe(false)
      }),
      Story.Command.expectNone(),
    )
  })

  it('dismiss settings hides panel', () => {
    Story.story(
      Counter.update,
      Story.with({ ...Counter.init, showSettings: true }),
      Story.message(Counter.DismissSettings()),
      Story.model((model) => {
        expect(model.showSettings).toBe(false)
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
})
