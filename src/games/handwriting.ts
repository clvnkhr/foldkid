import { Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { chime } from '../audio'
import { normalizeLanguage, t, tf } from '../i18n'
import {
  HANDWRITING_LETTERS, HANDWRITING_WORDS, HANDWRITING_TOLERANCE,
  advanceHandwritingStroke, handwritingGuide, handwritingPath, handwritingResumeDistance, type HandwritingPoint,
} from './handwritingPaths'
import { createHandwritingRuntime } from './handwritingRuntime'

export const Mode = S.Literals(['letters', 'words'])
export const LetterCase = S.Literals(['upper', 'lower'])
const Point = S.Struct({ x: S.Number, y: S.Number })
const Contact = S.Struct({ id: S.Number, stroke: S.Number, point: Point })
const Pen = S.Struct({ stroke: S.Number, point: Point })
export const Model = S.Struct({
  mode: Mode, letterCase: LetterCase, letterIndex: S.Number, wordIndex: S.Number,
  revision: S.Number, progress: S.Array(S.Number), contacts: S.Array(Contact),
  pen: S.NullOr(Pen), celebrated: S.Boolean,
})
export type Model = typeof Model.Type

export const SetMode = m('HandwritingSetMode', { mode: Mode })
export const SetCase = m('HandwritingSetCase', { letterCase: LetterCase })
export const SelectedTarget = m('HandwritingSelectedTarget', { index: S.Number })
export const NextTarget = m('HandwritingNextTarget')
export const PreviousTarget = m('HandwritingPreviousTarget')
export const Restarted = m('HandwritingRestarted')
export const PenStarted = m('HandwritingPenStarted', { id: S.Number, x: S.Number, y: S.Number, revision: S.Number })
export const PenMoved = m('HandwritingPenMoved', { id: S.Number, points: S.Array(Point), revision: S.Number })
export const PenEnded = m('HandwritingPenEnded', { id: S.Number, revision: S.Number })
export const PenCancelled = m('HandwritingPenCancelled', { id: S.Number, revision: S.Number })
export const KeyboardPressed = m('HandwritingKeyboardPressed', { key: S.String, revision: S.Number })
export const KeyboardLifted = m('HandwritingKeyboardLifted', { revision: S.Number })
export const SoundPlayed = m('HandwritingSoundPlayed')
export const Message = S.Union([
  SetMode, SetCase, SelectedTarget, NextTarget, PreviousTarget, Restarted,
  PenStarted, PenMoved, PenEnded, PenCancelled, KeyboardPressed, KeyboardLifted, SoundPlayed,
])
export type Message = typeof Message.Type

export const currentGuide = (model: Model) => handwritingGuide(model.mode, model.mode === 'words' ? 'lower' : model.letterCase, model.mode === 'letters' ? model.letterIndex : model.wordIndex)
export const init = (): Model => ({
  mode: 'letters', letterCase: 'upper', letterIndex: 0, wordIndex: 0, revision: 0,
  progress: handwritingGuide('letters', 'upper', 0).strokes.map(() => 0), contacts: [], pen: null, celebrated: false,
})
export const completedStrokes = (model: Model): number => currentGuide(model).strokes.filter((stroke, index) => model.progress[index] === stroke.length).length
export const isComplete = (model: Model): boolean => completedStrokes(model) === currentGuide(model).strokes.length

const reset = (model: Model, patch: Partial<Pick<Model, 'mode' | 'letterCase' | 'letterIndex' | 'wordIndex'>> = {}): Model => {
  const next = { ...model, ...patch }
  return { ...next, revision: model.revision + 1, progress: currentGuide(next).strokes.map(() => 0), contacts: [], pen: null, celebrated: false }
}
// Keep the colored writing on navigation; invalidate any events already queued by the old board.
export const interrupt = (model: Model): Model => ({ ...model, revision: model.revision + 1, contacts: [], pen: null })
const targetCount = (model: Model): number => model.mode === 'letters' ? HANDWRITING_LETTERS.length : HANDWRITING_WORDS.length
const select = (model: Model, index: number): Model => reset(model, model.mode === 'letters' ? { letterIndex: index } : { wordIndex: index })
const validId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0
const validPoint = (point: HandwritingPoint): boolean => [point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) < 10000)
const KEY_DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -6], ArrowDown: [0, 6] }

