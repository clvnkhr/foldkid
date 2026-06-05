import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Peekaboo from './peekaboo'

const resolveBoing = [{ name: 'PlayBoing' }, Peekaboo.SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, Peekaboo.SoundPlayed()] as const

describe('Peekaboo', () => {
  it('init creates a valid game', () => {
    const game = Peekaboo.init()
    expect(game.grid).toHaveLength(9)
    expect(game.count).toBe(0)
    expect(game.shaking).toBe(-1)
    expect(game.won).toBe(false)
    expect(game.grid.some(c => c.emoji === game.target)).toBe(true)
  })

  it('correct cell shows win', () => {
    const game = Peekaboo.init()
    const cell = game.grid.find(c => c.emoji === game.target)!
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedCell({ id: cell.id })),
      Story.model((model) => {
        expect(model.count).toBe(0)
        expect(model.won).toBe(true)
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('next advances to new game with incremented count', () => {
    const game = Peekaboo.init()
    Story.story(
      Peekaboo.update,
      Story.with({ ...game, won: true }),
      Story.message(Peekaboo.ClickedNext()),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.won).toBe(false)
        expect(model.grid).toHaveLength(9)
      }),
      Story.Command.expectNone(),
    )
  })

  it('wrong cell shakes without incrementing', () => {
    const game = Peekaboo.init()
    const wrong = game.grid.find(c => c.emoji !== game.target)!
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedCell({ id: wrong.id })),
      Story.model((model) => {
        expect(model.count).toBe(0)
        expect(model.won).toBe(false)
        expect(model.shaking).toBe(wrong.id)
        expect(model.shakeTick).toBe(1)
      }),
      Story.Command.expectNone(),
    )
  })

  it('reset creates a new game', () => {
    const game = Peekaboo.init()
    Story.story(
      Peekaboo.update,
      Story.with({ ...game, count: 5 }),
      Story.message(Peekaboo.ClickedReset()),
      Story.model((model) => {
        expect(model.count).toBe(0)
        expect(model.won).toBe(false)
        expect(model.shaking).toBe(-1)
        expect(model.grid).toHaveLength(9)
      }),
      Story.Command.resolveAll(resolveSwoosh),
      Story.Command.expectNone(),
    )
  })

  it('renders prompt and grid', () => {
    const game = Peekaboo.init()
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.expect(Scene.text(`Where is ${game.target}?`)).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('clicking wrong cell shows wobble', () => {
    const game = Peekaboo.init()
    const wrong = game.grid.find(c => c.emoji !== game.target)!
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.click(Scene.text(wrong.emoji)),
      Scene.expect(Scene.text(`Where is ${game.target}?`)).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('clicking correct cell shows you win', () => {
    const game = Peekaboo.init()
    const cell = game.grid.find(c => c.emoji === game.target)!
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.click(Scene.text(cell.emoji)),
      Scene.expect(Scene.text('YOU WIN!!!')).toExist(),
      Scene.Command.resolveAll(resolveBoing),
      Scene.Command.expectNone(),
    )
  })

  it('clicking cell after win does nothing', () => {
    const game = { ...Peekaboo.init(), won: true }
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedCell({ id: 0 })),
      Story.model((model) => {
        expect(model.won).toBe(true)
        expect(model.count).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('SoundPlayed leaves model unchanged', () => {
    const game = Peekaboo.init()
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.SoundPlayed()),
      Story.model((model) => {
        expect(model).toStrictEqual(game)
      }),
      Story.Command.expectNone(),
    )
  })
})
