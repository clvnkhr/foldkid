import { Effect, Queue, Stream } from 'effect'
import { warmAudio } from '../audio'

type Side = 'number' | 'word'
type Endpoint = { element: HTMLButtonElement; side: Side; choice: number }
export type LineMessage =
  | { readonly _tag: 'SequenceWordsPick'; readonly side: Side; readonly choice: number; readonly token: number }
  | { readonly _tag: 'SequenceWordsConnect'; readonly number: number; readonly word: number; readonly token: number }
const path = (x1: number, y1: number, x2: number, y2: number): string => {
  const bend = (x2 - x1) * 0.45
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
}

/** Measures the rendered worksheet and paints only its scoped SVG connectors. */
export const mountSequenceLines = (element: Element): Stream.Stream<LineMessage> => Stream.callback(queue => Effect.gen(function* () {
  yield* Effect.acquireRelease(Effect.sync(() => {
    const board = element as HTMLElement
    const doc = board.ownerDocument
    let drag: { origin: Endpoint; token: number; x: number; y: number; lastX: number; lastY: number; time: number; pointerId?: number; nativeId?: number; captured: boolean; moved: boolean } | undefined
    let recentRelease = 0
    let suppressPhysical = false
    let keyboard = false
    const token = (): number => Number(board.dataset.sequenceToken)
    const enabled = (): boolean => board.isConnected && board.dataset.sequenceStatus === 'matching'
    const endpoint = (target: EventTarget | null): Endpoint | undefined => {
      if (!(target instanceof Element)) return undefined
      const button = target.closest<HTMLButtonElement>('button[data-sequence-side]')
      if (!button || !board.contains(button) || button.disabled) return undefined
      const side = button.dataset.sequenceSide
      const choice = Number(button.dataset.sequenceChoice)
      return (side === 'number' || side === 'word') && Number.isSafeInteger(choice) && choice >= 0 ? { element: button, side, choice } : undefined
    }
    const anchor = (button: HTMLButtonElement): readonly [number, number] | undefined => {
      const dot = button.querySelector<HTMLElement>('[data-sequence-anchor]')
      if (!dot) return undefined
      const rect = dot.getBoundingClientRect()
      const frame = board.getBoundingClientRect()
      return [rect.left + rect.width / 2 - frame.left, rect.top + rect.height / 2 - frame.top]
    }
    const draft = (): SVGPathElement | null => board.querySelector('[data-sequence-drag]')
    const clear = (): void => {
      const active = drag
      drag = undefined
      draft()?.removeAttribute('d')
      board.classList.remove('sequence-words-board--drawing')
      if (active?.captured && active.pointerId !== undefined) {
        try { if (board.hasPointerCapture(active.pointerId)) board.releasePointerCapture(active.pointerId) } catch { /* Already cancelled by WebKit. */ }
      }
    }
    const drawDraft = (): void => {
      if (!drag) return
      if (drag.token !== token() || !enabled()) { suppressPhysical = true; clear(); return }
      const start = anchor(drag.origin.element)
      const frame = board.getBoundingClientRect()
      if (start) draft()?.setAttribute('d', path(start[0], start[1], drag.lastX - frame.left, drag.lastY - frame.top))
    }
    const paint = (): void => {
      const frame = board.getBoundingClientRect()
      const svg = board.querySelector('svg')
      if (!svg || !Number.isFinite(frame.width) || frame.width <= 0 || frame.height <= 0) return
      svg.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`)
      for (const line of board.querySelectorAll<SVGPathElement>('[data-sequence-line]')) {
        const choice = line.dataset.sequenceLine
        if (!choice || !/^\d+$/.test(choice)) continue
        // Disabled matched endpoints remain measurable, unlike active hit targets.
        const left = board.querySelector<HTMLButtonElement>(`button[data-sequence-side="number"][data-sequence-choice="${choice}"]`)
        const right = board.querySelector<HTMLButtonElement>(`button[data-sequence-side="word"][data-sequence-choice="${choice}"]`)
        const start = left && anchor(left)
        const end = right && anchor(right)
        if (start && end) line.setAttribute('d', path(start[0], start[1], end[0], end[1]))
      }
      drawDraft()
    }
    const begin = (target: EventTarget | null, id: number, x: number, y: number, time: number, native: boolean, capture: boolean): boolean => {
      const origin = endpoint(target)
      if (!enabled() || !origin || ![x, y, time, id, token()].every(Number.isFinite)) return false
      if (drag) {
        if (origin.element !== drag.origin.element || Math.hypot(x - drag.x, y - drag.y) > 1 || Math.abs(time - drag.time) > 40) return false
        if (native && drag.nativeId === undefined) drag.nativeId = id
        else if (!native && drag.pointerId === undefined) drag.pointerId = id
        else return false
        return true
      }
      recentRelease = 0
      suppressPhysical = false
      keyboard = false
      drag = { origin, token: token(), x, y, lastX: x, lastY: y, time, captured: false, moved: false, ...(native ? { nativeId: id } : { pointerId: id }) }
      if (capture) {
        try { board.setPointerCapture(id); drag.captured = true } catch { /* Document listeners keep uncaptured drags working. */ }
      }
      return true
    }
    const move = (id: number, x: number, y: number, native: boolean): boolean => {
      if (!drag || (native ? drag.nativeId !== id : drag.pointerId !== id || drag.nativeId !== undefined)) return false
      if (![x, y].every(Number.isFinite)) { recentRelease = Date.now(); suppressPhysical = true; clear(); return false }
      drag.lastX = x; drag.lastY = y
      drag.moved ||= Math.hypot(x - drag.x, y - drag.y) > 8
      if (drag.moved) { board.classList.add('sequence-words-board--drawing'); drawDraft() }
      return true
    }
    const finish = (id: number, x: number, y: number, cancelled: boolean, native: boolean): boolean => {
      if (!drag || (native ? drag.nativeId !== id : drag.pointerId !== id)) return false
      if (!native && !cancelled && drag.nativeId !== undefined) return false
      const active = drag
      active.moved ||= Math.hypot(x - active.x, y - active.y) > 8
      const valid = !cancelled && active.token === token() && enabled()
      const destination = valid && active.moved && typeof doc.elementFromPoint === 'function' ? endpoint(doc.elementFromPoint(x, y)) : undefined
      clear()
      recentRelease = Date.now()
      suppressPhysical = true
      if (!valid) return true
      warmAudio()
      if (!active.moved) Queue.offerUnsafe(queue, { _tag: 'SequenceWordsPick', side: active.origin.side, choice: active.origin.choice, token: active.token })
      else if (destination && destination.side !== active.origin.side) Queue.offerUnsafe(queue, {
        _tag: 'SequenceWordsConnect', number: active.origin.side === 'number' ? active.origin.choice : destination.choice,
        word: active.origin.side === 'word' ? active.origin.choice : destination.choice, token: active.token,
      })
      return true
    }
    const down = (event: PointerEvent): void => {
      if (event.button === 0) begin(event.target, event.pointerId, event.clientX, event.clientY, event.timeStamp, false, event.pointerType !== 'touch')
    }
    const pointerMove = (event: PointerEvent): void => { if (move(event.pointerId, event.clientX, event.clientY, false)) event.preventDefault() }
    const up = (event: PointerEvent): void => {
      if (event.type === 'lostpointercapture' && drag?.nativeId !== undefined) return
      if (finish(event.pointerId, event.clientX, event.clientY, event.type !== 'pointerup', false)) event.preventDefault()
    }
    const touches = (event: TouchEvent, fn: (touch: Touch) => boolean): boolean => {
      let handled = false
      for (let index = 0; index < event.changedTouches.length; index++) {
        const touch = typeof event.changedTouches.item === 'function' ? event.changedTouches.item(index) : event.changedTouches[index]
        if (touch && fn(touch)) handled = true
      }
      return handled
    }
    const touchStart = (event: TouchEvent): void => {
      if (touches(event, touch => begin(touch.target, touch.identifier, touch.clientX, touch.clientY, event.timeStamp, true, false))) event.preventDefault()
    }
    const touchMove = (event: TouchEvent): void => { if (touches(event, touch => move(touch.identifier, touch.clientX, touch.clientY, true))) event.preventDefault() }
    const touchEnd = (event: TouchEvent): void => {
      if (touches(event, touch => finish(touch.identifier, touch.clientX, touch.clientY, event.type === 'touchcancel', true))) event.preventDefault()
    }
    const click = (event: MouseEvent): void => {
      const physical = event.detail > 0 || ['touch', 'pen'].includes((event as PointerEvent).pointerType)
      if (!keyboard && physical && (drag || suppressPhysical || recentRelease > 0 && Date.now() - recentRelease < 900)) {
        event.preventDefault(); event.stopImmediatePropagation()
      } else if (endpoint(event.target)) warmAudio()
      keyboard = false
    }
    const key = (event: KeyboardEvent): void => { if (event.key === 'Enter' || event.key === ' ') keyboard = true }
    const blur = (): void => { if (drag) { recentRelease = Date.now(); suppressPhysical = true }; clear() }
    const visibility = (): void => { if (doc.hidden) blur() }
    board.addEventListener('pointerdown', down)
    doc.addEventListener('pointermove', pointerMove, { capture: true, passive: false })
    doc.addEventListener('pointerup', up, { capture: true, passive: false })
    doc.addEventListener('pointercancel', up, true)
    board.addEventListener('lostpointercapture', up)
    board.addEventListener('touchstart', touchStart, { passive: false })
    doc.addEventListener('touchmove', touchMove, { capture: true, passive: false })
    doc.addEventListener('touchend', touchEnd, { capture: true, passive: false })
    doc.addEventListener('touchcancel', touchEnd, true)
    board.addEventListener('click', click, true)
    board.addEventListener('keydown', key)
    doc.addEventListener('visibilitychange', visibility)
    doc.defaultView?.addEventListener('blur', blur)
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(paint)
    resized?.observe(board)
    doc.defaultView?.addEventListener('resize', paint)
    const changed = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(paint)
    changed?.observe(board, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sequence-token', 'data-sequence-matched', 'data-sequence-status'] })
    paint()
    return () => {
      clear(); resized?.disconnect(); changed?.disconnect()
      board.removeEventListener('pointerdown', down)
      doc.removeEventListener('pointermove', pointerMove, true)
      doc.removeEventListener('pointerup', up, true)
      doc.removeEventListener('pointercancel', up, true)
      board.removeEventListener('lostpointercapture', up)
      board.removeEventListener('touchstart', touchStart)
      doc.removeEventListener('touchmove', touchMove, true)
      doc.removeEventListener('touchend', touchEnd, true)
      doc.removeEventListener('touchcancel', touchEnd, true)
      board.removeEventListener('click', click, true)
      board.removeEventListener('keydown', key)
      doc.removeEventListener('visibilitychange', visibility)
      doc.defaultView?.removeEventListener('blur', blur)
      doc.defaultView?.removeEventListener('resize', paint)
    }
  }), cleanup => Effect.sync(cleanup))
  return yield* Effect.never
}))
