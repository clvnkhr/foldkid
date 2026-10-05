import { Effect, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { boing, chime } from '../audio'
import { t, type StringKey } from '../i18n'
import { speak, type SpeechOptions } from '../speech'

export const SequenceKind = S.Union([
  S.Literal('counting'),
  S.Literal('evens'),
  S.Literal('pairs'),
  S.Literal('triangles'),
  S.Literal('squares'),
  S.Literal('fives'),
  S.Literal('threes'),
  S.Literal('fours'),
  S.Literal('odds'),
  S.Literal('doubling'),
  S.Literal('rectangles'),
  S.Literal('centeredSquares'),
  S.Literal('centeredHexagons'),
])
export type SequenceKind = typeof SequenceKind.Type

export interface UnitCell {
  readonly x: number
  readonly y: number
}

export interface FlightRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface FlightPlacement {
  readonly startX: number
  readonly startY: number
  readonly deltaX: number
  readonly deltaY: number
  readonly width: number
  readonly height: number
  readonly startScale: number
}

const FLIGHT_DURATION_MS = 620
const FLIGHT_STAGGER_MS = 18

export const flightDelayFor = (index: number): number =>
  Math.max(0, Math.floor(index)) * FLIGHT_STAGGER_MS

export const flightPlacementFor = (source: FlightRect, target: FlightRect): FlightPlacement => {
  const width = Math.max(1, target.width)
  const height = Math.max(1, target.height)
  const sourceWidth = Math.max(1, source.width)
  const sourceHeight = Math.max(1, source.height)
  const startX = source.left + source.width / 2
  const startY = source.top + source.height / 2
  return {
    startX,
    startY,
    deltaX: target.left + target.width / 2 - startX,
    deltaY: target.top + target.height / 2 - startY,
    width,
    height,
    startScale: Math.max(.25, Math.min(2.5, (sourceWidth / width + sourceHeight / height) / 2)),
  }
}

type GrowingNumbersKey =
  | 'growingNumbersTitle'
  | 'growingNumbersPrompt'
  | 'growingNumbersTryAgain'
  | 'growingNumbersCorrect'
  | 'growingNumbersNext'
  | 'growingNumbersPrevious'
  | 'growingNumbersExplore'
  | 'growingNumbersExplorePrompt'
  | 'growingNumbersQuiz'
  | 'growingNumbersRevealNext'
  | 'sequenceCounting'
  | 'sequenceEvens'
  | 'sequencePairs'
  | 'sequenceTriangles'
  | 'sequenceSquares'
  | 'sequenceFives'
  | 'sequenceThrees'
  | 'sequenceFours'
  | 'sequenceOdds'
  | 'sequenceDoubling'
  | 'sequenceRectangles'
  | 'sequenceCenteredSquares'
  | 'sequenceCenteredHexagons'

export interface GrowingNumbersPuzzle {
  readonly kind: SequenceKind
  readonly labelKey: GrowingNumbersKey
  readonly terms: readonly [number, number, number, ...number[]]
  readonly candidates: readonly [number, number, number]
}

export const PUZZLES = [
  { kind: 'counting', labelKey: 'sequenceCounting', terms: [1, 2, 3], candidates: [2, 1, 3] },
  { kind: 'evens', labelKey: 'sequenceEvens', terms: [2, 4, 6], candidates: [1, 3, 2] },
  { kind: 'odds', labelKey: 'sequenceOdds', terms: [1, 3, 5], candidates: [3, 2, 1] },
  { kind: 'squares', labelKey: 'sequenceSquares', terms: [1, 4, 9], candidates: [3, 5, 4] },
] as const satisfies readonly GrowingNumbersPuzzle[]

/** Returns the zero-based term for every sequence family, with no lesson-length cap. */
export const sequenceTermAt = (kind: SequenceKind, index: number): number => {
  const step = (Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0) + 1
  switch (kind) {
    case 'counting': return step
    case 'evens':
    case 'pairs': return step * 2
    case 'triangles': return step * (step + 1) / 2
    case 'squares': return step ** 2
    case 'fives': return step * 5
    case 'threes': return step * 3
    case 'fours': return step * 4
    case 'odds': return step * 2 - 1
    case 'doubling': return 2 ** (step - 1)
    case 'rectangles': return step * (step + 1)
    case 'centeredSquares': return step ** 2 + (step - 1) ** 2
    case 'centeredHexagons': return 3 * step * (step - 1) + 1
  }
}

const FALLBACK_TEXT: Record<GrowingNumbersKey, string> = {
  growingNumbersTitle: 'Growing Numbers',
  growingNumbersPrompt: 'What grows next?',
  growingNumbersTryAgain: 'Try again',
  growingNumbersCorrect: 'Correct!',
  growingNumbersNext: 'Next',
  growingNumbersPrevious: 'Previous',
  growingNumbersExplore: 'Explore',
  growingNumbersExplorePrompt: 'Press the button to reveal the next number.',
  growingNumbersQuiz: 'Quiz',
  growingNumbersRevealNext: 'Show next number',
  sequenceCounting: 'Counting',
  sequenceEvens: 'Even numbers',
  sequencePairs: 'Pairs',
  sequenceTriangles: 'Triangles',
  sequenceSquares: 'Squares',
  sequenceFives: 'Fives',
  sequenceThrees: 'Three more each time',
  sequenceFours: 'Four more each time',
  sequenceOdds: 'Odd numbers',
  sequenceDoubling: 'Double each time',
  sequenceRectangles: 'Growing rectangles',
  sequenceCenteredSquares: 'Squares around a centre',
  sequenceCenteredHexagons: 'Hexagons around a centre',
}

const translate = (key: GrowingNumbersKey, language: string): string =>
  t(key as StringKey, language) ?? FALLBACK_TEXT[key]

const rowCells = (length: number, y = 0): UnitCell[] =>
  Array.from({ length: Math.max(0, length) }, (_, x) => ({ x, y }))

const normalizedCells = (cells: readonly UnitCell[]): UnitCell[] => {
  if (cells.length === 0) return []
  const minX = Math.min(...cells.map(cell => cell.x))
  const minY = Math.min(...cells.map(cell => cell.y))
  return cells.map(cell => ({ x: cell.x - minX, y: cell.y - minY }))
}

const stackedGroups = (count: number, groupSize: number): UnitCell[] =>
  Array.from({ length: count }, (_, index) => ({
    x: Math.floor(index / groupSize),
    y: index % groupSize,
  }))

const tiledPairs = (count: number): UnitCell[] =>
  Array.from({ length: count }, (_, index) => {
    const group = Math.floor(index / 4)
    const withinGroup = index % 4
    return { x: group * 2 + withinGroup % 2, y: Math.floor(withinGroup / 2) }
  })

export const triangleCells = (order: number): UnitCell[] =>
  Array.from({ length: Math.max(0, order) }, (_, y) => rowCells(y + 1, y)).flat()

export const squareCells = (order: number): UnitCell[] =>
  Array.from({ length: Math.max(0, order) }, (_, y) => rowCells(order, y)).flat()

export const rectangleCells = (order: number): UnitCell[] =>
  Array.from({ length: Math.max(0, order) }, (_, y) => rowCells(order + 1, y)).flat()

export const oddCells = (total: number): UnitCell[] => {
  const count = Math.max(0, Math.floor(total))
  const left = -Math.floor(count / 2)
  return Array.from({ length: count }, (_, index) => ({ x: left + index, y: 0 }))
}

export const doublingCells = (total: number): UnitCell[] => {
  const count = Math.max(0, Math.floor(total))
  if (count === 0) return []
  const width = 2 ** Math.ceil(Math.log2(count) / 2)
  const height = Math.ceil(count / width)
  return Array.from({ length: height }, (_, y) => rowCells(Math.min(width, count - y * width), y)).flat()
}

export const centeredSquareCells = (order: number): UnitCell[] => {
  const radius = Math.max(0, Math.floor(order) - 1)
  const cells: UnitCell[] = []
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (Math.abs(x) + Math.abs(y) <= radius) cells.push({ x, y })
    }
  }
  return cells
}

