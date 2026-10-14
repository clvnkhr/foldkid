import { Effect, Fiber } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { arrivePicnicBasket, movePicnicFood, waitPicnicRefresh } from './picnicBasketRuntime'

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
  card.className = 'picnic-basket-card'
  card.dataset.picnicRound = '2'
  card.dataset.picnicToken = '7'
  card.dataset.picnicMovingFood = 'banana'
  card.innerHTML = `
    <button class="picnic-basket-food" data-picnic-food="apple"><span class="picnic-basket-food-icon">🍎</span></button>
    <button class="picnic-basket-food" data-picnic-food="banana"><span class="picnic-basket-food-icon" role="img" aria-label="Banana">🍌</span></button>
    <button class="picnic-basket-basket"><span class="picnic-basket-basket-slot" data-picnic-slot="0"></span>
    <span class="picnic-basket-basket-slot" data-picnic-slot="1"></span>
    <span class="picnic-basket-basket-slot" data-picnic-slot="2"></span></button>`
  document.body.append(card)
  const basket = card.querySelector<HTMLElement>('.picnic-basket-basket')!
  card.dataset.picnicStatus = 'complete'
  basket.style.animationName = 'picnic-basket-celebrate'
  basket.style.animationDuration = '1.25s'
  const basketRect = vi.spyOn(basket, 'getBoundingClientRect').mockReturnValue(new DOMRect(180, 300, 300, 220))
  const source = card.querySelector<HTMLElement>('[data-picnic-food="banana"] .picnic-basket-food-icon')!
  Object.assign(source.style, { fontFamily: 'Example Emoji', fontSize: '72px', lineHeight: '80px', fontWeight: '600', fontStyle: 'italic', letterSpacing: '2px' })
  const targets = [...card.querySelectorAll<HTMLElement>('.picnic-basket-basket-slot')]
  const cardRect = vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 500, 550))
  const sourceRect = vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 150, 160, 80))
  const targetRects = targets.map((target, index) => vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(200 + index * 40, 430, 96, 32)))
  let finish!: () => void
  let reject!: (error: Error) => void
  const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail })
  const cancel = vi.fn()
  const animation = { finished, cancel } as unknown as Animation
  const animate = vi.fn((_keyframes: Keyframe[], _options: KeyframeAnimationOptions) => animation)
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate })
  return { card, basket, basketRect, source, targets, cardRect, sourceRect, targetRects, animate, cancel, finish, reject }
}

