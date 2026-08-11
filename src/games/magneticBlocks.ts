import { Effect, Schema as S, Stream } from 'effect'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { arithmeticExpressionForSpeech } from '../arithmeticSpeech'
import { getContext, warmAudio } from '../audio'
import { t } from '../i18n'
import { speakNow, type SpeechOptions } from '../speech'

const INITIAL_BLOCKS = 8
const MAX_BLOCKS = 48
const SNAP_DISTANCE_FACTOR = 0.46
export const DEFAULT_BREAK_SPEED = 950
export const MIN_BREAK_SPEED = 500
export const MAX_BREAK_SPEED = 1500

export const normalizeBreakSpeed = (value: number): number =>
  Math.round(Math.max(MIN_BREAK_SPEED, Math.min(MAX_BREAK_SPEED, value)))

export const Model = S.Struct({ spawnId: S.Number, removeId: S.Number, breakSpeed: S.Number })
export type Model = typeof Model.Type
export const init: Model = { spawnId: 0, removeId: 0, breakSpeed: DEFAULT_BREAK_SPEED }

export const SpawnBlocks = m('MagneticBlocksSpawn')
export const RemoveBlock = m('MagneticBlocksRemove')
export const SetBreakSpeed = m('MagneticBlocksSetBreakSpeed', { value: S.Number })
export const Message = S.Union([SpawnBlocks, RemoveBlock, SetBreakSpeed])
export type Message = typeof Message.Type

export const update = (model: Model, message: Message): readonly [Model, readonly []] => {
  switch (message._tag) {
    case 'MagneticBlocksSpawn': return [{ ...model, spawnId: model.spawnId + 1 }, []]
    case 'MagneticBlocksRemove': return [{ ...model, removeId: model.removeId + 1 }, []]
    case 'MagneticBlocksSetBreakSpeed': return [{ ...model, breakSpeed: normalizeBreakSpeed(message.value) }, []]
  }
}

export interface MagneticBlock {
  readonly id: number
  x: number
  y: number
}

export interface MagneticBond {
  readonly a: number
  readonly b: number
}

interface MountedBlock extends MagneticBlock {
  readonly el: HTMLElement
}

export interface BoardBounds {
  readonly width: number
  readonly height: number
}

export interface SnapResult {
  readonly dx: number
  readonly dy: number
  readonly bond: MagneticBond
}

interface DragState {
  readonly pointerId: number
  readonly grabbedId: number
  ids: number[]
  offsets: Map<number, { x: number; y: number }>
  lastX: number
  lastY: number
  lastTime: number
  brokeApart: boolean
}

export interface MagneticJoin {
  readonly left: number
  readonly right: number
  readonly total: number
}

export const joinEquation = (summands: readonly number[]): string =>
  `${summands.join('+')}=${summands.reduce((total, value) => total + value, 0)}`
export const splitEquation = (whole: number, removed: number): string => `${whole}-${removed}=${whole - removed}`

const BLOCK_FACES = ['round', 'wide', 'side-eye', 'sleepy', 'cross-eyed', 'surprised'] as const
type BlockFace = typeof BLOCK_FACES[number]
const COMPONENT_COLOR_THEMES = [
  { base: '#ef4444', hue: 0, saturation: 84, lightness: 60 }, // red
  { base: '#f97316', hue: 24, saturation: 92, lightness: 59 }, // orange
  { base: '#facc15', hue: 48, saturation: 94, lightness: 53 }, // yellow
  { base: '#22c55e', hue: 142, saturation: 71, lightness: 45 }, // green
  { base: '#3b82f6', hue: 217, saturation: 91, lightness: 60 }, // blue
  { base: '#6366f1', hue: 239, saturation: 84, lightness: 67 }, // indigo
  { base: '#a855f7', hue: 271, saturation: 91, lightness: 65 }, // violet
  { base: '#ec4899', hue: 330, saturation: 81, lightness: 61 }, // pink
  { base: '#94a3b8', hue: 215, saturation: 20, lightness: 65 }, // grey
  { base: '#f8fafc', hue: 210, saturation: 40, lightness: 98 }, // white
] as const

const bondKey = (a: number, b: number): string => a < b ? `${a}:${b}` : `${b}:${a}`

export const componentColor = (size: number): string =>
  (() => {
    const normalizedSize = Math.max(size, 1)
    const colorIndex = (normalizedSize - 1) % COMPONENT_COLOR_THEMES.length
    const variation = Math.floor((normalizedSize - 1) / COMPONENT_COLOR_THEMES.length)
    const theme = COMPONENT_COLOR_THEMES[colorIndex]!
    if (variation === 0) return theme.base
    const wave = ((variation - 1) % 4 - 1.5) * 7
    const lightness = clamp(theme.lightness + wave, 28, 96)
    const saturation = Math.max(0, theme.saturation - variation * 3)
    return `hsl(${theme.hue + variation * 6}deg ${saturation}% ${lightness}%)`
  })()

const RAINBOW_COLORS = COMPONENT_COLOR_THEMES.slice(0, 7).map(theme => theme.base)

export const blockFillColor = (componentSize: number, blockIndex: number): string =>
  componentSize === 7
    ? RAINBOW_COLORS[blockIndex % RAINBOW_COLORS.length]!
    : componentColor(componentSize)

export const componentOutlineColor = (componentSize: number): string | undefined => {
  const tens = Math.floor(componentSize / 10)
  return tens >= 1 && tens <= 9 ? COMPONENT_COLOR_THEMES[tens - 1]!.base : undefined
}

