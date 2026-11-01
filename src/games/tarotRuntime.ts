import { Effect, Queue, Stream } from 'effect'
import { Render } from 'foldkit'
import { warmAudio } from '../audio'

export interface TarotDrawMessage { readonly _tag: 'TarotDrawRequested'; readonly token: number }

/** Native touch fallback avoids WebKit losing an ongoing touch after pointer capture. */
export const mountTarotDeck = (element: Element): Stream.Stream<TarotDrawMessage> => Stream.callback(queue =>
  Effect.gen(function* () {
    yield* Effect.acquireRelease(Effect.sync(() => {
      const deck = element as HTMLButtonElement
      const doc = deck.ownerDocument
      const area = deck.closest<HTMLElement>('.tarot-deck-area')
      let drag: { pointerId?: number; nativeId?: number; x: number; y: number; token: number; touchInput: boolean } | undefined
      let suppressClick = false
      let keyboard = false
      const enabled = (): boolean => deck.isConnected && !deck.disabled
      const token = (): number => Number(deck.dataset.tarotToken)
      const clear = (): void => {
        const active = drag
        drag = undefined
        area?.classList.remove('tarot-deck-area--dragging')
        deck.style.removeProperty('--tarot-drag-x')
        deck.style.removeProperty('--tarot-drag-y')
        if (active?.pointerId !== undefined && !active.touchInput) {
          try { if (deck.hasPointerCapture(active.pointerId)) deck.releasePointerCapture(active.pointerId) } catch { /* Document listeners remain sufficient. */ }
        }
      }
      const emit = (): void => {
        const revision = token()
        if (!enabled() || !Number.isSafeInteger(revision) || revision < 0) return
        warmAudio()
        Queue.offerUnsafe(queue, { _tag: 'TarotDrawRequested', token: revision })
      }
      const begin = (id: number, x: number, y: number, native: boolean, touchInput: boolean): boolean => {
        if (!enabled() || ![x, y].every(Number.isFinite)) return false
        if (drag) {
          // One physical touch can report both event families, in either order.
          if (!touchInput || !drag.touchInput || Math.hypot(x - drag.x, y - drag.y) > 25) return false
          if (native && drag.nativeId === undefined) drag.nativeId = id
          else if (!native && drag.pointerId === undefined) drag.pointerId = id
          else return false
          return true
        }
        suppressClick = false
        keyboard = false
        drag = { ...(native ? { nativeId: id } : { pointerId: id }), x, y, token: token(), touchInput }
        area?.classList.add('tarot-deck-area--dragging')
        if (!touchInput) {
          try { deck.setPointerCapture(id) } catch { /* Uncaptured drags use document listeners. */ }
        }
        return true
      }
      const move = (id: number, x: number, y: number, native: boolean): boolean => {
        if (!drag || (native ? drag.nativeId !== id : drag.pointerId !== id || drag.nativeId !== undefined)) return false
        if (drag.token !== token() || !enabled()) { suppressClick = true; clear(); return false }
        deck.style.setProperty('--tarot-drag-x', `${Math.max(-400, Math.min(400, x - drag.x))}px`)
        deck.style.setProperty('--tarot-drag-y', `${Math.max(-300, Math.min(300, y - drag.y))}px`)
        return true
      }
      const finish = (id: number, cancelled: boolean, native: boolean): void => {
        if (!drag || (native ? drag.nativeId !== id : drag.pointerId !== id)) return
        if (!native && !cancelled && drag.nativeId !== undefined) return
        const valid = drag.token === token() && enabled()
        clear()
        suppressClick = true
        if (!cancelled && valid) emit()
      }
      const down = (event: PointerEvent): void => {
        if (event.button === 0) begin(event.pointerId, event.clientX, event.clientY, false, event.pointerType === 'touch')
      }
      const pointerMove = (event: PointerEvent): void => { if (move(event.pointerId, event.clientX, event.clientY, false)) event.preventDefault() }
      const up = (event: PointerEvent): void => finish(event.pointerId, event.type !== 'pointerup', false)
      const startTouch = (event: TouchEvent): void => {
        const touch = event.changedTouches[0]
        if (touch && begin(touch.identifier, touch.clientX, touch.clientY, true, true)) event.preventDefault()
      }
      const touchMove = (event: TouchEvent): void => {
        for (let index = 0; index < event.changedTouches.length; index++) {
          const touch = event.changedTouches[index]!
          if (move(touch.identifier, touch.clientX, touch.clientY, true)) event.preventDefault()
        }
      }
      const touchEnd = (event: TouchEvent): void => {
        for (let index = 0; index < event.changedTouches.length; index++) finish(event.changedTouches[index]!.identifier, event.type !== 'touchend', true)
      }
      const click = (event: MouseEvent): void => {
        if (drag || suppressClick && !keyboard) { event.preventDefault(); event.stopImmediatePropagation(); return }
        keyboard = false
        event.preventDefault()
        event.stopImmediatePropagation()
        emit()
      }
      const key = (event: KeyboardEvent): void => { if (event.key === 'Enter' || event.key === ' ') keyboard = true }
      const blur = (): void => { if (drag) suppressClick = true; clear() }
      const visibility = (): void => { if (doc.hidden) blur() }
      const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => {
        if (drag && (drag.token !== token() || !enabled())) blur()
      })
      observer?.observe(deck, { attributes: true, attributeFilter: ['data-tarot-token', 'disabled'] })
      deck.addEventListener('pointerdown', down)
      doc.addEventListener('pointermove', pointerMove, { capture: true, passive: false })
      doc.addEventListener('pointerup', up, true)
      doc.addEventListener('pointercancel', up, true)
      deck.addEventListener('lostpointercapture', up)
      deck.addEventListener('touchstart', startTouch, { passive: false })
      doc.addEventListener('touchmove', touchMove, { capture: true, passive: false })
      doc.addEventListener('touchend', touchEnd, true)
      doc.addEventListener('touchcancel', touchEnd, true)
      deck.addEventListener('click', click, true)
      deck.addEventListener('keydown', key)
      doc.addEventListener('visibilitychange', visibility)
      doc.defaultView?.addEventListener('blur', blur)
      return () => {
        observer?.disconnect()
        clear()
        deck.removeEventListener('pointerdown', down)
        doc.removeEventListener('pointermove', pointerMove, true)
        doc.removeEventListener('pointerup', up, true)
        doc.removeEventListener('pointercancel', up, true)
        deck.removeEventListener('lostpointercapture', up)
        deck.removeEventListener('touchstart', startTouch)
        doc.removeEventListener('touchmove', touchMove, true)
        doc.removeEventListener('touchend', touchEnd, true)
        doc.removeEventListener('touchcancel', touchEnd, true)
        deck.removeEventListener('click', click, true)
        deck.removeEventListener('keydown', key)
        doc.removeEventListener('visibilitychange', visibility)
        doc.defaultView?.removeEventListener('blur', blur)
      }
    }), cleanup => Effect.sync(cleanup))
    return yield* Effect.never
  }))

