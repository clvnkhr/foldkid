import { describe, it } from 'vitest'
import { Scene } from 'foldkit/test'
import { LANDING_GAME_COUNT, view } from './landing'
import * as Main from '../main'

describe('Landing', () => {
  const defaultOrder = Array.from({ length: LANDING_GAME_COUNT }, (_, i) => i)
  const visibleGames = Array.from({ length: LANDING_GAME_COUNT }, () => false)

  it('renders title and subtitle', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('FoldKid')).toExist(),
      Scene.expect(Scene.text('Pick a game to play!')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders all game cards', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Counter')).toExist(),
      Scene.expect(Scene.text('Find It!')).toExist(),
      Scene.expect(Scene.text('Bubbles!')).toExist(),
      Scene.expect(Scene.text('Draw')).toExist(),
      Scene.expect(Scene.text('Music Box')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('only makes the game card handles draggable', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.selector('.game-card')).not.toHaveAttr('draggable', 'true'),
      Scene.expect(Scene.selector('.game-card-drag-handle')).toHaveAttr('draggable', 'true'),
      Scene.Command.expectNone(),
    )
  })

  it('renders cards in custom order', () => {
      Scene.scene(
        { update: Main.update, view: () => view([2, 0, 1, 3, 4], visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.Command.expectNone(),
    )
  })

  it('does not render hidden game cards', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, [false, true, false, false, false], 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Find It!')).not.toExist(),
      Scene.expect(Scene.text('Counter')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders built with Foldkit link', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Made with Foldkit')).toExist(),
      Scene.Command.expectNone(),
    )
  })


})
