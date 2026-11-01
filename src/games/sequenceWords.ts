import { Effect, Match as M, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { chime } from '../audio'
import { normalizeLanguage, t } from '../i18n'
import { speakNow, type SpeechOptions } from '../speech'
import { BASIS_KEYS, generateBoard, Group, GROUP_ICONS, GROUP_KEYS, GROUPS, INITIAL_SEED, wordsFor } from './sequenceWordsDomain'
import { mountSequenceLines } from './sequenceWordsRuntime'

export const ChoiceCount = S.Literals([3, 5])
export const Side = S.Literals(['number', 'word'])
const Selection = S.Struct({ side: Side, choice: S.Number })
export const Model = S.Struct({
  group: Group, count: ChoiceCount, reference: S.Boolean,
  numbers: S.Array(S.Number), words: S.Array(S.Number), matched: S.Array(S.Number), selected: S.NullOr(Selection),
  seed: S.Number, token: S.Number, status: S.Literals(['loading', 'matching', 'success']), wrong: S.Boolean, score: S.Number,
})
export type Model = typeof Model.Type
export const Entered = m('SequenceWordsEntered')
export const SeedReady = m('SequenceWordsSeedReady', { seed: S.Number, token: S.Number })
export const SetGroup = m('SequenceWordsSetGroup', { group: Group })
export const SetCount = m('SequenceWordsSetCount', { count: ChoiceCount })
export const ToggleReference = m('SequenceWordsToggleReference')
export const Pick = m('SequenceWordsPick', { side: Side, choice: S.Number, token: S.Number })
export const Connect = m('SequenceWordsConnect', { number: S.Number, word: S.Number, token: S.Number })
export const Advance = m('SequenceWordsAdvance', { token: S.Number })
export const Spoken = m('SequenceWordsSpoken', { token: S.Number })
export const Message = S.Union([Entered, SeedReady, SetGroup, SetCount, ToggleReference, Pick, Connect, Advance, Spoken])
export type Message = typeof Message.Type
export const init = (): Model => ({
  group: 'ordinals', count: 3, reference: false, ...generateBoard(INITIAL_SEED, 'ordinals', 3),
  matched: [], selected: null, token: 0, status: 'loading', wrong: false, score: 0,
})
const refresh = (model: Model): Model => ({ ...model, ...generateBoard(model.seed, model.group, model.count),
  token: model.token + 1, status: 'matching', matched: [], selected: null, wrong: false,
})
export const interrupt = (model: Model): Model => model.status === 'success' ? refresh(model)
  : { ...model, token: model.token + 1, selected: null, wrong: false }
const current = (model: Model, token: number): boolean => Number.isSafeInteger(token) && token >= 0 && token === model.token
const live = (token: number): boolean => typeof document !== 'undefined' &&
  document.querySelector('.sequence-words-card')?.getAttribute('data-sequence-token') === String(token)
const announce = (model: Model, language: string, muted: boolean, speech: SpeechOptions, text = t('sequenceWordsConnectHint', language)): ReadonlyArray<Command.Command<Message>> => muted ? [] : [{
  name: 'SequenceWordsAnnounce', effect: Effect.gen(function* () {
    yield* Render.afterCommit
    if (live(model.token)) speakNow(text, { ...speech, lang: language })
    return Spoken({ token: model.token })
  }).pipe(Effect.catchCause(() => Effect.succeed(Spoken({ token: model.token })))),
}]
const available = (model: Model, side: typeof Side.Type, choice: number): boolean =>
  Number.isSafeInteger(choice) && (side === 'number' ? model.numbers : model.words).includes(choice) && !model.matched.includes(choice)
const connect = (model: Model, number: number, word: number, language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  if (!available(model, 'number', number) || !available(model, 'word', word)) return [model, []]
  if (number !== word) return [{ ...model, selected: null, wrong: true, token: model.token + 1 }, []]
  const matched = [...model.matched, number]
  const next: Model = { ...model, matched, selected: null, wrong: false, token: model.token + 1, score: model.score + 1,
    status: matched.length === model.numbers.length ? 'success' : 'matching' }
  const text = `${new Intl.NumberFormat(normalizeLanguage(language)).format(number + 1)}. ${wordsFor(model.group, language)[word] ?? ''}`
  if (next.status !== 'success') return [next, announce(next, language, muted, speech, text)]
  const done = Advance({ token: next.token })
  return [next, [{ name: 'SequenceWordsCelebrate', effect: Effect.gen(function* () {
    yield* Render.afterCommit
    if (!muted && live(next.token)) {
      yield* chime(done).effect.pipe(Effect.catchCause(() => Effect.succeed(done)))
      if (live(next.token)) speakNow(text, { ...speech, lang: language })
    }
    yield* Effect.sleep(1400)
    return done
  }).pipe(Effect.catchCause(() => Effect.succeed(done))) }]]
}
export const update = (model: Model, message: Message, language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    SequenceWordsEntered: () => {
      if (model.status !== 'loading') return [model, announce(model, language, muted, speech)]
      const next = { ...model, token: model.token + 1 }
      return [next, [{ name: 'SequenceWordsSeed', effect: Effect.sync(() => SeedReady({ token: next.token, seed: Math.floor(Math.random() * 0x100000000) })) }]]
    },
    SequenceWordsSeedReady: msg => {
      if (!current(model, msg.token) || model.status !== 'loading' || !Number.isSafeInteger(msg.seed) || msg.seed < 0 || msg.seed > 0xffffffff) return [model, []]
      const next = refresh({ ...model, seed: msg.seed })
      return [next, announce(next, language, muted, speech)]
    },
    SequenceWordsSetGroup: msg => {
      if (!S.is(Group)(msg.group) || msg.group === model.group) return [model, []]
      const next = refresh({ ...model, group: msg.group })
      return [next, announce(next, language, muted, speech)]
    },
    SequenceWordsSetCount: msg => {
      if (!S.is(ChoiceCount)(msg.count) || msg.count === model.count) return [model, []]
      const next = refresh({ ...model, count: msg.count })
      return [next, announce(next, language, muted, speech)]
    },
    SequenceWordsToggleReference: () => [{ ...model, reference: !model.reference }, []],
    SequenceWordsPick: msg => {
      if (!current(model, msg.token) || model.status !== 'matching' || !S.is(Side)(msg.side) || !available(model, msg.side, msg.choice)) return [model, []]
      if (model.selected && model.selected.side !== msg.side) return connect(model, msg.side === 'number' ? msg.choice : model.selected.choice, msg.side === 'word' ? msg.choice : model.selected.choice, language, muted, speech)
      const next = { ...model, selected: model.selected?.choice === msg.choice && model.selected.side === msg.side ? null : { side: msg.side, choice: msg.choice }, wrong: false, token: model.token + 1 }
      const text = msg.side === 'number' ? new Intl.NumberFormat(normalizeLanguage(language)).format(msg.choice + 1) : wordsFor(model.group, language)[msg.choice] ?? ''
      return [next, announce(next, language, muted, speech, text)]
    },
    SequenceWordsConnect: msg => current(model, msg.token) && model.status === 'matching'
      ? connect(model, msg.number, msg.word, language, muted, speech) : [model, []],
    SequenceWordsAdvance: msg => {
      if (!current(model, msg.token) || model.status !== 'success') return [model, []]
      const next = refresh(model)
      return [next, announce(next, language, muted, speech)]
    },
    SequenceWordsSpoken: () => [model, []],
  }))

