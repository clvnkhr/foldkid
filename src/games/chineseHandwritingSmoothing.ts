import type { HandwritingPoint, HandwritingStroke } from './handwritingGeometry'

export type ChineseHandwritingSmoothingStrength = 'gentle' | 'strong'
const ROUNDING = {
  gentle: { radius: 3, segmentFraction: .35 },
  strong: { radius: 8, segmentFraction: .45 },
} as const
const SAME_DIRECTION_EPSILON = 1e-7

const distance = (from: HandwritingPoint, to: HandwritingPoint): number => Math.hypot(to.x - from.x, to.y - from.y)
const coordinates = (point: HandwritingPoint): string => `${point.x} ${point.y}`

// Remove interpolation samples on straight runs, not any of the source's bends.
// This lets the display radius depend on the original median segments rather
// than the much shorter tracing samples. Reversals are deliberately retained.
const corners = (points: HandwritingStroke): HandwritingStroke => {
  const result: HandwritingPoint[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (last && last.x === point.x && last.y === point.y) continue
    while (result.length > 1) {
      const before = result[result.length - 2]!
      const at = result[result.length - 1]!
      const ax = at.x - before.x
      const ay = at.y - before.y
      const bx = point.x - at.x
      const by = point.y - at.y
      const aLength = Math.hypot(ax, ay)
      const bLength = Math.hypot(bx, by)
      const cross = ax / aLength * (by / bLength) - ay / aLength * (bx / bLength)
      const dot = ax / aLength * (bx / bLength) + ay / aLength * (by / bLength)
      if (dot < 0 || Math.abs(cross) > SAME_DIRECTION_EPSILON) break
      result.pop()
    }
    result.push(point)
  }
  return result
}

/** Display path only: source medians, stroke order and tracing stay untouched.
 * Each quadratic lies inside its original corner triangle, with no overshoot.
 * Short legs cap the rounding and tight return hooks keep their original cusp.
 */
export const smoothChineseHandwritingPath = (points: HandwritingStroke, strength: ChineseHandwritingSmoothingStrength = 'gentle'): string => {
  if (!Array.isArray(points) || points.length === 0) return ''
  for (const point of points) {
    if (!point || ![point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) < 10000)) return ''
  }
  const vertices = corners(points)
  const rounding = strength === 'strong' ? ROUNDING.strong : ROUNDING.gentle
  const first = vertices[0]!
  const commands = [`M ${coordinates(first)}`]
  if (vertices.length === 1) return `${commands[0]} L ${coordinates(first)}`
  for (let index = 1; index < vertices.length - 1; index++) {
    const before = vertices[index - 1]!
    const at = vertices[index]!
    const after = vertices[index + 1]!
    const incoming = distance(before, at)
    const outgoing = distance(at, after)
    const cosine = (at.x - before.x) / incoming * ((after.x - at.x) / outgoing) + (at.y - before.y) / incoming * ((after.y - at.y) / outgoing)
    if (cosine < -.5) {
      commands.push(`L ${coordinates(at)}`)
      continue
    }
    const radius = Math.min(rounding.radius, incoming * rounding.segmentFraction, outgoing * rounding.segmentFraction)
    const entry = { x: at.x + (before.x - at.x) * radius / incoming, y: at.y + (before.y - at.y) * radius / incoming }
    const exit = { x: at.x + (after.x - at.x) * radius / outgoing, y: at.y + (after.y - at.y) * radius / outgoing }
    commands.push(`L ${coordinates(entry)} Q ${coordinates(at)} ${coordinates(exit)}`)
  }
  commands.push(`L ${coordinates(vertices.at(-1)!)}`)
  return commands.join(' ')
}
