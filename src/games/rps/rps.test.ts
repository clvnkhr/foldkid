import { describe, expect, it } from 'vitest'
import { Story } from 'foldkit'

import {
  init,
  Picked,
  SetGigaChad,
  SoundPlayed,
  StartGame,
  update,
} from './main'

const resolveChime = [{ name: 'PlayChime' }, SoundPlayed()] as const
const resolveBoing = [{ name: 'PlayBoing' }, SoundPlayed()] as const
const resolveClick = [{ name: 'PlayClick' }, SoundPlayed()] as const

describe('RPS', () => {
  it('init state', () => {
    expect(init).toStrictEqual({
      playerChoice: null,
      computerChoice: null,
      result: null,
      wins: 0,
      losses: 0,
      ties: 0,
      playerHistory: [],
      prediction: null,
      gigaChad: false,
    })
  })

  // ── Normal AI (frequency-based) ──

  it('first pick: AI predicts rock, plays paper', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(Picked({ choice: 'rock' })),
      Story.model((model) => {
        expect(model.playerChoice).toBe('rock')
        expect(model.computerChoice).toBe('paper')
        expect(model.result).toBe('lose')
        expect(model.prediction).toBe('rock')
        expect(model.playerHistory).toEqual(['rock'])
        expect(model.gigaChad).toBe(false)
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('predicts player most frequent choice', () => {
    const played = { ...init, playerHistory: ['rock', 'rock', 'paper'] as ('rock' | 'paper' | 'scissors')[] }
    Story.story(
      update,
      Story.with(played),
      Story.message(Picked({ choice: 'scissors' })),
      Story.model((model) => {
        expect(model.prediction).toBe('rock')
        expect(model.computerChoice).toBe('paper')
        expect(model.result).toBe('win')
      }),
      Story.Command.resolveAll(resolveChime),
      Story.Command.expectNone(),
    )
  })

  it('switches prediction when player changes pattern', () => {
    const played = { ...init, playerHistory: ['rock', 'rock', 'paper', 'paper', 'paper'] as ('rock' | 'paper' | 'scissors')[] }
    Story.story(
      update,
      Story.with(played),
      Story.message(Picked({ choice: 'paper' })),
      Story.model((model) => {
        expect(model.prediction).toBe('paper')
        expect(model.computerChoice).toBe('scissors')
        expect(model.result).toBe('lose')
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('picks work back to back', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(Picked({ choice: 'rock' })),
      Story.Command.resolveAll(resolveBoing),
      Story.message(Picked({ choice: 'rock' })),
      Story.model((model) => {
        expect(model.playerHistory).toEqual(['rock', 'rock'])
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('tracks score across consecutive picks', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(Picked({ choice: 'scissors' })),
      Story.Command.resolveAll(resolveChime),
      Story.message(Picked({ choice: 'scissors' })),
      Story.Command.resolveAll(resolveBoing),
      Story.model((model) => {
        expect(model.wins).toBe(1)
        expect(model.losses).toBe(1)
        expect(model.ties).toBe(0)
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('three way tie rock vs rock', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(Picked({ choice: 'paper' })),
      Story.model((model) => {
        expect(model.playerChoice).toBe('paper')
        expect(model.computerChoice).toBe('paper')
        expect(model.result).toBe('tie')
        expect(model.ties).toBe(1)
      }),
      Story.Command.resolveAll(resolveClick),
      Story.Command.expectNone(),
    )
  })

  it('start game resets everything', () => {
    const played = {
      ...init,
      wins: 5,
      losses: 3,
      ties: 2,
      playerChoice: 'rock' as const,
      computerChoice: 'paper' as const,
      result: 'lose' as const,
      playerHistory: ['rock', 'scissors', 'paper'] as ('rock' | 'paper' | 'scissors')[],
      prediction: 'rock' as const,
    }
    Story.story(
      update,
      Story.with(played),
      Story.message(StartGame()),
      Story.model((model) => {
        expect(model).toStrictEqual(init)
      }),
      Story.Command.expectNone(),
    )
  })

  // ── SetGigaChad ──

  it('set giga chad toggles the flag', () => {
    Story.story(
      update,
      Story.with(init),
      Story.message(SetGigaChad({ value: true })),
      Story.model((model) => {
        expect(model.gigaChad).toBe(true)
      }),
      Story.Command.expectNone(),
    )
  })

  it('set giga chad can turn off', () => {
    Story.story(
      update,
      Story.with({ ...init, gigaChad: true }),
      Story.message(SetGigaChad({ value: false })),
      Story.model((model) => {
        expect(model.gigaChad).toBe(false)
      }),
      Story.Command.expectNone(),
    )
  })

  // ── Giga Chad AI (Markov chain) ──

  it('giga chad detects 2-move pattern via order-2 Markov', () => {
    const played = {
      ...init,
      gigaChad: true,
      playerHistory: ['rock', 'paper', 'rock', 'paper'] as ('rock' | 'paper' | 'scissors')[],
    }
    Story.story(
      update,
      Story.with(played),
      Story.message(Picked({ choice: 'rock' })),
      Story.model((model) => {
        expect(model.prediction).toBe('rock')
        expect(model.computerChoice).toBe('paper')
        expect(model.result).toBe('lose')
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('giga chad uses order-2 when order-3 has no match', () => {
    const played = {
      ...init,
      gigaChad: true,
      playerHistory: ['rock', 'paper', 'scissors', 'rock', 'paper'] as ('rock' | 'paper' | 'scissors')[],
    }
    Story.story(
      update,
      Story.with(played),
      Story.message(Picked({ choice: 'scissors' })),
      Story.model((model) => {
        expect(model.prediction).toBe('scissors')
        expect(model.computerChoice).toBe('rock')
        expect(model.result).toBe('lose')
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('giga chad uses order-1 when order-2 has no match', () => {
    const played = {
      ...init,
      gigaChad: true,
      playerHistory: ['rock'] as ('rock' | 'paper' | 'scissors')[],
    }
    Story.story(
      update,
      Story.with(played),
      Story.message(Picked({ choice: 'rock' })),
      Story.model((model) => {
        expect(model.prediction).toBe('rock')
        expect(model.computerChoice).toBe('paper')
        expect(model.result).toBe('lose')
      }),
      Story.Command.resolveAll(resolveBoing),
      Story.Command.expectNone(),
    )
  })

  it('giga chad falls back to frequency when no Markov match at any order', () => {
    const played = {
      ...init,
      gigaChad: true,
      playerHistory: ['rock', 'paper', 'scissors'] as ('rock' | 'paper' | 'scissors')[],
    }
    Story.story(
      update,
      Story.with(played),
      Story.message(Picked({ choice: 'paper' })),
      Story.model((model) => {
        expect(model.prediction).toBe('rock')
        expect(model.computerChoice).toBe('paper')
        expect(model.result).toBe('tie')
      }),
      Story.Command.resolveAll(resolveClick),
      Story.Command.expectNone(),
    )
  })
})
