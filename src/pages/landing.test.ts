import { describe, it } from 'vitest'
import { Scene } from 'foldkit/test'
import { view } from './landing'
import * as Main from '../main'

describe('Landing', () => {
  it('renders title and subtitle', () => {
    Scene.scene(
      { update: Main.update, view: () => view('en') },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('FoldKid')).toExist(),
      Scene.expect(Scene.text('Pick a game to play!')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders all 4 game cards', () => {
    Scene.scene(
      { update: Main.update, view: () => view('en') },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Say Hello')).toExist(),
      Scene.expect(Scene.text('Counter')).toExist(),
      Scene.expect(Scene.text('Peek-a-Boo')).toExist(),
      Scene.expect(Scene.text('Bubbles!')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders built with Foldkit link', () => {
    Scene.scene(
      { update: Main.update, view: () => view('en') },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Made with Foldkit')).toExist(),
      Scene.Command.expectNone(),
    )
  })


})
