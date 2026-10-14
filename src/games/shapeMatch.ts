import { Effect, Match as M, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { chime } from '../audio'
import { t, tf } from '../i18n'
import { speakNow, type SpeechOptions } from '../speech'
import { initialRound, replaceMatchedHome, SHAPES } from './shapeMatchDomain'
import { moveShapeMatchPiece, waitShapeMatchReplacement } from './shapeMatchRuntime'
import { Shape, SHAPE_KEYS, SHAPE_PATHS } from './shapeMatchShapes'
export { Shape } from './shapeMatchShapes'
export { sameShapes } from './shapeMatchDomain'

export const Mode = S.Literals(['simple', 'pairs'])
export type Mode = typeof Mode.Type
export const Model = S.Struct({
  mode: Mode, round: S.Number, token: S.Number, homes: S.Array(S.Array(Shape)), targetIndex: S.Number,
  status: S.Literals(['matching', 'moving', 'landed']), hint: S.Boolean, feedbackPending: S.Boolean, rngSeed: S.Number,
})
export type Model = typeof Model.Type

export const PickHome = m('ShapeMatchPickHome', { index: S.Number, round: S.Number, token: S.Number })
export const SetMode = m('ShapeMatchSetMode', { mode: Mode })
export const MoveFinished = m('ShapeMatchMoveFinished', { round: S.Number, token: S.Number })
export const ReplacementReady = m('ShapeMatchReplacementReady', { round: S.Number, token: S.Number })
export const Entered = m('ShapeMatchEntered')
export const FeedbackFinished = m('ShapeMatchFeedbackFinished', { round: S.Number, token: S.Number })
export const Message = S.Union([PickHome, SetMode, MoveFinished, ReplacementReady, Entered, FeedbackFinished])
export type Message = typeof Message.Type

export const init = (): Model => ({ ...initialRound('pairs'), mode: 'pairs', round: 0, token: 0, status: 'matching', hint: false, feedbackPending: false })
export const getPuzzle = (model: Model) => ({ target: model.homes[model.targetIndex] ?? ['circle'] as readonly Shape[], homes: model.homes })
const replace = (model: Model): Model => ({
  ...model, ...replaceMatchedHome(model, model.mode), round: model.round + 1, token: model.token + 1,
  status: 'matching', hint: false, feedbackPending: false,
})
export const interrupt = (model: Model): Model => model.status === 'matching'
  ? { ...model, token: model.token + 1, feedbackPending: false } : replace(model)

const shapeName = (shape: Shape, language: string): string => t(SHAPE_KEYS[shape], language)
const pieceName = (shapes: readonly Shape[], language: string): string => shapes.length === 2
  ? tf('shapeMatchPair', language, shapeName(shapes[0]!, language), shapeName(shapes[1]!, language)) : shapeName(shapes[0] ?? 'circle', language)
const validRevision = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
const current = (model: Model, message: { readonly round: number; readonly token: number }): boolean =>
  validRevision(message.round) && message.round === model.round && validRevision(message.token) && message.token === model.token
const prompt = (model: Model, language: string): string => {
  const name = pieceName(getPuzzle(model).target, language)
  if (model.status === 'landed') return tf(model.mode === 'pairs' ? 'shapeMatchPairSuccess' : 'shapeMatchSuccess', language, name)
  return model.hint ? t('shapeMatchTryAgain', language) : name
}
const feedback = (model: Model, language: string, muted: boolean, speech: SpeechOptions, success = false): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const next = { ...model, feedbackPending: !muted }
  if (muted) return [next, []]
  const done = FeedbackFinished({ round: next.round, token: next.token })
  const stillCurrent = (): boolean => {
    if (typeof document === 'undefined') return false
    const card = document.querySelector<HTMLElement>('.shape-match-card')
    return card !== null && card.dataset.shapeMatchRound === String(next.round) && card.dataset.shapeMatchToken === String(next.token)
  }
  return [next, [{
    name: 'ShapeMatchFeedback',
    effect: Effect.gen(function* () {
      yield* Render.afterCommit
      if (!stillCurrent()) return done
      if (success) yield* chime(done).effect.pipe(Effect.catchCause(() => Effect.succeed(done)))
      yield* Effect.sync(() => {
        if (stillCurrent()) speakNow(pieceName(getPuzzle(next).target, language), { ...speech, lang: language })
      })
      return done
    }).pipe(Effect.catchCause(() => Effect.succeed(done))),
  }]]
}

export const update = (model: Model, message: Message, language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    ShapeMatchPickHome: msg => {
      if (!current(model, msg) || model.status !== 'matching' || !Number.isSafeInteger(msg.index) || msg.index < 0 || msg.index >= model.homes.length) return [model, []]
      if (msg.index !== model.targetIndex) return model.hint ? [model, []] : [{ ...model, hint: true, token: model.token + 1, feedbackPending: false }, []]
      const next: Model = { ...model, hint: false, status: 'moving', feedbackPending: false, token: model.token + 1 }
      const done = MoveFinished({ round: next.round, token: next.token })
      return [next, [{ name: 'ShapeMatchMovePiece', effect: moveShapeMatchPiece(next.round, next.token).pipe(Effect.as(done), Effect.catchCause(() => Effect.succeed(done))) }]]
    },
    ShapeMatchMoveFinished: msg => {
      if (!current(model, msg) || model.status !== 'moving') return [model, []]
      const next: Model = { ...model, status: 'landed' }
      const done = ReplacementReady({ round: next.round, token: next.token })
      return [next, [{ name: 'ShapeMatchReplaceAfterMatch', effect: waitShapeMatchReplacement(next.round, next.token).pipe(Effect.as(done), Effect.catchCause(() => Effect.succeed(done))) }]]
    },
    ShapeMatchReplacementReady: msg => current(model, msg) && model.status === 'landed'
      ? feedback(replace(model), language, muted, speech, true) : [model, []],
    ShapeMatchSetMode: msg => S.is(Mode)(msg.mode) && msg.mode !== model.mode
      ? feedback({ ...init(), ...initialRound(msg.mode), mode: msg.mode, token: model.token + 1 }, language, muted, speech) : [model, []],
    ShapeMatchEntered: () => model.status === 'matching' && !model.feedbackPending
      ? feedback({ ...model, token: model.token + 1 }, language, muted, speech) : [model, []],
    ShapeMatchFeedbackFinished: msg => current(model, msg) && model.feedbackPending
      ? [{ ...model, feedbackPending: false }, []] : [model, []],
  }))

