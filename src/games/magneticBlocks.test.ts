import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { componentColor, componentsFor, findClosestSnap, init, mountMagneticBlocks, RemoveBlock, removeBondsFor, snapTogether, SpawnBlocks, splitComponentAtBestBond, update } from './magneticBlocks'

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
    expect(Array.from({ length: 10 }, (_, index) => componentColor(index + 1))).toEqual([
      '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6',
      '#6366f1', '#a855f7', '#ec4899', '#94a3b8', '#f8fafc',
    ])
    expect(componentColor(11)).not.toBe(componentColor(1))
    expect(componentColor(18)).not.toBe(componentColor(8))
    expect(componentColor(100)).not.toBe(componentColor(10))
  })

  it('breaks only the bonds touching the fast-moving block', () => {
    expect(removeBondsFor([
      { a: 1, b: 2 },
      { a: 2, b: 3 },
      { a: 3, b: 4 },
    ], 2)).toEqual([{ a: 3, b: 4 }])
  })

  it('splits a connecting block into two collections instead of isolating it', () => {
    const line = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, x: 50 + index * 50, y: 100 }))
    const split = splitComponentAtBestBond(line, [
      { a: 1, b: 2 },
      { a: 2, b: 3 },
      { a: 3, b: 4 },
      { a: 4, b: 5 },
    ], 2, 0, 0)

    expect(split?.draggedIds).toEqual([1, 2])
    expect(componentsFor(line, split?.bonds ?? [])).toEqual([[1, 2], [3, 4, 5]])
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

  it('keeps snapping until every touching component has joined the moving shape', () => {
    const magneticBlocks = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 150, y: 100 },
      { id: 3, x: 200, y: 100 },
      { id: 4, x: 260, y: 100 },
      { id: 5, x: 160, y: 150 },
    ]
    const snapped = snapTogether(magneticBlocks, [{ a: 1, b: 2 }, { a: 2, b: 3 }], [1, 2, 3], 50, 20, { width: 400, height: 300 })

    expect(componentsFor(magneticBlocks, snapped.bonds)[0]).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]))
    expect(snapped.ids).toHaveLength(5)
  })

  it('creates initial blocks and adds another random batch when the spawn id changes', async () => {
    const board = document.createElement('div')
    board.setAttribute('data-magnetic-spawn-id', '0')
    board.setAttribute('data-magnetic-remove-id', '0')
    board.getBoundingClientRect = () => new DOMRect(0, 0, 620, 420)
    document.body.appendChild(board)

    const fiber = Effect.runFork(Stream.runDrain(mountMagneticBlocks(board)))
    await new Promise(resolve => setTimeout(resolve, 0))
    const initialCount = board.querySelectorAll('.magnetic-block').length
    board.setAttribute('data-magnetic-spawn-id', '1')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(initialCount).toBe(8)
    expect(board.querySelectorAll('.magnetic-block').length).toBeGreaterThan(initialCount)

    const afterSpawn = board.querySelectorAll('.magnetic-block').length
    board.setAttribute('data-magnetic-remove-id', '1')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(board.querySelectorAll('.magnetic-block').length).toBe(afterSpawn - 1)

    await Effect.runPromise(Fiber.interrupt(fiber))
    board.remove()
  })

  it('increments the spawn id through the game message', () => {
    expect(update(init, SpawnBlocks())[0]).toEqual({ spawnId: 1, removeId: 0 })
    expect(update(init, RemoveBlock())[0]).toEqual({ spawnId: 0, removeId: 1 })
  })
})
