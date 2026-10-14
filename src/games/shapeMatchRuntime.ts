import { Effect } from 'effect'
import { Render } from 'foldkit'

const DURATION = 420
const FALLBACK = 520
const REPLACEMENT_DELAY = 350

const usableRect = (rect: DOMRect): boolean =>
  [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0

const clonePiece = (source: HTMLElement, round: number, token: number): HTMLElement => {
  const flight = source.cloneNode(true) as HTMLElement
  flight.classList.add('shape-match-flight')
  flight.setAttribute('aria-hidden', 'true')
  flight.removeAttribute('aria-label')
  flight.removeAttribute('role')
  const ids = new Map<string, string>()
  for (const element of [flight, ...flight.querySelectorAll<HTMLElement>('[id]')]) {
    if (!element.id) continue
    const id = `${element.id}-flight-${round}-${token}`
    ids.set(element.id, id)
    element.id = id
  }
  for (const element of [flight, ...flight.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value
      for (const [original, replacement] of ids) {
        value = value.replaceAll(`url(#${original})`, `url(#${replacement})`)
        if ((attribute.name === 'href' || attribute.name === 'xlink:href') && value === `#${original}`) value = `#${replacement}`
      }
      if (value !== attribute.value) element.setAttribute(attribute.name, value)
    }
  }
  return flight
}

/** The model completes the match after this effect finishes, including animation fallbacks. */
export const moveShapeMatchPiece = (round: number, token: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(round) || round < 0 || !Number.isSafeInteger(token) || token < 0 ||
      typeof document === 'undefined' || typeof window === 'undefined') return
    yield* Render.afterCommit
    yield* Effect.callback<void>(resume => {
      let flight: HTMLElement | undefined
      let source: HTMLElement | undefined
      let animation: Animation | undefined
      let observer: MutationObserver | undefined
      let timeout: ReturnType<typeof setTimeout> | undefined
      let visibility = ''
      let priority = ''
      let hidden = false
      let settled = false
      const cleanup = (): void => {
        if (timeout !== undefined) clearTimeout(timeout)
        observer?.disconnect()
        flight?.remove()
        if (hidden && source?.style.visibility === 'hidden') {
          if (visibility) source.style.setProperty('visibility', visibility, priority)
          else source.style.removeProperty('visibility')
        }
        try { animation?.cancel() } catch { /* A broken animation API must still release the overlay. */ }
      }
      const finish = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resume(Effect.void)
      }
      try {
        const card = document.querySelector<HTMLElement>('.shape-match-card')
        const current = (): boolean => !!card?.isConnected && card.dataset.shapeMatchRound === String(round) &&
          card.dataset.shapeMatchToken === String(token)
        if (!current() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          finish()
          return
        }
        source = card?.querySelector<HTMLElement>('.shape-match-stage .shape-match-piece') ?? undefined
        const target = card?.querySelector<HTMLElement>('[data-shape-match-correct="true"] .shape-match-home-piece')
        if (!card || !source || !target) {
          finish()
          return
        }
        const cardRect = card.getBoundingClientRect()
        const from = source.getBoundingClientRect()
        const to = target.getBoundingClientRect()
        if (![cardRect, from, to].every(usableRect)) {
          finish()
          return
        }
        flight = clonePiece(source, round, token)
        if (typeof flight.animate !== 'function') {
          finish()
          return
        }
        Object.assign(flight.style, {
          position: 'absolute', pointerEvents: 'none', zIndex: '5', margin: '0',
          left: `${from.left - cardRect.left - card.clientLeft + card.scrollLeft}px`,
          top: `${from.top - cardRect.top - card.clientTop + card.scrollTop}px`,
          width: `${from.width}px`, height: `${from.height}px`, maxWidth: 'none', maxHeight: 'none',
          boxSizing: 'border-box', transformOrigin: 'center center', transform: 'none',
          animation: 'none', transition: 'none', visibility: 'visible',
        })
        card.append(flight)
        visibility = source.style.getPropertyValue('visibility')
        priority = source.style.getPropertyPriority('visibility')
        source.style.visibility = 'hidden'
        hidden = true
        const dx = to.left + to.width / 2 - from.left - from.width / 2
        const dy = to.top + to.height / 2 - from.top - from.height / 2
        animation = flight.animate([
          { transform: 'translate(0px, 0px) scale(1, 1)' },
          { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width}, ${to.height / from.height})` },
        ], { duration: DURATION, easing: 'cubic-bezier(.22, .8, .3, 1)', fill: 'both' })
        timeout = setTimeout(finish, FALLBACK)
        if (typeof MutationObserver !== 'undefined') {
          observer = new MutationObserver(() => {
            if (!current() || !source?.isConnected || !target.isConnected) finish()
          })
          observer.observe(document.documentElement, {
            attributes: true, childList: true, subtree: true,
            attributeFilter: ['data-shape-match-round', 'data-shape-match-token'],
          })
        }
        void animation.finished.then(finish, finish)
      } catch {
        finish()
      }
      return Effect.sync(() => {
        settled = true
        cleanup()
      })
    })
  }).pipe(Effect.catchCause(() => Effect.void))

/** Leave the fitted piece visible briefly before the game supplies another piece. */
export const waitShapeMatchReplacement = (round: number, token: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(round) || round < 0 || !Number.isSafeInteger(token) || token < 0 ||
      typeof document === 'undefined' || typeof window === 'undefined') return
    yield* Render.afterCommit
    yield* Effect.callback<void>(resume => {
      let observer: MutationObserver | undefined
      let timeout: ReturnType<typeof setTimeout> | undefined
      let settled = false
      const cleanup = (): void => {
        if (timeout !== undefined) {
          try { clearTimeout(timeout) } catch { /* An unavailable timer API must not prevent completion. */ }
        }
        try { observer?.disconnect() } catch { /* A broken observer must still release the timer. */ }
      }
      const finish = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resume(Effect.void)
      }
      try {
        const card = document.querySelector<HTMLElement>('.shape-match-card')
        const current = (): boolean => !!card?.isConnected && card.dataset.shapeMatchRound === String(round) &&
          card.dataset.shapeMatchToken === String(token)
        if (!current() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof setTimeout !== 'function') {
          finish()
          return
        }
        timeout = setTimeout(finish, REPLACEMENT_DELAY)
        if (typeof MutationObserver !== 'undefined') {
          observer = new MutationObserver(() => {
            try { if (!current()) finish() } catch { finish() }
          })
          observer.observe(document.documentElement, {
            attributes: true, childList: true, subtree: true,
            attributeFilter: ['data-shape-match-round', 'data-shape-match-token'],
          })
        }
      } catch {
        finish()
      }
      return Effect.sync(() => {
        settled = true
        cleanup()
      })
    })
  }).pipe(Effect.catchCause(() => Effect.void))
