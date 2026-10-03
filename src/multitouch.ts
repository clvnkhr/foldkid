import { Effect, Stream } from 'effect'
import type { Html } from 'foldkit/html'
import { warmAudio } from './audio'

const CLICK_TARGET = '[data-multitouch-click]'
const OWNED_INPUT = '[data-multitouch-owned], input, textarea, select'
const TAP_SLOP = 12
const COMPAT_CLICK_MS = 900
const CONTACT_START_MS = 40

// Mark the actual click handlers from this render, including child game views.
// Native click handlers stay intact for mouse, keyboard and assistive activation.
export const withMultitouchClicks = (node: Html): Html => {
  if (!node) return node
  const clickable = node.data?.on?.click !== undefined && node.data?.attrs?.['data-multitouch-owned'] !== 'true'
  return {
    ...node,
    data: clickable ? { ...node.data, attrs: { ...node.data?.attrs, 'data-multitouch-click': '' } } : node.data,
    children: node.children?.map(child => typeof child === 'string' ? child : withMultitouchClicks(child)!),
  }
}

type Press = { target: HTMLElement; x: number; y: number; lastX: number; lastY: number; moved: boolean; timeStamp: number; pointerId: string | null }

export const multitouchClickStream = (element: Element): Stream.Stream<never> =>
  Stream.callback<never>(() => Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const root = element as HTMLElement
        const doc = root.ownerDocument
        const presses = new Map<string, Press>()
        const pointerTouches = new Map<string, string>()
        const recentReleases = new WeakMap<HTMLElement, number>()
        const mouseTargets = new WeakSet<HTMLElement>()
        const generatedClicks = new WeakSet<Event>()

        const targetFrom = (target: EventTarget | null): HTMLElement | null => {
          if (!(target instanceof Element) || target.closest(OWNED_INPUT)) return null
          const control = target.closest(CLICK_TARGET)
          if (!(control instanceof HTMLElement) || !root.contains(control)) return null
          const handle = target.closest('[draggable="true"]')
          if (handle && handle !== control && control.contains(handle)) return null
          return control
        }
        const available = (target: HTMLElement): boolean =>
          target.isConnected && root.contains(target) && !target.matches(':disabled, [aria-disabled="true"]') && !target.closest('[inert]')
        const start = (id: string, target: EventTarget | null, x: number, y: number, timeStamp: number): void => {
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(timeStamp)) return
          const control = targetFrom(target)
          if (control && available(control) && !presses.has(id)) {
            mouseTargets.delete(control)
            presses.set(id, { target: control, x, y, lastX: x, lastY: y, moved: false, timeStamp, pointerId: null })
          }
        }
        const matchesContact = (press: Press, target: EventTarget | null, x: number, y: number, timeStamp: number): boolean =>
          press.target === targetFrom(target) && Math.abs(press.timeStamp - timeStamp) <= CONTACT_START_MS && Math.hypot(press.lastX - x, press.lastY - y) <= 1
        const remove = (id: string, press: Press): void => {
          presses.delete(id)
          if (press.pointerId !== null && pointerTouches.get(press.pointerId) === id) pointerTouches.delete(press.pointerId)
        }
        const move = (id: string, x: number, y: number): void => {
          const press = presses.get(id)
          if (!press) return
          if (!Number.isFinite(x) || !Number.isFinite(y)) { press.moved = true; return }
          if (Math.hypot(x - press.x, y - press.y) > TAP_SLOP) press.moved = true
          press.lastX = x
          press.lastY = y
        }
        const finish = (id: string, x: number, y: number, event: Event, cancelled: boolean): void => {
          const press = presses.get(id)
          if (!press) return
          move(id, x, y)
          remove(id, press)
          recentReleases.set(press.target, Date.now())
          if (cancelled || press.moved || !available(press.target)) return
          const hit = doc.elementFromPoint(x, y)
          if (!hit || targetFrom(hit) !== press.target) return
          // Prevent the browser's primary-finger click; deliver one activation
          // per successful release even while other fingers remain down.
          event.preventDefault()
          warmAudio()
          const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 })
          generatedClicks.add(click)
          press.target.dispatchEvent(click)
        }

        const eachTouch = (event: TouchEvent, action: (touch: Touch) => void): void => {
          const touches = event.changedTouches
          for (let index = 0; index < touches.length; index++) {
            const touch = typeof touches.item === 'function' ? touches.item(index) : touches[index]
            if (touch) action(touch)
          }
        }
        const touchStart = (event: TouchEvent): void => {
          // Pair the two event streams per contact; their relative order is not
          // guaranteed. Unmatched and later pointers continue working normally.
          eachTouch(event, touch => {
            if (!Number.isSafeInteger(touch.identifier) || touch.identifier < 0) return
            const id = `touch:${touch.identifier}`
            if (presses.has(id)) return
            const pointer = [...presses].find(([key, press]) => key.startsWith('pointer:') && matchesContact(press, touch.target, touch.clientX, touch.clientY, event.timeStamp))
            if (pointer) {
              presses.delete(pointer[0])
              pointer[1].pointerId = pointer[0]
              presses.set(id, pointer[1])
              pointerTouches.set(pointer[0], id)
            } else start(id, touch.target, touch.clientX, touch.clientY, event.timeStamp)
          })
        }
        const touchMove = (event: TouchEvent): void => {
          eachTouch(event, touch => move(`touch:${touch.identifier}`, touch.clientX, touch.clientY))
        }
        const touchEnd = (event: TouchEvent): void => {
          eachTouch(event, touch => finish(`touch:${touch.identifier}`, touch.clientX, touch.clientY, event, false))
        }
        const touchCancel = (event: TouchEvent): void => {
          eachTouch(event, touch => finish(`touch:${touch.identifier}`, touch.clientX, touch.clientY, event, true))
        }
        const pointerDown = (event: PointerEvent): void => {
          if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
            const target = targetFrom(event.target)
            if (target) {
              recentReleases.delete(target)
              mouseTargets.add(target)
            }
            return
          }
          if (event.pointerType !== 'touch' || event.button !== 0) return
          if (!Number.isSafeInteger(event.pointerId) || event.pointerId < 0) return
          const id = `pointer:${event.pointerId}`
          if (presses.has(id) || pointerTouches.has(id)) return
          const native = [...presses].find(([key, press]) => key.startsWith('touch:') && press.pointerId === null && matchesContact(press, event.target, event.clientX, event.clientY, event.timeStamp))
          if (native) {
            native[1].pointerId = id
            pointerTouches.set(id, native[0])
          } else start(id, event.target, event.clientX, event.clientY, event.timeStamp)
        }
        const pointerMove = (event: PointerEvent): void => {
          if (event.pointerType !== 'touch') return
          const id = `pointer:${event.pointerId}`
          move(pointerTouches.get(id) ?? id, event.clientX, event.clientY)
        }
        const pointerEnd = (event: PointerEvent): void => {
          if (event.pointerType !== 'touch') return
          const id = `pointer:${event.pointerId}`
          const native = pointerTouches.get(id)
          if (native && event.type !== 'pointercancel') {
            pointerTouches.delete(id)
            return
          }
          finish(native ?? id, event.clientX, event.clientY, event, event.type === 'pointercancel')
        }
        const click = (event: MouseEvent): void => {
          const target = targetFrom(event.target)
          if (generatedClicks.has(event)) return
          if (event.detail === 0) {
            if (target && available(target)) warmAudio()
            return
          }
          const ended = target && recentReleases.get(target)
          const capabilities = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities
          const mouseClick = capabilities?.firesTouchEvents === false || (capabilities?.firesTouchEvents !== true && target !== null && mouseTargets.has(target))
          const pending = target && [...presses.values()].some(press => press.target === target)
          if (!mouseClick && (pending || (ended !== undefined && ended !== null && Date.now() - ended <= COMPAT_CLICK_MS))) {
            event.preventDefault()
            event.stopImmediatePropagation()
          } else if (target && available(target)) {
            mouseTargets.delete(target)
            warmAudio()
          }
        }
        const clear = (): void => {
          for (const press of presses.values()) recentReleases.set(press.target, Date.now())
          presses.clear()
          pointerTouches.clear()
        }
        const dragStart = (event: DragEvent): void => {
          const dragged = event.target
          if (!(dragged instanceof Element)) return
          for (const [id, press] of presses) {
            if (!dragged.contains(press.target) && !press.target.contains(dragged)) continue
            remove(id, press)
            recentReleases.set(press.target, Date.now())
          }
        }
        const visibility = (): void => { if (doc.hidden) clear() }
        doc.addEventListener('touchstart', touchStart, { capture: true, passive: true })
        doc.addEventListener('touchmove', touchMove, { capture: true, passive: true })
        doc.addEventListener('touchend', touchEnd, { capture: true, passive: false })
        doc.addEventListener('touchcancel', touchCancel, { capture: true, passive: true })
        doc.addEventListener('pointerdown', pointerDown, true)
        doc.addEventListener('pointermove', pointerMove, true)
        doc.addEventListener('pointerup', pointerEnd, true)
        doc.addEventListener('pointercancel', pointerEnd, true)
        doc.addEventListener('click', click, true)
        doc.addEventListener('dragstart', dragStart, true)
        doc.addEventListener('visibilitychange', visibility)
        doc.defaultView?.addEventListener('blur', clear)
        return () => {
          clear()
          doc.removeEventListener('touchstart', touchStart, true)
          doc.removeEventListener('touchmove', touchMove, true)
          doc.removeEventListener('touchend', touchEnd, true)
          doc.removeEventListener('touchcancel', touchCancel, true)
          doc.removeEventListener('pointerdown', pointerDown, true)
          doc.removeEventListener('pointermove', pointerMove, true)
          doc.removeEventListener('pointerup', pointerEnd, true)
          doc.removeEventListener('pointercancel', pointerEnd, true)
          doc.removeEventListener('click', click, true)
          doc.removeEventListener('dragstart', dragStart, true)
          doc.removeEventListener('visibilitychange', visibility)
          doc.defaultView?.removeEventListener('blur', clear)
        }
      }),
      cleanup => Effect.sync(cleanup),
    )
    return yield* Effect.never
  }))
