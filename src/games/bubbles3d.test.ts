import { Effect, Fiber, Option, Stream } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as Audio from '../audio'
import { normalizeLanguage, t, tf } from '../i18n'
import * as Speech from '../speech'
import * as Bubbles3d from './bubbles3d'
import { BUBBLE3D_COLORS, type Bubble3dColor } from './bubbles3dCreation'
import { BUBBLES3D_POP_FX_DURATION } from './bubbles3dPopFx'
import { BUBBLE3D_SHAPES, MAX_BUBBLE3D_SIZE, MIN_BUBBLE3D_SIZE, type Bubble3dShape } from './bubbles3dShapes'

const speech = { rate: 0.65, pitch: 1.7, lang: 'fr' }
const update = (model: Bubbles3d.Model, message: Bubbles3d.Message) => Bubbles3d.update(model, message, false, 'en', speech)
const mutedUpdate = (model: Bubbles3d.Model, message: Bubbles3d.Message) => Bubbles3d.update(model, message, true, 'en', speech)
const view = (model: Bubbles3d.Model) => Bubbles3d.view(model, 'en')
const popSound = [{ name: 'Bubbles3dPlayPop' }, Bubbles3d.SoundPlayed()] as const
const creationSound = [{ name: 'Bubbles3dPlayChime' }, Bubbles3d.SoundPlayed()] as const
const creationSpeech = [{ name: 'Bubbles3dSpeakCreation' }, Bubbles3d.SoundPlayed()] as const
const mountedScene = [{ name: 'bubbles3dScene' }, Bubbles3d.RendererReady({ revision: 0 })] as const
const mountedControls = [{ name: 'bubbles3dControls' }, Bubbles3d.SoundPlayed()] as const
const created = (creationId: number, values: Partial<{ shape: Bubble3dShape; color: Bubble3dColor; duration: number; revision: number }> = {}) =>
  Bubbles3d.CreatedBubble({ shape: 'sphere', color: '#FF4757', duration: 0, revision: 0, creationId, ...values })
