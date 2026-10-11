export interface DotPoint { readonly x: number; readonly y: number }
export interface Dot extends DotPoint { readonly id: number }
export const BOARD_WIDTH = 1000
export const BOARD_HEIGHT = 700
export const MAX_DOTS = 32
export const MIN_DOT_DISTANCE = 16
// Keep the complete round dot/cursor visible even on the narrowest supported board.
export const BOARD_MARGIN_X = 44
export const BOARD_MARGIN_Y = 30
export const DOT_COLORS = ['#fb7185', '#fbbf24', '#34d399', '#38bdf8', '#818cf8', '#c084fc', '#f472b6'] as const

export const validId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0
export const validPoint = (point: DotPoint): boolean => Number.isFinite(point.x) && Number.isFinite(point.y) &&
  point.x >= 0 && point.x <= BOARD_WIDTH && point.y >= 0 && point.y <= BOARD_HEIGHT
export const clampPoint = (point: DotPoint): DotPoint => ({
  x: Math.max(BOARD_MARGIN_X, Math.min(BOARD_WIDTH - BOARD_MARGIN_X, point.x)),
  y: Math.max(BOARD_MARGIN_Y, Math.min(BOARD_HEIGHT - BOARD_MARGIN_Y, point.y)),
})
export const hasRoomFor = (points: readonly Dot[], point: DotPoint, exceptId?: number): boolean =>
  !points.some(dot => dot.id !== exceptId && Math.hypot(dot.x - point.x, dot.y - point.y) < MIN_DOT_DISTANCE)

/** Collinear points stay an open line. Crossing polygons use an even-odd translucent fill. */
export const isPolygon = (points: readonly DotPoint[]): boolean => {
  if (points.length < 3) return false
  const origin = points[0]!
  const second = points.find(point => Math.hypot(point.x - origin.x, point.y - origin.y) > 0.01)
  if (!second) return false
  return points.some(point => Math.abs((second.x - origin.x) * (point.y - origin.y) - (second.y - origin.y) * (point.x - origin.x)) > 1)
}

export const shapeKind = (points: readonly DotPoint[]): 'empty' | 'dot' | 'line' | 'triangle' | 'quadrilateral' |
  'pentagon' | 'hexagon' | 'heptagon' | 'octagon' | 'nonagon' | 'decagon' | 'polygon' => {
  if (points.length === 0) return 'empty'
  if (points.length === 1) return 'dot'
  if (!isPolygon(points)) return 'line'
  return (['triangle', 'quadrilateral', 'pentagon', 'hexagon', 'heptagon', 'octagon', 'nonagon', 'decagon'] as const)[points.length - 3] ?? 'polygon'
}

export const edgesFor = (points: readonly Dot[]): readonly { readonly from: Dot; readonly to: Dot; readonly color: string }[] =>
  points.length < 2 ? [] : Array.from({ length: points.length - (isPolygon(points) ? 0 : 1) }, (_, index) => ({
    from: points[index]!, to: points[(index + 1) % points.length]!, color: DOT_COLORS[index % DOT_COLORS.length]!,
  }))
