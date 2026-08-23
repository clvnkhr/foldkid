import { Effect, Option, Schema as S } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { Scene } from 'foldkit/test'

import {
  Message,
  Model,
  NextPuzzle,
  PieceFlightFinished,
  ReplayPuzzle,
  TapPiece,
  WORKSHOP_PUZZLES,
  boundsContain,
  currentPuzzle,
  geometryArea,
  geometryBounds,
  geometryPath,
  geometryScreenRect,
  init,
  isPuzzleComplete,
  normalizePuzzleIndex,
  normalizeRoundIndex,
  polygonArea,
  puzzleHasExactCoverage,
  puzzlePieceArea,
  update,
  validFlyingPieceIds,
  validPlacedPieceIds,
  view,
  type Point,
  type PolygonGeometry,
  type WorkshopPuzzle,
} from './shapeWorkshop'

const byId = (id: string): WorkshopPuzzle => {
  const puzzle = WORKSHOP_PUZZLES.find(candidate => candidate.id === id)
  if (!puzzle) throw new Error(`Missing puzzle: ${id}`)
  return puzzle
}

const polygonForTest = (...points: Point[]): PolygonGeometry => ({ kind: 'polygon', points })

const edgeLengths = (points: readonly Point[]): number[] => points.map(([x, y], index) => {
  const [nextX, nextY] = points[(index + 1) % points.length] ?? [x, y]
  return Math.hypot(nextX - x, nextY - y)
})

const expectEquilateral = (geometry: PolygonGeometry, side: number): void => {
  expect(geometry.points).toHaveLength(3)
  for (const length of edgeLengths(geometry.points)) expect(length).toBeCloseTo(side, 10)
  expect(polygonArea(geometry.points)).toBeCloseTo(side * side * Math.sqrt(3) / 4, 10)
}

