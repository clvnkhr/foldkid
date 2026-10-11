import { warmAudio } from '../audio'

export interface DotShapesHandlers {
  readonly started: (id: number, x: number, y: number, dotId: number | null, revision: number) => void
  readonly moved: (id: number, x: number, y: number, revision: number) => void
  readonly ended: (id: number, x: number, y: number, moved: boolean, revision: number) => void
  readonly cancelled: (id: number, revision: number) => void
  readonly keyboard: (key: string, dotId: number | null, shift: boolean, revision: number) => void
}
interface ClientPoint { readonly clientX: number; readonly clientY: number }
interface Point { readonly x: number; readonly y: number }
interface Contact {
  readonly id: number
  readonly revision: number
  readonly target: HTMLElement
  readonly startedAt: number
  readonly startX: number
  readonly startY: number
  readonly touchPointer: boolean
  x: number
  y: number
  lastTime: number
  point: Point
  moved: boolean
  pending: boolean
  paired: boolean
  captureId?: number
}
const validId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0
const MAX_CONTACTS = 32
const attributeId = (element: Element, name: string): number | undefined => {
  const raw = element.getAttribute(name)
  if (raw === null || raw.trim() === '') return undefined
  const id = Number(raw)
  return validId(id) ? id : undefined
}

// Use the current inner box, including CSS scaling, without retaining resize measurements.
const localPoint = (board: HTMLElement, client: ClientPoint, clamp: boolean): Point | undefined => {
  if (![client.clientX, client.clientY].every(Number.isFinite)) return undefined
  let rect: DOMRect
  try { rect = board.getBoundingClientRect() } catch { return undefined }
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return undefined
  let left = rect.left
  let top = rect.top
  let width = rect.width
  let height = rect.height
  if (board.clientWidth > 0 && board.clientHeight > 0 && board.offsetWidth > 0 && board.offsetHeight > 0) {
    const scaleX = rect.width / board.offsetWidth
    const scaleY = rect.height / board.offsetHeight
    left += board.clientLeft * scaleX
    top += board.clientTop * scaleY
    width = board.clientWidth * scaleX
    height = board.clientHeight * scaleY
  }
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return undefined
  const x = (client.clientX - left) * 1000 / width
  const y = (client.clientY - top) * 700 / height
  if (![x, y].every(Number.isFinite) || !clamp && (x < 0 || x > 1000 || y < 0 || y > 700)) return undefined
  return { x: Math.max(0, Math.min(1000, x)), y: Math.max(0, Math.min(700, y)) }
}

