import { Effect, Match as M, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { t } from '../i18n'
import { cardDrop } from '../audio'
import { renderTarotArt, renderTarotBack } from './tarotArt'
import { speakNow, type SpeechOptions } from '../speech'
import { cardKey, drawCard, fullDeck, meaningKey, sampleDropAngle, TAROT_CARDS } from './tarotDomain'
import { mountTarotDeck, moveTarotCardToSlot, reshuffleTarotPile } from './tarotRuntime'

export const Mode = S.Literals(['recognize', 'story'])
export type Mode = typeof Mode.Type
export const Model = S.Struct({
  mode: Mode, token: S.Number, seed: S.Number, remaining: S.Array(S.Number), drawn: S.Number,
  pile: S.Array(S.Number), pileAngles: S.Array(S.Number), cursor: S.Number, pendingSlot: S.Number, spread: S.Array(S.Number), phase: S.Literals(['ready', 'moving', 'shuffling', 'complete']),
})
export type Model = typeof Model.Type
export const Entered = m('TarotEntered')
export const SeedReady = m('TarotSeedReady', { token: S.Number, seed: S.Number })
export const DrawRequested = m('TarotDrawRequested', { token: S.Number })
export const PreviousCard = m('TarotPreviousCard', { token: S.Number })
export const CardArrived = m('TarotCardArrived', { token: S.Number, slot: S.Number })
export const SetMode = m('TarotSetMode', { mode: Mode })
export const NextReading = m('TarotNextReading', { token: S.Number })
export const ShuffleFinished = m('TarotShuffleFinished', { token: S.Number })
export const FeedbackFinished = m('TarotFeedbackFinished', { token: S.Number })
export const Message = S.Union([Entered, SeedReady, DrawRequested, PreviousCard, CardArrived, SetMode, NextReading, ShuffleFinished, FeedbackFinished])
export type Message = typeof Message.Type
export const init = (): Model => ({ mode: 'recognize', token: 0, seed: 0x705ac, remaining: fullDeck(), drawn: -1, pile: [], pileAngles: [], cursor: -1, pendingSlot: -1, spread: [], phase: 'ready' })
export const interrupt = (model: Model): Model => ({ ...model, token: model.token + 1,
  ...(model.phase === 'shuffling' ? { remaining: fullDeck(), pile: [], pileAngles: [], cursor: -1, drawn: -1, phase: model.spread.length === 3 ? 'complete' as const : 'ready' as const } : {}),
  ...(model.phase === 'moving' ? { phase: model.spread.length === 3 ? 'complete' as const : 'ready' as const, pendingSlot: -1 } : {}),
})
const freshDeck = (model: Model, mode: Mode): Model => ({ ...init(), mode, token: model.token + 1, seed: model.seed })
const current = (model: Model, token: number): boolean => Number.isSafeInteger(token) && token >= 0 && model.token === token
const validCard = (card: number): boolean => Number.isSafeInteger(card) && card >= 0 && card < TAROT_CARDS.length
const feedback = (model: Model, language: string, muted: boolean, speech: SpeechOptions, drop = true): ReadonlyArray<Command.Command<Message>> => {
  if (muted) return []
  const done = FeedbackFinished({ token: model.token })
  return [{ name: 'TarotFeedback', effect: Effect.gen(function* () {
    yield* Render.afterCommit
    const live = typeof document !== 'undefined' && document.querySelector('.tarot-card')?.getAttribute('data-tarot-token') === String(model.token)
    if (live) {
      yield* Effect.sync(() => speakNow(t(cardKey(model.drawn), language), { ...speech, lang: language }))
      if (drop) yield* cardDrop(done).effect.pipe(Effect.catchCause(() => Effect.succeed(done)))
    }
    return done
  }).pipe(Effect.catchCause(() => Effect.succeed(done))) }]
}
export const update = (model: Model, message: Message, language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    TarotEntered: () => {
      const next = interrupt(model)
      return [next, [{ name: 'TarotRandomSeed', effect: Effect.sync(() => SeedReady({ token: next.token, seed: Math.floor(Math.random() * 0x100000000) })) }]]
    },
    TarotSeedReady: msg => current(model, msg.token) && Number.isSafeInteger(msg.seed) && msg.seed >= 0 && msg.seed <= 0xffffffff
      ? [{ ...model, seed: msg.seed }, []] : [model, []],
    TarotDrawRequested: msg => {
      if (!current(model, msg.token) || model.phase !== 'ready') return [model, []]
      const available = model.mode === 'story' ? model.remaining.filter(card => !model.spread.includes(card)) : model.remaining
      const draw = drawCard(available, model.seed)
      const tilt = sampleDropAngle(draw.seed)
      const spread = model.mode === 'story' ? [...model.spread, draw.card] : []
      const next: Model = { ...model, remaining: draw.remaining, seed: tilt.seed, drawn: draw.card, token: model.token + 1,
        pile: [...model.pile, draw.card], pileAngles: [...model.pileAngles, tilt.angle], cursor: model.pile.length,
        spread, pendingSlot: model.mode === 'story' ? spread.length - 1 : -1,
        phase: model.mode === 'story' ? 'moving' : draw.remaining.length === 0 ? 'shuffling' : 'ready' }
      const commands = feedback(next, language, muted, speech)
      if (next.phase === 'moving') return [next, [...commands, {
        name: 'TarotMoveCardToSlot', effect: moveTarotCardToSlot(next.token, next.pendingSlot).pipe(Effect.as(CardArrived({ token: next.token, slot: next.pendingSlot })), Effect.catchCause(() => Effect.succeed(CardArrived({ token: next.token, slot: next.pendingSlot })))),
      }]]
      return [next, next.phase === 'shuffling' ? [...commands, {
        name: 'TarotReshufflePile', effect: reshuffleTarotPile(next.token).pipe(Effect.as(ShuffleFinished({ token: next.token })), Effect.catchCause(() => Effect.succeed(ShuffleFinished({ token: next.token })))),
      }] : commands]
    },
    TarotPreviousCard: msg => {
      if (model.mode !== 'recognize' || !current(model, msg.token) || (model.phase !== 'ready' && model.phase !== 'complete') || model.cursor <= 0) return [model, []]
      const cursor = model.cursor - 1
      const next: Model = { ...model, cursor, drawn: model.pile[cursor]!, token: model.token + 1 }
      return [next, feedback(next, language, muted, speech, false)]
    },
    TarotCardArrived: msg => current(model, msg.token) && model.phase === 'moving' && Number.isSafeInteger(msg.slot) && msg.slot === model.pendingSlot && msg.slot >= 0 && msg.slot < 3
      ? [{ ...model, phase: model.spread.length === 3 ? 'complete' : 'ready', pendingSlot: -1 }, []] : [model, []],
    TarotShuffleFinished: msg => current(model, msg.token) && model.phase === 'shuffling'
      ? [{ ...model, remaining: fullDeck(), pile: [], pileAngles: [], cursor: -1, drawn: -1, token: model.token + 1, phase: model.spread.length === 3 ? 'complete' : 'ready' }, []] : [model, []],
    TarotSetMode: msg => S.is(Mode)(msg.mode) && msg.mode !== model.mode ? [freshDeck(model, msg.mode), []] : [model, []],
    TarotNextReading: msg => current(model, msg.token) && model.mode === 'story' && model.phase === 'complete'
      ? [freshDeck(model, model.mode), []] : [model, []],
    TarotFeedbackFinished: () => [model, []],
  }))