const populated = (count = 2): Bubbles3d.Model => {
  let model = Bubbles3d.init()
  for (let index = 0; index < count; index++) [model] = mutedUpdate(model, created(index, { shape: BUBBLE3D_SHAPES[index % BUBBLE3D_SHAPES.length]!.id }))
  return model
}
const shapeLabel = (bubble: Bubbles3d.Bubble, language: string, index: number): string =>
  tf('bubbles3dShape', language, t(Bubbles3d.BUBBLE3D_SHAPE_KEYS[bubble.shape], language), new Intl.NumberFormat(language).format(index + 1))

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('3D Bubbles creation', () => {
  it('starts empty with explicit creation and selector state', () => {
    expect(Bubbles3d.init()).toEqual({
      bubbles: [], score: 0, nextId: 0, revision: 0, rendererStatus: 'loading',
      selectedShape: 'sphere', selectedColor: '', shapePage: 0, lastCreationId: -1, lastCreation: null,
      clearing: false, clearToken: 0,
    })
  })

  it('creates finite deterministic geometry specifications at tap and held sizes for every shape', () => {
    for (const [id, shape] of BUBBLE3D_SHAPES.entries()) {
      const tap = Bubbles3d.makeBubble(id, shape.id, '#FF4757', 0)
      const held = Bubbles3d.makeBubble(id, shape.id, '#FF4757', 3000)
      expect(tap).toEqual(Bubbles3d.makeBubble(id, shape.id, '#FF4757', 0))
      expect(tap).toMatchObject({ id, shape: shape.id, color: '#FF4757', rainbow: false, size: MIN_BUBBLE3D_SIZE })
      expect(held.size).toBe(MAX_BUBBLE3D_SIZE)
      expect(Bubbles3d.makeBubble(id, shape.id, '#FF4757', 30000).size).toBe(MAX_BUBBLE3D_SIZE)
      expect(Bubbles3d.makeBubble(id, shape.id, '#FF4757', 1500).size).toBeGreaterThan(tap.size)
      expect(Bubbles3d.makeBubble(id, shape.id, '#FF4757', 1500).size).toBeLessThan(held.size)
      for (const position of [tap.x, tap.y, tap.z, held.x, held.y, held.z]) {
        expect(Number.isFinite(position)).toBe(true)
        expect(Math.abs(position)).toBeLessThanOrEqual(1)
      }
    }
    expect(Bubbles3d.makeBubble(0, 'heart', 'rainbow', 500)).toMatchObject({ color: '#ffffff', rainbow: true, shape: 'heart' })
  })

  it('uses the shape captured by each release, even after changing the selected shape', () => {
    Story.story(
      update,
      Story.with(Bubbles3d.init()),
      Story.message(Bubbles3d.SelectedShape({ shape: 'heart' })),
      Story.message(created(0, { shape: 'star', duration: 1500 })),
      Story.model(model => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]).toMatchObject({ id: 0, shape: 'star', color: '#FF4757' })
        expect(model.selectedShape).toBe('heart')
        expect(model.selectedColor).toBe('#FF4757')
        expect(model.nextId).toBe(1)
        expect(model.lastCreationId).toBe(0)
        expect(model.lastCreation).toMatchObject({ shape: 'star', color: '#FF4757' })
      }),
      Story.Command.resolveAll(creationSound, creationSpeech),
      Story.message(created(1, { shape: 'heart', color: 'rainbow', duration: 3000 })),
      Story.model(model => {
        expect(model.bubbles[1]).toMatchObject({ id: 1, shape: 'heart', rainbow: true, size: MAX_BUBBLE3D_SIZE })
        expect(model.selectedColor).toBe('rainbow')
        expect(model.lastCreationId).toBe(1)
      }),
      Story.Command.resolveAll(creationSound, creationSpeech),
      Story.Command.expectNone(),
    )
  })

  it('supports every shape choice without cycling the created shape or issuing feedback while muted', () => {
    Story.story(
      mutedUpdate,
      Story.with(Bubbles3d.init()),
      ...BUBBLE3D_SHAPES.flatMap((shape, creationId) => [
        Story.message(created(creationId, { shape: shape.id })),
        Story.model((model: Bubbles3d.Model) => expect(model.bubbles[creationId]?.shape).toBe(shape.id)),
        Story.Command.expectNone(),
      ]),
      Story.model(model => expect(model.bubbles.map(bubble => bubble.shape)).toEqual(BUBBLE3D_SHAPES.map(shape => shape.id))),
      Story.Command.expectNone(),
    )
  })

  it('ignores duplicate and older release IDs without replaying feedback', () => {
    Story.story(
      update,
      Story.with(Bubbles3d.init()),
      Story.message(created(0)),
      Story.Command.resolveAll(creationSound, creationSpeech),
      Story.message(created(3, { color: '#1E90FF' })),
      Story.Command.resolveAll(creationSound, creationSpeech),
      Story.message(created(3, { color: '#A855F7' })),
      Story.message(created(0)),
      Story.message(created(2)),
      Story.model(model => {
        expect(model.bubbles).toHaveLength(2)
        expect(model.nextId).toBe(2)
        expect(model.lastCreationId).toBe(3)
        expect(model.selectedColor).toBe('#1E90FF')
      }),
      Story.Command.expectNone(),
    )
  })

  it('rejects malformed creation messages at the update boundary', () => {
    const model = Bubbles3d.init()
    const invalid = [
      ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(id => created(id)),
      ...[-1, NaN, Infinity].map(duration => created(0, { duration })),
      ...[-1, 1, 0.5, NaN, Infinity].map(revision => created(0, { revision })),
      { ...created(0), shape: 'unknown' } as unknown as Bubbles3d.Message,
      { ...created(0), color: 'red' } as unknown as Bubbles3d.Message,
      { ...created(0), color: '#123456' } as unknown as Bubbles3d.Message,
    ]
    for (const message of invalid) expect(update(model, message)).toEqual([model, []])
    expect(update(model, { ...Bubbles3d.SelectedShape({ shape: 'sphere' }), shape: 'unknown' } as unknown as Bubbles3d.Message)).toEqual([model, []])
  })

  it('caps creation, then permits a new unique bubble after a pop', () => {
    const model = populated(Bubbles3d.MAX_BUBBLES)
    expect(model.bubbles).toHaveLength(Bubbles3d.MAX_BUBBLES)
    expect(mutedUpdate(model, created(Bubbles3d.MAX_BUBBLES))).toEqual([model, []])
    Story.story(
      mutedUpdate,
      Story.with(model),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.message(created(Bubbles3d.MAX_BUBBLES + 1)),
      Story.model(next => {
        expect(next.bubbles).toHaveLength(Bubbles3d.MAX_BUBBLES)
        expect(next.bubbles.at(-1)?.id).toBe(Bubbles3d.MAX_BUBBLES)
        expect(new Set(next.bubbles.map(bubble => bubble.id)).size).toBe(next.bubbles.length)
      }),
      Story.Command.expectNone(),
    )
  })

  it('clears one bubble at a time without recycling IDs and invalidates a finger held through the clear', () => {
    Story.story(
      mutedUpdate,
      Story.with(populated()),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.message(Bubbles3d.ClickedClear()),
      Story.model(model => {
        expect(model.bubbles.map(bubble => bubble.id)).toEqual([1])
        expect(model.score).toBe(0)
        expect(model.nextId).toBe(2)
        expect(model.lastCreationId).toBe(1)
        expect(model.lastCreation).toBeNull()
        expect(model.selectedColor).toBe('')
        expect(model.clearing).toBe(true)
        expect(model.clearToken).toBe(1)
        expect(model.revision).toBe(0)
      }),
      Story.message(created(2)),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.model(model => { expect(model.bubbles).toEqual([]); expect(model.clearing).toBe(true); expect(model.revision).toBe(0) }),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.model(model => { expect(model.clearing).toBe(false); expect(model.revision).toBe(1) }),
      Story.message(created(2)),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.message(Bubbles3d.RendererReady({ revision: 0 })),
      Story.message(Bubbles3d.RendererFailed({ revision: 0 })),
      Story.model(model => { expect(model.bubbles).toEqual([]); expect(model.rendererStatus).toBe('loading') }),
      Story.message(created(3, { revision: 1, shape: 'cube' })),
      Story.model(model => expect(model.bubbles[0]).toMatchObject({ id: 2, shape: 'cube' })),
      Story.Command.expectNone(),
    )
  })

  it('can clear an empty board to cancel its first held creation', () => {
    Story.story(
      mutedUpdate,
      Story.with(Bubbles3d.init()),
      Story.message(Bubbles3d.ClickedClear()),
      Story.message(created(0)),
      Story.model(model => { expect(model.bubbles).toEqual([]); expect(model.revision).toBe(1); expect(model.clearing).toBe(false); expect(model.clearToken).toBe(1) }),
      Story.message(created(1, { revision: 1 })),
      Story.model(model => expect(model.bubbles).toHaveLength(1)),
      Story.Command.expectNone(),
    )
  })

  it('plays one pop per automatic removal while rejecting repeat clears and repeated or stale clear messages', () => {
    const [clearing] = mutedUpdate(populated(), Bubbles3d.ClickedClear())
    const invalid = [
      ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 999].map(id => Bubbles3d.ClearBubble({ id, revision: 0, token: 1 })),
      ...[-1, 0, 0.5, NaN, Infinity].map(token => Bubbles3d.ClearBubble({ id: 0, revision: 0, token })),
      ...[-1, 1, 0.5, NaN, Infinity].map(revision => Bubbles3d.ClearBubble({ id: 0, revision, token: 1 })),
      Bubbles3d.ClickedClear(), created(2),
      Bubbles3d.ClearCompleted({ revision: 0, token: 1 }),
    ]
    for (const message of invalid) expect(update(clearing, message)).toEqual([clearing, []])
    Story.story(
      update,
      Story.with(clearing),
      Story.message(Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 })),
      Story.model(model => { expect(model.bubbles.map(bubble => bubble.id)).toEqual([1]); expect(model.score).toBe(0) }),
      Story.Command.resolveAll(popSound),
      Story.message(Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.Command.expectNone(),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.Command.resolveAll(popSound),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 0 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 1, token: 1 })),
      Story.model(model => expect(model.clearing).toBe(true)),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.model(model => { expect(model.clearing).toBe(false); expect(model.revision).toBe(1); expect(model.score).toBe(0) }),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.Command.expectNone(),
    )
  })

  it('keeps manually popping during a clear playable and ignores later automatic removal of that bubble', () => {
    Story.story(
      update,
      Story.with(populated()),
      Story.message(Bubbles3d.ClickedClear()),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.model(model => { expect(model.score).toBe(1); expect(model.clearing).toBe(true) }),
      Story.Command.resolveAll(popSound),
      Story.message(Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 })),
      Story.Command.expectNone(),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 0, token: 1 })),
      Story.Command.resolveAll(popSound),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.model(model => { expect(model.bubbles).toEqual([]); expect(model.score).toBe(0); expect(model.clearing).toBe(false) }),
      Story.Command.expectNone(),
    )
  })

  it('keeps muted sequential clearing silent and rejects messages from an earlier clear in a later round', () => {
    const pop = vi.spyOn(Audio, 'pop')
    Story.story(
      mutedUpdate,
      Story.with(populated(1)),
      Story.message(Bubbles3d.ClickedClear()),
      Story.message(Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Story.message(created(1, { revision: 1 })),
      Story.message(Bubbles3d.ClickedClear()),
      Story.model(model => { expect(model.clearToken).toBe(2); expect(model.revision).toBe(1); expect(model.bubbles.map(bubble => bubble.id)).toEqual([1]) }),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 1, token: 1 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 1, token: 1 })),
      Story.model(model => { expect(model.bubbles).toHaveLength(1); expect(model.clearing).toBe(true) }),
      Story.message(Bubbles3d.ClearBubble({ id: 1, revision: 1, token: 2 })),
      Story.message(Bubbles3d.ClearCompleted({ revision: 1, token: 2 })),
      Story.model(model => { expect(model.bubbles).toEqual([]); expect(model.revision).toBe(2); expect(model.clearing).toBe(false) }),
      Story.Command.expectNone(),
    )
    expect(pop).not.toHaveBeenCalled()
  })

  it('pops independent bubbles once each and resolves every sound acknowledgement', () => {
    Story.story(
      update,
      Story.with(populated()),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.model(model => { expect(model.score).toBe(1); expect(model.bubbles.some(bubble => bubble.id === 0)).toBe(false) }),
      Story.Command.resolveAll(popSound),
      Story.message(Bubbles3d.ClickedPop({ id: 0, revision: 0 })),
      Story.Command.expectNone(),
      Story.message(Bubbles3d.ClickedPop({ id: 1, revision: 0 })),
      Story.model(model => { expect(model.score).toBe(2); expect(model.bubbles).toEqual([]) }),
      Story.Command.resolveAll(popSound),
      Story.Command.expectNone(),
    )
  })

  it('ignores malformed pop IDs and duplicate renderer acknowledgements', () => {
    const model = populated()
    for (const id of [-1, 0.5, NaN, Infinity, 999]) expect(update(model, Bubbles3d.ClickedPop({ id, revision: 0 }))).toEqual([model, []])
    const [ready] = mutedUpdate(model, Bubbles3d.RendererReady({ revision: 0 }))
    expect(mutedUpdate(ready, Bubbles3d.RendererReady({ revision: 0 }))).toEqual([ready, []])
    const [unavailable] = mutedUpdate(ready, Bubbles3d.RendererFailed({ revision: 0 }))
    expect(mutedUpdate(unavailable, Bubbles3d.RendererFailed({ revision: 0 }))).toEqual([unavailable, []])
  })

  it('cycles six shape pages without changing the selected shape', () => {
    expect(Bubbles3d.SHAPES_PER_PAGE).toBe(5)
    expect(Bubbles3d.SHAPE_PAGE_COUNT).toBe(6)
    Story.story(
      mutedUpdate,
      Story.with({ ...Bubbles3d.init(), selectedShape: 'heart' }),
      ...Array.from({ length: Bubbles3d.SHAPE_PAGE_COUNT }, (_, index) => [
        Story.message(Bubbles3d.NextShapePage()),
        Story.model((model: Bubbles3d.Model) => {
          expect(model.shapePage).toBe((index + 1) % Bubbles3d.SHAPE_PAGE_COUNT)
          expect(model.selectedShape).toBe('heart')
        }),
        Story.Command.expectNone(),
      ]).flat(),
      Story.Command.expectNone(),
    )
  })
})

