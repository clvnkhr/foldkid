import { Effect, Match as M, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { chime } from '../audio'
import { normalizeLanguage, t, tf } from '../i18n'
import { speakNow, type SpeechOptions } from '../speech'
import { DEFAULT_SEED, Food, foodInfo, generateOrder } from './picnicBasketDomain'
import { arrivePicnicBasket, movePicnicFood, waitPicnicRefresh } from './picnicBasketRuntime'
export { Food, FOODS } from './picnicBasketDomain'

export const Length = S.Literals([2, 3])
export const Model = S.Struct({
  choices: S.Array(Food), order: S.Array(Food), step: S.Number, length: Length, remember: S.Boolean,
  clue: S.Boolean, hint: S.Boolean, status: S.Literals(['packing', 'moving', 'complete', 'arriving']),
  round: S.Number, token: S.Number, rngSeed: S.Number, feedbackPending: S.Boolean,
})
export type Model = typeof Model.Type
export const PickFood = m('PicnicBasketPickFood', { food: Food, round: S.Number, token: S.Number })
export const FoodLanded = m('PicnicBasketFoodLanded', { round: S.Number, token: S.Number })
export const OrderRefreshReady = m('PicnicBasketOrderRefreshReady', { round: S.Number, token: S.Number })
export const BasketArrived = m('PicnicBasketBasketArrived', { round: S.Number, token: S.Number })
export const Entered = m('PicnicBasketEntered')
export const SetLength = m('PicnicBasketSetLength', { length: Length })
export const SetRemember = m('PicnicBasketSetRemember', { remember: S.Boolean })
export const RepeatOrder = m('PicnicBasketRepeatOrder', { round: S.Number, token: S.Number })
export const FeedbackFinished = m('PicnicBasketFeedbackFinished', { round: S.Number, token: S.Number })
export const Message = S.Union([PickFood, FoodLanded, OrderRefreshReady, BasketArrived, Entered, SetLength, SetRemember, RepeatOrder, FeedbackFinished])
export type Message = typeof Message.Type

export const init = (): Model => ({
  ...generateOrder(DEFAULT_SEED, 3), step: 0, length: 3, remember: true, clue: true, hint: false,
  status: 'packing', round: 0, token: 0, feedbackPending: false,
})
const nextOrder = (model: Model): Model => ({
  ...model, ...generateOrder(model.rngSeed, model.length), step: 0, clue: true, hint: false, status: 'packing',
  round: model.round + 1, token: model.token + 1, feedbackPending: false,
})
const land = (model: Model): Model => ({
  ...model, step: model.step + 1, status: model.step + 1 === model.order.length ? 'complete' : 'packing',
  clue: !model.remember, hint: false, feedbackPending: false,
})
export const interrupt = (model: Model): Model => {
  const settled = model.status === 'moving' ? land(model) : model
  return settled.status === 'complete' ? nextOrder(settled) : {
    ...settled, status: settled.status === 'arriving' ? 'packing' : settled.status,
    token: model.token + 1, feedbackPending: false,
  }
}
const validRevision = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
const current = (model: Model, message: { readonly round: number; readonly token: number }): boolean =>
  validRevision(message.round) && message.round === model.round && validRevision(message.token) && message.token === model.token
const validStep = (model: Model): boolean => Number.isSafeInteger(model.step) && model.step >= 0 && model.step < model.order.length
const foodName = (food: Food, language: string): string => t(foodInfo(food).labelKey, language)
export const remainingOrderText = (model: Model, language: string): string => {
  const remaining = model.order.slice(model.step).map(food => foodName(food, language))
  return tf('picnicBasketOrder', language, remaining[0] ?? '', remaining[1] ?? '', remaining[2] ?? '')
}
const currentCard = (round: number, token: number): boolean => {
  if (typeof document === 'undefined') return false
  const card = document.querySelector<HTMLElement>('.picnic-basket-card')
  return card !== null && card.dataset.picnicRound === String(round) && card.dataset.picnicToken === String(token)
}
const feedback = (model: Model, language: string, muted: boolean, speech: SpeechOptions, kind: 'order' | 'chime'): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const next = { ...model, feedbackPending: !muted }
  if (muted) return [next, []]
  const done = FeedbackFinished({ round: next.round, token: next.token })
  return [next, [{
    name: 'PicnicBasketFeedback',
    effect: Effect.gen(function* () {
      yield* Render.afterCommit
      if (!currentCard(next.round, next.token)) return done
      if (kind === 'chime') yield* chime(done).effect.pipe(Effect.catchCause(() => Effect.succeed(done)))
      else yield* Effect.sync(() => speakNow(remainingOrderText(next, language), { ...speech, lang: language }))
      return done
    }).pipe(Effect.catchCause(() => Effect.succeed(done))),
  }]]
}