export const createDotShapesRuntime = (board: HTMLElement, handlers: DotShapesHandlers): (() => void) => {
  const document = board.ownerDocument
  const window = document.defaultView
  const contacts = new Map<string, Contact>()
  const nativeOwners = new Map<number, string>()
  const ghosts: Array<{ readonly target: HTMLElement; readonly time: number }> = []
  let nextId = 0
  let frame: number | undefined
  let stopped = false
  const revisionOf = (): number | undefined => attributeId(board, 'data-dot-shapes-revision')
  const targetOf = (target: EventTarget | null): { readonly target: HTMLElement; readonly dotId: number | null } | undefined => {
    if (!board.isConnected || !(target instanceof Element) || !board.contains(target) || target.closest('[data-dot-shapes-revision]') !== board || target.closest('[inert]')) return undefined
    const dot = target.closest('[data-dot-shapes-id]')
    if (!dot) return { target: board, dotId: null }
    if (!(dot instanceof HTMLButtonElement) || !board.contains(dot) || dot.disabled || dot.getAttribute('aria-disabled') === 'true') return undefined
    const dotId = attributeId(dot, 'data-dot-shapes-id')
    return dotId === undefined ? undefined : { target: dot, dotId }
  }
  const remember = (target: HTMLElement): void => {
    ghosts.push({ target, time: Date.now() })
    if (ghosts.length > 32) ghosts.shift()
  }
  const warm = (): void => { try { warmAudio() } catch { /* The drawing remains available without audio. */ } }
  const releaseCapture = (contact: Contact): void => {
    const id = contact.captureId
    contact.captureId = undefined
    if (id === undefined) return
    try { if (board.hasPointerCapture(id)) board.releasePointerCapture(id) } catch { /* Document listeners also own the release. */ }
  }
  const cancelFrame = (): void => {
    if (frame !== undefined) { try { window?.cancelAnimationFrame(frame) } catch { /* Cleanup remains safe without animation APIs. */ } }
    frame = undefined
  }
  const remove = (key: string, cancelled: boolean): Contact | undefined => {
    const contact = contacts.get(key)
    if (!contact) return undefined
    contacts.delete(key)
    for (const [pointerId, owner] of nativeOwners) if (owner === key) nativeOwners.delete(pointerId)
    remember(contact.target)
    releaseCapture(contact)
    if (cancelled) handlers.cancelled(contact.id, contact.revision)
    if (![...contacts.values()].some(active => active.pending)) cancelFrame()
    return contact
  }
  const cancelAll = (): void => {
    for (const key of [...contacts.keys()]) remove(key, true)
    nativeOwners.clear()
    cancelFrame()
  }
  const invalidate = (): void => {
    const revision = board.isConnected ? revisionOf() : undefined
    for (const [key, contact] of [...contacts]) if (contact.revision !== revision) remove(key, true)
  }
  const flush = (contact: Contact): void => {
    if (!contact.pending) return
    contact.pending = false
    handlers.moved(contact.id, contact.point.x, contact.point.y, contact.revision)
  }
  const flushAll = (): void => {
    frame = undefined
    if (stopped) return
    invalidate()
    for (const contact of contacts.values()) flush(contact)
  }
  const schedule = (): void => {
    if (frame !== undefined) return
    try { frame = window?.requestAnimationFrame?.(flushAll) } catch { /* Synchronous movement is the fallback. */ }
    if (frame === undefined) flushAll()
  }
  const sameStart = (contact: Contact, client: ClientPoint, target: EventTarget | null, time: number): boolean => {
    const resolved = targetOf(target)
    return resolved?.target === contact.target && Math.abs(contact.startedAt - time) <= 40 && Math.min(
      Math.hypot(contact.startX - client.clientX, contact.startY - client.clientY),
      Math.hypot(contact.x - client.clientX, contact.y - client.clientY),
    ) <= 1
  }
  const start = (key: string, client: ClientPoint, target: EventTarget | null, time: number, touchPointer: boolean, captureId?: number): boolean => {
    if (stopped || contacts.has(key) || !Number.isFinite(time)) return false
    invalidate()
    if (contacts.size >= MAX_CONTACTS) return false
    const revision = revisionOf()
    const resolved = targetOf(target)
    const point = localPoint(board, client, false)
    if (revision === undefined || !resolved || !point || !validId(nextId)) return false
    const contact: Contact = { id: nextId++, revision, target: resolved.target, startedAt: time, startX: client.clientX, startY: client.clientY,
      touchPointer, x: client.clientX, y: client.clientY, lastTime: time, point, moved: false, pending: false, paired: false }
    contacts.set(key, contact)
    try { resolved.target.focus({ preventScroll: true }) } catch { /* Pointer drawing also works without programmatic focus. */ }
    if (captureId !== undefined) { try { board.setPointerCapture(captureId); contact.captureId = captureId } catch { /* Document fallback preserves dragging. */ } }
    handlers.started(contact.id, point.x, point.y, resolved.dotId, revision)
    return true
  }
  const append = (contact: Contact, client: ClientPoint, time: number): boolean => {
    if (!Number.isFinite(time) || time < contact.lastTime) return false
    const point = localPoint(board, client, true)
    if (!point) return false
    contact.x = client.clientX
    contact.y = client.clientY
    contact.lastTime = time
    contact.moved ||= Math.hypot(client.clientX - contact.startX, client.clientY - contact.startY) > 8
    if (point.x !== contact.point.x || point.y !== contact.point.y) { contact.point = point; contact.pending = true }
    return true
  }
  const move = (key: string, client: ClientPoint, time: number): boolean => {
    invalidate()
    const contact = contacts.get(key)
    if (!contact) return false
    append(contact, client, time)
    if (contact.pending) schedule()
    return true
  }
  const finish = (key: string, client: ClientPoint, time: number, cancelled: boolean): boolean => {
    invalidate()
    const contact = contacts.get(key)
    if (!contact) return false
    if (!cancelled && !append(contact, client, time)) cancelled = true
    if (!cancelled) { warm(); flush(contact) }
    remove(key, cancelled)
    if (!cancelled) handlers.ended(contact.id, contact.point.x, contact.point.y, contact.moved, contact.revision)
    return true
  }
  const pointerKey = (id: number): string => `pointer:${id}`
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || !validId(event.pointerId) || nativeOwners.has(event.pointerId) || contacts.has(pointerKey(event.pointerId))) return
    invalidate()
    if (event.pointerType === 'touch') {
      const native = [...contacts].find(([key, contact]) => key.startsWith('touch:') && !contact.paired && sameStart(contact, event, event.target, event.timeStamp))
      if (native) { native[1].paired = true; nativeOwners.set(event.pointerId, native[0]); event.preventDefault(); return }
    }
    // Finger capture interrupts native touch streams in some WebKit versions.
    if (start(pointerKey(event.pointerId), event, event.target, event.timeStamp, event.pointerType === 'touch', event.pointerType === 'touch' ? undefined : event.pointerId)) event.preventDefault()
  }
  const pointerMove = (event: PointerEvent): void => {
    invalidate()
    if (nativeOwners.has(event.pointerId)) { event.preventDefault(); return }
    const contact = contacts.get(pointerKey(event.pointerId))
    if (!contact) return
    if (!contact.touchPointer && (event.buttons & 1) === 0) { remove(pointerKey(event.pointerId), true); event.preventDefault(); return }
    try {
      const points = event.getCoalescedEvents?.()
      if (Array.isArray(points)) for (const point of points.slice(-256)) append(contact, point, point.timeStamp)
    } catch { /* The main pointer event remains available. */ }
    append(contact, event, event.timeStamp)
    if (contact.pending) schedule()
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
    if (contact?.touchPointer && event.type === 'lostpointercapture') return
    if (contact && !contact.touchPointer && event.type === 'pointerup') {
      if ((event.buttons & 1) !== 0) { event.preventDefault(); return }
      if (event.button !== 0) { if (finish(pointerKey(event.pointerId), event, event.timeStamp, true)) event.preventDefault(); return }
    }
    if (finish(pointerKey(event.pointerId), event, event.timeStamp, event.type !== 'pointerup')) event.preventDefault()
  }
  const eachTouch = (event: TouchEvent, action: (key: string, touch: Touch) => boolean): void => {
    const list = event.changedTouches
    if (!list || !Number.isSafeInteger(list.length) || list.length < 0 || list.length > 64) return
    let handled = false
    for (let index = 0; index < list.length; index++) {
      const touch = typeof list.item === 'function' ? list.item(index) : list[index]
      if (touch && Number.isSafeInteger(touch.identifier) && action(`touch:${touch.identifier}`, touch)) handled = true
    }
    if (handled) event.preventDefault()
  }
  const touchStart = (event: TouchEvent): void => eachTouch(event, (key, touch) => {
    if (contacts.has(key) || !targetOf(touch.target)) return false
    invalidate()
    const pointer = [...contacts].find(([key, contact]) => key.startsWith('pointer:') && contact.touchPointer && !contact.paired && sameStart(contact, touch, touch.target, event.timeStamp))
    if (pointer) {
      const contact = pointer[1]
      contacts.delete(pointer[0]); contacts.set(key, contact); contact.paired = true
      nativeOwners.set(Number(pointer[0].slice('pointer:'.length)), key)
      releaseCapture(contact)
      return true
    }
    return start(key, touch, touch.target, event.timeStamp, true)
  })
  const touchMove = (event: TouchEvent): void => eachTouch(event, (key, touch) => move(key, touch, event.timeStamp))
  const touchFinish = (event: TouchEvent): void => eachTouch(event, (key, touch) => finish(key, touch, event.timeStamp, event.type !== 'touchend'))
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Backspace', 'Escape']
  const keyDown = (event: KeyboardEvent): void => {
    if (stopped || !keys.includes(event.key)) return
    invalidate()
    const revision = revisionOf()
    const resolved = targetOf(event.target)
    if (revision === undefined || !resolved) return
    event.preventDefault()
    event.stopPropagation()
    if ((event.key === 'Enter' || event.key === ' ') && event.repeat) return
    if (event.key === 'Backspace' && resolved.dotId !== null) {
      // Undo can remove the focused dot; retain the board's keyboard controls.
      try { board.focus({ preventScroll: true }) } catch { /* Undo remains available without programmatic focus. */ }
    }
    if (event.key === 'Enter' || event.key === ' ') remember(resolved.target)
    warm()
    handlers.keyboard(event.key, resolved.dotId, event.shiftKey, revision)
  }
  const click = (event: MouseEvent): void => {
    if (stopped || event.defaultPrevented) return
    invalidate()
    const revision = revisionOf()
    const resolved = targetOf(event.target)
    if (revision === undefined || !resolved) return
    event.preventDefault()
    event.stopPropagation()
    const now = Date.now()
    while (ghosts[0] && now - ghosts[0].time > 900) ghosts.shift()
    // Captured or removed dot buttons can have their compatibility click retargeted to the board.
    if ([...contacts.values()].some(contact => contact.target === resolved.target) || ghosts.some(ghost =>
      ghost.target === resolved.target || event.detail > 0 && resolved.target === board && ghost.target !== board,
    )) return
    if (event.detail === 0) { warm(); handlers.keyboard('Enter', resolved.dotId, false, revision); return }
    const point = localPoint(board, event, false)
    if (!point || !validId(nextId)) return
    warm()
    const id = nextId++
    handlers.started(id, point.x, point.y, resolved.dotId, revision)
    handlers.ended(id, point.x, point.y, false, revision)
  }
  const visibility = (): void => { if (document.hidden) cancelAll() }
  let observer: MutationObserver | undefined
  try {
    observer = new MutationObserver(invalidate)
    observer.observe(board, { attributes: true, attributeFilter: ['data-dot-shapes-revision'] })
  } catch { observer?.disconnect(); observer = undefined }
  board.addEventListener('pointerdown', down, { passive: false })
  board.addEventListener('lostpointercapture', pointerFinish)
  board.addEventListener('touchstart', touchStart, { passive: false })
  board.addEventListener('keydown', keyDown)
  board.addEventListener('click', click, true)
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
    board.removeEventListener('pointerdown', down)
    board.removeEventListener('lostpointercapture', pointerFinish)
    board.removeEventListener('touchstart', touchStart)
    board.removeEventListener('keydown', keyDown)
    board.removeEventListener('click', click, true)
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
    ghosts.length = 0
  }
}
