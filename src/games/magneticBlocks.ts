import { Effect, Schema as S, Stream } from 'effect'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { t } from '../i18n'

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

interface SnapResult {
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

const BLOCK_FACES = ['•ᴗ•', '◕‿◕', '^‿^', '˶ᵔ ᵕ ᵔ˶', 'ᵔᴗᵔ', '•‿•']
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
      if (
        Math.abs(movingBlock.x + dx - stationaryBlock.x) < cell * 0.72
        && Math.abs(movingBlock.y + dy - stationaryBlock.y) < cell * 0.72
      ) return true
    }
  }
  return false
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
        if (bounds && blocks.some(block => moving.has(block.id) && (
          block.x + dx < cell / 2
          || block.y + dy < cell / 2
          || block.x + dx > bounds.width - cell / 2
          || block.y + dy > bounds.height - cell / 2
        ))) continue
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

export const snapTogether = (
  blocks: MagneticBlock[],
  bonds: readonly MagneticBond[],
  movingIds: readonly number[],
  cell: number,
  snapDistance: number,
  bounds: BoardBounds,
): { bonds: MagneticBond[]; ids: number[] } => {
  let nextBonds = [...bonds]
  let joinedIds = [...movingIds]

  // Each loop either adds a new component to the moving shape or stops. The
  // bound guarantees that a malformed board can never create a snap loop.
  for (let step = 0; step < blocks.length; step++) {
    const snap = findClosestSnap(blocks, joinedIds, cell, snapDistance, bounds)
    if (!snap) break
    const key = bondKey(snap.bond.a, snap.bond.b)
    if (nextBonds.some(bond => bondKey(bond.a, bond.b) === key)) break

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
    joinedIds = expanded
  }

  return { bonds: nextBonds, ids: joinedIds }
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

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
          let breakSpeed = normalizeBreakSpeed(Number(board.getAttribute('data-magnetic-break-speed')))
          const faces = new Map<string, { id: number; face: string }>()

          const bounds = (): BoardBounds => {
            const rect = board.getBoundingClientRect()
            return { width: rect.width, height: rect.height }
          }

          const colorBlocks = (): void => {
            const sizes = new Map<number, number>()
            const faceById = new Map<number, string>()
            const activeComponents = new Set<string>()
            for (const component of componentsFor(blocks, bonds)) {
              const key = [...component].sort((a, b) => a - b).join(':')
              activeComponents.add(key)
              let featured = faces.get(key)
              if (!featured || !component.includes(featured.id)) {
                featured = {
                  id: component[Math.floor(Math.random() * component.length)]!,
                  face: BLOCK_FACES[Math.floor(Math.random() * BLOCK_FACES.length)]!,
                }
                faces.set(key, featured)
              }
              faceById.set(featured.id, featured.face)
              for (const id of component) sizes.set(id, component.length)
            }
            for (const key of faces.keys()) if (!activeComponents.has(key)) faces.delete(key)
            for (const block of blocks) {
              const size = sizes.get(block.id) ?? 1
              block.el.style.setProperty('--magnetic-block-color', componentColor(size))
              block.el.style.setProperty('--magnetic-block-size', `${cell}px`)
              block.el.querySelector('.magnetic-block-face')!.textContent = faceById.get(block.id) ?? ''
              block.el.querySelector('.magnetic-block-count')!.textContent = size > 1 ? size.toString() : ''
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
              blocks.every(block => Math.abs(x - block.x) >= cell * 0.92 || Math.abs(y - block.y) >= cell * 0.92)
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
                bonds = split.bonds
                for (const id of drag.ids) blocks.find(block => block.id === id)?.el.classList.remove('magnetic-block--dragging')
                drag.ids = split.draggedIds
                drag.offsets = offsetsFor(drag.ids, point.x, point.y)
                drag.brokeApart = true
                blocks.find(block => block.id === drag!.grabbedId)?.el.classList.add('magnetic-block--dragging')
                colorBlocks()
              }
            }
            moveDraggedBlocks(point)
            drag.lastX = point.x
            drag.lastY = point.y
            drag.lastTime = event.timeStamp
          }

          const finishDrag = (event: PointerEvent): void => {
            if (!drag || drag.pointerId !== event.pointerId) return
            const previousBondCount = bonds.length
            const snapped = snapTogether(blocks, bonds, drag.ids, cell, cell * SNAP_DISTANCE_FACTOR, bounds())
            bonds = snapped.bonds
            if (bonds.length > previousBondCount) showSnap(snapped.ids)
            for (const id of drag.ids) blocks.find(block => block.id === id)?.el.classList.remove('magnetic-block--dragging')
            if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId)
            drag = undefined
            render()
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
            render()
          }

          let spawnedFor = Number(board.getAttribute('data-magnetic-spawn-id')) || 0
          let removedFor = Number(board.getAttribute('data-magnetic-remove-id')) || 0
          const onBoardRequest = (): void => {
            const nextSpawnId = Number(board.getAttribute('data-magnetic-spawn-id')) || 0
            const nextRemoveId = Number(board.getAttribute('data-magnetic-remove-id')) || 0
            breakSpeed = normalizeBreakSpeed(Number(board.getAttribute('data-magnetic-break-speed')))
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
          spawnObserver.observe(board, { attributes: true, attributeFilter: ['data-magnetic-spawn-id', 'data-magnetic-remove-id', 'data-magnetic-break-speed'] })
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

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
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
          h.OnMount({ name: 'magneticBlocks', f: mountMagneticBlocks }),
        ], []),
        h.p([h.Class('magnetic-blocks-key')], ['Same-sized colour = one magnetic shape. Snap blocks edge-to-edge!']),
      ]),
    ],
  )
}