describe('Shape Workshop geometry', () => {
  it('contains a broad deterministic catalogue of exact silhouette recipes', () => {
    expect(WORKSHOP_PUZZLES.map(puzzle => [puzzle.id, puzzle.pieces.length, puzzle.nameKey])).toStrictEqual([
      ['triangles-square', 2, 'shapeSquare'],
      ['semicircles-circle', 2, 'shapeCircle'],
      ['triangles-rhombus', 2, 'shapeRhombus'],
      ['triangles-trapezoid', 3, 'shapeTrapezoid'],
      ['triangles-large-triangle', 4, 'shapeTriangle'],
      ['triangles-hexagon', 6, 'shapeHexagon'],
      ['squares-large-square', 4, 'shapeSquare'],
      ['squares-rectangle', 2, 'shapeRectangle'],
      ['rectangles-square', 2, 'shapeSquare'],
      ['triangles-rectangle', 2, 'shapeRectangle'],
      ['rhombi-hexagon', 3, 'shapeHexagon'],
      ['trapezoids-hexagon', 2, 'shapeHexagon'],
      ['triangles-pentagon', 5, 'shapePentagon'],
      ['triangles-octagon', 8, 'shapeOctagon'],
      ['trapezoids-square', 2, 'shapeSquare'],
      ['triangles-square-pinwheel', 4, 'shapeSquare'],
      ['rhombi-large-rhombus', 4, 'shapeRhombus'],
      ['rectangles-rectangle-mosaic', 4, 'shapeRectangle'],
      ['trapezoids-rectangle', 2, 'shapeRectangle'],
      ['pentagons-hexagon', 2, 'shapeHexagon'],
      ['triangle-and-trapezoid-triangle', 2, 'shapeTriangle'],
      ['mixed-octagon-mosaic', 9, 'shapeOctagon'],
    ])
    expect(WORKSHOP_PUZZLES.length).toBeGreaterThanOrEqual(16)
    expect(new Set(WORKSHOP_PUZZLES.map(puzzle => puzzle.id)).size).toBe(WORKSHOP_PUZZLES.length)
    expect(new Set(WORKSHOP_PUZZLES.map(puzzle => puzzle.nameKey))).toEqual(new Set([
      'shapeCircle', 'shapeTriangle', 'shapeSquare', 'shapeRectangle', 'shapePentagon', 'shapeHexagon', 'shapeOctagon', 'shapeRhombus', 'shapeTrapezoid',
    ]))
  })

  it('covers every silhouette exactly with in-bounds pieces and valid SVG paths', () => {
    for (const puzzle of WORKSHOP_PUZZLES) {
      const outerBounds = geometryBounds(puzzle.silhouette)
      expect(puzzleHasExactCoverage(puzzle), puzzle.id).toBe(true)
      expect(puzzlePieceArea(puzzle), puzzle.id).toBeCloseTo(geometryArea(puzzle.silhouette), 8)
      expect(geometryPath(puzzle.silhouette), puzzle.id).toMatch(/^M .+ Z$/)
      expect(geometryPath(puzzle.silhouette), puzzle.id).not.toMatch(/NaN|Infinity/)

      for (const piece of puzzle.pieces) {
        expect(boundsContain(outerBounds, geometryBounds(piece.geometry)), puzzle.id).toBe(true)
        expect(geometryArea(piece.geometry), puzzle.id).toBeGreaterThan(0)
        expect(geometryPath(piece.geometry), puzzle.id).toMatch(/^M .+ Z$/)
        expect(geometryPath(piece.geometry), puzzle.id).not.toMatch(/NaN|Infinity/)
      }
    }
  })

  it('rejects equal-area recipes that overlap pieces or leave the silhouette', () => {
    const overlapAndGap: WorkshopPuzzle = {
      id: 'overlap-and-gap', nameKey: 'shapeSquare', icon: '■',
      silhouette: polygonForTest([0, 0], [10, 0], [10, 10], [0, 10]),
      pieces: [
        { geometry: polygonForTest([0, 0], [5, 0], [5, 10], [0, 10]), nameKey: 'shapeRectangle', color: '#000' },
        { geometry: polygonForTest([0, 0], [5, 0], [5, 10], [0, 10]), nameKey: 'shapeRectangle', color: '#fff' },
      ],
    }
    const outside: WorkshopPuzzle = {
      id: 'outside', nameKey: 'shapeSquare', icon: '■',
      silhouette: polygonForTest([0, 0], [10, 0], [10, 10], [0, 10]),
      pieces: [
        { geometry: polygonForTest([-5, 0], [5, 0], [5, 10], [-5, 10]), nameKey: 'shapeRectangle', color: '#000' },
      ],
    }
    expect(puzzlePieceArea(overlapAndGap)).toBe(geometryArea(overlapAndGap.silhouette))
    expect(puzzleHasExactCoverage(overlapAndGap)).toBe(false)
    expect(puzzleHasExactCoverage(outside)).toBe(false)
  })

  it('uses two congruent right-isosceles triangles for the first square', () => {
    const puzzle = byId('triangles-square')
    expect(geometryArea(puzzle.silhouette)).toBe(140 * 140)
    for (const piece of puzzle.pieces) {
      if (piece.geometry.kind !== 'polygon') throw new Error('Expected polygon')
      const lengths = edgeLengths(piece.geometry.points).sort((a, b) => a - b)
      expect(lengths[0]).toBeCloseTo(140, 10)
      expect(lengths[1]).toBeCloseTo(140, 10)
      expect(lengths[2]).toBeCloseTo(140 * Math.sqrt(2), 10)
      expect(geometryArea(piece.geometry)).toBe(140 * 140 / 2)
    }
  })

  it('uses complementary exact semicircles for the circle', () => {
    const puzzle = byId('semicircles-circle')
    expect(puzzle.pieces.map(piece => piece.nameKey)).toStrictEqual(['shapeSemicircle', 'shapeSemicircle'])
    expect(geometryArea(puzzle.silhouette)).toBeCloseTo(Math.PI * 70 * 70, 10)
    expect(puzzle.pieces.every(piece => piece.geometry.kind === 'path')).toBe(true)
    for (const piece of puzzle.pieces) expect(geometryArea(piece.geometry)).toBeCloseTo(Math.PI * 70 * 70 / 2, 10)
    expect(geometryBounds(puzzle.pieces[0]!.geometry)).toStrictEqual({ x: 50, y: 30, width: 140, height: 70 })
    expect(geometryBounds(puzzle.pieces[1]!.geometry)).toStrictEqual({ x: 50, y: 100, width: 140, height: 70 })
    expect(geometryPath(puzzle.pieces[0]!.geometry)).toContain('A 70 70 0 0 1')
    expect(geometryPath(puzzle.pieces[1]!.geometry)).toContain('A 70 70 0 0 0')
  })

  it('uses equilateral triangles at the exact side length for every triangular tiling', () => {
    const cases = [
      ['triangles-rhombus', 100],
      ['triangles-trapezoid', 80],
      ['triangles-large-triangle', 80],
      ['triangles-hexagon', 70],
    ] as const

    for (const [id, side] of cases) {
      for (const piece of byId(id).pieces) {
        if (piece.geometry.kind !== 'polygon') throw new Error(`Expected polygon in ${id}`)
        expectEquilateral(piece.geometry, side)
      }
    }
  })

  it('makes the hexagon regular and the final four pieces exact 70-unit squares', () => {
    const hexagon = byId('triangles-hexagon').silhouette
    if (hexagon.kind !== 'polygon') throw new Error('Expected polygon hexagon')
    expect(hexagon.points).toHaveLength(6)
    for (const edge of edgeLengths(hexagon.points)) expect(edge).toBeCloseTo(70, 10)
    expect(geometryArea(hexagon)).toBeCloseTo(3 * Math.sqrt(3) * 70 * 70 / 2, 10)

    for (const piece of byId('squares-large-square').pieces) {
      if (piece.geometry.kind !== 'polygon') throw new Error('Expected square polygon')
      expect(piece.geometry.points).toHaveLength(4)
      for (const edge of edgeLengths(piece.geometry.points)) expect(edge).toBeCloseTo(70, 10)
      expect(geometryArea(piece.geometry)).toBe(70 * 70)
    }
  })

  it('uses exact squares, rectangles, diamonds, trapezoids, pentagons, and octagons in the new recipes', () => {
    const squareRectangle = byId('squares-rectangle')
    expect(squareRectangle.pieces.map(piece => geometryArea(piece.geometry))).toStrictEqual([90 * 90, 90 * 90])

    const rectangleSquare = byId('rectangles-square')
    expect(rectangleSquare.pieces.map(piece => geometryArea(piece.geometry))).toStrictEqual([140 * 70, 140 * 70])

    const rhombusHexagon = byId('rhombi-hexagon')
    for (const piece of rhombusHexagon.pieces) {
      if (piece.geometry.kind !== 'polygon') throw new Error('Expected a rhombus polygon')
      expect(piece.geometry.points).toHaveLength(4)
      for (const edge of edgeLengths(piece.geometry.points)) expect(edge).toBeCloseTo(70, 10)
      expect(piece.nameKey).toBe('shapeRhombus')
    }

    for (const id of ['trapezoids-hexagon', 'trapezoids-square', 'trapezoids-rectangle']) {
      const trapezoids = byId(id)
      expect(trapezoids.pieces).toHaveLength(2)
      expect(trapezoids.pieces.every(piece => piece.nameKey === 'shapeTrapezoid')).toBe(true)
      expect(trapezoids.pieces.map(piece => geometryArea(piece.geometry)).reduce((sum, area) => sum + area, 0))
        .toBeCloseTo(geometryArea(trapezoids.silhouette), 10)
    }

    for (const [id, sides] of [['triangles-pentagon', 5], ['triangles-octagon', 8]] as const) {
      const radial = byId(id)
      if (radial.silhouette.kind !== 'polygon') throw new Error(`Expected a polygon in ${id}`)
      expect(radial.silhouette.points).toHaveLength(sides)
      expect(radial.pieces).toHaveLength(sides)
      const edges = edgeLengths(radial.silhouette.points)
      for (const edge of edges) expect(edge).toBeCloseTo(edges[0]!, 10)
    }

    const pentagonHexagon = byId('pentagons-hexagon')
    expect(pentagonHexagon.pieces.map(piece => piece.nameKey)).toStrictEqual(['shapePentagon', 'shapePentagon'])
    for (const piece of pentagonHexagon.pieces) {
      expect(geometryArea(piece.geometry)).toBeCloseTo(geometryArea(pentagonHexagon.silhouette) / 2, 10)
    }

    expect(byId('triangle-and-trapezoid-triangle').pieces.map(piece => piece.nameKey)).toStrictEqual([
      'shapeTriangle', 'shapeTrapezoid',
    ])
    expect(byId('mixed-octagon-mosaic').pieces.map(piece => piece.nameKey)).toStrictEqual([
      'shapeSquare',
      'shapeRectangle', 'shapeRectangle', 'shapeRectangle', 'shapeRectangle',
      'shapeTriangle', 'shapeTriangle', 'shapeTriangle', 'shapeTriangle',
    ])
  })

  it('handles empty polygons and tolerance-aware bound checks', () => {
    const empty: PolygonGeometry = { kind: 'polygon', points: [] }
    expect(polygonArea([])).toBe(0)
    expect(geometryPath(empty)).toBe('')
    expect(geometryBounds(empty)).toStrictEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(boundsContain({ x: 0, y: 0, width: 10, height: 10 }, { x: -1e-9, y: 0, width: 10, height: 10 })).toBe(true)
  })

  it('maps SVG geometry through centered meet scaling into exact screen coordinates', () => {
    expect(geometryScreenRect(
      { left: 10, top: 20, width: 200, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 25, y: 20, width: 50, height: 60 },
    )).toStrictEqual({ left: 85, top: 40, width: 50, height: 60 })
    expect(geometryScreenRect(
      { left: 4, top: 6, width: 0, height: 10 },
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 20, height: 20 },
    )).toStrictEqual({ left: 4, top: 6, width: 0, height: 10 })
  })
})

