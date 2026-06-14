import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as FindIt from './findit'

const resolveWin = [
  [{ name: 'PlayBoing' }, FindIt.SoundPlayed()] as const,
  [{ name: 'Speak' }, FindIt.SoundPlayed()] as const,
] as const
const segmentEmoji = (emoji: string): string[] =>
  [...new Intl.Segmenter().segment(emoji)].map(segment => segment.segment)

describe('FindIt', () => {
  it('init creates a valid game', () => {
    const game = FindIt.init()
    expect(game.grid).toHaveLength(9)
    expect(game.count).toBe(0)
    expect(game.shaking).toBe(-1)
    expect(game.won).toBe(false)
    expect(game.anyWins).toBe(false)
    expect(game.enabledPacks).toEqual(FindIt.DEFAULT_EMOJI_PACK_KEYS)
    expect(game.grid.some(c => c.emoji === game.target)).toBe(true)
  })

  it('can generate a numbers-only game', () => {
    const game = FindIt.init(false, ['numbers'])
    const numbers = new Set(FindIt.emojiPoolForPacks(['numbers']))

    expect(game.enabledPacks).toEqual(['numbers'])
    expect(game.grid).toHaveLength(9)
    expect(game.grid.every(cell => numbers.has(cell.emoji))).toBe(true)
    expect(numbers.has(game.target)).toBe(true)
  })

  it('toggles emoji packs and regenerates from enabled packs', () => {
    const game = FindIt.init(false, ['numbers', 'animals'])
    const numbers = new Set(FindIt.emojiPoolForPacks(['numbers']))

    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.SetEmojiPackEnabled({ key: 'animals', value: false })),
      Story.model((model) => {
        expect(model.enabledPacks).toEqual(['numbers'])
        expect(model.grid.every(cell => numbers.has(cell.emoji))).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })

  it('does not disable the last emoji pack', () => {
    const game = FindIt.init(false, ['numbers'])

    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.SetEmojiPackEnabled({ key: 'numbers', value: false })),
      Story.model((model) => {
        expect(model.enabledPacks).toEqual(['numbers'])
        expect(model.grid).toStrictEqual(game.grid)
      }),
      Story.Command.expectNone(),
    )
  })

  it('pack combinations generate valid single and pairs games', () => {
    const packCombos = [
      ['fun'],
      ['numbers'],
      ['animals'],
      ['fun', 'numbers'],
      ['numbers', 'animals'],
      FindIt.DEFAULT_EMOJI_PACK_KEYS,
    ] as const

    for (const packs of packCombos) {
      const pool = new Set(FindIt.emojiPoolForPacks(packs))
      const single = FindIt.init(false, packs)
      expect(single.grid).toHaveLength(9)
      expect(single.grid.some(cell => cell.emoji === single.target), `${packs.join(',')} single target`).toBe(true)
      expect(single.grid.every(cell => pool.has(cell.emoji)), `${packs.join(',')} single pool`).toBe(true)

      const pairs = FindIt.init(true, packs)
      expect(pairs.grid).toHaveLength(9)
      expect(pairs.grid.some(cell => cell.emoji === pairs.target), `${packs.join(',')} pairs target`).toBe(true)
      expect(pairs.grid.every(cell => segmentEmoji(cell.emoji).every(emoji => pool.has(emoji))), `${packs.join(',')} pairs pool`).toBe(true)
      expect(FindIt.emojiName(pairs.target)).not.toBe(pairs.target)
    }
  })

  it('correct cell shows win', () => {
    const game = FindIt.init()
    const cell = game.grid.find(c => c.emoji === game.target)!
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedCell({ id: cell.id })),
      Story.model((model) => {
        expect(model.count).toBe(0)
        expect(model.won).toBe(true)
      }),
      Story.Command.resolveAll(...resolveWin),
      Story.Command.expectNone(),
    )
  })

  it('next advances to new game with incremented count', () => {
    const game = FindIt.init()
    Story.story(
      FindIt.update,
      Story.with({ ...game, won: true }),
      Story.message(FindIt.ClickedNext()),
      Story.model((model) => {
        expect(model.count).toBe(1)
        expect(model.won).toBe(false)
        expect(model.grid).toHaveLength(9)
      }),
      Story.Command.expectNone(),
    )
  })

  it('wrong cell shakes without incrementing', () => {
    const game = FindIt.init()
    const wrong = game.grid.find(c => c.emoji !== game.target)!
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedCell({ id: wrong.id })),
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
    const game = FindIt.init()
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.expect(Scene.text(`Where is ${game.target}?`)).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('clicking wrong cell shows wobble', () => {
    const game = FindIt.init()
    const wrong = game.grid.find(c => c.emoji !== game.target)!
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.click(Scene.text(wrong.emoji)),
      Scene.expect(Scene.text(`Where is ${game.target}?`)).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('clicking correct cell shows you win', () => {
    const game = FindIt.init()
    const cell = game.grid.find(c => c.emoji === game.target)!
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.click(Scene.text(cell.emoji)),
      Scene.expect(Scene.text(`${FindIt.emojiName(cell.emoji)}!`)).toExist(),
      Scene.Command.resolveAll(...resolveWin),
      Scene.Command.expectNone(),
    )
  })

  it('clicking cell after win does nothing', () => {
    const game = { ...FindIt.init(), won: true }
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedCell({ id: 0 })),
      Story.model((model) => {
        expect(model.won).toBe(true)
        expect(model.count).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('hint appears after 3 wrong guesses', () => {
    const game = FindIt.init()
    const correctId = game.grid.find(c => c.emoji === game.target)!.id
    const wrongCells = game.grid.filter(c => c.emoji !== game.target)

    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedCell({ id: wrongCells[0]!.id })),
      Story.message(FindIt.ClickedCell({ id: wrongCells[1]!.id })),
      Story.message(FindIt.ClickedCell({ id: wrongCells[2]!.id })),
      Story.model((model) => {
        expect(model.wrongCount).toBe(3)
        expect(model.hintId).toBe(correctId)
      }),
      Story.Command.expectNone(),
    )
  })

  it('hint is cleared on correct answer', () => {
    const game = FindIt.init()
    const correctId = game.grid.find(c => c.emoji === game.target)!.id

    Story.story(
      FindIt.update,
      Story.with({ ...game, wrongCount: 3, hintId: correctId }),
      Story.message(FindIt.ClickedCell({ id: correctId })),
      Story.model((model) => {
        expect(model.hintId).toBeNull()
        expect(model.wrongCount).toBe(0)
      }),
      Story.Command.resolveAll(...resolveWin),
      Story.Command.expectNone(),
    )
  })

  it('anyWins makes any clicked cell win', () => {
    const game = { ...FindIt.init(), anyWins: true }
    const cell = game.grid.find(c => c.emoji !== game.target)!
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedCell({ id: cell.id })),
      Story.model((model) => {
        expect(model.won).toBe(true)
        expect(model.found).toContain(cell.emoji)
      }),
      Story.Command.resolveAll(...resolveWin),
      Story.Command.expectNone(),
    )
  })

  it('anyWins shows pickYourFavourite text', () => {
    const game = { ...FindIt.init(), anyWins: true }
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.expect(Scene.text('Pick your favourite!')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('SetAnyWins updates the model', () => {
    const game = FindIt.init()
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.SetAnyWins({ value: true })),
      Story.model((model) => {
        expect(model.anyWins).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })

  it('anyWins persists through next round', () => {
    const game = { ...FindIt.init(), anyWins: true, won: true }
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedNext()),
      Story.model((model) => {
        expect(model.anyWins).toBe(true)
        expect(model.won).toBe(false)
      }),
      Story.Command.expectNone(),
    )
  })

  it('SoundPlayed leaves model unchanged', () => {
    const game = FindIt.init()
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.SoundPlayed()),
      Story.model((model) => {
        expect(model).toStrictEqual(game)
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedCollectionEmoji sets tooltipEmoji and speaks the name', () => {
    const game = FindIt.init()
    const emoji = game.grid[0]!.emoji
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedCollectionEmoji({ emoji })),
      Story.model((model) => {
        expect(model.tooltipEmoji).toBe(emoji)
      }),
      Story.Command.resolveAll(
        [{ name: 'Speak' }, FindIt.SoundPlayed()] as const,
      ),
      Story.Command.expectNone(),
    )
  })

  it('DismissTooltip clears tooltipEmoji', () => {
    const game = { ...FindIt.init(), tooltipEmoji: '🎈' }
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.DismissTooltip()),
      Story.model((model) => {
        expect(model.tooltipEmoji).toBeNull()
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedReset clears found and resets count', () => {
    const game = { ...FindIt.init(), found: ['🎈', '🎉'], count: 2 }
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedReset()),
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
    const game = { ...FindIt.init(), found: ['🎈'] }
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('tooltip shows emoji name in floating popup when tooltipEmoji is set', () => {
    const game = { ...FindIt.init(), tooltipEmoji: '🎈' }
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.expect(Scene.text('🎈 Balloon')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('tooltip not shown when tooltipEmoji is null', () => {
    const game = FindIt.init()
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.expect(Scene.text('🎈 Balloon')).not.toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('correct cell click clears tooltip', () => {
    const game = FindIt.init()
    const cell = game.grid.find(c => c.emoji === game.target)!
    Story.story(
      FindIt.update,
      Story.with({ ...game, tooltipEmoji: cell.emoji }),
      Story.message(FindIt.ClickedCell({ id: cell.id })),
      Story.model((model) => {
        expect(model.tooltipEmoji).toBeNull()
      }),
      Story.Command.resolveAll(...resolveWin),
      Story.Command.expectNone(),
    )
  })

  it('reset button does not render when collection empty', () => {
    const game = FindIt.init()
    Scene.scene(
      { update: FindIt.update, view: FindIt.view },
      Scene.with(game),
      Scene.expect(Scene.text('Reset')).not.toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('ClickedReset preserves anyWins setting', () => {
    const game = { ...FindIt.init(), found: ['🎈'], anyWins: true }
    Story.story(
      FindIt.update,
      Story.with(game),
      Story.message(FindIt.ClickedReset()),
      Story.model((model) => {
        expect(model.anyWins).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })
})