const HEX_ROW_HEIGHT = Math.sqrt(3) / 2

export const centeredHexagonCells = (order: number): UnitCell[] => {
  const radius = Math.max(0, Math.floor(order) - 1)
  const cells: UnitCell[] = []
  for (let axialY = -radius; axialY <= radius; axialY++) {
    for (let axialX = -radius; axialX <= radius; axialX++) {
      if (Math.max(Math.abs(axialX), Math.abs(axialY), Math.abs(-axialX - axialY)) <= radius) {
        cells.push({ x: axialX + axialY / 2, y: axialY * HEX_ROW_HEIGHT })
      }
    }
  }
  return cells
}

const triangularOrder = (total: number): number => {
  const order = (Math.sqrt(8 * total + 1) - 1) / 2
  return Number.isInteger(order) ? order : 0
}

const rectangularOrder = (total: number): number => {
  const order = (Math.sqrt(4 * total + 1) - 1) / 2
  return Number.isInteger(order) ? order : 0
}

const centeredSquareOrder = (total: number): number => {
  const order = (1 + Math.sqrt(2 * total - 1)) / 2
  return Number.isInteger(order) ? order : 0
}

const centeredHexagonOrder = (total: number): number => {
  const order = (3 + Math.sqrt(12 * total - 3)) / 6
  return Number.isInteger(order) ? order : 0
}

