import { Effect, Fiber, Stream } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import { arithmeticExpressionForSpeech } from '../arithmeticSpeech'
import { blockFillColor, componentColor, componentOutlineColor, componentsFor, DEFAULT_BREAK_SPEED, findClosestSnap, findOverlapSnap, init, joinEquation, labelPlacementFor, mountMagneticBlocks, RemoveBlock, removeBondsFor, SetBreakSpeed, snapTogether, SpawnBlocks, splitComponentAtBestBond, splitEquation, update } from './magneticBlocks'

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

  it('makes seven-block collections rainbow and outlines each tens group by its leading digit', () => {
    expect(Array.from({ length: 7 }, (_, index) => blockFillColor(7, index))).toEqual([
      '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#6366f1', '#a855f7',
    ])
    expect(blockFillColor(6, 3)).toBe(componentColor(6))
    expect(componentOutlineColor(10)).toBe('#ef4444')
    expect(componentOutlineColor(19)).toBe('#ef4444')
    expect(componentOutlineColor(20)).toBe('#f97316')
    expect(componentOutlineColor(99)).toBe('#94a3b8')
    expect(componentOutlineColor(9)).toBeUndefined()
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

  it('always separates and joins overlapping blocks even outside the normal snap distance', () => {
    const overlapping = [
      { id: 1, x: 130, y: 100 },
      { id: 2, x: 150, y: 100 },
    ]
    const snapped = snapTogether(overlapping, [], [1], 50, 0, { width: 300, height: 250 })

    expect(snapped.ids).toHaveLength(2)
    expect(snapped.joins).toEqual([{ left: 1, right: 1, total: 2 }])
    expect(overlapping[0]).toMatchObject({ x: 100, y: 100 })
    expect(Math.abs(overlapping[0]!.x - overlapping[1]!.x) === 50
      || Math.abs(overlapping[0]!.y - overlapping[1]!.y) === 50).toBe(true)
    expect(Math.abs(overlapping[0]!.x - overlapping[1]!.x) < 50
      && Math.abs(overlapping[0]!.y - overlapping[1]!.y) < 50).toBe(false)
  })

  it('only ejects the held unit above 50% coverage and chooses its closest boundary edge', () => {
    expect(findOverlapSnap([
      { id: 1, x: 125, y: 100 },
      { id: 2, x: 150, y: 100 },
    ], [], [1], 50, { width: 300, height: 220 }, 1)).toBeUndefined()

    expect(findOverlapSnap([
      { id: 1, x: 126, y: 100 },
      { id: 2, x: 150, y: 100 },
    ], [], [1], 50, { width: 300, height: 220 }, 1)).toMatchObject({
      dx: -26,
      dy: 0,
      bond: { a: 1, b: 2 },
    })
  })

  it('does not eject a component when an unheld unit is covered', () => {
    const magneticBlocks = [
      { id: 1, x: 50, y: 100 },
      { id: 2, x: 100, y: 100 },
      { id: 3, x: 120, y: 100 },
    ]
    const bonds = [{ a: 1, b: 2 }]

    expect(findOverlapSnap(magneticBlocks, bonds, [1, 2], 50, { width: 300, height: 220 }, 1)).toBeUndefined()
    expect(findOverlapSnap(magneticBlocks, bonds, [1, 2], 50, { width: 300, height: 220 }, 2)).toBeDefined()
  })

  it('keeps a dropped unit block between two near-aligned unit blocks and joins all three', () => {
    const magneticBlocks = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 195, y: 102 },
      { id: 3, x: 148, y: 101 },
    ]
    const snapped = snapTogether(magneticBlocks, [], [3], 50, 23, { width: 300, height: 220 })

    expect(snapped.ids).toHaveLength(3)
    expect(magneticBlocks).toEqual([
      { id: 1, x: 98, y: 101 },
      { id: 2, x: 198, y: 101 },
      { id: 3, x: 148, y: 101 },
    ])
    expect(snapped.summands).toEqual([1, 1, 1])
  })

  it('perturbs whole joining components to bridge a two-plus-one-plus-one row', () => {
    const magneticBlocks = [
      { id: 1, x: 50, y: 100 },
      { id: 2, x: 100, y: 100 },
      { id: 3, x: 195, y: 102 },
      { id: 4, x: 148, y: 101 },
    ]
    const snapped = snapTogether(magneticBlocks, [{ a: 1, b: 2 }], [4], 50, 23, { width: 300, height: 220 })

    expect(snapped.ids).toHaveLength(4)
    expect(magneticBlocks).toEqual([
      { id: 1, x: 48, y: 101 },
      { id: 2, x: 98, y: 101 },
      { id: 3, x: 198, y: 101 },
      { id: 4, x: 148, y: 101 },
    ])
    expect(snapped.summands).toEqual([2, 1, 1])
  })

  it('does not eject a block from an empty enclosed space when it is not covered', () => {
    const ring = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 150, y: 100 },
      { id: 3, x: 200, y: 100 },
      { id: 4, x: 200, y: 150 },
      { id: 5, x: 200, y: 200 },
      { id: 6, x: 150, y: 200 },
      { id: 7, x: 100, y: 200 },
      { id: 8, x: 100, y: 150 },
      { id: 9, x: 150, y: 150 },
    ]
    const ringBonds = [
      { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 5 },
      { a: 5, b: 6 }, { a: 6, b: 7 }, { a: 7, b: 8 }, { a: 8, b: 1 },
    ]
    const snapped = snapTogether(ring, ringBonds, [9], 50, 0, { width: 350, height: 300 })
    const moved = ring.find(block => block.id === 9)!

    expect(snapped.ids).toHaveLength(9)
    expect(snapped.joins).toEqual([{ left: 1, right: 8, total: 9 }])
    expect(moved).toMatchObject({ x: 150, y: 150 })
    expect(ring.slice(0, 8).some(block =>
      (Math.abs(moved.x - block.x) === 50 && moved.y === block.y)
      || (Math.abs(moved.y - block.y) === 50 && moved.x === block.x))).toBe(true)
    expect(ring.slice(0, 8).every(block =>
      Math.abs(moved.x - block.x) >= 50 || Math.abs(moved.y - block.y) >= 50)).toBe(true)
  })

  it('keeps unusual attachments near an odd component boundary in place', () => {
    const hook = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 150, y: 100 },
      { id: 3, x: 200, y: 100 },
      { id: 4, x: 200, y: 150 },
      { id: 5, x: 200, y: 200 },
      { id: 6, x: 100, y: 150 },
    ]
    const snapped = snapTogether(hook, [
      { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }, { a: 4, b: 5 },
    ], [6], 50, 5, { width: 350, height: 300 })

    expect(hook[5]).toMatchObject({ x: 100, y: 150 })
    expect(snapped.joins).toEqual([{ left: 1, right: 5, total: 6 }])
  })

  it('allows a one-block attachment deep inside an open C-shaped well', () => {
    const deepC = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 150, y: 100 },
      { id: 3, x: 200, y: 100 },
      { id: 4, x: 250, y: 100 },
      { id: 5, x: 100, y: 150 },
      { id: 6, x: 100, y: 200 },
      { id: 7, x: 100, y: 250 },
      { id: 8, x: 100, y: 300 },
      { id: 9, x: 150, y: 300 },
      { id: 10, x: 200, y: 300 },
      { id: 11, x: 250, y: 300 },
      { id: 12, x: 150, y: 200 },
    ]
    const snapped = snapTogether(deepC, [
      { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 },
      { a: 1, b: 5 }, { a: 5, b: 6 }, { a: 6, b: 7 }, { a: 7, b: 8 },
      { a: 8, b: 9 }, { a: 9, b: 10 }, { a: 10, b: 11 },
    ], [12], 50, 5, { width: 400, height: 400 })

    expect(deepC[11]).toMatchObject({ x: 150, y: 200 })
    expect(snapped.joins).toEqual([{ left: 1, right: 11, total: 12 }])
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
    expect(snapped.joins).toEqual([
      { left: 3, right: 1, total: 4 },
      { left: 4, right: 1, total: 5 },
    ])
    expect(snapped.summands).toEqual([3, 1, 1])
  })

  it('orders up to four cascade summands by top-to-bottom, left-to-right screen position', () => {
    const magneticBlocks = [
      { id: 40, x: 250, y: 150 },
      { id: 11, x: 250, y: 100 }, { id: 12, x: 250, y: 50 },
      { id: 21, x: 200, y: 150 }, { id: 22, x: 150, y: 150 }, { id: 23, x: 100, y: 150 },
      { id: 31, x: 300, y: 150 }, { id: 32, x: 350, y: 150 }, { id: 33, x: 400, y: 150 }, { id: 34, x: 450, y: 150 },
    ]
    const snapped = snapTogether(magneticBlocks, [
      { a: 11, b: 12 },
      { a: 21, b: 22 }, { a: 22, b: 23 },
      { a: 31, b: 32 }, { a: 32, b: 33 }, { a: 33, b: 34 },
    ], [40], 50, 1, { width: 550, height: 300 })

    expect(snapped.summands).toEqual([2, 3, 1, 4])
    expect(joinEquation(snapped.summands)).toBe('2+3+1+4=10')
  })

  it('formats component-size arithmetic for joins and splits', () => {
    expect(joinEquation([3, 2])).toBe('3+2=5')
    expect(joinEquation([1, 1, 1])).toBe('1+1+1=3')
    expect(joinEquation([1, 2, 3, 4])).toBe('1+2+3+4=10')
    expect(splitEquation(5, 2)).toBe('5-2=3')
  })

  it('spells out arithmetic operators so speech voices do not skip minus', () => {
    expect(arithmeticExpressionForSpeech(joinEquation([3, 2]))).toBe('3 plus 2 equals 5')
    expect(arithmeticExpressionForSpeech(splitEquation(3, 1))).toBe('3 minus 1 equals 2')
    expect(arithmeticExpressionForSpeech(splitEquation(3, 1), 'fr')).toBe('3 moins 1 égal 2')
  })

  it('keeps a collection label on its outer boundary corner as blocks are added', () => {
    const pair = [
      { id: 1, x: 100, y: 100 },
      { id: 2, x: 150, y: 100 },
    ]
    const firstPlacement = labelPlacementFor(pair, [1, 2], 50)
    expect(firstPlacement).toEqual({ id: 1, corner: 'top-left' })

    const grown = [...pair, { id: 3, x: 200, y: 100 }]
    expect(labelPlacementFor(grown, [1, 2, 3], 50, firstPlacement)).toEqual(firstPlacement)
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
    expect([...board.querySelectorAll('.magnetic-block-count')].map(el => el.textContent)).toEqual(new Array(initialCount).fill('1'))
    expect(board.querySelectorAll('.magnetic-block-face--visible')).toHaveLength(initialCount)
    expect(board.querySelectorAll('.magnetic-block-eye-white')).toHaveLength(initialCount * 2)
    expect(board.querySelectorAll('.magnetic-block-eye-pupil')).toHaveLength(initialCount * 2)
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

  it('speaks one cascade equation and announces a later split immediately', async () => {
    const originalSpeechSynthesis = globalThis.speechSynthesis
    const originalUtterance = globalThis.SpeechSynthesisUtterance
    const spoken: string[] = []
    globalThis.speechSynthesis = {
      cancel: () => {},
      getVoices: () => [],
      resume: () => {},
      speak: (utterance: SpeechSynthesisUtterance) => { spoken.push(utterance.text) },
    } as unknown as SpeechSynthesis
    globalThis.SpeechSynthesisUtterance = class MockUtterance {
      text: string
      rate = 1
      pitch = 1
      lang = 'en'
      voice: SpeechSynthesisVoice | null = null
      constructor(text: string) { this.text = text }
    } as unknown as typeof SpeechSynthesisUtterance

    const board = document.createElement('div')
    board.setAttribute('data-magnetic-spawn-id', '0')
    board.setAttribute('data-magnetic-remove-id', '0')
    board.setAttribute('data-magnetic-break-speed', DEFAULT_BREAK_SPEED.toString())
    board.setAttribute('data-magnetic-muted', 'false')
    board.setAttribute('data-magnetic-language', 'en')
    board.getBoundingClientRect = () => new DOMRect(0, 0, 620, 420)
    board.setPointerCapture = () => {}
    board.releasePointerCapture = () => {}
    board.hasPointerCapture = () => true
    document.body.appendChild(board)

    const positions: ReadonlyArray<readonly [number, number]> = [
      [100, 100], [250, 100], [500, 100],
      [100, 250], [300, 250], [500, 250],
      [100, 360], [300, 360],
    ]
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    for (const [x, y] of positions) {
      random.mockReturnValueOnce((x - 37.5) / 545)
      random.mockReturnValueOnce((y - 37.5) / 345)
    }

    const pointer = (target: Element, type: string, x: number, y: number, timeStamp: number): void => {
      const event = new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' })
      Object.defineProperty(event, 'timeStamp', { value: timeStamp })
      target.dispatchEvent(event)
    }

    const fiber = Effect.runFork(Stream.runDrain(mountMagneticBlocks(board)))
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      const blocks = [...board.querySelectorAll('.magnetic-block')]

      pointer(blocks[2]!, 'pointerdown', 500, 100, 0)
      pointer(board, 'pointermove', 175, 100, 20)
      pointer(board, 'pointerup', 175, 100, 40)
      expect([...board.querySelectorAll('.magnetic-block-count')].some(el => el.textContent === '3')).toBe(true)
      expect(spoken.at(-1)).toBe('1 plus 1 plus 1 equals 3')

      spoken.length = 0
      pointer(blocks[1]!, 'pointerdown', 250, 100, 200)
      pointer(board, 'pointermove', 500, 100, 220)

      expect(spoken).toEqual(['3 minus 1 equals 2'])
      pointer(board, 'pointercancel', 500, 100, 240)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
      random.mockRestore()
      board.remove()
      globalThis.speechSynthesis = originalSpeechSynthesis
      globalThis.SpeechSynthesisUtterance = originalUtterance
    }
  })

  it('increments the spawn id through the game message', () => {
    expect(update(init, SpawnBlocks())[0]).toEqual({ spawnId: 1, removeId: 0, breakSpeed: DEFAULT_BREAK_SPEED })
    expect(update(init, RemoveBlock())[0]).toEqual({ spawnId: 0, removeId: 1, breakSpeed: DEFAULT_BREAK_SPEED })
  })

  it('starts slightly easier to pull apart and keeps the setting in range', () => {
    expect(DEFAULT_BREAK_SPEED).toBe(950)
    expect(update(init, SetBreakSpeed({ value: 100 }))[0].breakSpeed).toBe(500)
    expect(update(init, SetBreakSpeed({ value: 1800 }))[0].breakSpeed).toBe(1500)
  })
})
