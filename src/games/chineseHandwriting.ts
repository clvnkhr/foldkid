import { Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { chime } from '../audio'
import { normalizeLanguage, t, tf } from '../i18n'
import { speakNow, type SpeechOptions } from '../speech'
import { BIANG_TARGET_INDEX, CHINESE_HANDWRITING_TARGETS, chineseHandwritingTargetText, guideForChineseHandwritingTarget } from './chineseHandwritingTargets'
import { CHINESE_HANDWRITING_CATEGORIES, chineseCategoryLabel, findChineseHandwritingGroup } from './chineseHandwritingGroups'
import { smoothChineseHandwritingPath } from './chineseHandwritingSmoothing'
import { renderBiangGlyph } from './chineseHandwritingBiangGlyph'
import { advanceHandwritingStroke, handwritingPath, handwritingResumeDistance, HANDWRITING_TOLERANCE, type HandwritingPoint } from './handwritingPaths'
import { createHandwritingRuntime } from './handwritingRuntime'

const Point = S.Struct({ x: S.Number, y: S.Number })
const Contact = S.Struct({ id: S.Number, stroke: S.Number, point: Point })
const Pen = S.Struct({ stroke: S.Number, point: Point })
export const Model = S.Struct({
  targetIndex: S.Number, category: S.String, targetPage: S.Number, choicePage: S.Number, randomRequest: S.Number, revision: S.Number,
  progress: S.Array(S.Number), contacts: S.Array(Contact), pen: S.NullOr(Pen), celebrated: S.Boolean,
})
export type Model = typeof Model.Type
export const SelectedTarget = m('ChineseHandwritingSelectedTarget', { index: S.Number })
export const NextTarget = m('ChineseHandwritingNextTarget')
export const PreviousTarget = m('ChineseHandwritingPreviousTarget')
export const NextTargetPage = m('ChineseHandwritingNextTargetPage')
export const PreviousTargetPage = m('ChineseHandwritingPreviousTargetPage')
export const SelectedCategory = m('ChineseHandwritingSelectedCategory', { category: S.String })
export const SelectedGroup = m('ChineseHandwritingSelectedGroup', { index: S.Number })
export const RandomTarget = m('ChineseHandwritingRandomTarget')
export const RandomTargetSelected = m('ChineseHandwritingRandomTargetSelected', { index: S.Number, revision: S.Number, request: S.Number })
export const Restarted = m('ChineseHandwritingRestarted')
export const PenStarted = m('ChineseHandwritingPenStarted', { id: S.Number, x: S.Number, y: S.Number, revision: S.Number })
export const PenMoved = m('ChineseHandwritingPenMoved', { id: S.Number, points: S.Array(Point), revision: S.Number })
export const PenEnded = m('ChineseHandwritingPenEnded', { id: S.Number, revision: S.Number })
export const PenCancelled = m('ChineseHandwritingPenCancelled', { id: S.Number, revision: S.Number })
export const KeyboardPressed = m('ChineseHandwritingKeyboardPressed', { key: S.String, revision: S.Number })
export const KeyboardLifted = m('ChineseHandwritingKeyboardLifted', { revision: S.Number })
export const SoundPlayed = m('ChineseHandwritingSoundPlayed')
export const TargetSpoken = m('ChineseHandwritingTargetSpoken')
export const Message = S.Union([
  SelectedTarget, NextTarget, PreviousTarget, NextTargetPage, PreviousTargetPage, SelectedCategory, SelectedGroup, RandomTarget, RandomTargetSelected, Restarted,
  PenStarted, PenMoved, PenEnded, PenCancelled, KeyboardPressed, KeyboardLifted, SoundPlayed, TargetSpoken,
])
export type Message = typeof Message.Type

export const CHINESE_HANDWRITING_CHOICES_PER_PAGE = 6
export const currentCategory = (model: Model) => CHINESE_HANDWRITING_CATEGORIES.find(category => category.id === model.category) ?? CHINESE_HANDWRITING_CATEGORIES[0]!
export const currentGroup = (model: Model) => currentCategory(model).groups[model.targetPage] ?? currentCategory(model).groups[0]!
const choicePageCount = (model: Model): number => Math.ceil(currentGroup(model).indices.length / CHINESE_HANDWRITING_CHOICES_PER_PAGE)
export const visibleChoices = (model: Model): ReadonlyArray<number> => currentGroup(model).indices.slice(model.choicePage * CHINESE_HANDWRITING_CHOICES_PER_PAGE, (model.choicePage + 1) * CHINESE_HANDWRITING_CHOICES_PER_PAGE)
const turnChoicePage = (model: Model, direction: number): Model => {
  const count = choicePageCount(model)
  return count < 2 ? model : { ...model, choicePage: (model.choicePage + direction + count) % count }
}
export const currentGuide = (model: Model) => guideForChineseHandwritingTarget(model.targetIndex)
export const init = (): Model => ({
  targetIndex: 0, category: CHINESE_HANDWRITING_CATEGORIES[0]!.id, targetPage: 0, choicePage: 0, randomRequest: 0, revision: 0,
  progress: guideForChineseHandwritingTarget(0).strokes.map(() => 0), contacts: [], pen: null, celebrated: false,
})
export const completedStrokes = (model: Model): number => currentGuide(model).strokes.filter((stroke, index) => model.progress[index] === stroke.length).length
export const isComplete = (model: Model): boolean => completedStrokes(model) === currentGuide(model).strokes.length
export const interrupt = (model: Model): Model => {
  // A cancelled final contact must remain resumable on return to the board.
  if (isComplete(model) && !model.celebrated) {
    const progress = [...model.progress]
    const last = currentGuide(model).strokes.length - 1
    progress[last] = Math.max(0, progress[last]! - 1)
    return { ...model, progress, revision: model.revision + 1, contacts: [], pen: null }
  }
  return { ...model, revision: model.revision + 1, contacts: [], pen: null }
}
type SelectionLocation = NonNullable<ReturnType<typeof findChineseHandwritingGroup>>
const preferredLocation = (model: Model, index: number): SelectionLocation => {
  const category = currentCategory(model)
  const groupIndex = category.groups[model.targetPage]?.indices.includes(index) ? model.targetPage
    : category.groups.findIndex(group => group.indices.includes(index))
  return groupIndex >= 0 ? { categoryId: category.id, groupIndex } : findChineseHandwritingGroup(index)!
}
const select = (model: Model, index: number, location: SelectionLocation = preferredLocation(model, index)): Model => {
  const indices = CHINESE_HANDWRITING_CATEGORIES.find(category => category.id === location.categoryId)!.groups[location.groupIndex]!.indices
  return {
    ...interrupt(model), targetIndex: index, category: location.categoryId, targetPage: location.groupIndex,
    choicePage: Math.floor(indices.indexOf(index) / CHINESE_HANDWRITING_CHOICES_PER_PAGE),
    progress: guideForChineseHandwritingTarget(index).strokes.map(() => 0), celebrated: false,
  }
}
const moveTarget = (model: Model, direction: number): Model => {
  const indices = currentGroup(model).indices
  if (indices.length < 2) return model
  const position = Math.max(0, indices.indexOf(model.targetIndex))
  return select(model, indices[(position + direction + indices.length) % indices.length]!)
}
const validId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0
const validIndex = (index: number): boolean => validId(index) && index < CHINESE_HANDWRITING_TARGETS.length
const validPoint = (point: HandwritingPoint): boolean => [point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) < 10000)
const nextStroke = (model: Model): number => currentGuide(model).strokes.findIndex((stroke, index) => model.progress[index]! < stroke.length)
const canResume = (model: Model, stroke: number, point: HandwritingPoint): boolean => {
  const points = currentGuide(model).strokes[stroke]!
  return handwritingResumeDistance(points, model.progress[stroke]!, point) <= HANDWRITING_TOLERANCE
}
const celebrate = (model: Model, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  if (!isComplete(model) || model.celebrated) return [model, []]
  return [{ ...model, celebrated: true }, muted ? [] : [
    { name: 'ChineseHandwritingPlayChime', effect: chime(SoundPlayed()).effect.pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))) },
    { name: 'ChineseHandwritingSpeakTarget', effect: Effect.sync(() => {
      speakNow(chineseHandwritingTargetText(model.targetIndex), { ...speech, lang: 'zh-CN' })
      return TargetSpoken()
    }).pipe(Effect.catchCause(() => Effect.succeed(TargetSpoken()))) },
  ]]
}
const DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }

