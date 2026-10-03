import { Cause, Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { chime, pop } from '../audio'
import { normalizeLanguage, t, tf, type StringKey } from '../i18n'
import { speak, type SpeechOptions } from '../speech'
import { createBubbles3dControls } from './bubbles3dControls'
import { BUBBLE3D_COLORS, Bubble3dColor, bubble3dColorKey, bubble3dSizeForDuration, isBubble3dColor } from './bubbles3dCreation'
import { BUBBLE3D_SHAPES, Bubble3dShape, bubble3dShapeDefinition, isBubble3dShape } from './bubbles3dShapes'

export const MAX_BUBBLES = 60
export const SHAPES_PER_PAGE = 5
export const SHAPE_PAGE_COUNT = Math.ceil(BUBBLE3D_SHAPES.length / SHAPES_PER_PAGE)

export const BUBBLE3D_SHAPE_KEYS = {
  sphere: 'bubbles3dShapeSphere', cube: 'bubbles3dShapeCube', cuboid: 'bubbles3dShapeCuboid', roundedCube: 'bubbles3dShapeRoundedCube',
  tetrahedron: 'bubbles3dShapeTetrahedron', octahedron: 'bubbles3dShapeOctahedron', dodecahedron: 'bubbles3dShapeDodecahedron', icosahedron: 'bubbles3dShapeIcosahedron',
  cone: 'bubbles3dShapeCone', cylinder: 'bubbles3dShapeCylinder', triangularPrism: 'bubbles3dShapeTriangularPrism', pentagonalPrism: 'bubbles3dShapePentagonalPrism',
  hexagonalPrism: 'bubbles3dShapeHexagonalPrism', pyramid: 'bubbles3dShapePyramid', triangularBipyramid: 'bubbles3dShapeTriangularBipyramid', capsule: 'bubbles3dShapeCapsule',
  torus: 'bubbles3dShapeTorus', torusKnot: 'bubbles3dShapeTorusKnot', star: 'bubbles3dShapeStar', heart: 'bubbles3dShapeHeart',
  crescent: 'bubbles3dShapeCrescent', gear: 'bubbles3dShapeGear', cross: 'bubbles3dShapeCross', diamond: 'bubbles3dShapeDiamond',
} as const satisfies Readonly<Record<Bubble3dShape, StringKey>>

export const Bubble = S.Struct({ id: S.Number, shape: Bubble3dShape, color: S.String, rainbow: S.Boolean, size: S.Number, x: S.Number, y: S.Number, z: S.Number })
export type Bubble = typeof Bubble.Type
const RendererStatus = S.Union([S.Literal('loading'), S.Literal('ready'), S.Literal('unavailable')])
const Creation = S.Struct({ shape: Bubble3dShape, color: Bubble3dColor })
export const Model = S.Struct({
  bubbles: S.Array(Bubble), score: S.Number, nextId: S.Number, revision: S.Number, rendererStatus: RendererStatus,
  selectedShape: Bubble3dShape, selectedColor: S.Union([S.Literal(''), Bubble3dColor]), shapePage: S.Number,
  lastCreationId: S.Number, lastCreation: S.NullOr(Creation),
})
export type Model = typeof Model.Type

export const ClickedPop = m('Bubbles3dClickedPop', { id: S.Number, revision: S.Number })
export const CreatedBubble = m('Bubbles3dCreatedBubble', { shape: Bubble3dShape, color: Bubble3dColor, duration: S.Number, revision: S.Number, creationId: S.Number })
export const SelectedShape = m('Bubbles3dSelectedShape', { shape: Bubble3dShape })
export const NextShapePage = m('Bubbles3dNextShapePage')
export const ClickedClear = m('Bubbles3dClickedClear')
export const RendererReady = m('Bubbles3dRendererReady', { revision: S.Number })
export const RendererFailed = m('Bubbles3dRendererFailed', { revision: S.Number })
export const SoundPlayed = m('Bubbles3dSoundPlayed')
export const Message = S.Union([ClickedPop, CreatedBubble, SelectedShape, NextShapePage, ClickedClear, RendererReady, RendererFailed, SoundPlayed])
export type Message = typeof Message.Type

export const makeBubble = (id: number, shape: Bubble3dShape, color: Bubble3dColor, duration: number): Bubble => {
  const angle = id * 2.399963229728653
  return {
    id, shape, color: color === 'rainbow' ? '#ffffff' : color, rainbow: color === 'rainbow', size: bubble3dSizeForDuration(duration),
    x: Math.sin(angle) * (0.3 + ((id * 3) % 8) / 13),
    y: Math.cos(angle * 0.79) * (0.3 + ((id * 5) % 8) / 13),
    z: Math.sin(angle * 0.57) * 0.82,
  }
}

export const init = (): Model => ({
  bubbles: [], score: 0, nextId: 0, revision: 0, rendererStatus: 'loading',
  selectedShape: 'sphere', selectedColor: '', shapePage: 0, lastCreationId: -1, lastCreation: null,
})

export const spokenCreation = (shape: Bubble3dShape, color: Bubble3dColor, language: string): string =>
  tf('coloredShape', language,
    t(bubble3dColorKey(color), language).toLocaleLowerCase(normalizeLanguage(language)),
    t(BUBBLE3D_SHAPE_KEYS[shape], language).toLocaleLowerCase(normalizeLanguage(language)))

const creationFeedback = (shape: Bubble3dShape, color: Bubble3dColor, language: string, speech: SpeechOptions): ReadonlyArray<Command.Command<Message>> => [
  { name: 'Bubbles3dPlayChime', effect: chime(SoundPlayed()).effect.pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))) },
  { name: 'Bubbles3dSpeakCreation', effect: speak(spokenCreation(shape, color, language), SoundPlayed(), { ...speech, lang: language }).effect.pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))) },
]

