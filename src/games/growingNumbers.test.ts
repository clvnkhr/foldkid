import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'
import { Scene, Story } from 'foldkit/test'

import * as GrowingNumbers from './growingNumbers'
import { t } from '../i18n'

describe('Growing Numbers', () => {
  it('defines one deterministic lesson per age-appropriate sequence', () => {
    expect(GrowingNumbers.PUZZLES).toHaveLength(4)
    expect(GrowingNumbers.PUZZLES.map(puzzle => puzzle.kind)).toEqual(['counting', 'evens', 'odds', 'squares'])
    expect(GrowingNumbers.PUZZLES.map(puzzle => puzzle.terms)).toEqual([
      [1, 2, 3], [2, 4, 6], [1, 3, 5], [1, 4, 9],
    ])
    expect(new Set(GrowingNumbers.PUZZLES.map(puzzle => puzzle.kind)).size).toBe(GrowingNumbers.PUZZLES.length)
    for (const puzzle of GrowingNumbers.PUZZLES) {
      expect(puzzle.terms).toEqual(puzzle.terms.map((_, index) => GrowingNumbers.sequenceTermAt(puzzle.kind, index)))
      expect(new Set(puzzle.candidates).size).toBe(3)
      expect(puzzle.candidates).toContain(GrowingNumbers.answerFor(puzzle))
    }
  })

  it('generates every sequence family without a predefined final term', () => {
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('counting', index))).toEqual([1, 2, 3, 10])
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('evens', index))).toEqual([2, 4, 6, 20])
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('odds', index))).toEqual([1, 3, 5, 19])
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('squares', index))).toEqual([1, 4, 9, 100])
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('triangles', index))).toEqual([1, 3, 6, 55])
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('rectangles', index))).toEqual([2, 6, 12, 110])
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('centeredSquares', index))).toEqual([1, 5, 13, 181])
    expect([0, 1, 2, 9].map(index => GrowingNumbers.sequenceTermAt('centeredHexagons', index))).toEqual([1, 7, 19, 271])
    expect(GrowingNumbers.sequenceGridForTotal('squares', 10_000)).toEqual({ columns: 100, rows: 100 })
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
      const old = GrowingNumbers.cellsForTotal(puzzle.kind, GrowingNumbers.previousTotalFor(puzzle))
      const next = GrowingNumbers.cellsForTotal(puzzle.kind, GrowingNumbers.finalTotalFor(puzzle))
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
    const squares = GrowingNumbers.PUZZLES.at(-1)!
    expect(GrowingNumbers.spatiallySortedCells(GrowingNumbers.growthPieceCells('squares', GrowingNumbers.answerFor(squares)))).toEqual(
      GrowingNumbers.spatiallySortedCells(GrowingNumbers.growthCells(squares)),
    )
  })

  it('normalizes puzzle indexes and builds the visible equation', () => {
    expect(GrowingNumbers.puzzleAt(-1).kind).toBe('squares')
    expect(GrowingNumbers.puzzleAt(GrowingNumbers.PUZZLES.length).kind).toBe('counting')
    expect(GrowingNumbers.puzzleAt(Number.POSITIVE_INFINITY).kind).toBe('counting')
    expect(GrowingNumbers.normalizedPuzzleIndex(Number.NaN)).toBe(0)
    expect(GrowingNumbers.figureViewBox(GrowingNumbers.squareCells(4))).toBe('0 0 80 80')
    expect(GrowingNumbers.figureViewBox(GrowingNumbers.oddCells(7))).toBe('-60 0 140 20')
    expect(GrowingNumbers.equationFor(GrowingNumbers.PUZZLES[2]!)).toBe('3 + 2 = 5')
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
        <div class="growing-numbers-flight-layer" data-puzzle-index="4" data-animation-token="7" aria-hidden="true">
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
      const resultPromise = Effect.runPromise(GrowingNumbers.FlyGrowth({ puzzleIndex: 4, amount: 2, token: 7 }).effect)
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
      await expect(resultPromise).resolves.toStrictEqual(GrowingNumbers.FinishGrowth({ puzzleIndex: 4, token: 7 }))
    } finally {
      host.remove()
    }
  })

  it('follows an appended card after commit without changing manual scrollability', async () => {
    const sequence = document.createElement('ol')
    sequence.className = 'growing-numbers-sequence--explore'
    sequence.dataset.puzzleIndex = '2'
    sequence.dataset.revealedTermCount = '5'
    Object.defineProperty(sequence, 'scrollWidth', { configurable: true, value: 900 })
    Object.defineProperty(sequence, 'clientWidth', { configurable: true, value: 400 })
    const scrollTo = vi.fn()
    sequence.scrollTo = scrollTo
    document.body.append(sequence)

    try {
      const resultPromise = Effect.runPromise(GrowingNumbers.ScrollToNewest({ puzzleIndex: 2, revealedTermCount: 5 }).effect)
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      await expect(resultPromise).resolves.toStrictEqual(GrowingNumbers.SequenceScrolled({ puzzleIndex: 2, revealedTermCount: 5 }))
      expect(scrollTo).toHaveBeenCalledWith({ left: 500, behavior: 'smooth' })

      const stalePromise = Effect.runPromise(GrowingNumbers.ScrollToNewest({ puzzleIndex: 2, revealedTermCount: 6 }).effect)
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      await expect(stalePromise).resolves.toStrictEqual(GrowingNumbers.SequenceScrolled({ puzzleIndex: 2, revealedTermCount: 6 }))
      expect(scrollTo).toHaveBeenCalledTimes(1)
    } finally {
      sequence.remove()
    }
  })

  it('lets a wrong answer retry without changing puzzle or adding a penalty', () => {
    const quizInit: GrowingNumbers.Model = { ...GrowingNumbers.init, mode: 'quiz' }
    Story.story(
      GrowingNumbers.update,
      Story.with(quizInit),
      Story.message(GrowingNumbers.ChooseGrowth({ amount: 2 })),
      Story.model(model => {
        expect(model).toEqual({ puzzleIndex: 0, status: 'wrong', selectedAnswer: 2, animationPending: false, animationToken: 0, mode: 'quiz', revealedTermCounts: [1, 1, 1, 1] })
      }),
      Story.Command.expectNone(),
      Story.message(GrowingNumbers.ChooseGrowth({ amount: 1 })),
      Story.model(model => {
        expect(model).toEqual({ puzzleIndex: 0, status: 'correct', selectedAnswer: 1, animationPending: true, animationToken: 1, mode: 'quiz', revealedTermCounts: [1, 1, 1, 1] })
      }),
      Story.Command.expectExact(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1, token: 1 })),
      Story.Command.resolve(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1, token: 1 }), GrowingNumbers.FinishGrowth({ puzzleIndex: 0, token: 1 })),
      Story.model(model => {
        expect(model).toEqual({ puzzleIndex: 0, status: 'correct', selectedAnswer: 1, animationPending: false, animationToken: 1, mode: 'quiz', revealedTermCounts: [1, 1, 1, 1] })
      }),
      Story.Command.expectNone(),
    )
  })

  it('navigates before completion, wraps backwards, and ignores late animation finishes', () => {
    const initial: GrowingNumbers.Model = { ...GrowingNumbers.init, mode: 'quiz' }
    const [invalid] = GrowingNumbers.update(initial, GrowingNumbers.ChooseGrowth({ amount: 99 }))
    const [next] = GrowingNumbers.update(initial, GrowingNumbers.NextPuzzle())
    const [previous] = GrowingNumbers.update(initial, GrowingNumbers.PreviousPuzzle())
    const [correct] = GrowingNumbers.update(initial, GrowingNumbers.ChooseGrowth({ amount: 1 }))
    const [locked] = GrowingNumbers.update(correct, GrowingNumbers.ChooseGrowth({ amount: 2 }))
    const [navigatedDuringAnimation] = GrowingNumbers.update(correct, GrowingNumbers.NextPuzzle())
    const [answeredNext] = GrowingNumbers.update(navigatedDuringAnimation, GrowingNumbers.ChooseGrowth({ amount: 2 }))
    const [staleFinish] = GrowingNumbers.update(answeredNext, GrowingNumbers.FinishGrowth({ puzzleIndex: 0, token: 1 }))
    const [currentFinish] = GrowingNumbers.update(staleFinish, GrowingNumbers.FinishGrowth({ puzzleIndex: 1, token: 3 }))

    expect(invalid).toBe(initial)
    expect(next).toMatchObject({ puzzleIndex: 1, status: 'choosing', selectedAnswer: -1, animationPending: false })
    expect(previous.puzzleIndex).toBe(GrowingNumbers.PUZZLES.length - 1)
    expect(locked).toBe(correct)
    expect(navigatedDuringAnimation).toMatchObject({ puzzleIndex: 1, status: 'choosing', animationPending: false, animationToken: 2 })
    expect(answeredNext).toMatchObject({ puzzleIndex: 1, status: 'correct', animationPending: true, animationToken: 3 })
    expect(staleFinish).toBe(answeredNext)
    expect(currentFinish).toMatchObject({ status: 'correct', animationPending: false, animationToken: 3 })
  })

  it('cycles through every puzzle without requiring an answer', () => {
    let model: GrowingNumbers.Model = GrowingNumbers.init
    for (let index = 0; index < GrowingNumbers.PUZZLES.length; index++) {
      model = GrowingNumbers.update(model, GrowingNumbers.NextPuzzle())[0]
      expect(model.puzzleIndex).toBe((index + 1) % GrowingNumbers.PUZZLES.length)
      expect(model.status).toBe('choosing')
      expect(model.selectedAnswer).toBe(-1)
      expect(model.animationPending).toBe(false)
    }
  })

  it('keeps four-card slideshow history while revealing beyond the initial viewport', () => {
    Scene.scene(
      { update: GrowingNumbers.update, view: GrowingNumbers.view },
      Scene.with(GrowingNumbers.init),
      Scene.expect(Scene.text(t('growingNumbersTitle'))).toExist(),
      Scene.expect(Scene.text(t('growingNumbersExplorePrompt'))).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersExplore') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('.growing-numbers-sequence')).toHaveAttr('aria-live', 'polite'),
      Scene.expect(Scene.selector('.growing-numbers-sequence')).toHaveAttr('aria-relevant', 'additions'),
      Scene.expect(Scene.selector('.growing-numbers-sequence')).toHaveAttr('tabindex', '0'),
      Scene.expect(Scene.selector('.growing-numbers-sequence')).toHaveAttr('dir', 'ltr'),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term')).toHaveCount(1),
      Scene.expectAll(Scene.all.selector('.growing-numbers-answer')).toHaveCount(0),
      Scene.expect(Scene.role('button', { name: t('growingNumbersRevealNext') })).toBeEnabled(),
      Scene.click(Scene.role('button', { name: t('growingNumbersRevealNext') })),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term')).toHaveCount(2),
      Scene.expect(Scene.selector('.growing-numbers-term--revealed .growing-numbers-total')).toHaveText('2'),
      Scene.Command.resolve(GrowingNumbers.ScrollToNewest({ puzzleIndex: 0, revealedTermCount: 2 }), GrowingNumbers.SequenceScrolled({ puzzleIndex: 0, revealedTermCount: 2 })),
      Scene.click(Scene.role('button', { name: t('growingNumbersRevealNext') })),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term')).toHaveCount(3),
      Scene.expect(Scene.selector('.growing-numbers-term--revealed .growing-numbers-total')).toHaveText('3'),
      Scene.Command.resolve(GrowingNumbers.ScrollToNewest({ puzzleIndex: 0, revealedTermCount: 3 }), GrowingNumbers.SequenceScrolled({ puzzleIndex: 0, revealedTermCount: 3 })),
      Scene.click(Scene.role('button', { name: t('growingNumbersRevealNext') })),
      Scene.Command.resolve(GrowingNumbers.ScrollToNewest({ puzzleIndex: 0, revealedTermCount: 4 }), GrowingNumbers.SequenceScrolled({ puzzleIndex: 0, revealedTermCount: 4 })),
      Scene.click(Scene.role('button', { name: t('growingNumbersRevealNext') })),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term')).toHaveCount(5),
      Scene.expect(Scene.selector('.growing-numbers-sequence')).toHaveAttr('data-revealed-term-count', '5'),
      Scene.expect(Scene.selector('.growing-numbers-term[data-term-index="0"][data-total="1"]')).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-term[data-term-index="4"][data-total="5"]')).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersRevealNext') })).toBeEnabled(),
      Scene.Command.resolve(GrowingNumbers.ScrollToNewest({ puzzleIndex: 0, revealedTermCount: 5 }), GrowingNumbers.SequenceScrolled({ puzzleIndex: 0, revealedTermCount: 5 })),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).toBeEnabled(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersPrevious') })).toBeEnabled(),
      Scene.click(Scene.role('button', { name: t('growingNumbersQuiz') })),
      Scene.expect(Scene.text(t('growingNumbersPrompt'))).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersQuiz') })).toHaveAttr('aria-pressed', 'true'),
      Scene.expectAll(Scene.all.selector('.growing-numbers-answer')).toHaveCount(3),
      Scene.expect(Scene.selector('.growing-numbers-target')).toExist(),
      Scene.click(Scene.role('button', { name: t('growingNumbersExplore') })),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term')).toHaveCount(5),
      Scene.expect(Scene.selector('.growing-numbers-term[data-term-index="0"]')).toExist(),
      Scene.Command.resolve(GrowingNumbers.ScrollToNewest({ puzzleIndex: 0, revealedTermCount: 5 }), GrowingNumbers.SequenceScrolled({ puzzleIndex: 0, revealedTermCount: 5 })),
      Scene.Command.expectNone(),
    )
  })

  it('continues every unique lesson without a final term', () => {
    for (const [puzzleIndex, puzzle] of GrowingNumbers.PUZZLES.entries()) {
      let model: GrowingNumbers.Model = { ...GrowingNumbers.init, puzzleIndex }
      expect(GrowingNumbers.normalizedRevealedTermCount(model)).toBe(1)
      for (let expected = 2; expected <= 12; expected++) {
        const [next, commands] = GrowingNumbers.update(model, GrowingNumbers.RevealNext())
        expect(GrowingNumbers.normalizedRevealedTermCount(next)).toBe(expected)
        expect(commands.map(command => command.name)).toEqual(['GrowingNumbersScrollToNewest'])
        expect(GrowingNumbers.sequenceTermAt(puzzle.kind, expected - 1)).toBeGreaterThan(GrowingNumbers.sequenceTermAt(puzzle.kind, expected - 2))
        model = next
      }
    }

    const partial: GrowingNumbers.Model = { ...GrowingNumbers.init, revealedTermCounts: [40, 1, 1, 1] }
    const [sameMode, sameModeCommands] = GrowingNumbers.update(partial, GrowingNumbers.SetMode({ mode: 'explore' }), 'en', false)
    expect(sameMode).toBe(partial)
    expect(sameModeCommands.map(command => command.name)).toEqual(['Speak'])
    const nextLesson = GrowingNumbers.update(partial, GrowingNumbers.NextPuzzle())[0]
    const [returnedLesson, returnCommands] = GrowingNumbers.update(nextLesson, GrowingNumbers.PreviousPuzzle())
    expect(GrowingNumbers.normalizedRevealedTermCount(nextLesson)).toBe(1)
    expect(GrowingNumbers.normalizedRevealedTermCount(returnedLesson)).toBe(40)
    expect(returnCommands.map(command => command.name)).toEqual(['GrowingNumbersScrollToNewest'])

    const quiz: GrowingNumbers.Model = { ...GrowingNumbers.init, mode: 'quiz' }
    const [quizAfterReveal, quizCommands] = GrowingNumbers.update(quiz, GrowingNumbers.RevealNext(), 'en', false)
    expect(quizAfterReveal).toBe(quiz)
    expect(quizCommands).toEqual([])
  })

  it('keeps large square-number history lightweight and inspectable', () => {
    Scene.scene(
      { update: GrowingNumbers.update, view: GrowingNumbers.view },
      Scene.with<GrowingNumbers.Model>({ ...GrowingNumbers.init, puzzleIndex: 3, revealedTermCounts: [1, 1, 1, 100] }),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term')).toHaveCount(100),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term .growing-numbers-dot')).toHaveCount(100),
      Scene.expect(Scene.selector('.growing-numbers-term[data-term-index="99"][data-total="10000"]')).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersRevealNext') })).toBeEnabled(),
      Scene.Command.expectNone(),
    )
  })

  it('renders an accessible visual retry and success in quiz mode', () => {
    const quizInit: GrowingNumbers.Model = { ...GrowingNumbers.init, mode: 'quiz' }
    Scene.scene(
      { update: GrowingNumbers.update, view: GrowingNumbers.view },
      Scene.with(quizInit),
      Scene.expect(Scene.role('button', { name: '+ 1' })).toExist(),
      Scene.expect(Scene.role('button', { name: '+ 2' })).toExist(),
      Scene.expect(Scene.role('button', { name: '+ 3' })).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).toBeEnabled(),
      Scene.click(Scene.role('button', { name: '+ 2' })),
      Scene.expect(Scene.role('status')).toHaveText(t('growingNumbersTryAgain')),
      Scene.expect(Scene.role('button', { name: '+ 2' })).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('.growing-numbers-answer--wrong')).toExist(),
      Scene.click(Scene.role('button', { name: '+ 1' })),
      Scene.expect(Scene.selector('.growing-numbers-target')).toHaveAttr('aria-busy', 'true'),
      Scene.expectAll(Scene.all.selector('.growing-numbers-dot--arriving')).toHaveCount(1),
      Scene.expectAll(Scene.all.selector('.growing-numbers-flight-dot')).toHaveCount(1),
      Scene.expect(Scene.selector('.growing-numbers-flight-dot[data-target-x="2"][data-target-y="0"]')).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-flight-layer')).toHaveAttr('aria-hidden', 'true'),
      Scene.expect(Scene.role('button', { name: '+ 1' })).toBeDisabled(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).toBeEnabled(),
      Scene.expect(Scene.role('status')).toHaveText(''),
      Scene.Command.expectExact(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1, token: 1 })),
      Scene.Command.resolve(GrowingNumbers.FlyGrowth({ puzzleIndex: 0, amount: 1, token: 1 }), GrowingNumbers.FinishGrowth({ puzzleIndex: 0, token: 1 })),
      Scene.expect(Scene.role('status')).toHaveText(t('growingNumbersCorrect')),
      Scene.expect(Scene.text('2 + 1 = 3')).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-dot--new')).toExist(),
      Scene.expect(Scene.selector('.growing-numbers-flight-layer')).not.toExist(),
      Scene.expect(Scene.selector('.growing-numbers-target')).toHaveAttr('aria-busy', 'false'),
      Scene.click(Scene.role('button', { name: t('growingNumbersNext') })),
      Scene.expect(Scene.text(t('sequenceEvens'))).toExist(),
      Scene.expect(Scene.role('button', { name: t('growingNumbersNext') })).toBeEnabled(),
      Scene.Command.expectNone(),
    )
  })

  it('keeps the consolidated square-number quiz geometry intact', () => {
    const squareIndex = GrowingNumbers.PUZZLES.findIndex(puzzle => puzzle.kind === 'squares')
    const puzzle = GrowingNumbers.puzzleAt(squareIndex)
    Scene.scene(
      { update: GrowingNumbers.update, view: GrowingNumbers.view },
      Scene.with<GrowingNumbers.Model>({ puzzleIndex: squareIndex, status: 'choosing', selectedAnswer: -1, animationPending: false, animationToken: 0, mode: 'quiz', revealedTermCounts: [1, 1, 1, 1] }),
      Scene.expect(Scene.text(t('sequenceSquares'))).toExist(),
      Scene.expectAll(Scene.all.selector('.growing-numbers-term')).toHaveCount(3),
      Scene.expectAll(Scene.all.selector('.growing-numbers-target .growing-numbers-dot--old')).toHaveCount(4),
      Scene.expectAll(Scene.all.selector('.growing-numbers-target .growing-numbers-dot--ghost')).toHaveCount(5),
      Scene.expectAll(Scene.all.selector('.growing-numbers-answer')).toHaveCount(3),
      Scene.click(Scene.role('button', { name: `+ ${GrowingNumbers.answerFor(puzzle)}` })),
      Scene.expectAll(Scene.all.selector('.growing-numbers-flight-dot')).toHaveCount(5),
      Scene.expectAll(Scene.all.selector('.growing-numbers-dot--arriving')).toHaveCount(5),
      Scene.Command.expectExact(GrowingNumbers.FlyGrowth({ puzzleIndex: squareIndex, amount: 5, token: 1 })),
      Scene.Command.resolve(GrowingNumbers.FlyGrowth({ puzzleIndex: squareIndex, amount: 5, token: 1 }), GrowingNumbers.FinishGrowth({ puzzleIndex: squareIndex, token: 1 })),
      Scene.expectAll(Scene.all.selector('.growing-numbers-target .growing-numbers-dot--new')).toHaveCount(5),
      Scene.expect(Scene.text('4 + 5 = 9')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('speaks only in direct response to game button presses', () => {
    const quiz: GrowingNumbers.Model = { ...GrowingNumbers.init, mode: 'quiz' }
    const [, wrongCommands] = GrowingNumbers.update(quiz, GrowingNumbers.ChooseGrowth({ amount: 2 }), 'en', false)
    const [, correctCommands] = GrowingNumbers.update(quiz, GrowingNumbers.ChooseGrowth({ amount: 1 }), 'en', false)
    const [, navigationCommands] = GrowingNumbers.update(quiz, GrowingNumbers.NextPuzzle(), 'en', false)
    const [, revealCommands] = GrowingNumbers.update(GrowingNumbers.init, GrowingNumbers.RevealNext(), 'en', false)
    const [, modeCommands] = GrowingNumbers.update(GrowingNumbers.init, GrowingNumbers.SetMode({ mode: 'quiz' }), 'en', false)

    expect(wrongCommands.map(command => command.name)).toEqual(['PlayBoing', 'Speak'])
    expect(correctCommands.map(command => command.name)).toEqual(['GrowingNumbersFlyGrowth', 'PlayChime', 'Speak'])
    expect(navigationCommands.map(command => command.name)).toEqual(['Speak'])
    expect(revealCommands.map(command => command.name)).toEqual(['GrowingNumbersScrollToNewest', 'Speak'])
    expect(modeCommands.map(command => command.name)).toEqual(['Speak'])
  })
})
