import { Effect, Fiber, Option, Stream } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as Audio from '../audio'
import { t, tf } from '../i18n'
import * as Bubbles3d from './bubbles3d'
import { BUBBLE3D_SHAPES } from './bubbles3dShapes'

const update = (model: Bubbles3d.Model, message: Bubbles3d.Message) => Bubbles3d.update(model, message, false)
const mutedUpdate = (model: Bubbles3d.Model, message: Bubbles3d.Message) => Bubbles3d.update(model, message, true)
const view = (model: Bubbles3d.Model) => Bubbles3d.view(model, 'en')
const popSound = [{ name: 'Bubbles3dPlayPop' }, Bubbles3d.SoundPlayed()] as const
const mounted = [{ name: 'bubbles3dScene' }, Bubbles3d.RendererReady({ revision: 0 })] as const
const shapeLabel = (bubble: Bubbles3d.Bubble, language: string, index: number): string =>
  tf('bubbles3dShape', language, t(Bubbles3d.BUBBLE3D_SHAPE_KEYS[bubble.shape], language), new Intl.NumberFormat(language).format(index + 1))

afterEach(() => vi.restoreAllMocks())

describe('3D Bubbles', () => {
  it('starts with a deterministic, colorful, finite set containing every shape', () => {
    const model = Bubbles3d.init()
    expect(model).toEqual(Bubbles3d.init())
    expect(model.bubbles).toHaveLength(Bubbles3d.INITIAL_BUBBLES)
    expect(model.score).toBe(0)
    expect(new Set(model.bubbles.map(bubble => bubble.id)).size).toBe(Bubbles3d.INITIAL_BUBBLES)
    expect(new Set(model.bubbles.map(bubble => bubble.color)).size).toBeGreaterThan(5)
    expect(model.bubbles.map(bubble => bubble.shape)).toEqual(BUBBLE3D_SHAPES.map(shape => shape.id))
    expect(Bubbles3d.INITIAL_BUBBLES).toBe(BUBBLE3D_SHAPES.length)
    for (const bubble of model.bubbles) {
      expect(bubble.size).toBeGreaterThanOrEqual(0.35)
      expect(bubble.size).toBeLessThanOrEqual(0.75)
      for (const position of [bubble.x, bubble.y, bubble.z]) expect(Math.abs(position)).toBeLessThanOrEqual(1)
    }
  })

  it('pops independent fingers once each and resolves every sound acknowledgement', () => {
    Story.story(
      update,
      Story.with(Bubbles3d.init()),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.model(model => { expect(model.score).toBe(1); expect(model.bubbles.some(bubble => bubble.id === 0)).toBe(false) }),
      Story.Command.resolveAll(popSound),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.Command.expectNone(),
      Story.message(Bubbles3d.ClickedPop({ id: 1, revision: 0 })),
      Story.model(model => { expect(model.score).toBe(2); expect(model.bubbles).toHaveLength(Bubbles3d.INITIAL_BUBBLES - 2) }),
      Story.Command.resolveAll(popSound),
      Story.Command.expectNone(),
    )
  })

  it('ignores malformed IDs and results from an earlier round', () => {
    const model = Bubbles3d.init()
    for (const id of [-1, 0.5, NaN, Infinity, 999]) expect(update(model, Bubbles3d.ClickedPop({ id, revision: 0 }))).toEqual([model, []])
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Bubbles3d.ClickedReset()),
      Story.model(next => { expect(next.revision).toBe(1); expect(next.bubbles).toHaveLength(Bubbles3d.INITIAL_BUBBLES) }),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.message(Bubbles3d.RendererReady({ revision: 0 })),
      Story.message(Bubbles3d.RendererFailed({ revision: 0 })),
      Story.model(next => { expect(next.score).toBe(0); expect(next.rendererStatus).toBe('loading') }),
      Story.Command.expectNone(),
    )
  })

  it('caps new bubbles and keeps identifiers unique after a reset', () => {
    let model = Bubbles3d.init()
    for (let index = 0; index < 6; index++) [model] = mutedUpdate(model, Bubbles3d.ClickedAdd())
    expect(model.bubbles).toHaveLength(Bubbles3d.MAX_BUBBLES)
    expect(mutedUpdate(model, Bubbles3d.ClickedAdd())).toEqual([model, []])
    const [reset] = mutedUpdate(model, Bubbles3d.ClickedReset())
    expect(reset.bubbles[0]?.id).toBe(model.nextId)
    expect(reset.nextId).toBe(model.nextId + Bubbles3d.INITIAL_BUBBLES)
    const [added] = mutedUpdate(reset, Bubbles3d.ClickedAdd())
    expect(new Set(added.bubbles.map(bubble => bubble.id)).size).toBe(added.bubbles.length)
    expect(new Set(reset.bubbles.map(bubble => bubble.shape))).toEqual(new Set(BUBBLE3D_SHAPES.map(shape => shape.id)))
    expect(added.bubbles.slice(reset.bubbles.length).map(bubble => bubble.shape)).toEqual(
      BUBBLE3D_SHAPES.slice(added.bubbles[reset.bubbles.length]!.id % BUBBLE3D_SHAPES.length).slice(0, Bubbles3d.ADD_BUBBLES).map(shape => shape.id),
    )
  })

  it('cycles the complete shape catalog across additions and later rounds', () => {
    const catalog = BUBBLE3D_SHAPES.map(shape => shape.id)
    const generated = Bubbles3d.makeBubbles(BUBBLE3D_SHAPES.length - 2, BUBBLE3D_SHAPES.length + 4)
    expect(generated.map(bubble => bubble.shape)).toEqual([
      ...catalog.slice(-2), ...catalog, ...catalog.slice(0, 2),
    ])
    Story.story(
      mutedUpdate,
      Story.with(Bubbles3d.init()),
      Story.message(Bubbles3d.ClickedAdd()),
      Story.model(model => expect(model.bubbles.slice(Bubbles3d.INITIAL_BUBBLES).map(bubble => bubble.shape)).toEqual(catalog.slice(0, Bubbles3d.ADD_BUBBLES))),
      Story.message(Bubbles3d.ClickedReset()),
      Story.model(model => expect(new Set(model.bubbles.map(bubble => bubble.shape))).toEqual(new Set(catalog))),
      Story.Command.expectNone(),
    )
  })

  it('ignores duplicate renderer acknowledgements', () => {
    const [ready] = mutedUpdate(Bubbles3d.init(), Bubbles3d.RendererReady({ revision: 0 }))
    expect(mutedUpdate(ready, Bubbles3d.RendererReady({ revision: 0 }))).toEqual([ready, []])
    const [unavailable] = mutedUpdate(ready, Bubbles3d.RendererFailed({ revision: 0 }))
    expect(mutedUpdate(unavailable, Bubbles3d.RendererFailed({ revision: 0 }))).toEqual([unavailable, []])
  })

  it('does not start or announce a renderer after navigating away during the lazy import', async () => {
    const host = document.createElement('div')
    const createRuntime = vi.fn(() => () => {})
    let resolveImport: (() => void) | undefined
    let importStarted: (() => void) | undefined
    const started = new Promise<void>(resolve => { importStarted = resolve })
    const loader = vi.fn(() => new Promise<{ createBubbles3dRuntime: typeof createRuntime }>(resolve => {
      resolveImport = () => resolve({ createBubbles3dRuntime: createRuntime })
      importStarted!()
    }))
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { queueMicrotask(() => callback(0)); return 1 })
    const messages: Bubbles3d.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Bubbles3d.mountBubbles3d(host, loader), message => Effect.sync(() => { messages.push(message) })))
    try {
      await Effect.runPromise(Effect.promise(() => started).pipe(Effect.timeout('1 second')))
      expect(loader).toHaveBeenCalledOnce()
      // Interruption must finish while import is still pending. This also
      // catches moving that pending import back inside acquireRelease.
      await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.timeout('1 second')))
      resolveImport!()
      expect(createRuntime).not.toHaveBeenCalled()
      expect(messages).toEqual([])
    } finally {
      resolveImport?.()
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  it('safely reports a lazy import failure for the current round', async () => {
    const host = document.createElement('div')
    host.setAttribute('data-bubbles3d-revision', '3')
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { queueMicrotask(() => callback(0)); return 1 })
    const result = await Effect.runPromise(
      Stream.runHead(Bubbles3d.mountBubbles3d(host, () => Promise.reject(new Error('import failed')))).pipe(Effect.timeout('1 second')),
    )
    expect(result).toEqual(Option.some(Bubbles3d.RendererFailed({ revision: 3 })))
  })

  it('keeps muted pops playable and safely acknowledges an audio failure', async () => {
    const model = Bubbles3d.init()
    const [muted, mutedCommands] = mutedUpdate(model, Bubbles3d.ClickedPop({ id: 0, revision: 0 }))
    expect(muted.score).toBe(1)
    expect(mutedCommands).toEqual([])
    vi.spyOn(Audio, 'pop').mockReturnValue({ name: 'PlayPop', effect: Effect.die(new Error('audio unavailable')) })
    const [next, commands] = update(model, Bubbles3d.ClickedPop({ id: 0, revision: 0 }))
    expect(next.score).toBe(1)
    expect(commands[0]?.name).toBe('Bubbles3dPlayPop')
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Bubbles3d.SoundPlayed())
  })

  it('exposes native buttons with shape names, loading status, and a polite score', () => {
    Scene.scene(
      { update: mutedUpdate, view },
      Scene.with(Bubbles3d.init()),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('aria-busy', 'true'),
      Scene.expect(Scene.role('button', { name: t('bubbles3dAdd', 'en') })).toBeEnabled(),
      Scene.expect(Scene.selector('.bubbles3d-scene')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.selector('.bubbles3d-score[role="status"][aria-live="polite"]')).toHaveText(tf('bubbles3dPopped', 'en', '0')),
      Scene.Mount.resolveAll(mounted),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('aria-busy', 'false'),
      Scene.expect(Scene.role('button', { name: shapeLabel(Bubbles3d.init().bubbles[1]!, 'en', 1) })).toBeEnabled(),
      Scene.click(Scene.role('button', { name: shapeLabel(Bubbles3d.init().bubbles[0]!, 'en', 0) })),
      Scene.expect(Scene.selector('.bubbles3d-score')).toHaveText(tf('bubbles3dPopped', 'en', '1')),
      Scene.Command.expectNone(),
    )
  })

  it('keeps the accessible fallback playable when 3D rendering is unavailable', () => {
    Scene.scene(
      { update: mutedUpdate, view },
      Scene.with(Bubbles3d.init()),
      Scene.Mount.resolveAll([{ name: 'bubbles3dScene' }, Bubbles3d.RendererFailed({ revision: 0 })]),
      Scene.expect(Scene.text(t('bubbles3dUnavailable', 'en'))).toExist(),
      Scene.expect(Scene.selector('.bubbles3d-unavailable')).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('data-renderer', 'unavailable'),
      Scene.click(Scene.role('button', { name: shapeLabel(Bubbles3d.init().bubbles[0]!, 'en', 0) })),
      Scene.expect(Scene.selector('.bubbles3d-score')).toHaveText(tf('bubbles3dPopped', 'en', '1')),
      Scene.Command.expectNone(),
    )
  })

  it('disables adding at the shape limit and localizes individual shape names', () => {
    let model = Bubbles3d.init()
    for (let index = 0; index < 4; index++) [model] = mutedUpdate(model, Bubbles3d.ClickedAdd())
    Scene.scene(
      { update: mutedUpdate, view: (value: Bubbles3d.Model) => Bubbles3d.view(value, 'ja') },
      Scene.with(model),
      Scene.Mount.resolveAll(mounted),
      Scene.expect(Scene.role('button', { name: t('bubbles3dAdd', 'ja') })).toBeDisabled(),
      Scene.expect(Scene.role('button', { name: shapeLabel(model.bubbles[0]!, 'ja', 0) })).toBeEnabled(),
      Scene.expect(Scene.role('button', { name: shapeLabel(model.bubbles[23]!, 'ja', 23) })).toBeEnabled(),
      Scene.Command.expectNone(),
    )
  })
})