const playPop = (): Command.Command<Message> => ({
  name: 'Bubbles3dPlayPop',
  effect: pop(SoundPlayed()).effect.pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))),
})

export const update = (model: Model, message: Message, muted: boolean, language: string, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      Bubbles3dClickedPop: msg => {
        if (!Number.isInteger(msg.id) || msg.id < 0 || msg.revision !== model.revision || !model.bubbles.some(bubble => bubble.id === msg.id)) return [model, []]
        return [{ ...model, bubbles: model.bubbles.filter(bubble => bubble.id !== msg.id), score: model.score + 1 }, muted ? [] : [playPop()]]
      },
      Bubbles3dCreatedBubble: msg => {
        if (msg.revision !== model.revision || !Number.isSafeInteger(msg.creationId) || msg.creationId < 0 || msg.creationId <= model.lastCreationId ||
          !Number.isFinite(msg.duration) || msg.duration < 0 || !isBubble3dShape(msg.shape) || !isBubble3dColor(msg.color) || model.bubbles.length >= MAX_BUBBLES) return [model, []]
        return [{
          ...model, bubbles: [...model.bubbles, makeBubble(model.nextId, msg.shape, msg.color, msg.duration)], nextId: model.nextId + 1,
          lastCreationId: msg.creationId, lastCreation: { shape: msg.shape, color: msg.color }, selectedColor: msg.color,
        }, muted ? [] : creationFeedback(msg.shape, msg.color, language, speech)]
      },
      Bubbles3dSelectedShape: msg => isBubble3dShape(msg.shape) && msg.shape !== model.selectedShape ? [{ ...model, selectedShape: msg.shape }, []] : [model, []],
      Bubbles3dNextShapePage: () => [{ ...model, shapePage: (model.shapePage + 1) % SHAPE_PAGE_COUNT }, []],
      Bubbles3dClickedClear: () => [{ ...model, bubbles: [], score: 0, lastCreation: null, selectedColor: '', revision: model.revision + 1 }, []],
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

export const mountCreationControls = (element: Element): Stream.Stream<Message> => Stream.callback<Message>(queue =>
  Effect.gen(function* () {
    yield* Render.afterCommit
    yield* Effect.acquireRelease(
      Effect.sync(() => createBubbles3dControls(element as HTMLElement, creation => Queue.offerUnsafe(queue, CreatedBubble(creation)))),
      cleanup => Effect.sync(cleanup),
    )
    return yield* Effect.never
  }),
)

export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const numbers = new Intl.NumberFormat(normalizeLanguage(language))
  const visibleShapes = BUBBLE3D_SHAPES.slice(model.shapePage * SHAPES_PER_PAGE, (model.shapePage + 1) * SHAPES_PER_PAGE)
  const atLimit = model.bubbles.length >= MAX_BUBBLES
  return h.div([h.Class('page bubbles3d-page')], [
    h.div([h.Class('bubbles3d-card')], [
      h.div([h.Class('bubbles3d-heading')], [
        h.h1([h.Class('title')], [t('bubbles3dTitle', language)]),
        h.p([h.Class('bubbles3d-score'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [tf('bubbles3dPopped', language, numbers.format(model.score))]),
        h.button([h.Class('btn btn-secondary bubbles3d-clear'), h.Attribute('type', 'button'), h.OnClick(ClickedClear())], [t('clear', language)]),
        h.p([h.Class('bubbles3d-prompt'), h.Id('bubbles3d-prompt')], [t('bubbles3dPrompt', language)]),
      ]),
      h.div([h.Class('bubbles3d-controls')], [
        h.div([h.Class('bubbles3d-shape-selector'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('bubbles3dTitle', language))], [
          ...visibleShapes.map(shape => h.button([
            h.Class('bubbles3d-shape-button'), h.Key(shape.id), h.Attribute('type', 'button'),
            h.Attribute('aria-pressed', String(shape.id === model.selectedShape)), h.OnClick(SelectedShape({ shape: shape.id })),
          ], [t(BUBBLE3D_SHAPE_KEYS[shape.id], language)])),
          h.button([h.Class('bubbles3d-shape-button'), h.Key('next-shape-page'), h.Attribute('type', 'button'), h.OnClick(NextShapePage())], [t('next', language)]),
        ]),
        h.div([
          h.Class('bubbles3d-color-selector'), h.Key('bubbles3d-colors'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('bubbles3dTitle', language)),
          h.Attribute('data-bubbles3d-revision', String(model.revision)), h.Attribute('data-bubbles3d-next-creation-id', String(model.lastCreationId + 1)),
          h.OnMount({ name: 'bubbles3dControls', f: mountCreationControls }),
        ], BUBBLE3D_COLORS.map(color => h.button([
          h.Class('bubbles3d-color-button'), h.Key(color.value), h.Attribute('type', 'button'),
          h.Style({ '--bubbles3d-color': color.value === 'rainbow' ? 'linear-gradient(135deg, #FF4757, #FFD93D, #2ED573, #1E90FF, #A855F7)' : color.value }),
          h.Attribute('data-color', color.value), h.Attribute('data-shape', model.selectedShape), h.Attribute('data-multitouch-owned', 'true'),
          h.Attribute('aria-label', t(color.key, language)), h.Attribute('aria-pressed', String(color.value === model.selectedColor)), h.Disabled(atLimit),
        ], color.value === 'rainbow' ? [h.span([h.AriaHidden(true)], ['🌈'])] : []))),
      ]),
      h.p([h.Class('bubbles3d-readout'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [
        atLimit ? t('bubbles3dLimit', language) : model.lastCreation ? spokenCreation(model.lastCreation.shape, model.lastCreation.color, language) : t(BUBBLE3D_SHAPE_KEYS[model.selectedShape], language),
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
        ...(model.bubbles.length === 0 ? [h.p([h.Class('bubbles3d-empty')], [t(model.score > 0 ? 'allPopped' : 'bubbles3dEmpty', language)])] : []),
        h.div([h.Class('bubbles3d-bubble-buttons'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('bubbles3dTitle', language)), h.Attribute('aria-describedby', 'bubbles3d-prompt')], model.bubbles.map((bubble, index) => {
          const number = numbers.format(index + 1)
          const shape = bubble3dShapeDefinition(bubble.shape)
          return h.button([
            h.Class('bubbles3d-bubble-button'), h.Key(bubble.id.toString()),
            h.Style({ '--bubbles3d-color': bubble.rainbow ? 'linear-gradient(135deg, #FF4757, #FFD93D, #2ED573, #1E90FF, #A855F7)' : bubble.color }),
            h.Attribute('aria-label', tf('bubbles3dShape', language, t(BUBBLE3D_SHAPE_KEYS[bubble.shape], language), number)),
            h.OnClick(ClickedPop({ id: bubble.id, revision: model.revision })),
          ], [
            h.span([h.Class('bubbles3d-shape-icon'), h.AriaHidden(true)], [shape.glyph]),
            h.span([h.Class('bubbles3d-shape-number'), h.AriaHidden(true)], [number]),
          ])
        })),
      ]),
    ]),
  ])
}
