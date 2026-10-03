import { Effect, Queue, Stream } from 'effect'

export const bubbleSweepStream = <Message>(element: Element, poppedMessage: (id: number) => Message): Stream.Stream<Message> =>
  Stream.callback<Message>(queue => Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        type Contact = { target: EventTarget | null; x: number; y: number; timeStamp: number; pointerId: string | null; touchTarget: EventTarget | null; touchInput: boolean }
        const doc = element.ownerDocument
        const contacts = new Map<string, Contact>()
        const pointerTouches = new Map<string, string>()
        const touchTargets = new Set<EventTarget>()
        const popped = new WeakSet<Element>()
        const valid = (id: number, x: number, y: number): boolean => Number.isSafeInteger(id) && id >= 0 && Number.isFinite(x) && Number.isFinite(y)
        const popTarget = (target: EventTarget | null): void => {
          const bubble = target instanceof Element ? target.closest('.bubble') : null
          if (!bubble || !element.contains(bubble) || popped.has(bubble)) return
          const value = bubble.getAttribute('data-id')
          const id = value === null || value.trim() === '' ? Number.NaN : Number(value)
          if (!Number.isSafeInteger(id) || id < 0) return
          popped.add(bubble)
          Queue.offerUnsafe(queue, poppedMessage(id))
        }
        const matching = (contact: Contact, target: EventTarget | null, x: number, y: number, timeStamp: number): boolean =>
          contact.target === target && Math.abs(contact.timeStamp - timeStamp) <= 40 && Math.hypot(contact.x - x, contact.y - y) <= 1
        const remove = (id: string): void => {
          const contact = contacts.get(id)
          if (!contact) return
          contacts.delete(id)
          if (contact.pointerId !== null && pointerTouches.get(contact.pointerId) === id) pointerTouches.delete(contact.pointerId)
          const target = contact.touchTarget
          if (target && ![...contacts.values()].some(other => other.touchTarget === target)) {
            target.removeEventListener('touchmove', onTouchMove as EventListener)
            target.removeEventListener('touchend', onTouchEnd as EventListener)
            target.removeEventListener('touchcancel', onTouchEnd as EventListener)
            touchTargets.delete(target)
          }
        }
        const move = (id: string, x: number, y: number): void => {
          const contact = contacts.get(id)
          if (!contact || !Number.isFinite(x) || !Number.isFinite(y)) return
          contact.x = x
          contact.y = y
          popTarget(doc.elementFromPoint(x, y))
        }
        const onPointerDown = (event: PointerEvent): void => {
          if (event.button !== 0 || !valid(event.pointerId, event.clientX, event.clientY)) return
          const id = `pointer:${event.pointerId}`
          if (contacts.has(id) || pointerTouches.has(id)) return
          const native = event.pointerType === 'touch' ? [...contacts].find(([key, contact]) => key.startsWith('touch:') && contact.pointerId === null && matching(contact, event.target, event.clientX, event.clientY, event.timeStamp)) : undefined
          if (native) {
            native[1].pointerId = id
            pointerTouches.set(id, native[0])
          } else contacts.set(id, { target: event.target, x: event.clientX, y: event.clientY, timeStamp: event.timeStamp, pointerId: null, touchTarget: null, touchInput: event.pointerType === 'touch' })
          popTarget(event.target)
        }
        const onPointerMove = (event: PointerEvent): void => {
          const id = `pointer:${event.pointerId}`
          if (event.pointerType !== 'touch' && (event.buttons & 1) === 0) { remove(id); return }
          move(pointerTouches.get(id) ?? id, event.clientX, event.clientY)
        }
        const onPointerEnd = (event: PointerEvent): void => {
          const id = `pointer:${event.pointerId}`
          const native = pointerTouches.get(id)
          pointerTouches.delete(id)
          if (!native || event.type === 'pointercancel') remove(native ?? id)
        }
        const eachTouch = (event: TouchEvent, action: (touch: Touch) => void): void => {
          for (let index = 0; index < event.changedTouches.length; index++) {
            const touch = typeof event.changedTouches.item === 'function' ? event.changedTouches.item(index) : event.changedTouches[index]
            if (touch) action(touch)
          }
        }
        const onTouchStart = (event: TouchEvent): void => eachTouch(event, touch => {
          if (!valid(touch.identifier, touch.clientX, touch.clientY)) return
          const id = `touch:${touch.identifier}`
          if (contacts.has(id)) return
          const pointer = [...contacts].find(([key, contact]) => key.startsWith('pointer:') && contact.touchInput && matching(contact, touch.target, touch.clientX, touch.clientY, event.timeStamp))
          const contact: Contact = pointer?.[1] ?? { target: touch.target, x: touch.clientX, y: touch.clientY, timeStamp: event.timeStamp, pointerId: null, touchTarget: null, touchInput: true }
          if (pointer) {
            contacts.delete(pointer[0])
            contact.pointerId = pointer[0]
            pointerTouches.set(pointer[0], id)
          }
          contact.touchTarget = touch.target
          contacts.set(id, contact)
          // A popped starting bubble is removed; native TouchEvents keep that
          // original target, so retain scoped listeners until this contact ends.
          if (!touchTargets.has(touch.target)) {
            touchTargets.add(touch.target)
            touch.target.addEventListener('touchmove', onTouchMove as EventListener, { passive: true })
            touch.target.addEventListener('touchend', onTouchEnd as EventListener, { passive: true })
            touch.target.addEventListener('touchcancel', onTouchEnd as EventListener, { passive: true })
          }
          popTarget(touch.target)
        })
        const onTouchMove = (event: TouchEvent): void => eachTouch(event, touch => move(`touch:${touch.identifier}`, touch.clientX, touch.clientY))
        const onTouchEnd = (event: TouchEvent): void => eachTouch(event, touch => remove(`touch:${touch.identifier}`))
        const clear = (): void => { for (const id of [...contacts.keys()]) remove(id); pointerTouches.clear() }
        const visibility = (): void => { if (doc.hidden) clear() }
        doc.addEventListener('pointerdown', onPointerDown, true)
        doc.addEventListener('pointermove', onPointerMove, true)
        doc.addEventListener('pointerup', onPointerEnd, true)
        doc.addEventListener('pointercancel', onPointerEnd, true)
        doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
        doc.addEventListener('touchmove', onTouchMove, { capture: true, passive: true })
        doc.addEventListener('touchend', onTouchEnd, true)
        doc.addEventListener('touchcancel', onTouchEnd, true)
        doc.addEventListener('visibilitychange', visibility)
        doc.defaultView?.addEventListener('blur', clear)
        return () => {
          doc.removeEventListener('pointerdown', onPointerDown, true)
          doc.removeEventListener('pointermove', onPointerMove, true)
          doc.removeEventListener('pointerup', onPointerEnd, true)
          doc.removeEventListener('pointercancel', onPointerEnd, true)
          doc.removeEventListener('touchstart', onTouchStart, true)
          doc.removeEventListener('touchmove', onTouchMove, true)
          doc.removeEventListener('touchend', onTouchEnd, true)
          doc.removeEventListener('touchcancel', onTouchEnd, true)
          doc.removeEventListener('visibilitychange', visibility)
          doc.defaultView?.removeEventListener('blur', clear)
          clear()
        }
      }),
      cleanup => Effect.sync(cleanup),
    )
    return yield* Effect.never
  }))
