import { Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { pop } from '../audio'
import { normalizeLanguage, t, tf, type StringKey } from '../i18n'
import type { SpeechOptions } from '../speech'
import { BOARD_WIDTH, BOARD_HEIGHT, DOT_COLORS, MAX_DOTS, clampPoint, edgesFor, hasRoomFor, isPolygon, shapeKind, validId, validPoint } from './dotShapesDomain'
import { createDotShapesRuntime } from './dotShapesRuntime'

const Point = S.Struct({ x: S.Number, y: S.Number })
const Dot = S.Struct({ id: S.Number, x: S.Number, y: S.Number })
const Contact = S.Struct({ id: S.Number, dotId: S.NullOr(S.Number), point: Point, offset: Point })
export const Model = S.Struct({
  points: S.Array(Dot), contacts: S.Array(Contact), revision: S.Number, nextDotId: S.Number,
  cursor: Point, cursorVisible: S.Boolean,
})
export type Model = typeof Model.Type
export const ContactStarted = m('DotShapesContactStarted', { id: S.Number, x: S.Number, y: S.Number, dotId: S.NullOr(S.Number), revision: S.Number })
export const ContactMoved = m('DotShapesContactMoved', { id: S.Number, x: S.Number, y: S.Number, revision: S.Number })
export const ContactEnded = m('DotShapesContactEnded', { id: S.Number, x: S.Number, y: S.Number, moved: S.Boolean, revision: S.Number })
export const ContactCancelled = m('DotShapesContactCancelled', { id: S.Number, revision: S.Number })
export const KeyboardPressed = m('DotShapesKeyboardPressed', { key: S.String, dotId: S.NullOr(S.Number), shift: S.Boolean, revision: S.Number })
export const Undo = m('DotShapesUndo')
export const Clear = m('DotShapesClear')
export const SoundPlayed = m('DotShapesSoundPlayed')
export const Message = S.Union([ContactStarted, ContactMoved, ContactEnded, ContactCancelled, KeyboardPressed, Undo, Clear, SoundPlayed])
export type Message = typeof Message.Type

export const init = (): Model => ({ points: [], contacts: [], revision: 0, nextDotId: 0, cursor: { x: 500, y: 350 }, cursorVisible: false })
export const interrupt = (model: Model): Model => ({ ...model, revision: model.revision + 1, contacts: [], cursorVisible: false })
export const displayPoints = (model: Model) => model.points.map(dot => {
  const contact = model.contacts.find(contact => contact.dotId === dot.id)
  return contact ? { ...dot, ...contact.point } : dot
})
const undo = (model: Model): Model => ({ ...interrupt(model), points: model.points.slice(0, -1) })
const sounded = (model: Model, muted: boolean): readonly [Model, ReadonlyArray<Command.Command<Message>>] => [model, muted ? [] : [{
  name: 'DotShapesPlayPop', effect: pop(SoundPlayed()).effect.pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))),
}]]
const place = (model: Model, point: typeof Point.Type, muted: boolean): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  if (!validPoint(point) || model.points.length >= MAX_DOTS || !validId(model.nextDotId)) return [model, []]
  const position = clampPoint(point)
  if (!hasRoomFor(displayPoints(model), position)) return [model, []]
  return sounded({ ...model, points: [...model.points, { id: model.nextDotId, ...position }], nextDotId: model.nextDotId + 1 }, muted)
}
const DIRECTIONS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