export const cellsForTotal = (kind: SequenceKind, total: number): UnitCell[] => {
  const count = Math.max(0, Math.floor(total))
  switch (kind) {
    case 'counting': return rowCells(count)
    case 'evens': return stackedGroups(count, 2)
    case 'pairs': return stackedGroups(count, 2)
    case 'triangles': return triangleCells(triangularOrder(count))
    case 'squares': return squareCells(Number.isInteger(Math.sqrt(count)) ? Math.sqrt(count) : 0)
    case 'fives': return Array.from({ length: count }, (_, index) => ({ x: index % 5, y: Math.floor(index / 5) }))
    case 'threes': return stackedGroups(count, 3)
    case 'fours': return tiledPairs(count)
    case 'odds': return oddCells(count)
    case 'doubling': return doublingCells(count)
    case 'rectangles': return rectangleCells(rectangularOrder(count))
    case 'centeredSquares': return centeredSquareCells(centeredSquareOrder(count))
    case 'centeredHexagons': return centeredHexagonCells(centeredHexagonOrder(count))
  }
}

export interface SequenceGrid {
  readonly columns: number
  readonly rows: number
}

/** A constant-node SVG grid for sequence families whose unit shapes fill a rectangle exactly. */
export const sequenceGridForTotal = (kind: SequenceKind, total: number): SequenceGrid | undefined => {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  if (count === 0) return undefined
  switch (kind) {
    case 'counting':
    case 'odds': return { columns: count, rows: 1 }
    case 'evens':
    case 'pairs': return count % 2 === 0 ? { columns: count / 2, rows: 2 } : undefined
    case 'squares': {
      const side = Math.sqrt(count)
      return Number.isInteger(side) ? { columns: side, rows: side } : undefined
    }
    case 'fives': return count % 5 === 0 ? { columns: 5, rows: count / 5 } : undefined
    case 'threes': return count % 3 === 0 ? { columns: count / 3, rows: 3 } : undefined
    case 'fours': return count % 4 === 0 ? { columns: count / 2, rows: 2 } : undefined
    case 'doubling': {
      const columns = 2 ** Math.ceil(Math.log2(count) / 2)
      const rows = Math.ceil(count / columns)
      return columns * rows === count ? { columns, rows } : undefined
    }
    case 'rectangles': {
      const order = rectangularOrder(count)
      return order > 0 ? { columns: order + 1, rows: order } : undefined
    }
    case 'triangles':
    case 'centeredSquares':
    case 'centeredHexagons': return undefined
  }
}

const cellKey = (cell: UnitCell): string => `${cell.x}:${cell.y}`

export const spatiallySortedCells = (cells: readonly UnitCell[]): UnitCell[] =>
  cells
    .map((cell, index) => ({ cell, index }))
    .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x || a.index - b.index)
    .map(({ cell }) => cell)

export const growthCells = (puzzle: GrowingNumbersPuzzle): UnitCell[] => {
  const old = new Set(cellsForTotal(puzzle.kind, previousTotalFor(puzzle)).map(cellKey))
  return cellsForTotal(puzzle.kind, finalTotalFor(puzzle)).filter(cell => !old.has(cellKey(cell)))
}

export const answerFor = (puzzle: GrowingNumbersPuzzle): number =>
  finalTotalFor(puzzle) - previousTotalFor(puzzle)

export const previousTotalFor = (puzzle: GrowingNumbersPuzzle): number =>
  puzzle.terms[puzzle.terms.length - 2]!

export const finalTotalFor = (puzzle: GrowingNumbersPuzzle): number =>
  puzzle.terms[puzzle.terms.length - 1]!

const compactGridCells = (count: number): UnitCell[] => {
  if (count <= 0) return []
  const width = Math.ceil(Math.sqrt(count))
  return Array.from({ length: count }, (_, index) => ({ x: index % width, y: Math.floor(index / width) }))
}

const rectangleGrowthCells = (amount: number): UnitCell[] => {
  if (amount <= 0 || amount % 2 !== 0) return compactGridCells(amount)
  const order = amount / 2
  return [
    ...rowCells(order + 1, order - 1),
    ...Array.from({ length: order - 1 }, (_, y) => ({ x: order, y })),
  ]
}

const diamondRingCells = (amount: number): UnitCell[] => {
  if (amount <= 0 || amount % 4 !== 0) return compactGridCells(amount)
  const radius = amount / 4
  return normalizedCells(Array.from({ length: radius * 2 + 1 }, (_, yIndex) => {
    const y = yIndex - radius
    const x = radius - Math.abs(y)
    return x === 0 ? [{ x: 0, y }] : [{ x: -x, y }, { x, y }]
  }).flat())
}

const hexagonRingCells = (amount: number): UnitCell[] => {
  if (amount <= 0 || amount % 6 !== 0) return compactGridCells(amount)
  const radius = amount / 6
  const outer = centeredHexagonCells(radius + 1)
  const inner = new Set(centeredHexagonCells(radius).map(cellKey))
  return normalizedCells(outer.filter(cell => !inner.has(cellKey(cell))))
}