export const componentsFor = (
  blocks: readonly Pick<MagneticBlock, 'id'>[],
  bonds: readonly MagneticBond[],
): number[][] => {
  const neighbors = new Map<number, number[]>()
  for (const block of blocks) neighbors.set(block.id, [])
  for (const bond of bonds) {
    neighbors.get(bond.a)?.push(bond.b)
    neighbors.get(bond.b)?.push(bond.a)
  }

  const seen = new Set<number>()
  const components: number[][] = []
  for (const block of blocks) {
    if (seen.has(block.id)) continue
    const component: number[] = []
    const queue = [block.id]
    seen.add(block.id)
    while (queue.length > 0) {
      const id = queue.pop()
      if (id === undefined) continue
      component.push(id)
      for (const neighbor of neighbors.get(id) ?? []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        queue.push(neighbor)
      }
    }
    components.push(component)
  }
  return components
}

export const removeBondsFor = (bonds: readonly MagneticBond[], id: number): MagneticBond[] =>
  bonds.filter(bond => bond.a !== id && bond.b !== id)

export const splitComponentAtBestBond = (
  blocks: readonly MagneticBlock[],
  bonds: readonly MagneticBond[],
  grabbedId: number,
  dragX: number,
  dragY: number,
): { bonds: MagneticBond[]; draggedIds: number[] } | undefined => {
  const before = componentsFor(blocks, bonds).find(component => component.includes(grabbedId))
  const grabbed = blocks.find(block => block.id === grabbedId)
  if (!before || !grabbed || before.length < 2) return undefined

  let best: { bonds: MagneticBond[]; draggedIds: number[]; balance: number; opposition: number } | undefined
  for (const bond of bonds) {
    if (bond.a !== grabbedId && bond.b !== grabbedId) continue
    const nextBonds = bonds.filter(candidate => candidate !== bond)
    const after = componentsFor(blocks, nextBonds)
    const draggedIds = after.find(component => component.includes(grabbedId))
    const otherIds = after.find(component => component.some(id => before.includes(id) && !draggedIds?.includes(id)))
    if (!draggedIds || !otherIds) continue
    const neighborId = bond.a === grabbedId ? bond.b : bond.a
    const neighbor = blocks.find(block => block.id === neighborId)
    const opposition = neighbor ? (neighbor.x - grabbed.x) * dragX + (neighbor.y - grabbed.y) * dragY : 0
    const candidate = {
      bonds: nextBonds,
      draggedIds,
      balance: Math.abs(draggedIds.length - otherIds.length),
      opposition,
    }
    if (!best || candidate.balance < best.balance || (candidate.balance === best.balance && candidate.opposition < best.opposition)) {
      best = candidate
    }
  }
  return best ? { bonds: best.bonds, draggedIds: best.draggedIds } : undefined
}

const overlapsAt = (
  movingBlock: MagneticBlock,
  stationaryBlock: MagneticBlock,
  dx: number,
  dy: number,
  cell: number,
): boolean =>
  Math.abs(movingBlock.x + dx - stationaryBlock.x) < cell - 0.01
  && Math.abs(movingBlock.y + dy - stationaryBlock.y) < cell - 0.01

const wouldOverlap = (
  blocks: readonly MagneticBlock[],
  moving: ReadonlySet<number>,
  dx: number,
  dy: number,
  cell: number,
): boolean => {
  for (const movingBlock of blocks) {
    if (!moving.has(movingBlock.id)) continue
    for (const stationaryBlock of blocks) {
      if (moving.has(stationaryBlock.id)) continue
      if (overlapsAt(movingBlock, stationaryBlock, dx, dy, cell)) return true
    }
  }
  return false
}

const canReachOutsideComponent = (
  movingBlocks: readonly MagneticBlock[],
  stationaryBlocks: readonly MagneticBlock[],
  cell: number,
): boolean => {
  // A finite component cannot enclose a path that has travelled farther than
  // its total number of unit blocks. Until then, test every possible unit
  // translation against every individual stationary block.
  const escapeSteps = stationaryBlocks.length + movingBlocks.length + 2
  const queue: Array<readonly [number, number]> = [[0, 0]]
  const visited = new Set(['0:0'])

  for (let index = 0; index < queue.length; index++) {
    const [stepX, stepY] = queue[index]!
    if (Math.abs(stepX) + Math.abs(stepY) > escapeSteps) return true

    for (const [nextX, nextY] of [
      [stepX - 1, stepY],
      [stepX + 1, stepY],
      [stepX, stepY - 1],
      [stepX, stepY + 1],
    ] as const) {
      const key = `${nextX}:${nextY}`
      if (visited.has(key)) continue
      const nextDx = nextX * cell
      const nextDy = nextY * cell
      if (movingBlocks.some(movingBlock => stationaryBlocks.some(stationaryBlock =>
        overlapsAt(movingBlock, stationaryBlock, nextDx, nextDy, cell)))) continue
      visited.add(key)
      queue.push([nextX, nextY])
    }
  }

  return false
}

const fitsBoard = (
  blocks: readonly MagneticBlock[],
  moving: ReadonlySet<number>,
  dx: number,
  dy: number,
  cell: number,
  bounds?: BoardBounds,
): boolean => !bounds || blocks.every(block => !moving.has(block.id) || (
  block.x + dx >= cell / 2
  && block.y + dy >= cell / 2
  && block.x + dx <= bounds.width - cell / 2
  && block.y + dy <= bounds.height - cell / 2
))

/**
 * Finds a collision-free exterior edge for a component that overlaps another
 * component, or is trapped by its individual unit blocks. Unlike normal
 * magnetic snapping, this correction is not distance-limited.
 */