export const update = (model: Model, message: Message, _language: string, muted: boolean, _speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    DotShapesContactStarted: msg => {
      if (msg.revision !== model.revision || !validId(msg.id) || !validPoint(msg) || model.contacts.some(contact => contact.id === msg.id) ||
        model.contacts.length >= MAX_DOTS || (msg.dotId === null ? model.points.length >= MAX_DOTS :
          !validId(msg.dotId) || !model.points.some(dot => dot.id === msg.dotId) || model.contacts.some(contact => contact.dotId === msg.dotId))) return [model, []]
      const dot = model.points.find(dot => dot.id === msg.dotId)
      const point = dot ? { x: dot.x, y: dot.y } : clampPoint(msg)
      const offset = dot ? { x: dot.x - msg.x, y: dot.y - msg.y } : { x: 0, y: 0 }
      return [{ ...model, cursorVisible: false, contacts: [...model.contacts, { id: msg.id, dotId: msg.dotId, point, offset }] }, []]
    },
    DotShapesContactMoved: msg => {
      const contact = model.contacts.find(contact => contact.id === msg.id)
      if (msg.revision !== model.revision || !validId(msg.id) || !validPoint(msg) || !contact) return [model, []]
      const point = clampPoint({ x: msg.x + contact.offset.x, y: msg.y + contact.offset.y })
      if (contact.dotId !== null && !hasRoomFor(displayPoints(model), point, contact.dotId)) return [model, []]
      return [{ ...model, contacts: model.contacts.map(current => current.id === msg.id ? { ...current, point } : current) }, []]
    },
    DotShapesContactEnded: msg => {
      const contact = model.contacts.find(contact => contact.id === msg.id)
      if (msg.revision !== model.revision || !validId(msg.id) || !contact) return [model, []]
      const next = { ...model, contacts: model.contacts.filter(current => current.id !== msg.id) }
      if (!validPoint(msg)) return [next, []]
      if (contact.dotId === null) return msg.moved ? [next, []] : place(next, msg, muted)
      const point = clampPoint({ x: msg.x + contact.offset.x, y: msg.y + contact.offset.y })
      const dot = model.points.find(dot => dot.id === contact.dotId)
      if (!dot || !hasRoomFor(displayPoints(next), point, dot.id) || dot.x === point.x && dot.y === point.y) return [next, []]
      return sounded({ ...next, points: next.points.map(current => current.id === dot.id ? { ...dot, ...point } : current) }, muted)
    },
    DotShapesContactCancelled: msg => msg.revision === model.revision && validId(msg.id) && model.contacts.some(contact => contact.id === msg.id)
      ? [{ ...model, contacts: model.contacts.filter(contact => contact.id !== msg.id) }, []] : [model, []],
    DotShapesKeyboardPressed: msg => {
      if (msg.revision !== model.revision || msg.dotId !== null && (!validId(msg.dotId) || !model.points.some(dot => dot.id === msg.dotId))) return [model, []]
      if (msg.key === 'Backspace') return [undo(model), []]
      if (msg.key === 'Escape') return [interrupt(model), []]
      if (msg.key === 'Enter' || msg.key === ' ') return msg.dotId === null ? place({ ...model, cursorVisible: true }, model.cursor, muted) : [model, []]
      const direction = Object.hasOwn(DIRECTIONS, msg.key) ? DIRECTIONS[msg.key] : undefined
      if (!direction) return [model, []]
      const dot = model.points.find(dot => dot.id === msg.dotId)
      if (dot && model.contacts.some(contact => contact.dotId === dot.id)) return [model, []]
      const from = dot ?? model.cursor
      const step = msg.shift ? 100 : 25
      const point = clampPoint({ x: from.x + direction[0] * step, y: from.y + direction[1] * step })
      return dot ? hasRoomFor(displayPoints(model), point, dot.id) ? [{ ...model, points: model.points.map(current => current.id === dot.id ? { ...dot, ...point } : current) }, []] : [model, []]
        : [{ ...model, cursor: point, cursorVisible: true }, []]
    },
    DotShapesUndo: () => [undo(model), []],
    DotShapesClear: () => [{ ...interrupt(model), points: [] }, []],
    DotShapesSoundPlayed: () => [model, []],
  }))

export const mountDotShapes = (element: Element): Stream.Stream<Message> => Stream.callback<Message>(queue => Effect.gen(function* () {
  yield* Render.afterCommit
  yield* Effect.acquireRelease(Effect.sync(() => createDotShapesRuntime(element as HTMLElement, {
    started: (id, x, y, dotId, revision) => Queue.offerUnsafe(queue, ContactStarted({ id, x, y, dotId, revision })),
    moved: (id, x, y, revision) => Queue.offerUnsafe(queue, ContactMoved({ id, x, y, revision })),
    ended: (id, x, y, moved, revision) => Queue.offerUnsafe(queue, ContactEnded({ id, x, y, moved, revision })),
    cancelled: (id, revision) => Queue.offerUnsafe(queue, ContactCancelled({ id, revision })),
    keyboard: (key, dotId, shift, revision) => Queue.offerUnsafe(queue, KeyboardPressed({ key, dotId, shift, revision })),
  })), cleanup => Effect.sync(cleanup))
  return yield* Effect.never
}))

