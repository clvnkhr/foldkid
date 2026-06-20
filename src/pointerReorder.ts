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
  if (value === undefined || value === null) return null
  const index = Number.parseInt(value, 10)
  return Number.isFinite(index) ? index : null
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
            const activePointers = new Set<number>()

            const onPointerDown = (event: PointerEvent): void => {
              if (event.button !== 0) return
              if (!(event.target instanceof Element)) return
              const handle = event.target.closest(options.handleSelector)
              if (!handle || !root.contains(handle)) return
              const index = dragIndexFrom(handle, options.itemSelector)
              if (index === null) return

              event.preventDefault()
              event.stopPropagation()
              activePointers.add(event.pointerId)
              root.setPointerCapture?.(event.pointerId)
              Queue.offerUnsafe(queue, options.start(index))
            }

            const endPointer = (event: PointerEvent, shouldDrop: boolean): void => {
              if (!activePointers.has(event.pointerId)) return

              event.preventDefault()
              event.stopPropagation()
              activePointers.delete(event.pointerId)
              root.releasePointerCapture?.(event.pointerId)

              if (shouldDrop) {
                const target = document.elementFromPoint(event.clientX, event.clientY)
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
            root.addEventListener('click', onClick)

            return { root, onPointerDown, onPointerUp, onPointerCancel, onClick }
          }),
          ({ root, onPointerDown, onPointerUp, onPointerCancel, onClick }) => Effect.sync(() => {
            root.removeEventListener('pointerdown', onPointerDown)
            root.removeEventListener('pointerup', onPointerUp)
            root.removeEventListener('pointercancel', onPointerCancel)
            root.removeEventListener('click', onClick)
          }),
        )

        return yield* Effect.never
      }),
    ),
  })
