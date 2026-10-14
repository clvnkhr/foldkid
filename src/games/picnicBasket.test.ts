import { Effect, Schema as S } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import { normalizeLanguage, t, tf } from '../i18n'
import * as Speech from '../speech'
import * as Picnic from './picnicBasket'
import { foodInfo } from './picnicBasketDomain'
import * as Runtime from './picnicBasketRuntime'

const update = (model: Picnic.Model, message: Picnic.Message) => Picnic.update(model, message, 'en', true, {})
const audible = (model: Picnic.Model, message: Picnic.Message) => Picnic.update(model, message, 'en', false, {})
const view = (model: Picnic.Model) => Picnic.view(model, 'en')
const name = (food: Picnic.Food, language = 'en') => t(foodInfo(food).labelKey, language)
const pick = (model: Picnic.Model, food = model.order[model.step]!) => Picnic.PickFood({ food, round: model.round, token: model.token })
const wrong = (model: Picnic.Model) => model.choices.find(food => food !== model.order[model.step] && !model.order.slice(0, model.step).includes(food))!
const move = (round: number, token: number) => [{ name: 'PicnicBasketMoveFood' }, Picnic.FoodLanded({ round, token })] as const
const refresh = (round: number, token: number) => [{ name: 'PicnicBasketRefreshAfterOrder' }, Picnic.OrderRefreshReady({ round, token })] as const
const arrive = (round: number, token: number) => [{ name: 'PicnicBasketArrive' }, Picnic.BasketArrived({ round, token })] as const
const feedback = (round: number, token: number) => [{ name: 'PicnicBasketFeedback' }, Picnic.FeedbackFinished({ round, token })] as const
const evolve = (messages: readonly Picnic.Message[], initial = Picnic.init()): Picnic.Model => {
  let model = initial
  for (const message of messages) {
    const correct = message._tag === 'PicnicBasketPickFood' && model.status === 'packing' && message.round === model.round &&
      message.token === model.token && message.food === model.order[model.step]
    const last = model.step + 1 === model.order.length
    Story.story(update, Story.with(model), Story.message(message),
      ...(correct ? [Story.Command.resolveAll(move(model.round, model.token + 1)), ...(last ? [
        Story.Command.resolveAll(refresh(model.round, model.token + 1)), Story.Command.resolveAll(arrive(model.round + 1, model.token + 2)),
      ] : [])] : []),
      Story.model(next => { model = next }), Story.Command.expectNone())
  }
  return model
}
const cards: HTMLElement[] = []
const activeCard = (model: Picnic.Model): HTMLElement => {
  const card = document.createElement('div')
  card.className = 'picnic-basket-card'
  card.dataset.picnicRound = String(model.round)
  card.dataset.picnicToken = String(model.token)
  card.dataset.picnicStatus = model.status
  document.body.appendChild(card)
  cards.push(card)
  return card
}
afterEach(() => { cards.splice(0).forEach(card => card.remove()); Audio.resetContext(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Picnic Basket ordered packing', () => {
  it('starts with three requested foods, six choices and visible memory clues', () => {
    const model = Picnic.init()
    expect(model).toMatchObject({ length: 3, remember: true, clue: true, status: 'packing', step: 0, round: 0, token: 0 })
    expect(model.choices).toHaveLength(6)
    expect(model.order).toHaveLength(3)
    expect(new Set(model.order).size).toBe(3)
    expect(S.is(Picnic.Model)(model)).toBe(true)
  })

  it('moves the first requested food before packing it and hides remaining clues only after landing', () => {
    const initial = Picnic.init()
    Story.story(update, Story.with(initial), Story.message(pick(initial)),
      Story.model(model => expect(model).toMatchObject({ status: 'moving', step: 0, clue: true, token: 1 })),
      Story.Command.resolveAll(move(0, 1)),
      Story.model(model => expect(model).toMatchObject({ status: 'packing', step: 1, clue: false, hint: false, token: 1 })), Story.Command.expectNone())
  })

  it('gently hints on out-of-order foods without losing packed items or changing the requested sequence', () => {
    const first = evolve([pick(Picnic.init())])
    const hinted = evolve([pick(first, first.order[2]!)], first)
    expect(hinted).toMatchObject({ status: 'packing', step: 1, hint: true, token: 2 })
    expect(hinted.order).toEqual(first.order)
    expect(hinted.choices).toEqual(first.choices)
    expect(evolve([pick(hinted, wrong(hinted))], hinted)).toEqual(hinted)
    expect(evolve([pick(hinted)], hinted)).toMatchObject({ step: 2, hint: false, status: 'packing' })
  })

  it('repeating reveals and speaks only the uncollected order without resetting the basket', () => {
    const first = evolve([pick(Picnic.init())])
    const repeated = evolve([Picnic.RepeatOrder({ round: first.round, token: first.token })], first)
    expect(repeated).toMatchObject({ step: 1, clue: true, status: 'packing', token: 2 })
    expect(repeated.order).toEqual(first.order)
    expect(Picnic.remainingOrderText(repeated, 'en')).toBe(tf('picnicBasketOrder', 'en', name(first.order[1]!), name(first.order[2]!), ''))
    expect(evolve([pick(repeated)], repeated).clue).toBe(false)
  })

  it('keeps pictures visible in Show mode and preserves the collected step when toggling memory', () => {
    const show = evolve([Picnic.SetRemember({ remember: false })])
    const first = evolve([pick(show)], show)
    expect(first).toMatchObject({ remember: false, clue: true, step: 1 })
    const remember = evolve([Picnic.SetRemember({ remember: true })], first)
    expect(remember).toMatchObject({ remember: true, clue: false, step: 1 })
    expect(remember.order).toEqual(first.order)
    expect(evolve([Picnic.SetRemember({ remember: true })], remember)).toEqual(remember)
  })

  it.each([2, 3] as const)('celebrates complete orders and continues for 100 orders of %s foods', length => {
    let model = length === 2 ? evolve([Picnic.SetLength({ length: 2 })]) : Picnic.init()
    const firstRound = model.round
    for (let order = 0; order < 100; order++) {
      const foods = model.order
      for (const food of foods) model = evolve([pick(model, food)], model)
      expect(model).toMatchObject({ status: 'packing', step: 0, clue: true, length, hint: false, round: firstRound + order + 1 })
      expect(model.choices).toHaveLength(6)
      expect(model.order).toHaveLength(length)
    }
  })

  it('keeps the completed basket until departure and the new empty basket locked until arrival', () => {
    const initial = Picnic.init()
    const completeMoving: Picnic.Model = { ...initial, step: 2, status: 'moving', token: 1 }
    Story.story(update, Story.with(completeMoving), Story.message(Picnic.FoodLanded({ round: 0, token: 1 })),
      Story.model(model => expect(model).toMatchObject({ status: 'complete', step: 3, token: 1 })),
      Story.Command.resolveAll(refresh(0, 1)),
      Story.model(model => expect(model).toMatchObject({ status: 'arriving', step: 0, clue: true, round: 1, token: 2, feedbackPending: false })),
      Story.Command.resolveAll(arrive(1, 2)),
      Story.model(model => expect(model).toMatchObject({ status: 'packing', step: 0, clue: true, round: 1, token: 2 })), Story.Command.expectNone())
    const done: Picnic.Model = { ...initial, step: 3, status: 'complete', token: 1 }
    expect(evolve([pick(done, initial.choices[0]!), Picnic.RepeatOrder({ round: 0, token: 1 }), Picnic.Entered()], done)).toEqual(done)
  })

  it('rejects packed foods, unavailable foods, unknown food ids and malformed preferences', () => {
    const first = evolve([pick(Picnic.init())])
    const absent = Picnic.FOODS.find(food => !first.choices.includes(food.id))!.id
    expect(evolve([
      pick(first, first.order[0]!), pick(first, absent), { _tag: 'PicnicBasketPickFood', food: 'kiwi' as Picnic.Food, round: first.round, token: first.token },
      { _tag: 'PicnicBasketSetLength', length: 4 as 2 },
    ], first)).toEqual(first)
    expect(S.is(Picnic.Message)({ _tag: 'PicnicBasketSetRemember', remember: 'yes' })).toBe(false)
  })

  it.each([-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid round and token %s', invalid => {
    expect(evolve([
      Picnic.PickFood({ food: Picnic.init().order[0]!, round: invalid, token: 0 }), Picnic.PickFood({ food: Picnic.init().order[0]!, round: 0, token: invalid }),
      Picnic.FoodLanded({ round: 0, token: invalid }), Picnic.OrderRefreshReady({ round: invalid, token: 0 }),
      Picnic.BasketArrived({ round: invalid, token: 0 }), Picnic.BasketArrived({ round: 0, token: invalid }),
      Picnic.RepeatOrder({ round: invalid, token: 0 }), Picnic.FeedbackFinished({ round: 0, token: invalid }),
    ])).toEqual(Picnic.init())
  })

  it('blocks duplicate clicks, out-of-order results, repeats and stale acknowledgement during a flight', () => {
    const moving: Picnic.Model = { ...Picnic.init(), status: 'moving', token: 1 }
    expect(evolve([pick(moving), Picnic.RepeatOrder({ round: 0, token: 1 }), Picnic.Entered(),
      Picnic.OrderRefreshReady({ round: 0, token: 1 }), Picnic.FoodLanded({ round: 0, token: 0 })], moving)).toEqual(moving)
    expect(evolve([pick(Picnic.init()), pick(Picnic.init())])).toMatchObject({ step: 1, token: 1, status: 'packing' })
  })

  it('ignores answers, repeats, entry, departure and stale results during arrival', () => {
    const arriving: Picnic.Model = { ...Picnic.init(), status: 'arriving', round: 1, token: 4 }
    expect(evolve([pick(arriving), Picnic.RepeatOrder({ round: 1, token: 4 }), Picnic.Entered(),
      Picnic.OrderRefreshReady({ round: 1, token: 4 }), Picnic.FoodLanded({ round: 1, token: 4 }),
      Picnic.BasketArrived({ round: 0, token: 4 }), Picnic.BasketArrived({ round: 1, token: 3 })], arriving)).toEqual(arriving)
    const packed = evolve([Picnic.BasketArrived({ round: 1, token: 4 })], arriving)
    expect(packed).toMatchObject({ status: 'packing', step: 0, round: 1, token: 4 })
    expect(evolve([Picnic.BasketArrived({ round: 1, token: 4 })], packed)).toEqual(packed)
    expect(evolve([Picnic.BasketArrived({ round: 0, token: 0 })])).toEqual(Picnic.init())
  })

  it('settles a flying food on navigation and invalidates old results without losing its packed position', () => {
    const moving: Picnic.Model = { ...Picnic.init(), status: 'moving', token: 1 }
    const stopped = Picnic.interrupt(moving)
    expect(stopped).toMatchObject({ step: 1, status: 'packing', clue: false, token: 2 })
    expect(evolve([Picnic.FoodLanded({ round: 0, token: 1 })], stopped)).toEqual(stopped)
    expect(evolve([pick(stopped)], stopped)).toMatchObject({ step: 2 })
  })

  it.each(['moving', 'complete'] as const)('navigation during the final %s phase starts a fresh playable order', status => {
    const initial: Picnic.Model = { ...Picnic.init(), status, step: status === 'moving' ? 2 : 3, token: 1 }
    const stopped = Picnic.interrupt(initial)
    expect(stopped).toMatchObject({ step: 0, status: 'packing', clue: true, round: 1, token: 2 })
    expect(evolve([Picnic.FoodLanded({ round: 0, token: 1 }), Picnic.OrderRefreshReady({ round: 0, token: 1 })], stopped)).toEqual(stopped)
  })

  it('settles an interrupted empty basket without replacing its new order or accepting its old arrival', () => {
    const arriving: Picnic.Model = { ...Picnic.init(), status: 'arriving', round: 1, token: 4 }
    const stopped = Picnic.interrupt(arriving)
    expect(stopped).toMatchObject({ status: 'packing', step: 0, clue: true, round: 1, token: 5, feedbackPending: false })
    expect(stopped.order).toEqual(arriving.order)
    expect(stopped.choices).toEqual(arriving.choices)
    expect(evolve([Picnic.BasketArrived({ round: 1, token: 4 })], stopped)).toEqual(stopped)
    expect(evolve([pick(stopped)], stopped)).toMatchObject({ step: 1, status: 'packing' })
  })

  it('changing either mode during arrival cancels the old animation result and leaves a playable order', () => {
    const arriving: Picnic.Model = { ...Picnic.init(), status: 'arriving', round: 1, token: 4 }
    const remembered = evolve([Picnic.SetRemember({ remember: false })], arriving)
    expect(remembered).toMatchObject({ status: 'packing', remember: false, clue: true, round: 1, token: 5 })
    expect(remembered.order).toEqual(arriving.order)
    const shorter = evolve([Picnic.SetLength({ length: 2 })], arriving)
    expect(shorter).toMatchObject({ status: 'packing', length: 2, step: 0, round: 2, token: 5 })
    for (const interrupted of [remembered, shorter]) {
      expect(evolve([Picnic.BasketArrived({ round: 1, token: 4 })], interrupted)).toEqual(interrupted)
    }
  })
})

describe('Picnic Basket effects', () => {
  it('announces on entry, resolves acknowledgements and ignores pending duplicate entry', () => {
    Story.story(audible, Story.with(Picnic.init()), Story.message(Picnic.Entered()),
      Story.Command.resolveAll(feedback(0, 0)), Story.model(model => expect(model.feedbackPending).toBe(true)),
      Story.message(Picnic.Entered()), Story.Command.expectNone(),
      Story.message(Picnic.FeedbackFinished({ round: 0, token: 1 })), Story.Command.expectNone(),
      Story.model(model => expect(model.feedbackPending).toBe(false)), Story.Command.expectNone())
  })

  it('chimes after nonfinal landing and narrates a fresh order only after its empty basket arrives', () => {
    const initial = Picnic.init()
    Story.story(audible, Story.with(initial), Story.message(pick(initial)), Story.Command.resolveAll(move(0, 1)),
      Story.Command.resolveAll(feedback(0, 1)), Story.Command.expectNone())
    const last: Picnic.Model = { ...initial, step: 2, status: 'moving', token: 3 }
    Story.story(audible, Story.with(last), Story.message(Picnic.FoodLanded({ round: 0, token: 3 })),
      Story.Command.resolveAll(refresh(0, 3)),
      Story.model(model => expect(model).toMatchObject({ status: 'arriving', feedbackPending: false })),
      Story.Command.resolveAll(arrive(1, 4)),
      Story.model(model => expect(model).toMatchObject({ status: 'packing', feedbackPending: true })),
      Story.Command.resolveAll(feedback(1, 4)), Story.Command.expectNone())
  })

  it.each([false, true])('acknowledges the empty basket entrance before speech with mute=%s', async muted => {
    const entrance = vi.spyOn(Runtime, 'arrivePicnicBasket').mockReturnValue(Effect.void)
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const complete: Picnic.Model = { ...Picnic.init(), status: 'complete', step: 3, token: 3 }
    const [arriving, commands] = Picnic.update(complete, Picnic.OrderRefreshReady({ round: 0, token: 3 }), 'fr', muted, { rate: .8, pitch: 1.2 })
    expect(commands.map(command => command.name)).toEqual(['PicnicBasketArrive'])
    expect(arriving).toMatchObject({ status: 'arriving', step: 0, feedbackPending: false, round: 1, token: 4 })
    const card = activeCard(arriving)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Picnic.BasketArrived({ round: 1, token: 4 }))
    expect(entrance).toHaveBeenCalledWith(1, 4)
    expect(speak).not.toHaveBeenCalled()
    const [packed, spoken] = Picnic.update(arriving, Picnic.BasketArrived({ round: 1, token: 4 }), 'fr', muted, { rate: .8, pitch: 1.2 })
    expect(packed.status).toBe('packing')
    expect(spoken.map(command => command.name)).toEqual(muted ? [] : ['PicnicBasketFeedback'])
    card.dataset.picnicStatus = 'packing'
    if (!muted) {
      expect(await Effect.runPromise(spoken[0]!.effect)).toEqual(Picnic.FeedbackFinished({ round: 1, token: 4 }))
      expect(speak).toHaveBeenCalledWith(Picnic.remainingOrderText(packed, 'fr'), { rate: .8, pitch: 1.2, lang: 'fr' })
    } else expect(speak).not.toHaveBeenCalled()
  })

  it.each(['en', 'zh', 'fr', 'de', 'fa', 'ms', 'zh-HK', 'ja'])('speaks localized order grammar and root settings in %s', async language => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const initial = Picnic.init()
    const [model, commands] = Picnic.update(initial, Picnic.Entered(), language, false, { rate: .7, pitch: 1.3, lang: 'en' })
    activeCard(model)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Picnic.FeedbackFinished({ round: 0, token: 1 }))
    expect(speak).toHaveBeenCalledWith(tf('picnicBasketOrder', language, name(initial.order[0]!, language), name(initial.order[1]!, language), name(initial.order[2]!, language)), { rate: .7, pitch: 1.3, lang: language })
  })

  it('repeats only the remaining one or two foods and reveals their clues', async () => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    let model = evolve([pick(Picnic.init())])
    const [repeated, commands] = audible(model, Picnic.RepeatOrder({ round: model.round, token: model.token }))
    const card = activeCard(repeated)
    await Effect.runPromise(commands[0]!.effect)
    expect(speak).toHaveBeenLastCalledWith(tf('picnicBasketOrder', 'en', name(model.order[1]!), name(model.order[2]!), ''), { lang: 'en' })
    expect(repeated.clue).toBe(true)
    model = evolve([pick(repeated)], repeated)
    const [one, single] = audible(model, Picnic.RepeatOrder({ round: model.round, token: model.token }))
    card.dataset.picnicToken = String(one.token)
    await Effect.runPromise(single[0]!.effect)
    expect(speak).toHaveBeenLastCalledWith(tf('picnicBasketOrder', 'en', name(model.order[2]!), '', ''), { lang: 'en' })
  })

  it.each([false, true])('gates the celebration chime with mute=%s while always refreshing', async muted => {
    const chime = vi.spyOn(Audio, 'chime').mockImplementation(message => ({ name: 'PlayChime', effect: Effect.succeed(message) }))
    const wait = vi.spyOn(Runtime, 'waitPicnicRefresh').mockReturnValue(Effect.void)
    const final: Picnic.Model = { ...Picnic.init(), status: 'moving', step: 2, token: 3 }
    const [model, commands] = Picnic.update(final, Picnic.FoodLanded({ round: 0, token: 3 }), 'en', muted, {})
    activeCard(model)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Picnic.OrderRefreshReady({ round: 0, token: 3 }))
    expect(wait).toHaveBeenCalledWith(0, 3)
    expect(chime).toHaveBeenCalledTimes(muted ? 0 : 1)
  })

  it.each(['missing', 'changed round', 'newer token'])('skips stale speech with %s DOM after commit', async change => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const [model, commands] = audible(Picnic.init(), Picnic.Entered())
    const card = activeCard(model)
    if (change === 'missing') card.remove()
    else if (change === 'changed round') card.dataset.picnicRound = '1'
    else card.dataset.picnicToken = '2'
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Picnic.FeedbackFinished({ round: 0, token: 1 }))
    expect(speak).not.toHaveBeenCalled()
  })

  it('acknowledges missing APIs, failed chimes and rejected speech', async () => {
    vi.stubGlobal('speechSynthesis', undefined); vi.stubGlobal('SpeechSynthesisUtterance', undefined); vi.stubGlobal('AudioContext', undefined)
    const [model, commands] = audible(Picnic.init(), Picnic.Entered())
    const card = activeCard(model)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Picnic.FeedbackFinished({ round: 0, token: 1 }))
    vi.spyOn(Speech, 'speakNow').mockImplementation(() => { throw new Error('blocked speech') })
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Picnic.FeedbackFinished({ round: 0, token: 1 }))
    const moving: Picnic.Model = { ...Picnic.init(), status: 'moving', token: 2 }
    const [, chimes] = audible(moving, Picnic.FoodLanded({ round: 0, token: 2 }))
    card.dataset.picnicToken = '2'
    vi.spyOn(Audio, 'chime').mockReturnValue({ name: 'PlayChime', effect: Effect.die(new Error('blocked chime')) })
    expect(await Effect.runPromise(chimes[0]!.effect)).toEqual(Picnic.FeedbackFinished({ round: 0, token: 2 }))
  })

  it('resolves movement, departure and arrival effect failures so the model keeps progressing', async () => {
    vi.spyOn(Runtime, 'movePicnicFood').mockReturnValue(Effect.die(new Error('blocked')))
    vi.spyOn(Runtime, 'waitPicnicRefresh').mockReturnValue(Effect.die(new Error('blocked')))
    vi.spyOn(Runtime, 'arrivePicnicBasket').mockReturnValue(Effect.die(new Error('blocked')))
    const [, moving] = update(Picnic.init(), pick(Picnic.init()))
    expect(await Effect.runPromise(moving[0]!.effect)).toEqual(Picnic.FoodLanded({ round: 0, token: 1 }))
    const last: Picnic.Model = { ...Picnic.init(), status: 'moving', step: 2, token: 3 }
    const [, refreshes] = update(last, Picnic.FoodLanded({ round: 0, token: 3 }))
    expect(await Effect.runPromise(refreshes[0]!.effect)).toEqual(Picnic.OrderRefreshReady({ round: 0, token: 3 }))
    const complete: Picnic.Model = { ...last, status: 'complete', step: 3 }
    const [arriving, arrivals] = update(complete, Picnic.OrderRefreshReady({ round: 0, token: 3 }))
    const arrived = await Effect.runPromise(arrivals[0]!.effect)
    expect(arrived).toEqual(Picnic.BasketArrived({ round: 1, token: 4 }))
    expect(evolve([arrived], arriving)).toMatchObject({ status: 'packing', step: 0, round: 1, token: 4 })
  })

  it('constructs commands without reading the DOM or global random state in update', () => {
    const queried = vi.spyOn(document, 'querySelector').mockImplementation(() => { throw new Error('DOM read in update') })
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global random') })
    expect(audible(Picnic.init(), pick(Picnic.init()))[1][0]!.name).toBe('PicnicBasketMoveFood')
    expect(audible(Picnic.init(), Picnic.Entered())[1][0]!.name).toBe('PicnicBasketFeedback')
    const complete: Picnic.Model = { ...Picnic.init(), status: 'complete', step: 3 }
    expect(audible(complete, Picnic.OrderRefreshReady({ round: 0, token: 0 }))[1][0]!.name).toBe('PicnicBasketArrive')
    expect(queried).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled()
  })
})

