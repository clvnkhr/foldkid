type IntervalId = number

export interface MusicBoxWakeMonitor {
  readonly start: () => void
  readonly reset: () => void
}

export interface MusicBoxWakeMonitorDeps {
  readonly getWindow: () => Window | undefined
  readonly resetGraph: () => void
  readonly now: () => number
}

export const createMusicBoxWakeMonitor = (deps: MusicBoxWakeMonitorDeps): MusicBoxWakeMonitor => {
  let wakeMonitor: { onPageShow: (e: PageTransitionEvent) => void; intervalId: IntervalId } | undefined

  const start = (): void => {
    const currentWindow = deps.getWindow()
    if (!currentWindow || wakeMonitor) return

    // Recreate AudioContext after sleep/wake. Safari's context can become a zombie
    // or get interrupted, so the next user gesture should create a fresh graph.
    const recreateCtx = deps.resetGraph
    // pageshow with persisted=true fires on bfcache restore (includes wake)
    const onPageShow = (e: PageTransitionEvent): void => {
      if (e.persisted) recreateCtx()
    }

    // Time-jump polling: catches ALL sleep/wake scenarios including Power Nap
    // and external display wake where visibilitychange may not fire.
    let lastWakeCheck = deps.now()
    const intervalId = currentWindow.setInterval(() => {
      const now = deps.now()
      if (now - lastWakeCheck > 15_000) recreateCtx()
      lastWakeCheck = now
    }, 5_000)

    currentWindow.addEventListener('pageshow', onPageShow)
    wakeMonitor = { onPageShow, intervalId }
  }

  const reset = (): void => {
    const currentWindow = deps.getWindow()
    if (!currentWindow || !wakeMonitor) return
    currentWindow.removeEventListener('pageshow', wakeMonitor.onPageShow)
    currentWindow.clearInterval(wakeMonitor.intervalId)
    wakeMonitor = undefined
  }

  return { start, reset }
}