const startFlight = async (round = 2, token = 7, step = 1) => {
  const result = Effect.runPromise(movePicnicFood(round, token, step))
  await commit()
  return { result }
}
describe('Picnic Basket food flight', () => {
  it('waits for the render commit before finding and measuring the selected food', async () => {
    const result = Effect.runPromise(movePicnicFood(2, 7, 1))
    await vi.advanceTimersByTimeAsync(0)
    const { sourceRect, animate, finish } = fixture()
    expect(sourceRect).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
    await commit()
    expect(sourceRect).toHaveBeenCalledOnce()
    finish()
    await result
  })

  it('flies only the selected emoji with its original font and a uniform scale into the basket', async () => {
    const { card, source, animate, cancel, finish } = fixture()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { result } = await startFlight()
    const flight = card.querySelector<HTMLElement>('.picnic-basket-flight')!
    expect(flight.parentElement).toBe(card)
    expect(flight.textContent).toBe('🍌')
    expect(flight.getAttribute('aria-hidden')).toBe('true')
    expect(flight.hasAttribute('aria-label')).toBe(false)
    expect(flight.hasAttribute('role')).toBe(false)
    for (const [property, value] of Object.entries({
      position: 'absolute', 'pointer-events': 'none', left: '20px', top: '50px', width: '160px', height: '80px',
      'font-family': window.getComputedStyle(source).fontFamily, 'font-size': '72px', 'font-weight': '600', 'font-style': 'italic', 'line-height': '80px', 'letter-spacing': '2px',
    })) expect(flight.style.getPropertyValue(property)).toBe(value)
    expect(source.style.visibility).toBe('hidden')
    expect(animate).toHaveBeenCalledWith([
      { transform: 'translate(0px, 0px) scale(1)' }, { transform: 'translate(88px, 256px) scale(0.4)' },
    ], { duration: 320, easing: 'cubic-bezier(.22, .8, .3, 1)', fill: 'both' })
    finish()
    await result
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(cancel).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([0, 1, 2])('targets basket slot %s independently of DOM order', async step => {
    const { card, targetRects, animate, finish } = fixture()
    card.append(card.querySelector('[data-picnic-slot="0"]')!)
    const { result } = await startFlight(2, 7, step)
    targetRects.forEach((rect, index) => { expect(rect.mock.calls.length).toBe(index === step ? 1 : 0) })
    expect(animate.mock.calls[0]?.[0].at(-1)?.transform).toBe(`translate(${48 + step * 40}px, 256px) scale(0.4)`)
    finish()
    await result
  })

  it('restores the original source visibility and priority', async () => {
    const { source, finish } = fixture()
    source.style.setProperty('visibility', 'collapse', 'important')
    const { result } = await startFlight()
    finish()
    await result
    expect(source.style.getPropertyValue('visibility')).toBe('collapse')
    expect(source.style.getPropertyPriority('visibility')).toBe('important')
  })

  it('finishes safely without the game card', async () => {
    const { result } = await startFlight()
    await expect(result).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['document', 'window'])('finishes without %s before requesting a render frame', async missing => {
    vi.stubGlobal(missing, undefined)
    await expect(Effect.runPromise(movePicnicFood(2, 7, 1))).resolves.toBeUndefined()
    expect(frames.size).toBe(0)
  })

  it.each(['round', 'token'])('ignores stale %s values without changing the scene', async field => {
    const { card, source, animate } = fixture()
    card.dataset[field === 'round' ? 'picnicRound' : 'picnicToken'] = '99'
    const { result } = await startFlight()
    await result
    expect(animate).not.toHaveBeenCalled()
    expect(source.style.visibility).toBe('')
  })

  it.each([[-1, 7, 1], [2.5, 7, 1], [2, NaN, 1], [2, -1, 1], [2, 7, -1], [2, 7, .5], [2, 7, 3]])(
    'ignores invalid round/token/step %s/%s/%s', async (round, token, step) => {
      const { animate } = fixture()
      await Effect.runPromise(movePicnicFood(round, token, step))
      expect(animate).not.toHaveBeenCalled()
      expect(frames.size).toBe(0)
    },
  )

  it('finishes without motion under reduced motion', async () => {
    const { sourceRect, animate } = fixture()
    vi.mocked(window.matchMedia).mockReturnValue(mediaQuery(true))
    const { result } = await startFlight()
    await result
    expect(sourceRect).not.toHaveBeenCalled()
    expect(animate).not.toHaveBeenCalled()
  })

  it.each(['food id', 'source', 'target'])('finishes when the %s is missing', async missing => {
    const { card, source, targets, animate } = fixture()
    if (missing === 'food id') card.dataset.picnicMovingFood = 'unknown'
    else if (missing === 'source') source.remove()
    else targets[1]!.remove()
    const { result } = await startFlight()
    await result
    expect(animate).not.toHaveBeenCalled()
  })

  it.each(['zero', 'nonfinite'])('finishes with %s geometry', async kind => {
    const { sourceRect, animate } = fixture()
    sourceRect.mockReturnValue(new DOMRect(120, 150, kind === 'zero' ? 0 : Infinity, 80))
    const { result } = await startFlight()
    await result
    expect(animate).not.toHaveBeenCalled()
  })

  it('leaves source visibility intact when the animation API is unavailable', async () => {
    const { source, card } = fixture()
    source.style.visibility = 'hidden'
    Reflect.deleteProperty(Element.prototype, 'animate')
    const { result } = await startFlight()
    await result
    expect(source.style.visibility).toBe('hidden')
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
  })

  it('cleans up if starting the animation throws', async () => {
    const { source, card, animate } = fixture()
    animate.mockImplementation(() => { throw new Error('animation unavailable') })
    const { result } = await startFlight()
    await result
    expect(source.style.visibility).toBe('')
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up a rejected animation and still completes', async () => {
    const { source, card, reject, cancel } = fixture()
    const { result } = await startFlight()
    reject(new Error('animation cancelled'))
    await expect(result).resolves.toBeUndefined()
    expect(source.style.visibility).toBe('')
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('finishes without altering the source if measuring its font fails', async () => {
    const { card, source, animate } = fixture()
    vi.spyOn(window, 'getComputedStyle').mockImplementationOnce(() => { throw new Error('style unavailable') })
    const { result } = await startFlight()
    await result
    expect(source.style.visibility).toBe('')
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('releases every started flight resource if setting up its observer fails', async () => {
    const { card, source, cancel } = fixture()
    vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(() => { throw new Error('observer unavailable') })
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { result } = await startFlight()
    await result
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(cancel).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still removes the overlay and restores the source if cancelling an animation throws', async () => {
    const { card, source, cancel, finish } = fixture()
    cancel.mockImplementation(() => { throw new Error('animation cancellation unavailable') })
    const { result } = await startFlight()
    finish()
    await expect(result).resolves.toBeUndefined()
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes by 420ms when the animation never settles', async () => {
    const { card, source, cancel } = fixture()
    const { result } = await startFlight()
    await vi.advanceTimersByTimeAsync(419)
    expect(card.querySelector('.picnic-basket-flight')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['token', 'round', 'food', 'navigation', 'source', 'target'])('cancels on %s changes', async change => {
    const { card, source, targets, cancel } = fixture()
    const { result } = await startFlight()
    if (change === 'token') card.dataset.picnicToken = '8'
    else if (change === 'round') card.dataset.picnicRound = '3'
    else if (change === 'food') card.dataset.picnicMovingFood = 'apple'
    else if (change === 'navigation') card.remove()
    else if (change === 'source') source.replaceWith(document.createElement('span'))
    else targets[1]!.remove()
    await vi.advanceTimersByTimeAsync(0)
    await result
    expect(source.style.visibility).toBe('')
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans all flight resources when interrupted', async () => {
    const { card, source, cancel } = fixture()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const fiber = Effect.runFork(movePicnicFood(2, 7, 1))
    await commit()
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(card.querySelector('.picnic-basket-flight')).toBeNull()
    expect(source.style.visibility).toBe('')
    expect(cancel).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the pending render frame if interrupted before flight', async () => {
    const { animate } = fixture()
    const fiber = Effect.runFork(movePicnicFood(2, 7, 1))
    await vi.advanceTimersByTimeAsync(0)
    expect(frames.size).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(frames.size).toBe(0)
    expect(animate).not.toHaveBeenCalled()
  })
})

const phases = [
  { phase: 'complete', effect: waitPicnicRefresh, animationName: 'picnic-basket-celebrate', duration: '1.25s', fallback: 1330 },
  { phase: 'arriving', effect: arrivePicnicBasket, animationName: 'picnic-basket-arrive', duration: '.45s', fallback: 530 },
] as const

const animationEvent = (name: string, type = 'animationend'): Event => {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: name })
  return event
}

describe.each(phases)('Picnic Basket $phase animation', config => {
  const prepare = () => {
    const scene = fixture()
    scene.card.dataset.picnicStatus = config.phase
    scene.basket.style.animationName = config.animationName
    scene.basket.style.animationDuration = config.duration
    return scene
  }
  const start = async (round = 2, token = 7) => {
    const result = Effect.runPromise(config.effect(round, token))
    await commit()
    return { result }
  }
  const finishAnimation = (basket: HTMLElement) => basket.dispatchEvent(animationEvent(config.animationName))
  const expectNoOverlay = (card: HTMLElement) => expect(card.querySelector('.picnic-basket-celebration')).toBeNull()

  it('waits for the render commit and the native basket animation to finish', async () => {
    const result = Effect.runPromise(config.effect(2, 7))
    await vi.advanceTimersByTimeAsync(0)
    const { card, basket, animate, cancel } = prepare()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    expect(vi.getTimerCount()).toBe(0)
    expect(animate).not.toHaveBeenCalled()
    await commit()
    expect(vi.getTimerCount()).toBe(1)
    if (config.phase === 'complete') {
      const overlay = card.querySelector<HTMLElement>('.picnic-basket-celebration')!
      expect(overlay.parentElement).toBe(card)
      expect(overlay.getAttribute('aria-hidden')).toBe('true')
      expect(overlay.style.pointerEvents).toBe('none')
      expect(overlay.style.left).toBe('230px')
      expect(overlay.style.top).toBe('310px')
      expect(overlay.textContent).toBe('')
      expect(overlay.querySelectorAll('.picnic-basket-confetti')).toHaveLength(20)
      expect(overlay.querySelectorAll('.picnic-basket-confetti--star')).toHaveLength(5)
      expect(overlay.querySelector('.picnic-basket-glow')).not.toBeNull()
      expect(animate).toHaveBeenCalledTimes(21)
      const trajectories = animate.mock.calls.slice(1).map(([frames]) => frames.at(-1)?.transform)
      expect(new Set(trajectories).size).toBe(20)
      animate.mock.calls.slice(1).forEach(([, options]) => {
        expect(options.duration).toBeGreaterThanOrEqual(760)
        expect(options.duration).toBeLessThan(1060)
        expect(options.fill).toBe('both')
      })
    } else {
      expectNoOverlay(card)
      expect(animate).not.toHaveBeenCalled()
    }
    finishAnimation(basket)
    await result
    expectNoOverlay(card)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledTimes(config.phase === 'complete' ? 21 : 0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores events from child animations or other CSS animation names', async () => {
    const { basket, targets, card } = prepare()
    const { result } = await start()
    let finished = false
    void result.then(() => { finished = true })
    targets[0]!.dispatchEvent(animationEvent(config.animationName))
    basket.dispatchEvent(animationEvent('unrelated-animation'))
    await vi.advanceTimersByTimeAsync(0)
    expect(finished).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
    finishAnimation(basket)
    await result
    expectNoOverlay(card)
  })

  it('releases the phase when its CSS animation is cancelled', async () => {
    const { basket, card } = prepare()
    const { result } = await start()
    basket.dispatchEvent(animationEvent(config.animationName, 'animationcancel'))
    await result
    expectNoOverlay(card)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('has a bounded fallback if the browser never sends an animation event', async () => {
    const { card } = prepare()
    const { result } = await start()
    let finished = false
    void result.then(() => { finished = true })
    await vi.advanceTimersByTimeAsync(config.fallback - 1)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await result
    expectNoOverlay(card)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['card', 'basket'])('finishes safely without the %s', async missing => {
    const { card, basket } = prepare()
    if (missing === 'card') card.remove()
    else basket.remove()
    const { result } = await start()
    await expect(result).resolves.toBeUndefined()
    expectNoOverlay(card)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['document', 'window'])('finishes without %s before requesting a frame', async missing => {
    vi.stubGlobal(missing, undefined)
    await expect(Effect.runPromise(config.effect(2, 7))).resolves.toBeUndefined()
    expect(frames.size).toBe(0)
  })

  it.each(['round', 'token', 'status'])('ignores a stale %s before starting its effects', async field => {
    const { card, animate } = prepare()
    if (field === 'status') card.dataset.picnicStatus = 'packing'
    else card.dataset[field === 'round' ? 'picnicRound' : 'picnicToken'] = '99'
    const { result } = await start()
    await result
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([[-1, 7], [2.5, 7], [2, NaN], [2, -1], [Infinity, 7]])('ignores invalid round/token %s/%s', async (round, token) => {
    prepare()
    await Effect.runPromise(config.effect(round, token))
    expect(frames.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('finishes immediately under reduced motion', async () => {
    const { card, animate, basketRect } = prepare()
    vi.mocked(window.matchMedia).mockReturnValue(mediaQuery(true))
    const { result } = await start()
    await result
    expect(animate).not.toHaveBeenCalled()
    expect(basketRect).not.toHaveBeenCalled()
    expectNoOverlay(card)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['name', 'duration'])('finishes immediately when CSS animation %s is absent', async missing => {
    const { basket, animate } = prepare()
    if (missing === 'name') basket.style.animationName = 'none'
    else basket.style.animationDuration = '0s'
    const { result } = await start()
    await result
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the CSS basket movement when the particle animation API is unavailable', async () => {
    const { card, basket } = prepare()
    Reflect.deleteProperty(Element.prototype, 'animate')
    const { result } = await start()
    expect(vi.getTimerCount()).toBe(1)
    expectNoOverlay(card)
    finishAnimation(basket)
    await result
  })

  it('completes normally when mutation observers are unavailable', async () => {
    const { basket } = prepare()
    vi.stubGlobal('MutationObserver', undefined)
    const { result } = await start()
    finishAnimation(basket)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['token', 'round', 'status', 'navigation', 'card replacement', 'basket replacement'])('cleans resources after %s changes', async change => {
    const { card, basket, cancel } = prepare()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const { result } = await start()
    if (change === 'token') card.dataset.picnicToken = '8'
    else if (change === 'round') card.dataset.picnicRound = '3'
    else if (change === 'status') card.dataset.picnicStatus = 'packing'
    else if (change === 'navigation') card.remove()
    else if (change === 'card replacement') card.replaceWith(card.cloneNode(true))
    else basket.replaceWith(basket.cloneNode(true))
    await vi.advanceTimersByTimeAsync(0)
    await result
    expectNoOverlay(card)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledTimes(config.phase === 'complete' ? 21 : 0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores unrelated DOM mutations during the animation', async () => {
    const { card, basket } = prepare()
    const { result } = await start()
    let finished = false
    void result.then(() => { finished = true })
    card.append(document.createElement('span'))
    await vi.advanceTimersByTimeAsync(0)
    expect(finished).toBe(false)
    finishAnimation(basket)
    await result
  })

  it('finishes without leaking resources when reading computed styles throws', async () => {
    const { card, animate } = prepare()
    vi.spyOn(window, 'getComputedStyle').mockImplementationOnce(() => { throw new Error('style unavailable') })
    const { result } = await start()
    await result
    expectNoOverlay(card)
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans every resource when setting up an observer throws', async () => {
    const { card, basket } = prepare()
    vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(() => { throw new Error('observer unavailable') })
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const remove = vi.spyOn(basket, 'removeEventListener')
    const { result } = await start()
    await result
    expect(disconnect).toHaveBeenCalledOnce()
    expect(remove.mock.calls.map(([name]) => name)).toContain('animationend')
    expect(remove.mock.calls.map(([name]) => name)).toContain('animationcancel')
    expectNoOverlay(card)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans listeners, particles, and its timer when interrupted', async () => {
    const { card, basket, cancel } = prepare()
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const remove = vi.spyOn(basket, 'removeEventListener')
    const fiber = Effect.runFork(config.effect(2, 7))
    await commit()
    expect(vi.getTimerCount()).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(disconnect).toHaveBeenCalledOnce()
    expect(remove.mock.calls.map(([name]) => name)).toContain('animationend')
    expect(remove.mock.calls.map(([name]) => name)).toContain('animationcancel')
    expect(cancel).toHaveBeenCalledTimes(config.phase === 'complete' ? 21 : 0)
    expectNoOverlay(card)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a pending render frame when interrupted before the animation', async () => {
    const { animate } = prepare()
    const fiber = Effect.runFork(config.effect(2, 7))
    await vi.advanceTimersByTimeAsync(0)
    expect(frames.size).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(frames.size).toBe(0)
    expect(animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Picnic Basket celebration particles', () => {
  it.each(['zero', 'nonfinite'])('keeps the basket phase but skips particles with %s geometry', async kind => {
    const { card, basket, basketRect, animate } = fixture()
    basketRect.mockReturnValue(new DOMRect(180, 300, kind === 'zero' ? 0 : Infinity, 220))
    const result = Effect.runPromise(waitPicnicRefresh(2, 7))
    await commit()
    expect(animate).not.toHaveBeenCalled()
    expect(card.querySelector('.picnic-basket-celebration')).toBeNull()
    basket.dispatchEvent(animationEvent('picnic-basket-celebrate'))
    await result
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans earlier particles if an animation cannot start', async () => {
    const { card, animate, cancel } = fixture()
    animate.mockImplementationOnce(() => ({ cancel } as unknown as Animation))
      .mockImplementationOnce(() => { throw new Error('particle animation unavailable') })
    const result = Effect.runPromise(waitPicnicRefresh(2, 7))
    await commit()
    await result
    expect(card.querySelector('.picnic-basket-celebration')).toBeNull()
    expect(cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('still releases every particle when cancelling animations throws', async () => {
    const { card, basket, cancel } = fixture()
    cancel.mockImplementation(() => { throw new Error('animation cancellation unavailable') })
    const result = Effect.runPromise(waitPicnicRefresh(2, 7))
    await commit()
    basket.dispatchEvent(animationEvent('picnic-basket-celebrate'))
    await expect(result).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledTimes(21)
    expect(card.querySelector('.picnic-basket-celebration')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
