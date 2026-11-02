import { Effect, Stream } from 'effect'

const availableServiceWorker = (win: Window): ServiceWorkerContainer | undefined => {
  try { return win.navigator.serviceWorker } catch { return undefined }
}

/** Registration and reconnect listeners belong to the persistent app mount. */
export const startOfflinePreload = (element: Element, enabled = import.meta.env.PROD): (() => void) => {
  const doc = element.ownerDocument
  const win = doc.defaultView
  if (!enabled || !win) return () => {}

  const workers = availableServiceWorker(win)
  if (!workers) return () => {}
  let stopped = false
  let registering = false
  let registration: ServiceWorkerRegistration | undefined
  const preload = (): void => {
    if (stopped) return
    for (const worker of new Set([registration?.active, registration?.waiting])) {
      try { worker?.postMessage({ type: 'FOLDKID_PRELOAD' }) } catch { /* A replaced worker can no longer receive messages. */ }
    }
  }
  const register = async (): Promise<void> => {
    if (stopped || registering) return
    registering = true
    try {
      const result = await workers.register(`${import.meta.env.BASE_URL}offline-worker.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      if (stopped) return
      registration = result
      preload()
      // The first install may still be loading the deck when register resolves.
      void workers.ready.then(preload, () => {})
    } catch { /* Offline first visits and blocked storage must not prevent play. */ }
    finally { registering = false }
  }
  const retry = (): void => {
    if (stopped) return
    if (!registration) { void register(); return }
    preload()
    // An interrupted install may have no active worker to receive the message.
    try { void registration.update().catch(() => {}) } catch { /* A later visit can retry registration. */ }
  }
  const foreground = (): void => { if (!doc.hidden) retry() }
  win.addEventListener('online', retry)
  doc.addEventListener('visibilitychange', foreground)
  workers.addEventListener('controllerchange', preload)
  void register()
  return () => {
    stopped = true
    win.removeEventListener('online', retry)
    doc.removeEventListener('visibilitychange', foreground)
    workers.removeEventListener('controllerchange', preload)
  }
}

export const mountOfflineAssets = (element: Element): Stream.Stream<never> => Stream.callback(() => Effect.gen(function* () {
  yield* Effect.acquireRelease(Effect.sync(() => startOfflinePreload(element)), cleanup => Effect.sync(cleanup))
  return yield* Effect.never
}))