describe('Shape Workshop update', () => {
  it('starts at the first empty puzzle and decodes through its schema', () => {
    expect(init).toStrictEqual({ roundIndex: 0, placedPieceIds: [], flyingPieceTokens: [], animationToken: 0, revision: 0 })
    expect(currentPuzzle(init).id).toBe('triangles-square')
    expect(isPuzzleComplete(init)).toBe(false)
    expect(Option.isSome(S.decodeUnknownOption(Model)(init))).toBe(true)
  })

  it('flies tapped pieces in any order and only places each one after landing', () => {
    const [flyingOne, oneCommands] = update(init, TapPiece({ index: 1 }))
    expect(flyingOne).toMatchObject({ placedPieceIds: [], animationToken: 1 })
    expect(flyingOne.flyingPieceTokens).toStrictEqual([-1, 1])
    expect(flyingOne.flyingPieceTokens[1]).toBe(1)
    expect(Option.isSome(S.decodeUnknownOption(Model)(flyingOne))).toBe(true)
    expect(oneCommands.map(command => command.name)).toStrictEqual(['ShapeWorkshopFlyPiece'])
    expect(isPuzzleComplete(flyingOne)).toBe(false)

    const [wrongLanding] = update(flyingOne, PieceFlightFinished({ index: 1, token: 999 }))
    expect(wrongLanding).toBe(flyingOne)
    const [one] = update(flyingOne, PieceFlightFinished({ index: 1, token: 1 }))
    expect(one).toMatchObject({ placedPieceIds: [1] })
    expect(one.flyingPieceTokens[1]).toBe(-1)

    const [flyingTwo, completeCommands] = update(one, TapPiece({ index: 0 }))
    expect(flyingTwo).toMatchObject({ placedPieceIds: [1], flyingPieceTokens: [2, -1], animationToken: 2 })
    expect(completeCommands.map(command => command.name)).toStrictEqual(['ShapeWorkshopFlyPiece'])
    const [complete] = update(flyingTwo, PieceFlightFinished({ index: 0, token: 2 }))
    expect(complete.placedPieceIds).toStrictEqual([1, 0])
    expect(isPuzzleComplete(complete)).toBe(true)
  })

  it('allows concurrent flights while ignoring duplicate, fractional, out-of-range, and post-completion taps', () => {
    const [flying] = update(init, TapPiece({ index: 0 }))
    for (const index of [0, -1, 2, 0.5, Number.NaN]) {
      const [unchanged] = update(flying, TapPiece({ index }))
      expect(unchanged).toBe(flying)
    }

    const [twoFlying, commands] = update(flying, TapPiece({ index: 1 }))
    expect(validFlyingPieceIds(twoFlying)).toStrictEqual([0, 1])
    expect(commands.map(command => command.name)).toStrictEqual(['ShapeWorkshopFlyPiece'])
    const [one] = update(twoFlying, PieceFlightFinished({ index: 0, token: 1 }))
    const flyingTwo = one
    const [complete] = update(flyingTwo, PieceFlightFinished({ index: 1, token: 2 }))
    const [stillComplete] = update(complete, TapPiece({ index: 0 }))
    expect(stillComplete).toBe(complete)
  })

  it('sanitizes externally supplied placed ids before deriving completion', () => {
    const model: Model = { ...init, placedPieceIds: [0, 0, -1, 1, 99, 1.5] }
    expect(validPlacedPieceIds(model)).toStrictEqual([0, 1])
    expect(validFlyingPieceIds({ ...model, flyingPieceTokens: [99, -1] })).toStrictEqual([])
    expect(isPuzzleComplete(model)).toBe(true)
  })

  it('replays the current puzzle and increments the render revision', () => {
    const model: Model = { ...init, roundIndex: WORKSHOP_PUZZLES.length * 3 + 2, placedPieceIds: [0, 1], animationToken: 7, revision: 4 }
    const [replayed, commands] = update(model, ReplayPuzzle())
    expect(replayed).toStrictEqual({ roundIndex: WORKSHOP_PUZZLES.length * 3 + 2, placedPieceIds: [], flyingPieceTokens: [], animationToken: 8, revision: 5 })
    expect(commands).toStrictEqual([])
  })

  it('invalidates an old flight when replay resets the puzzle', () => {
    const [flying] = update(init, TapPiece({ index: 0 }))
    const [replayed] = update(flying, ReplayPuzzle())
    const [afterLateLanding] = update(replayed, PieceFlightFinished({ index: 0, token: 1 }))
    expect(afterLateLanding).toBe(replayed)
    expect(replayed).toMatchObject({ placedPieceIds: [], flyingPieceTokens: [], animationToken: 2 })
  })

  it('settles safely when the flight DOM is unavailable', async () => {
    document.querySelector('.shape-workshop-page')?.remove()
    const [, commands] = update(init, TapPiece({ index: 0 }))
    const result = await Effect.runPromise(commands[0]!.effect)
    expect(result).toStrictEqual(PieceFlightFinished({ index: 0, token: 1 }))
    expect(document.querySelector('.shape-workshop-flight')).toBeNull()
  })

  it('measures the source and target after commit, then cleans up an aria-hidden fixed overlay', async () => {
    const host = document.createElement('div')
    host.innerHTML = `
      <div class="shape-workshop-page">
        <button class="shape-workshop-piece-button" data-piece-index="0">
          <svg class="shape-workshop-piece-svg" viewBox="42 22 156 156"><path /></svg>
        </button>
        <svg class="shape-workshop-target-svg" viewBox="0 0 240 200">
          <path class="shape-workshop-slot shape-workshop-slot--receiving" data-target-piece-index="0" style="--shape-workshop-color:#f97316" />
        </svg>
      </div>`
    document.body.append(host)
    const sourceSvg = host.querySelector<SVGSVGElement>('.shape-workshop-piece-svg')!
    const targetSvg = host.querySelector<SVGSVGElement>('.shape-workshop-target-svg')!
    sourceSvg.getBoundingClientRect = () => new DOMRect(12, 340, 78, 78)
    targetSvg.getBoundingClientRect = () => new DOMRect(100, 80, 240, 200)

    const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
    let capturedKeyframes: Keyframe[] = []
    const cancel = vi.fn()
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: vi.fn((keyframes: Keyframe[]) => {
        capturedKeyframes = keyframes
        const overlay = host.querySelector('.shape-workshop-flight')
        expect(overlay).not.toBeNull()
        expect(overlay?.getAttribute('aria-hidden')).toBe('true')
        expect(overlay?.parentElement).toBe(host.querySelector('.shape-workshop-page'))
        return { finished: Promise.resolve(), cancel } as unknown as Animation
      }),
    })

    try {
      const [, commands] = update(init, TapPiece({ index: 0 }))
      const result = await Effect.runPromise(commands[0]!.effect)
      expect(result).toStrictEqual(PieceFlightFinished({ index: 0, token: 1 }))
      expect(capturedKeyframes[0]?.transform).toMatch(/^translate\(.+\) scale\(.+\)$/)
      expect(capturedKeyframes.at(-1)?.transform).toBe('translate(0, 0) scale(1)')
      expect(cancel).toHaveBeenCalledOnce()
      expect(host.querySelector('.shape-workshop-flight')).not.toBeNull()
      await new Promise<void>(resolve => window.setTimeout(resolve, 100))
      expect(host.querySelector('.shape-workshop-flight')).toBeNull()
    } finally {
      host.remove()
      if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate)
      else Reflect.deleteProperty(Element.prototype, 'animate')
    }
  })

  it('does not advance until the current silhouette is complete', () => {
    const [unchanged, commands] = update(init, NextPuzzle())
    expect(unchanged).toBe(init)
    expect(commands).toStrictEqual([])
  })

  it('keeps an unbounded round counter while selecting recipes cyclically', () => {
    let model: Model = init
    const rounds = WORKSHOP_PUZZLES.length * 5 + 7
    for (let index = 1; index <= rounds; index++) {
      model = { ...model, placedPieceIds: currentPuzzle(model).pieces.map((_, pieceIndex) => pieceIndex) }
      ;[model] = update(model, NextPuzzle())
      expect(model.roundIndex).toBe(index)
      expect(model.placedPieceIds).toStrictEqual([])
      expect(model.flyingPieceTokens).toStrictEqual([])
      expect(model.revision).toBe(index)
      expect(currentPuzzle(model).id).toBe(WORKSHOP_PUZZLES[index % WORKSHOP_PUZZLES.length]!.id)
    }
    expect(model.roundIndex).toBeGreaterThan(WORKSHOP_PUZZLES.length)
  })

  it('sanitizes invalid rounds only for state safety and uses modulo only for recipe lookup', () => {
    expect(normalizeRoundIndex(-1)).toBe(0)
    expect(normalizeRoundIndex(2.9)).toBe(2)
    expect(normalizeRoundIndex(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizePuzzleIndex(WORKSHOP_PUZZLES.length * 4 + 2.9)).toBe(2)
    expect(normalizePuzzleIndex(2.9)).toBe(2)
    expect(normalizePuzzleIndex(Number.POSITIVE_INFINITY)).toBe(0)
    expect(currentPuzzle({ roundIndex: -1 }).id).toBe('triangles-square')
    expect(currentPuzzle({ roundIndex: WORKSHOP_PUZZLES.length * 9 + 1 }).id).toBe('semicircles-circle')
  })

  it('accepts only schema-valid message payloads', () => {
    const decode = S.decodeUnknownOption(Message)
    expect(Option.isSome(decode({ _tag: 'ShapeWorkshopTapPiece', index: 1 }))).toBe(true)
    expect(Option.isNone(decode({ _tag: 'ShapeWorkshopTapPiece', index: '1' }))).toBe(true)
    expect(Option.isSome(decode({ _tag: 'ShapeWorkshopPieceFlightFinished', index: 1, token: 3 }))).toBe(true)
    expect(Option.isNone(decode({ _tag: 'ShapeWorkshopPieceFlightFinished', index: 1, token: '3' }))).toBe(true)
  })
})