export const growthPieceCells = (kind: SequenceKind, amount: number): UnitCell[] => {
  const count = Math.max(0, Math.floor(amount))
  switch (kind) {
    case 'evens': return stackedGroups(count, 2)
    case 'pairs': return stackedGroups(count, 2)
    case 'threes': return stackedGroups(count, 3)
    case 'fours': return Array.from({ length: count }, (_, index) => ({ x: index % 2, y: Math.floor(index / 2) }))
    case 'fives': return Array.from({ length: count }, (_, index) => ({ x: index % 5, y: Math.floor(index / 5) }))
    case 'doubling': return doublingCells(count)
    case 'rectangles': return rectangleGrowthCells(count)
    case 'centeredSquares': return diamondRingCells(count)
    case 'centeredHexagons': return hexagonRingCells(count)
    case 'squares': {
      if (count % 2 !== 1) return compactGridCells(count)
      const order = (count + 1) / 2
      return [...rowCells(order, order - 1), ...Array.from({ length: order - 1 }, (_, y) => ({ x: order - 1, y }))]
    }
    case 'counting':
    case 'triangles':
    case 'odds': return rowCells(count)
  }
}

export const cellBounds = (cells: readonly UnitCell[]): { readonly width: number; readonly height: number } => {
  if (cells.length === 0) return { width: 1, height: 1 }
  const xs = cells.map(cell => cell.x)
  const ys = cells.map(cell => cell.y)
  return {
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  }
}

export const figureViewBox = (cells: readonly UnitCell[]): string => {
  const bounds = cellBounds(cells)
  const minX = cells.length === 0 ? 0 : Math.min(...cells.map(cell => cell.x))
  const minY = cells.length === 0 ? 0 : Math.min(...cells.map(cell => cell.y))
  return `${minX * 20} ${minY * 20} ${bounds.width * 20} ${bounds.height * 20}`
}

export const puzzleAt = (index: number): GrowingNumbersPuzzle =>
  PUZZLES[normalizedPuzzleIndex(index)]!

export const normalizedPuzzleIndex = (index: number): number => {
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0
  return ((safeIndex % PUZZLES.length) + PUZZLES.length) % PUZZLES.length
}

export const equationFor = (puzzle: GrowingNumbersPuzzle): string =>
  `${previousTotalFor(puzzle)} + ${answerFor(puzzle)} = ${finalTotalFor(puzzle)}`

export const GameStatus = S.Union([S.Literal('choosing'), S.Literal('wrong'), S.Literal('correct')])
export type GameStatus = typeof GameStatus.Type

export const GameMode = S.Union([S.Literal('explore'), S.Literal('quiz')])
export type GameMode = typeof GameMode.Type

export const Model = S.Struct({
  puzzleIndex: S.Number,
  status: GameStatus,
  selectedAnswer: S.Number,
  animationPending: S.Boolean,
  animationToken: S.Number,
  mode: GameMode,
  revealedTermCounts: S.Array(S.Number),
})
export type Model = typeof Model.Type

export const init: Model = { puzzleIndex: 0, status: 'choosing', selectedAnswer: -1, animationPending: false, animationToken: 0, mode: 'explore', revealedTermCounts: PUZZLES.map(() => 1) }

export const ChooseGrowth = m('GrowingNumbersChooseGrowth', { amount: S.Number })
export const FinishGrowth = m('GrowingNumbersFinishGrowth', { puzzleIndex: S.Number, token: S.Number })
type FinishGrowthMessage = typeof FinishGrowth.Type
export const NextPuzzle = m('GrowingNumbersNextPuzzle')
export const PreviousPuzzle = m('GrowingNumbersPreviousPuzzle')
export const SetMode = m('GrowingNumbersSetMode', { mode: GameMode })
export const RevealNext = m('GrowingNumbersRevealNext')
export const SequenceScrolled = m('GrowingNumbersSequenceScrolled', { puzzleIndex: S.Number, revealedTermCount: S.Number })
export const SoundPlayed = m('GrowingNumbersSoundPlayed')
export const Message = S.Union([ChooseGrowth, FinishGrowth, NextPuzzle, PreviousPuzzle, SetMode, RevealNext, SequenceScrolled, SoundPlayed])
export type Message = typeof Message.Type

type SequenceScrolledMessage = typeof SequenceScrolled.Type

export const ScrollToNewest = Command.define(
  'GrowingNumbersScrollToNewest',
  { puzzleIndex: S.Number, revealedTermCount: S.Number },
  SequenceScrolled,
)(({ puzzleIndex, revealedTermCount }) => Effect.gen(function* () {
  yield* Render.afterCommit
  if (typeof document !== 'undefined') {
    const sequence = document.querySelector<HTMLElement>(
      `.growing-numbers-sequence--explore[data-puzzle-index="${puzzleIndex}"][data-revealed-term-count="${revealedTermCount}"]`,
    )
    if (sequence) {
      const left = Math.max(0, sequence.scrollWidth - sequence.clientWidth)
      const reducedMotion = typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (typeof sequence.scrollTo === 'function') sequence.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' })
      else sequence.scrollLeft = left
    }
  }
  return SequenceScrolled({ puzzleIndex, revealedTermCount }) satisfies SequenceScrolledMessage
}))

