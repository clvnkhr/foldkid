import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'

import { ClickedTile, init, ShowTile, SoundPlayed, StartGame, StartPlaying, update, view } from './main'

const resolveAscend = [{ name: 'PlayAscend' }, SoundPlayed()] as const
const resolveDescend = [{ name: 'PlayDescend' }, SoundPlayed()] as const
const resolveCorrect = [{ name: 'PlayCorrect' }, SoundPlayed()] as const
const resolveTile0 = [{ name: 'PlayTile0' }, SoundPlayed()] as const
const resolveTile1 = [{ name: 'PlayTile1' }, SoundPlayed()] as const
const resolveTile2 = [{ name: 'PlayTile2' }, SoundPlayed()] as const

const showingWithSeq = (seq: number[], showIdx = -1) => ({
  ...init,
  sequence: seq,
  showIndex: showIdx,
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
      gameState: 'idle',
      playerIndex: 0,
      wrongTile: -1,
    })
  })

  it('starts game with 3-tile sequence in showing state', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(StartGame()),
      Story.model((model) => {
        expect(model.gameState).toBe('showing')
        expect(model.sequence).toHaveLength(3)
        expect(model.score).toBe(0)
        for (const idx of model.sequence) {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(4)
        }
      }),
      Story.Command.resolveAll(
        resolveAscend,
        [{ name: 'ShowTile0' }, ShowTile({ idx: 0 })],
        [{ name: 'ShowTile1' }, ShowTile({ idx: 1 })],
        [{ name: 'ShowTile2' }, ShowTile({ idx: 2 })],
        [{ name: 'StartPlaying' }, StartPlaying()],
      ),
      Story.Command.expectNone(),
    )
  })

  it('showTile updates showIndex', () => {
    const show = showingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(show),
      Story.message(ShowTile({ idx: 1 })),
      Story.model((model) => {
        expect(model.showIndex).toBe(1)
        expect(model.gameState).toBe('showing')
      }),
      Story.Command.expectNone(),
    )
  })

  it('showTile ignored if not showing', () => {
    const play = playingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(play),
      Story.message(ShowTile({ idx: 1 })),
      Story.model((model) => {
        expect(model.showIndex).toBe(-1)
      }),
      Story.Command.expectNone(),
    )
  })

  it('startPlaying transitions to playing', () => {
    const show = showingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(show),
      Story.message(StartPlaying()),
      Story.model((model) => {
        expect(model.gameState).toBe('playing')
        expect(model.showIndex).toBe(-1)
        expect(model.playerIndex).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('startPlaying ignored if not showing', () => {
    const play = playingWithSeq([0, 1, 2])
    Story.story(
      update,
      Story.with(play),
      Story.message(StartPlaying()),
      Story.model((model) => {
        expect(model.gameState).toBe('playing')
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

  it('registers a mouse pointer-up on a tile', () => {
    const play = playingWithSeq([0, 1, 2])
    Scene.scene(
      { update, view },
      Scene.with(play),
      Scene.pointerUp(Scene.selector('.pat-tile--0'), { pointerType: 'mouse' }),
      Scene.expect(Scene.selector('.pat-dot--filled')).toExist(),
      Scene.Command.resolveAll(resolveTile0),
      Scene.Command.expectNone(),
    )
  })

  it('processes consecutive taps without delay between them', () => {
    const play = playingWithSeq([0, 1, 0])
    Story.story(
      update,
      Story.with(play),
      Story.message(ClickedTile({ index: 0 })),
      Story.model((model) => {
        expect(model.playerIndex).toBe(1)
        expect(model.gameState).toBe('playing')
      }),
      Story.Command.resolveAll(resolveTile0),
      Story.message(ClickedTile({ index: 1 })),
      Story.model((model) => {
        expect(model.playerIndex).toBe(2)
        expect(model.gameState).toBe('playing')
      }),
      Story.Command.resolveAll(resolveTile1),
      Story.Command.expectNone(),
    )
  })

  it('completing sequence adds tile and starts showing', () => {
    const play = playingWithSeq([0, 1], 1)
    Story.story(
      update,
      Story.with(play),
      Story.message(ClickedTile({ index: 1 })),
      Story.model((model) => {
        expect(model.gameState).toBe('showing')
        expect(model.sequence).toHaveLength(3)
        expect(model.score).toBe(1)
        expect(model.sequence[0]).toBe(0)
        expect(model.sequence[1]).toBe(1)
      }),
      Story.Command.resolveAll(
        resolveCorrect,
        [{ name: 'ShowTile0' }, ShowTile({ idx: 0 })],
        [{ name: 'ShowTile1' }, ShowTile({ idx: 1 })],
        [{ name: 'ShowTile2' }, ShowTile({ idx: 2 })],
        [{ name: 'StartPlaying' }, StartPlaying()],
      ),
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
    const show = showingWithSeq([0, 1, 2])
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
      Story.Command.resolveAll(
        resolveAscend,
        [{ name: 'ShowTile0' }, ShowTile({ idx: 0 })],
        [{ name: 'ShowTile1' }, ShowTile({ idx: 1 })],
        [{ name: 'ShowTile2' }, ShowTile({ idx: 2 })],
        [{ name: 'StartPlaying' }, StartPlaying()],
      ),
      Story.Command.expectNone(),
    )
  })

  it('end to start produces showing state with high score', () => {
    const ended = { ...init, gameState: 'ended' as const, highScore: 5 }
    Story.story(
      update,
      Story.with(ended),
      Story.message(StartGame()),
      Story.model((model) => {
        expect(model.gameState).toBe('showing')
        expect(model.highScore).toBe(5)
        expect(model.score).toBe(0)
      }),
      Story.Command.resolveAll(
        resolveAscend,
        [{ name: 'ShowTile0' }, ShowTile({ idx: 0 })],
        [{ name: 'ShowTile1' }, ShowTile({ idx: 1 })],
        [{ name: 'ShowTile2' }, ShowTile({ idx: 2 })],
        [{ name: 'StartPlaying' }, StartPlaying()],
      ),
      Story.Command.expectNone(),
    )
  })
})