describe('Shape Workshop view', () => {
  it('uses an accessible piece button to snap a piece into the silhouette', () => {
    Scene.scene(
      { update, view },
      Scene.with(init),
      Scene.expect(Scene.selector('.shape-workshop-progress[dir="ltr"]')).toHaveText('Round 1'),
      Scene.expect(Scene.selector('.shape-workshop-target-svg[role="img"]')).toExist(),
      Scene.expect(Scene.selector('.shape-workshop-status[role="status"][aria-live="polite"]')).toExist(),
      Scene.expect(Scene.selector('.shape-workshop-actions .btn-primary')).toBeDisabled(),
      Scene.expect(Scene.selector('.shape-workshop-slot')).toExist(),
      Scene.expect(Scene.selector('.shape-workshop-piece-count[dir="ltr"]')).toHaveText('0/2'),
      Scene.expect(Scene.selector('button.shape-workshop-piece-button[data-piece-index="0"]')).toHaveAttr('aria-pressed', 'false'),
      Scene.click(Scene.selector('button.shape-workshop-piece-button[data-piece-index="0"]')),
      Scene.expect(Scene.selector('.shape-workshop-piece')).not.toExist(),
      Scene.expect(Scene.selector('.shape-workshop-slot--receiving[data-target-piece-index="0"]')).toExist(),
      Scene.expect(Scene.selector('.shape-workshop-target-svg')).toHaveAttr('aria-busy', 'true'),
      Scene.expect(Scene.selector('.shape-workshop-tray')).toHaveAttr('aria-busy', 'true'),
      Scene.expect(Scene.selector('.shape-workshop-piece-count')).toHaveText('1/2'),
      Scene.expect(Scene.selector('button.shape-workshop-piece-button[data-piece-index="0"]')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('button.shape-workshop-piece-button[data-piece-index="0"]')).toBeDisabled(),
      Scene.expect(Scene.selector('button.shape-workshop-piece-button[data-piece-index="1"]')).toBeEnabled(),
      Scene.Command.resolveAll([{ name: 'ShapeWorkshopFlyPiece' }, PieceFlightFinished({ index: 0, token: 1 })]),
      Scene.expect(Scene.selector('.shape-workshop-piece[data-target-piece-index="0"]')).toExist(),
      Scene.expect(Scene.selector('.shape-workshop-slot--receiving')).not.toExist(),
      Scene.expect(Scene.selector('.shape-workshop-target-svg')).toHaveAttr('aria-busy', 'false'),
      Scene.Command.expectNone(),
    )
  })

  it('lets the completed shape itself replay into separated outlined slots', () => {
    const complete: Model = { ...init, placedPieceIds: [0, 1] }
    Scene.scene(
      { update, view },
      Scene.with(complete),
      Scene.expect(Scene.selector('button.shape-workshop-target--complete')).toExist(),
      Scene.expect(Scene.text('2 × Triangle = Square')).toExist(),
      Scene.expect(Scene.selector('.shape-workshop-actions .btn-primary')).toBeEnabled(),
      Scene.click(Scene.selector('button.shape-workshop-target--complete')),
      Scene.expect(Scene.selector('button.shape-workshop-target--complete')).not.toExist(),
      Scene.expect(Scene.selector('.shape-workshop-slot')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('advances to ever-higher round labels without displaying a finite total', () => {
    const roundIndex = WORKSHOP_PUZZLES.length * 6
    const puzzle = currentPuzzle({ roundIndex })
    const complete: Model = {
      ...init,
      roundIndex,
      placedPieceIds: puzzle.pieces.map((_, index) => index),
      revision: roundIndex,
    }
    Scene.scene(
      { update, view },
      Scene.with(complete),
      Scene.expect(Scene.selector('.shape-workshop-progress')).toHaveText(`Round ${roundIndex + 1}`),
      Scene.click(Scene.selector('.shape-workshop-actions .btn-primary')),
      Scene.expect(Scene.selector('.shape-workshop-progress')).toHaveText(`Round ${roundIndex + 2}`),
      Scene.expect(Scene.selector('.shape-workshop-actions .btn-primary')).toBeDisabled(),
      Scene.Command.expectNone(),
    )
  })

  it('describes mixed-piece constructions with an honest symbolic equation', () => {
    const roundIndex = WORKSHOP_PUZZLES.findIndex(puzzle => puzzle.id === 'triangle-and-trapezoid-triangle')
    const complete: Model = { ...init, roundIndex, placedPieceIds: [0, 1], revision: 0 }
    Scene.scene(
      { update, view },
      Scene.with(complete),
      Scene.expect(Scene.selector('.shape-workshop-status strong[dir="ltr"]')).toHaveText('Triangle + Trapezoid = Triangle'),
      Scene.Command.expectNone(),
    )
  })
})
