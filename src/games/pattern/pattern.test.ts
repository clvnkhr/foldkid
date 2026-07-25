import { describe, expect, it } from 'vitest'
import { Story } from 'foldkit'

import { ClickedTile, init, SoundPlayed, StartGame, Tick, update } from './main'

const resolveTile0 = [{ name: 'PlayTile0' }, SoundPlayed()] as const
const resolveTile1 = [{ name: 'PlayTile1' }, SoundPlayed()] as const
const resolveTile2 = [{ name: 'PlayTile2' }, SoundPlayed()] as const
const resolveTile3 = [{ name: 'PlayTile3' }, SoundPlayed()] as const
const resolveAscend = [{ name: 'PlayAscend' }, SoundPlayed()] as const
const resolveDescend = [{ name: 'PlayDescend' }, SoundPlayed()] as const
const resolveCorrect = [{ name: 'PlayCorrect' }, SoundPlayed()] as const

const showingWithSeq = (seq: number[], showIdx = 0, waitTicks = 0) => ({
  ...init,
  sequence: seq,
  showIndex: showIdx,
  waitTicks,
  gameState: 'showing' as const,
})

const playingWithSeq = (seq: number[], playerIdx = 0) => ({
  ...init,
  sequence: seq,
  gameState: 'playing' as const,
  playerIndex: playerIdx,
})

