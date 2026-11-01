import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import { html } from 'foldkit/html'
import { LANDING_GAME_COUNT, LANDING_GAMES, view } from './landing'
import * as Main from '../main'
import * as DotShapes from '../games/dotShapes'
import * as ShapeMatch from '../games/shapeMatch'
import * as PicnicBasket from '../games/picnicBasket'
import { ClickedCounter, ClickedRandomGame, LandingDragEnded, LandingRandomChosen } from '../message'

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
      'colorMixingTitle', 'sequenceWordsTitle', 'tarotTitle',
    ])
    expect(LANDING_GAMES[19]?.msg()).toEqual({ _tag: 'ClickedDotShapes' })
    expect(LANDING_GAMES[19]?.emoji).toBe('🔺')
    expect(LANDING_GAMES[20]?.msg()).toEqual({ _tag: 'ClickedShapeMatch' })
    expect(LANDING_GAMES[21]?.msg()).toEqual({ _tag: 'ClickedPicnicBasket' })
    expect(LANDING_GAMES.at(-1)?.msg()).toEqual({ _tag: 'ClickedTarot' })
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
      Scene.expect(Scene.text('Color Mixing')).toExist(),
      Scene.expect(Scene.text('Sequence Words')).toExist(),
      Scene.expect(Scene.text('Tarot Tales')).toExist(),
      acknowledgePointerReorder,
      Scene.Command.expectNone(),
    )
  })

  it('renders each game as an accessible native button with decorative emoji and a localized grab handle', () => {
    Scene.scene(
      { update: Main.update, view: () => view(defaultOrder, visibleGames, 'fr', -1) },
      Scene.with(Main.init()[0]), acknowledgePointerReorder,
      Scene.expect(Scene.role('button', { name: 'Compteur' })).toHaveAttr('type', 'button'),
      Scene.expect(Scene.selector('.game-emoji')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.selector('.game-card-drag-handle')).toHaveAttr('aria-label', 'Réorganiser le jeu'),
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


  it('provides an accessible native Random game button in the landing header', () => {
    Scene.scene({ update: Main.update, view: () => view(defaultOrder, visibleGames, 'en', -1) },
      Scene.with(Main.init()[0]), acknowledgePointerReorder,
      Scene.expect(Scene.role('button', { name: /Random game/ })).toHaveHandler('click'),
      Scene.expect(Scene.selector('.header button')).toExist(), Scene.Command.expectNone())
  })

  it.each([[0, 'PageCounter'], [.999999, 'PageFindIt']] as const)('opens %s from the currently visible games through Random game', (sample, page) => {
    const hidden = defaultOrder.map(index => index !== 0 && index !== 1)
    const initial = { ...Main.init()[0], landingOrder: defaultOrder, landingHiddenGames: hidden }
    Scene.scene({ update: Main.update, view: model => {
      const h = html<Main.Message>()
      return h.div([], [view(model.landingOrder, model.landingHiddenGames, model.language, -1), h.p([h.Id('random-game-page')], [model.page._tag])])
    } }, Scene.with(initial), acknowledgePointerReorder,
      Scene.click(Scene.role('button', { name: /Random game/ })),
      Scene.Command.resolveAll([{ name: 'LandingPickRandomGame' }, LandingRandomChosen({ sample, token: 1 })]),
      Scene.expect(Scene.selector('#random-game-page')).toHaveText(page), Scene.Command.expectNone())
  })

  it('samples the visible games in the saved order without selecting hidden cards', () => {
    const initial = { ...Main.init()[0], landingOrder: [1, 0, ...defaultOrder.slice(2)], landingHiddenGames: defaultOrder.map(index => index !== 0 && index !== 1) }
    Story.story(Main.update, Story.with(initial), Story.message(ClickedRandomGame()),
      Story.model(model => expect(model.landingRandomToken).toBe(1)),
      Story.Command.resolveAll([{ name: 'LandingPickRandomGame' }, LandingRandomChosen({ sample: 0, token: 1 })]),
      Story.model(model => expect(model.page._tag).toBe('PageFindIt')), Story.Command.expectNone())
  })

  it.each([-1, 1, Infinity, NaN])('rejects an invalid random sample %s without navigating', sample => {
    Story.story(Main.update, Story.with(Main.init()[0]), Story.message(ClickedRandomGame()),
      Story.Command.resolveAll([{ name: 'LandingPickRandomGame' }, LandingRandomChosen({ sample, token: 1 })]),
      Story.model(model => expect(model.page._tag).toBe('PageLanding')), Story.Command.expectNone())
  })

  it('ignores a late random choice after another game has been opened', () => {
    const [pending, commands] = Main.update(Main.init()[0], ClickedRandomGame())
    expect(commands.map(command => command.name)).toEqual(['LandingPickRandomGame'])
    const [opened, navigation] = Main.update(pending, ClickedCounter())
    expect(navigation).toEqual([])
    expect(Main.update(opened, LandingRandomChosen({ sample: .99, token: 1 }))).toEqual([opened, []])
  })

  it('disables Random game when the rendered catalogue has no visible cards', () => {
    Scene.scene({ update: Main.update, view: () => view(defaultOrder, defaultOrder.map(() => true), 'en', -1) },
      Scene.with(Main.init()[0]), acknowledgePointerReorder,
      Scene.expect(Scene.role('button', { name: /Random game/ })).toBeDisabled(), Scene.Command.expectNone())
  })


})