export const update = (model: Model, message: Message, _language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    ChineseHandwritingSelectedTarget: msg => validIndex(msg.index) && msg.index !== model.targetIndex ? [select(model, msg.index), []] : [model, []],
    ChineseHandwritingNextTarget: () => [moveTarget(model, 1), []],
    ChineseHandwritingPreviousTarget: () => [moveTarget(model, -1), []],
    ChineseHandwritingSelectedCategory: msg => {
      const category = CHINESE_HANDWRITING_CATEGORIES.find(category => category.id === msg.category)
      return category && category.id !== model.category ? [select(model, category.groups[0]!.indices[0]!, { categoryId: category.id, groupIndex: 0 }), []] : [model, []]
    },
    ChineseHandwritingSelectedGroup: msg => Number.isSafeInteger(msg.index) && msg.index >= 0 && msg.index < currentCategory(model).groups.length && msg.index !== model.targetPage
      ? [select(model, currentCategory(model).groups[msg.index]!.indices[0]!, { categoryId: currentCategory(model).id, groupIndex: msg.index }), []] : [model, []],
    ChineseHandwritingNextTargetPage: () => [turnChoicePage(model, 1), []],
    ChineseHandwritingPreviousTargetPage: () => [turnChoicePage(model, -1), []],
    ChineseHandwritingRestarted: () => [select(model, model.targetIndex), []],
    ChineseHandwritingRandomTarget: () => {
      const indices = currentGroup(model).indices
      if (indices.length < 2) return [model, []]
      const request = model.randomRequest + 1
      const position = Math.max(0, indices.indexOf(model.targetIndex))
      const result = (offset: number) => RandomTargetSelected({ index: indices[(position + offset) % indices.length]!, revision: model.revision, request })
      return [{ ...model, randomRequest: request }, [{ name: 'ChineseHandwritingChooseRandom', effect: Effect.sync(() => {
        return result(1 + Math.floor(Math.random() * (indices.length - 1)))
      }).pipe(Effect.catchCause(() => Effect.succeed(result(1)))) }]]
    },
    ChineseHandwritingRandomTargetSelected: msg => msg.revision === model.revision && msg.request > 0 && msg.request === model.randomRequest && validIndex(msg.index) && currentGroup(model).indices.includes(msg.index) && msg.index !== model.targetIndex
      ? [select(model, msg.index), []] : [model, []],
    ChineseHandwritingPenStarted: msg => {
      if (msg.revision !== model.revision || !validId(msg.id) || !validPoint(msg) || isComplete(model) || model.contacts.length > 0 || model.pen) return [model, []]
      const stroke = nextStroke(model)
      if (stroke < 0 || !canResume(model, stroke, msg)) return [model, []]
      const point = { x: msg.x, y: msg.y }
      const progress = [...model.progress]
      progress[stroke] = advanceHandwritingStroke(currentGuide(model).strokes[stroke]!, progress[stroke]!, point, point)
      return [{ ...model, progress, contacts: [{ id: msg.id, stroke, point }] }, []]
    },
    ChineseHandwritingPenMoved: msg => {
      const contact = model.contacts.find(contact => contact.id === msg.id)
      if (msg.revision !== model.revision || !validId(msg.id) || !contact || msg.points.length === 0 || msg.points.length > 256 || !msg.points.every(validPoint)) return [model, []]
      const progress = [...model.progress]
      const points = currentGuide(model).strokes[contact.stroke]!
      let point = contact.point
      for (const next of msg.points) { progress[contact.stroke] = advanceHandwritingStroke(points, progress[contact.stroke]!, point, next); point = next }
      return [{ ...model, progress, contacts: [{ ...contact, point }] }, []]
    },
    ChineseHandwritingPenEnded: msg => msg.revision === model.revision && validId(msg.id) && model.contacts.some(contact => contact.id === msg.id)
      ? celebrate({ ...model, contacts: [] }, muted, speech) : [model, []],
    ChineseHandwritingPenCancelled: msg => {
      const contact = model.contacts.find(contact => contact.id === msg.id)
      if (msg.revision !== model.revision || !validId(msg.id) || !contact) return [model, []]
      const progress = [...model.progress]
      progress[contact.stroke] = Math.min(progress[contact.stroke]!, currentGuide(model).strokes[contact.stroke]!.length - 1)
      return [{ ...model, progress, contacts: [] }, []]
    },
    ChineseHandwritingKeyboardPressed: msg => {
      if (msg.revision !== model.revision || model.contacts.length > 0) return [model, []]
      if (msg.key === 'Enter' || msg.key === ' ') return celebrate({ ...model, pen: null }, muted, speech)
      const direction = Object.hasOwn(DIRECTIONS, msg.key) ? DIRECTIONS[msg.key] : undefined
      if (!direction || isComplete(model)) return [model, []]
      const stroke = model.pen?.stroke ?? nextStroke(model)
      const points = currentGuide(model).strokes[stroke]!
      if (model.progress[stroke] === points.length) return [model, []]
      const from = model.pen?.point ?? points[model.progress[stroke]!]!
      const point = { x: Math.max(0, Math.min(160, from.x + direction[0])), y: Math.max(0, Math.min(160, from.y + direction[1])) }
      const progress = [...model.progress]
      progress[stroke] = advanceHandwritingStroke(points, progress[stroke]!, from, point)
      return [{ ...model, progress, pen: { stroke, point } }, []]
    },
    ChineseHandwritingKeyboardLifted: msg => {
      if (msg.revision !== model.revision || !model.pen) return [model, []]
      if (!isComplete(model) || model.celebrated) return [{ ...model, pen: null }, []]
      const progress = [...model.progress]
      progress[model.pen.stroke] = Math.max(0, progress[model.pen.stroke]! - 1)
      return [{ ...model, progress, pen: null }, []]
    },
    ChineseHandwritingSoundPlayed: () => [model, []],
    ChineseHandwritingTargetSpoken: () => [model, []],
  }))

