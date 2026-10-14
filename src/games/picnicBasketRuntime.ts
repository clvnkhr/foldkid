import { Effect } from 'effect'
import { Render } from 'foldkit'

const FLIGHT_DURATION = 320
const FLIGHT_FALLBACK = 420
const CELEBRATION_FALLBACK = 1330
const ARRIVAL_FALLBACK = 530

const validRevision = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
const usableRect = (rect: DOMRect): boolean =>
  [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0
const currentCard = (card: HTMLElement | null, round: number, token: number): boolean =>
  !!card?.isConnected && card.dataset.picnicRound === String(round) && card.dataset.picnicToken === String(token)

/** Pack the chosen food visually; the command's acknowledgement owns the game state. */
export const movePicnicFood = (round: number, token: number, step: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (!validRevision(round) || !validRevision(token) || !Number.isSafeInteger(step) || step < 0 || step > 2 ||
      typeof document === 'undefined' || typeof window === 'undefined') return
    yield* Render.afterCommit
    yield* Effect.callback<void>(resume => {
      let source: HTMLElement | undefined
      let flight: HTMLElement | undefined
      let animation: Animation | undefined
      let observer: MutationObserver | undefined
      let timeout: ReturnType<typeof setTimeout> | undefined
      let visibility = ''
      let priority = ''
      let hidden = false
      let settled = false
      const cleanup = (): void => {
        if (timeout !== undefined) {
          try { clearTimeout(timeout) } catch { /* Release the other owned resources even if timers are unavailable. */ }
        }
        try { observer?.disconnect() } catch { /* A broken observer must not keep the food hidden. */ }
        flight?.remove()
        if (hidden && source?.style.visibility === 'hidden') {
          if (visibility) source.style.setProperty('visibility', visibility, priority)
          else source.style.removeProperty('visibility')
        }
        try { animation?.cancel() } catch { /* The overlay is already removed if the animation API fails. */ }
      }
      const finish = (): void => {
        if (settled) return
        settled = true
        cleanup()
        resume(Effect.void)
      }
      try {
        const card = document.querySelector<HTMLElement>('.picnic-basket-card')
        const current = (): boolean => currentCard(card, round, token)
        if (!card || !current() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          finish()
          return
        }
        const movingFood = card.dataset.picnicMovingFood
        const food = movingFood ? [...card.querySelectorAll<HTMLElement>('.picnic-basket-food[data-picnic-food]')]
          .find(element => element.dataset.picnicFood === movingFood) : undefined
        source = food?.querySelector<HTMLElement>('.picnic-basket-food-icon') ?? undefined
        const target = [...card.querySelectorAll<HTMLElement>('.picnic-basket-basket-slot[data-picnic-slot]')]
          .find(element => element.dataset.picnicSlot === String(step))
        if (!source || !target) {
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
        flight = source.cloneNode(true) as HTMLElement
        flight.classList.add('picnic-basket-flight')
        flight.setAttribute('aria-hidden', 'true')
        flight.removeAttribute('aria-label')
        flight.removeAttribute('role')
        flight.removeAttribute('id')
        if (typeof flight.animate !== 'function' || typeof setTimeout !== 'function') {
          finish()
          return
        }
        const font = window.getComputedStyle(source)
        Object.assign(flight.style, {
          position: 'absolute', pointerEvents: 'none', zIndex: '5', margin: '0', padding: '0', border: '0',
          left: `${from.left - cardRect.left - card.clientLeft + card.scrollLeft}px`,
          top: `${from.top - cardRect.top - card.clientTop + card.scrollTop}px`,
          width: `${from.width}px`, height: `${from.height}px`, maxWidth: 'none', maxHeight: 'none',
          display: 'grid', placeItems: 'center', boxSizing: 'border-box', transformOrigin: 'center center',
          transform: 'none', animation: 'none', transition: 'none', visibility: 'visible',
          fontFamily: font.fontFamily, fontSize: font.fontSize, fontWeight: font.fontWeight,
          fontStyle: font.fontStyle, lineHeight: font.lineHeight, letterSpacing: font.letterSpacing,
          color: font.color, textAlign: 'center',
        })
        card.append(flight)
        visibility = source.style.getPropertyValue('visibility')
        priority = source.style.getPropertyPriority('visibility')
        source.style.visibility = 'hidden'
        hidden = true
        const dx = to.left + to.width / 2 - from.left - from.width / 2
        const dy = to.top + to.height / 2 - from.top - from.height / 2
        const scale = Math.min(to.width / from.width, to.height / from.height)
        animation = flight.animate([
          { transform: 'translate(0px, 0px) scale(1)' },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        ], { duration: FLIGHT_DURATION, easing: 'cubic-bezier(.22, .8, .3, 1)', fill: 'both' })
        timeout = setTimeout(finish, FLIGHT_FALLBACK)
        if (typeof MutationObserver !== 'undefined') {
          observer = new MutationObserver(() => {
            try {
              if (!current() || card.dataset.picnicMovingFood !== movingFood || !source?.isConnected || !target.isConnected) finish()
            } catch { finish() }
          })
          observer.observe(document.documentElement, {
            attributes: true, childList: true, subtree: true,
            attributeFilter: ['data-picnic-round', 'data-picnic-token', 'data-picnic-moving-food'],
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

const CONFETTI_COLORS = ['#ffc857', '#ff7191', '#7bdfbb', '#73bafa', '#b594f4', '#fff1b8'] as const

/** Observe the rendered CSS phase, with a bounded fallback and scoped decorative particles. */
const waitBasketAnimation = (
  round: number, token: number, phase: 'complete' | 'arriving', animationName: string, fallback: number,
): Effect.Effect<void> => Effect.gen(function* () {
  if (!validRevision(round) || !validRevision(token) || typeof document === 'undefined' || typeof window === 'undefined') return
  yield* Render.afterCommit
  yield* Effect.callback<void>(resume => {
    let basket: HTMLElement | null = null
    let overlay: HTMLElement | undefined
    const animations: Animation[] = []
    let observer: MutationObserver | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const onAnimation = (event: Event): void => {
      if (event.target === basket && (event as AnimationEvent).animationName === animationName) finish()
    }
    const cleanup = (): void => {
      if (timeout !== undefined) {
        try { clearTimeout(timeout) } catch { /* Release the other resources even when timers fail. */ }
      }
      try { observer?.disconnect() } catch { /* The remaining resources still belong to this phase. */ }
      basket?.removeEventListener('animationend', onAnimation)
      basket?.removeEventListener('animationcancel', onAnimation)
      overlay?.remove()
      animations.forEach(animation => {
        try { animation.cancel() } catch { /* The corresponding decorative node has already been removed. */ }
      })
    }
    const finish = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resume(Effect.void)
    }
    try {
      const card = document.querySelector<HTMLElement>('.picnic-basket-card')
      basket = card?.querySelector<HTMLElement>('.picnic-basket-basket') ?? null
      const current = (): boolean => currentCard(card, round, token) && !!basket?.isConnected && !!card?.contains(basket) &&
        (card.dataset.picnicStatus === undefined || card.dataset.picnicStatus === phase)
      if (!card || !basket || !current() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        typeof setTimeout !== 'function') {
        finish()
        return
      }
      const style = window.getComputedStyle(basket)
      const names = style.animationName.split(',').map(value => value.trim())
      const durations = style.animationDuration.split(',').map(value => parseFloat(value))
      const animationIndex = names.indexOf(animationName)
      if (animationIndex < 0 || !(durations[animationIndex % durations.length]! > 0)) {
        finish()
        return
      }
      basket.addEventListener('animationend', onAnimation)
      basket.addEventListener('animationcancel', onAnimation)
      timeout = setTimeout(finish, fallback)
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => {
          try { if (!current()) finish() } catch { finish() }
        })
        observer.observe(document.documentElement, {
          attributes: true, childList: true, subtree: true,
          attributeFilter: ['data-picnic-round', 'data-picnic-token', 'data-picnic-status'],
        })
      }
      if (phase === 'complete' && typeof basket.animate === 'function') {
        const cardRect = card.getBoundingClientRect()
        const basketRect = basket.getBoundingClientRect()
        if ([cardRect, basketRect].every(usableRect)) {
          overlay = document.createElement('div')
          overlay.className = 'picnic-basket-celebration'
          overlay.setAttribute('aria-hidden', 'true')
          Object.assign(overlay.style, {
            position: 'absolute', pointerEvents: 'none', width: '0', height: '0', zIndex: '6',
            left: `${basketRect.left + basketRect.width / 2 - cardRect.left - card.clientLeft + card.scrollLeft}px`,
            top: `${basketRect.top + basketRect.height / 2 - cardRect.top - card.clientTop + card.scrollTop}px`,
          })
          card.append(overlay)
          const glow = document.createElement('span')
          glow.className = 'picnic-basket-glow'
          overlay.append(glow)
          animations.push(glow.animate([
            { transform: 'scale(.45)', opacity: .85 }, { transform: 'scale(2.2)', opacity: 0 },
          ], { duration: 680, easing: 'cubic-bezier(.15, .65, .3, 1)', fill: 'both' }))
          // Local deterministic variation keeps effects lively without storing a second game state.
          let seed = (Math.imul(round + 1, 0x45d9f3b) ^ Math.imul(token + 1, 0x119de1f3)) >>> 0
          const random = (): number => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
            return seed / 0x100000000
          }
          for (let index = 0; index < 20; index++) {
            const confetti = document.createElement('span')
            confetti.className = `picnic-basket-confetti${index % 4 === 0 ? ' picnic-basket-confetti--star' : ''}`
            const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length]!
            Object.assign(confetti.style, { backgroundColor: color, color, pointerEvents: 'none' })
            overlay.append(confetti)
            const angle = -Math.PI + random() * Math.PI
            const distance = 75 + random() * 115
            const dx = Math.cos(angle) * distance
            const dy = Math.sin(angle) * distance - 15
            const rotation = (random() - .5) * 780
            const scale = .65 + random() * .6
            animations.push(confetti.animate([
              { transform: 'translate(0px, 0px) rotate(0deg) scale(.2)', opacity: 0, offset: 0 },
              { transform: `translate(${dx * .3}px, ${dy * .55}px) rotate(${rotation * .2}deg) scale(${scale})`, opacity: 1, offset: .18 },
              { transform: `translate(${dx}px, ${dy}px) rotate(${rotation * .6}deg) scale(${scale})`, opacity: 1, offset: .55 },
              { transform: `translate(${dx * 1.15}px, ${dy + 80 + random() * 80}px) rotate(${rotation}deg) scale(${scale * .8})`, opacity: 0, offset: 1 },
            ], { duration: 760 + random() * 300, delay: (index % 5) * 12, easing: 'linear', fill: 'both' }))
          }
        }
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

/** Celebrate the filled basket, then let it leave before replacing it. */
export const waitPicnicRefresh = (round: number, token: number): Effect.Effect<void> =>
  waitBasketAnimation(round, token, 'complete', 'picnic-basket-celebrate', CELEBRATION_FALLBACK)

/** Let the newly rendered empty basket arrive before accepting the next order. */
export const arrivePicnicBasket = (round: number, token: number): Effect.Effect<void> =>
  waitBasketAnimation(round, token, 'arriving', 'picnic-basket-arrive', ARRIVAL_FALLBACK)
