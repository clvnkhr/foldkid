import { warmAudio } from '../audio'

export interface HandwritingPoint { readonly x: number; readonly y: number }
export interface HandwritingHandlers {
  readonly started: (id: number, x: number, y: number, revision: number) => void
  readonly moved: (id: number, points: ReadonlyArray<HandwritingPoint>, revision: number) => void
  readonly ended: (id: number, revision: number) => void
  readonly cancelled: (id: number, revision: number) => void
}
interface ClientPoint { readonly clientX: number; readonly clientY: number }
interface Contact {
  readonly id: number
  readonly revision: number
  readonly target: EventTarget | null
  readonly startedAt: number
  readonly touchPointer: boolean
  x: number
  y: number
  lastTime: number
  lastPoint: HandwritingPoint
  pending: HandwritingPoint[]
  paired: boolean
  captureId?: number
}
const validId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0
const revisionOf = (svg: SVGSVGElement): number | undefined => {
  const raw = svg.getAttribute('data-handwriting-revision')
  if (raw === null || raw.trim() === '') return undefined
  const revision = Number(raw)
  return validId(revision) ? revision : undefined
}
const viewBoxOf = (svg: SVGSVGElement): { x: number; y: number; width: number; height: number } | undefined => {
  const values = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (!values || values.length !== 4 || !values.every(Number.isFinite) || values[2]! <= 0 || values[3]! <= 0) return undefined
  return { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! }
}