const SHAPE_KEYS: Record<Exclude<ReturnType<typeof shapeKind>, 'polygon'>, StringKey> = {
  empty: 'dotShapesEmpty', dot: 'dotShapesDot', line: 'dotShapesLine', triangle: 'dotShapesTriangle', quadrilateral: 'dotShapesQuadrilateral',
  pentagon: 'dotShapesPentagon', hexagon: 'dotShapesHexagon', heptagon: 'dotShapesHeptagon', octagon: 'dotShapesOctagon', nonagon: 'dotShapesNonagon', decagon: 'dotShapesDecagon',
}
export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const points = displayPoints(model)
  const numbers = new Intl.NumberFormat(normalizeLanguage(language))
  const kind = shapeKind(points)
  const shape = kind === 'polygon' ? tf('dotShapesPolygon', language, numbers.format(points.length)) : t(SHAPE_KEYS[kind], language)
  return h.div([h.Class('page dot-shapes-page')], [h.div([h.Class('card dot-shapes-card')], [
    h.div([h.Class('dot-shapes-toolbar')], [
      h.h1([h.Class('title')], [t('dotShapesTitle', language)]),
      h.div([h.Class('dot-shapes-actions')], [
        h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.Disabled(model.points.length === 0 && model.contacts.length === 0), h.OnClick(Undo())], [t('dotShapesUndo', language)]),
        h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.Disabled(model.points.length === 0 && model.contacts.length === 0), h.OnClick(Clear())], [t('clear', language)]),
      ]),
    ]),
    h.div([
      h.Class('dot-shapes-board'), h.Attribute('role', 'group'), h.Attribute('tabindex', '0'), h.Attribute('aria-label', t('dotShapesBoard', language)),
      h.Attribute('aria-describedby', 'dot-shapes-keyboard'), h.Attribute('data-dot-shapes-revision', String(model.revision)),
      h.Attribute('data-multitouch-owned', 'true'),
      h.OnMount({ name: 'dotShapesInput', f: mountDotShapes }),
    ], [
      h.svg([h.Class('dot-shapes-lines'), h.ViewBox(`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`), h.Attribute('preserveAspectRatio', 'none'), h.AriaHidden(true), h.Attribute('focusable', 'false')], [
        h.defs([], [h.linearGradient([h.Id('dot-shapes-fill'), h.Attribute('x1', '0%'), h.Attribute('y1', '0%'), h.Attribute('x2', '100%'), h.Attribute('y2', '100%')],
          [DOT_COLORS[0]!, DOT_COLORS[2]!, DOT_COLORS[4]!].map((color, index) => h.stop([h.Attribute('offset', `${index * 50}%`), h.Attribute('stop-color', color)], [])))]),
        ...(isPolygon(points) ? [h.path([h.Class('dot-shapes-fill'), h.D(`${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`), h.Fill('url(#dot-shapes-fill)'), h.Attribute('fill-rule', 'evenodd')], [])] : []),
        ...edgesFor(points).map(edge => h.line([h.Class('dot-shapes-edge'), h.Key(`edge-${edge.from.id}-${edge.to.id}`), h.X1(String(edge.from.x)), h.Y1(String(edge.from.y)), h.X2(String(edge.to.x)), h.Y2(String(edge.to.y)), h.Stroke(edge.color), h.Attribute('vector-effect', 'non-scaling-stroke')], [])),
      ]),
      ...points.map((dot, index) => h.button([
        h.Class(model.contacts.some(contact => contact.dotId === dot.id) ? 'dot-shapes-point dot-shapes-point--dragging' : 'dot-shapes-point'), h.Key(`dot-${dot.id}`), h.Attribute('type', 'button'),
        h.Attribute('data-dot-shapes-id', String(dot.id)), h.Attribute('aria-label', tf('dotShapesDotLabel', language, numbers.format(index + 1))),
        h.Attribute('aria-describedby', 'dot-shapes-keyboard'), h.Style({ left: `${dot.x / 10}%`, top: `${dot.y / 7}%`, '--dot-shapes-color': DOT_COLORS[index % DOT_COLORS.length]! }),
      ], [h.span([h.Class('dot-shapes-dot-core'), h.AriaHidden(true)], [])])),
      ...(model.cursorVisible ? [h.span([h.Class('dot-shapes-cursor'), h.AriaHidden(true), h.Style({ left: `${model.cursor.x / 10}%`, top: `${model.cursor.y / 7}%` })], [])] : []),
    ]),
    h.p([h.Id('dot-shapes-keyboard'), h.Class('dot-shapes-keyboard-hint')], [t('dotShapesKeyboard', language)]),
    h.p([h.Class('dot-shapes-status'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [tf('dotShapesStatus', language, shape, numbers.format(points.length))]),
  ])])
}
