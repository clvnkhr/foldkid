import { Effect, Stream } from 'effect'
import { Render } from 'foldkit'

const CAPACITY = 6
const STILL_DURATION = 180
const palettes = [
  ['#2dd4bf', '#38bdf8', '#a78bfa', '#fb7185', '#fde047'],
  ['#fb923c', '#f97316', '#fbbf24', '#ffedd5'],
  ['#fbbf24', '#fde68a', '#fff7d6', '#f59e0b'],
  ['#f9a8d4', '#fb7185', '#fbcfe8', '#c4b5fd'],
] as const

interface Burst { readonly dispose: () => void }
const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min)
const validRect = (rect: DOMRect): boolean =>
  [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0

const vectorParticle = (shape: 'whack-fx-star' | 'whack-fx-heart'): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('focusable', 'false')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', shape === 'whack-fx-star'
    ? 'M12 1.5 15 8.3 22.4 9 16.8 13.9 18.5 21.2 12 17.4 5.5 21.2 7.2 13.9 1.6 9 9 8.3Z'
    : 'M12 21C9 18.7 2 14.1 2 8.6 2 2.8 9.3 1.2 12 6 14.7 1.2 22 2.8 22 8.6 22 14.1 15 18.7 12 21Z')
  svg.append(path)
  return svg
}

