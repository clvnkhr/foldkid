import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMusicBoxWakeMonitor } from './musicboxWakeMonitor'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('musicboxWakeMonitor', () => {
  it('starts once and removes its listener and interval on reset', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const intervalId = 123 as unknown as ReturnType<typeof window.setInterval>
    const setIntervalSpy = vi.spyOn(window, 'setInterval').mockReturnValue(intervalId)
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    const monitor = createMusicBoxWakeMonitor({
      getWindow: () => window,
      resetGraph: vi.fn(),
      now: () => 0,
    })

    monitor.start()
    monitor.start()
    monitor.reset()

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(addSpy.mock.calls.filter(([type]) => type === 'pageshow')).toHaveLength(1)
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId)
    const pageshowListener = addSpy.mock.calls.find(([type]) => type === 'pageshow')?.[1]
    expect(removeSpy).toHaveBeenCalledWith('pageshow', pageshowListener)
  })

  it('resets the graph on persisted pageshow', () => {
    const resetGraph = vi.fn()
    const monitor = createMusicBoxWakeMonitor({
      getWindow: () => window,
      resetGraph,
      now: () => 0,
    })

    monitor.start()
    const pageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(pageShow, 'persisted', { value: true })
    window.dispatchEvent(pageShow)
    monitor.reset()

    expect(resetGraph).toHaveBeenCalledTimes(1)
  })

  it('resets the graph after a large time jump', () => {
    let tick: TimerHandler | undefined
    let now = 0
    const resetGraph = vi.fn()
    const intervalId = 123 as unknown as ReturnType<typeof window.setInterval>
    vi.spyOn(window, 'setInterval').mockImplementation((handler: TimerHandler): ReturnType<typeof window.setInterval> => {
      tick = handler
      return intervalId
    })
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    const monitor = createMusicBoxWakeMonitor({
      getWindow: () => window,
      resetGraph,
      now: () => now,
    })

    monitor.start()
    now = 5_001
    if (typeof tick === 'function') tick()
    now = 20_002
    if (typeof tick === 'function') tick()
    monitor.reset()

    expect(resetGraph).toHaveBeenCalledTimes(1)
  })
})