export const LINE_COLOURS = ['#8b70ee', '#e77847', '#279d91', '#d461a6', '#508cda'] as const
export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const numbers = new Intl.NumberFormat(normalizeLanguage(language))
  const words = wordsFor(model.group, language)
  const busy = model.status !== 'matching'
  const won = model.status === 'success'
  return h.div([h.Class('page sequence-words-page')], [h.div([
    h.Class(`card sequence-words-card${won ? ' sequence-words-card--success' : ''}`), h.Attribute('data-sequence-token', String(model.token)), h.Attribute('aria-busy', String(busy)),
  ], [
    h.h1([h.Class('title')], [t('sequenceWordsTitle', language)]),
    h.div([h.Class('sequence-words-settings')], [
      h.label([h.Class('sequence-words-pack')], [h.span([], [h.span([h.AriaHidden(true)], [GROUP_ICONS[model.group]]), ' ', t('sequenceWordsGroup', language)]), h.select([h.Class('sequence-words-select'), h.Attribute('aria-label', t('sequenceWordsGroup', language)), h.Value(model.group), h.OnChange(group => SetGroup({ group: group as Group }))], GROUPS.map(group => h.option([h.Value(group), h.Selected(group === model.group)], [t(GROUP_KEYS[group], language)])))]),
      h.div([h.Attribute('role', 'group'), h.Attribute('aria-label', t('sequenceWordsChoices', language)), h.Class('sequence-words-difficulty')], ([3, 5] as const).map(count => h.button([
        h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(count === model.count)), h.OnClick(SetCount({ count })),
      ], [t(count === 3 ? 'sequenceWordsThree' : 'sequenceWordsFive', language)]))),
    ]),
    h.p([h.Class('sequence-words-basis')], [t(BASIS_KEYS[model.group], language)]),
    h.div([
      h.Class('sequence-words-board'), h.Key('sequence-board'), h.Attribute('dir', 'ltr'),
      h.Attribute('data-sequence-token', String(model.token)), h.Attribute('data-sequence-status', model.status),
      h.Attribute('data-sequence-matched', model.matched.join(',')), h.OnMount({ name: 'sequenceWordsLines', f: mountSequenceLines }),
    ], [
      h.svg([h.Class('sequence-words-lines'), h.AriaHidden(true), h.Attribute('focusable', 'false')], [
        ...model.matched.map(choice => h.path([h.Key(`line-${choice}`), h.Attribute('data-sequence-line', String(choice)), h.Fill('none'), h.Stroke(LINE_COLOURS[model.numbers.indexOf(choice) % LINE_COLOURS.length]!), h.Attribute('stroke-width', '4'), h.Attribute('stroke-linecap', 'round')], [])),
        h.path([h.Class('sequence-words-drag-line'), h.Attribute('data-sequence-drag', ''), h.Fill('none'), h.Stroke('currentColor'), h.Attribute('stroke-width', '4'), h.Attribute('stroke-linecap', 'round')], []),
      ]),
      ...(['number', 'word'] as const).map(side => h.div([h.Class(`sequence-words-column sequence-words-column--${side}`), h.Attribute('role', 'group'), h.Attribute('aria-label', t(side === 'number' ? 'sequenceWordsNumbersColumn' : 'sequenceWordsWordsColumn', language))], (side === 'number' ? model.numbers : model.words).map(choice => {
        const matched = model.matched.includes(choice)
        const selected = model.selected?.side === side && model.selected.choice === choice
        return h.button([
          h.Key(`${side}-${choice}`), h.Class(`sequence-words-endpoint${matched ? ' sequence-words-endpoint--matched' : selected ? ' sequence-words-endpoint--selected' : ''}`), h.Disabled(busy || matched),
          h.Attribute('type', 'button'), h.Attribute('dir', side === 'number' ? 'ltr' : 'auto'), h.Attribute('aria-pressed', String(selected)),
          h.Attribute('aria-label', side === 'number' ? numbers.format(choice + 1) : words[choice] ?? ''),
          h.Attribute('data-multitouch-owned', 'true'), h.Attribute('data-sequence-side', side), h.Attribute('data-sequence-choice', String(choice)),
          h.Attribute('style', `--sequence-colour: ${matched ? LINE_COLOURS[model.numbers.indexOf(choice) % LINE_COLOURS.length] : '#9b9aaa'}`),
          h.OnClick(Pick({ side, choice, token: model.token })),
        ], [h.span([h.Class('sequence-words-endpoint-text')], [side === 'number' ? numbers.format(choice + 1) : words[choice] ?? '']),
          h.span([h.Class('sequence-words-anchor'), h.Attribute('data-sequence-anchor', ''), h.AriaHidden(true)], [matched ? '✓' : ''])])
      }))),
    ]),
    h.p([h.Class('sequence-words-status'), h.Role('status'), h.Attribute('aria-live', 'polite')], [won ? t('sequenceWordsCorrect', language) : model.wrong ? t('sequenceWordsTryAgain', language) : t('sequenceWordsConnectHint', language)]),
    h.button([h.Class('sequence-words-reference-toggle'), h.Attribute('type', 'button'), h.Attribute('aria-expanded', String(model.reference)), h.OnClick(ToggleReference())], [t('sequenceWordsReference', language)]),
    ...(model.reference ? [h.ol([h.Class('sequence-words-reference')], words.map((word, index) => h.li([], [h.span([h.Attribute('dir', 'ltr')], [numbers.format(index + 1)]), h.span([], [word])])))] : []),
  ])])
}
