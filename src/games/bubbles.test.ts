import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Bubbles from './bubbles'

const resolvePop = [{ name: 'PlayPop' }, Bubbles.SoundPlayed()] as const
const resolveChime = [{ name: 'PlayChime' }, Bubbles.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Bubbles.SoundPlayed()] as const
const resolveAnim = [{ name: 'bubblesAnim' }, Bubbles.SoundPlayed()] as const

describe('Bubbles', () => {
  it('init creates empty state', () => {
    const model = Bubbles.init()
    expect(model.bubbles).toHaveLength(0)
    expect(model.score).toBe(0)
    expect(model.nextId).toBe(0)
  })

  it('add creates a bubble', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedAdd()),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]?.popped).toBe(false)
        expect(model.score).toBe(0)
      }),
      Story.Command.resolveAll(resolveChime),
      Story.Command.expectNone(),
    )
  })

  it('pop a bubble by id', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false }
    Story.story(
      Bubbles.update,
      Story.with({ bubbles: [bubble], score: 0, nextId: 1 }),
      Story.message(Bubbles.ClickedPop({ id: 1 })),
      Story.model((model) => {
        expect(model.bubbles[0]?.popped).toBe(true)
        expect(model.score).toBe(1)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('reset clears all', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false }
    Story.story(
      Bubbles.update,
      Story.with({ bubbles: [bubble], score: 3, nextId: 1 }),
      Story.message(Bubbles.ClickedReset()),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(0)
        expect(model.score).toBe(0)
        expect(model.nextId).toBe(1)
      }),
      Story.Command.resolveAll(resolveSwoosh),
      Story.Command.expectNone(),
    )
  })

  it('renders hint when empty', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('Bubbles!')).toExist(),
      Scene.expect(Scene.text('Tap "Add Bubble" to start!')).toExist(),
      Scene.expect(Scene.text('➕ Add Bubble')).toExist(),
      Scene.Mount.resolveAll(resolveAnim),
      Scene.Command.expectNone(),
    )
  })

  it('renders bubble after adding', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [bubble], score: 0, nextId: 1 }),
      Scene.expect(Scene.text('➕ Add Bubble')).toExist(),
      Scene.Mount.resolveAll(resolveAnim),
      Scene.Command.expectNone(),
    )
  })

  it('shows done message when all popped', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: true }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [bubble], score: 1, nextId: 1 }),
      Scene.expect(Scene.text('All popped! Add more!')).toExist(),
      Scene.Mount.resolveAll(resolveAnim),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when bubbles exist', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [{ id: 1, color: '#FF6B6B', popped: false }], score: 0, nextId: 1 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when score > 0 even with no bubbles', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [], score: 3, nextId: 3 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim),
      Scene.Command.expectNone(),
    )
  })

  it('hides Clear button when empty and score is 0', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('Clear')).toBeAbsent(),
      Scene.Mount.resolveAll(resolveAnim),
      Scene.Command.expectNone(),
    )
  })

  it('popping one bubble does not affect other bubbles in the model', () => {
    const b1 = { id: 1, color: '#FF6B6B', popped: false }
    const b2 = { id: 2, color: '#4ECDC4', popped: false }
    const b3 = { id: 3, color: '#FFE66D', popped: false }
    Story.story(
      Bubbles.update,
      Story.with({ bubbles: [b1, b2, b3], score: 0, nextId: 4 }),
      Story.message(Bubbles.ClickedPop({ id: 2 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(3)
        expect(model.bubbles[0]).toStrictEqual({ ...b1 })
        expect(model.bubbles[1]).toStrictEqual({ ...b2, popped: true })
        expect(model.bubbles[2]).toStrictEqual({ ...b3 })
        expect(model.score).toBe(1)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('sequential pop and add preserves unpopped bubbles', () => {
    const b1 = { id: 1, color: '#FF6B6B', popped: false }
    const next = Bubbles.update({ bubbles: [b1], score: 0, nextId: 2 }, Bubbles.ClickedAdd(), false)[0]
    expect(next.bubbles).toHaveLength(2)
    const afterPop = Bubbles.update(next, Bubbles.ClickedPop({ id: 1 }), false)[0]
    expect(afterPop.bubbles).toHaveLength(2)
    expect(afterPop.bubbles[0]?.popped).toBe(true)
    expect(afterPop.bubbles[1]?.popped).toBe(false)
    expect(afterPop.bubbles[1]?.id).toBe(2)
  })

  it('SoundPlayed leaves model unchanged', () => {
    const model = { bubbles: [{ id: 1, color: '#FF6B6B', popped: false }], score: 2, nextId: 2 }
    Story.story(
      Bubbles.update,
      Story.with(model),
      Story.message(Bubbles.SoundPlayed()),
      Story.model((m) => {
        expect(m).toStrictEqual(model)
      }),
      Story.Command.expectNone(),
    )
  })
})
