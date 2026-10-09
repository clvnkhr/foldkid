import { distance, joinedStroke, oval, stroke, type HandwritingPoint, type HandwritingStroke } from './handwritingGeometry'
import { cursiveJoinStarts, cursiveLower, cursiveUpper } from './handwritingCursive'
import { HANDWRITING_NUMBERS, numberStrokes } from './handwritingNumbers'
export type { HandwritingPoint, HandwritingStroke } from './handwritingGeometry'
export { HANDWRITING_NUMBERS } from './handwritingNumbers'

export interface HandwritingGuide {
  readonly text: string
  readonly emoji: string
  readonly width: number
  readonly height: number
  readonly strokes: ReadonlyArray<HandwritingStroke>
}

export const HANDWRITING_TOLERANCE = 18
export const HANDWRITING_LETTERS: ReadonlyArray<string> = 'abcdefghijklmnopqrstuvwxyz'.split('')
export const HANDWRITING_WORDS = [
  { text: 'cat', emoji: '🐈' }, { text: 'dog', emoji: '🐕' }, { text: 'sun', emoji: '☀️' },
  { text: 'pig', emoji: '🐖' }, { text: 'cow', emoji: '🐄' }, { text: 'hen', emoji: '🐔' },
  { text: 'fox', emoji: '🦊' }, { text: 'owl', emoji: '🦉' }, { text: 'bug', emoji: '🐛' },
  { text: 'bee', emoji: '🐝' }, { text: 'ant', emoji: '🐜' }, { text: 'bat', emoji: '🦇' },
  { text: 'ram', emoji: '🐏' }, { text: 'rat', emoji: '🐀' }, { text: 'cub', emoji: '🐻' },
  { text: 'pup', emoji: '🐶' }, { text: 'hat', emoji: '🎩' }, { text: 'cap', emoji: '🧢' },
  { text: 'pen', emoji: '🖊️' }, { text: 'cup', emoji: '☕' }, { text: 'bus', emoji: '🚌' },
  { text: 'car', emoji: '🚗' }, { text: 'van', emoji: '🚐' }, { text: 'jet', emoji: '✈️' },
  { text: 'bed', emoji: '🛏️' }, { text: 'box', emoji: '📦' }, { text: 'bag', emoji: '👜' },
  { text: 'map', emoji: '🗺️' }, { text: 'egg', emoji: '🥚' }, { text: 'jam', emoji: '🫙' },
  { text: 'pot', emoji: '🍲' }, { text: 'pan', emoji: '🍳' },
] as const

const capitalC = oval(50, 72.5, 30, 47.5, -Math.PI / 4, -Math.PI * 7 / 4)
const capitalCEnd = capitalC.at(-1)!

