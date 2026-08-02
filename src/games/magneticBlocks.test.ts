import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { componentColor, componentsFor, findClosestSnap, init, mountMagneticBlocks, removeBondsFor, SpawnBlocks, update } from './magneticBlocks'

describe('Magnetic Blocks', () => {
  const blocks = [
    { id: 1, x: 60, y: 60 },
    { id: 2, x: 110, y: 60 },
    { id: 3, x: 160, y: 60 },
    { id: 4, x: 60, y: 160 },
  ]

  it('groups every block joined by a chain of magnetic bonds', () => {
    expect(componentsFor(blocks, [{ a: 1, b: 2 }, { a: 2, b: 3 }])).toEqual([
      [1, 2, 3],
      [4],
    ])
  })

  it('uses a colour based on the component size', () => {
    expect(componentColor(1)).not.toBe(componentColor(2))
    expect(componentColor(2)).not.toBe(componentColor(3))
    expect(componentColor(100)).toBe(componentColor(8))
  })

  it('breaks only the bonds touching the fast-moving block', () => {
    expect(removeBondsFor([
      { a: 1, b: 2 },
      { a: 2, b: 3 },
      { a: 3, b: 4 },
    ], 2)).toEqual([{ a: 3, b: 4 }])
  })

  it('finds the nearest edge-to-edge snap and returns its joining bond', () => {
    const snap = findClosestSnap([
      { id: 1, x: 72, y: 100 },
      { id: 2, x: 150, y: 100 },
    ], [1], 50, 30, { width: 300, height: 250 })

    expect(snap).toMatchObject({
      dx: 28,
      dy: 0,
      bond: { a: 1, b: 2 },
    })
  })

  it('does not snap when the closest edge is too far away', () => {
    const snap = findClosestSnap([
      { id: 1, x: 60, y: 100 },
      { id: 2, x: 180, y: 100 },
    ], [1], 50, 30, { width: 300, height: 250 })

    expect(snap).toBeUndefined()
  })

  it('creates initial blocks and adds another random batch when the spawn id changes', async () => {
    const board = document.createElement('div')
    board.setAttribute('data-magnetic-spawn-id', '0')
    board.getBoundingClientRect = () => new DOMRect(0, 0, 620, 420)
    document.body.appendChild(board)

    const fiber = Effect.runFork(Stream.runDrain(mountMagneticBlocks(board)))
    await new Promise(resolve => setTimeout(resolve, 0))
    const initialCount = board.querySelectorAll('.magnetic-block').length
    board.setAttribute('data-magnetic-spawn-id', '1')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(initialCount).toBe(8)
    expect(board.querySelectorAll('.magnetic-block').length).toBeGreaterThan(initialCount)

    await Effect.runPromise(Fiber.interrupt(fiber))
    board.remove()
  })

  it('increments the spawn id through the game message', () => {
    expect(update(init, SpawnBlocks())[0]).toEqual({ spawnId: 1 })
  })
})
