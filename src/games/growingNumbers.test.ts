import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { Scene, Story } from 'foldkit/test'

import * as GrowingNumbers from './growingNumbers'
import { t } from '../i18n'

describe('Growing Numbers', () => {
  it('defines deterministic visual puzzles in the intended progression', () => {
    expect(GrowingNumbers.PUZZLES).toHaveLength(12)
    expect(GrowingNumbers.PUZZLES.map(puzzle => puzzle.kind)).toEqual([
      'counting', 'pairs', 'triangles', 'squares', 'fives', 'threes',
      'fours', 'odds', 'doubling', 'rectangles', 'centeredSquares', 'centeredHexagons',
    ])
    expect(GrowingNumbers.PUZZLES.map(puzzle => puzzle.terms)).toEqual([
      [1, 2, 3, 4], [2, 4, 6, 8], [1, 3, 6, 10], [1, 4, 9, 16], [5, 10, 15, 20],
      [3, 6, 9, 12], [4, 8, 12, 16], [1, 3, 5, 7], [1, 2, 4, 8],
      [2, 6, 12, 20], [1, 5, 13, 25], [1, 7, 19, 37],
    ])
    for (const puzzle of GrowingNumbers.PUZZLES) {
      expect(new Set(puzzle.candidates).size).toBe(3)
      expect(puzzle.candidates).toContain(GrowingNumbers.answerFor(puzzle))
    }
  })

  it('lays out every term with one unique cell per unit', () => {
    for (const puzzle of GrowingNumbers.PUZZLES) {
      for (const [index, total] of puzzle.terms.entries()) {
        const cells = GrowingNumbers.cellsForTotal(puzzle.kind, total)
        expect(cells).toHaveLength(total)
        expect(new Set(cells.map(cell => `${cell.x}:${cell.y}`)).size).toBe(total)
        if (index > 0) {
          const prior = GrowingNumbers.cellsForTotal(puzzle.kind, puzzle.terms[index - 1]!)
          const currentKeys = new Set(cells.map(cell => `${cell.x}:${cell.y}`))
          expect(prior.every(cell => currentKeys.has(`${cell.x}:${cell.y}`))).toBe(true)
        }
      }
    }
  })

  it('makes triangular, square, and oblong numbers geometrically visible', () => {
    expect(GrowingNumbers.triangleCells(4).filter(cell => cell.y === 3)).toEqual([
      { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
    ])
    expect(GrowingNumbers.squareCells(4)).toHaveLength(16)
    expect(GrowingNumbers.cellBounds(GrowingNumbers.squareCells(4))).toEqual({ width: 4, height: 4 })
    expect(GrowingNumbers.rectangleCells(4)).toHaveLength(20)
    expect(GrowingNumbers.cellBounds(GrowingNumbers.rectangleCells(4))).toEqual({ width: 5, height: 4 })
  })

  it('shows odd numbers growing symmetrically and doubling numbers changing rectangles', () => {
    expect(GrowingNumbers.oddCells(7)).toEqual([
      { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 0 },
      { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ])
    expect(GrowingNumbers.cellBounds(GrowingNumbers.doublingCells(1))).toEqual({ width: 1, height: 1 })
    expect(GrowingNumbers.cellBounds(GrowingNumbers.doublingCells(2))).toEqual({ width: 2, height: 1 })
    expect(GrowingNumbers.cellBounds(GrowingNumbers.doublingCells(4))).toEqual({ width: 2, height: 2 })
    expect(GrowingNumbers.cellBounds(GrowingNumbers.doublingCells(8))).toEqual({ width: 4, height: 2 })
  })

  it('builds honest nested centred-square and centred-hexagon rings', () => {
    expect([1, 2, 3, 4].map(order => GrowingNumbers.centeredSquareCells(order).length)).toEqual([1, 5, 13, 25])
    expect([1, 2, 3, 4].map(order => GrowingNumbers.centeredHexagonCells(order).length)).toEqual([1, 7, 19, 37])
    expect(GrowingNumbers.centeredSquareCells(4).filter(cell => Math.abs(cell.x) + Math.abs(cell.y) === 3)).toHaveLength(12)
    const hex3 = new Set(GrowingNumbers.centeredHexagonCells(3).map(cell => `${cell.x}:${cell.y}`))
    expect(GrowingNumbers.centeredHexagonCells(4).filter(cell => !hex3.has(`${cell.x}:${cell.y}`))).toHaveLength(18)
    expect(GrowingNumbers.cellBounds(GrowingNumbers.centeredSquareCells(4))).toEqual({ width: 7, height: 7 })
  })

  it('separates each old figure from exactly the new growth units', () => {
    for (const puzzle of GrowingNumbers.PUZZLES) {
      const old = GrowingNumbers.cellsForTotal(puzzle.kind, puzzle.terms[2])
      const next = GrowingNumbers.cellsForTotal(puzzle.kind, puzzle.terms[3])
      const growth = GrowingNumbers.growthCells(puzzle)
      expect(growth).toHaveLength(GrowingNumbers.answerFor(puzzle))
      expect([...old, ...growth]).toEqual(expect.arrayContaining(next))
    }
  })

  it('draws answer pieces in the pattern geometry', () => {
    expect(GrowingNumbers.growthPieceCells('pairs', 2)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }])
    expect(GrowingNumbers.growthPieceCells('fours', 4)).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 },
    ])
    expect(GrowingNumbers.growthPieceCells('triangles', 4)).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    ])
    expect(GrowingNumbers.growthPieceCells('squares', 7)).toEqual([
      { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 },
      { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 },
    ])
    expect(GrowingNumbers.cellBounds(GrowingNumbers.growthPieceCells('rectangles', 8))).toEqual({ width: 5, height: 4 })
    expect(GrowingNumbers.growthPieceCells('centeredSquares', 12)).toHaveLength(12)
    expect(GrowingNumbers.growthPieceCells('centeredHexagons', 18)).toHaveLength(18)
    for (const puzzle of GrowingNumbers.PUZZLES) {
      for (const amount of puzzle.candidates) {
        const cells = GrowingNumbers.growthPieceCells(puzzle.kind, amount)
        expect(cells).toHaveLength(amount)
        expect(new Set(cells.map(cell => `${cell.x}:${cell.y}`)).size).toBe(amount)
      }
    }
  })

  it('maps bent growth pieces in spatial order so their flight paths do not cross', () => {
    const squares = GrowingNumbers.PUZZLES.find(puzzle => puzzle.kind === 'squares')!
    const rectangles = GrowingNumbers.PUZZLES.find(puzzle => puzzle.kind === 'rectangles')!
    expect(GrowingNumbers.spatiallySortedCells(GrowingNumbers.growthPieceCells('squares', 7))).toEqual(
      GrowingNumbers.spatiallySortedCells(GrowingNumbers.growthCells(squares)),
    )
    expect(GrowingNumbers.spatiallySortedCells(GrowingNumbers.growthPieceCells('rectangles', 8))).toEqual(
      GrowingNumbers.spatiallySortedCells(GrowingNumbers.growthCells(rectangles)),
    )
  })

  it('normalizes puzzle indexes and builds the visible equation', () => {
    expect(GrowingNumbers.puzzleAt(-1).kind).toBe('centeredHexagons')
    expect(GrowingNumbers.puzzleAt(GrowingNumbers.PUZZLES.length).kind).toBe('counting')
    expect(GrowingNumbers.figureViewBox(GrowingNumbers.squareCells(4))).toBe('0 0 80 80')
    expect(GrowingNumbers.figureViewBox(GrowingNumbers.oddCells(7))).toBe('-60 0 140 20')
    expect(GrowingNumbers.equationFor(GrowingNumbers.PUZZLES[2]!)).toBe('6 + 4 = 10')
  })

  it('maps source units to exact target centres with deterministic staggering', () => {
    expect(GrowingNumbers.flightPlacementFor(
      { left: 10, top: 20, width: 20, height: 20 },
      { left: 100, top: 80, width: 10, height: 10 },
    )).toEqual({
      startX: 20,
      startY: 30,
      deltaX: 85,
      deltaY: 55,
      width: 10,
      height: 10,
      startScale: 2,
    })
    expect([0, 1, 17].map(GrowingNumbers.flightDelayFor)).toEqual([0, 18, 306])
  })

  it('measures every source and destination after commit and finishes on the last flight', async () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <div class="growing-numbers-card">
        <button class="growing-numbers-answer--adding"><svg>
          <circle class="growing-numbers-dot--choice" />
          <circle class="growing-numbers-dot--choice" />
        </svg></button>
        <div class="growing-numbers-target"><svg>
          <circle class="growing-numbers-dot--arriving" />
          <circle class="growing-numbers-dot--arriving" />
        </svg></div>
        <div class="growing-numbers-flight-layer" data-puzzle-index="4" aria-hidden="true">
          <span class="growing-numbers-flight-dot"></span>
          <span class="growing-numbers-flight-dot"></span>
        </div>
      </div>`
    document.body.append(host)
    const sources = host.querySelectorAll<Element>('.growing-numbers-dot--choice')
    const targets = host.querySelectorAll<Element>('.growing-numbers-dot--arriving')
    sources[0]!.getBoundingClientRect = () => new DOMRect(10, 100, 10, 10)
    sources[1]!.getBoundingClientRect = () => new DOMRect(30, 100, 10, 10)
    targets[0]!.getBoundingClientRect = () => new DOMRect(100, 20, 20, 20)
    targets[1]!.getBoundingClientRect = () => new DOMRect(140, 20, 20, 20)

    try {
      const resultPromise = Effect.runPromise(GrowingNumbers.FlyGrowth({ puzzleIndex: 4, amount: 2 }).effect)
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const layer = host.querySelector<HTMLElement>('.growing-numbers-flight-layer')!
      const flights = layer.querySelectorAll<HTMLElement>('.growing-numbers-flight-dot')
      expect(layer.classList.contains('growing-numbers-flight-layer--ready')).toBe(true)
      expect(flights[0]!.style.getPropertyValue('--flight-start-x')).toBe('15px')
      expect(flights[0]!.style.getPropertyValue('--flight-start-y')).toBe('105px')
      expect(flights[0]!.style.getPropertyValue('--flight-delta-x')).toBe('95px')
      expect(flights[0]!.style.getPropertyValue('--flight-delta-y')).toBe('-75px')
      expect(flights[0]!.style.getPropertyValue('--flight-width')).toBe('20px')
      expect(flights[1]!.style.getPropertyValue('--flight-delta-x')).toBe('115px')
      flights[1]!.dispatchEvent(new Event('animationend'))
      await expect(resultPromise).resolves.toStrictEqual(GrowingNumbers.FinishGrowth())
    } finally {
      host.remove()
    }
  })

  it('lets a wrong answer retry without changing puzzle or adding a penalty', () => {
    Story.story(
      GrowingNumbers.update,
      Story.with(GrowingNumbers.init),
      Story.message(GrowingNumbers.ChooseGrowth({ amount: 2 })),
      Story.model(model => {
        expect(model).toEqual({ puzzleIndex: 0, status: 'wrong', selectedAnswer: 2, animationPending: false })
      }),
      Story.Command.expectNone(),
      Story.message(GrowingNumbers.ChooseGrowth({ amount: 1 })),
      Story.model(model => {
        expect(model).toEqual({ puzzleIndex: 0, status: 'correct', selectedAnswer: 1, animationPending: true })
      }),
      Story.Command.expectExact(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1 })),
      Story.Command.resolve(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1 }), GrowingNumbers.FinishGrowth()),
      Story.model(model => {
        expect(model).toEqual({ puzzleIndex: 0, status: 'correct', selectedAnswer: 1, animationPending: false })
      }),
      Story.Command.expectNone(),
    )
  })

  it('ignores invalid choices, premature next, and choices after success', () => {
    const initial = GrowingNumbers.init
    const [invalid] = GrowingNumbers.update(initial, GrowingNumbers.ChooseGrowth({ amount: 99 }))
    const [premature] = GrowingNumbers.update(initial, GrowingNumbers.NextPuzzle())
    const [correct] = GrowingNumbers.update(initial, GrowingNumbers.ChooseGrowth({ amount: 1 }))
    const [locked] = GrowingNumbers.update(correct, GrowingNumbers.ChooseGrowth({ amount: 2 }))
    const [animationLocked] = GrowingNumbers.update(correct, GrowingNumbers.NextPuzzle())
    const [finished] = GrowingNumbers.update(correct, GrowingNumbers.FinishGrowth())
    const [staleFinish] = GrowingNumbers.update(finished, GrowingNumbers.FinishGrowth())

    expect(invalid).toBe(initial)
    expect(premature).toBe(initial)
    expect(locked).toBe(correct)
    expect(animationLocked).toBe(correct)
    expect(staleFinish).toBe(finished)
  })

  it('advances only after success and wraps after the final puzzle', () => {
    let model: GrowingNumbers.Model = GrowingNumbers.init
    for (let index = 0; index < GrowingNumbers.PUZZLES.length; index++) {
      const puzzle = GrowingNumbers.puzzleAt(index)
      model = GrowingNumbers.update(model, GrowingNumbers.ChooseGrowth({ amount: GrowingNumbers.answerFor(puzzle) }))[0]
      expect(model.status).toBe('correct')
      expect(model.animationPending).toBe(true)
      model = GrowingNumbers.update(model, GrowingNumbers.FinishGrowth())[0]
      expect(model.animationPending).toBe(false)
      model = GrowingNumbers.update(model, GrowingNumbers.NextPuzzle())[0]
      expect(model.puzzleIndex).toBe((index + 1) % GrowingNumbers.PUZZLES.length)
      expect(model.status).toBe('choosing')
      expect(model.selectedAnswer).toBe(-1)
      expect(model.animationPending).toBe(false)
    }
  })

  it('renders an accessible visual retry-success-next scene', () => {
    Scene.scene(
      { update: GrowingNumbers.update, view: GrowingNumbers.view },
      Scene.with(GrowingNumbers.init),
      Scene.expect(Scene.text(t('growingNumbersTitle'))).toExist(),
      Scene.expect(Scene.text(t('growingNumbersPrompt'))).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-target')).toExist(),
      Scene.expectAll(Scene.all.selector('.growing-numbers-answer')).toHaveCount(3),
      Scene.expect(Scene.role('button', { name: '+ 1' })).toExist(),
      Scene.expect(Scene.role('button', { name: '+ 2' })).toExist(),
      Scene.expect(Scene.role('button', { name: '+ 3' })).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).toBeDisabled(),
      Scene.click(Scene.role('button', { name: '+ 2' })),
      Scene.expect(Scene.role('status')).toHaveText(t('growingNumbersTryAgain')),
      Scene.expect(Scene.role('button', { name: '+ 2' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('.growing-numbers-answer--wrong')).toExist(),
      Scene.click(Scene.role('button', { name: '+ 1' })),
      Scene.expect(Scene.selector('.growing-numbers-target')).toHaveAttr('aria-busy', 'true'),
      Scene.expectAll(Scene.all.selector('.growing-numbers-dot--arriving')).toHaveCount(1),
      Scene.expectAll(Scene.all.selector('.growing-numbers-flight-dot')).toHaveCount(1),
      Scene.expect(Scene.selector('.growing-numbers-flight-dot[data-target-x="3"][data-target-y="0"]')).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-flight-layer')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.role('button', { name: '+ 1' })).toBeDisabled(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).toBeDisabled(),
      Scene.expect(Scene.role('status')).toHaveText(''),
      Scene.Command.expectExact(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1 })),
      Scene.Command.resolve(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1 }), GrowingNumbers.FinishGrowth()),
      Scene.expect(Scene.role('status')).toHaveText(t('growingNumbersCorrect')),
      Scene.expect(Scene.text('3 + 1 = 4')).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-dot--new')).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-flight-layer')).not.toExist(),
      Scene.expect(Scene.selector('.growing-numbers-target')).toHaveAttr('aria-busy', 'false'),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).not.toBeDisabled(),
      Scene.click(Scene.role('button', { name: t('growingNumbersNext') })),
      Scene.expect(Scene.text(t('sequencePairs'))).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).toBeDisabled(),
      Scene.Command.expectNone(),
    )
  })

  it('renders the largest geometric family with ghost and answer units intact', () => {
    const lastIndex = GrowingNumbers.PUZZLES.length - 1
    const puzzle = GrowingNumbers.puzzleAt(lastIndex)
    Scene.scene(
      { update: GrowingNumbers.update, view: GrowingNumbers.view },
      Scene.with<GrowingNumbers.Model>({ puzzleIndex: lastIndex, status: 'choosing', selectedAnswer: -1, animationPending: false }),
      Scene.expect(Scene.text(t('sequenceCenteredHexagons'))).toExist(),
      Scene.expectAll(Scene.all.selector('.growing-numbers-target .growing-numbers-dot--old')).toHaveCount(19),
      Scene.expectAll(Scene.all.selector('.growing-numbers-target .growing-numbers-dot--ghost')).toHaveCount(18),
      Scene.expectAll(Scene.all.selector('.growing-numbers-answer')).toHaveCount(3),
      Scene.click(Scene.role('button', { name: `+ ${GrowingNumbers.answerFor(puzzle)}` })),
      Scene.expectAll(Scene.all.selector('.growing-numbers-flight-dot')).toHaveCount(18),
      Scene.expectAll(Scene.all.selector('.growing-numbers-dot--arriving')).toHaveCount(18),
      Scene.Command.expectExact(GrowingNumbers.FlyGrowth({ puzzleIndex: lastIndex, amount: 18 })),
      Scene.Command.resolve(GrowingNumbers.FlyGrowth({ puzzleIndex: lastIndex, amount: 18 }), GrowingNumbers.FinishGrowth()),
      Scene.expectAll(Scene.all.selector('.growing-numbers-target .growing-numbers-dot--new')).toHaveCount(18),
      Scene.expect(Scene.text('19 + 18 = 37')).toExist(),
      Scene.Command.expectNone(),
    )
  })
})