const upper: Readonly<Record<string, ReadonlyArray<HandwritingStroke>>> = {
  a: [stroke([50, 25], [20, 120]), stroke([50, 25], [80, 120]), stroke([32, 82], [68, 82])],
  b: [stroke([20, 25], [20, 120]), stroke([20, 25], [80, 25, 80, 72, 20, 72], [85, 72, 85, 120, 20, 120])],
  c: [capitalC],
  d: [stroke([20, 25], [20, 120]), stroke([20, 25], [85, 25, 85, 120, 20, 120])],
  e: [stroke([20, 25], [20, 120]), stroke([20, 25], [80, 25]), stroke([20, 72], [70, 72]), stroke([20, 120], [80, 120])],
  f: [stroke([20, 25], [20, 120]), stroke([20, 25], [80, 25]), stroke([20, 72], [70, 72])],
  g: [joinedStroke(capitalC, stroke([capitalCEnd.x, capitalCEnd.y], [80, 108], [80, 78], [50, 78]))],
  h: [stroke([20, 25], [20, 120]), stroke([80, 25], [80, 120]), stroke([20, 72], [80, 72])],
  i: [stroke([50, 25], [50, 120]), stroke([25, 25], [75, 25]), stroke([25, 120], [75, 120])],
  j: [stroke([65, 25], [65, 90], [65, 120, 35, 125, 20, 110], [15, 105, 15, 95]), stroke([25, 25], [80, 25])],
  k: [stroke([20, 25], [20, 120]), stroke([80, 25], [20, 78], [80, 120])],
  l: [stroke([20, 25], [20, 120], [80, 120])],
  m: [stroke([15, 25], [15, 120]), stroke([15, 25], [50, 82], [85, 25]), stroke([85, 25], [85, 120])],
  n: [stroke([20, 25], [20, 120]), stroke([20, 25], [80, 120]), stroke([80, 25], [80, 120])],
  o: [oval(50, 72.5, 30, 47.5)],
  p: [stroke([20, 25], [20, 120]), stroke([20, 25], [85, 25, 85, 75, 20, 75])],
  q: [oval(50, 72.5, 30, 47.5), stroke([58, 100], [82, 130])],
  r: [stroke([20, 25], [20, 120]), stroke([20, 25], [85, 25, 85, 75, 20, 75], [85, 120])],
  s: [stroke([75, 35], [70, 20, 20, 20, 20, 45], [20, 70, 80, 75, 80, 100], [80, 125, 25, 130, 20, 110])],
  t: [stroke([15, 25], [85, 25]), stroke([50, 25], [50, 120])],
  u: [stroke([20, 25], [20, 90], [20, 130, 80, 130, 80, 90], [80, 25])],
  v: [stroke([20, 25], [50, 120], [80, 25])],
  w: [stroke([15, 25], [30, 120], [50, 55], [70, 120], [85, 25])],
  x: [stroke([20, 25], [80, 120]), stroke([80, 25], [20, 120])],
  y: [stroke([20, 25], [50, 72]), stroke([80, 25], [50, 72], [50, 120])],
  z: [stroke([20, 25], [80, 25], [20, 120], [80, 120])],
}

const lower: Readonly<Record<string, ReadonlyArray<HandwritingStroke>>> = {
  a: [oval(50, 90, 25, 25), stroke([75, 65], [75, 115])],
  b: [joinedStroke(stroke([25, 25], [25, 115], [25, 90]), oval(50, 90, 25, 25, Math.PI, Math.PI * 3))],
  c: [oval(50, 90, 30, 25, -Math.PI / 4, -Math.PI * 7 / 4)],
  d: [oval(50, 90, 25, 25), stroke([75, 25], [75, 115])],
  e: [stroke([20, 90], [80, 90], [80, 58, 20, 58, 20, 90], [20, 120, 65, 120, 80, 108])],
  f: [stroke([75, 35], [65, 20, 40, 20, 40, 48], [40, 115]), stroke([20, 65], [65, 65])],
  g: [oval(45, 90, 25, 25), stroke([70, 65], [70, 120], [70, 140, 30, 140, 25, 125])],
  h: [stroke([25, 25], [25, 115], [25, 82], [25, 60, 75, 60, 75, 85], [75, 115])],
  i: [stroke([50, 65], [50, 115]), stroke([50, 43], [50, 45])],
  j: [stroke([65, 65], [65, 125], [65, 140, 25, 140, 25, 128]), stroke([65, 43], [65, 45])],
  k: [stroke([25, 25], [25, 115]), stroke([75, 65], [25, 95], [75, 115])],
  l: [stroke([40, 25], [40, 100], [40, 120, 65, 120, 70, 108])],
  m: [stroke([20, 65], [20, 115], [20, 82], [20, 60, 48, 60, 48, 85], [48, 115], [48, 82], [48, 60, 80, 60, 80, 85], [80, 115])],
  n: [stroke([25, 65], [25, 115], [25, 82], [25, 60, 75, 60, 75, 85], [75, 115])],
  o: [oval(50, 90, 30, 25)],
  p: [joinedStroke(stroke([25, 65], [25, 140], [25, 90]), oval(50, 90, 25, 25, Math.PI, Math.PI * 3))],
  q: [oval(45, 90, 25, 25), stroke([70, 65], [70, 132], [80, 140])],
  r: [stroke([25, 65], [25, 115], [25, 82], [25, 62, 50, 60, 75, 68])],
  s: [stroke([75, 70], [55, 55, 20, 62, 20, 80], [20, 95, 80, 85, 80, 100], [80, 120, 40, 125, 20, 110])],
  t: [stroke([50, 40], [50, 100], [50, 120, 70, 120, 75, 108]), stroke([25, 65], [75, 65])],
  u: [stroke([25, 65], [25, 98], [25, 122, 75, 122, 75, 98], [75, 65], [75, 115])],
  v: [stroke([20, 65], [50, 115], [80, 65])],
  w: [stroke([15, 65], [30, 115], [50, 80], [70, 115], [85, 65])],
  x: [stroke([20, 65], [80, 115]), stroke([80, 65], [20, 115])],
  y: [stroke([20, 65], [56, 110]), stroke([80, 65], [40, 140])],
  z: [stroke([20, 65], [80, 65], [20, 115], [80, 115])],
}

