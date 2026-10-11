import { Effect, Fiber, Stream } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import { normalizeLanguage, t, tf } from '../i18n'
import * as DotShapes from './dotShapes'
import { MAX_DOTS, edgesFor, isPolygon } from './dotShapesDomain'

const update = (model: DotShapes.Model, message: DotShapes.Message) => DotShapes.update(model, message, 'en', true, {})
const audibleUpdate = (model: DotShapes.Model, message: DotShapes.Message) => DotShapes.update(model, message, 'en', false, {})
const view = (model: DotShapes.Model) => DotShapes.view(model, 'en')
const sound = [{ name: 'DotShapesPlayPop' }, DotShapes.SoundPlayed()] as const
const mounted = [{ name: 'dotShapesInput' }, DotShapes.ContactCancelled({ id: 999, revision: 0 })] as const
const tap = (id: number, x: number, y: number, revision = 0): DotShapes.Message[] => [
  DotShapes.ContactStarted({ id, x, y, dotId: null, revision }), DotShapes.ContactEnded({ id, x, y, moved: false, revision }),
]
const evolved = (messages: readonly DotShapes.Message[], initial = DotShapes.init()): DotShapes.Model => {
  let result = initial
  Story.story(update, Story.with(initial), ...messages.flatMap(message => [Story.message(message), Story.Command.expectNone()]), Story.model(model => { result = model }), Story.Command.expectNone())
  return result
}
const triangle = (): DotShapes.Model => evolved([...tap(0, 100, 100), ...tap(1, 800, 100), ...tap(2, 450, 600)])
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Dot Shapes model', () => {
  it.each([false, true])('places a dot only on release and resolves feedback with mute=%s', muted => {
    Story.story((model: DotShapes.Model, message: DotShapes.Message) => DotShapes.update(model, message, 'en', muted, {}), Story.with(DotShapes.init()),
      Story.message(DotShapes.ContactStarted({ id: 0, x: 100, y: 100, dotId: null, revision: 0 })),
      Story.model(model => { expect(model.points).toEqual([]); expect(model.contacts).toHaveLength(1) }), Story.Command.expectNone(),
      Story.message(DotShapes.ContactEnded({ id: 0, x: 100, y: 100, moved: false, revision: 0 })),
      muted ? Story.Command.expectNone() : Story.Command.resolveAll(sound),
      Story.model(model => { expect(model.points).toEqual([{ id: 0, x: 100, y: 100 }]); expect(model.contacts).toEqual([]) }),
      Story.message(DotShapes.ContactEnded({ id: 0, x: 100, y: 100, moved: false, revision: 0 })), Story.Command.expectNone(),
    )
  })

  it('turns taps into an automatically closed colored triangle', () => {
    const model = triangle()
    expect(model.points).toHaveLength(3)
    expect(isPolygon(model.points)).toBe(true)
    expect(edgesFor(model.points)).toHaveLength(3)
    expect(model.nextDotId).toBe(3)
  })

  it('commits independent simultaneous taps in release order', () => {
    const model = evolved([
      DotShapes.ContactStarted({ id: 0, x: 100, y: 100, dotId: null, revision: 0 }),
      DotShapes.ContactStarted({ id: 1, x: 800, y: 600, dotId: null, revision: 0 }),
      DotShapes.ContactEnded({ id: 1, x: 800, y: 600, moved: false, revision: 0 }),
      DotShapes.ContactEnded({ id: 0, x: 100, y: 100, moved: false, revision: 0 }),
    ])
    expect(model.points).toEqual([{ id: 0, x: 800, y: 600 }, { id: 1, x: 100, y: 100 }])
    expect(model.contacts).toEqual([])
  })

  it('does not place cancelled contacts, moved blank-board contacts, or duplicate dots', () => {
    const model = evolved([
      ...tap(0, 100, 100), ...tap(1, 100, 100),
      DotShapes.ContactStarted({ id: 2, x: 800, y: 600, dotId: null, revision: 0 }),
      DotShapes.ContactMoved({ id: 2, x: 600, y: 400, revision: 0 }),
      DotShapes.ContactEnded({ id: 2, x: 600, y: 400, moved: true, revision: 0 }),
      DotShapes.ContactStarted({ id: 3, x: 800, y: 600, dotId: null, revision: 0 }), DotShapes.ContactCancelled({ id: 3, revision: 0 }),
      DotShapes.ContactEnded({ id: 3, x: 800, y: 600, moved: false, revision: 0 }),
    ])
    expect(model.points).toEqual([{ id: 0, x: 100, y: 100 }])
    expect(model.contacts).toEqual([])
  })

  it('previews a drag without jumping to the finger offset and restores it on cancellation', () => {
    const initial = triangle()
    const held = evolved([
      DotShapes.ContactStarted({ id: 10, x: 120, y: 120, dotId: 0, revision: 0 }),
      DotShapes.ContactMoved({ id: 10, x: 320, y: 220, revision: 0 }),
    ], initial)
    expect(held.points).toEqual(initial.points)
    expect(DotShapes.displayPoints(held)[0]).toEqual({ id: 0, x: 300, y: 200 })
    const cancelled = evolved([DotShapes.ContactCancelled({ id: 10, revision: 0 })], held)
    expect(DotShapes.displayPoints(cancelled)).toEqual(initial.points)
  })

  it('commits one drag while another finger continues and prevents two fingers claiming the same dot', () => {
    const initial = triangle()
    const moved = evolved([
      DotShapes.ContactStarted({ id: 10, x: 100, y: 100, dotId: 0, revision: 0 }),
      DotShapes.ContactStarted({ id: 11, x: 800, y: 100, dotId: 1, revision: 0 }),
      DotShapes.ContactStarted({ id: 12, x: 100, y: 100, dotId: 0, revision: 0 }),
      DotShapes.ContactMoved({ id: 10, x: 200, y: 250, revision: 0 }),
      DotShapes.ContactMoved({ id: 11, x: 700, y: 350, revision: 0 }),
      DotShapes.ContactEnded({ id: 10, x: 200, y: 250, moved: true, revision: 0 }),
    ], initial)
    expect(moved.contacts.map(contact => contact.id)).toEqual([11])
    expect(moved.points[0]).toEqual({ id: 0, x: 200, y: 250 })
    expect(moved.points[1]).toEqual(initial.points[1])
    expect(DotShapes.displayPoints(moved)[1]).toEqual({ id: 1, x: 700, y: 350 })
    const done = evolved([DotShapes.ContactCancelled({ id: 11, revision: 0 })], moved)
    expect(done.points[1]).toEqual(initial.points[1])
  })

  it('rejects a drag onto another dot and produces no feedback for an unchanged dot', () => {
    const initial = triangle()
    Story.story(audibleUpdate, Story.with(initial),
      Story.message(DotShapes.ContactStarted({ id: 10, x: 100, y: 100, dotId: 0, revision: 0 })), Story.Command.expectNone(),
      Story.message(DotShapes.ContactMoved({ id: 10, x: 800, y: 100, revision: 0 })), Story.Command.expectNone(),
      Story.message(DotShapes.ContactEnded({ id: 10, x: 800, y: 100, moved: true, revision: 0 })), Story.Command.expectNone(),
      Story.model(model => expect(model.points).toEqual(initial.points)),
      Story.message(DotShapes.ContactStarted({ id: 11, x: 100, y: 100, dotId: 0, revision: 0 })),
      Story.message(DotShapes.ContactEnded({ id: 11, x: 100, y: 100, moved: false, revision: 0 })), Story.Command.expectNone(),
    )
  })

  it('caps point count while allowing existing dots to be reshaped at the limit', () => {
    const initial = evolved(Array.from({ length: MAX_DOTS }, (_, id) => tap(id, 60 + id % 8 * 120, 60 + Math.floor(id / 8) * 140)).flat())
    const moved = evolved([
      ...tap(100, 980, 680),
      DotShapes.ContactStarted({ id: 101, x: 60, y: 60, dotId: 0, revision: 0 }),
      DotShapes.ContactEnded({ id: 101, x: 35, y: 30, moved: true, revision: 0 }),
    ], initial)
    expect(moved.points).toHaveLength(MAX_DOTS)
    expect(moved.points[0]).toEqual({ id: 0, x: 44, y: 30 })
    expect(moved.contacts).toEqual([])
  })

  it('rejects malformed, stale, unknown and duplicate contact messages', () => {
    const initial = triangle()
    const messages: DotShapes.Message[] = [
      ...[-1, 0.5, Infinity, NaN].map(id => DotShapes.ContactStarted({ id, x: 200, y: 200, dotId: null, revision: 0 })),
      ...[{ x: NaN, y: 200 }, { x: 200, y: Infinity }, { x: -1, y: 200 }, { x: 1001, y: 200 }, { x: 200, y: 701 }].map(point => DotShapes.ContactStarted({ id: 10, ...point, dotId: null, revision: 0 })),
      DotShapes.ContactStarted({ id: 10, x: 200, y: 200, dotId: null, revision: -1 }),
      DotShapes.ContactStarted({ id: 10, x: 200, y: 200, dotId: 999, revision: 0 }),
      DotShapes.ContactMoved({ id: 999, x: 200, y: 200, revision: 0 }),
      DotShapes.ContactEnded({ id: 999, x: 200, y: 200, moved: false, revision: 0 }),
      DotShapes.ContactCancelled({ id: 999, revision: 0 }),
    ]
    expect(evolved(messages, initial)).toEqual(initial)
    const held = evolved([DotShapes.ContactStarted({ id: 10, x: 200, y: 200, dotId: null, revision: 0 })], initial)
    expect(evolved([DotShapes.ContactStarted({ id: 10, x: 800, y: 600, dotId: null, revision: 0 })], held)).toEqual(held)
  })

  it('invalidates contacts on Undo, Clear, and navigation while retaining finished points', () => {
    const initial = triangle()
    const held = evolved([DotShapes.ContactStarted({ id: 10, x: 600, y: 500, dotId: null, revision: 0 })], initial)
    const interrupted = DotShapes.interrupt(held)
    expect(interrupted.points).toEqual(initial.points)
    expect(interrupted.contacts).toEqual([])
    expect(interrupted.revision).toBe(1)
    expect(evolved([DotShapes.ContactEnded({ id: 10, x: 600, y: 500, moved: false, revision: 0 })], interrupted)).toEqual(interrupted)
    const undone = evolved([DotShapes.Undo()], held)
    expect(undone.points).toEqual(initial.points.slice(0, -1))
    expect(undone.contacts).toEqual([])
    const cleared = evolved([DotShapes.Clear(), ...tap(11, 500, 350, 1)], held)
    expect(cleared.points).toEqual([{ id: 3, x: 500, y: 350 }])
  })

  it('moves a visible keyboard cursor, places dots and reshapes focused dots with arrows', () => {
    const model = evolved([
      DotShapes.KeyboardPressed({ key: 'ArrowRight', dotId: null, shift: false, revision: 0 }),
      DotShapes.KeyboardPressed({ key: 'Enter', dotId: null, shift: false, revision: 0 }),
      DotShapes.KeyboardPressed({ key: 'ArrowDown', dotId: null, shift: true, revision: 0 }),
      DotShapes.KeyboardPressed({ key: ' ', dotId: null, shift: false, revision: 0 }),
      DotShapes.KeyboardPressed({ key: 'ArrowLeft', dotId: 0, shift: true, revision: 0 }),
      DotShapes.KeyboardPressed({ key: 'Enter', dotId: 0, shift: false, revision: 0 }),
    ])
    expect(model.cursorVisible).toBe(true)
    expect(model.cursor).toEqual({ x: 525, y: 450 })
    expect(model.points).toEqual([{ id: 0, x: 425, y: 350 }, { id: 1, x: 525, y: 450 }])
    const undone = evolved([DotShapes.KeyboardPressed({ key: 'Backspace', dotId: 0, shift: false, revision: 0 })], model)
    expect(undone.points).toHaveLength(1)
    expect(undone.revision).toBe(1)
    expect(evolved([DotShapes.KeyboardPressed({ key: 'Delete', dotId: null, shift: false, revision: 1 })], undone)).toEqual(undone)
  })

  it('keeps edge taps and keyboard placements fully visible at every board corner', () => {
    const model = evolved([...tap(0, 0, 0), ...tap(1, 1000, 0), ...tap(2, 1000, 700), ...tap(3, 0, 700)])
    expect(model.points.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 44, y: 30 }, { x: 956, y: 30 }, { x: 956, y: 670 }, { x: 44, y: 670 },
    ])
    const keyboard = evolved([
      ...Array.from({ length: 10 }, () => DotShapes.KeyboardPressed({ key: 'ArrowLeft', dotId: null, shift: true, revision: 0 })),
      ...Array.from({ length: 10 }, () => DotShapes.KeyboardPressed({ key: 'ArrowUp', dotId: null, shift: true, revision: 0 })),
      DotShapes.KeyboardPressed({ key: 'Enter', dotId: null, shift: false, revision: 0 }),
    ])
    expect(keyboard.cursor).toEqual({ x: 44, y: 30 })
    expect(keyboard.points).toEqual([{ id: 0, x: 44, y: 30 }])
  })

  it('resolves sound acknowledgement when audio is missing or rejects', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const held = evolved([DotShapes.ContactStarted({ id: 0, x: 100, y: 100, dotId: null, revision: 0 })])
    const [model, commands] = audibleUpdate(held, DotShapes.ContactEnded({ id: 0, x: 100, y: 100, moved: false, revision: 0 }))
    expect(model.points).toHaveLength(1)
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(DotShapes.SoundPlayed())
    vi.spyOn(Audio, 'pop').mockReturnValue({ name: 'PlayPop', effect: Effect.die(new Error('sound blocked')) })
    const [, failed] = audibleUpdate(held, DotShapes.ContactEnded({ id: 0, x: 100, y: 100, moved: false, revision: 0 }))
    expect(await Effect.runPromise(failed[0]!.effect)).toEqual(DotShapes.SoundPlayed())
  })
})