describe('Pattern', () => {
  it('init state', () => {
    expect(init).toStrictEqual({
      score: 0,
      highScore: 0,
      sequence: [],
      showIndex: -1,
      waitTicks: 0,
      gameState: 'idle',
      playerIndex: 0,
      wrongTile: -1,
    })
  })

  it('starts game with 3-tile sequence and wait ticks', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(StartGame()),
      Story.model((model) => {
        expect(model.gameState).toBe('showing')
        expect(model.sequence).toHaveLength(3)
        expect(model.showIndex).toBe(0)
        expect(model.waitTicks).toBe(1)
        expect(model.score).toBe(0)
        for (const idx of model.sequence) {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(4)
        }
      }),
      Story.Command.resolveAll(resolveAscend),
      Story.Command.expectNone(),
    )
  })

  it('waits before showing first tile', () => {
    const show = showingWithSeq([0, 1, 2], 0, 1)
    Story.story(
      update,
      Story.with(show),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.waitTicks).toBe(0)
        expect(model.showIndex).toBe(0)
        expect(model.gameState).toBe('showing')
      }),
      Story.Command.expectNone(),
    )
  })

  it('shows first tile after wait', () => {
    const show = showingWithSeq([0, 1, 2], 0, 0)
    Story.story(
      update,
      Story.with(show),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.showIndex).toBe(1)
        expect(model.gameState).toBe('showing')
      }),
      Story.Command.resolveAll(resolveTile0),
      Story.Command.expectNone(),
    )
  })

  it('shows first tile on first tick', () => {
    const show = showingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(show),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.showIndex).toBe(1)
        expect(model.gameState).toBe('showing')
      }),
      Story.Command.resolveAll(resolveTile0),
      Story.Command.expectNone(),
    )
  })

  it('shows second tile on second tick', () => {
    const show = showingWithSeq([0, 1, 2], 1, 0)
    Story.story(
      update,
      Story.with(show),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.showIndex).toBe(2)
        expect(model.gameState).toBe('showing')
      }),
      Story.Command.resolveAll(resolveTile1),
      Story.Command.expectNone(),
    )
  })

  it('transitions to playing after showing all tiles', () => {
    const show = showingWithSeq([0, 1, 2], 3, 0)
    Story.story(
      update,
      Story.with(show),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.gameState).toBe('playing')
        expect(model.showIndex).toBe(-1)
        expect(model.playerIndex).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('correct tile tap advances playerIndex', () => {
    const play = playingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(play),
      Story.message(ClickedTile({ index: 0 })),
      Story.model((model) => {
        expect(model.playerIndex).toBe(1)
        expect(model.gameState).toBe('playing')
      }),
      Story.Command.resolveAll(resolveTile0),
      Story.Command.expectNone(),
    )
  })

  it('completing sequence adds tile and waits before showing', () => {
    const play = playingWithSeq([0, 1], 1)
    Story.story(
      update,
      Story.with(play),
      Story.message(ClickedTile({ index: 1 })),
      Story.model((model) => {
        expect(model.gameState).toBe('showing')
        expect(model.showIndex).toBe(0)
        expect(model.waitTicks).toBe(1)
        expect(model.sequence).toHaveLength(3)
        expect(model.score).toBe(1)
        expect(model.sequence[0]).toBe(0)
        expect(model.sequence[1]).toBe(1)
      }),
      Story.Command.resolveAll(resolveCorrect),
      Story.Command.expectNone(),
    )
  })

  it('wrong tile ends the game', () => {
    const play = playingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(play),
      Story.message(ClickedTile({ index: 1 })),
      Story.model((model) => {
        expect(model.gameState).toBe('ended')
        expect(model.wrongTile).toBe(1)
      }),
      Story.Command.resolveAll(resolveDescend),
      Story.Command.expectNone(),
    )
  })

  it('ignores tick when idle', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.gameState).toBe('idle')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ignores click when idle', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedTile({ index: 0 })),
      Story.model((model) => {
        expect(model.gameState).toBe('idle')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ignores click when showing', () => {
    const show = showingWithSeq([0, 1, 2], 0, 0)
    Story.story(
      update,
      Story.with(show),
      Story.message(ClickedTile({ index: 0 })),
      Story.model((model) => {
        expect(model.gameState).toBe('showing')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ignores out of range index', () => {
    const play = playingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(play),
      Story.message(ClickedTile({ index: 99 })),
      Story.model((model) => {
        expect(model.gameState).toBe('playing')
        expect(model.playerIndex).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('correct tile plays tile sound', () => {
    const play = playingWithSeq([2, 0, 1])
    Story.story(
      update,
      Story.with(play),
      Story.message(ClickedTile({ index: 2 })),
      Story.model((model) => {
        expect(model.playerIndex).toBe(1)
      }),
      Story.Command.resolveAll(resolveTile2),
      Story.Command.expectNone(),
    )
  })

  it('preserves high score', () => {
    const played = { ...init, highScore: 3 }
    Story.story(
      update,
      Story.with(played),
      Story.message(StartGame()),
      Story.model((model) => {
        expect(model.highScore).toBe(3)
      }),
      Story.Command.resolveAll(resolveAscend),
      Story.Command.expectNone(),
    )
  })

  it('starts from init and reaches playing after enough ticks', () => {
    let seq: number[] = []
    Story.story(
      update,
      Story.with(init),
      Story.message(StartGame()),
      Story.model(m => {
        seq = [...m.sequence]
        expect(seq).toHaveLength(3)
      }),
      Story.Command.resolveAll(resolveAscend),
      Story.Command.expectNone(),
      Story.message(Tick()),
      Story.model(m => expect(m.waitTicks).toBe(0)),
      Story.Command.expectNone(),
      Story.message(Tick()),
      Story.model(m => expect(m.showIndex).toBe(1)),
      Story.Command.resolveAll(resolveTile0, resolveTile1, resolveTile2, resolveTile3),
      Story.Command.expectNone(),
      Story.message(Tick()),
      Story.model(m => expect(m.showIndex).toBe(2)),
      Story.Command.resolveAll(resolveTile0, resolveTile1, resolveTile2, resolveTile3),
      Story.Command.expectNone(),
      Story.message(Tick()),
      Story.model(m => expect(m.showIndex).toBe(3)),
      Story.Command.resolveAll(resolveTile0, resolveTile1, resolveTile2, resolveTile3),
      Story.Command.expectNone(),
      Story.message(Tick()),
      Story.model(m => {
        expect(m.gameState).toBe('playing')
        expect(m.showIndex).toBe(-1)
      }),
      Story.Command.expectNone(),
    )
  })
})
