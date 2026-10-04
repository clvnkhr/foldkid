export interface HandwritingPoint { readonly x: number; readonly y: number }
export type HandwritingStroke = ReadonlyArray<HandwritingPoint>
export interface HandwritingGuide {
  readonly text: string
  readonly emoji: string
  readonly width: number
  readonly height: number
  readonly strokes: ReadonlyArray<HandwritingStroke>
}

export const HANDWRITING_TOLERANCE = 11
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

type XY = readonly [number, number]
type Segment = XY | readonly [number, number, number, number] | readonly [number, number, number, number, number, number]
const point = ([x, y]: XY): HandwritingPoint => ({ x, y })
const distance = (a: HandwritingPoint, b: HandwritingPoint): number => Math.hypot(a.x - b.x, a.y - b.y)

const resample = (points: HandwritingStroke): HandwritingStroke => {
  const first = points[0]!
  const samples: HandwritingPoint[] = [first]
  let remaining = 5.5
  for (let index = 1; index < points.length; index++) {
    let from = points[index - 1]!
    const to = points[index]!
    let length = distance(from, to)
    while (length >= remaining && length > 0) {
      const ratio = remaining / length
      from = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
      samples.push(from)
      length = distance(from, to)
      remaining = 5.5
    }
    remaining -= length
  }
  const last = points.at(-1)!
  if (distance(samples.at(-1)!, last) > 0.01) samples.push(last)
  return samples
}

/** Lines, quadratic curves and cubic curves share the same evenly spaced guide dots. */
const stroke = (start: XY, ...segments: ReadonlyArray<Segment>): HandwritingStroke => {
  const points = [point(start)]
  for (const segment of segments) {
    const from = points.at(-1)!
    if (segment.length === 2) { points.push(point(segment)); continue }
    for (let index = 1; index <= 32; index++) {
      const t = index / 32
      const u = 1 - t
      points.push(segment.length === 4 ? {
        x: u * u * from.x + 2 * u * t * segment[0] + t * t * segment[2],
        y: u * u * from.y + 2 * u * t * segment[1] + t * t * segment[3],
      } : {
        x: u ** 3 * from.x + 3 * u * u * t * segment[0] + 3 * u * t * t * segment[2] + t ** 3 * segment[4],
        y: u ** 3 * from.y + 3 * u * u * t * segment[1] + 3 * u * t * t * segment[3] + t ** 3 * segment[5],
      })
    }
  }
  return resample(points)
}

const oval = (cx: number, cy: number, rx: number, ry: number, start = 0, end = Math.PI * 2): HandwritingStroke =>
  resample(Array.from({ length: 97 }, (_, index) => {
    const angle = start + (end - start) * index / 96
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
  }))