export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const art = (index: number, id: string, dropRevision?: number | string, angle = 0, faceDown = false) => renderTarotArt(h, index, id, t(cardKey(index), language), { dropRevision, angle, faceDown })
  const spreadView = () => h.div([h.Class('tarot-spread')], Array.from({ length: 3 }, (_, index) => h.div([h.Class('tarot-spread-slot'), h.Attribute('data-tarot-slot', String(index)), h.Key(`spread-${model.spread[index] ?? 'empty'}-${index}`)], [
      h.h2([h.Class('tarot-position')], [t(index === 0 ? 'tarotPositionOne' : index === 1 ? 'tarotPositionTwo' : 'tarotPositionThree', language)]),
      ...(model.spread[index] !== undefined ? [h.div([h.Class(model.pendingSlot === index ? 'tarot-slot-card tarot-slot-card--pending' : 'tarot-slot-card')], [art(model.spread[index]!, `tarot-spread-${index}`, model.pendingSlot === index ? undefined : `reading-${index}-${model.spread[index]}`, 0, model.pendingSlot === index)]), h.p([h.Class('tarot-meaning')], model.pendingSlot === index ? [] : [t(meaningKey(model.spread[index]!), language)])] : [h.div([h.Class('tarot-spread-placeholder'), h.AriaHidden(true)], ['✧'])]),
    ])))
  const visibleCursor = model.phase === 'moving' ? model.cursor - 1 : model.cursor
  const visibleCard = model.pile[visibleCursor] ?? -1
  const ready = model.phase === 'ready'
  return h.div([h.Class('page tarot-page')], [h.div([h.Class(model.mode === 'story' ? 'card tarot-card tarot-card--story' : 'card tarot-card'), h.Attribute('data-tarot-token', String(model.token)), h.Attribute('aria-busy', String(model.phase === 'shuffling' || model.phase === 'moving'))], [
    h.h1([h.Class('title')], [t('tarotTitle', language)]),
    h.div([h.Class('tarot-modes'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('tarotDifficulty', language))], (['recognize', 'story'] as const).map(mode => h.button([
      h.Class('tarot-mode'), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(model.mode === mode)), h.OnClick(SetMode({ mode })),
    ], [t(mode === 'recognize' ? 'tarotRecognize' : 'tarotStory', language)]))),
    h.p([h.Class('tarot-prompt'), h.Role('status'), h.Attribute('aria-live', 'polite')], [t(model.phase === 'shuffling' ? 'tarotShuffling' : model.phase === 'complete' ? 'tarotComplete' : model.mode === 'story' ? 'tarotStoryPrompt' : 'tarotDrawPrompt', language)]),
    h.div([h.Class(model.mode === 'story' ? 'tarot-table tarot-table--story' : 'tarot-table')], [
      h.div([h.Class('tarot-deck-area')], [
        h.button([h.Class('tarot-deck'), h.Key('deck'), h.Attribute('type', 'button'), h.Attribute('aria-label', t('tarotPull', language)), h.Attribute('data-multitouch-owned', 'true'), h.Attribute('data-tarot-token', String(model.token)), h.Disabled(!ready), h.OnMount({ name: 'TarotDeckGestures', f: mountTarotDeck })], [
          h.span([h.Class('tarot-deck-back'), h.AriaHidden(true)], [renderTarotBack(h)]),
        ]),
        ...(ready ? [h.span([h.Class('tarot-pull-hint'), h.AriaHidden(true)], [t('tarotPull', language), ' ↗'])] : []),
      ]),
      ...(model.mode === 'story' ? [spreadView()] : [
      h.div([h.Class('tarot-pile'), h.Key('pile'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('tarotPile', language))], [
        h.button([h.Class('tarot-history'), h.Attribute('type', 'button'), h.Attribute('aria-label', t('tarotPreviousCard', language)), h.Attribute('title', t('tarotPreviousCard', language)), h.Attribute('aria-description', validCard(visibleCard) ? t(cardKey(visibleCard), language) : t('tarotPile', language)), h.Disabled(visibleCursor <= 0 || model.phase === 'moving' || model.phase === 'shuffling'), h.OnClick(PreviousCard({ token: model.token })), h.Attribute('data-multitouch-revision', String(model.token))], [
          h.div([h.Class('tarot-pile-cards'), h.Key('pile-cards')], [
            ...model.pile.slice(0, visibleCursor).map((card, index) => ({ card, angle: model.pileAngles[index] ?? 0, index })).slice(-5).map(({ card, angle, index }) => h.div([h.Class('tarot-pile-layer'), h.Key(`pile-${card}`), h.AriaHidden(true), h.Style({ transform: `translate(${index % 2 ? -2 : 2}px, ${2 + index % 3}px) rotate(${angle}deg)` })], [])),
            h.div([h.Class('tarot-reveal'), h.Key('top-card')], validCard(visibleCard) ? [art(visibleCard, 'tarot-revealed', `pile-${visibleCursor}-${visibleCard}`, model.pileAngles[visibleCursor] ?? 0)] : [h.span([h.Class('tarot-empty'), h.AriaHidden(true)], ['✧'])]),
          ]),
        ]),
        h.span([h.Class('tarot-pile-count'), h.Dir('ltr')], [`${new Intl.NumberFormat(language).format(visibleCursor + 1)} / ${new Intl.NumberFormat(language).format(model.pile.length)}`]),
      ]),
      ]),
    ]),
    ...(model.phase === 'complete' ? [h.button([h.Class('tarot-next'), h.Attribute('type', 'button'), h.OnClick(NextReading({ token: model.token }))], [t('tarotAnother', language)])] : []),
    h.p([h.Class('tarot-caption')], [t(model.mode === 'story' ? 'tarotPlayful' : 'tarotDeckName', language)]),
  ])])
}
