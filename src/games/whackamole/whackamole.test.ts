import { describe, expect, it } from 'vitest'
import { Story } from 'foldkit'

import {
  ClickedHole,
  init,
  SoundPlayed,
  StartGame,
  Tick,
  update,
} from './main'

const resolvePop = [{ name: 'PlayPop' }, SoundPlayed()] as const
const resolveBoing = [{ name: 'PlayBoing' }, SoundPlayed()] as const
const resolveChime = [{ name: 'PlayChime' }, SoundPlayed()] as const
const resolveUhOh = [{ name: 'PlayUhOh' }, SoundPlayed()] as const
const resolveAscend = [{ name: 'PlayAscend' }, SoundPlayed()] as const
const resolveDescend = [{ name: 'PlayDescend' }, SoundPlayed()] as const

describe('Whackamole', () => {
  it('init state', () => {
    expect(init).toStrictEqual({
      score: 0,
      highScore: 0,
      timeLeft: 30,
      holes: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      gameState: 'idle',
    })
  })

  it('starts game', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(StartGame()),
      Story.model((model) => {
        expect(model.gameState).toBe('playing')
        expect(model.score).toBe(0)
        expect(model.timeLeft).toBe(30)
        const molesUp = model.holes.filter(h => h > 0).length
        expect(molesUp).toBeGreaterThanOrEqual(2)
        expect(molesUp).toBeLessThanOrEqual(4)
      }),
      Story.Command.resolveAll(resolveAscend),
      Story.Command.expectNone(),
    )
  })

  it('ticks decrements time', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
      timeLeft: 10,
      holes: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.timeLeft).toBe(9)
      }),
      Story.Command.expectNone(),
    )
  })

  it('ends game when time runs out', () => {
    const nearEnd = {
      ...init,
      timeLeft: 1,
      gameState: 'playing' as const,
      holes: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      score: 5,
    }
    Story.story(
      update,
      Story.with(nearEnd),
      Story.message(Tick()),
      Story.model((model) => {
        expect(model.gameState).toBe('ended')
        expect(model.timeLeft).toBe(0)
        expect(model.holes.every(h => h === 0)).toBe(true)
        expect(model.highScore).toBe(5)
      }),
      Story.Command.resolveAll(resolveDescend),
      Story.Command.expectNone(),
    )
  })

  it('whacks a mole', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
      holes: [1, 0, 1, 0, 0, 0, 0, 0, 0],
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(1)
        expect(model.holes[0]).toBe(0)
      }),
      Story.Command.resolveAll(resolvePop),
      Story.Command.expectNone(),
    )
  })

  it('whacking empty hole does nothing', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(0)
      }),
    )
  })

  it('whacking ignores during idle', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(0)
        expect(model.gameState).toBe('idle')
      }),
    )
  })

  it('whacking ignores during ended', () => {
    const ended = {
      ...init,
      gameState: 'ended' as const,
      score: 3,
    }
    Story.story(
      update,
      Story.with(ended),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(3)
      }),
    )
  })

  it('whacking golden mole gives +3', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
      holes: [3, 0, 0, 0, 0, 0, 0, 0, 0],
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(3)
        expect(model.holes[0]).toBe(0)
      }),
      Story.Command.resolveAll(resolveChime),
      Story.Command.expectNone(),
    )
  })

  it('whacking damsel mole gives -3', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
      holes: [4, 0, 0, 0, 0, 0, 0, 0, 0],
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(-3)
        expect(model.holes[0]).toBe(0)
      }),
      Story.Command.resolveAll(resolveUhOh),
      Story.Command.expectNone(),
    )
  })

  it('whacking angry mole gives +2', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
      holes: [2, 0, 0, 0, 0, 0, 0, 0, 0],
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(2)
        expect(model.holes[0]).toBe(0)
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('whacking out of range index is ignored', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
      holes: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index: 99 })),
      Story.model((model) => {
        expect(model.score).toBe(0)
        expect(model.holes[0]).toBe(1)
      }),
    )
  })
})
