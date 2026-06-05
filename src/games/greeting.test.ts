import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Greeting from './greeting'

const resolveChime = [{ name: 'PlayChime' }, Greeting.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Greeting.SoundPlayed()] as const

describe('Greeting', () => {
  it('init state', () => {
    expect(Greeting.init).toStrictEqual({ message: 'Hello from foldkid!', count: 0 })
  })

  it('greet increments count', () => {
    Story.story(
      Greeting.update,
      Story.with({ message: 'Hello from foldkid!', count: 0 }),
      Story.message(Greeting.ClickedGreet()),
      Story.model((model) => {
        expect(model.count).toBe(1)
      }),
      Story.Command.resolveAll(resolveChime),
      Story.Command.expectNone(),
    )
  })

  it('reset sets count to 0', () => {
    Story.story(
      Greeting.update,
      Story.with({ message: 'Hello from foldkid!', count: 5 }),
      Story.message(Greeting.ClickedReset()),
      Story.model((model) => {
        expect(model.count).toBe(0)
      }),
      Story.Command.resolveAll(resolveSwoosh),
      Story.Command.expectNone(),
    )
  })

  it('renders initial state', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with(Greeting.init),
      Scene.expect(Scene.text('Hello from foldkid!')).toExist(),
      Scene.expect(Scene.text('Say Hello')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows count after greeting', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ message: 'Hello from foldkid!', count: 0 }),
      Scene.click(Scene.text('Say Hello')),
      Scene.expect(Scene.text("You've been greeted 1 time")).toExist(),
      Scene.Command.resolveAll(resolveChime),
      Scene.Command.expectNone(),
    )
  })

  it('does not show Reset button before any greet', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ message: 'Hello from foldkid!', count: 0 }),
      Scene.expect(Scene.text('Reset')).toBeAbsent(),
      Scene.Command.expectNone(),
    )
  })
})
