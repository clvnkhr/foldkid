import { Cause, Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { pop } from '../audio'
import { normalizeLanguage, t, tf, type StringKey } from '../i18n'
import { BUBBLE3D_SHAPES, Bubble3dShape, bubble3dShapeDefinition } from './bubbles3dShapes'

export const INITIAL_BUBBLES = BUBBLE3D_SHAPES.length
export const ADD_BUBBLES = 12
export const MAX_BUBBLES = 60
const COLORS = ['#ff6584', '#ffab52', '#f9df63', '#63d6a1', '#5bcafa', '#9f8aff', '#ec8fe4', '#7ce5df'] as const

export const BUBBLE3D_SHAPE_KEYS = {
  sphere: 'bubbles3dShapeSphere', cube: 'bubbles3dShapeCube', cuboid: 'bubbles3dShapeCuboid', roundedCube: 'bubbles3dShapeRoundedCube',
  tetrahedron: 'bubbles3dShapeTetrahedron', octahedron: 'bubbles3dShapeOctahedron', dodecahedron: 'bubbles3dShapeDodecahedron', icosahedron: 'bubbles3dShapeIcosahedron',
  cone: 'bubbles3dShapeCone', cylinder: 'bubbles3dShapeCylinder', triangularPrism: 'bubbles3dShapeTriangularPrism', pentagonalPrism: 'bubbles3dShapePentagonalPrism',
  hexagonalPrism: 'bubbles3dShapeHexagonalPrism', pyramid: 'bubbles3dShapePyramid', triangularBipyramid: 'bubbles3dShapeTriangularBipyramid', capsule: 'bubbles3dShapeCapsule',
  torus: 'bubbles3dShapeTorus', torusKnot: 'bubbles3dShapeTorusKnot', star: 'bubbles3dShapeStar', heart: 'bubbles3dShapeHeart',
  crescent: 'bubbles3dShapeCrescent', gear: 'bubbles3dShapeGear', cross: 'bubbles3dShapeCross', diamond: 'bubbles3dShapeDiamond',
} as const satisfies Readonly<Record<Bubble3dShape, StringKey>>

export const Bubble = S.Struct({ id: S.Number, shape: Bubble3dShape, color: S.String, size: S.Number, x: S.Number, y: S.Number, z: S.Number })
export type Bubble = typeof Bubble.Type
const RendererStatus = S.Union([S.Literal('loading'), S.Literal('ready'), S.Literal('unavailable')])
export const Model = S.Struct({ bubbles: S.Array(Bubble), score: S.Number, nextId: S.Number, revision: S.Number, rendererStatus: RendererStatus })
export type Model = typeof Model.Type

export const ClickedPop = m('Bubbles3dClickedPop', { id: S.Number, revision: S.Number })
export const ClickedAdd = m('Bubbles3dClickedAdd')
export const ClickedReset = m('Bubbles3dClickedReset')
export const RendererReady = m('Bubbles3dRendererReady', { revision: S.Number })
export const RendererFailed = m('Bubbles3dRendererFailed', { revision: S.Number })
export const SoundPlayed = m('Bubbles3dSoundPlayed')
export const Message = S.Union([ClickedPop, ClickedAdd, ClickedReset, RendererReady, RendererFailed, SoundPlayed])
export type Message = typeof Message.Type

export const makeBubbles = (firstId: number, count: number): Bubble[] =>
  Array.from({ length: count }, (_, index) => {
    const id = firstId + index
    const angle = id * 2.399963229728653
    return {
      id,
      shape: BUBBLE3D_SHAPES[id % BUBBLE3D_SHAPES.length]!.id,
      color: COLORS[id % COLORS.length]!,
      size: 0.48 + ((id * 7) % 11) / 45,
      x: Math.sin(angle) * (0.3 + ((id * 3) % 8) / 13),
      y: Math.cos(angle * 0.79) * (0.3 + ((id * 5) % 8) / 13),
      z: Math.sin(angle * 0.57) * 0.82,
    }
  })

export const init = (): Model => ({ bubbles: makeBubbles(0, INITIAL_BUBBLES), score: 0, nextId: INITIAL_BUBBLES, revision: 0, rendererStatus: 'loading' })

const playPop = (): Command.Command<Message> => ({
  name: 'Bubbles3dPlayPop',
  effect: pop(SoundPlayed()).effect.pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))),
})

export const update = (model: Model, message: Message, muted: boolean): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      Bubbles3dClickedPop: msg => {
        if (!Number.isInteger(msg.id) || msg.id < 0 || msg.revision !== model.revision || !model.bubbles.some(bubble => bubble.id === msg.id)) return [model, []]
        return [{ ...model, bubbles: model.bubbles.filter(bubble => bubble.id !== msg.id), score: model.score + 1 }, muted ? [] : [playPop()]]
      },
      Bubbles3dClickedAdd: () => {
        const count = Math.min(ADD_BUBBLES, MAX_BUBBLES - model.bubbles.length)
        if (count <= 0) return [model, []]
        return [{ ...model, bubbles: [...model.bubbles, ...makeBubbles(model.nextId, count)], nextId: model.nextId + count }, []]
      },
      Bubbles3dClickedReset: () => [{ ...model, bubbles: makeBubbles(model.nextId, INITIAL_BUBBLES), score: 0, nextId: model.nextId + INITIAL_BUBBLES, revision: model.revision + 1 }, []],
      Bubbles3dRendererReady: msg => msg.revision === model.revision && model.rendererStatus !== 'ready' ? [{ ...model, rendererStatus: 'ready' }, []] : [model, []],
      Bubbles3dRendererFailed: msg => msg.revision === model.revision && model.rendererStatus !== 'unavailable' ? [{ ...model, rendererStatus: 'unavailable' }, []] : [model, []],
      Bubbles3dSoundPlayed: () => [model, []],
    }),
  )