describe('Dot Shapes accessible view', () => {
  it('has an owned keyboard board and disabled native controls while empty', () => {
    Scene.scene({ update, view }, Scene.with(DotShapes.init()), Scene.Mount.resolveAll(mounted),
      Scene.expect(Scene.role('group', { name: t('dotShapesBoard', 'en') })).toHaveAttr('tabindex', '0'),
      Scene.expect(Scene.selector('.dot-shapes-board')).toHaveAttr('data-multitouch-owned', 'true'),
      Scene.expect(Scene.role('button', { name: t('dotShapesUndo', 'en') })).toBeDisabled(),
      Scene.expect(Scene.role('button', { name: t('clear', 'en') })).toBeDisabled(),
      Scene.expect(Scene.role('status')).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.selector('svg')).toHaveAttr('aria-hidden', 'true'), Scene.Command.expectNone(),
    )
  })

  it('renders colorful closing edges, a translucent shape, and localized native dot buttons', () => {
    const numbers = new Intl.NumberFormat(normalizeLanguage('fa'))
    Scene.scene({ update, view: (model: DotShapes.Model) => DotShapes.view(model, 'fa') }, Scene.with(triangle()), Scene.Mount.resolveAll(mounted),
      Scene.expectAll(Scene.all.selector('.dot-shapes-edge')).toHaveCount(3),
      Scene.expect(Scene.selector('.dot-shapes-fill')).toHaveAttr('fill-rule', 'evenodd'),
      Scene.expect(Scene.role('button', { name: tf('dotShapesDotLabel', 'fa', numbers.format(1)) })).toHaveAttr('data-dot-shapes-id', '0'),
      Scene.expect(Scene.role('status')).toHaveText(tf('dotShapesStatus', 'fa', t('dotShapesTriangle', 'fa'), numbers.format(3))),
      Scene.expect(Scene.role('button', { name: t('dotShapesUndo', 'fa') })).toBeEnabled(), Scene.Command.expectNone(),
    )
  })

  it('Undo opens a triangle and Clear removes all geometry through native controls', () => {
    Scene.scene({ update, view }, Scene.with(triangle()), Scene.Mount.resolveAll(mounted),
      Scene.click(Scene.role('button', { name: t('dotShapesUndo', 'en') })),
      Scene.expectAll(Scene.all.selector('.dot-shapes-edge')).toHaveCount(1), Scene.expectAll(Scene.all.selector('.dot-shapes-fill')).toBeEmpty(),
      Scene.click(Scene.role('button', { name: t('clear', 'en') })),
      Scene.expectAll(Scene.all.selector('.dot-shapes-point')).toBeEmpty(), Scene.expectAll(Scene.all.selector('.dot-shapes-edge')).toBeEmpty(),
      Scene.expect(Scene.role('button', { name: t('clear', 'en') })).toBeDisabled(), Scene.Command.expectNone(),
    )
  })
})

