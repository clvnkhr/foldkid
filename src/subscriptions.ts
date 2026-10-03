import { Effect, Queue, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { SettingsDragStarted, SettingsDragMoved, SettingsDragEnded } from './message'
import type { Model, Message } from './main'

export const subscriptions = Subscription.make<Model, Message>()(() => ({}))

export const settingsResizeStream = (element: Element): Stream.Stream<Message> =>
  Stream.callback<Message>(queue => Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const handle = element as HTMLElement
        const doc = handle.ownerDocument
        let pointerId: number | null = null
        let lastX = 0
        const down = (event: PointerEvent): void => {
          if (event.button !== 0 || pointerId !== null || !Number.isSafeInteger(event.pointerId) || event.pointerId < 0 || !Number.isFinite(event.screenX)) return
          pointerId = event.pointerId
          lastX = event.screenX
          event.preventDefault()
          try { handle.setPointerCapture?.(pointerId) } catch { /* document listeners cover missing capture */ }
          Queue.offerUnsafe(queue, SettingsDragStarted({ screenX: event.screenX }))
        }
        const move = (event: PointerEvent): void => {
          if (event.pointerId !== pointerId || !Number.isFinite(event.screenX) || event.screenX === lastX) return
          lastX = event.screenX
          Queue.offerUnsafe(queue, SettingsDragMoved({ screenX: event.screenX }))
        }
        const release = (): void => {
          const id = pointerId
          pointerId = null
          if (id === null) return
          try { if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id) } catch { /* already released */ }
        }
        const end = (event: PointerEvent): void => {
          if (event.pointerId !== pointerId) return
          if (event.type === 'pointerup') move(event)
          release()
          Queue.offerUnsafe(queue, SettingsDragEnded())
        }
        const blur = (): void => {
          if (pointerId === null) return
          release()
          Queue.offerUnsafe(queue, SettingsDragEnded())
        }
        const visibility = (): void => { if (doc.hidden) blur() }
        const panel = handle.closest<HTMLElement>('.settings-panel')
        const panelObserver = panel ? new MutationObserver(() => {
          if (panel.hidden || panel.style.display === 'none') blur()
        }) : null
        if (panel) panelObserver?.observe(panel, { attributes: true, attributeFilter: ['style', 'hidden'] })
        handle.addEventListener('pointerdown', down)
        handle.addEventListener('lostpointercapture', end)
        doc.addEventListener('pointermove', move, true)
        doc.addEventListener('pointerup', end, true)
        doc.addEventListener('pointercancel', end, true)
        doc.addEventListener('visibilitychange', visibility)
        doc.defaultView?.addEventListener('blur', blur)
        return () => {
          handle.removeEventListener('pointerdown', down)
          handle.removeEventListener('lostpointercapture', end)
          doc.removeEventListener('pointermove', move, true)
          doc.removeEventListener('pointerup', end, true)
          doc.removeEventListener('pointercancel', end, true)
          doc.removeEventListener('visibilitychange', visibility)
          panelObserver?.disconnect()
          doc.defaultView?.removeEventListener('blur', blur)
          release()
        }
      }),
      cleanup => Effect.sync(cleanup),
    )
    return yield* Effect.never
  }))