const nextStroke = (model: Model, point?: HandwritingPoint): number => {
  const strokes = currentGuide(model).strokes
  let nearest = -1
  let distance = HANDWRITING_TOLERANCE
  let resumed = -1
  let resumeDistance = HANDWRITING_TOLERANCE
  strokes.forEach((stroke, index) => {
    const next = stroke[model.progress[index]!]
    if (!next || model.contacts.some(contact => contact.stroke === index) || model.pen?.stroke === index) return
    const previous = stroke[Math.max(0, model.progress[index]! - 1)]!
    const gap = point ? Math.min(Math.hypot(point.x - next.x, point.y - next.y), Math.hypot(point.x - previous.x, point.y - previous.y)) : 0
    if (gap < distance || (nearest < 0 && gap <= distance)) { nearest = index; distance = gap }
    const behind = point ? handwritingResumeDistance(stroke, model.progress[index]!, point) : 0
    if (behind < resumeDistance || (resumed < 0 && behind <= resumeDistance)) { resumed = index; resumeDistance = behind }
  })
  return nearest >= 0 ? nearest : resumed
}
const celebrate = (model: Model, muted: boolean): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  if (!isComplete(model) || model.celebrated) return [model, []]
  return [{ ...model, celebrated: true }, muted ? [] : [{
    name: 'HandwritingPlayChime', effect: chime(SoundPlayed()).effect.pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))),
  }]]
}

export const update = (model: Model, message: Message, muted: boolean): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    HandwritingSetMode: msg => (msg.mode === 'letters' || msg.mode === 'words') && msg.mode !== model.mode ? [reset(model, { mode: msg.mode }), []] : [model, []],
    HandwritingSetCase: msg => model.mode === 'letters' && (msg.letterCase === 'upper' || msg.letterCase === 'lower') && msg.letterCase !== model.letterCase
      ? [reset(model, { letterCase: msg.letterCase }), []] : [model, []],
    HandwritingSelectedTarget: msg => Number.isSafeInteger(msg.index) && msg.index >= 0 && msg.index < targetCount(model) &&
      msg.index !== (model.mode === 'letters' ? model.letterIndex : model.wordIndex) ? [select(model, msg.index), []] : [model, []],
    HandwritingNextTarget: () => [select(model, ((model.mode === 'letters' ? model.letterIndex : model.wordIndex) + 1) % targetCount(model)), []],
    HandwritingPreviousTarget: () => [select(model, ((model.mode === 'letters' ? model.letterIndex : model.wordIndex) + targetCount(model) - 1) % targetCount(model)), []],
    HandwritingRestarted: () => [reset(model), []],
    HandwritingPenStarted: msg => {
      if (msg.revision !== model.revision || !validId(msg.id) || !validPoint(msg) || isComplete(model) || model.contacts.some(contact => contact.id === msg.id)) return [model, []]
      const stroke = nextStroke(model, msg)
      if (stroke < 0) return [model, []]
      const point = { x: msg.x, y: msg.y }
      const progress = [...model.progress]
      progress[stroke] = advanceHandwritingStroke(currentGuide(model).strokes[stroke]!, progress[stroke]!, point, point)
      return [{ ...model, progress, contacts: [...model.contacts, { id: msg.id, stroke, point }] }, []]
    },
    HandwritingPenMoved: msg => {
      const contact = model.contacts.find(candidate => candidate.id === msg.id)
      if (msg.revision !== model.revision || !validId(msg.id) || !contact || isComplete(model) || msg.points.length === 0 || msg.points.length > 256 || !msg.points.every(validPoint)) return [model, []]
      const progress = [...model.progress]
      const stroke = currentGuide(model).strokes[contact.stroke]!
      let point = contact.point
      for (const next of msg.points) { progress[contact.stroke] = advanceHandwritingStroke(stroke, progress[contact.stroke]!, point, next); point = next }
      return [{ ...model, progress, contacts: model.contacts.map(candidate => candidate.id === msg.id ? { ...contact, point } : candidate) }, []]
    },
    HandwritingPenEnded: msg => {
      if (msg.revision !== model.revision || !validId(msg.id) || !model.contacts.some(contact => contact.id === msg.id)) return [model, []]
      return celebrate({ ...model, contacts: model.contacts.filter(contact => contact.id !== msg.id) }, muted)
    },
    HandwritingPenCancelled: msg => msg.revision === model.revision && validId(msg.id) && model.contacts.some(contact => contact.id === msg.id)
      ? [{ ...model, contacts: model.contacts.filter(contact => contact.id !== msg.id) }, []] : [model, []],
    HandwritingKeyboardLifted: msg => msg.revision === model.revision && model.pen ? [{ ...model, pen: null }, []] : [model, []],
    HandwritingKeyboardPressed: msg => {
      if (msg.revision !== model.revision) return [model, []]
      if (msg.key === 'Enter' || msg.key === ' ') return celebrate({ ...model, pen: null }, muted)
      const direction = Object.hasOwn(KEY_DIRECTIONS, msg.key) ? KEY_DIRECTIONS[msg.key] : undefined
      if (!direction || isComplete(model)) return [model, []]
      const stroke = model.pen?.stroke ?? nextStroke(model)
      if (stroke < 0) return [model, []]
      const samples = currentGuide(model).strokes[stroke]!
      const from = model.pen?.point ?? samples[model.progress[stroke]!]!
      const point = { x: Math.max(0, Math.min(currentGuide(model).width, from.x + direction[0]!)), y: Math.max(0, Math.min(160, from.y + direction[1]!)) }
      const progress = [...model.progress]
      progress[stroke] = advanceHandwritingStroke(samples, progress[stroke]!, from, point)
      return celebrate({ ...model, progress, pen: { stroke, point } }, muted)
    },
    HandwritingSoundPlayed: () => [model, []],
  }))