export const update = (model: Model, message: Message, language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    PicnicBasketPickFood: msg => {
      if (!current(model, msg) || model.status !== 'packing' || !validStep(model) || !S.is(Food)(msg.food) ||
        !model.choices.includes(msg.food) || model.order.slice(0, model.step).includes(msg.food)) return [model, []]
      if (msg.food !== model.order[model.step]) return model.hint ? [model, []] : [{ ...model, hint: true, token: model.token + 1, feedbackPending: false }, []]
      const next: Model = { ...model, status: 'moving', hint: false, token: model.token + 1, feedbackPending: false }
      const done = FoodLanded({ round: next.round, token: next.token })
      return [next, [{ name: 'PicnicBasketMoveFood', effect: movePicnicFood(next.round, next.token, next.step).pipe(Effect.as(done), Effect.catchCause(() => Effect.succeed(done))) }]]
    },
    PicnicBasketFoodLanded: msg => {
      if (!current(model, msg) || model.status !== 'moving' || !validStep(model)) return [model, []]
      const next = land(model)
      if (next.status !== 'complete') return feedback(next, language, muted, speech, 'chime')
      const done = OrderRefreshReady({ round: next.round, token: next.token })
      return [next, [{ name: 'PicnicBasketRefreshAfterOrder', effect: Effect.gen(function* () {
        yield* Render.afterCommit
        if (!muted && currentCard(next.round, next.token)) yield* chime(done).effect.pipe(Effect.catchCause(() => Effect.succeed(done)))
        yield* waitPicnicRefresh(next.round, next.token)
        return done
      }).pipe(Effect.catchCause(() => Effect.succeed(done))) }]]
    },
    PicnicBasketOrderRefreshReady: msg => {
      if (!current(model, msg) || model.status !== 'complete') return [model, []]
      const next: Model = { ...nextOrder(model), status: 'arriving' }
      const done = BasketArrived({ round: next.round, token: next.token })
      return [next, [{ name: 'PicnicBasketArrive', effect: arrivePicnicBasket(next.round, next.token).pipe(Effect.as(done), Effect.catchCause(() => Effect.succeed(done))) }]]
    },
    PicnicBasketBasketArrived: msg => current(model, msg) && model.status === 'arriving'
      ? feedback({ ...model, status: 'packing' }, language, muted, speech, 'order') : [model, []],
    PicnicBasketEntered: () => model.status === 'packing' && !model.feedbackPending && validStep(model)
      ? feedback({ ...model, token: model.token + 1 }, language, muted, speech, 'order') : [model, []],
    PicnicBasketSetLength: msg => S.is(Length)(msg.length) && msg.length !== model.length
      ? feedback(nextOrder({ ...model, length: msg.length }), language, muted, speech, 'order') : [model, []],
    PicnicBasketSetRemember: msg => {
      if (typeof msg.remember !== 'boolean' || msg.remember === model.remember) return [model, []]
      const settled = interrupt(model)
      return feedback({ ...settled, remember: msg.remember, clue: !msg.remember || settled.step === 0 }, language, muted, speech, 'order')
    },
    PicnicBasketRepeatOrder: msg => current(model, msg) && model.status === 'packing' && validStep(model)
      ? feedback({ ...model, token: model.token + 1, clue: true, hint: false }, language, muted, speech, 'order') : [model, []],
    PicnicBasketFeedbackFinished: msg => current(model, msg) && model.feedbackPending
      ? [{ ...model, feedbackPending: false }, []] : [model, []],
  }))