export const findOverlapSnap = (
  blocks: readonly MagneticBlock[],
  bonds: readonly MagneticBond[],
  movingIds: readonly number[],
  cell: number,
  bounds?: BoardBounds,
): SnapResult | undefined => {
  const moving = new Set(movingIds)
  const movingBlocks = blocks.filter(block => moving.has(block.id))
  let closest: (SnapResult & { readonly distance: number }) | undefined

  for (const ids of componentsFor(blocks, bonds)) {
    if (ids.some(id => moving.has(id))) continue
    const stationary = new Set(ids)
    const stationaryBlocks = blocks.filter(block => stationary.has(block.id))
    if (stationaryBlocks.length === 0) continue

    const overlaps = movingBlocks.some(movingBlock =>
      stationaryBlocks.some(stationaryBlock => overlapsAt(movingBlock, stationaryBlock, 0, 0, cell)))
    const enclosed = !overlaps
      && stationaryBlocks.length > movingBlocks.length
      && !canReachOutsideComponent(movingBlocks, stationaryBlocks, cell)
    if (!overlaps && !enclosed) continue

    for (const movingBlock of movingBlocks) {
      for (const stationaryBlock of stationaryBlocks) {
        const targets = [
          { x: stationaryBlock.x - cell, y: stationaryBlock.y },
          { x: stationaryBlock.x + cell, y: stationaryBlock.y },
          { x: stationaryBlock.x, y: stationaryBlock.y - cell },
          { x: stationaryBlock.x, y: stationaryBlock.y + cell },
        ]
        for (const target of targets) {
          const dx = target.x - movingBlock.x
          const dy = target.y - movingBlock.y
          if (!fitsBoard(blocks, moving, dx, dy, cell, bounds)) continue
          if (wouldOverlap(blocks, moving, dx, dy, cell)) continue
          if (enclosed && !canReachOutsideComponent(
            movingBlocks.map(block => ({ ...block, x: block.x + dx, y: block.y + dy })),
            stationaryBlocks,
            cell,
          )) continue
          const distance = Math.hypot(dx, dy)
          if (!closest || distance < closest.distance) {
            closest = {
              dx,
              dy,
              distance,
              bond: { a: movingBlock.id, b: stationaryBlock.id },
            }
          }
        }
      }
    }
  }

  return closest
}

export const findClosestSnap = (
  blocks: readonly MagneticBlock[],
  movingIds: readonly number[],
  cell: number,
  snapDistance: number,
  bounds?: BoardBounds,
): SnapResult | undefined => {
  const moving = new Set(movingIds)
  let closest: (SnapResult & { readonly distance: number }) | undefined

  for (const movingBlock of blocks) {
    if (!moving.has(movingBlock.id)) continue
    for (const stationaryBlock of blocks) {
      if (moving.has(stationaryBlock.id)) continue
      const targets = [
        { x: stationaryBlock.x - cell, y: stationaryBlock.y },
        { x: stationaryBlock.x + cell, y: stationaryBlock.y },
        { x: stationaryBlock.x, y: stationaryBlock.y - cell },
        { x: stationaryBlock.x, y: stationaryBlock.y + cell },
      ]
      for (const target of targets) {
        const dx = target.x - movingBlock.x
        const dy = target.y - movingBlock.y
        const distance = Math.hypot(dx, dy)
        if (distance > snapDistance) continue
        if (!fitsBoard(blocks, moving, dx, dy, cell, bounds)) continue
        if (wouldOverlap(blocks, moving, dx, dy, cell)) continue
        if (!closest || distance < closest.distance) {
          closest = {
            dx,
            dy,
            distance,
            bond: { a: movingBlock.id, b: stationaryBlock.id },
          }
        }
      }
    }
  }
  return closest
}

interface UnitBridgeSnap {
  readonly first: MagneticBlock
  readonly firstTarget: { readonly x: number; readonly y: number }
  readonly second: MagneticBlock
  readonly secondTarget: { readonly x: number; readonly y: number }
  readonly score: number
}

const findUnitBridgeSnap = (
  blocks: readonly MagneticBlock[],
  bonds: readonly MagneticBond[],
  movingIds: readonly number[],
  cell: number,
  snapDistance: number,
  bounds: BoardBounds,
): UnitBridgeSnap | undefined => {
  if (movingIds.length !== 1 || snapDistance < 0) return undefined
  const moving = blocks.find(block => block.id === movingIds[0])
  if (!moving) return undefined
  const stationary = componentsFor(blocks, bonds).flatMap(component => {
    if (component.length !== 1 || component.includes(moving.id)) return []
    const block = blocks.find(candidate => candidate.id === component[0])
    return block ? [block] : []
  })
  const candidates: UnitBridgeSnap[] = []

  const addCandidate = (
    first: MagneticBlock,
    firstTarget: { readonly x: number; readonly y: number },
    second: MagneticBlock,
    secondTarget: { readonly x: number; readonly y: number },
    score: number,
  ): void => {
    const bridgeIds = new Set([moving.id, first.id, second.id])
    const planned = [
      moving,
      { ...first, ...firstTarget },
      { ...second, ...secondTarget },
    ]
    const insideBoard = planned.every(block =>
      block.x >= cell / 2 && block.y >= cell / 2
      && block.x <= bounds.width - cell / 2 && block.y <= bounds.height - cell / 2)
    const clearOfOtherBlocks = planned.every(block => blocks.every(other =>
      bridgeIds.has(other.id) || !overlapsAt(block, other, 0, 0, cell)))
    if (insideBoard && clearOfOtherBlocks) candidates.push({ first, firstTarget, second, secondTarget, score })
  }

  for (const first of stationary) {
    for (const second of stationary) {
      if (first.id === second.id) continue
      const leftDistance = moving.x - first.x
      const rightDistance = second.x - moving.x
      const topDistance = moving.y - first.y
      const bottomDistance = second.y - moving.y

      if (
        leftDistance > 0 && rightDistance > 0
        && Math.abs(leftDistance - cell) <= snapDistance
        && Math.abs(rightDistance - cell) <= snapDistance
        && Math.abs(first.y - moving.y) <= snapDistance
        && Math.abs(second.y - moving.y) <= snapDistance
      ) {
        addCandidate(
          first,
          { x: moving.x - cell, y: moving.y },
          second,
          { x: moving.x + cell, y: moving.y },
          Math.abs(leftDistance - cell) + Math.abs(rightDistance - cell)
            + Math.abs(first.y - moving.y) + Math.abs(second.y - moving.y),
        )
      }

      if (
        topDistance > 0 && bottomDistance > 0
        && Math.abs(topDistance - cell) <= snapDistance
        && Math.abs(bottomDistance - cell) <= snapDistance
        && Math.abs(first.x - moving.x) <= snapDistance
        && Math.abs(second.x - moving.x) <= snapDistance
      ) {
        addCandidate(
          first,
          { x: moving.x, y: moving.y - cell },
          second,
          { x: moving.x, y: moving.y + cell },
          Math.abs(topDistance - cell) + Math.abs(bottomDistance - cell)
            + Math.abs(first.x - moving.x) + Math.abs(second.x - moving.x),
        )
      }
    }
  }

  return candidates.sort((a, b) => a.score - b.score || a.first.id - b.first.id || a.second.id - b.second.id)[0]
}

