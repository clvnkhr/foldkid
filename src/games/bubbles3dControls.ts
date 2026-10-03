import { warmAudio } from '../audio'
import { isBubble3dColor, MAX_BUBBLE3D_HOLD_MS, type Bubble3dColor } from './bubbles3dCreation'
import { isBubble3dShape, type Bubble3dShape } from './bubbles3dShapes'

export interface Bubble3dCreation {
  readonly shape: Bubble3dShape
  readonly color: Bubble3dColor
  readonly duration: number
  readonly revision: number
  readonly creationId: number
}
export const BUBBLES3D_MAX_HOLD = MAX_BUBBLE3D_HOLD_MS
const SELECTOR = '.bubbles3d-color-button'
const CHARGING_CLASS = 'bubbles3d-color-button--charging'
const CHARGE_PROPERTY = '--bubbles3d-charge-pct'

interface Hold extends Pick<Bubble3dCreation, 'shape' | 'color' | 'revision'> {
  readonly button: HTMLButtonElement
  readonly started: number
  readonly eventTime: number
  readonly originX: number
  readonly originY: number
  readonly touchInput: boolean
  x: number
  y: number
  nativePointerId?: number
}
const revisionOf = (host: HTMLElement): number | undefined => {
  const raw = host.getAttribute('data-bubbles3d-revision')
  if (raw === null || raw.trim() === '') return undefined
  const revision = Number(raw)
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined
}