describe('Picnic Basket accessible view', () => {
  it('uses native food/mode/basket buttons, selected defaults and six accessible food names', () => {
    const initial = Picnic.init()
    Scene.scene({ update, view }, Scene.with(initial),
      Scene.expect(Scene.role('button', { name: t('picnicBasketThree', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('picnicBasketRemember', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('picnicBasketRepeat', 'en') })).not.toBeDisabled(),
      ...initial.choices.map(food => Scene.expect(Scene.role('button', { name: name(food) })).not.toBeDisabled()),
      Scene.expect(Scene.role('status')).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.selector('svg')).toHaveAttr('aria-hidden', 'true'), Scene.expect(Scene.selector('svg')).toHaveAttr('focusable', 'false'), Scene.Command.expectNone())
  })

  it('has precise flight source and slot targets, then keeps collected pictures and hides only remaining order labels', () => {
    const initial = Picnic.init()
    Scene.scene({ update, view }, Scene.with(initial),
      Scene.click(Scene.role('button', { name: name(initial.order[0]!) })),
      Scene.expect(Scene.selector('.picnic-basket-card')).toHaveAttr('data-picnic-moving-food', initial.order[0]!),
      Scene.expect(Scene.selector('.picnic-basket-basket-slot')).toHaveAttr('data-picnic-slot', '0'),
      Scene.expect(Scene.selector('.picnic-basket-card')).toHaveAttr('aria-busy', 'true'),
      Scene.Command.resolveAll(move(0, 1)),
      Scene.expect(Scene.selector('.picnic-basket-basket-slot--filled')).toExist(),
      Scene.expect(Scene.role('button', { name: tf('picnicBasketFoodLabel', 'en', name(initial.order[0]!), true) })).toBeDisabled(),
      Scene.expect(Scene.selector('.picnic-basket-order-slot--packed')).toExist(), Scene.expect(Scene.selector('.picnic-basket-order-slot--hidden')).toExist(),
      Scene.expect(Scene.role('listitem', { name: tf('picnicBasketHiddenItem', 'en', '2') })).toExist(),
      Scene.expect(Scene.role('listitem', { name: tf('picnicBasketOrderItem', 'en', '2', name(initial.order[1]!)) })).not.toExist(),
      Scene.expect(Scene.role('button', { name: name(initial.order[1]!) })).toHaveAttr('data-multitouch-revision', '0-1'),
      Scene.click(Scene.role('button', { name: t('picnicBasketRepeat', 'en') })),
      Scene.expect(Scene.selector('.picnic-basket-order-slot--hidden')).not.toExist(),
      Scene.expect(Scene.role('listitem', { name: tf('picnicBasketOrderItem', 'en', '2', name(initial.order[1]!)) })).toExist(), Scene.Command.expectNone())
  })

  it.each(['moving', 'complete', 'arriving'] as const)('disables answers and repeat during %s and keeps native preference controls available', status => {
    const busy: Picnic.Model = { ...Picnic.init(), status }
    Scene.scene({ update, view }, Scene.with(busy),
      Scene.expect(Scene.selector('.picnic-basket-card')).toHaveAttr('data-picnic-status', status),
      Scene.expect(Scene.selector('.picnic-basket-card')).toHaveAttr('aria-busy', 'true'),
      Scene.expect(Scene.role('button', { name: t('picnicBasketRepeat', 'en') })).toBeDisabled(),
      Scene.expect(Scene.role('button', { name: name(busy.order[0]!) })).toBeDisabled(),
      Scene.expect(Scene.role('button', { name: t('picnicBasketTwo', 'en') })).not.toBeDisabled(), Scene.Command.expectNone())
  })

  it('renders fresh empty slots while arriving and unlocks them only after the entrance acknowledgement', () => {
    const last: Picnic.Model = { ...Picnic.init(), step: 2, token: 3 }
    Scene.scene({ update, view }, Scene.with(last),
      Scene.click(Scene.role('button', { name: name(last.order[2]!) })),
      Scene.Command.resolveAll(move(0, 4)), Scene.Command.resolveAll(refresh(0, 4)),
      Scene.expect(Scene.selector('.picnic-basket-card')).toHaveAttr('data-picnic-status', 'arriving'),
      Scene.expect(Scene.selector('.picnic-basket-basket-slot--filled')).not.toExist(),
      Scene.expect(Scene.selector('.picnic-basket-sparkle')).not.toExist(),
      Scene.expect(Scene.role('button', { name: t('picnicBasketRepeat', 'en') })).toHaveAttr('data-multitouch-revision', '1-0'),
      Scene.Command.resolveAll(arrive(1, 5)),
      Scene.expect(Scene.selector('.picnic-basket-card')).toHaveAttr('data-picnic-status', 'packing'),
      Scene.expect(Scene.selector('.picnic-basket-card')).toHaveAttr('aria-busy', 'false'),
      Scene.expect(Scene.role('button', { name: t('picnicBasketRepeat', 'en') })).not.toBeDisabled(), Scene.Command.expectNone())
  })

  it('shows a full basket and a localized celebration without adding Next or score controls', () => {
    const complete: Picnic.Model = { ...Picnic.init(), status: 'complete', step: 3 }
    Scene.scene({ update, view }, Scene.with(complete),
      Scene.expect(Scene.selector('.picnic-basket-sparkle')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.role('status')).toHaveText(t('picnicBasketPacked', 'en')),
      Scene.expect(Scene.role('button', { name: t('next', 'en') })).not.toExist(), Scene.Command.expectNone())
  })

  it.each(['fa', 'fr', 'zh-HK', 'unknown'])('localizes food/order/basket labels and position numbers in %s', language => {
    const model = evolve([pick(Picnic.init())])
    const number = new Intl.NumberFormat(normalizeLanguage(language))
    Scene.scene({ update, view: item => Picnic.view(item, language) }, Scene.with(model),
      Scene.expect(Scene.role('button', { name: t('picnicBasketRepeat', language) })).toExist(),
      Scene.expect(Scene.role('listitem', { name: tf('picnicBasketHiddenItem', language, number.format(2)) })).toExist(),
      Scene.expect(Scene.role('img', { name: tf('picnicBasketBasketItem', language, number.format(1), name(model.order[0]!, language)) })).toExist(), Scene.Command.expectNone())
  })
})