describe('Dot Shapes mounted input', () => {
  it.each(['pointer', 'native', 'paired'] as const)('places a real point through the mounted %s finger stream', async mode => {
    const board = document.createElement('div')
    board.setAttribute('data-dot-shapes-revision', '0')
    board.tabIndex = 0
    document.body.append(board)
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 700))
    vi.spyOn(Audio, 'warmAudio').mockImplementation(() => {})
    const listen = vi.spyOn(board, 'addEventListener')
    let model = DotShapes.init()
    const messages: DotShapes.Message[] = []
    const fiber = Effect.runFork(Stream.runForEach(DotShapes.mountDotShapes(board), message => Effect.sync(() => {
      messages.push(message)
      const [next, commands] = update(model, message)
      expect(commands).toEqual([])
      model = next
    })))
    let stamp = 100
    const pointer = (type: string) => {
      const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: 100, clientY: 100 })
      Object.defineProperty(event, 'timeStamp', { value: stamp++ })
      const eventTarget = type === 'pointerdown' ? board : document
      eventTarget.dispatchEvent(event)
    }
    const touch = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      const point = { identifier: -203274, target: board, clientX: 100, clientY: 100 }
      Object.defineProperties(event, { timeStamp: { value: stamp++ }, changedTouches: { value: { length: 1, item: () => point } } })
      const eventTarget = type === 'touchstart' ? board : document
      eventTarget.dispatchEvent(event)
    }
    try {
      await vi.waitFor(() => expect(listen.mock.calls.some(([name]) => name === 'touchstart')).toBe(true))
      if (mode !== 'native') pointer('pointerdown')
      if (mode !== 'pointer') touch('touchstart')
      if (mode !== 'native') pointer('pointerup')
      if (mode !== 'pointer') touch('touchend')
      board.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: 100, clientY: 100 }))
      await vi.waitFor(() => expect(model.points).toHaveLength(1))
      expect(model.points).toEqual([{ id: 0, x: 100, y: 100 }])
      expect(messages.filter(message => message._tag === 'DotShapesContactStarted')).toHaveLength(1)
      expect(messages.filter(message => message._tag === 'DotShapesContactEnded')).toHaveLength(1)
      expect(model.contacts).toEqual([])
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      board.remove()
    }
  })
})