export const snapTogether = (
  blocks: MagneticBlock[],
  bonds: readonly MagneticBond[],
  movingIds: readonly number[],
  cell: number,
  snapDistance: number,
  bounds: BoardBounds,
): { bonds: MagneticBond[]; ids: number[]; joins: MagneticJoin[]; summands: number[] } => {
  const originalComponents = componentsFor(blocks, bonds)
  let nextBonds = [...bonds]
  let joinedIds = [...movingIds]
  const joins: MagneticJoin[] = []

  const bridge = findUnitBridgeSnap(blocks, nextBonds, joinedIds, cell, snapDistance, bounds)
  if (bridge) {
    bridge.first.x = bridge.firstTarget.x
    bridge.first.y = bridge.firstTarget.y
    bridge.second.x = bridge.secondTarget.x
    bridge.second.y = bridge.secondTarget.y
    nextBonds = [
      ...nextBonds,
      { a: movingIds[0]!, b: bridge.first.id },
      { a: movingIds[0]!, b: bridge.second.id },
    ]
    joins.push(
      { left: 1, right: 1, total: 2 },
      { left: 2, right: 1, total: 3 },
    )
    joinedIds = componentsFor(blocks, nextBonds).find(component => component.includes(movingIds[0]!)) ?? joinedIds
  }

  // Each loop either adds a new component to the moving shape or stops. The
  // bound guarantees that a malformed board can never create a snap loop.
  for (let step = 0; step < blocks.length; step++) {
    const snap = findOverlapSnap(blocks, nextBonds, joinedIds, cell, bounds)
      ?? findClosestSnap(blocks, joinedIds, cell, snapDistance, bounds)
    if (!snap) break
    const key = bondKey(snap.bond.a, snap.bond.b)
    if (nextBonds.some(bond => bondKey(bond.a, bond.b) === key)) break
    const left = joinedIds.length
    const stationary = componentsFor(blocks, nextBonds).find(component => component.includes(snap.bond.b))

    for (const id of joinedIds) {
      const block = blocks.find(candidate => candidate.id === id)
      if (block) {
        block.x += snap.dx
        block.y += snap.dy
      }
    }
    nextBonds = [...nextBonds, snap.bond]
    const expanded = componentsFor(blocks, nextBonds).find(component => component.includes(snap.bond.a))
    if (!expanded || expanded.length <= joinedIds.length) break
    joins.push({ left, right: stationary?.length ?? expanded.length - left, total: expanded.length })
    joinedIds = expanded
  }

  const joined = new Set(joinedIds)
  const summands = joins.length === 0
    ? []
    : originalComponents
      .filter(component => component.some(id => joined.has(id)))
      .map(component => {
        const componentBlocks = blocks.filter(block => component.includes(block.id))
        return {
          size: component.length,
          top: Math.min(...componentBlocks.map(block => block.y)),
          left: Math.min(...componentBlocks.map(block => block.x)),
          firstId: Math.min(...component),
        }
      })
      .sort((a, b) => a.top - b.top || a.left - b.left || a.firstId - b.firstId)
      .map(component => component.size)

  return { bonds: nextBonds, ids: joinedIds, joins, summands }
}

