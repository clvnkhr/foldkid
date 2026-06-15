type IntervalId = number | ReturnType<typeof globalThis.setInterval>

let wakeMonitor: { onPageShow: (e: PageTransitionEvent) => void; intervalId: IntervalId } | undefined

export const startWakeMonitor = (resetAudioGraph: () => void): void => {
  if (typeof window === 'undefined' || wakeMonitor) return

  // Recreate AudioContext after sleep/wake. Safari's context can become a zombie
  // or get interrupted, so the next user gesture should create a fresh graph.
  const recreateCtx = resetAudioGraph
  // pageshow with persisted=true fires on bfcache restore (includes wake)
  const onPageShow = (e: PageTransitionEvent): void => {
    if (e.persisted) recreateCtx()
  }

  // Time-jump polling: catches ALL sleep/wake scenarios including Power Nap
  // and external display wake where visibilitychange may not fire.
  let lastWakeCheck = Date.now()
  const intervalId = window.setInterval(() => {
    const now = Date.now()
    if (now - lastWakeCheck > 15_000) recreateCtx()
    lastWakeCheck = now
  }, 5_000)

  window.addEventListener('pageshow', onPageShow)
  wakeMonitor = { onPageShow, intervalId }
}

export const resetWakeMonitor = (): void => {
  if (typeof window === 'undefined' || !wakeMonitor) return
  window.removeEventListener('pageshow', wakeMonitor.onPageShow)
  window.clearInterval(wakeMonitor.intervalId)
  wakeMonitor = undefined
}
