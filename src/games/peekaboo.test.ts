import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Peekaboo from './peekaboo'

const resolveWin = [
  [{ name: 'PlayBoing' }, Peekaboo.SoundPlayed()] as const,
  [{ name: 'Speak' }, Peekaboo.SoundPlayed()] as const,
] as const

describe('Peekaboo', () => {
  it('init creates a valid game', () => {
    const game = Peekaboo.init()
    expect(game.grid).toHaveLength(9)
    expect(game.count).toBe(0)
    expect(game.shaking).toBe(-1)
    expect(game.won).toBe(false)
    expect(game.anyWins).toBe(false)
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
      Story.Command.resolveAll(...resolveWin),
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
        expect(model.wrongCount).toBe(1)
      }),
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
      Scene.expect(Scene.text(`${Peekaboo.emojiName(cell.emoji)}!`)).toExist(),
      Scene.Command.resolveAll(...resolveWin),
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

  it('hint appears after 3 wrong guesses', () => {
    const game = Peekaboo.init()
    const correctId = game.grid.find(c => c.emoji === game.target)!.id
    const wrongCells = game.grid.filter(c => c.emoji !== game.target)

    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedCell({ id: wrongCells[0]!.id })),
      Story.message(Peekaboo.ClickedCell({ id: wrongCells[1]!.id })),
      Story.message(Peekaboo.ClickedCell({ id: wrongCells[2]!.id })),
      Story.model((model) => {
        expect(model.wrongCount).toBe(3)
        expect(model.hintId).toBe(correctId)
      }),
      Story.Command.expectNone(),
    )
  })

  it('hint is cleared on correct answer', () => {
    const game = Peekaboo.init()
    const correctId = game.grid.find(c => c.emoji === game.target)!.id

    Story.story(
      Peekaboo.update,
      Story.with({ ...game, wrongCount: 3, hintId: correctId }),
      Story.message(Peekaboo.ClickedCell({ id: correctId })),
      Story.model((model) => {
        expect(model.hintId).toBeNull()
        expect(model.wrongCount).toBe(0)
      }),
      Story.Command.resolveAll(...resolveWin),
      Story.Command.expectNone(),
    )
  })

  it('anyWins makes any clicked cell win', () => {
    const game = { ...Peekaboo.init(), anyWins: true }
    const cell = game.grid.find(c => c.emoji !== game.target)!
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedCell({ id: cell.id })),
      Story.model((model) => {
        expect(model.won).toBe(true)
        expect(model.found).toContain(cell.emoji)
      }),
      Story.Command.resolveAll(...resolveWin),
      Story.Command.expectNone(),
    )
  })

  it('anyWins shows pickYourFavourite text', () => {
    const game = { ...Peekaboo.init(), anyWins: true }
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.expect(Scene.text('Pick your favourite!')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('SetAnyWins updates the model', () => {
    const game = Peekaboo.init()
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.SetAnyWins({ value: true })),
      Story.model((model) => {
        expect(model.anyWins).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })

  it('anyWins persists through next round', () => {
    const game = { ...Peekaboo.init(), anyWins: true, won: true }
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedNext()),
      Story.model((model) => {
        expect(model.anyWins).toBe(true)
        expect(model.won).toBe(false)
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

  it('ClickedCollectionEmoji sets tooltipEmoji and speaks the name', () => {
    const game = Peekaboo.init()
    const emoji = game.grid[0]!.emoji
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedCollectionEmoji({ emoji })),
      Story.model((model) => {
        expect(model.tooltipEmoji).toBe(emoji)
      }),
      Story.Command.resolveAll(
        [{ name: 'Speak' }, Peekaboo.SoundPlayed()] as const,
      ),
      Story.Command.expectNone(),
    )
  })

  it('DismissTooltip clears tooltipEmoji', () => {
    const game = { ...Peekaboo.init(), tooltipEmoji: '🎈' }
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.DismissTooltip()),
      Story.model((model) => {
        expect(model.tooltipEmoji).toBeNull()
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedReset clears found and resets count', () => {
    const game = { ...Peekaboo.init(), found: ['🎈', '🎉'], count: 2 }
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedReset()),
      Story.model((model) => {
        expect(model.found).toHaveLength(0)
        expect(model.count).toBe(0)
        expect(model.won).toBe(false)
        expect(model.grid).toHaveLength(9)
      }),
      Story.Command.expectNone(),
    )
  })

  it('reset button renders when collection non-empty', () => {
    const game = { ...Peekaboo.init(), found: ['🎈'] }
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('tooltip shows emoji name in floating popup when tooltipEmoji is set', () => {
    const game = { ...Peekaboo.init(), tooltipEmoji: '🎈' }
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.expect(Scene.text('🎈 Balloon')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('tooltip not shown when tooltipEmoji is null', () => {
    const game = Peekaboo.init()
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.expect(Scene.text('🎈 Balloon')).not.toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('correct cell click clears tooltip', () => {
    const game = Peekaboo.init()
    const cell = game.grid.find(c => c.emoji === game.target)!
    Story.story(
      Peekaboo.update,
      Story.with({ ...game, tooltipEmoji: cell.emoji }),
      Story.message(Peekaboo.ClickedCell({ id: cell.id })),
      Story.model((model) => {
        expect(model.tooltipEmoji).toBeNull()
      }),
      Story.Command.resolveAll(...resolveWin),
      Story.Command.expectNone(),
    )
  })

  it('reset button does not render when collection empty', () => {
    const game = Peekaboo.init()
    Scene.scene(
      { update: Peekaboo.update, view: Peekaboo.view },
      Scene.with(game),
      Scene.expect(Scene.text('Reset')).not.toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('ClickedReset preserves anyWins setting', () => {
    const game = { ...Peekaboo.init(), found: ['🎈'], anyWins: true }
    Story.story(
      Peekaboo.update,
      Story.with(game),
      Story.message(Peekaboo.ClickedReset()),
      Story.model((model) => {
        expect(model.anyWins).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })
})
