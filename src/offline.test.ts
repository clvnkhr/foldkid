import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountOfflineAssets, startOfflinePreload } from './offline'

const initialWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const cleanups: (() => void)[] = []
const deferred = <A>() => {
  let resolve!: (value: A) => void
  const promise = new Promise<A>(done => { resolve = done })
  return { promise, resolve }
}
const setup = () => {
  const active = { postMessage: vi.fn() }
  const registration = { active, waiting: null, installing: null, update: vi.fn().mockResolvedValue(undefined) }
  const ready = deferred<unknown>()
  const workers = Object.assign(new EventTarget(), {
    register: vi.fn().mockResolvedValue(registration), ready: ready.promise,
  })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: workers })
  return { workers, active, registration, ready }
}
const start = () => {
  const stop = startOfflinePreload(document.body, true)
  cleanups.push(stop)
  return stop
}

afterEach(() => {
  cleanups.splice(0).forEach(stop => stop())
  if (initialWorker) Object.defineProperty(navigator, 'serviceWorker', initialWorker)
  else Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.restoreAllMocks()
})

describe('app-wide offline preload lifecycle', () => {
  it('registers under the app base and starts preloading without waiting for installation', async () => {
    const { workers, active, ready } = setup()
    start()
    expect(workers.register).toHaveBeenCalledExactlyOnceWith(`${import.meta.env.BASE_URL}offline-worker.js`, {
      scope: import.meta.env.BASE_URL, updateViaCache: 'none',
    })
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'FOLDKID_PRELOAD' }))
    ready.resolve(undefined)
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalledTimes(2))
  })

  it('retries after an offline first visit, and resumes missing assets on reconnect and foreground', async () => {
    const { workers, active, registration } = setup()
    workers.register.mockRejectedValueOnce(new Error('offline'))
    start()
    await vi.waitFor(() => expect(workers.register).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalledTimes(1))
    expect(workers.register).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new Event('online'))
    expect(active.postMessage).toHaveBeenCalledTimes(2)
    expect(registration.active).toBe(active)
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(active.postMessage).toHaveBeenCalledTimes(3)
    workers.dispatchEvent(new Event('controllerchange'))
    expect(active.postMessage).toHaveBeenCalledTimes(4)
    expect(workers.register).toHaveBeenCalledTimes(2)
  })

  it('does not register a second time while the first registration is pending', async () => {
    const { workers, active, registration } = setup()
    const pending = deferred<typeof registration>()
    workers.register.mockReturnValue(pending.promise)
    start()
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(workers.register).toHaveBeenCalledTimes(1)
    pending.resolve(registration)
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalledTimes(1))
  })

  it('retries an interrupted worker installation even when there is no active worker yet', async () => {
    const { workers, registration } = setup()
    workers.register.mockResolvedValue({ ...registration, active: null })
    start()
    await vi.waitFor(() => expect(workers.register).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    window.dispatchEvent(new Event('online'))
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('removes listeners and ignores registration or readiness that resolves after unmount', async () => {
    const { workers, active, registration, ready } = setup()
    const pending = deferred<typeof registration>()
    workers.register.mockReturnValue(pending.promise)
    const stop = start()
    stop()
    pending.resolve(registration)
    ready.resolve(undefined)
    await Promise.resolve()
    window.dispatchEvent(new Event('online'))
    workers.dispatchEvent(new Event('controllerchange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(active.postMessage).not.toHaveBeenCalled()
    expect(workers.register).toHaveBeenCalledTimes(1)
  })

  it('also removes reconnect listeners after a successful registration', async () => {
    const { workers, active, ready } = setup()
    const stop = start()
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalledTimes(1))
    stop()
    ready.resolve(undefined)
    await Promise.resolve()
    window.dispatchEvent(new Event('online'))
    workers.dispatchEvent(new Event('controllerchange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(active.postMessage).toHaveBeenCalledTimes(1)
  })

  it('silently tolerates a worker being replaced while it receives the preload request', async () => {
    const { active } = setup()
    active.postMessage.mockImplementation(() => { throw new Error('redundant worker') })
    start()
    await vi.waitFor(() => expect(active.postMessage).toHaveBeenCalledTimes(1))
    expect(() => window.dispatchEvent(new Event('online'))).not.toThrow()
  })

  it('does not cache Vite development files or require service-worker support', () => {
    const { workers } = setup()
    startOfflinePreload(document.body, false)()
    expect(workers.register).not.toHaveBeenCalled()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    expect(() => startOfflinePreload(document.body, true)()).not.toThrow()
  })

  it('keeps startup usable when the service-worker getter is blocked by browser privacy settings', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      get: () => { throw new DOMException('Storage blocked', 'SecurityError') },
    })
    expect(() => startOfflinePreload(document.body, true)()).not.toThrow()
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
    expect(() => startOfflinePreload(document.body, true)()).not.toThrow()
  })

  it('keeps startup importable and releases the mount stream on interruption', async () => {
    const { workers } = setup()
    const fiber = Effect.runFork(Stream.runDrain(mountOfflineAssets(document.body)))
    try { expect(workers.register).not.toHaveBeenCalled() }
    finally { await Effect.runPromise(Fiber.interrupt(fiber)) }
  })
})