export const settleOverlappingBlocks = (
  blocks: MagneticBlock[],
  bonds: readonly MagneticBond[],
  cell: number,
  bounds: BoardBounds,
): { bonds: MagneticBond[]; ids: number[]; joins: MagneticJoin[] } => {
  let nextBonds = [...bonds]
  const settledIds = new Set<number>()
  const joins: MagneticJoin[] = []

  // Prefer moving the smaller component, which makes an enclosed collection
  // leave the larger collection instead of shifting the larger shape around it.
  for (let step = 0; step < blocks.length; step++) {
    const components = componentsFor(blocks, nextBonds).sort((left, right) => left.length - right.length)
    let changed = false
    for (const component of components) {
      const snapped = snapTogether(blocks, nextBonds, component, cell, -1, bounds)
      if (snapped.joins.length === 0) continue
      nextBonds = snapped.bonds
      for (const id of snapped.ids) settledIds.add(id)
      joins.push(...snapped.joins)
      changed = true
      break
    }
    if (!changed) break
  }

  return { bonds: nextBonds, ids: [...settledIds], joins }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

type BlockSide = 'top' | 'right' | 'bottom' | 'left'
export type MagneticLabelCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'
export interface MagneticLabelPlacement {
  readonly id: number
  readonly corner: MagneticLabelCorner
}

const LABEL_CORNERS: ReadonlyArray<{ readonly corner: MagneticLabelCorner; readonly sides: readonly [BlockSide, BlockSide] }> = [
  { corner: 'top-left', sides: ['top', 'left'] },
  { corner: 'top-right', sides: ['top', 'right'] },
  { corner: 'bottom-right', sides: ['bottom', 'right'] },
  { corner: 'bottom-left', sides: ['bottom', 'left'] },
]

const exposedSidesFor = (
  block: MagneticBlock,
  component: readonly MagneticBlock[],
  cell: number,
): ReadonlySet<BlockSide> => {
  const tolerance = cell * 0.16
  const occupied = (x: number, y: number): boolean =>
    component.some(candidate => candidate.id !== block.id && Math.abs(candidate.x - x) < tolerance && Math.abs(candidate.y - y) < tolerance)

  return new Set<BlockSide>([
    ...(occupied(block.x, block.y - cell) ? [] : ['top' as const]),
    ...(occupied(block.x + cell, block.y) ? [] : ['right' as const]),
    ...(occupied(block.x, block.y + cell) ? [] : ['bottom' as const]),
    ...(occupied(block.x - cell, block.y) ? [] : ['left' as const]),
  ])
}

export const labelPlacementFor = (
  blocks: readonly MagneticBlock[],
  ids: readonly number[],
  cell: number,
  previous?: MagneticLabelPlacement,
): MagneticLabelPlacement | undefined => {
  const component = ids.flatMap(id => {
    const block = blocks.find(candidate => candidate.id === id)
    return block ? [block] : []
  })
  if (component.length === 0) return undefined

  const candidates = component.flatMap(block => {
    const exposed = exposedSidesFor(block, component, cell)
    const corners = LABEL_CORNERS.filter(({ sides }) => sides.every(side => exposed.has(side)))
    return corners.length > 0 ? [{ block, corners }] : []
  })
  if (candidates.length === 0) return undefined

  const retained = previous && candidates.find(candidate => candidate.block.id === previous.id)
  const selected = retained ?? [...candidates].sort((a, b) =>
    a.block.y - b.block.y || a.block.x - b.block.x || a.block.id - b.block.id,
  )[0]!
  const corner = retained?.corners.find(candidate => candidate.corner === previous?.corner)
    ?? (() => {
      const centreX = component.reduce((sum, block) => sum + block.x, 0) / component.length
      const centreY = component.reduce((sum, block) => sum + block.y, 0) / component.length
      const signFor = (candidate: MagneticLabelCorner): readonly [number, number] => {
        switch (candidate) {
          case 'top-left': return [-1, -1]
          case 'top-right': return [1, -1]
          case 'bottom-right': return [1, 1]
          case 'bottom-left': return [-1, 1]
        }
      }
      return [...selected.corners].sort((a, b) => {
        const [ax, ay] = signFor(a.corner)
        const [bx, by] = signFor(b.corner)
        const aDistance = (selected.block.x + ax * cell / 2 - centreX) ** 2 + (selected.block.y + ay * cell / 2 - centreY) ** 2
        const bDistance = (selected.block.x + bx * cell / 2 - centreX) ** 2 + (selected.block.y + by * cell / 2 - centreY) ** 2
        return bDistance - aDistance
      })[0]!
    })()

  return { id: selected.block.id, corner: corner.corner }
}

const playMagnetNoise = (
  context: AudioContext,
  start: number,
  duration: number,
  volume: number,
  filterType: BiquadFilterType,
  filterFrequency: number,
): void => {
  const sampleCount = Math.ceil(context.sampleRate * duration)
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < sampleCount; index++) {
    const decay = (1 - index / sampleCount) ** 3
    samples[index] = (Math.random() * 2 - 1) * decay
  }

  const source = context.createBufferSource()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()
  source.buffer = buffer
  filter.type = filterType
  filter.frequency.setValueAtTime(filterFrequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start(start)
  source.stop(start + duration)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
}

const playMagnetClick = (kind: 'join' | 'release', joins: number = 1): void => {
  const context = getContext()
  if (!context) return

  try {
    const now = context.currentTime
    if (kind === 'join') {
      playMagnetNoise(context, now, 0.012 + Math.min(joins, 4) * 0.001, 0.085, 'highpass', 950)
      return
    }
    playMagnetNoise(context, now, 0.02, 0.08, 'lowpass', 1250)
  } catch {
    // Audio is optional; a browser can deny an audio node even after the gesture.
  }
}

const boardCellSize = (bounds: BoardBounds): number =>
  clamp(Math.min(bounds.width / 8.2, bounds.height / 5.6), 42, 76)

const pagePoint = (event: PointerEvent, board: HTMLElement): { x: number; y: number } => {
  const rect = board.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

const createBlockElement = (id: number): HTMLElement => {
  const el = document.createElement('div')
  el.className = 'magnetic-block'
  el.setAttribute('data-magnetic-id', id.toString())
  el.setAttribute('role', 'button')
  el.setAttribute('aria-label', 'Magnetic block')
  const face = document.createElement('span')
  face.className = 'magnetic-block-face'
  face.setAttribute('aria-hidden', 'true')
  const eyes = document.createElement('span')
  eyes.className = 'magnetic-block-eyes'
  for (const side of ['left', 'right'] as const) {
    const eye = document.createElement('span')
    eye.className = `magnetic-block-eye magnetic-block-eye--${side}`
    const white = document.createElement('span')
    white.className = 'magnetic-block-eye-white'
    const pupil = document.createElement('span')
    pupil.className = 'magnetic-block-eye-pupil'
    white.append(pupil)
    eye.append(white)
    eyes.append(eye)
  }
  const mouth = document.createElement('span')
  mouth.className = 'magnetic-block-mouth'
  face.append(eyes, mouth)
  const count = document.createElement('span')
  count.className = 'magnetic-block-count'
  el.append(face, count)
  return el
}

export const mountMagneticBlocks = (element: Element): Stream.Stream<never> =>
  Stream.callback<never>(() =>
    Effect.gen(function* () {
      const board = element as HTMLElement

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          let blocks: MountedBlock[] = []
          let bonds: MagneticBond[] = []
          let nextId = 0
          let drag: DragState | undefined
          let cell = boardCellSize(board.getBoundingClientRect())
          const readBreakSpeed = (): number =>
            normalizeBreakSpeed(Number(board.getAttribute('data-magnetic-break-speed') ?? DEFAULT_BREAK_SPEED))
          let breakSpeed = readBreakSpeed()
          let muted = board.getAttribute('data-magnetic-muted') === 'true'
          let faces = new Map<number, BlockFace>()
          let labels = new Map<number, MagneticLabelCorner>()

          const speechOptions = (): SpeechOptions => {
            const rate = Number(board.getAttribute('data-magnetic-speech-rate'))
            const pitch = Number(board.getAttribute('data-magnetic-speech-pitch'))
            return {
              ...(Number.isFinite(rate) && rate > 0 ? { rate } : {}),
              ...(Number.isFinite(pitch) && pitch > 0 ? { pitch } : {}),
              lang: board.getAttribute('data-magnetic-language') ?? 'en',
            }
          }

          const bounds = (): BoardBounds => {
            const rect = board.getBoundingClientRect()
            return { width: rect.width, height: rect.height }
          }

          const colorBlocks = (): void => {
            const sizes = new Map<number, number>()
            const colors = new Map<number, string>()
            const faceById = new Map<number, BlockFace>()
            const nextFaces = new Map<number, BlockFace>()
            const nextLabels = new Map<number, MagneticLabelCorner>()
            for (const component of componentsFor(blocks, bonds)) {
              const featuredId = [...component].sort((a, b) => a - b).find(id => faces.has(id))
                ?? component[Math.floor(Math.random() * component.length)]!
              const featuredFace = faces.get(featuredId) ?? BLOCK_FACES[Math.floor(Math.random() * BLOCK_FACES.length)]!
              nextFaces.set(featuredId, featuredFace)
              faceById.set(featuredId, featuredFace)
              for (const [index, id] of [...component].sort((a, b) => a - b).entries()) {
                sizes.set(id, component.length)
                colors.set(id, blockFillColor(component.length, index))
              }

              const priorLabels = component.flatMap(id => {
                const corner = labels.get(id)
                return corner ? [{ id, corner }] : []
              }).sort((a, b) => a.id - b.id)
              const placement = priorLabels
                .map(previous => labelPlacementFor(blocks, component, cell, previous))
                .find((candidate, index) => candidate?.id === priorLabels[index]?.id)
                ?? labelPlacementFor(blocks, component, cell)
              if (placement) nextLabels.set(placement.id, placement.corner)
            }
            faces = nextFaces
            labels = nextLabels
            for (const block of blocks) {
              const size = sizes.get(block.id) ?? 1
              const labelCorner = labels.get(block.id)
              const outline = componentOutlineColor(size)
              block.el.style.setProperty('--magnetic-block-color', colors.get(block.id) ?? componentColor(size))
              if (outline) block.el.style.setProperty('--magnetic-block-outline', outline)
              else block.el.style.removeProperty('--magnetic-block-outline')
              block.el.style.setProperty('--magnetic-block-size', `${cell}px`)
              const face = block.el.querySelector('.magnetic-block-face')!
              const faceVariant = faceById.get(block.id)
              face.classList.toggle('magnetic-block-face--visible', faceVariant !== undefined)
              if (faceVariant) face.setAttribute('data-magnetic-face', faceVariant)
              else face.removeAttribute('data-magnetic-face')
              block.el.querySelector('.magnetic-block-count')!.textContent = labelCorner ? size.toString() : ''
              block.el.classList.toggle('magnetic-block--has-count', labelCorner !== undefined)
              if (labelCorner) block.el.setAttribute('data-magnetic-label-corner', labelCorner)
              else block.el.removeAttribute('data-magnetic-label-corner')
              block.el.title = size > 1 ? `${size} blocks snapped together` : '1 block'
            }
          }

          const render = (): void => {
            for (const block of blocks) {
              block.el.style.transform = `translate3d(${block.x - cell / 2}px, ${block.y - cell / 2}px, 0)`
            }
            colorBlocks()
          }

          const showSnap = (ids: readonly number[]): void => {
            for (const id of ids) {
              const block = blocks.find(candidate => candidate.id === id)
              if (!block) continue
              block.el.classList.remove('magnetic-block--snap')
              void block.el.offsetWidth
              block.el.classList.add('magnetic-block--snap')
              window.setTimeout(() => block.el.classList.remove('magnetic-block--snap'), 420)
            }
          }

          const addBlock = (x: number, y: number): void => {
            const block: MountedBlock = { id: nextId++, x, y, el: createBlockElement(nextId - 1) }
            blocks.push(block)
            board.appendChild(block.el)
          }

          const randomPosition = (): { x: number; y: number } | undefined => {
            const area = bounds()
            const isOpen = (x: number, y: number): boolean =>
              blocks.every(block => Math.abs(x - block.x) >= cell || Math.abs(y - block.y) >= cell)
            for (let attempt = 0; attempt < 160; attempt++) {
              const x = cell / 2 + Math.random() * Math.max(0, area.width - cell)
              const y = cell / 2 + Math.random() * Math.max(0, area.height - cell)
              if (isOpen(x, y)) return { x, y }
            }
            const gridPositions: Array<{ x: number; y: number }> = []
            for (let y = cell / 2; y <= area.height - cell / 2; y += cell) {
              for (let x = cell / 2; x <= area.width - cell / 2; x += cell) {
                if (isOpen(x, y)) gridPositions.push({ x, y })
              }
            }
            if (gridPositions.length > 0) return gridPositions[Math.floor(Math.random() * gridPositions.length)]
            return undefined
          }

          const spawn = (amount: number): void => {
            const count = Math.min(amount, MAX_BLOCKS - blocks.length)
            for (let i = 0; i < count; i++) {
              const point = randomPosition()
              if (!point) break
              addBlock(point.x, point.y)
            }
            render()
          }

          const removeNewestBlock = (): void => {
            const block = blocks.at(-1)
            if (!block) return
            bonds = removeBondsFor(bonds, block.id)
            block.el.remove()
            blocks = blocks.filter(candidate => candidate.id !== block.id)
            render()
          }

          const componentFor = (id: number): number[] =>
            componentsFor(blocks, bonds).find(component => component.includes(id)) ?? [id]

          const offsetsFor = (ids: readonly number[], x: number, y: number): Map<number, { x: number; y: number }> =>
            new Map(ids.flatMap(id => {
              const block = blocks.find(candidate => candidate.id === id)
              return block ? [[id, { x: block.x - x, y: block.y - y }] as const] : []
            }))

          const moveDraggedBlocks = (point: { x: number; y: number }): void => {
            if (!drag) return
            const grabbed = blocks.find(block => block.id === drag!.grabbedId)
            const grabbedOffset = drag.offsets.get(drag.grabbedId)
            if (!grabbed || !grabbedOffset) return
            const desiredX = point.x + grabbedOffset.x
            const desiredY = point.y + grabbedOffset.y
            const rawDx = desiredX - grabbed.x
            const rawDy = desiredY - grabbed.y
            const area = bounds()
            const draggedBlocks = blocks.filter(block => drag!.ids.includes(block.id))
            const minDx = Math.max(...draggedBlocks.map(block => cell / 2 - block.x))
            const maxDx = Math.min(...draggedBlocks.map(block => area.width - cell / 2 - block.x))
            const minDy = Math.max(...draggedBlocks.map(block => cell / 2 - block.y))
            const maxDy = Math.min(...draggedBlocks.map(block => area.height - cell / 2 - block.y))
            const dx = clamp(rawDx, minDx, maxDx)
            const dy = clamp(rawDy, minDy, maxDy)
            for (const block of draggedBlocks) {
              block.x += dx
              block.y += dy
            }
            render()
          }

          const onPointerDown = (event: PointerEvent): void => {
            const target = (event.target as Element).closest('[data-magnetic-id]') as HTMLElement | null
            if (!target) return
            const id = Number(target.getAttribute('data-magnetic-id'))
            if (!Number.isInteger(id)) return
            const point = pagePoint(event, board)
            const ids = componentFor(id)
            drag = {
              pointerId: event.pointerId,
              grabbedId: id,
              ids,
              offsets: offsetsFor(ids, point.x, point.y),
              lastX: point.x,
              lastY: point.y,
              lastTime: event.timeStamp,
              brokeApart: false,
            }
            for (const draggedId of ids) blocks.find(block => block.id === draggedId)?.el.classList.add('magnetic-block--dragging')
            board.setPointerCapture(event.pointerId)
            event.preventDefault()
          }

          const onPointerMove = (event: PointerEvent): void => {
            if (!drag || drag.pointerId !== event.pointerId) return
            const point = pagePoint(event, board)
            const elapsed = event.timeStamp - drag.lastTime
            const speed = elapsed > 12 ? Math.hypot(point.x - drag.lastX, point.y - drag.lastY) * 1000 / elapsed : 0
            if (speed > breakSpeed && drag.ids.length > 1 && !drag.brokeApart) {
              const split = splitComponentAtBestBond(blocks, bonds, drag.grabbedId, point.x - drag.lastX, point.y - drag.lastY)
              if (split) {
                const equation = splitEquation(drag.ids.length, split.draggedIds.length)
                bonds = split.bonds
                for (const id of drag.ids) blocks.find(block => block.id === id)?.el.classList.remove('magnetic-block--dragging')
                drag.ids = split.draggedIds
                drag.offsets = offsetsFor(drag.ids, point.x, point.y)
                drag.brokeApart = true
                blocks.find(block => block.id === drag!.grabbedId)?.el.classList.add('magnetic-block--dragging')
                colorBlocks()
                if (!muted) {
                  playMagnetClick('release')
                  const options = speechOptions()
                  speakNow(arithmeticExpressionForSpeech(equation, options.lang ?? 'en'), options)
                }
              }
            }
            moveDraggedBlocks(point)
            drag.lastX = point.x
            drag.lastY = point.y
            drag.lastTime = event.timeStamp
          }

          const finishDrag = (event: PointerEvent): void => {
            if (!drag || drag.pointerId !== event.pointerId) return
            const snapped = snapTogether(blocks, bonds, drag.ids, cell, cell * SNAP_DISTANCE_FACTOR, bounds())
            bonds = snapped.bonds
            const joins = snapped.joins.length
            const equation = joins > 0 ? joinEquation(snapped.summands) : undefined
            if (joins > 0) showSnap(snapped.ids)
            for (const id of drag.ids) blocks.find(block => block.id === id)?.el.classList.remove('magnetic-block--dragging')
            if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId)
            drag = undefined
            render()
            if (!muted && event.type === 'pointerup') {
              warmAudio()
              if (joins > 0) playMagnetClick('join', joins)
              if (equation) {
                const options = speechOptions()
                const language = options.lang ?? 'en'
                speakNow(arithmeticExpressionForSpeech(equation, language), options)
              }
            }
          }

          const onResize = (): void => {
            const previousCell = cell
            cell = boardCellSize(bounds())
            const scale = cell / previousCell
            const area = bounds()
            for (const block of blocks) {
              block.x = clamp(block.x * scale, cell / 2, area.width - cell / 2)
              block.y = clamp(block.y * scale, cell / 2, area.height - cell / 2)
            }
            const settled = settleOverlappingBlocks(blocks, bonds, cell, area)
            bonds = settled.bonds
            if (settled.ids.length > 0) showSnap(settled.ids)
            render()
          }

          let spawnedFor = Number(board.getAttribute('data-magnetic-spawn-id')) || 0
          let removedFor = Number(board.getAttribute('data-magnetic-remove-id')) || 0
          const onBoardRequest = (): void => {
            const nextSpawnId = Number(board.getAttribute('data-magnetic-spawn-id')) || 0
            const nextRemoveId = Number(board.getAttribute('data-magnetic-remove-id')) || 0
            breakSpeed = readBreakSpeed()
            muted = board.getAttribute('data-magnetic-muted') === 'true'
            if (nextSpawnId !== spawnedFor) {
              spawnedFor = nextSpawnId
              spawn(3 + Math.floor(Math.random() * 4))
            }
            if (nextRemoveId !== removedFor) {
              removedFor = nextRemoveId
              removeNewestBlock()
            }
          }
          const resizeObserver = new ResizeObserver(onResize)
          const spawnObserver = new MutationObserver(onBoardRequest)
          resizeObserver.observe(board)
          spawnObserver.observe(board, { attributes: true, attributeFilter: ['data-magnetic-spawn-id', 'data-magnetic-remove-id', 'data-magnetic-break-speed', 'data-magnetic-muted'] })
          board.addEventListener('pointerdown', onPointerDown)
          board.addEventListener('pointermove', onPointerMove)
          board.addEventListener('pointerup', finishDrag)
          board.addEventListener('pointercancel', finishDrag)
          spawn(INITIAL_BLOCKS)

          return { resizeObserver, spawnObserver, onPointerDown, onPointerMove, finishDrag }
        }),
        ({ resizeObserver, spawnObserver, onPointerDown, onPointerMove, finishDrag }) => Effect.sync(() => {
          resizeObserver.disconnect()
          spawnObserver.disconnect()
          board.removeEventListener('pointerdown', onPointerDown)
          board.removeEventListener('pointermove', onPointerMove)
          board.removeEventListener('pointerup', finishDrag)
          board.removeEventListener('pointercancel', finishDrag)
        }),
      )
      return yield* Effect.never
    }),
  )