export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const numbers = new Intl.NumberFormat(normalizeLanguage(language))
  const busy = model.status !== 'packing'
  const revision = `${model.round}-${model.step}`
  const status = model.hint ? t('picnicBasketTryAgain', language) : model.status === 'complete' ? t('picnicBasketPacked', language)
    : model.step > 0 ? tf('picnicBasketPicked', language, foodName(model.order[model.step - 1]!, language)) : remainingOrderText(model, language)
  return h.div([h.Class('page picnic-basket-page')], [h.div([
    h.Class('card picnic-basket-card'), h.Attribute('data-picnic-round', String(model.round)), h.Attribute('data-picnic-token', String(model.token)),
    h.Attribute('data-picnic-status', model.status),
    h.Attribute('data-picnic-moving-food', model.status === 'moving' ? model.order[model.step] ?? '' : ''), h.Attribute('aria-busy', String(busy)),
  ], [
    h.div([h.Class('picnic-basket-header')], [h.h1([h.Class('title picnic-basket-title')], [t('picnicBasketTitle', language)])]),
    h.div([h.Class('picnic-basket-modes'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('picnicBasketLength', language))],
      ([2, 3] as const).map(length => h.button([h.Class('picnic-basket-mode'), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(model.length === length)), h.OnClick(SetLength({ length }))],
        [t(length === 2 ? 'picnicBasketTwo' : 'picnicBasketThree', language)]))),
    h.div([h.Class('picnic-basket-modes'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('picnicBasketMemory', language))],
      ([false, true] as const).map(remember => h.button([h.Class('picnic-basket-mode'), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(model.remember === remember)), h.OnClick(SetRemember({ remember }))],
        [t(remember ? 'picnicBasketRemember' : 'picnicBasketShow', language)]))),
    h.div([h.Class('picnic-basket-order'), h.Attribute('role', 'list'), h.Attribute('dir', 'ltr')], model.order.map((food, index) => {
      const packed = index < model.step
      const hidden = !packed && model.remember && !model.clue
      const position = numbers.format(index + 1)
      return h.div([h.Class(`picnic-basket-order-slot${packed ? ' picnic-basket-order-slot--packed' : hidden ? ' picnic-basket-order-slot--hidden' : ''}`), h.Key(`order-${model.round}-${index}`),
        h.Attribute('role', 'listitem'), h.Attribute('aria-label', hidden ? tf('picnicBasketHiddenItem', language, position) : tf('picnicBasketOrderItem', language, position, foodName(food, language)))], [
        h.span([h.Class('picnic-basket-food-icon'), h.AriaHidden(true)], [hidden ? '?' : foodInfo(food).emoji]),
        ...(index < model.order.length - 1 ? [h.span([h.Class('picnic-basket-order-arrow'), h.AriaHidden(true)], ['→'])] : []),
      ])
    })),
    h.div([h.Class('picnic-basket-board')], [
      h.button([h.Class('picnic-basket-basket'), h.Key(`basket-${model.round}`), h.Attribute('type', 'button'), h.Attribute('aria-label', t('picnicBasketRepeat', language)), h.Attribute('data-multitouch-revision', revision), h.Disabled(busy), h.OnClick(RepeatOrder({ round: model.round, token: model.token }))], [
        h.svg([h.ViewBox('0 0 300 220'), h.AriaHidden(true), h.Attribute('focusable', 'false')], [
          h.path([h.D('M 73 98 V 74 A 77 62 0 0 1 227 74 V 98'), h.Fill('none'), h.Stroke('#ad713c'), h.Attribute('stroke-width', '12'), h.Attribute('stroke-linecap', 'round')], []),
          h.path([h.D('M 38 86 H 262 Q 276 86 271 100 L 246 189 Q 244 202 230 202 H 70 Q 56 202 54 189 L 29 100 Q 24 86 38 86 Z'), h.Fill('#e7aa61'), h.Stroke('#ad713c'), h.Attribute('stroke-width', '7')], []),
          ...[112, 138, 164, 188].map(y => h.line([h.X1(String(43 + (y - 112) / 5)), h.Y1(String(y)), h.X2(String(257 - (y - 112) / 5)), h.Y2(String(y)), h.Stroke('#c78d4e'), h.Attribute('stroke-width', '5')], [])),
          ...[70, 100, 130, 160, 190, 220].map(x => h.line([h.X1(String(x)), h.Y1('94'), h.X2(String(x)), h.Y2('194'), h.Stroke('#f9c982'), h.Attribute('stroke-width', '4')], [])),
          h.path([h.D('M 38 86 H 262'), h.Stroke('#f8c982'), h.Attribute('stroke-width', '12'), h.Attribute('stroke-linecap', 'round')], []),
        ]),
        h.span([h.Class('picnic-basket-basket-items')], model.order.map((food, index) => h.span([
          h.Class(`picnic-basket-basket-slot${index < model.step ? ' picnic-basket-basket-slot--filled' : ''}`), h.Attribute('data-picnic-slot', String(index)),
          h.Attribute('role', 'img'), h.Attribute('aria-label', index < model.step ? tf('picnicBasketBasketItem', language, numbers.format(index + 1), foodName(food, language)) : tf('picnicBasketSlot', language, numbers.format(index + 1))),
        ], [index < model.step ? foodInfo(food).emoji : '']))),
        ...(model.status === 'complete' ? [h.span([h.Class('picnic-basket-sparkle'), h.AriaHidden(true)], ['✦'])] : []),
      ]),
      h.div([h.Class('picnic-basket-choices'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('picnicBasketChoices', language))], model.choices.map(food => {
        const packed = model.order.slice(0, model.step).includes(food)
        return h.button([h.Class(`picnic-basket-food${packed ? ' picnic-basket-food--packed' : ''}`), h.Key(`food-${food}`), h.Attribute('type', 'button'),
          h.Attribute('data-picnic-food', food), h.Attribute('data-multitouch-revision', revision), h.Disabled(busy || packed),
          h.Attribute('aria-label', tf('picnicBasketFoodLabel', language, foodName(food, language), packed)), h.OnClick(PickFood({ food, round: model.round, token: model.token })),
        ], [h.span([h.Class('picnic-basket-food-icon'), h.AriaHidden(true)], [foodInfo(food).emoji])])
      })),
    ]),
    h.p([h.Class('picnic-basket-status'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [status]),
  ])])
}
