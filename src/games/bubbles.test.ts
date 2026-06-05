import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Bubbles from './bubbles'

const resolvePop = [{ name: 'PlayPop' }, Bubbles.SoundPlayed()] as const
const resolveChime = [{ name: 'PlayChime' }, Bubbles.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Bubbles.SoundPlayed()] as const

describe('Bubbles', () => {
  it('init state', () => {
    expect(Bubbles.init).toStrictEqual({ bubbles: [], score: 0, nextId: 0 })
  })

  it('add creates a bubble', () => {
    Story.story(
      Bubbles.update,
      Story.with({ bubbles: [], score: 0, nextId: 0 }),
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
      Scene.with(Bubbles.init),
      Scene.expect(Scene.text('Bubbles!')).toExist(),
      Scene.expect(Scene.text('Tap "Add Bubble" to start!')).toExist(),
      Scene.expect(Scene.text('➕ Add Bubble')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders bubble after adding', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [bubble], score: 0, nextId: 1 }),
      Scene.expect(Scene.text('○')).toExist(),
      Scene.expect(Scene.text('○')).toHaveStyle('background', '#FF6B6B'),
      Scene.expect(Scene.text('Tap "Add Bubble" to start!')).toBeAbsent(),
      Scene.Command.expectNone(),
    )
  })

  it('shows done message when all popped', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: true }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [bubble], score: 1, nextId: 1 }),
      Scene.expect(Scene.text('All popped! Add more!')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when bubbles exist', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [{ id: 1, color: '#FF6B6B', popped: false }], score: 0, nextId: 1 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when score > 0 even with no bubbles', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [], score: 3, nextId: 3 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('hides Clear button when empty and score is 0', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ bubbles: [], score: 0, nextId: 0 }),
      Scene.expect(Scene.text('Clear')).toBeAbsent(),
      Scene.Command.expectNone(),
    )
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