type RuntimeModule = Pick<typeof import('./bubbles3dRuntime'), 'createBubbles3dRuntime'>
export const mountBubbles3d = (element: Element, loadRuntime: () => Promise<RuntimeModule> = () => import('./bubbles3dRuntime')): Stream.Stream<Message> => Stream.callback<Message>(queue =>
  Effect.gen(function* () {
    yield* Render.afterCommit
    const { createBubbles3dRuntime } = yield* Effect.promise(loadRuntime)
    yield* Effect.acquireRelease(
      Effect.sync(() => createBubbles3dRuntime(element as HTMLElement, {
        popped: (id, revision) => Queue.offerUnsafe(queue, ClickedPop({ id, revision })),
        ready: revision => Queue.offerUnsafe(queue, RendererReady({ revision })),
        unavailable: revision => Queue.offerUnsafe(queue, RendererFailed({ revision })),
      })),
      cleanup => Effect.sync(cleanup),
    )
    return yield* Effect.never
  }).pipe(Effect.catchCause(cause => Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.gen(function* () {
    const revision = Number(element.getAttribute('data-bubbles3d-revision'))
    Queue.offerUnsafe(queue, RendererFailed({ revision: Number.isInteger(revision) && revision >= 0 ? revision : 0 }))
    return yield* Effect.never
  }))),
)

export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const numbers = new Intl.NumberFormat(normalizeLanguage(language))
  return h.div([h.Class('page bubbles3d-page')], [
    h.div([h.Class('bubbles3d-card')], [
      h.div([h.Class('bubbles3d-heading')], [
        h.div([], [
          h.h1([h.Class('title')], [t('bubbles3dTitle', language)]),
          h.p([h.Class('bubbles3d-prompt'), h.Id('bubbles3d-prompt')], [t('bubbles3dPrompt', language)]),
        ]),
        h.div([h.Class('bubbles3d-actions'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('bubbles3dTitle', language))], [
          h.button([h.Class('btn btn-primary'), h.OnClick(ClickedAdd()), h.Disabled(model.bubbles.length >= MAX_BUBBLES)], [t('bubbles3dAdd', language)]),
          h.button([h.Class('btn btn-secondary'), h.OnClick(ClickedReset())], [t('bubbles3dReset', language)]),
        ]),
      ]),
      h.div([h.Class('bubbles3d-stage'), h.Attribute('data-renderer', model.rendererStatus), h.Attribute('aria-busy', (model.rendererStatus === 'loading').toString())], [
        h.div([
          h.Class('bubbles3d-scene'),
          h.Attribute('aria-hidden', 'true'),
          h.Attribute('data-bubbles3d-revision', model.revision.toString()),
          h.Attribute('data-bubbles3d-state', JSON.stringify({ bubbles: model.bubbles, revision: model.revision })),
          h.OnMount({ name: 'bubbles3dScene', f: mountBubbles3d }),
        ], []),
        ...(model.rendererStatus === 'unavailable' ? [h.p([h.Class('bubbles3d-unavailable'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite')], [t('bubbles3dUnavailable', language)])] : []),
        ...(model.bubbles.length === 0 ? [h.p([h.Class('bubbles3d-empty')], [t('allPopped', language)])] : []),
        h.div([h.Class('bubbles3d-bubble-buttons'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('bubbles3dTitle', language)), h.Attribute('aria-describedby', 'bubbles3d-prompt')], model.bubbles.map((bubble, index) => {
          const number = numbers.format(index + 1)
          const shape = bubble3dShapeDefinition(bubble.shape)
          return h.button([
            h.Class('bubbles3d-bubble-button'), h.Key(bubble.id.toString()),
            h.Style({ '--bubbles3d-color': bubble.color }),
            h.Attribute('aria-label', tf('bubbles3dShape', language, t(BUBBLE3D_SHAPE_KEYS[bubble.shape], language), number)),
            h.OnClick(ClickedPop({ id: bubble.id, revision: model.revision })),
          ], [
            h.span([h.Class('bubbles3d-shape-icon'), h.AriaHidden(true)], [shape.glyph]),
            h.span([h.Class('bubbles3d-shape-number'), h.AriaHidden(true)], [number]),
          ])
        })),
      ]),
      h.p([h.Class('bubbles3d-score'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [tf('bubbles3dPopped', language, numbers.format(model.score))]),
    ]),
  ])
}