// Only transient decoration lives here. Every activation reads the committed board.
export const createWhackEffectsRuntime = (grid: HTMLElement): (() => void) => {
  const bursts = new Set<Burst>()
  const consumed = new Map<number, string>()
  let layer: HTMLDivElement | undefined
  let disposed = false
  let tick = ''

  const hit = (event: Event): void => {
    if (disposed || event.defaultPrevented || !grid.isConnected || !(event.target instanceof Element)) return
    const cell = event.target.closest<HTMLButtonElement>('.whack-cell[data-whack-index]')
    if (!(cell instanceof HTMLButtonElement) || !grid.contains(cell) || cell.closest('.whack-grid') !== grid || cell.disabled || cell.closest('[inert]')) return
    const indexText = cell.getAttribute('data-whack-index') ?? ''
    const typeText = cell.getAttribute('data-whack-type') ?? ''
    const currentTick = grid.getAttribute('data-whack-tick') ?? ''
    if (!/^[0-8]$/.test(indexText) || !/^[1-4]$/.test(typeText) || !/^(?:[1-9]|[12]\d|30)$/.test(currentTick)) return
    if (!cell.classList.contains('whack-cell--up')) return
    const index = Number(indexText)
    const stamp = `${currentTick}:${typeText}`
    if (currentTick !== tick) { consumed.clear(); tick = currentTick }
    if (consumed.get(index) === stamp) return
    let boardRect: DOMRect
    let cellRect: DOMRect
    try { boardRect = grid.getBoundingClientRect(); cellRect = cell.getBoundingClientRect() } catch { return }
    if (!validRect(boardRect) || !validRect(cellRect)) return
    const x = cellRect.left + cellRect.width / 2 - boardRect.left
    const y = cellRect.top + cellRect.height * 0.55 - boardRect.top
    if (x < 0 || y < 0 || x > boardRect.width || y > boardRect.height) return
    consumed.set(index, stamp)
    while (bursts.size >= CAPACITY) bursts.values().next().value?.dispose()
    if (!layer) {
      layer = document.createElement('div')
      layer.className = 'whack-fx-layer'
      layer.setAttribute('aria-hidden', 'true')
      grid.append(layer)
    }
    const node = document.createElement('div')
    node.className = 'whack-fx-burst'
    node.style.left = `${x}px`
    node.style.top = `${y}px`
    const type = Number(typeText)
    const palette = palettes[type - 1]!
    node.style.color = palette[0]
    layer.append(node)
    const animations = new Set<Animation>()
    let finishedLaunching = false
    let ended = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const burst: Burst = { dispose: () => {
      if (ended) return
      ended = true
      if (timeout !== undefined) clearTimeout(timeout)
      for (const animation of animations) { try { animation.cancel() } catch { /* An absent animation API still releases the node. */ } }
      animations.clear()
      node.remove()
      bursts.delete(burst)
      if (bursts.size === 0) { layer?.remove(); layer = undefined }
    } }
    bursts.add(burst)
    let still = typeof node.animate !== 'function'
    try { still ||= window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* Browsers without media queries use the ordinary burst. */ }
    const ring = document.createElement('span')
    ring.className = 'whack-fx-ring'
    const puff = document.createElement('span')
    puff.className = 'whack-fx-puff'
    node.append(ring, puff)
    const size = Math.max(24, Math.min(cellRect.width * 0.6, 72))
    ring.style.width = ring.style.height = `${size}px`
    puff.style.width = puff.style.height = `${size * 0.8}px`

    const animate = (piece: HTMLElement | SVGSVGElement, frames: Keyframe[], duration: number): void => {
      if (still) return
      try {
        const animation = piece.animate(frames, { duration, easing: 'linear', fill: 'forwards' })
        animations.add(animation)
        const settle = (): void => {
          if (animations.delete(animation)) {
            piece.remove()
            try { animation.cancel() } catch { /* Completed decoration still releases its node. */ }
          }
          if (finishedLaunching && !still && animations.size === 0) burst.dispose()
        }
        animation.finished.then(settle, settle)
      } catch { still = true }
    }
    animate(ring, [
      { transform: 'translate(-50%,-50%) scale(.28)', opacity: 0.95 },
      { offset: 0.32, opacity: 0.7 },
      { transform: 'translate(-50%,-50%) scale(1.65)', opacity: 0 },
    ], 340)
    animate(puff, [
      { transform: 'translate(-50%,-50%) scale(.35)', opacity: 0.85 },
      { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 0 },
    ], 220)
    const count = type === 3 ? 14 : type === 4 ? 10 : 12
    let longest = 340
    for (let i = 0; !still && i < count; i++) {
      const shape = type === 3 ? 'whack-fx-star' : type === 4 && i % 3 === 0 ? 'whack-fx-heart'
        : type === 4 ? 'whack-fx-petal' : type === 2 ? 'whack-fx-streak' : 'whack-fx-confetti'
      const piece = shape === 'whack-fx-star' || shape === 'whack-fx-heart' ? vectorParticle(shape) : document.createElement('span')
      piece.setAttribute('class', `whack-fx-particle ${shape}`)
      piece.style.color = palette[i % palette.length]!
      const width = size * randomBetween(0.12, 0.24)
      piece.style.width = `${width}px`
      piece.style.height = `${width * (shape === 'whack-fx-streak' ? randomBetween(2, 3.2) : shape === 'whack-fx-petal' ? 1.5 : 1)}px`
      const angle = -Math.PI + (i + randomBetween(-0.25, 0.25)) / count * Math.PI * 2
      const reach = size * randomBetween(0.7, type === 2 ? 1.75 : 1.5)
      const dx = Math.cos(angle) * reach
      const dy = Math.sin(angle) * reach - size * 0.16
      const rotation = shape === 'whack-fx-streak' ? angle * 180 / Math.PI - 90 : randomBetween(-120, 120)
      const spin = shape === 'whack-fx-streak' ? 0 : randomBetween(-150, 150)
      const duration = randomBetween(type === 4 ? 470 : 450, type === 4 ? 700 : 650)
      longest = Math.max(longest, duration)
      node.append(piece)
      animate(piece, [
        { transform: `translate(-50%,-50%) rotate(${rotation}deg) scale(.2)`, opacity: 0 },
        { offset: 0.13, transform: `translate(-50%,-50%) translate(${dx * 0.5}px,${dy * 0.5}px) rotate(${rotation + spin * 0.13}deg) scale(1)`, opacity: 1 },
        { offset: 0.65, transform: `translate(-50%,-50%) translate(${dx * 0.82}px,${dy * 0.82}px) rotate(${rotation + spin * 0.65}deg) scale(1)`, opacity: 0.95 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy + size * 0.35}px) rotate(${rotation + spin}deg) scale(.45)`, opacity: 0 },
      ], duration)
    }
    finishedLaunching = true
    if (still) {
      node.classList.add('whack-fx-reduced')
      for (const animation of animations) { try { animation.cancel() } catch { /* Static feedback needs no animation. */ } }
      animations.clear()
      node.querySelectorAll('.whack-fx-particle').forEach(piece => piece.remove())
    }
    timeout = setTimeout(burst.dispose, still ? STILL_DURATION : longest + 100)
  }
  grid.addEventListener('click', hit, true)
  return () => {
    if (disposed) return
    disposed = true
    grid.removeEventListener('click', hit, true)
    for (const burst of bursts) burst.dispose()
    consumed.clear()
    layer?.remove()
    layer = undefined
  }
}

export const mountWhackEffects = (element: Element): Stream.Stream<never> => Stream.callback<never>(() =>
  Effect.gen(function* () {
    yield* Render.afterCommit
    yield* Effect.acquireRelease(
      Effect.sync(() => createWhackEffectsRuntime(element as HTMLElement)),
      cleanup => Effect.sync(cleanup),
    )
    return yield* Effect.never
  }),
)