/** Return the accumulated pile to the deck, with identical completion on every fallback. */
export const reshuffleTarotPile = (token: number): Effect.Effect<void> => Effect.gen(function* () {
  yield* Render.afterCommit
  if (typeof document === 'undefined' || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  yield* Effect.sleep('700 millis')
  yield* Effect.callback<void>(resume => {
    const animations: Animation[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    let observer: MutationObserver | undefined
    let settled = false
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      observer?.disconnect()
      for (const animation of animations) { try { animation.cancel() } catch { /* Other owned animations still release. */ } }
    }
    const finish = (): void => { if (!settled) { settled = true; cleanup(); resume(Effect.void) } }
    try {
      const root = document.querySelector<HTMLElement>('.tarot-card')
      const current = (): boolean => !!root?.isConnected && root.dataset.tarotToken === String(token)
      const pile = root?.querySelector<HTMLElement>('.tarot-pile-cards')
      const deck = root?.querySelector<HTMLElement>('.tarot-deck')
      if (!current() || !pile || !deck || typeof pile.animate !== 'function' || typeof deck.animate !== 'function') { finish(); return }
      const from = pile.getBoundingClientRect()
      const to = deck.getBoundingClientRect()
      if (![from.width, from.height, to.width, to.height].every(value => Number.isFinite(value) && value > 0)) { finish(); return }
      const dx = to.left + to.width / 2 - from.left - from.width / 2
      const dy = to.top + to.height / 2 - from.top - from.height / 2
      const returning = pile.animate([
        { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(-4deg) scale(.85)`, opacity: 0 },
      ], { duration: 650, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' })
      animations.push(returning, deck.animate([
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0deg)' },
      ], { duration: 350, delay: 350, easing: 'ease-in-out' }))
      timer = setTimeout(finish, 900)
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => { if (!current()) finish() })
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tarot-token'] })
      }
      void returning.finished.then(finish, finish)
    } catch { finish() }
    return Effect.sync(() => { settled = true; cleanup() })
  })
}).pipe(Effect.catchCause(() => Effect.void))

/** Move the deck's actual back design to its reading slot before the model flips it. */
export const moveTarotCardToSlot = (token: number, slot: number): Effect.Effect<void> => Effect.gen(function* () {
  yield* Render.afterCommit
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > 2 || typeof document === 'undefined' || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  yield* Effect.callback<void>(resume => {
    let overlay: HTMLElement | undefined
    let animation: Animation | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let observer: MutationObserver | undefined
    let settled = false
    const cleanup = (): void => {
      if (timeout !== undefined) clearTimeout(timeout)
      observer?.disconnect()
      overlay?.remove()
      try { animation?.cancel() } catch { /* The owned overlay is already removed. */ }
    }
    const finish = (): void => { if (!settled) { settled = true; cleanup(); resume(Effect.void) } }
    try {
      const root = document.querySelector<HTMLElement>('.tarot-card')
      const current = (): boolean => !!root?.isConnected && root.dataset.tarotToken === String(token)
      const source = root?.querySelector<HTMLElement>('.tarot-deck-back')
      const target = root?.querySelector<HTMLElement>(`[data-tarot-slot="${slot}"] .tarot-slot-card .tarot-card-visual`)
      if (!current() || !source || !target) { finish(); return }
      const from = source.getBoundingClientRect()
      const to = target.getBoundingClientRect()
      const area = root!.getBoundingClientRect()
      if (![from.left, from.top, to.left, to.top, area.left, area.top].every(Number.isFinite) || ![from.width, from.height, to.width, to.height].every(value => Number.isFinite(value) && value > 0)) { finish(); return }
      overlay = source.cloneNode(true) as HTMLElement
      overlay.className = 'tarot-slot-flight'
      overlay.setAttribute('aria-hidden', 'true')
      overlay.removeAttribute('id')
      const ids = new Map<string, string>()
      for (const node of overlay.querySelectorAll<SVGElement>('[id]')) {
        const oldId = node.id
        const newId = `tarot-flight-${token}-${slot}-${oldId}`
        ids.set(oldId, newId)
        node.id = newId
      }
      for (const node of overlay.querySelectorAll<SVGElement>('*')) {
        for (const attribute of [...node.attributes]) {
          let value = attribute.value
          for (const [oldId, newId] of ids) value = value.replaceAll(`url(#${oldId})`, `url(#${newId})`)
          if (value !== attribute.value) node.setAttribute(attribute.name, value)
        }
      }
      Object.assign(overlay.style, {
        position: 'absolute', left: `${from.left - area.left + root!.scrollLeft - root!.clientLeft}px`, top: `${from.top - area.top + root!.scrollTop - root!.clientTop}px`,
        width: `${from.width}px`, height: `${from.height}px`, pointerEvents: 'none', zIndex: '20', transformOrigin: 'top left', transform: 'none', animation: 'none', visibility: 'visible',
      })
      root!.append(overlay)
      if (typeof overlay.animate !== 'function') { finish(); return }
      const dx = to.left - from.left
      const dy = to.top - from.top
      animation = overlay.animate([
        { transform: 'translate(0px, 0px) rotate(-3deg) scale(1)' },
        { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${to.width / from.width}, ${to.height / from.height})` },
      ], { duration: 430, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'both' })
      timeout = setTimeout(finish, 600)
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => { if (!current() || !target.isConnected) finish() })
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tarot-token'] })
      }
      void animation.finished.then(finish, finish)
    } catch { finish() }
    return Effect.sync(() => { settled = true; cleanup() })
  })
}).pipe(Effect.catchCause(() => Effect.void))