describe('3D Bubbles feedback and lifecycle', () => {
  const redSphere = {
    en: 'red sphere', zh: '红色 球体', fr: 'sphère rouge', de: 'rot kugel',
    fa: 'کره قرمز', ms: 'sfera merah', 'zh-HK': '紅色 球體', ja: 'あか 球',
  } as const

  it.each(Object.entries(redSphere))('speaks each color and shape in %s grammar and forwards speech preferences', async (language, expected) => {
    const speak = vi.spyOn(Speech, 'speak').mockImplementation((_text, message) => ({ name: 'Speak', effect: Effect.succeed(message) }))
    vi.spyOn(Audio, 'chime').mockImplementation(message => ({ name: 'PlayChime', effect: Effect.succeed(message) }))
    expect(Bubbles3d.spokenCreation('sphere', '#FF4757', language)).toBe(expected)
    for (const color of BUBBLE3D_COLORS) {
      const [, commands] = Bubbles3d.update(Bubbles3d.init(), created(0, { shape: 'heart', color: color.value }), false, language, speech)
      expect(commands.map(command => command.name)).toEqual(['Bubbles3dPlayChime', 'Bubbles3dSpeakCreation'])
      const colorName = t(color.key, language).toLocaleLowerCase(normalizeLanguage(language))
      const shapeName = t('bubbles3dShapeHeart', language).toLocaleLowerCase(normalizeLanguage(language))
      expect(speak).toHaveBeenLastCalledWith(tf('coloredShape', language, colorName, shapeName), Bubbles3d.SoundPlayed(), { ...speech, lang: language })
      for (const command of commands) expect(await Effect.runPromise(command.effect)).toEqual(Bubbles3d.SoundPlayed())
    }
  })

  it('keeps muted creation and popping visible without calling audio or speech', () => {
    const chime = vi.spyOn(Audio, 'chime')
    const pop = vi.spyOn(Audio, 'pop')
    const speak = vi.spyOn(Speech, 'speak')
    const [model, commands] = mutedUpdate(Bubbles3d.init(), created(0))
    expect(model.bubbles).toHaveLength(1)
    expect(model.lastCreation).not.toBeNull()
    expect(commands).toEqual([])
    const [popped, popCommands] = mutedUpdate(model, Bubbles3d.ClickedPop({ id: 0, revision: 0 }))
    expect(popped.score).toBe(1)
    expect(popCommands).toEqual([])
    expect(chime).not.toHaveBeenCalled()
    expect(pop).not.toHaveBeenCalled()
    expect(speak).not.toHaveBeenCalled()
  })

  it('acknowledges unavailable audio and speech after keeping the created bubble', async () => {
    vi.spyOn(Audio, 'chime').mockReturnValue({ name: 'PlayChime', effect: Effect.die(new Error('audio unavailable')) })
    vi.spyOn(Speech, 'speak').mockReturnValue({ name: 'Speak', effect: Effect.die(new Error('speech unavailable')) })
    const [model, commands] = update(Bubbles3d.init(), created(0))
    expect(model.bubbles).toHaveLength(1)
    expect(commands.map(command => command.name)).toEqual(['Bubbles3dPlayChime', 'Bubbles3dSpeakCreation'])
    for (const command of commands) expect(await Effect.runPromise(command.effect)).toEqual(Bubbles3d.SoundPlayed())
    vi.spyOn(Audio, 'pop').mockReturnValue({ name: 'PlayPop', effect: Effect.die(new Error('audio unavailable')) })
    const [popped, popCommands] = update(model, Bubbles3d.ClickedPop({ id: 0, revision: 0 }))
    expect(popped.score).toBe(1)
    expect(await Effect.runPromise(popCommands[0]!.effect)).toEqual(Bubbles3d.SoundPlayed())
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
    const result = await Effect.runPromise(Stream.runHead(Bubbles3d.mountBubbles3d(host, () => Promise.reject(new Error('import failed')))).pipe(Effect.timeout('1 second')))
    expect(result).toEqual(Option.some(Bubbles3d.RendererFailed({ revision: 3 })))
  })

  it('emits ordered clear removals at intervals and waits for the last visual burst before completing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { queueMicrotask(() => callback(0)); return 1 })
    const messages: Bubbles3d.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(Bubbles3d.clearBubblesStream([4, 9, 2], 3, 7), message => Effect.sync(() => { messages.push(message) })))
    try {
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(Bubbles3d.CLEAR_POP_INTERVAL_MS - 1)
      expect(messages).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(messages).toEqual([Bubbles3d.ClearBubble({ id: 4, revision: 3, token: 7 })])
      await vi.advanceTimersByTimeAsync(Bubbles3d.CLEAR_POP_INTERVAL_MS * 2)
      expect(messages).toEqual([
        Bubbles3d.ClearBubble({ id: 4, revision: 3, token: 7 }),
        Bubbles3d.ClearBubble({ id: 9, revision: 3, token: 7 }),
        Bubbles3d.ClearBubble({ id: 2, revision: 3, token: 7 }),
      ])
      await vi.advanceTimersByTimeAsync(BUBBLES3D_POP_FX_DURATION * 1000 + 59)
      expect(messages).toHaveLength(3)
      await vi.advanceTimersByTimeAsync(1)
      expect(messages.at(-1)).toEqual(Bubbles3d.ClearCompleted({ revision: 3, token: 7 }))
      await vi.advanceTimersByTimeAsync(1000)
      expect(messages).toHaveLength(4)
    } finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })

  it('cancels a clear on unmount and resumes only the remaining bubble IDs after returning', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { queueMicrotask(() => callback(0)); return 1 })
    const messages: Bubbles3d.Message[] = []
    const consume = (ids: ReadonlyArray<number>) => Effect.runFork(Stream.runForEach(Bubbles3d.clearBubblesStream(ids, 2, 5), message => Effect.sync(() => { messages.push(message) })))
    const interrupted = consume([2, 4])
    try {
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(Bubbles3d.CLEAR_POP_INTERVAL_MS)
      expect(messages).toEqual([Bubbles3d.ClearBubble({ id: 2, revision: 2, token: 5 })])
      await Effect.runPromise(Fiber.interrupt(interrupted))
      await vi.advanceTimersByTimeAsync(10000)
      expect(messages).toHaveLength(1)
      const resumed = consume([4])
      try {
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(Bubbles3d.CLEAR_POP_INTERVAL_MS + BUBBLES3D_POP_FX_DURATION * 1000 + 60)
        expect(messages).toEqual([
          Bubbles3d.ClearBubble({ id: 2, revision: 2, token: 5 }),
          Bubbles3d.ClearBubble({ id: 4, revision: 2, token: 5 }),
          Bubbles3d.ClearCompleted({ revision: 2, token: 5 }),
        ])
      } finally { await Effect.runPromise(Fiber.interrupt(resumed)) }
    } finally { await Effect.runPromise(Fiber.interrupt(interrupted)) }
  })
})

