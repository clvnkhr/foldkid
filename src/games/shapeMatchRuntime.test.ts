import { Effect, Fiber } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { moveShapeMatchPiece, waitShapeMatchReplacement } from './shapeMatchRuntime'

let frames: Map<number, FrameRequestCallback>
let originalAnimate: PropertyDescriptor | undefined
const mediaQuery = (matches: boolean): MediaQueryList => ({
  matches, media: '(prefers-reduced-motion: reduce)', onchange: null,
  addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
  dispatchEvent: () => true,
})

beforeEach(() => {
  vi.useFakeTimers()
  frames = new Map()
  let id = 0
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(frame => { frames.delete(frame) })
  vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery(false))
  originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')
})

afterEach(async () => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  await vi.advanceTimersByTimeAsync(0)
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate)
  else Reflect.deleteProperty(Element.prototype, 'animate')
})

const commit = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0)
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach(callback => callback(0))
  await vi.advanceTimersByTimeAsync(0)
}

const fixture = () => {
  const card = document.createElement('div')
  card.className = 'shape-match-card'
  card.dataset.shapeMatchRound = '2'
  card.dataset.shapeMatchToken = '7'
  card.innerHTML = `
    <div class="shape-match-stage">
      <div class="shape-match-piece" role="img" aria-label="Circle and triangle">
        <svg><defs><linearGradient id="first-gradient" /></defs><circle fill="url(#first-gradient)" /></svg>
        <svg><defs><linearGradient id="second-gradient" /></defs><path fill="url(#second-gradient)" /></svg>
      </div>
    </div>
    <button data-shape-match-correct="false"><div class="shape-match-home-piece"><svg /></div></button>
    <button data-shape-match-correct="true"><div class="shape-match-home-piece"><svg /><svg /></div></button>`
  document.body.append(card)
  const source = card.querySelector<HTMLElement>('.shape-match-piece')!
  const target = card.querySelector<HTMLElement>('[data-shape-match-correct="true"] .shape-match-home-piece')!
  const cardRect = vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 360, 550))
  const sourceRect = vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 150, 160, 80))
  const targetRect = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(240, 430, 96, 48))
  let finish!: () => void
  let reject!: (error: Error) => void
  const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail })
  const cancel = vi.fn()
  const animation = { finished, cancel } as unknown as Animation
  const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => animation)
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  return { card, source, target, cardRect, sourceRect, targetRect, animate, cancel, finish, reject }
}

const start = async (round = 2, token = 7) => {
  const result = Effect.runPromise(moveShapeMatchPiece(round, token))
  await commit()
  return { result }
}

