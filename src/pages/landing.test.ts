import { describe, it } from 'vitest'
import { Scene } from 'foldkit/test'
import { view } from './landing'
import * as Main from '../main'

describe('Landing', () => {
  it('renders title and subtitle', () => {
    Scene.scene(
      { update: Main.update, view: () => view() },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('foldkid')).toExist(),
      Scene.expect(Scene.text('Pick a game to play!')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders all 4 game cards', () => {
    Scene.scene(
      { update: Main.update, view: () => view() },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Say Hello!')).toExist(),
      Scene.expect(Scene.text('Counter')).toExist(),
      Scene.expect(Scene.text('Peek-a-Boo')).toExist(),
      Scene.expect(Scene.text('Bubbles')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders game descriptions', () => {
    Scene.scene(
      { update: Main.update, view: () => view() },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('A friendly hello greets you every time')).toExist(),
      Scene.expect(Scene.text('Count up and down with big buttons')).toExist(),
      Scene.expect(Scene.text('Hide and seek with a friendly face')).toExist(),
      Scene.expect(Scene.text('Add and pop colorful bubbles')).toExist(),
      Scene.Command.expectNone(),
    )
  })
})
