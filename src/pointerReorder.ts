import { Effect, Queue, Stream } from 'effect'
import type { MountAction } from 'foldkit/mount'

type PointerReorderOptions<Message> = Readonly<{
  name: string
  itemSelector: string
  handleSelector: string
  start: (index: number) => Message
  drop: (index: number) => Message
  end: () => Message
}>

const dragIndexFrom = (element: Element | null, itemSelector: string): number | null => {
  const item = element?.closest(itemSelector)
  const value = item?.getAttribute('data-drag-index')
  if (value === undefined || value === null || value.trim() === '') return null
  const index = Number(value)
  return Number.isSafeInteger(index) && index >= 0 ? index : null
}

export const pointerReorder = <Message>(
  options: PointerReorderOptions<Message>,
): MountAction<Message> => ({
    name: options.name,
    f: (element) => Stream.callback<Message>(queue =>
      Effect.gen(function* () {
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const root = element as HTMLElement
            const doc = root.ownerDocument
            const activePointers = new Set<number>()

            const onPointerDown = (event: PointerEvent): void => {
              if (event.button !== 0 || activePointers.size > 0 || !Number.isSafeInteger(event.pointerId) || event.pointerId < 0 || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
              if (!(event.target instanceof Element)) return
              const handle = event.target.closest(options.handleSelector)
              if (!handle || !root.contains(handle)) return
              const index = dragIndexFrom(handle, options.itemSelector)
              if (index === null) return

              event.preventDefault()
              event.stopPropagation()
              activePointers.add(event.pointerId)
              try { root.setPointerCapture?.(event.pointerId) } catch { /* document listeners cover missing capture */ }
              Queue.offerUnsafe(queue, options.start(index))
            }

            const endPointer = (event: PointerEvent, shouldDrop: boolean): void => {
              if (!activePointers.has(event.pointerId)) return

              event.preventDefault()
              event.stopPropagation()
              activePointers.delete(event.pointerId)
              try { root.releasePointerCapture?.(event.pointerId) } catch { /* already released */ }

              if (shouldDrop && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
                const target = doc.elementFromPoint(event.clientX, event.clientY)
                const dropIndex = root.contains(target) ? dragIndexFrom(target, options.itemSelector) : null
                if (dropIndex !== null) {
                  Queue.offerUnsafe(queue, options.drop(dropIndex))
                  return
                }
              }

              Queue.offerUnsafe(queue, options.end())
            }

            const onPointerUp = (event: PointerEvent): void => endPointer(event, true)
            const onPointerCancel = (event: PointerEvent): void => endPointer(event, false)
            const cancel = (): void => {
              if (activePointers.size === 0) return
              const ids = [...activePointers]
              activePointers.clear()
              for (const id of ids) {
                try { root.releasePointerCapture?.(id) } catch { /* already released */ }
              }
              Queue.offerUnsafe(queue, options.end())
            }
            const visibility = (): void => { if (doc.hidden) cancel() }
            const panel = root.closest<HTMLElement>('.settings-panel')
            const panelObserver = panel ? new MutationObserver(() => {
              if (panel.hidden || panel.style.display === 'none') cancel()
            }) : null
            if (panel) panelObserver?.observe(panel, { attributes: true, attributeFilter: ['style', 'hidden'] })
            const onClick = (event: MouseEvent): void => {
              if (!(event.target instanceof Element)) return
              const handle = event.target.closest(options.handleSelector)
              if (!handle || !root.contains(handle)) return
              event.preventDefault()
              event.stopPropagation()
            }

            root.addEventListener('pointerdown', onPointerDown)
            root.addEventListener('pointerup', onPointerUp)
            root.addEventListener('pointercancel', onPointerCancel)
            root.addEventListener('lostpointercapture', onPointerCancel)
            doc.addEventListener('pointerup', onPointerUp, true)
            doc.addEventListener('pointercancel', onPointerCancel, true)
            doc.addEventListener('visibilitychange', visibility)
            doc.defaultView?.addEventListener('blur', cancel)
            root.addEventListener('click', onClick, true)

            return { root, doc, activePointers, onPointerDown, onPointerUp, onPointerCancel, onClick, cancel, visibility, panelObserver }
          }),
          ({ root, doc, activePointers, onPointerDown, onPointerUp, onPointerCancel, onClick, cancel, visibility, panelObserver }) => Effect.sync(() => {
            root.removeEventListener('pointerdown', onPointerDown)
            root.removeEventListener('pointerup', onPointerUp)
            root.removeEventListener('pointercancel', onPointerCancel)
            root.removeEventListener('lostpointercapture', onPointerCancel)
            doc.removeEventListener('pointerup', onPointerUp, true)
            doc.removeEventListener('pointercancel', onPointerCancel, true)
            doc.removeEventListener('visibilitychange', visibility)
            panelObserver?.disconnect()
            doc.defaultView?.removeEventListener('blur', cancel)
            root.removeEventListener('click', onClick, true)
            for (const id of activePointers) {
              try { root.releasePointerCapture?.(id) } catch { /* already released */ }
            }
            activePointers.clear()
          }),
        )

        return yield* Effect.never
      }),
    ),
  })