/** Owns held creation gestures, with one semantic owner per physical contact. */
export const createBubbles3dControls = (host: HTMLElement, onCreate: (creation: Bubble3dCreation) => void): (() => void) => {
  const document = host.ownerDocument
  const window = document.defaultView
  const pointers = new Map<number, Hold>()
  const pointerTouches = new Set<number>()
  const touches = new Map<number, Hold>()
  const keys = new Map<string, Hold>()
  const nativePointers = new Map<number, number>()
  const captures = new Map<number, HTMLButtonElement>()
  const painted = new Set<HTMLButtonElement>()
  const releases = new Map<HTMLButtonElement, { time: number; keyboard: boolean }>()
  let frame: number | undefined
  let stopped = false
  const nextCreationId = (): number => {
    const raw = host.getAttribute('data-bubbles3d-next-creation-id')
    const value = raw === null || raw.trim() === '' ? 0 : Number(raw)
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  }
  let localNextId = nextCreationId()
  let motion: MediaQueryList | undefined
  try { motion = window?.matchMedia?.('(prefers-reduced-motion: reduce)') } catch { /* A static charge indicator still works. */ }
  let reducedMotion = motion?.matches ?? false
  const now = (): number => performance.now()
  const holds = (): Hold[] => [...pointers.values(), ...touches.values(), ...keys.values()]
  const buttonAt = (target: EventTarget | null): HTMLButtonElement | undefined => {
    const button = target instanceof Element ? target.closest<HTMLButtonElement>(SELECTOR) : null
    return button?.tagName === 'BUTTON' && host.contains(button) && !button.disabled ? button : undefined
  }
  const readHold = (target: EventTarget | null, eventTime: number, touchInput: boolean, x = 0, y = 0): Hold | undefined => {
    const button = buttonAt(target)
    const revision = revisionOf(host)
    const color = button?.dataset.color
    const shape = button?.dataset.shape
    if (!button || revision === undefined || !isBubble3dColor(color) || !isBubble3dShape(shape)) return undefined
    return { button, revision, color, shape, started: now(), eventTime, touchInput, originX: x, originY: y, x, y }
  }
  const releaseCapture = (id: number): void => {
    const button = captures.get(id)
    captures.delete(id)
    try { if (button?.hasPointerCapture(id)) button.releasePointerCapture(id) } catch { /* Global release listeners cover missing capture. */ }
  }
  const cancelFrame = (): void => {
    if (frame !== undefined) window?.cancelAnimationFrame(frame)
    frame = undefined
  }
  const paint = (): void => {
    const active = holds()
    for (const hold of active) painted.add(hold.button)
    for (const button of painted) {
      const starts = active.filter(hold => hold.button === button).map(hold => hold.started)
      button.classList.toggle(CHARGING_CLASS, starts.length > 0)
      if (starts.length > 0) button.style.setProperty(CHARGE_PROPERTY, `${Math.max(0, Math.min((now() - Math.min(...starts)) / BUBBLES3D_MAX_HOLD, 1)) * 100}%`)
      else {
        button.style.removeProperty(CHARGE_PROPERTY)
        painted.delete(button)
      }
    }
  }
  const animate = (): void => {
    frame = undefined
    if (stopped) return
    paint()
    if (!reducedMotion && holds().length > 0) frame = window?.requestAnimationFrame?.(animate)
  }
  const updateCharge = (): void => {
    paint()
    if (holds().length === 0 || reducedMotion) cancelFrame()
    else if (frame === undefined) frame = window?.requestAnimationFrame?.(animate)
  }
  const emit = (hold: Hold, duration: number): void => {
    if (hold.revision !== revisionOf(host) || !host.contains(hold.button) || hold.button.disabled) return
    const creationId = Math.max(localNextId, nextCreationId())
    if (!Number.isSafeInteger(creationId)) return
    localNextId = creationId + 1
    try { warmAudio() } catch { /* Sound availability must not prevent creation. */ }
    onCreate({ shape: hold.shape, color: hold.color, revision: hold.revision, creationId, duration: Number.isFinite(duration) ? Math.max(0, Math.min(duration, BUBBLES3D_MAX_HOLD)) : 0 })
  }
  const finish = <Key extends number | string>(contacts: Map<Key, Hold>, id: Key, canceled: boolean, keyboard = false): boolean => {
    const held = contacts.get(id)
    if (!held) return false
    contacts.delete(id)
    if (contacts === pointers) {
      pointerTouches.delete(id as number)
      releaseCapture(id as number)
    } else if (contacts === touches) {
      if (held.nativePointerId !== undefined) nativePointers.delete(held.nativePointerId)
    }
    releases.set(held.button, { time: now(), keyboard })
    updateCharge()
    if (!canceled) emit(held, now() - held.started)
    return true
  }
  const cancelAll = (): void => {
    for (const id of [...pointers.keys()]) finish(pointers, id, true)
    for (const id of [...touches.keys()]) finish(touches, id, true)
    for (const key of [...keys.keys()]) finish(keys, key, true, true)
    nativePointers.clear()
  }
  const invalidate = (): void => {
    for (const [id, held] of pointers) if (held.revision !== revisionOf(host) || !host.contains(held.button) || held.button.disabled) finish(pointers, id, true)
    for (const [id, held] of touches) if (held.revision !== revisionOf(host) || !host.contains(held.button) || held.button.disabled) finish(touches, id, true)
    for (const [key, held] of keys) if (held.revision !== revisionOf(host) || !host.contains(held.button) || held.button.disabled) finish(keys, key, true, true)
  }
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || pointers.has(event.pointerId) || nativePointers.has(event.pointerId)) return
    const button = buttonAt(event.target)
    if (!button) return
    if (event.pointerType === 'touch') {
      const native = [...touches].find(([, held]) => held.nativePointerId === undefined && held.button === button && Math.hypot(held.x - event.clientX, held.y - event.clientY) <= 1 && Math.abs(held.eventTime - event.timeStamp) <= 40)
      if (native) {
        native[1].nativePointerId = event.pointerId
        nativePointers.set(event.pointerId, native[0])
        event.preventDefault()
        return
      }
    } else releases.delete(button)
    const hold = readHold(button, event.timeStamp, event.pointerType === 'touch', event.clientX, event.clientY)
    if (!hold) return
    event.preventDefault()
    pointers.set(event.pointerId, hold)
    if (hold.touchInput) pointerTouches.add(event.pointerId)
    try { button.setPointerCapture(event.pointerId); captures.set(event.pointerId, button) } catch { /* Document listeners own the same release. */ }
    updateCharge()
  }
  const move = (event: PointerEvent): void => {
    const nativeId = nativePointers.get(event.pointerId)
    const held = nativeId === undefined ? pointers.get(event.pointerId) : touches.get(nativeId)
    if (!held) return
    held.x = event.clientX
    held.y = event.clientY
    if (held.touchInput && Math.hypot(held.originX - held.x, held.originY - held.y) > 35) {
      if (nativeId === undefined) finish(pointers, event.pointerId, true)
      else finish(touches, nativeId, true)
    }
  }
  const up = (event: PointerEvent): void => {
    const nativeId = nativePointers.get(event.pointerId)
    if (nativeId !== undefined) {
      if (event.type === 'lostpointercapture') return
      nativePointers.delete(event.pointerId)
      if (event.type === 'pointercancel') finish(touches, nativeId, true)
      return
    }
    const held = pointers.get(event.pointerId)
    const moved = held?.touchInput && Math.hypot(held.originX - event.clientX, held.originY - event.clientY) > 35
    if (finish(pointers, event.pointerId, event.type !== 'pointerup' || !!moved)) event.preventDefault()
  }
  const eachTouch = (event: TouchEvent, action: (touch: Touch) => void): void => {
    for (let index = 0; index < event.changedTouches.length; index++) {
      const touch = event.changedTouches.item?.(index) ?? event.changedTouches[index]
      if (touch) action(touch)
    }
  }
  const touchStart = (event: TouchEvent): void => {
    eachTouch(event, touch => {
      if (touches.has(touch.identifier)) return
      const button = buttonAt(touch.target ?? event.target)
      if (!button) return
      const pointer = [...pointers].find(([id, held]) => pointerTouches.has(id) && held.button === button && Math.hypot(held.x - touch.clientX, held.y - touch.clientY) <= 1 && Math.abs(held.eventTime - event.timeStamp) <= 40)
      const hold = pointer?.[1] ?? readHold(button, event.timeStamp, true, touch.clientX, touch.clientY)
      if (!hold) return
      event.preventDefault()
      touches.set(touch.identifier, hold)
      if (pointer) {
        pointers.delete(pointer[0])
        pointerTouches.delete(pointer[0])
        hold.nativePointerId = pointer[0]
        nativePointers.set(pointer[0], touch.identifier)
        releaseCapture(pointer[0])
      }
      updateCharge()
    })
  }
  const touchMove = (event: TouchEvent): void => {
    eachTouch(event, touch => {
      const held = touches.get(touch.identifier)
      if (!held) return
      held.x = touch.clientX
      held.y = touch.clientY
      if (Math.hypot(held.originX - held.x, held.originY - held.y) > 35) finish(touches, touch.identifier, true)
    })
  }
  const touchEnd = (event: TouchEvent): void => {
    eachTouch(event, touch => {
      const held = touches.get(touch.identifier)
      const moved = held && Math.hypot(held.originX - touch.clientX, held.originY - touch.clientY) > 35
      if (finish(touches, touch.identifier, event.type !== 'touchend' || !!moved)) event.preventDefault()
    })
  }
  const keyName = (event: KeyboardEvent): string | undefined => event.key === 'Enter' ? 'Enter' : event.key === ' ' || event.key === 'Spacebar' ? 'Space' : undefined
  const keyDown = (event: KeyboardEvent): void => {
    const key = keyName(event)
    if (!key || !buttonAt(event.target)) return
    event.preventDefault()
    if (event.repeat || keys.has(key)) return
    const held = readHold(event.target, event.timeStamp, false)
    if (!held) return
    // Keydown grants browser activation; a long hold can outlive that grant
    // before keyup. Unlock silently now and create only on release.
    try { warmAudio() } catch { /* Keyboard creation must also work without audio. */ }
    keys.set(key, held)
    updateCharge()
  }
  const keyUp = (event: KeyboardEvent): void => {
    const key = keyName(event)
    if (key && finish(keys, key, false, true)) event.preventDefault()
  }
  const click = (event: MouseEvent): void => {
    const button = buttonAt(event.target)
    if (!button) return
    const release = releases.get(button)
    const touchClick = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities?.firesTouchEvents
    const active = holds().some(held => held.button === button)
    const keyboardHeld = [...keys.values()].some(held => held.button === button)
    const recent = release && now() - release.time < (release.keyboard ? 40 : 800)
    if (keyboardHeld || ((event.detail > 0 || touchClick) && (active || recent)) || (event.detail === 0 && recent && release.keyboard)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    const held = readHold(button, event.timeStamp, false)
    if (held) emit(held, 0)
  }
  const visibility = (): void => { if (document.hidden) cancelAll() }
  const motionChanged = (): void => { reducedMotion = motion?.matches ?? false; updateCharge() }
  const observer = new MutationObserver(invalidate)
  observer.observe(host, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-bubbles3d-revision', 'disabled'] })
  host.addEventListener('pointerdown', down, { passive: false })
  document.addEventListener('pointermove', move, { capture: true })
  document.addEventListener('pointerup', up, { capture: true, passive: false })
  document.addEventListener('pointercancel', up, { capture: true })
  host.addEventListener('lostpointercapture', up)
  host.addEventListener('touchstart', touchStart, { passive: false })
  document.addEventListener('touchmove', touchMove, { capture: true })
  document.addEventListener('touchend', touchEnd, { capture: true, passive: false })
  document.addEventListener('touchcancel', touchEnd, { capture: true })
  host.addEventListener('keydown', keyDown)
  document.addEventListener('keyup', keyUp, { capture: true })
  host.addEventListener('click', click, { capture: true })
  document.addEventListener('visibilitychange', visibility)
  window?.addEventListener('blur', cancelAll)
  motion?.addEventListener?.('change', motionChanged)
  if (!motion?.addEventListener) motion?.addListener?.(motionChanged)
  return () => {
    if (stopped) return
    stopped = true
    observer.disconnect()
    host.removeEventListener('pointerdown', down)
    document.removeEventListener('pointermove', move, { capture: true })
    document.removeEventListener('pointerup', up, { capture: true })
    document.removeEventListener('pointercancel', up, { capture: true })
    host.removeEventListener('lostpointercapture', up)
    host.removeEventListener('touchstart', touchStart)
    document.removeEventListener('touchmove', touchMove, { capture: true })
    document.removeEventListener('touchend', touchEnd, { capture: true })
    document.removeEventListener('touchcancel', touchEnd, { capture: true })
    host.removeEventListener('keydown', keyDown)
    document.removeEventListener('keyup', keyUp, { capture: true })
    host.removeEventListener('click', click, { capture: true })
    document.removeEventListener('visibilitychange', visibility)
    window?.removeEventListener('blur', cancelAll)
    motion?.removeEventListener?.('change', motionChanged)
    if (!motion?.removeEventListener) motion?.removeListener?.(motionChanged)
    cancelAll()
    cancelFrame()
    releases.clear()
  }
}
