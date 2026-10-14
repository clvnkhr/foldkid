import { SHAPE_PATHS, type Shape } from './shapeMatchShapes'

export type Mode = 'simple' | 'pairs'
export interface Round {
  readonly homes: readonly (readonly Shape[])[]
  readonly targetIndex: number
  readonly rngSeed: number
}

export const SHAPES = Object.keys(SHAPE_PATHS) as Shape[]
export const DEFAULT_SEED = 0x5eedc0de
const SINGLE_PIECES = SHAPES.map(shape => [shape] as readonly Shape[])
const PAIR_PIECES = SHAPES.flatMap(first => SHAPES.map(second => [first, second] as readonly Shape[]))

export const sameShapes = (left: readonly Shape[], right: readonly Shape[]): boolean =>
  left.length === right.length && left.every((shape, index) => shape === right[index])

export const initialRound = (mode: Mode): Round => ({
  homes: mode === 'pairs'
    ? [['circle', 'triangle'], ['circle', 'square'], ['triangle', 'square'], ['square', 'circle']]
    : [['square'], ['circle'], ['triangle'], ['star']],
  targetIndex: 1,
  rngSeed: DEFAULT_SEED,
})

const random = (seed: number, count: number): readonly [number, number] => {
  const normalized = Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : DEFAULT_SEED
  const next = (Math.imul(normalized, 1664525) + 1013904223) >>> 0
  return [Math.floor(next / 0x100000000 * count), next]
}

/** Replace the matched card alone, then ask for one of the three cards already on the board. */
export const replaceMatchedHome = (round: Round, mode: Mode): Round => {
  if (round.homes.length !== 4 || !Number.isInteger(round.targetIndex) || round.targetIndex < 0 || round.targetIndex >= 4) return initialRound(mode)
  const pool = mode === 'pairs' ? PAIR_PIECES : SINGLE_PIECES
  const available = pool.filter(piece => !round.homes.some(home => sameShapes(home, piece)))
  const [choice, replacementSeed] = random(round.rngSeed, available.length)
  const replacement = available[choice]
  if (!replacement) return initialRound(mode)
  const homes = round.homes.map((home, index) => index === round.targetIndex ? replacement : home)
  const [target, rngSeed] = random(replacementSeed, 3)
  return { homes, targetIndex: target < round.targetIndex ? target : target + 1, rngSeed }
}
