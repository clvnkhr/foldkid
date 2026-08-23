import { Effect, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { t, type StringKey } from '../i18n'

export const SequenceKind = S.Union([
  S.Literal('counting'),
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
  | 'sequenceCounting'
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
  readonly terms: readonly [number, number, number, number]
  readonly candidates: readonly [number, number, number]
}

export const PUZZLES = [
  { kind: 'counting', labelKey: 'sequenceCounting', terms: [1, 2, 3, 4], candidates: [2, 1, 3] },
  { kind: 'pairs', labelKey: 'sequencePairs', terms: [2, 4, 6, 8], candidates: [1, 3, 2] },
  { kind: 'triangles', labelKey: 'sequenceTriangles', terms: [1, 3, 6, 10], candidates: [5, 3, 4] },
  { kind: 'squares', labelKey: 'sequenceSquares', terms: [1, 4, 9, 16], candidates: [9, 7, 5] },
  { kind: 'fives', labelKey: 'sequenceFives', terms: [5, 10, 15, 20], candidates: [4, 6, 5] },
  { kind: 'threes', labelKey: 'sequenceThrees', terms: [3, 6, 9, 12], candidates: [4, 3, 2] },
  { kind: 'fours', labelKey: 'sequenceFours', terms: [4, 8, 12, 16], candidates: [6, 4, 2] },
  { kind: 'odds', labelKey: 'sequenceOdds', terms: [1, 3, 5, 7], candidates: [3, 1, 2] },
  { kind: 'doubling', labelKey: 'sequenceDoubling', terms: [1, 2, 4, 8], candidates: [2, 6, 4] },
  { kind: 'rectangles', labelKey: 'sequenceRectangles', terms: [2, 6, 12, 20], candidates: [6, 10, 8] },
  { kind: 'centeredSquares', labelKey: 'sequenceCenteredSquares', terms: [1, 5, 13, 25], candidates: [8, 12, 10] },
  { kind: 'centeredHexagons', labelKey: 'sequenceCenteredHexagons', terms: [1, 7, 19, 37], candidates: [16, 12, 18] },
] as const satisfies readonly GrowingNumbersPuzzle[]

const FALLBACK_TEXT: Record<GrowingNumbersKey, string> = {
  growingNumbersTitle: 'Growing Numbers',
  growingNumbersPrompt: 'What grows next?',
  growingNumbersTryAgain: 'Try again',
  growingNumbersCorrect: 'Correct!',
  growingNumbersNext: 'Next',
  sequenceCounting: 'Counting',
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

const cellKey = (cell: UnitCell): string => `${cell.x}:${cell.y}`

export const spatiallySortedCells = (cells: readonly UnitCell[]): UnitCell[] =>
  cells
    .map((cell, index) => ({ cell, index }))
    .sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x || a.index - b.index)
    .map(({ cell }) => cell)

export const growthCells = (puzzle: GrowingNumbersPuzzle): UnitCell[] => {
  const old = new Set(cellsForTotal(puzzle.kind, puzzle.terms[2]).map(cellKey))
  return cellsForTotal(puzzle.kind, puzzle.terms[3]).filter(cell => !old.has(cellKey(cell)))
}

export const answerFor = (puzzle: GrowingNumbersPuzzle): number =>
  puzzle.terms[3] - puzzle.terms[2]

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
  PUZZLES[((Math.floor(index) % PUZZLES.length) + PUZZLES.length) % PUZZLES.length]!

export const equationFor = (puzzle: GrowingNumbersPuzzle): string =>
  `${puzzle.terms[2]} + ${answerFor(puzzle)} = ${puzzle.terms[3]}`

export const GameStatus = S.Union([S.Literal('choosing'), S.Literal('wrong'), S.Literal('correct')])
export type GameStatus = typeof GameStatus.Type

export const Model = S.Struct({
  puzzleIndex: S.Number,
  status: GameStatus,
  selectedAnswer: S.Number,
  animationPending: S.Boolean,
})
export type Model = typeof Model.Type

export const init: Model = { puzzleIndex: 0, status: 'choosing', selectedAnswer: -1, animationPending: false }

export const ChooseGrowth = m('GrowingNumbersChooseGrowth', { amount: S.Number })
export const FinishGrowth = m('GrowingNumbersFinishGrowth')
type FinishGrowthMessage = typeof FinishGrowth.Type
export const NextPuzzle = m('GrowingNumbersNextPuzzle')
export const Message = S.Union([ChooseGrowth, FinishGrowth, NextPuzzle])
export type Message = typeof Message.Type

export const FlyGrowth = Command.define(
  'GrowingNumbersFlyGrowth',
  { puzzleIndex: S.Number, amount: S.Number },
  FinishGrowth,
)(({ puzzleIndex }) => Effect.gen(function* () {
  yield* Render.afterCommit
  return yield* Effect.callback<FinishGrowthMessage>((resume) => {
    const layer = document.querySelector<HTMLElement>(`.growing-numbers-flight-layer[data-puzzle-index="${puzzleIndex}"]`)
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
      resume(Effect.succeed(FinishGrowth()))
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

export const update = (model: Model, message: Message): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  switch (message._tag) {
    case 'GrowingNumbersChooseGrowth': {
      if (model.status === 'correct') return [model, []]
      const puzzle = puzzleAt(model.puzzleIndex)
      if (!puzzle.candidates.includes(message.amount)) return [model, []]
      const correct = message.amount === answerFor(puzzle)
      return [
        { ...model, selectedAnswer: message.amount, status: correct ? 'correct' : 'wrong', animationPending: correct },
        correct ? [FlyGrowth({ puzzleIndex: model.puzzleIndex, amount: message.amount })] : [],
      ]
    }
    case 'GrowingNumbersFinishGrowth':
      return model.status === 'correct' && model.animationPending
        ? [{ ...model, animationPending: false }, []]
        : [model, []]
    case 'GrowingNumbersNextPuzzle':
      return model.status !== 'correct' || model.animationPending
        ? [model, []]
        : [{ puzzleIndex: (model.puzzleIndex + 1) % PUZZLES.length, status: 'choosing', selectedAnswer: -1, animationPending: false }, []]
  }
}

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const puzzle = puzzleAt(model.puzzleIndex)
  const priorCells = cellsForTotal(puzzle.kind, puzzle.terms[2])
  const nextCells = cellsForTotal(puzzle.kind, puzzle.terms[3])
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
  const flying = model.status === 'correct' && model.animationPending
  const complete = model.status === 'correct' && !model.animationPending
  const locked = model.status === 'correct'

  return h.div([h.Class('page growing-numbers-page')], [
    h.div([h.Class('card growing-numbers-card')], [
      h.h1([h.Class('title')], [translate('growingNumbersTitle', language)]),
      h.span([h.Class('growing-numbers-level')], [translate(puzzle.labelKey, language)]),
      h.p([h.Class('growing-numbers-prompt')], [translate('growingNumbersPrompt', language)]),
      h.ol([h.Class('growing-numbers-sequence'), h.AriaLabel(translate('growingNumbersPrompt', language))], [
        ...puzzle.terms.slice(0, 3).map((total, index) => h.li([h.Class('growing-numbers-term'), h.Key(`${puzzle.kind}:${index}`)], [
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
          h.span([h.Class('growing-numbers-total')], [complete ? String(puzzle.terms[3]) : '?']),
        ]),
      ]),
      h.div([h.Class('growing-numbers-answers'), h.Attribute('role', 'group'), h.AriaLabel(translate('growingNumbersPrompt', language))], [
        ...puzzle.candidates.map((amount, index) => h.button([
          h.Class(`growing-numbers-answer${model.selectedAnswer === amount && model.status === 'wrong' ? ' growing-numbers-answer--wrong' : ''}${flying && amount === answerFor(puzzle) ? ' growing-numbers-answer--adding' : ''}${complete && amount === answerFor(puzzle) ? ' growing-numbers-answer--correct' : ''}`),
          h.OnClick(ChooseGrowth({ amount })), h.Disabled(locked), h.AriaLabel(`+ ${amount}`), h.AriaPressed(model.selectedAnswer === amount ? 'true' : 'false'), h.DataAttribute('answer', String(amount)), h.Key(`${puzzle.kind}:${amount}`),
        ], [
          figure(answerLayouts[index] ?? [], 'growing-numbers-dot growing-numbers-dot--choice', answerViewBox),
          h.span([h.Class('growing-numbers-answer-number')], [`+${amount}`]),
        ])),
      ]),
      flying ? h.div([
        h.Class('growing-numbers-flight-layer'),
        h.Attribute('aria-hidden', 'true'),
        h.DataAttribute('puzzle-index', String(model.puzzleIndex)),
        h.Key(`${puzzle.kind}:${model.puzzleIndex}:flight`),
      ], newCells.map((cell, index) => h.span([
        h.Class('growing-numbers-flight-dot'),
        h.DataAttribute('flight-index', String(index)),
        h.DataAttribute('target-x', String(cell.x)),
        h.DataAttribute('target-y', String(cell.y)),
        h.Style({ '--flight-delay': `${flightDelayFor(index)}ms` }),
        h.Key(`flight:${cellKey(cell)}:${index}`),
      ], []))) : null,
      h.div([h.Class('growing-numbers-feedback'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite')], [
        model.status === 'wrong' ? translate('growingNumbersTryAgain', language) : complete ? translate('growingNumbersCorrect', language) : '',
      ]),
      h.div([h.Class('growing-numbers-equation')], [complete ? equationFor(puzzle) : '\u00a0']),
      h.button([h.Class('btn btn-primary growing-numbers-next'), h.OnClick(NextPuzzle()), h.Disabled(!complete)], [
        translate('growingNumbersNext', language),
      ]),
    ]),
  ])
}