const upper: Readonly<Record<string, ReadonlyArray<HandwritingStroke>>> = {
  a: [stroke([20, 120], [50, 25], [80, 120]), stroke([32, 82], [68, 82])],
  b: [stroke([20, 25], [20, 120]), stroke([20, 25], [80, 25, 80, 72, 20, 72], [85, 72, 85, 120, 20, 120])],
  c: [oval(50, 72.5, 30, 47.5, -Math.PI / 4, -Math.PI * 7 / 4)],
  d: [stroke([20, 25], [20, 120]), stroke([20, 25], [85, 25, 85, 120, 20, 120])],
  e: [stroke([80, 25], [20, 25], [20, 120], [80, 120]), stroke([20, 72], [70, 72])],
  f: [stroke([80, 25], [20, 25], [20, 120]), stroke([20, 72], [70, 72])],
  g: [oval(50, 72.5, 30, 47.5, -Math.PI / 4, -Math.PI * 7 / 4), stroke([50, 78], [80, 78], [80, 108])],
  h: [stroke([20, 25], [20, 120]), stroke([80, 25], [80, 120]), stroke([20, 72], [80, 72])],
  i: [stroke([50, 25], [50, 120]), stroke([25, 25], [75, 25]), stroke([25, 120], [75, 120])],
  j: [stroke([65, 25], [65, 90], [65, 120, 35, 125, 20, 110], [15, 105, 15, 95]), stroke([25, 25], [80, 25])],
  k: [stroke([20, 25], [20, 120]), stroke([80, 25], [20, 78], [80, 120])],
  l: [stroke([20, 25], [20, 120], [80, 120])],
  m: [stroke([15, 120], [15, 25], [50, 82], [85, 25], [85, 120])],
  n: [stroke([20, 120], [20, 25], [80, 120], [80, 25])],
  o: [oval(50, 72.5, 30, 47.5)],
  p: [stroke([20, 25], [20, 120]), stroke([20, 25], [85, 25, 85, 75, 20, 75])],
  q: [oval(50, 72.5, 30, 47.5), stroke([58, 100], [82, 130])],
  r: [stroke([20, 25], [20, 120]), stroke([20, 25], [85, 25, 85, 75, 20, 75]), stroke([48, 74], [85, 120])],
  s: [stroke([75, 35], [70, 20, 20, 20, 20, 45], [20, 70, 80, 75, 80, 100], [80, 125, 25, 130, 20, 110])],
  t: [stroke([15, 25], [85, 25]), stroke([50, 25], [50, 120])],
  u: [stroke([20, 25], [20, 90], [20, 130, 80, 130, 80, 90], [80, 25])],
  v: [stroke([20, 25], [50, 120], [80, 25])],
  w: [stroke([15, 25], [30, 120], [50, 55], [70, 120], [85, 25])],
  x: [stroke([20, 25], [80, 120]), stroke([80, 25], [20, 120])],
  y: [stroke([20, 25], [50, 72], [80, 25]), stroke([50, 72], [50, 120])],
  z: [stroke([20, 25], [80, 25], [20, 120], [80, 120])],
}

const lower: Readonly<Record<string, ReadonlyArray<HandwritingStroke>>> = {
  a: [oval(50, 90, 25, 25), stroke([75, 65], [75, 115])],
  b: [stroke([25, 25], [25, 115]), oval(50, 90, 25, 25)],
  c: [oval(50, 90, 30, 25, -Math.PI / 4, -Math.PI * 7 / 4)],
  d: [oval(50, 90, 25, 25), stroke([75, 25], [75, 115])],
  e: [stroke([20, 90], [80, 90], [80, 58, 20, 58, 20, 90], [20, 120, 65, 120, 80, 108])],
  f: [stroke([40, 115], [40, 48], [40, 20, 65, 20, 75, 35]), stroke([20, 65], [65, 65])],
  g: [oval(45, 90, 25, 25), stroke([70, 65], [70, 120], [70, 140, 30, 140, 25, 125])],
  h: [stroke([25, 25], [25, 115]), stroke([25, 82], [25, 60, 75, 60, 75, 85], [75, 115])],
  i: [stroke([50, 65], [50, 115]), stroke([50, 43], [50, 45])],
  j: [stroke([65, 65], [65, 125], [65, 140, 25, 140, 25, 128]), stroke([65, 43], [65, 45])],
  k: [stroke([25, 25], [25, 115]), stroke([75, 65], [25, 95], [75, 115])],
  l: [stroke([40, 25], [40, 100], [40, 120, 65, 120, 70, 108])],
  m: [stroke([20, 65], [20, 115]), stroke([20, 82], [20, 60, 48, 60, 48, 85], [48, 115]), stroke([48, 82], [48, 60, 80, 60, 80, 85], [80, 115])],
  n: [stroke([25, 65], [25, 115]), stroke([25, 82], [25, 60, 75, 60, 75, 85], [75, 115])],
  o: [oval(50, 90, 30, 25)],
  p: [stroke([25, 65], [25, 140]), oval(50, 90, 25, 25)],
  q: [oval(45, 90, 25, 25), stroke([70, 65], [70, 132], [80, 140])],
  r: [stroke([25, 65], [25, 115]), stroke([25, 82], [25, 62, 50, 60, 75, 68])],
  s: [stroke([75, 70], [55, 55, 20, 62, 20, 80], [20, 95, 80, 85, 80, 100], [80, 120, 40, 125, 20, 110])],
  t: [stroke([50, 40], [50, 100], [50, 120, 70, 120, 75, 108]), stroke([25, 65], [75, 65])],
  u: [stroke([25, 65], [25, 98], [25, 122, 75, 122, 75, 98], [75, 65]), stroke([75, 98], [75, 115])],
  v: [stroke([20, 65], [50, 115], [80, 65])],
  w: [stroke([15, 65], [30, 115], [50, 80], [70, 115], [85, 65])],
  x: [stroke([20, 65], [80, 115]), stroke([80, 65], [20, 115])],
  y: [stroke([20, 65], [50, 110]), stroke([80, 65], [40, 140])],
  z: [stroke([20, 65], [80, 65], [20, 115], [80, 115])],
}