export const mountChineseHandwriting = (element: Element): Stream.Stream<Message> => Stream.callback<Message>(queue => Effect.gen(function* () {
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
export const view = (model: Model, language: string, _muted: boolean) => {
  const h = html<Message>()
  const guide = currentGuide(model)
  const character = CHINESE_HANDWRITING_TARGETS[model.targetIndex]!
  const numbers = new Intl.NumberFormat(normalizeLanguage(language))
  const active = nextStroke(model)
  const category = currentCategory(model)
  const group = currentGroup(model)
  const categorySections = [
    { kind: 'theme', label: 'chineseHandwritingThemes' },
    { kind: 'special', label: 'chineseHandwritingSpecial' },
    { kind: 'component', label: 'chineseHandwritingComponents' },
    { kind: 'strokes', label: 'chineseHandwritingStrokeCounts' },
  ] as const
  const glyph = (index: number) => index === BIANG_TARGET_INDEX ? renderBiangGlyph(h)
    : h.span([h.Attribute('lang', 'zh-CN')], [CHINESE_HANDWRITING_TARGETS[index]!.character])
  const stroke = guide.strokes[active]
  const next = stroke?.[model.progress[active]!]
  const tip = stroke?.[Math.min(stroke.length - 1, 3)]
  const start = stroke?.[0]
  const dx = start && tip ? tip.x - start.x : 0
  const dy = start && tip ? tip.y - start.y : 0
  const length = Math.hypot(dx, dy) || 1
  const arrow = tip && start && model.progress[active] === 0 ? handwritingPath([
    { x: tip.x - dx / length * 5 - dy / length * 3, y: tip.y - dy / length * 5 + dx / length * 3 }, tip,
    { x: tip.x - dx / length * 5 + dy / length * 3, y: tip.y - dy / length * 5 - dx / length * 3 },
  ]) : undefined
  return h.div([h.Class('page handwriting-page chinese-handwriting-page'), h.Attribute('data-multitouch-scroll', 'true')], [h.div([h.Class('card handwriting-card chinese-handwriting-card')], [
    h.h1([h.Class('title')], [t('chineseHandwritingTitle', language)]),
    h.div([h.Class('chinese-handwriting-selectors')], [
      h.label([h.Class('chinese-handwriting-select-label')], [t('chineseHandwritingCategory', language),
        h.select([h.Class('chinese-handwriting-category-select'), h.Attribute('aria-label', t('chineseHandwritingCategory', language)), h.Value(category.id), h.OnChange(category => SelectedCategory({ category }))],
          categorySections.map(section => h.optgroup([h.Attribute('label', t(section.label, language))], CHINESE_HANDWRITING_CATEGORIES.filter(entry => entry.kind === section.kind)
            .map(entry => h.option([h.Value(entry.id), h.Selected(entry.id === category.id)], [chineseCategoryLabel(entry, language)]))))),
      ]),
      ...(category.groups.length > 1 ? [h.label([h.Class('chinese-handwriting-select-label')], [t('chineseHandwritingGroup', language),
        h.select([h.Class('chinese-handwriting-group-select'), h.Attribute('aria-label', t('chineseHandwritingGroup', language)), h.Value(String(model.targetPage)), h.OnChange(index => SelectedGroup({ index: Number(index) }))],
          category.groups.map((entry, index) => h.option([h.Value(String(index)), h.Selected(index === model.targetPage)], [
            tf('chineseHandwritingGroupLabel', language, numbers.format(index + 1), numbers.format(category.groups.length), entry.indices.slice(0, 4).map(chineseHandwritingTargetText).join(' ')),
          ]))),
      ])] : []),
    ]),
    h.div([h.Class('chinese-handwriting-picker'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('chineseHandwritingCharacters', language))], [
      ...visibleChoices(model).map(index => h.button([
        h.Class(index === BIANG_TARGET_INDEX ? 'handwriting-choice chinese-handwriting-choice chinese-handwriting-choice--biang' : 'handwriting-choice chinese-handwriting-choice'), h.Key(`chinese-choice-${index}`), h.Attribute('type', 'button'),
        ...(index === BIANG_TARGET_INDEX ? [h.Attribute('aria-label', t('chineseHandwritingBiangLabel', language))] : []),
        h.Attribute('aria-pressed', String(model.targetIndex === index)), h.OnClick(SelectedTarget({ index })),
      ], [glyph(index)])),
    ]),
    ...(choicePageCount(model) > 1 ? [h.div([h.Class('chinese-handwriting-pagination')], [
      h.button([h.Class('handwriting-choice'), h.Attribute('type', 'button'), h.OnClick(PreviousTargetPage())], [t('handwritingPrevious', language)]),
      h.span([h.Class('chinese-handwriting-page-count'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [tf('chineseHandwritingChoicePage', language, numbers.format(model.choicePage + 1), numbers.format(choicePageCount(model)))]),
      h.button([h.Class('handwriting-choice'), h.Attribute('type', 'button'), h.OnClick(NextTargetPage())], [t('handwritingNext', language)]),
    ])] : []),
    h.div([h.Class('handwriting-target chinese-handwriting-target'), h.Attribute('dir', 'ltr'), h.Attribute('lang', 'zh-CN')], [
      h.span([], model.targetIndex === BIANG_TARGET_INDEX ? [glyph(model.targetIndex)] : [guide.text]), h.span([h.Class('chinese-handwriting-pinyin'), h.Attribute('title', t('chineseHandwritingPinyin', language))], [character.pinyin]),
    ]),
    h.svg([
      h.Class('handwriting-board chinese-handwriting-board'), h.Key(`chinese-handwriting-board-${model.revision}`), h.ViewBox('0 0 160 160'),
      h.Attribute('preserveAspectRatio', 'xMidYMid meet'), h.Attribute('role', 'application'), h.Attribute('tabindex', '0'), h.Attribute('focusable', 'true'),
      h.Attribute('aria-label', tf('handwritingBoard', language, chineseHandwritingTargetText(model.targetIndex))), h.Attribute('aria-describedby', 'chinese-handwriting-keyboard-hint'),
      ...(model.targetIndex === BIANG_TARGET_INDEX ? [h.Attribute('data-special', 'biang')] : []),
      h.Attribute('data-handwriting-revision', String(model.revision)), h.Attribute('data-complete', String(isComplete(model))),
      h.OnKeyDown(key => KeyboardPressed({ key, revision: model.revision })), h.OnBlur(KeyboardLifted({ revision: model.revision })),
      h.OnMount({ name: 'chineseHandwritingInput', f: mountChineseHandwriting }),
    ], [
      h.defs([h.AriaHidden(true)], guide.strokes.map((_stroke, index) => h.linearGradient([
        h.Id(`chinese-handwriting-gradient-${model.revision}-${index}`), h.Attribute('gradientUnits', 'userSpaceOnUse'),
        h.Attribute('x1', '16'), h.Attribute('y1', '16'), h.Attribute('x2', '144'), h.Attribute('y2', '144'),
      ], [0, 1, 2].map(offset => h.stop([h.Attribute('offset', `${offset * 50}%`), h.Attribute('stop-color', COLORS[(index + offset) % COLORS.length]!)], []))))),
      h.g([h.AriaHidden(true), h.Attribute('focusable', 'false')], [
        h.path([h.Class('handwriting-midline'), h.D('M 8 80 H 152 M 80 8 V 152 M 8 8 L 152 152 M 152 8 L 8 152')], []),
        ...guide.strokes.map((points, index) => h.path([h.Class('handwriting-guide chinese-handwriting-guide'), h.D(smoothChineseHandwritingPath(points, 'strong')), h.Attribute('data-active', String(index === active))], [])),
        ...guide.strokes.flatMap((points, index) => model.progress[index]! > 1 ? [
          h.path([h.Class('handwriting-ink chinese-handwriting-ink'), h.D(smoothChineseHandwritingPath(points.slice(0, model.progress[index]), 'strong')), h.Stroke(`url(#chinese-handwriting-gradient-${model.revision}-${index})`)], []),
          h.path([h.Class('handwriting-ink-highlight'), h.D(smoothChineseHandwritingPath(points.slice(0, model.progress[index]), 'strong'))], []),
        ] : []),
        ...(next ? [
          ...(arrow ? [h.path([h.Class('handwriting-direction'), h.D(arrow), h.Stroke(COLORS[active % COLORS.length]!)], [])] : []),
          h.circle([h.Class('handwriting-start'), h.Cx(String(next.x)), h.Cy(String(next.y)), h.R('4.6'), h.Fill(COLORS[active % COLORS.length]!)], []),
          h.circle([h.Class('handwriting-stroke-badge'), h.Cx('10'), h.Cy('10'), h.R('6.5'), h.Stroke(COLORS[active % COLORS.length]!)], []),
          h.text([h.Class('handwriting-stroke-number'), h.Attribute('x', '10'), h.Attribute('y', '10'), h.Fill(COLORS[active % COLORS.length]!)], [numbers.format(active + 1)]),
        ] : []),
        ...(model.pen ? [h.circle([h.Class('handwriting-pen'), h.Cx(String(model.pen.point.x)), h.Cy(String(model.pen.point.y)), h.R('3')], [])] : []),
      ]),
    ]),
    h.p([h.Class('handwriting-keyboard-hint'), h.Id('chinese-handwriting-keyboard-hint')], [t('handwritingKeyboardHint', language)]),
    h.p([h.Class('handwriting-feedback'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [isComplete(model)
      ? t('handwritingComplete', language) : tf('handwritingProgress', language, numbers.format(completedStrokes(model)), numbers.format(guide.strokes.length))]),
    h.div([h.Class('handwriting-actions')], [
      h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.OnClick(Restarted())], [t('handwritingAgain', language)]),
      h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.Disabled(group.indices.length < 2), h.OnClick(RandomTarget())], [t('handwritingRandom', language)]),
    ]),
    h.p([h.Class('chinese-handwriting-library')], [tf('chineseHandwritingLibrary', language, numbers.format(CHINESE_HANDWRITING_TARGETS.length))]),
  ])])
}