export const mountHandwriting = (element: Element): Stream.Stream<Message> => Stream.callback<Message>(queue => Effect.gen(function* () {
  yield* Render.afterCommit
  yield* Effect.acquireRelease(Effect.sync(() => createHandwritingRuntime(element as SVGSVGElement, {
    started: (id, x, y, revision) => Queue.offerUnsafe(queue, PenStarted({ id, x, y, revision })),
    moved: (id, points, revision) => Queue.offerUnsafe(queue, PenMoved({ id, points, revision })),
    ended: (id, revision) => Queue.offerUnsafe(queue, PenEnded({ id, revision })),
    cancelled: (id, revision) => Queue.offerUnsafe(queue, PenCancelled({ id, revision })),
  })), cleanup => Effect.sync(cleanup))
  return yield* Effect.never
}))

const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#06b6d4', '#6366f1', '#a855f7'] as const
const strokeCues = (model: Model) => {
  const guide = currentGuide(model)
  const labels: HandwritingPoint[] = []
  return guide.strokes.map((stroke, strokeIndex) => {
    if (model.progress[strokeIndex] !== 0) return undefined
    const start = stroke[0]!
    const ahead = Math.min(3, stroke.length - 1)
    const tip = stroke[ahead]!
    const before = stroke[Math.max(0, ahead - 1)]!
    const after = stroke[Math.min(stroke.length - 1, ahead + 1)]!
    const length = Math.hypot(after.x - before.x, after.y - before.y) || 1
    const dx = (after.x - before.x) / length
    const dy = (after.y - before.y) / length
    const candidates = [0, -8, 8].flatMap(along => [1, -1].map(side => ({
      x: start.x + dx * along - dy * 13 * side, y: start.y + dy * along + dx * 13 * side,
    })))
    const clearance = (candidate: HandwritingPoint) => {
      let score = Math.min(candidate.x - 7, guide.width - candidate.x - 7, candidate.y - 7, guide.height - candidate.y - 7)
      for (const points of guide.strokes) for (const point of points)
        score = Math.min(score, Math.hypot(candidate.x - point.x, candidate.y - point.y) - 6)
      for (const label of labels) score = Math.min(score, Math.hypot(candidate.x - label.x, candidate.y - label.y) - 13)
      return score
    }
    const label = candidates.map(point => ({ point, clearance: clearance(point) }))
      .reduce((best, candidate) => candidate.clearance > best.clearance ? candidate : best).point
    labels.push(label)
    const arrow = stroke.length > 2 ? handwritingPath([
      { x: tip.x - dx * 4.4 - dy * 3, y: tip.y - dy * 4.4 + dx * 3 }, tip,
      { x: tip.x - dx * 4.4 + dy * 3, y: tip.y - dy * 4.4 - dx * 3 },
    ]) : undefined
    return { label, arrow }
  })
}
export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const guide = currentGuide(model)
  const complete = isComplete(model)
  const uppercase = model.mode === 'letters' && model.letterCase === 'upper'
  const numbers = new Intl.NumberFormat(normalizeLanguage(language))
  const cues = strokeCues(model)
  const index = model.mode === 'letters' ? model.letterIndex : model.wordIndex
  return h.div([h.Class('page handwriting-page')], [h.div([h.Class('card handwriting-card')], [
    h.h1([h.Class('title')], [t('handwritingTitle', language)]),
    h.div([h.Class('handwriting-toolbar')], [
      h.div([h.Class('handwriting-modes'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('handwritingTitle', language))],
        (['letters', 'words'] as const).map(mode => h.button([h.Class('handwriting-mode'), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(model.mode === mode)), h.OnClick(SetMode({ mode }))], [t(mode === 'letters' ? 'handwritingLetters' : 'handwritingWords', language)]))),
      ...(model.mode === 'letters' ? [h.div([h.Class('handwriting-cases'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('handwritingLetters', language))],
        (['upper', 'lower'] as const).map(letterCase => h.button([h.Class('handwriting-case'), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(model.letterCase === letterCase)), h.Attribute('aria-label', t(letterCase === 'upper' ? 'handwritingUppercaseLabel' : 'handwritingLowercaseLabel', language)), h.OnClick(SetCase({ letterCase }))], [t(letterCase === 'upper' ? 'handwritingUppercase' : 'handwritingLowercase', language)])))] : []),
    ]),
    h.div([h.Class('handwriting-choices'), h.Attribute('role', 'group'), h.Attribute('aria-label', t(model.mode === 'letters' ? 'handwritingLetters' : 'handwritingWords', language))],
      (model.mode === 'letters' ? HANDWRITING_LETTERS.map(letter => ({ text: model.letterCase === 'upper' ? letter.toUpperCase() : letter, emoji: '' })) : HANDWRITING_WORDS).map((target, targetIndex) => h.button([
        h.Class('handwriting-choice'), h.Key(`${model.mode}-${targetIndex}`), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(index === targetIndex)), h.OnClick(SelectedTarget({ index: targetIndex })),
      ], [h.span([h.AriaHidden(true)], [target.emoji]), h.span([h.Attribute('dir', 'ltr')], [target.text])]))),
    h.div([h.Class('handwriting-target'), h.Attribute('dir', 'ltr')], [h.span([h.AriaHidden(true)], [guide.emoji]), guide.text]),
    h.svg([
      h.Class('handwriting-board'), h.Key(`handwriting-board-${model.revision}`), h.ViewBox(`0 0 ${guide.width} ${guide.height}`),
      h.Attribute('preserveAspectRatio', 'xMidYMid meet'), h.Attribute('role', 'application'), h.Attribute('tabindex', '0'), h.Attribute('focusable', 'true'),
      h.Attribute('aria-label', tf('handwritingBoard', language, guide.text)), h.Attribute('aria-describedby', 'handwriting-keyboard-hint'),
      h.Attribute('data-handwriting-revision', String(model.revision)), h.Attribute('data-complete', String(complete)),
      h.OnKeyDown(key => KeyboardPressed({ key, revision: model.revision })), h.OnBlur(KeyboardLifted({ revision: model.revision })),
      h.OnMount({ name: 'handwritingInput', f: mountHandwriting }),
    ], [
      h.defs([h.AriaHidden(true)], guide.strokes.map((_stroke, strokeIndex) => h.linearGradient([
        h.Id(`handwriting-gradient-${model.revision}-${strokeIndex}`), h.Attribute('gradientUnits', 'userSpaceOnUse'),
        h.Attribute('x1', '0'), h.Attribute('y1', '20'), h.Attribute('x2', String(guide.width)), h.Attribute('y2', '140'),
      ], [0, 1, 2].map((offset) => h.stop([h.Attribute('offset', `${offset * 50}%`), h.Attribute('stop-color', COLORS[(strokeIndex + offset) % COLORS.length]!)], []))))),
      h.g([h.AriaHidden(true), h.Attribute('focusable', 'false')], [
        h.path([h.Class('handwriting-midline'), h.D(`M 8 ${uppercase ? 72 : 65} H ${guide.width - 8}`)], []),
        h.path([h.Class('handwriting-baseline'), h.D(`M 8 ${uppercase ? 120 : 115} H ${guide.width - 8}`)], []),
        ...guide.strokes.map(stroke => h.path([h.Class('handwriting-guide'), h.D(handwritingPath(stroke))], [])),
        ...guide.strokes.flatMap((stroke, strokeIndex) => {
          const progress = model.progress[strokeIndex]!
          const traced = stroke.slice(0, progress)
          const next = stroke[progress]
          const cue = cues[strokeIndex]
          const color = COLORS[strokeIndex % COLORS.length]!
          const earlierStart = next && guide.strokes.some((earlier, earlierIndex) => {
            const point = earlier[model.progress[earlierIndex]!]
            return earlierIndex < strokeIndex && point && Math.hypot(point.x - next.x, point.y - next.y) < 1
          })
          return [
            ...(traced.length > 1 ? [
              h.path([h.Class('handwriting-ink'), h.D(handwritingPath(traced)), h.Stroke(`url(#handwriting-gradient-${model.revision}-${strokeIndex})`)], []),
              h.path([h.Class('handwriting-ink-highlight'), h.D(handwritingPath(traced))], []),
            ] : []),
            ...(cue ? [
              ...(cue.arrow ? [h.path([h.Class('handwriting-direction'), h.D(cue.arrow), h.Stroke(color)], [])] : []),
              h.circle([h.Class('handwriting-stroke-badge'), h.Cx(String(cue.label.x)), h.Cy(String(cue.label.y)), h.R('5.8'), h.Stroke(color)], []),
              h.text([h.Class('handwriting-stroke-number'), h.Attribute('x', String(cue.label.x)), h.Attribute('y', String(cue.label.y)), h.Fill(color)], [numbers.format(strokeIndex + 1)]),
            ] : []),
            ...(next && !earlierStart ? [h.circle([h.Class('handwriting-start'), h.Cx(String(next.x)), h.Cy(String(next.y)), h.R('4.2'), h.Fill(color)], [])] : []),
          ]
        }),
        ...(model.pen ? [h.circle([h.Class('handwriting-pen'), h.Cx(String(model.pen.point.x)), h.Cy(String(model.pen.point.y)), h.R('3')], [])] : []),
      ]),
    ]),
    h.p([h.Class('handwriting-keyboard-hint'), h.Id('handwriting-keyboard-hint')], [t('handwritingKeyboardHint', language)]),
    h.p([h.Class('handwriting-feedback'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [complete
      ? t('handwritingComplete', language) : tf('handwritingProgress', language, numbers.format(completedStrokes(model)), numbers.format(guide.strokes.length))]),
    h.div([h.Class('handwriting-actions')], [
      h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.OnClick(PreviousTarget())], [t('handwritingPrevious', language)]),
      h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.OnClick(Restarted())], [t('handwritingAgain', language)]),
      h.button([h.Class('btn btn-primary'), h.Attribute('type', 'button'), h.OnClick(NextTarget())], [t('handwritingNext', language)]),
    ]),
  ])])
}