/** Uses current SVG geometry on every event, including letterboxing and CSS resizing. */
const localPoint = (svg: SVGSVGElement, client: ClientPoint): HandwritingPoint | undefined => {
  if (![client.clientX, client.clientY].every(Number.isFinite)) return undefined
  const viewBox = viewBoxOf(svg)
  let rect: DOMRect
  try { rect = svg.getBoundingClientRect() } catch { return undefined }
  if (!viewBox || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return undefined
  try {
    const inverse = svg.getScreenCTM?.()?.inverse()
    if (inverse && [inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f].every(Number.isFinite) && inverse.a * inverse.d - inverse.b * inverse.c !== 0) {
      const x = inverse.a * client.clientX + inverse.c * client.clientY + inverse.e
      const y = inverse.b * client.clientX + inverse.d * client.clientY + inverse.f
      if ([x, y].every(Number.isFinite)) return { x, y }
    }
  } catch { /* WebKit and detached SVGs may not expose an invertible matrix. */ }
  const aspect = svg.getAttribute('preserveAspectRatio')?.trim().split(/\s+/).filter(value => value !== 'defer') ?? []
  const align = aspect[0] ?? 'xMidYMid'
  if (align === 'none') return { x: viewBox.x + (client.clientX - rect.left) / rect.width * viewBox.width, y: viewBox.y + (client.clientY - rect.top) / rect.height * viewBox.height }
  const scale = aspect[1] === 'slice' ? Math.max(rect.width / viewBox.width, rect.height / viewBox.height) : Math.min(rect.width / viewBox.width, rect.height / viewBox.height)
  const extraX = rect.width - viewBox.width * scale
  const extraY = rect.height - viewBox.height * scale
  const offsetX = align.includes('xMax') ? extraX : align.includes('xMin') ? 0 : extraX / 2
  const offsetY = align.includes('YMax') ? extraY : align.includes('YMin') ? 0 : extraY / 2
  return { x: viewBox.x + (client.clientX - rect.left - offsetX) / scale, y: viewBox.y + (client.clientY - rect.top - offsetY) / scale }
}

/** One semantic stroke per finger; native touch can adopt either event order. */
export const createHandwritingRuntime = (svg: SVGSVGElement, handlers: HandwritingHandlers): (() => void) => {
  const document = svg.ownerDocument
  const window = document.defaultView
  const contacts = new Map<string, Contact>()
  const nativeOwners = new Map<number, string>()
  let nextId = 0
  let frame: number | undefined
  let stopped = false
  const releaseCapture = (contact: Contact): void => {
    const id = contact.captureId
    contact.captureId = undefined
    if (id === undefined) return
    try { if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id) } catch { /* Document listeners cover unavailable capture. */ }
  }
  const cancelFrame = (): void => {
    if (frame !== undefined) {
      try { window?.cancelAnimationFrame(frame) } catch { /* Cleanup remains safe if animation APIs disappear. */ }
    }
    frame = undefined
  }
  const remove = (key: string, cancelled: boolean): boolean => {
    const contact = contacts.get(key)
    if (!contact) return false
    contacts.delete(key)
    for (const [pointerId, owner] of nativeOwners) if (owner === key) nativeOwners.delete(pointerId)
    releaseCapture(contact)
    if (cancelled) handlers.cancelled(contact.id, contact.revision)
    if (![...contacts.values()].some(active => active.pending.length > 0)) cancelFrame()
    return true
  }
  const cancelAll = (): void => {
    for (const key of [...contacts.keys()]) remove(key, true)
    nativeOwners.clear()
    cancelFrame()
  }
  const invalidate = (): void => {
    const revision = revisionOf(svg)
    for (const [key, contact] of [...contacts]) if (contact.revision !== revision) remove(key, true)
  }
  const flush = (contact: Contact): void => {
    if (contact.pending.length === 0) return
    const points = contact.pending
    contact.pending = []
    for (let index = 0; index < points.length; index += 256) handlers.moved(contact.id, points.slice(index, index + 256), contact.revision)
  }
  const flushAll = (): void => {
    frame = undefined
    if (stopped) return
    invalidate()
    for (const contact of contacts.values()) flush(contact)
  }
  const schedule = (): void => {
    if (frame !== undefined) return
    try { frame = window?.requestAnimationFrame?.(flushAll) } catch { /* Synchronous batching is the safe fallback. */ }
    if (frame === undefined) flushAll()
  }
  const ownedTarget = (target: EventTarget | null): boolean => target === svg || target instanceof Node && svg.contains(target)
  const sameStart = (contact: Contact, client: ClientPoint, target: EventTarget | null, time: number): boolean =>
    contact.target === target && Math.abs(contact.startedAt - time) <= 40 && Math.hypot(contact.x - client.clientX, contact.y - client.clientY) <= 1
  const start = (key: string, client: ClientPoint, target: EventTarget | null, time: number, touchPointer: boolean, captureId?: number): boolean => {
    if (stopped || contacts.has(key) || !ownedTarget(target) || !Number.isFinite(time)) return false
    invalidate()
    const revision = revisionOf(svg)
    const point = localPoint(svg, client)
    const box = viewBoxOf(svg)
    if (revision === undefined || !point || !box || point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height || !validId(nextId)) return false
    const contact: Contact = { id: nextId++, revision, target, startedAt: time, touchPointer, x: client.clientX, y: client.clientY, lastTime: time, lastPoint: point, pending: [], paired: false }
    contacts.set(key, contact)
    try { svg.focus?.({ preventScroll: true }) } catch { /* Tracing also works when SVG focus is unavailable. */ }
    if (captureId !== undefined) {
      try { svg.setPointerCapture(captureId); contact.captureId = captureId } catch { /* Native touch and document releases do not require capture. */ }
    }
    handlers.started(contact.id, point.x, point.y, revision)
    return true
  }
  const append = (contact: Contact, client: ClientPoint, time: number): void => {
    if (!Number.isFinite(time) || time < contact.lastTime) return
    const point = localPoint(svg, client)
    if (!point) return
    contact.x = client.clientX
    contact.y = client.clientY
    contact.lastTime = time
    if (point.x === contact.lastPoint.x && point.y === contact.lastPoint.y) return
    contact.lastPoint = point
    contact.pending.push(point)
  }
  const move = (key: string, client: ClientPoint, time: number): boolean => {
    invalidate()
    const contact = contacts.get(key)
    if (!contact) return false
    append(contact, client, time)
    if (contact.pending.length > 0) schedule()
    return true
  }
  const finish = (key: string, client: ClientPoint, time: number, cancelled: boolean): boolean => {
    invalidate()
    const contact = contacts.get(key)
    if (!contact) return false
    if (!cancelled) {
      try { warmAudio() } catch { /* Writing still completes without audio. */ }
      append(contact, client, time)
      flush(contact)
    }
    remove(key, cancelled)
    if (!cancelled) handlers.ended(contact.id, contact.revision)
    return true
  }
  const pointerKey = (id: number): string => `pointer:${id}`
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || !validId(event.pointerId) || nativeOwners.has(event.pointerId) || contacts.has(pointerKey(event.pointerId))) return
    invalidate()
    if (event.pointerType === 'touch') {
      const native = [...contacts].find(([key, contact]) => key.startsWith('touch:') && !contact.paired && sameStart(contact, event, event.target, event.timeStamp))
      if (native) {
        native[1].paired = true
        nativeOwners.set(event.pointerId, native[0])
        event.preventDefault()
        return
      }
    }
    if (start(pointerKey(event.pointerId), event, event.target, event.timeStamp, event.pointerType === 'touch', event.pointerId)) event.preventDefault()
  }
  const pointerMove = (event: PointerEvent): void => {
    invalidate()
    if (nativeOwners.has(event.pointerId)) { event.preventDefault(); return }
    const contact = contacts.get(pointerKey(event.pointerId))
    if (!contact) return
    if (!contact.touchPointer && (event.buttons & 1) === 0) {
      remove(pointerKey(event.pointerId), true)
      event.preventDefault()
      return
    }
    let coalesced: ReadonlyArray<PointerEvent> = []
    try { coalesced = event.getCoalescedEvents?.() ?? [] } catch { /* The main event still records this movement. */ }
    for (const point of coalesced) append(contact, point, point.timeStamp)
    append(contact, event, event.timeStamp)
    if (contact.pending.length > 0) schedule()
    event.preventDefault()
  }
  const pointerFinish = (event: PointerEvent): void => {
    invalidate()
    const owner = nativeOwners.get(event.pointerId)
    if (owner !== undefined) {
      if (event.type === 'pointercancel') finish(owner, event, event.timeStamp, true)
      else if (event.type === 'pointerup') nativeOwners.delete(event.pointerId)
      event.preventDefault()
      return
    }
    const contact = contacts.get(pointerKey(event.pointerId))
    if (contact && !contact.touchPointer && event.type === 'pointerup') {
      if ((event.buttons & 1) !== 0) { event.preventDefault(); return }
      if (event.button !== 0) {
        if (finish(pointerKey(event.pointerId), event, event.timeStamp, true)) event.preventDefault()
        return
      }
    }
    if (finish(pointerKey(event.pointerId), event, event.timeStamp, event.type !== 'pointerup')) event.preventDefault()
  }
  const eachTouch = (event: TouchEvent, action: (key: string, touch: Touch) => boolean): void => {
    const list = event.changedTouches
    if (!list || !Number.isSafeInteger(list.length) || list.length < 0) return
    let handled = false
    for (let index = 0; index < list.length; index++) {
      const touch = typeof list.item === 'function' ? list.item(index) : list[index]
      if (touch && validId(touch.identifier) && action(`touch:${touch.identifier}`, touch)) handled = true
    }
    if (handled) event.preventDefault()
  }
  const touchStart = (event: TouchEvent): void => eachTouch(event, (key, touch) => {
    if (contacts.has(key) || !ownedTarget(touch.target)) return false
    invalidate()
    const pointer = [...contacts].find(([key, contact]) => key.startsWith('pointer:') && contact.touchPointer && !contact.paired && sameStart(contact, touch, touch.target, event.timeStamp))
    if (pointer) {
      const contact = pointer[1]
      contacts.delete(pointer[0])
      contact.paired = true
      contacts.set(key, contact)
      nativeOwners.set(Number(pointer[0].slice('pointer:'.length)), key)
      releaseCapture(contact)
      return true
    }
    return start(key, touch, touch.target, event.timeStamp, false)
  })
  const touchMove = (event: TouchEvent): void => eachTouch(event, (key, touch) => move(key, touch, event.timeStamp))
  const touchFinish = (event: TouchEvent): void => eachTouch(event, (key, touch) => finish(key, touch, event.timeStamp, event.type !== 'touchend'))
  const keyDown = (event: KeyboardEvent): void => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return
    event.preventDefault()
    try { warmAudio() } catch { /* Keyboard tracing remains available without audio. */ }
  }
  const visibility = (): void => { if (document.hidden) cancelAll() }
  let observer: MutationObserver | undefined
  try {
    observer = new MutationObserver(invalidate)
    observer.observe(svg, { attributes: true, attributeFilter: ['data-handwriting-revision', 'viewBox', 'preserveAspectRatio'] })
  } catch { observer?.disconnect(); observer = undefined }
  svg.addEventListener('pointerdown', down, { passive: false })
  svg.addEventListener('lostpointercapture', pointerFinish)
  svg.addEventListener('touchstart', touchStart, { passive: false })
  svg.addEventListener('keydown', keyDown)
  document.addEventListener('pointermove', pointerMove, { capture: true, passive: false })
  document.addEventListener('pointerup', pointerFinish, { capture: true, passive: false })
  document.addEventListener('pointercancel', pointerFinish, { capture: true, passive: false })
  document.addEventListener('touchmove', touchMove, { capture: true, passive: false })
  document.addEventListener('touchend', touchFinish, { capture: true, passive: false })
  document.addEventListener('touchcancel', touchFinish, { capture: true, passive: false })
  document.addEventListener('visibilitychange', visibility)
  window?.addEventListener('blur', cancelAll)
  return () => {
    if (stopped) return
    stopped = true
    svg.removeEventListener('pointerdown', down)
    svg.removeEventListener('lostpointercapture', pointerFinish)
    svg.removeEventListener('touchstart', touchStart)
    svg.removeEventListener('keydown', keyDown)
    document.removeEventListener('pointermove', pointerMove, true)
    document.removeEventListener('pointerup', pointerFinish, true)
    document.removeEventListener('pointercancel', pointerFinish, true)
    document.removeEventListener('touchmove', touchMove, true)
    document.removeEventListener('touchend', touchFinish, true)
    document.removeEventListener('touchcancel', touchFinish, true)
    document.removeEventListener('visibilitychange', visibility)
    window?.removeEventListener('blur', cancelAll)
    observer?.disconnect()
    cancelAll()
  }
}
