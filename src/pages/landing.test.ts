import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit/test'
import { LANDING_GAME_COUNT, LANDING_GAMES, view } from './landing'
import * as Main from '../main'
import * as DotShapes from '../games/dotShapes'
import * as ShapeMatch from '../games/shapeMatch'
import * as PicnicBasket from '../games/picnicBasket'
import { LandingDragEnded } from '../message'

describe('Landing', () => {
  const defaultOrder = Array.from({ length: LANDING_GAME_COUNT }, (_, i) => i)
  const visibleGames = Array.from({ length: LANDING_GAME_COUNT }, () => false)
  const acknowledgePointerReorder = Scene.Mount.resolve({ name: 'landingGamePointerReorder' }, LandingDragEnded())

  it('appends Picnic Basket while retaining every existing catalogue index', () => {
    expect(LANDING_GAMES.map(game => game.title)).toEqual([
      'counterTitle', 'findItTitle', 'bubblesTitle', 'drawTitle', 'musicBoxTitle',
      'memoryCardsTitle', 'phonemeGardenTitle', 'calculatorTitle', 'whackTitle',
      'patternTitle', 'bslTitle', 'rpsTitle', 'magneticBlocksTitle', 'talkingKeyboardTitle',
      'talkingClockTitle', 'growingNumbersTitle', 'shapeWorkshopTitle', 'bubbles3dTitle',
      'handwritingTitle', 'dotShapesTitle', 'shapeMatchTitle', 'picnicBasketTitle',
    ])
    expect(LANDING_GAMES[19]?.msg()).toEqual({ _tag: 'ClickedDotShapes' })
    expect(LANDING_GAMES[19]?.emoji).toBe('🔺')
    expect(LANDING_GAMES[20]?.msg()).toEqual({ _tag: 'ClickedShapeMatch' })
    expect(LANDING_GAMES.at(-1)?.msg()).toEqual({ _tag: 'ClickedPicnicBasket' })
  })

  it('renders title and subtitle', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('FoldKid')).toExist(),
      Scene.expect(Scene.text('Pick a game to play!')).toExist(),
      acknowledgePointerReorder,
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
      Scene.expect(Scene.text('Memory Cards')).toExist(),
      Scene.expect(Scene.text('Growing Numbers')).toExist(),
      Scene.expect(Scene.text('Shape Workshop')).toExist(),
      Scene.expect(Scene.text('3D Bubbles')).toExist(),
      Scene.expect(Scene.text('Handwriting')).toExist(),
      Scene.expect(Scene.text('Dot Shapes')).toExist(),
      Scene.expect(Scene.text('Shape Match')).toExist(),
      Scene.expect(Scene.text('Picnic Basket')).toExist(),
      acknowledgePointerReorder,
      Scene.Command.expectNone(),
    )
  })

  it('only makes the game card handles draggable', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.selector('.game-card')).not.toHaveAttr('draggable', 'true'),
      Scene.expect(Scene.selector('.game-card-drag-handle')).toHaveAttr('draggable', 'true'),
      acknowledgePointerReorder,
      Scene.Command.expectNone(),
    )
  })

  it('opens Dot Shapes from its landing card', () => {
    Scene.scene(
      { update: Main.update, view: model => model.page._tag === 'PageDotShapes'
        ? DotShapes.view(model.dotShapes, model.language) : view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      acknowledgePointerReorder,
      Scene.click(Scene.text('Dot Shapes')),
      Scene.Mount.expectEnded({ name: 'landingGamePointerReorder' }),
      Scene.expect(Scene.selector('.dot-shapes-board')).toExist(),
      Scene.Mount.resolve({ name: 'dotShapesInput' }, DotShapes.SoundPlayed()),
      Scene.Command.expectNone(),
    )
  })

  it('opens Shape Match from its landing card', () => {
    Scene.scene(
      { update: Main.update, view: model => model.page._tag === 'PageShapeMatch'
        ? ShapeMatch.view(model.shapeMatch, model.language) : view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with({ ...Main.init()[0], muted: true }),
      acknowledgePointerReorder,
      Scene.click(Scene.text('Shape Match')),
      Scene.Mount.expectEnded({ name: 'landingGamePointerReorder' }),
      Scene.expect(Scene.selector('.shape-match-homes')).toExist(),
      Scene.expectAll(Scene.all.selector('.shape-match-home')).toHaveCount(4),
      Scene.expect(Scene.text('Hear the shape')).not.toExist(),
      Scene.expect(Scene.text('Next')).not.toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('opens Picnic Basket from its landing card and acknowledges the spoken order', () => {
    Scene.scene(
      { update: Main.update, view: model => model.page._tag === 'PagePicnicBasket'
        ? PicnicBasket.view(model.picnicBasket, model.language) : view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with({ ...Main.init()[0], muted: false }),
      acknowledgePointerReorder,
      Scene.click(Scene.text('Picnic Basket')),
      Scene.Mount.expectEnded({ name: 'landingGamePointerReorder' }),
      Scene.Command.resolveAll([{ name: 'PicnicBasketFeedback' }, PicnicBasket.FeedbackFinished({ round: 0, token: 1 })]),
      Scene.expect(Scene.selector('.picnic-basket-basket')).toExist(),
      Scene.expectAll(Scene.all.selector('.picnic-basket-food')).toHaveCount(6),
      Scene.expect(Scene.role('button', { name: '3 things' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: 'Remember' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: 'Hear the remaining order again' })).not.toBeDisabled(),
      Scene.expect(Scene.role('status')).toHaveAttr('aria-live', 'polite'),
      Scene.Command.expectNone(),
    )
  })

  it('marks game cards for pointer reordering', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.selector('.game-grid')).toExist(),
      Scene.expect(Scene.selector('.game-card[data-drag-index="0"]')).toExist(),
      Scene.expect(Scene.selector('.game-card[data-drag-index="1"]')).toExist(),
      acknowledgePointerReorder,
      Scene.Command.expectNone(),
    )
  })

  it('renders cards in custom order', () => {
      Scene.scene(
        { update: Main.update, view: () => view([2, 0, 1, 3, 4, 5], visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      acknowledgePointerReorder,
      Scene.Command.expectNone(),
    )
  })

  it('does not render hidden game cards', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, [false, true, false, false, false], 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Find It!')).not.toExist(),
      Scene.expect(Scene.text('Counter')).toExist(),
      acknowledgePointerReorder,
      Scene.Command.expectNone(),
    )
  })

  it('renders built with Foldkit link', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text('Made with Foldkit')).toExist(),
      acknowledgePointerReorder,
      Scene.Command.expectNone(),
    )
  })


})