export const FlyGrowth = Command.define(
  'GrowingNumbersFlyGrowth',
  { puzzleIndex: S.Number, amount: S.Number, token: S.Number },
  FinishGrowth,
)(({ puzzleIndex, token }) => Effect.gen(function* () {
  yield* Render.afterCommit
  return yield* Effect.callback<FinishGrowthMessage>((resume) => {
    const layer = document.querySelector<HTMLElement>(`.growing-numbers-flight-layer[data-puzzle-index="${puzzleIndex}"][data-animation-token="${token}"]`)
    const card = layer?.closest('.growing-numbers-card')
    const flightDots = Array.from(layer?.querySelectorAll<HTMLElement>('.growing-numbers-flight-dot') ?? [])
    const sourceDots = Array.from(card?.querySelectorAll<Element>('.growing-numbers-answer--adding .growing-numbers-dot--choice') ?? [])
    const targetDots = Array.from(card?.querySelectorAll<Element>('.growing-numbers-target .growing-numbers-dot--arriving') ?? [])
    const sourceButton = card?.querySelector<Element>('.growing-numbers-answer--adding')
    let timeoutId: number | undefined
    let finished = false
    let lastFlight: HTMLElement | undefined

    const cleanup = (): void => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      lastFlight?.removeEventListener('animationend', finish)
    }
    const finish = (): void => {
      if (finished) return
      finished = true
      cleanup()
      resume(Effect.succeed(FinishGrowth({ puzzleIndex, token })))
    }

    const reducedMotion = typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!layer || !sourceButton || flightDots.length === 0 || sourceDots.length !== flightDots.length || targetDots.length !== flightDots.length || reducedMotion) {
      finish()
      return Effect.sync(cleanup)
    }

    const sourceRects = sourceDots.map(dot => dot.getBoundingClientRect())
    const targetRects = targetDots.map(dot => dot.getBoundingClientRect())
    const missingGeometry = [...sourceRects, ...targetRects].some(rect => rect.width <= 0 || rect.height <= 0)
    if (missingGeometry) {
      finish()
      return Effect.sync(cleanup)
    }

    for (const [index, flight] of flightDots.entries()) {
      const placement = flightPlacementFor(sourceRects[index]!, targetRects[index]!)
      flight.style.setProperty('--flight-start-x', `${placement.startX}px`)
      flight.style.setProperty('--flight-start-y', `${placement.startY}px`)
      flight.style.setProperty('--flight-delta-x', `${placement.deltaX}px`)
      flight.style.setProperty('--flight-delta-y', `${placement.deltaY}px`)
      flight.style.setProperty('--flight-width', `${placement.width}px`)
      flight.style.setProperty('--flight-height', `${placement.height}px`)
      flight.style.setProperty('--flight-start-scale', String(placement.startScale))
    }

    lastFlight = flightDots.at(-1)
    lastFlight?.addEventListener('animationend', finish)
    layer.classList.add('growing-numbers-flight-layer--ready')
    const lastDelay = flightDelayFor(flightDots.length - 1)
    timeoutId = window.setTimeout(finish, FLIGHT_DURATION_MS + lastDelay + 250)
    return Effect.sync(cleanup)
  })
}))

export const normalizedRevealedTermCounts = (model: Pick<Model, 'revealedTermCounts'>): number[] =>
  PUZZLES.map((_, index) => {
    const count = model.revealedTermCounts[index]
    if (count === undefined || !Number.isFinite(count)) return 1
    const normalized = Math.trunc(count)
    return Number.isSafeInteger(normalized) ? Math.max(1, normalized) : 1
  })

export const normalizedRevealedTermCount = (model: Pick<Model, 'puzzleIndex' | 'revealedTermCounts'>): number =>
  normalizedRevealedTermCounts(model)[normalizedPuzzleIndex(model.puzzleIndex)]!

const resetPuzzle = (model: Model, puzzleIndex: number): Model => ({
  puzzleIndex: normalizedPuzzleIndex(puzzleIndex),
  status: 'choosing',
  selectedAnswer: -1,
  animationPending: false,
  animationToken: Math.max(0, Math.trunc(model.animationToken)) + 1,
  mode: model.mode,
  revealedTermCounts: normalizedRevealedTermCounts(model),
})

const spokenNumber = (value: number, language: string): string => {
  try { return new Intl.NumberFormat(language).format(value) } catch { return String(value) }
}

const navigationCommands = (
  model: Model,
  language: string,
  muted: boolean,
  speech: SpeechOptions,
): ReadonlyArray<Command.Command<Message>> =>
  [
    ...(model.mode === 'explore' && normalizedRevealedTermCount(model) > 1
      ? [ScrollToNewest({ puzzleIndex: model.puzzleIndex, revealedTermCount: normalizedRevealedTermCount(model) })]
      : []),
    ...(muted ? [] : [speak(translate(puzzleAt(model.puzzleIndex).labelKey, language), SoundPlayed(), { ...speech, lang: language })]),
  ]