const freezeStrokes = (strokes: ReadonlyArray<HandwritingStroke>): ReadonlyArray<HandwritingStroke> =>
  Object.freeze(strokes.map(points => Object.freeze(points.map(point => Object.freeze({ ...point })))))

/** Finish the joined word first, then lift for its dots and crossbars. */
const joinWord = (letters: ReadonlyArray<ReadonlyArray<HandwritingStroke>>, text: string): ReadonlyArray<HandwritingStroke> => {
  const parts: HandwritingStroke[] = [letters[0]![0]!]
  for (let index = 1; index < letters.length; index++) {
    const previous = letters[index - 1]![0]!.at(-1)!
    // Top exits connect into the next letter's body without an unnecessary dip to the baseline.
    const nextStroke = previous.y < 95 ? letters[index]![0]!.slice(cursiveJoinStarts[text[index]!]!) : letters[index]![0]!
    const next = nextStroke[0]!
    const gap = next.x - previous.x
    parts.push(stroke([previous.x, previous.y], [previous.x + gap / 3, previous.y, next.x - gap / 3, next.y, next.x, next.y]), nextStroke)
  }
  return [joinedStroke(...parts), ...letters.flatMap(strokes => strokes.slice(1))]
}

const makeGuide = (mode: 'letters' | 'words', letterCase: 'upper' | 'lower', index: number, style: 'print' | 'cursive'): HandwritingGuide => {
  const word = mode === 'words' ? HANDWRITING_WORDS[index]! : undefined
  const letters = word?.text ?? HANDWRITING_LETTERS[index]!
  const catalogue = style === 'cursive' ? letterCase === 'upper' ? cursiveUpper : cursiveLower : letterCase === 'upper' ? upper : lower
  const advance = style === 'cursive' ? 85 : 110
  const letterStrokes = [...letters].map((letter, position) => catalogue[letter]!.map(points =>
    points.map(({ x, y }) => ({ x: x + position * advance, y })),
  ))
  return Object.freeze({
    text: letterCase === 'upper' ? letters.toUpperCase() : letters,
    emoji: word?.emoji ?? '', width: mode === 'words' ? style === 'cursive' ? 270 : 320 : 100, height: 160,
    strokes: freezeStrokes(mode === 'words' && style === 'cursive' && letterCase === 'lower' ? joinWord(letterStrokes, letters) : letterStrokes.flat()),
  })
}

const styleGuides = (style: 'print' | 'cursive') => Object.freeze({
  letters: Object.freeze({
    upper: Object.freeze(HANDWRITING_LETTERS.map((_, index) => makeGuide('letters', 'upper', index, style))),
    lower: Object.freeze(HANDWRITING_LETTERS.map((_, index) => makeGuide('letters', 'lower', index, style))),
  }),
  words: Object.freeze({
    upper: Object.freeze(HANDWRITING_WORDS.map((_, index) => makeGuide('words', 'upper', index, style))),
    lower: Object.freeze(HANDWRITING_WORDS.map((_, index) => makeGuide('words', 'lower', index, style))),
  }),
})

