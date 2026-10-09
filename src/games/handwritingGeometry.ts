export interface HandwritingPoint { readonly x: number; readonly y: number }
export type HandwritingStroke = ReadonlyArray<HandwritingPoint>
type XY = readonly [number, number]
type Segment = XY | readonly [number, number, number, number] | readonly [number, number, number, number, number, number]
const point = ([x, y]: XY): HandwritingPoint => ({ x, y })
export const distance = (a: HandwritingPoint, b: HandwritingPoint): number => Math.hypot(a.x - b.x, a.y - b.y)

export const resample = (points: HandwritingStroke): HandwritingStroke => {
  if (points.length === 0) return []
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
export const stroke = (start: XY, ...segments: ReadonlyArray<Segment>): HandwritingStroke => {
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

export const oval = (cx: number, cy: number, rx: number, ry: number, start = -Math.PI / 4, end = start - Math.PI * 2): HandwritingStroke =>
  resample(Array.from({ length: 97 }, (_, index) => {
    const angle = start + (end - start) * index / 96
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry }
  }))

export const joinedStroke = (...strokes: ReadonlyArray<HandwritingStroke>): HandwritingStroke =>
  resample(strokes.flatMap((points, index) => index === 0 ? points : points.slice(1)))

