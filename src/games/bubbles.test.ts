import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Bubbles from './bubbles'

const resolvePop = [{ name: 'PlayPop' }, Bubbles.SoundPlayed()] as const
const resolveChime = [{ name: 'PlayChime' }, Bubbles.SoundPlayed()] as const
const resolveSpeak = [{ name: 'Speak' }, Bubbles.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Bubbles.SoundPlayed()] as const
const resolveAnim = [{ name: 'bubblesAnim' }, Bubbles.SoundPlayed()] as const
const resolveColorSelector = [{ name: 'colorSelector' }, Bubbles.ClickedColor({ color: '', duration: 0 })] as const

describe('Bubbles', () => {
  it('init creates empty state', () => {
    const model = Bubbles.init()
    expect(model.bubbles).toHaveLength(0)
    expect(model.score).toBe(0)
    expect(model.nextId).toBe(0)
    expect(model.shapeMode).toBe(false)
    expect(model.selectedShape).toBe('circle')
  })

  it('init includes selectedColor', () => {
    const model = Bubbles.init()
    expect(model.selectedColor).toBe('')
    expect(model.rainbowMode).toBe(false)
  })

  it('ClickedColor with hex creates a bubble of that color', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedColor({ color: '#FF6B6B', duration: 500 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]?.color).toBe('#FF6B6B')
        expect(model.bubbles[0]?.popped).toBe(false)
        expect(model.bubbles[0]?.size).toBeGreaterThanOrEqual(10)
        expect(model.selectedColor).toBe('#FF6B6B')
        expect(model.rainbowMode).toBe(false)
      }),
      Story.Command.resolveAll(resolveChime, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('ClickedColor with rainbow creates a rainbow-gradient bubble', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedColor({ color: 'rainbow', duration: 500 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]?.color).toContain('linear-gradient')
        expect(model.selectedColor).toBe('rainbow')
        expect(model.rainbowMode).toBe(true)
      }),
      Story.Command.resolveAll(resolveChime, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('ClickedColor duration affects bubble size', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedColor({ color: '#4ECDC4', duration: 2000 })),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(1)
        expect(model.bubbles[0]?.size).toBeGreaterThan(100)
      }),
      Story.Command.resolveAll(resolveChime, resolveSpeak),
      Story.Command.expectNone(),
    )
  })

  it('pop a bubble by id', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20 }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [bubble], score: 0, nextId: 1 }),
      Story.message(Bubbles.ClickedPop({ id: 1 })),
      Story.model((model) => {
        expect(model.bubbles[0]?.popped).toBe(true)
        expect(model.score).toBe(1)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('reset clears all when there are bubbles', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20 }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [bubble], score: 3, nextId: 1 }),
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

  it('reset is no-op when already empty', () => {
    Story.story(
      Bubbles.update,
      Story.with(Bubbles.init()),
      Story.message(Bubbles.ClickedReset()),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(0)
        expect(model.score).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('renders hint when empty', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('Bubbles!')).toExist(),
      Scene.expect(Scene.text('Tap "Add Bubble" to start!')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('renders bubble after adding', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20 }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [bubble], score: 0, nextId: 1 }),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows done message when all popped', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: true, size: 20 }
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [bubble], score: 1, nextId: 1 }),
      Scene.expect(Scene.text('All popped! Add more!')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when bubbles exist', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [{ id: 1, color: '#FF6B6B', popped: false, size: 20 }], score: 0, nextId: 1 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button even when empty', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('shows Clear button when score > 0 even with no bubbles', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with({ ...Bubbles.init(), bubbles: [], score: 3, nextId: 3 }),
      Scene.expect(Scene.text('Clear')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })

  it('popping one bubble does not affect other bubbles in the model', () => {
    const b1 = { id: 1, color: '#FF6B6B', popped: false, size: 20, shape: 'circle' }
    const b2 = { id: 2, color: '#4ECDC4', popped: false, size: 20, shape: 'circle' }
    const b3 = { id: 3, color: '#FFE66D', popped: false, size: 20, shape: 'circle' }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [b1, b2, b3], score: 0, nextId: 4 }),
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
    const b1 = { id: 1, color: '#FF6B6B', popped: false, size: 20, shape: 'circle' }
    const next = Bubbles.update({ ...Bubbles.init(), bubbles: [b1], score: 0, nextId: 2 }, Bubbles.ClickedColor({ color: '#4ECDC4', duration: 500 }), false)[0]
    expect(next.bubbles).toHaveLength(2)
    const afterPop = Bubbles.update(next, Bubbles.ClickedPop({ id: 1 }), false)[0]
    expect(afterPop.bubbles).toHaveLength(2)
    expect(afterPop.bubbles[0]?.popped).toBe(true)
    expect(afterPop.bubbles[1]?.popped).toBe(false)
    expect(afterPop.bubbles[1]?.id).toBe(2)
  })

  it('SoundPlayed leaves model unchanged', () => {
    const model = { ...Bubbles.init(), bubbles: [{ id: 1, color: '#FF6B6B', popped: false, size: 20, shape: 'circle' }], score: 2, nextId: 2 }
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

  it('renders color selector buttons', () => {
    Scene.scene(
      { update: Bubbles.update, view: Bubbles.view },
      Scene.with(Bubbles.init()),
      Scene.expect(Scene.text('🌈')).toExist(),
      Scene.Mount.resolveAll(resolveAnim, resolveColorSelector),
      Scene.Command.resolveAll(resolveChime, resolveSpeak),
      Scene.Command.expectNone(),
    )
  })
})

describe('Bubbles global state', () => {
  it('pop by id works correctly', () => {
    const bubble = { id: 1, color: '#FF6B6B', popped: false, size: 20 }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [bubble], score: 0, nextId: 1 }),
      Story.message(Bubbles.ClickedPop({ id: 1 })),
      Story.model((model) => {
        expect(model.bubbles[0]?.popped).toBe(true)
        expect(model.score).toBe(1)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('reset works correctly after multiple pops', () => {
    const b1 = { id: 1, color: '#FF6B6B', popped: true, size: 20 }
    const b2 = { id: 2, color: '#4ECDC4', popped: false, size: 20 }
    Story.story(
      Bubbles.update,
      Story.with({ ...Bubbles.init(), bubbles: [b1, b2], score: 3, nextId: 2 }),
      Story.message(Bubbles.ClickedReset()),
      Story.model((model) => {
        expect(model.bubbles).toHaveLength(0)
        expect(model.score).toBe(0)
      }),
      Story.Command.resolveAll(resolveSwoosh),
      Story.Command.expectNone(),
    )
  })
})
