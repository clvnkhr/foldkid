import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import { multitouchClickStream } from '../../multitouch'
import { mountWhackEffects } from './effects'

import {
  ClickedHole,
  init,
  type Model,
  SoundPlayed,
  StartGame,
  Tick,
  update,
  view,
} from './main'

const resolvePop = [{ name: 'PlayPop' }, SoundPlayed()] as const
const resolveBoing = [{ name: 'PlayBoing' }, SoundPlayed()] as const
const resolveChime = [{ name: 'PlayChime' }, SoundPlayed()] as const
const resolveUhOh = [{ name: 'PlayUhOh' }, SoundPlayed()] as const
const resolveAscend = [{ name: 'PlayAscend' }, SoundPlayed()] as const
const resolveDescend = [{ name: 'PlayDescend' }, SoundPlayed()] as const
const resolveSwoosh = [{ name: 'PlaySwoosh' }, SoundPlayed()] as const

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

  it('scores native button activation and exposes the current mole type to hit effects', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
      holes: [1, 3, 0, 0, 0, 0, 0, 0, 0],
    }
    Scene.scene(
      { update, view },
      Scene.with(playing),
      Scene.Mount.resolve({ name: 'whackTimer' }, SoundPlayed()),
      Scene.expect(Scene.selector('.whack-score')).toHaveText('Score: 0'),
      Scene.expect(Scene.selector('[data-whack-index="0"]')).toHaveClass('whack-cell--up'),
      Scene.expect(Scene.selector('.whack-grid')).toHaveAttr('data-whack-tick', '30'),
      Scene.expect(Scene.selector('[data-whack-index="0"]')).toHaveAttr('data-whack-type', '1'),
      Scene.expect(Scene.selector('[data-whack-index="0"]')).not.toHaveHandler('pointerdown'),
      Scene.expect(Scene.selector('.whack-fx-burst')).toBeAbsent(),
      Scene.Command.expectNone(),
      Scene.click(Scene.role('button', { name: 'Hole 1' })),
      Scene.expect(Scene.selector('.whack-score')).toHaveText('Score: 1'),
      Scene.expect(Scene.selector('[data-whack-index="0"]')).not.toHaveClass('whack-cell--up'),
      Scene.expect(Scene.selector('[data-whack-index="0"]')).toHaveAttr('data-whack-type', '0'),
      Scene.Command.resolveAll(resolvePop),
      Scene.Command.expectNone(),
      // Native keyboard activation reaches this same click path without pointerdown.
      Scene.click(Scene.role('button', { name: 'Hole 2' })),
      Scene.expect(Scene.selector('.whack-score')).toHaveText('Score: 4'),
      Scene.Command.resolveAll(resolveChime),
      Scene.Command.expectNone(),
    )
  })

  it('whacking empty hole deducts 1', () => {
    const playing = {
      ...init,
      gameState: 'playing' as const,
    }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index: 0 })),
      Story.model((model) => {
        expect(model.score).toBe(-1)
      }),
      Story.Command.resolveAll(resolveSwoosh),
      Story.Command.expectNone(),
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

  it.each([-1, 0.5, NaN, Infinity])('ignores invalid hole index %s without effects or scoring', index => {
    const playing = { ...init, gameState: 'playing' as const, holes: [1, 0, 0, 0, 0, 0, 0, 0, 0] }
    Story.story(
      update,
      Story.with(playing),
      Story.message(ClickedHole({ index })),
      Story.model(model => expect(model).toBe(playing)),
      Story.Command.expectNone(),
    )
  })
})

describe('Whackamole effects with multitouch activation', () => {
  afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren() })

  it('bursts once per hit when two fingers release independently and suppresses compatibility clicks', async () => {
    const grid = document.createElement('div')
    grid.className = 'whack-grid'
    grid.dataset.whackTick = '30'
    grid.innerHTML = '<button class="whack-cell whack-cell--up" data-multitouch-click data-whack-index="0" data-whack-type="1"></button><button class="whack-cell whack-cell--up" data-multitouch-click data-whack-index="1" data-whack-type="3"></button>'
    document.body.appendChild(grid)
    const [first, second] = grid.querySelectorAll('button')
    if (!first || !second) throw new Error('missing mole buttons')
    vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 240, 320))
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 140))
    vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 0, 100, 140))
    vi.spyOn(document, 'elementFromPoint').mockImplementation(x => x < 100 ? first : second)
    const clicks: number[] = []
    let model: Model = { ...init, gameState: 'playing', holes: [1, 3, 0, 0, 0, 0, 0, 0, 0] }
    for (const button of [first, second]) button.addEventListener('click', () => {
      const index = Number(button.dataset.whackIndex)
      clicks.push(index)
      model = update(model, ClickedHole({ index }), true)[0]
      button.dataset.whackType = String(model.holes[index])
    })
    const touch = (type: string, target: HTMLButtonElement, identifier: number, clientX: number): void => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      const contact = { target, identifier, clientX, clientY: 40 }
      Object.defineProperty(event, 'changedTouches', { value: { length: 1, item: () => contact } })
      target.dispatchEvent(event)
    }
    const listener = vi.spyOn(grid, 'addEventListener')
    const fiber = Effect.runFork(Stream.runDrain(Stream.merge(multitouchClickStream(grid), mountWhackEffects(grid))))
    try {
      await vi.waitFor(() => expect(listener).toHaveBeenCalledWith('click', expect.any(Function), true))
      touch('touchstart', first, 11, 40)
      touch('touchstart', second, 12, 160)
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(0)
      touch('touchend', second, 12, 160)
      expect(clicks).toEqual([1])
      expect(model.score).toBe(3)
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(1)
      second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
      expect(clicks).toEqual([1])
      touch('touchend', first, 11, 40)
      expect(clicks).toEqual([1, 0])
      expect(model.score).toBe(4)
      expect(grid.querySelectorAll('.whack-fx-burst')).toHaveLength(2)
      expect(grid.querySelector('.whack-fx-layer')?.textContent).toBe('')
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
    expect(grid.querySelector('.whack-fx-layer')).toBeNull()
  })
})