const makeGuide = (mode: 'letters' | 'words', letterCase: 'upper' | 'lower', index: number): HandwritingGuide => {
  const word = mode === 'words' ? HANDWRITING_WORDS[index]! : undefined
  const letters = word?.text ?? HANDWRITING_LETTERS[index]!
  const catalogue = letterCase === 'upper' ? upper : lower
  return Object.freeze({
    text: letterCase === 'upper' ? letters.toUpperCase() : letters,
    emoji: word?.emoji ?? '', width: mode === 'words' ? 320 : 100, height: 160,
    strokes: Object.freeze([...letters].flatMap((letter, position) => catalogue[letter]!.map(points =>
      Object.freeze(points.map(({ x, y }) => Object.freeze({ x: x + position * 110, y }))),
    ))),
  })
}

const guides = Object.freeze({
  letters: Object.freeze({
    upper: Object.freeze(HANDWRITING_LETTERS.map((_, index) => makeGuide('letters', 'upper', index))),
    lower: Object.freeze(HANDWRITING_LETTERS.map((_, index) => makeGuide('letters', 'lower', index))),
  }),
  words: Object.freeze({
    upper: Object.freeze(HANDWRITING_WORDS.map((_, index) => makeGuide('words', 'upper', index))),
    lower: Object.freeze(HANDWRITING_WORDS.map((_, index) => makeGuide('words', 'lower', index))),
  }),
})

export const handwritingGuide = (mode: 'letters' | 'words', letterCase: 'upper' | 'lower', index: number): HandwritingGuide => {
  const catalogue = guides[mode][letterCase]
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

/** Progress counts reached samples; a fast straight trace works without allowing shortcuts through curves. */
export const advanceHandwritingStroke = (points: HandwritingStroke, progress: number, from: HandwritingPoint, to: HandwritingPoint): number => {
  const reached = Number.isSafeInteger(progress) ? Math.max(0, Math.min(points.length, progress)) : 0
  if (progress !== reached || reached === points.length || !finitePoint(from) || !finitePoint(to) || !points.every(finitePoint)) return reached
  const previous = Math.max(0, reached - 1)
  if (Math.min(distance(from, points[previous]!), distance(from, points[reached]!)) > HANDWRITING_TOLERANCE + 0.000001) return reached
  let closest = previous
  let nearest = Infinity
  for (let index = previous; index < points.length; index++) {
    const gap = distance(to, points[index]!)
    if (gap < nearest) { nearest = gap; closest = index }
  }
  if (nearest > HANDWRITING_TOLERANCE) return reached
  // Long curved sections need intermediate input, so a polygon cannot stand in for a counter.
  if (distance(from, to) > HANDWRITING_TOLERANCE * 2 && closest > reached) {
    for (let index = reached; index < closest; index++) {
      if (segmentDistance(points[index]!, points[previous]!, points[closest]!) > HANDWRITING_TOLERANCE / 3) return reached
    }
  }
  for (let index = reached; index <= closest; index++) {
    if (segmentDistance(points[index]!, from, to) > HANDWRITING_TOLERANCE) return reached
  }
  let next = reached
  while (next < points.length && segmentDistance(points[next]!, from, to) <= HANDWRITING_TOLERANCE &&
    (next <= closest || distance(points[next]!, to) <= HANDWRITING_TOLERANCE)) next++
  return next
}