describe('3D Bubbles accessible controls', () => {
  it('exposes pressed shape selection, native Next/Clear, and a polite score without explanatory overlays', () => {
    Scene.scene(
      { update: mutedUpdate, view },
      Scene.with(Bubbles3d.init()),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('aria-busy', 'true'),
      Scene.expect(Scene.selector('.bubbles3d-scene')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.selector('.bubbles3d-prompt')).toBeAbsent(),
      Scene.expect(Scene.selector('.bubbles3d-empty')).toBeAbsent(),
      Scene.expect(Scene.role('button', { name: t('bubbles3dShapeSphere', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('clear', 'en') })).toBeEnabled(),
      Scene.expect(Scene.selector('.bubbles3d-score[role="status"][aria-live="polite"]')).toHaveText(tf('bubbles3dPopped', 'en', '0')),
      Scene.Mount.resolveAll(mountedScene, mountedControls),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('aria-busy', 'false'),
      Scene.click(Scene.role('button', { name: t('bubbles3dShapeCube', 'en') })),
      Scene.expect(Scene.role('button', { name: t('bubbles3dShapeCube', 'en') })).toHaveAttr('aria-pressed', 'true'),
      Scene.click(Scene.role('button', { name: t('next', 'en') })),
      Scene.expect(Scene.role('button', { name: t('bubbles3dShapeOctahedron', 'en') })).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows every shape over six pages and preserves the selected shape while paging', () => {
    for (let page = 0; page < Bubbles3d.SHAPE_PAGE_COUNT; page++) {
      Scene.scene(
        { update: mutedUpdate, view },
        Scene.with({ ...Bubbles3d.init(), shapePage: page }),
        Scene.Mount.resolveAll(mountedScene, mountedControls),
        ...BUBBLE3D_SHAPES.slice(page * Bubbles3d.SHAPES_PER_PAGE, (page + 1) * Bubbles3d.SHAPES_PER_PAGE).map(shape =>
          Scene.expect(Scene.role('button', { name: t(Bubbles3d.BUBBLE3D_SHAPE_KEYS[shape.id], 'en') })).toBeEnabled(),
        ),
        Scene.expectAll(Scene.all.selector('.bubbles3d-shape-button[aria-pressed]')).toHaveCount(Math.min(Bubbles3d.SHAPES_PER_PAGE, BUBBLE3D_SHAPES.length - page * Bubbles3d.SHAPES_PER_PAGE)),
        Scene.Command.expectNone(),
      )
    }
  })

  it('localizes color buttons, selected color and each fallback bubble, and permits clearing through a native button', () => {
    const language = 'ja'
    const model = populated()
    Scene.scene(
      { update: mutedUpdate, view: (value: Bubbles3d.Model) => Bubbles3d.view(value, language) },
      Scene.with(model),
      Scene.Mount.resolveAll(mountedScene, mountedControls),
      ...BUBBLE3D_COLORS.map(color => Scene.expect(Scene.role('button', { name: t(color.key, language) })).toBeEnabled()),
      Scene.expect(Scene.role('button', { name: t('colorRed', language) })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.role('button', { name: t('colorBlue', language) })).toHaveAttr('aria-pressed', 'false'),
      Scene.expect(Scene.selector('.bubbles3d-readout[role="status"][aria-live="polite"]')).toHaveText(Bubbles3d.spokenCreation('cube', '#FF4757', language)),
      Scene.expect(Scene.role('button', { name: shapeLabel(model.bubbles[0]!, language, 0) })).toBeEnabled(),
      Scene.click(Scene.role('button', { name: t('clear', language) })),
      Scene.expect(Scene.role('button', { name: t('clear', language) })).toBeDisabled(),
      ...BUBBLE3D_COLORS.map(color => Scene.expect(Scene.role('button', { name: t(color.key, language) })).toBeDisabled()),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('aria-busy', 'true'),
      Scene.expect(Scene.selector('.bubbles3d-readout[role="status"][aria-live="polite"]')).toHaveText(t('bubbles3dClearing', language)),
      Scene.Mount.expectHas({ name: 'bubbles3dClearing' }),
      Scene.Mount.resolve({ name: 'bubbles3dClearing' }, Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 })),
      Scene.expectAll(Scene.all.selector('.bubbles3d-bubble-button')).toHaveCount(1),
      Scene.Command.expectNone(),
    )
  })

  it('keeps the accessible fallback playable when 3D rendering is unavailable', () => {
    const model = populated()
    Scene.scene(
      { update: mutedUpdate, view },
      Scene.with(model),
      Scene.Mount.resolveAll([{ name: 'bubbles3dScene' }, Bubbles3d.RendererFailed({ revision: 0 })], mountedControls),
      Scene.expect(Scene.selector('.bubbles3d-unavailable')).toBeAbsent(),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('data-renderer', 'unavailable'),
      Scene.click(Scene.role('button', { name: shapeLabel(model.bubbles[0]!, 'en', 0) })),
      Scene.expect(Scene.selector('.bubbles3d-score')).toHaveText(tf('bubbles3dPopped', 'en', '1')),
      Scene.Command.expectNone(),
    )
  })

  it('ends the mounted clear and restores enabled controls only after all bubbles are removed', () => {
    const [clearing] = mutedUpdate(populated(1), Bubbles3d.ClickedClear())
    const [removed] = mutedUpdate(clearing, Bubbles3d.ClearBubble({ id: 0, revision: 0, token: 1 }))
    Scene.scene(
      { update: mutedUpdate, view },
      Scene.with({ ...removed, rendererStatus: 'ready' }),
      Scene.Mount.resolveAll(mountedScene, mountedControls),
      Scene.expect(Scene.role('button', { name: t('clear', 'en') })).toBeDisabled(),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('aria-busy', 'true'),
      Scene.expectAll(Scene.all.selector('.bubbles3d-bubble-button')).toBeEmpty(),
      Scene.Mount.resolve({ name: 'bubbles3dClearing' }, Bubbles3d.ClearCompleted({ revision: 0, token: 1 })),
      Scene.Mount.expectEnded({ name: 'bubbles3dClearing' }),
      Scene.expect(Scene.role('button', { name: t('clear', 'en') })).toBeEnabled(),
      ...BUBBLE3D_COLORS.map(color => Scene.expect(Scene.role('button', { name: t(color.key, 'en') })).toBeEnabled()),
      Scene.expect(Scene.selector('.bubbles3d-stage')).toHaveAttr('aria-busy', 'false'),
      Scene.expect(Scene.selector('.bubbles3d-readout')).toHaveText(t('bubbles3dShapeSphere', 'en')),
      Scene.Command.expectNone(),
    )
  })

  it('disables every color at capacity while keeping existing bubbles and Clear playable', () => {
    const model = populated(Bubbles3d.MAX_BUBBLES)
    Scene.scene(
      { update: mutedUpdate, view },
      Scene.with(model),
      Scene.Mount.resolveAll(mountedScene, mountedControls),
      ...BUBBLE3D_COLORS.map(color => Scene.expect(Scene.role('button', { name: t(color.key, 'en') })).toBeDisabled()),
      Scene.expect(Scene.role('button', { name: t('clear', 'en') })).toBeEnabled(),
      Scene.expect(Scene.role('button', { name: shapeLabel(model.bubbles[0]!, 'en', 0) })).toBeEnabled(),
      Scene.expect(Scene.selector('.bubbles3d-readout')).toHaveText('red cube'),
      Scene.Command.expectNone(),
    )
  })
})