const guides = Object.freeze({ print: styleGuides('print'), cursive: styleGuides('cursive') })
const numbers: ReadonlyArray<HandwritingGuide> = Object.freeze(HANDWRITING_NUMBERS.map((text, index) => Object.freeze({
  text, emoji: '', width: 100, height: 160, strokes: freezeStrokes(numberStrokes[index]!),
})))

export const handwritingGuide = (mode: 'letters' | 'words' | 'numbers', letterCase: 'upper' | 'lower', index: number, style: 'print' | 'cursive' = 'print'): HandwritingGuide => {
  const catalogue = mode === 'numbers' ? numbers : guides[style][mode][letterCase]
  return catalogue[Number.isSafeInteger(index) && index >= 0 && index < catalogue.length ? index : 0]!
}

const finitePoint = (value: HandwritingPoint): boolean => Number.isFinite(value?.x) && Number.isFinite(value?.y)
export const handwritingPath = (points: HandwritingStroke): string =>
  points.length === 0 || !points.every(finitePoint) ? '' : points.map(({ x, y }, index) =>
    `${index === 0 ? 'M' : 'L'}${Number(x.toFixed(2))} ${Number(y.toFixed(2))}`,
  ).join(' ')

const segmentDistance = (value: HandwritingPoint, from: HandwritingPoint, to: HandwritingPoint): number => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const squaredLength = dx * dx + dy * dy
  const t = squaredLength === 0 ? 0 : Math.max(0, Math.min(1, ((value.x - from.x) * dx + (value.y - from.y) * dy) / squaredLength))
  return Math.hypot(value.x - from.x - t * dx, value.y - from.y - t * dy)
}

const windowDistance = (points: HandwritingStroke, first: number, last: number, value: HandwritingPoint): number => {
  let gap = distance(value, points[last]!)
  for (let index = first; index < last; index++) gap = Math.min(gap, segmentDistance(value, points[index]!, points[index + 1]!))
  return gap
}

/** A short portion of existing ink stays touchable after lifting, without restarting at old crossings. */
export const handwritingResumeDistance = (points: HandwritingStroke, progress: number, value: HandwritingPoint): number => {
  if (!Number.isSafeInteger(progress) || progress < 0 || progress >= points.length || !finitePoint(value) || !points.every(finitePoint)) return Infinity
  return windowDistance(points, Math.max(0, progress - 6), progress, value)
}

/** Progress follows a broad corridor in stroke order, accepting rough curves and brief slips. */
export const advanceHandwritingStroke = (points: HandwritingStroke, progress: number, from: HandwritingPoint, to: HandwritingPoint): number => {
  const reached = Number.isSafeInteger(progress) ? Math.max(0, Math.min(points.length, progress)) : 0
  if (progress !== reached || reached === points.length || !finitePoint(from) || !finitePoint(to) || !points.every(finitePoint)) return reached
  const previous = Math.max(0, reached - 1)
  let origin = from
  if (handwritingResumeDistance(points, reached, from) > HANDWRITING_TOLERANCE + 0.000001) {
    // Rejoin nearby after a slip; an off-guide jump cannot skip a distant unwritten section.
    if (reached === 0 || windowDistance(points, previous, Math.min(points.length - 1, previous + 6), to) > HANDWRITING_TOLERANCE) return reached
    origin = points[previous]!
  }
  let closest = previous
  let nearest = Infinity
  for (let index = previous; index < points.length; index++) {
    // A nearby later loop must not block progress on the current stem or skip an untraced bend.
    if (index >= reached && segmentDistance(points[index]!, origin, to) > HANDWRITING_TOLERANCE) break
    const gap = distance(to, points[index]!)
    if (gap < nearest) { nearest = gap; closest = index }
  }
  if (nearest > HANDWRITING_TOLERANCE) return reached
  let next = reached
  while (next < points.length && segmentDistance(points[next]!, origin, to) <= HANDWRITING_TOLERANCE &&
    (next <= closest || distance(points[next]!, to) <= HANDWRITING_TOLERANCE)) next++
  return next
}