export const update = (
  model: Model,
  message: Message,
  language: string = 'en',
  muted: boolean = true,
  speech: SpeechOptions = {},
): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  switch (message._tag) {
    case 'GrowingNumbersChooseGrowth': {
      if (model.mode !== 'quiz' || model.status === 'correct') return [model, []]
      const puzzle = puzzleAt(model.puzzleIndex)
      if (!puzzle.candidates.includes(message.amount)) return [model, []]
      const correct = message.amount === answerFor(puzzle)
      const animationToken = correct ? Math.max(0, Math.trunc(model.animationToken)) + 1 : model.animationToken
      const feedback = translate(correct ? 'growingNumbersCorrect' : 'growingNumbersTryAgain', language)
      const audioCommands: ReadonlyArray<Command.Command<Message>> = muted
        ? []
        : [
            correct ? chime(SoundPlayed()) : boing(SoundPlayed()),
            speak(feedback, SoundPlayed(), { ...speech, lang: language }),
          ]
      return [
        { ...model, selectedAnswer: message.amount, status: correct ? 'correct' : 'wrong', animationPending: correct, animationToken },
        correct ? [FlyGrowth({ puzzleIndex: model.puzzleIndex, amount: message.amount, token: animationToken }), ...audioCommands] : audioCommands,
      ]
    }
    case 'GrowingNumbersFinishGrowth':
      return model.status === 'correct' && model.animationPending &&
        message.puzzleIndex === model.puzzleIndex && message.token === model.animationToken
        ? [{ ...model, animationPending: false }, []]
        : [model, []]
    case 'GrowingNumbersNextPuzzle': {
      const next = resetPuzzle(model, model.puzzleIndex + 1)
      return [next, navigationCommands(next, language, muted, speech)]
    }
    case 'GrowingNumbersPreviousPuzzle': {
      const next = resetPuzzle(model, model.puzzleIndex - 1)
      return [next, navigationCommands(next, language, muted, speech)]
    }
    case 'GrowingNumbersSetMode': {
      const label = translate(message.mode === 'explore' ? 'growingNumbersExplore' : 'growingNumbersQuiz', language)
      const speechCommands = muted ? [] : [speak(label, SoundPlayed(), { ...speech, lang: language })]
      if (message.mode === model.mode) return [model, speechCommands]
      const revealedTermCount = normalizedRevealedTermCount(model)
      const next = { ...resetPuzzle(model, model.puzzleIndex), mode: message.mode }
      const scrollCommands = message.mode === 'explore' && revealedTermCount > 1
        ? [ScrollToNewest({ puzzleIndex: next.puzzleIndex, revealedTermCount })]
        : []
      return [next, [...scrollCommands, ...speechCommands]]
    }
    case 'GrowingNumbersRevealNext': {
      if (model.mode !== 'explore') return [model, []]
      const puzzle = puzzleAt(model.puzzleIndex)
      const current = normalizedRevealedTermCount(model)
      const revealedTermCount = current + 1
      const puzzleIndex = normalizedPuzzleIndex(model.puzzleIndex)
      const revealedTermCounts = normalizedRevealedTermCounts(model)
      revealedTermCounts[puzzleIndex] = revealedTermCount
      const next = { ...model, puzzleIndex, revealedTermCounts }
      const total = sequenceTermAt(puzzle.kind, revealedTermCount - 1)
      return [next, [
        ScrollToNewest({ puzzleIndex, revealedTermCount }),
        ...(muted ? [] : [speak(spokenNumber(total, language), SoundPlayed(), { ...speech, lang: language })]),
      ]]
    }
    case 'GrowingNumbersSequenceScrolled': return [model, []]
    case 'GrowingNumbersSoundPlayed': return [model, []]
  }
}

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const puzzle = puzzleAt(model.puzzleIndex)
  const priorCells = cellsForTotal(puzzle.kind, previousTotalFor(puzzle))
  const nextCells = cellsForTotal(puzzle.kind, finalTotalFor(puzzle))
  const newCells = spatiallySortedCells(growthCells(puzzle))
  const sequenceViewBox = figureViewBox(nextCells)
  const answerLayouts = puzzle.candidates.map(amount => spatiallySortedCells(growthPieceCells(puzzle.kind, amount)))
  const answerBounds = answerLayouts.reduce((bounds, cells) => {
    const next = cellBounds(cells)
    return { width: Math.max(bounds.width, next.width), height: Math.max(bounds.height, next.height) }
  }, { width: 1, height: 1 })
  const answerViewBox = `0 0 ${answerBounds.width * 20} ${answerBounds.height * 20}`
  const circle = (cell: UnitCell, className: string, key: string, flightIndex?: number) => h.circle([
    h.Key(key), h.Class(className), h.Cx(String(cell.x * 20 + 10)), h.Cy(String(cell.y * 20 + 10)), h.R('7'),
    ...(flightIndex === undefined ? [] : [h.Style({ '--flight-delay': `${flightDelayFor(flightIndex)}ms` })]),
  ], [])
  const figure = (cells: readonly UnitCell[], className: string, viewBox: string) => h.svg([
    h.Class('growing-numbers-figure'), h.ViewBox(viewBox), h.Attribute('aria-hidden', 'true'), h.Attribute('focusable', 'false'),
  ], cells.map((cell, index) => circle(cell, className, `${cellKey(cell)}:${index}`)))
  const sequenceFigure = (total: number, index: number) => {
    const grid = sequenceGridForTotal(puzzle.kind, total)
    if (!grid) {
      const cells = cellsForTotal(puzzle.kind, total)
      return figure(cells, 'growing-numbers-dot', figureViewBox(cells))
    }
    const patternId = `growing-numbers-grid-${model.puzzleIndex}-${index}`
    const width = grid.columns * 20
    const height = grid.rows * 20
    return h.svg([
      h.Class('growing-numbers-figure'), h.ViewBox(`0 0 ${width} ${height}`),
      h.Attribute('aria-hidden', 'true'), h.Attribute('focusable', 'false'),
    ], [
      h.defs([], [
        h.pattern([
          h.Id(patternId), h.X('0'), h.Y('0'), h.Width('20'), h.Height('20'),
          h.Attribute('patternUnits', 'userSpaceOnUse'),
        ], [h.circle([h.Class('growing-numbers-dot'), h.Cx('10'), h.Cy('10'), h.R('7')], [])]),
      ]),
      h.rect([h.X('0'), h.Y('0'), h.Width(String(width)), h.Height(String(height)), h.Fill(`url(#${patternId})`)], []),
    ])
  }
  const quiz = model.mode === 'quiz'
  const flying = quiz && model.status === 'correct' && model.animationPending
  const complete = quiz && model.status === 'correct' && !model.animationPending
  const locked = quiz && model.status === 'correct'
  const revealedTermCount = normalizedRevealedTermCount(model)
  const puzzleIndex = normalizedPuzzleIndex(model.puzzleIndex)

  return h.div([h.Class('page growing-numbers-page')], [
    h.div([h.Class('card growing-numbers-card')], [
      h.h1([h.Class('title')], [translate('growingNumbersTitle', language)]),
      h.div([h.Class('growing-numbers-toolbar')], [
        h.span([h.Class('growing-numbers-level')], [translate(puzzle.labelKey, language)]),
        h.div([h.Class('growing-numbers-modes'), h.Attribute('role', 'group'), h.AriaLabel(translate('growingNumbersTitle', language))], [
          h.button([
            h.Class(`growing-numbers-mode${!quiz ? ' growing-numbers-mode--active' : ''}`),
            h.OnClick(SetMode({ mode: 'explore' })), h.AriaPressed(!quiz ? 'true' : 'false'),
          ], [translate('growingNumbersExplore', language)]),
          h.button([
            h.Class(`growing-numbers-mode${quiz ? ' growing-numbers-mode--active' : ''}`),
            h.OnClick(SetMode({ mode: 'quiz' })), h.AriaPressed(quiz ? 'true' : 'false'),
          ], [translate('growingNumbersQuiz', language)]),
        ]),
      ]),
      h.p([h.Class('growing-numbers-prompt')], [translate(quiz ? 'growingNumbersPrompt' : 'growingNumbersExplorePrompt', language)]),
      h.ol([
        h.Class(`growing-numbers-sequence ${quiz ? 'growing-numbers-sequence--quiz' : 'growing-numbers-sequence--explore'}`),
        h.AriaLabel(translate(quiz ? 'growingNumbersPrompt' : 'growingNumbersExplorePrompt', language)),
        ...(quiz ? [] : [h.Attribute('aria-live', 'polite'), h.Attribute('aria-relevant', 'additions'), h.Attribute('tabindex', '0')]),
        h.Attribute('dir', 'ltr'),
        h.DataAttribute('puzzle-index', String(puzzleIndex)),
        h.DataAttribute('revealed-term-count', String(revealedTermCount)),
        h.Style({ '--growing-numbers-columns': String(puzzle.terms.length) }),
      ], [
        ...(quiz
          ? [
              ...puzzle.terms.slice(0, -1).map((total, index) => h.li([h.Class('growing-numbers-term'), h.Key(`${puzzle.kind}:${index}`)], [
                figure(cellsForTotal(puzzle.kind, total), 'growing-numbers-dot', sequenceViewBox),
                h.span([h.Class('growing-numbers-total')], [String(total)]),
              ])),
              h.li([
                h.Class(`growing-numbers-term growing-numbers-target${flying ? ' growing-numbers-target--flying' : complete ? ' growing-numbers-target--complete' : ''}`),
                h.Key(`${puzzle.kind}:${model.status}:${model.animationPending}`),
                h.Attribute('aria-busy', flying ? 'true' : 'false'),
              ], [
                h.svg([h.Class('growing-numbers-figure'), h.ViewBox(sequenceViewBox), h.Attribute('aria-hidden', 'true'), h.Attribute('focusable', 'false')], [
                  ...priorCells.map((cell, index) => circle(cell, 'growing-numbers-dot growing-numbers-dot--old', `old:${cellKey(cell)}:${index}`)),
                  ...newCells.map((cell, index) => circle(
                    cell,
                    flying
                      ? 'growing-numbers-dot growing-numbers-dot--arriving'
                      : complete
                        ? 'growing-numbers-dot growing-numbers-dot--new'
                        : 'growing-numbers-dot growing-numbers-dot--ghost',
                    `new:${cellKey(cell)}:${index}`,
                    flying ? index : undefined,
                  )),
                ]),
                h.span([h.Class('growing-numbers-total')], [complete ? String(finalTotalFor(puzzle)) : '?']),
              ]),
            ]
          : Array.from({ length: revealedTermCount }, (_, index) => sequenceTermAt(puzzle.kind, index)).map((total, index) => h.li([
              h.Class(`growing-numbers-term${index === revealedTermCount - 1 ? ' growing-numbers-term--revealed' : ''}`),
              h.Key(`${puzzle.kind}:explore:${index}`),
              h.DataAttribute('term-index', String(index)), h.DataAttribute('total', String(total)),
              h.Attribute('aria-current', index === revealedTermCount - 1 ? 'step' : 'false'),
            ], [
              sequenceFigure(total, index),
              h.span([h.Class('growing-numbers-total')], [String(total)]),
            ]))),
      ]),
      quiz ? h.div([h.Class('growing-numbers-answers'), h.Attribute('role', 'group'), h.AriaLabel(translate('growingNumbersPrompt', language))], [
        ...puzzle.candidates.map((amount, index) => h.button([
          h.Class(`growing-numbers-answer${model.selectedAnswer === amount && model.status === 'wrong' ? ' growing-numbers-answer--wrong' : ''}${flying && amount === answerFor(puzzle) ? ' growing-numbers-answer--adding' : ''}${complete && amount === answerFor(puzzle) ? ' growing-numbers-answer--correct' : ''}`),
          h.OnClick(ChooseGrowth({ amount })), h.Disabled(locked), h.AriaLabel(`+ ${amount}`), h.AriaPressed(model.selectedAnswer === amount ? 'true' : 'false'), h.DataAttribute('answer', String(amount)), h.Key(`${puzzle.kind}:${amount}`),
        ], [
          figure(answerLayouts[index] ?? [], 'growing-numbers-dot growing-numbers-dot--choice', answerViewBox),
          h.span([h.Class('growing-numbers-answer-number')], [`+${amount}`]),
        ])),
      ]) : null,
      flying ? h.div([
        h.Class('growing-numbers-flight-layer'),
        h.Attribute('aria-hidden', 'true'),
        h.DataAttribute('puzzle-index', String(model.puzzleIndex)),
        h.DataAttribute('animation-token', String(model.animationToken)),
        h.Key(`${puzzle.kind}:${model.puzzleIndex}:${model.animationToken}:flight`),
      ], newCells.map((cell, index) => h.span([
        h.Class('growing-numbers-flight-dot'),
        h.DataAttribute('flight-index', String(index)),
        h.DataAttribute('target-x', String(cell.x)),
        h.DataAttribute('target-y', String(cell.y)),
        h.Style({ '--flight-delay': `${flightDelayFor(index)}ms` }),
        h.Key(`flight:${cellKey(cell)}:${index}`),
      ], []))) : null,
      !quiz ? h.button([
        h.Class('btn btn-primary growing-numbers-reveal'),
        h.OnClick(RevealNext()),
      ], [translate('growingNumbersRevealNext', language)]) : null,
      quiz ? h.div([h.Class('growing-numbers-feedback'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite')], [
        quiz && model.status === 'wrong' ? translate('growingNumbersTryAgain', language) : quiz && complete ? translate('growingNumbersCorrect', language) : '',
      ]) : null,
      quiz ? h.div([h.Class('growing-numbers-equation')], [complete ? equationFor(puzzle) : '\u00a0']) : null,
      h.div([h.Class('growing-numbers-actions')], [
        h.button([h.Class('btn btn-secondary growing-numbers-previous'), h.OnClick(PreviousPuzzle())], [
          translate('growingNumbersPrevious', language),
        ]),
        h.button([h.Class('btn btn-primary growing-numbers-next'), h.OnClick(NextPuzzle())], [
          translate('growingNumbersNext', language),
        ]),
      ]),
    ]),
  ])
}