describe('Shape Match piece flight', () => {
  it('waits for the render commit before finding or measuring a newly rendered piece', async () => {
    const result = Effect.runPromise(moveShapeMatchPiece(2, 7))
    await vi.advanceTimersByTimeAsync(0)
    const { sourceRect, animate, finish } = fixture()
    expect(sourceRect).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
    await commit()
    expect(sourceRect).toHaveBeenCalledOnce()
    finish()
    await result
  })

  it('moves the complete pair group from its measured position onto the correct home', async () => {
    const { card, source, animate, cancel, finish } = fixture()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { result } = await start()
    const flight = card.querySelector<HTMLElement>('.shape-match-flight')!
    expect(flight.parentElement).toBe(card)
    expect(flight.querySelectorAll('svg')).toHaveLength(2)
    expect(flight.getAttribute('aria-hidden')).toBe('true')
    expect(flight.hasAttribute('aria-label')).toBe(false)
    expect(flight.hasAttribute('role')).toBe(false)
    expect(flight.style).toMatchObject({ position: 'absolute', pointerEvents: 'none', left: '20px', top: '50px', width: '160px', height: '80px' })
    expect(source.style.visibility).toBe('hidden')
    expect(animate).toHaveBeenCalledWith([
      { transform: 'translate(0px, 0px) scale(1, 1)' },
      { transform: 'translate(88px, 264px) scale(0.6, 0.6)' },
    ], { duration: 420, easing: 'cubic-bezier(.22, .8, .3, 1)', fill: 'both' })
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(flight.querySelector('circle')?.getAttribute('fill')).toBe('url(#first-gradient-flight-2-7)')
    expect(flight.querySelector('path')?.getAttribute('fill')).toBe('url(#second-gradient-flight-2-7)')
    finish()
    await result
    expect(card.querySelector('.shape-match-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(cancel).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restores existing source visibility and its priority', async () => {
    const { source, finish } = fixture()
    source.style.setProperty('visibility', 'collapse', 'important')
    const { result } = await start()
    finish()
    await result
    expect(source.style.getPropertyValue('visibility')).toBe('collapse')
    expect(source.style.getPropertyPriority('visibility')).toBe('important')
  })

  it('finishes immediately when the game DOM is missing', async () => {
    const { result } = await start()
    await expect(result).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['round', 'token'])('skips stale %s values before touching the scene', async field => {
    const { card, source, animate } = fixture()
    card.dataset[field === 'round' ? 'shapeMatchRound' : 'shapeMatchToken'] = '99'
    const { result } = await start()
    await result
    expect(animate).not.toHaveBeenCalled()
    expect(source.style.visibility).toBe('')
  })

  it.each([[-1, 7], [2.5, 7], [2, NaN], [2, -1]])('ignores invalid round/token %s/%s', async (round, token) => {
    const { animate } = fixture()
    await Effect.runPromise(moveShapeMatchPiece(round, token))
    expect(animate).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it('finishes without motion under reduced motion', async () => {
    const { sourceRect, animate } = fixture()
    vi.mocked(window.matchMedia).mockReturnValue(mediaQuery(true))
    const { result } = await start()
    await result
    expect(sourceRect).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
  })

  it.each(['source', 'target'])('finishes when the %s element is missing', async missing => {
    const { source, target, animate } = fixture()
    ;(missing === 'source' ? source : target).remove()
    const { result } = await start()
    await result
    expect(animate).not.toHaveBeenCalled()
  })

  it.each(['zero', 'nonfinite'])('finishes when measured geometry is %s', async kind => {
    const { sourceRect, animate } = fixture()
    sourceRect.mockReturnValue(new DOMRect(120, 150, kind === 'zero' ? 0 : Infinity, 80))
    const { result } = await start()
    await result
    expect(animate).not.toHaveBeenCalled()
  })

  it('finishes without changing a hidden source when animation is unsupported', async () => {
    const { source, card } = fixture()
    source.style.visibility = 'hidden'
    Reflect.deleteProperty(Element.prototype, 'animate')
    const { result } = await start()
    await result
    expect(source.style.visibility).toBe('hidden')
    expect(card.querySelector('.shape-match-flight')).toBeNull()
  })

  it('cleans up when starting the animation throws', async () => {
    const { source, card, animate } = fixture()
    animate.mockImplementation(() => { throw new Error('animation unsupported') })
    const { result } = await start()
    await expect(result).resolves.toBeUndefined()
    expect(source.style.visibility).toBe('')
    expect(card.querySelector('.shape-match-flight')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up a rejected animation and still finishes the match', async () => {
    const { source, card, reject, cancel } = fixture()
    const { result } = await start()
    reject(new Error('animation cancelled'))
    await expect(result).resolves.toBeUndefined()
    expect(source.style.visibility).toBe('')
    expect(card.querySelector('.shape-match-flight')).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('finishes by 520ms if the animation API never settles', async () => {
    const { card, source, cancel } = fixture()
    const { result } = await start()
    await vi.advanceTimersByTimeAsync(519)
    expect(card.querySelector('.shape-match-flight')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(card.querySelector('.shape-match-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['token', 'round', 'navigation', 'replacement'])('cancels on %s changes', async change => {
    const { card, source, cancel } = fixture()
    const { result } = await start()
    if (change === 'token') card.dataset.shapeMatchToken = '8'
    else if (change === 'round') card.dataset.shapeMatchRound = '3'
    else if (change === 'navigation') card.remove()
    else source.replaceWith(document.createElement('div'))
    await vi.advanceTimersByTimeAsync(0)
    await result
    expect(source.style.visibility).toBe('')
    expect(card.querySelector('.shape-match-flight')).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases the animation, observer, overlay, and timer when its effect is interrupted', async () => {
    const { card, source, cancel } = fixture()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const fiber = Effect.runFork(moveShapeMatchPiece(2, 7))
    await commit()
    expect(card.querySelector('.shape-match-flight')).not.toBeNull()
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(card.querySelector('.shape-match-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(cancel).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the pending render frame if interrupted before commit', async () => {
    const { animate } = fixture()
    const fiber = Effect.runFork(moveShapeMatchPiece(2, 7))
    await vi.advanceTimersByTimeAsync(0)
    expect(frames.size).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(frames.size).toBe(0)
    expect(animate).not.toHaveBeenCalled()
  })
})

describe('Shape Match replacement delay', () => {
  const startReplacement = async (round = 2, token = 7) => {
    const result = Effect.runPromise(waitShapeMatchReplacement(round, token))
    await commit()
    return { result }
  }

  it('waits for the newly committed card before starting the highlight delay', async () => {
    const result = Effect.runPromise(waitShapeMatchReplacement(2, 7))
    await vi.advanceTimersByTimeAsync(0)
    fixture()
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    expect(observe).not.toHaveBeenCalled()
    await commit()
    expect(observe).toHaveBeenCalledWith(document.documentElement, {
      attributes: true, childList: true, subtree: true,
      attributeFilter: ['data-shape-match-round', 'data-shape-match-token'],
    })
    await vi.advanceTimersByTimeAsync(350)
    await result
  })

  it('keeps the fitted shape visible for 350ms, then releases its only timer and observer', async () => {
    const { source, sourceRect, animate } = fixture()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { result } = await startReplacement()
    let finished = false
    void result.then(() => { finished = true })
    expect(vi.getTimerCount()).toBe(1)
    expect(source.style.visibility).toBe('')
    expect(sourceRect).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(349)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(finished).toBe(true)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes immediately when the game card is missing', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const { result } = await startReplacement()
    await expect(result).resolves.toBeUndefined()
    expect(observe).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['document', 'window'])('finishes safely without %s before requesting a frame', async missing => {
    vi.stubGlobal(missing, undefined)
    await expect(Effect.runPromise(waitShapeMatchReplacement(2, 7))).resolves.toBeUndefined()
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['round', 'token'])('rejects a stale %s before starting a timer', async field => {
    const { card } = fixture()
    card.dataset[field === 'round' ? 'shapeMatchRound' : 'shapeMatchToken'] = '99'
    const { result } = await startReplacement()
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([[-1, 7], [2.5, 7], [2, NaN], [2, -1], [Infinity, 7], [2, Number.MAX_SAFE_INTEGER + 1]])('rejects invalid round/token %s/%s', async (round, token) => {
    fixture()
    await expect(Effect.runPromise(waitShapeMatchReplacement(round, token))).resolves.toBeUndefined()
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes immediately under reduced motion', async () => {
    fixture()
    vi.mocked(window.matchMedia).mockReturnValue(mediaQuery(true))
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const { result } = await startReplacement()
    await result
    expect(observe).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still completes its one delay if mutation observers are unavailable', async () => {
    fixture()
    vi.stubGlobal('MutationObserver', undefined)
    const { result } = await startReplacement()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(350)
    await expect(result).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['token', 'round', 'navigation', 'replacement'])('releases the pending delay after %s changes', async change => {
    const { card } = fixture()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { result } = await startReplacement()
    if (change === 'token') card.dataset.shapeMatchToken = '8'
    else if (change === 'round') card.dataset.shapeMatchRound = '3'
    else if (change === 'navigation') card.remove()
    else card.replaceWith(card.cloneNode(true))
    await vi.advanceTimersByTimeAsync(0)
    await result
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not complete early for unrelated card or document mutations', async () => {
    const { card } = fixture()
    const { result } = await startReplacement()
    let finished = false
    void result.then(() => { finished = true })
    card.append(document.createElement('span'))
    document.body.append(document.createElement('div'))
    await vi.advanceTimersByTimeAsync(0)
    expect(finished).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(350)
    await result
  })

  it('finishes and clears the timer if the observer API throws during setup', async () => {
    fixture()
    vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(() => { throw new Error('observer unavailable') })
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { result } = await startReplacement()
    await expect(result).resolves.toBeUndefined()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('safely completes if the DOM guard throws inside an observer callback', async () => {
    const { card } = fixture()
    const { result } = await startReplacement()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    vi.spyOn(card, 'dataset', 'get').mockImplementationOnce(() => { throw new Error('card unavailable') })
    card.setAttribute('data-shape-match-token', '8')
    await vi.advanceTimersByTimeAsync(0)
    await expect(result).resolves.toBeUndefined()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases both resources if interrupted while waiting', async () => {
    fixture()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const fiber = Effect.runFork(waitShapeMatchReplacement(2, 7))
    await commit()
    expect(vi.getTimerCount()).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a pending commit frame if interrupted before the wait starts', async () => {
    fixture()
    const observe = vi.spyOn(MutationObserver.prototype, 'observe')
    const fiber = Effect.runFork(waitShapeMatchReplacement(2, 7))
    await vi.advanceTimersByTimeAsync(0)
    expect(frames.size).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(frames.size).toBe(0)
    expect(observe).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