const COLORS = [
  ['#ffce75', '#ff9378'], ['#81e6d4', '#49b6da'], ['#ceb0ff', '#9a7ded'],
  ['#ffc88c', '#f080b0'], ['#a4def7', '#6f9fe8'], ['#c9ed8c', '#76c9a6'],
] as const

export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const puzzle = getPuzzle(model)
  const shapeSvg = (shape: Shape, id: string, filled: boolean, part: number) => {
    const colors = COLORS[(SHAPES.indexOf(shape) + part) % COLORS.length] ?? COLORS[0]
    const geometry = h.path([h.Class(filled ? 'shape-match-surface' : 'shape-match-outline'), h.Fill(filled ? `url(#${id})` : 'none'), h.D(SHAPE_PATHS[shape]), h.Attribute('fill-rule', 'evenodd')], [])
    return h.svg([h.ViewBox('0 0 100 100'), h.AriaHidden(true), h.Attribute('focusable', 'false')], [
      ...(filled ? [h.defs([], [h.linearGradient([h.Id(id), h.Attribute('x1', '15%'), h.Attribute('y1', '0%'), h.Attribute('x2', '85%'), h.Attribute('y2', '100%')], [
        h.stop([h.Attribute('offset', '0%'), h.Attribute('stop-color', colors[0])], []), h.stop([h.Attribute('offset', '100%'), h.Attribute('stop-color', colors[1])], []),
      ]), h.clipPath([h.Id(`${id}-clip`)], [h.path([h.D(SHAPE_PATHS[shape]), h.Attribute('clip-rule', 'evenodd')], [])])])] : []),
      geometry,
      ...(filled ? [h.path([h.Class('shape-match-shine'), h.D('M 24 50 Q 20 29 48 22'), h.Fill('none'), h.Attribute('clip-path', `url(#${id}-clip)`)], [])] : []),
    ])
  }
  return h.div([h.Class('page shape-match-page')], [h.div([
    h.Class('card shape-match-card'), h.Attribute('data-shape-match-round', String(model.round)), h.Attribute('data-shape-match-token', String(model.token)), h.Attribute('aria-busy', String(model.status !== 'matching')),
  ], [
    h.div([h.Class('shape-match-header')], [h.h1([h.Class('title shape-match-title')], [t('shapeMatchTitle', language)])]),
    h.div([h.Class('shape-match-modes'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('shapeMatchMode', language))],
      (['simple', 'pairs'] as const).map(mode => h.button([
        h.Class('shape-match-mode'), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(model.mode === mode)), h.OnClick(SetMode({ mode })),
      ], [t(mode === 'pairs' ? 'shapeMatchPairs' : 'shapeMatchSimple', language)]))),
    h.div([h.Class('shape-match-stage')], model.status !== 'landed' ? [
      h.div([h.Class(`shape-match-piece${model.mode === 'pairs' ? ' shape-match-piece--pair' : ` shape-match-piece--${puzzle.target[0]}`}`), h.Key(`target-${model.mode}-${model.round}`), h.Attribute('role', 'img'), h.Attribute('aria-label', pieceName(puzzle.target, language))],
        puzzle.target.map((shape, part) => shapeSvg(shape, `shape-match-target-${model.round}-${part}`, true, part))),
    ] : []),
    h.div([h.Class('shape-match-homes'), h.Key(`homes-${model.mode}`), h.Attribute('role', 'group'), h.Attribute('aria-label', t('shapeMatchMode', language))],
      puzzle.homes.map((shapes, index) => {
        const correct = index === model.targetIndex
        const fitted = correct && model.status === 'landed'
        const hint = correct && model.hint
        return h.button([
          h.Class(`shape-match-home${fitted ? ' shape-match-home--matched' : hint ? ' shape-match-home--hint' : ''}`), h.Key(`home-${model.mode}-${index}`),
          h.Attribute('type', 'button'), h.Attribute('data-multitouch-revision', `${model.mode}-${model.round}`), h.Disabled(model.status !== 'matching'), h.Attribute('data-shape-match-correct', String(correct)),
          h.Attribute('aria-label', tf('shapeMatchHome', language, pieceName(shapes, language))), h.OnClick(PickHome({ index, round: model.round, token: model.token })),
        ], [h.div([h.Class(`shape-match-home-piece${model.mode === 'pairs' ? ' shape-match-home-piece--pair' : ''}`), h.AriaHidden(true)],
          shapes.map((shape, part) => shapeSvg(shape, `shape-match-home-${model.mode}-${index}-${part}`, fitted, part))),
          ...(fitted ? [h.span([h.Class('shape-match-sparkle'), h.AriaHidden(true)], ['✦'])] : []),
        ])
      })),
    h.p([h.Class('shape-match-status'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [prompt(model, language)]),
  ])])
}