export const view = (model: Model, language: string = 'en', muted: boolean = false, speech: SpeechOptions = {}) => {
  const h = html<Message>()

  return h.div(
    [h.Class('page magnetic-blocks-page')],
    [
      h.div([h.Class('card magnetic-blocks-card')], [
        h.div([h.Class('magnetic-blocks-heading')], [
          h.div([], [
            h.h1([h.Class('title')], [t('magneticBlocksTitle', language)]),
            h.p([h.Class('magnetic-blocks-help')], ['Drag slowly to carry joined blocks. Flick a block quickly to pull it free.']),
          ]),
          h.div([h.Class('magnetic-blocks-actions')], [
            h.button([h.Class(`btn btn-primary magnetic-blocks-spawn${model.spawnId > 0 ? ' magnetic-blocks-spawn--active' : ''}`), h.OnClick(SpawnBlocks()), h.Key(model.spawnId.toString())], [t('magneticBlocksSpawn', language)]),
            h.button([h.Class('btn btn-secondary magnetic-blocks-remove'), h.OnClick(RemoveBlock()), h.Key(model.removeId.toString())], [t('magneticBlocksRemove', language)]),
          ]),
        ]),
        h.div([
          h.Class('magnetic-blocks-board'),
          h.Attribute('data-magnetic-spawn-id', model.spawnId.toString()),
          h.Attribute('data-magnetic-remove-id', model.removeId.toString()),
          h.Attribute('data-magnetic-break-speed', model.breakSpeed.toString()),
          h.Attribute('data-magnetic-muted', muted.toString()),
          h.Attribute('data-magnetic-speech-rate', String(speech.rate ?? '')),
          h.Attribute('data-magnetic-speech-pitch', String(speech.pitch ?? '')),
          h.Attribute('data-magnetic-language', speech.lang ?? language),
          h.OnMount({ name: 'magneticBlocks', f: mountMagneticBlocks }),
        ], []),
        h.p([h.Class('magnetic-blocks-key')], ['Same-sized colour = one magnetic shape. Snap blocks edge-to-edge!']),
      ]),
    ],
  )
}
