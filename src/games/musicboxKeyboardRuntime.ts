import { Effect, MutableRef, Queue, Stream } from 'effect'
import type { DrumKind, FrequencyTable, Instrument, Pitch } from './musicboxDomain'
import { Pitch as PitchValue } from './musicboxDomain'
import type { MusicBoxAudioRuntime } from './musicboxAudioRuntime'

interface QWERTYKey {
  qwerty: string
  pitch: Pitch
}

export const QWERTY_WHITES: QWERTYKey[] = [
  { qwerty: 'A', pitch: PitchValue.unsafe('C4') },
  { qwerty: 'S', pitch: PitchValue.unsafe('D4') },
  { qwerty: 'D', pitch: PitchValue.unsafe('E4') },
  { qwerty: 'F', pitch: PitchValue.unsafe('F4') },
  { qwerty: 'G', pitch: PitchValue.unsafe('G4') },
  { qwerty: 'H', pitch: PitchValue.unsafe('A4') },
  { qwerty: 'J', pitch: PitchValue.unsafe('B4') },
  { qwerty: 'K', pitch: PitchValue.unsafe('C5') },
  { qwerty: 'L', pitch: PitchValue.unsafe('D5') },
  { qwerty: ';', pitch: PitchValue.unsafe('E5') },
  { qwerty: "'", pitch: PitchValue.unsafe('F5') },
  { qwerty: '\\', pitch: PitchValue.unsafe('G5') },
]

export const QWERTY_BLACKS: QWERTYKey[] = [
  { qwerty: 'W', pitch: PitchValue.unsafe('C#4') },
  { qwerty: 'E', pitch: PitchValue.unsafe('D#4') },
  { qwerty: 'T', pitch: PitchValue.unsafe('F#4') },
  { qwerty: 'Y', pitch: PitchValue.unsafe('G#4') },
  { qwerty: 'U', pitch: PitchValue.unsafe('A#4') },
  { qwerty: 'O', pitch: PitchValue.unsafe('C#5') },
  { qwerty: 'P', pitch: PitchValue.unsafe('D#5') },
  { qwerty: ']', pitch: PitchValue.unsafe('F#5') },
]

export const DRUM_KEYBINDS: ReadonlyArray<{ readonly qwerty: string; readonly kind: DrumKind }> = [
  { qwerty: 'C', kind: 'kick' },
  { qwerty: 'V', kind: 'snare' },
  { qwerty: 'B', kind: 'hatClosed' },
  { qwerty: 'N', kind: 'hatOpen' },
  { qwerty: 'M', kind: 'tomLow' },
  { qwerty: ',', kind: 'tomHigh' },
]

export interface MusicBoxKeyboardRuntime {
  readonly bind: () => void
  readonly reset: () => void
  readonly setOctaveOffset: (octaveOffset: number) => void
}

export interface MusicBoxKeyboardRuntimeDeps {
  readonly document: Document
  readonly frequencies: FrequencyTable
  readonly getInstrument: () => Instrument | undefined
  readonly audio: Pick<
    MusicBoxAudioRuntime,
    'primeFromGesture' | 'startManualNote' | 'stopManualNote' | 'playDrumHit' | 'clearActiveNotes'
  >
}

const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=='

const QWERTY_MAP: Record<string, Pitch> = {}
for (const k of QWERTY_WHITES) QWERTY_MAP[k.qwerty.toLowerCase()] = k.pitch
for (const k of QWERTY_BLACKS) QWERTY_MAP[k.qwerty.toLowerCase()] = k.pitch

const DRUM_KEY_MAP: Partial<Record<string, DrumKind>> = {}
for (const k of DRUM_KEYBINDS) DRUM_KEY_MAP[k.qwerty.toLowerCase()] = k.kind

const applyOctaveOffset = (pitch: Pitch, offset: number, frequencies: FrequencyTable): Pitch | undefined => {
  if (offset === 0) return pitch
  const m = pitch.match(/^([A-G]#?)(\d+)$/)
  return m ? frequencies.pitch(`${m[1]}${parseInt(m[2] ?? '0') + offset}`) : undefined
}

interface PianoPointerRuntimeDeps<Message> {
  readonly document: Document
  readonly noteOn: (pitch: string) => Message
  readonly noteOff: (pitch: string) => Message
  readonly stopNote: (pitch: string) => void
}

export const createPianoPointerRuntime = <Message>(deps: PianoPointerRuntimeDeps<Message>) => {
  const heldPitches = new Map<string, number>()
  return (element: Element): Stream.Stream<Message> => Stream.callback<Message>(queue =>
    Effect.gen(function* () {
      const keyboard = element as HTMLElement
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const pointers = new Map<number, string | undefined>()
          const touches = new Map<number, string | undefined>()
          const touchPointerIds = new Set<number>()
          const pointerPositions = new Map<number, { x: number; y: number; started: number }>()
          const nativeTouchPositions = new Map<number, { x: number; y: number; started: number; pointerId?: number }>()
          const nativePointerIds = new Map<number, number>()
          const findPitch = (x: number, y: number): string | undefined => {
            const key = deps.document.elementsFromPoint(x, y)
              .map(candidate => candidate.closest('[data-pitch]'))
              .find(candidate => candidate !== null && keyboard.contains(candidate))
            return key?.getAttribute('data-pitch') ?? undefined
          }
          const changePitch = (contacts: Map<number, string | undefined>, id: number, pitch: string | undefined): void => {
            const previous = contacts.get(id)
            if (previous === pitch) return
            contacts.set(id, pitch)
            if (previous) {
              const remaining = (heldPitches.get(previous) ?? 1) - 1
              if (remaining > 0) heldPitches.set(previous, remaining)
              else {
                heldPitches.delete(previous)
                Queue.offerUnsafe(queue, deps.noteOff(previous))
              }
            }
            if (pitch) {
              const count = heldPitches.get(pitch) ?? 0
              heldPitches.set(pitch, count + 1)
              if (count === 0) Queue.offerUnsafe(queue, deps.noteOn(pitch))
            }
          }
          const releasePointer = (id: number): void => {
            try { if (keyboard.hasPointerCapture(id)) keyboard.releasePointerCapture(id) } catch { /* Capture may already be gone. */ }
          }
          const clearContacts = (): void => {
            const ids = [...pointers.keys()]
            for (const id of ids) changePitch(pointers, id, undefined)
            for (const id of touches.keys()) changePitch(touches, id, undefined)
            pointers.clear()
            touches.clear()
            pointerPositions.clear()
            nativeTouchPositions.clear()
            nativePointerIds.clear()
            touchPointerIds.clear()
            for (const id of ids) releasePointer(id)
          }
          const visibilityChanged = (): void => { if (deps.document.hidden) clearContacts() }
          const eachTouch = (event: TouchEvent, action: (touch: Touch) => void): void => {
            for (let index = 0; index < event.changedTouches.length; index++) {
              const touch = event.changedTouches.item?.(index) ?? event.changedTouches[index]
              if (touch) action(touch)
            }
          }
          const down = (event: PointerEvent): void => {
            if (event.button !== 0 || pointers.has(event.pointerId) || nativePointerIds.has(event.pointerId)) return
            if (event.pointerType === 'touch') {
              const native = [...nativeTouchPositions].find(([, touch]) => touch.pointerId === undefined && Math.abs(event.timeStamp - touch.started) <= 40 && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) <= 1)
              if (native) {
                native[1].pointerId = event.pointerId
                nativePointerIds.set(event.pointerId, native[0])
                event.preventDefault()
                return
              }
            }
            const pitch = findPitch(event.clientX, event.clientY)
            if (!pitch) return
            event.preventDefault()
            pointers.set(event.pointerId, undefined)
            pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY, started: event.timeStamp })
            if (event.pointerType === 'touch') touchPointerIds.add(event.pointerId)
            changePitch(pointers, event.pointerId, pitch)
            try { keyboard.setPointerCapture(event.pointerId) } catch { /* Document listeners track releases without capture. */ }
          }
          const move = (event: PointerEvent): void => {
            if (!pointers.has(event.pointerId)) return
            event.preventDefault()
            const position = pointerPositions.get(event.pointerId)!
            pointerPositions.set(event.pointerId, { ...position, x: event.clientX, y: event.clientY })
            changePitch(pointers, event.pointerId, findPitch(event.clientX, event.clientY))
          }
          const up = (event: PointerEvent): void => {
            const nativeId = nativePointerIds.get(event.pointerId)
            if (nativeId !== undefined) {
              // Capture is deliberately released when native touch adopts a
              // pointer. That lost-capture event must not stop the note.
              if (event.type === 'lostpointercapture') return
              nativePointerIds.delete(event.pointerId)
              if (event.type === 'pointercancel') {
                changePitch(touches, nativeId, undefined)
                touches.delete(nativeId)
                nativeTouchPositions.delete(nativeId)
              }
              return
            }
            if (!pointers.has(event.pointerId)) return
            changePitch(pointers, event.pointerId, undefined)
            pointers.delete(event.pointerId)
            pointerPositions.delete(event.pointerId)
            touchPointerIds.delete(event.pointerId)
            releasePointer(event.pointerId)
          }
          const touchStart = (event: TouchEvent): void => {
            eachTouch(event, touch => {
              const pitch = findPitch(touch.clientX, touch.clientY)
              if (!pitch || touches.has(touch.identifier)) return
              event.preventDefault()
              nativeTouchPositions.set(touch.identifier, { x: touch.clientX, y: touch.clientY, started: event.timeStamp })
              // Browsers may deliver pointerdown before touchstart. Transfer
              // that held note without restarting it or counting it twice.
              const pointerId = [...touchPointerIds].find(id => {
                const point = pointerPositions.get(id)
                return point && pointers.get(id) === pitch && Math.abs(event.timeStamp - point.started) <= 40 && Math.hypot(point.x - touch.clientX, point.y - touch.clientY) <= 1
              })
              if (pointerId !== undefined) {
                pointers.delete(pointerId)
                pointerPositions.delete(pointerId)
                touchPointerIds.delete(pointerId)
                touches.set(touch.identifier, pitch)
                nativeTouchPositions.get(touch.identifier)!.pointerId = pointerId
                nativePointerIds.set(pointerId, touch.identifier)
                releasePointer(pointerId)
              } else {
                touches.set(touch.identifier, undefined)
                changePitch(touches, touch.identifier, pitch)
              }
            })
          }
          const touchMove = (event: TouchEvent): void => {
            eachTouch(event, touch => {
              if (!touches.has(touch.identifier)) return
              event.preventDefault()
              const position = nativeTouchPositions.get(touch.identifier)
              if (position) nativeTouchPositions.set(touch.identifier, { ...position, x: touch.clientX, y: touch.clientY })
              changePitch(touches, touch.identifier, findPitch(touch.clientX, touch.clientY))
            })
          }
          const touchEnd = (event: TouchEvent): void => {
            eachTouch(event, touch => {
              if (!touches.has(touch.identifier)) return
              changePitch(touches, touch.identifier, undefined)
              touches.delete(touch.identifier)
              const pointerId = nativeTouchPositions.get(touch.identifier)?.pointerId
              if (pointerId !== undefined) nativePointerIds.delete(pointerId)
              nativeTouchPositions.delete(touch.identifier)
            })
          }
          keyboard.addEventListener('pointerdown', down, { passive: false })
          deps.document.addEventListener('pointermove', move, { capture: true, passive: false })
          deps.document.addEventListener('pointerup', up, { capture: true })
          deps.document.addEventListener('pointercancel', up, { capture: true })
          keyboard.addEventListener('lostpointercapture', up)
          keyboard.addEventListener('touchstart', touchStart, { passive: false })
          deps.document.addEventListener('touchmove', touchMove, { capture: true, passive: false })
          deps.document.addEventListener('touchend', touchEnd, { capture: true })
          deps.document.addEventListener('touchcancel', touchEnd, { capture: true })
          deps.document.addEventListener('visibilitychange', visibilityChanged)
          deps.document.defaultView?.addEventListener('blur', clearContacts)
          return { pointers, touches, pointerPositions, nativeTouchPositions, nativePointerIds, touchPointerIds, down, move, up, touchStart, touchMove, touchEnd, releasePointer, visibilityChanged, clearContacts }
        }),
        ({ pointers, touches, pointerPositions, nativeTouchPositions, nativePointerIds, touchPointerIds, down, move, up, touchStart, touchMove, touchEnd, releasePointer, visibilityChanged, clearContacts }) => Effect.sync(() => {
          keyboard.removeEventListener('pointerdown', down)
          deps.document.removeEventListener('pointermove', move, { capture: true })
          deps.document.removeEventListener('pointerup', up, { capture: true })
          deps.document.removeEventListener('pointercancel', up, { capture: true })
          keyboard.removeEventListener('lostpointercapture', up)
          keyboard.removeEventListener('touchstart', touchStart)
          deps.document.removeEventListener('touchmove', touchMove, { capture: true })
          deps.document.removeEventListener('touchend', touchEnd, { capture: true })
          deps.document.removeEventListener('touchcancel', touchEnd, { capture: true })
          deps.document.removeEventListener('visibilitychange', visibilityChanged)
          deps.document.defaultView?.removeEventListener('blur', clearContacts)
          for (const pitch of [...pointers.values(), ...touches.values()]) {
            if (!pitch) continue
            const remaining = (heldPitches.get(pitch) ?? 1) - 1
            if (remaining > 0) heldPitches.set(pitch, remaining)
            else {
              heldPitches.delete(pitch)
              try { deps.stopNote(pitch) } catch { /* Continue releasing the remaining contacts and captures. */ }
            }
          }
          for (const id of pointers.keys()) releasePointer(id)
          pointers.clear()
          touches.clear()
          pointerPositions.clear()
          nativeTouchPositions.clear()
          nativePointerIds.clear()
          touchPointerIds.clear()
        }),
      )
      return yield* Effect.never
    }),
  )
}

export const createMusicBoxKeyboardRuntime = (deps: MusicBoxKeyboardRuntimeDeps): MusicBoxKeyboardRuntime => {
  const keyboardBound = MutableRef.make(false)
  const shortcutKeysBound = MutableRef.make(false)
  const currentOctaveOffset = MutableRef.make(0)
  let firstTouchHandler: (() => void) | undefined

  const handleKeyDown = (e: KeyboardEvent): void => {
    const pitch = QWERTY_MAP[e.key.toLowerCase()]
    if (pitch) {
      e.preventDefault()
      const instr = deps.getInstrument()
      const shiftedPitch = applyOctaveOffset(pitch, MutableRef.get(currentOctaveOffset), deps.frequencies)
      if (!instr || !shiftedPitch) return
      deps.audio.startManualNote(shiftedPitch, instr)
    }
  }

  const handleKeyUp = (e: KeyboardEvent): void => {
    const pitch = QWERTY_MAP[e.key.toLowerCase()]
    if (pitch) {
      e.preventDefault()
      const shiftedPitch = applyOctaveOffset(pitch, MutableRef.get(currentOctaveOffset), deps.frequencies)
      if (shiftedPitch) deps.audio.stopManualNote(shiftedPitch)
    }
  }

  const bindKeyboard = (): void => {
    if (MutableRef.get(keyboardBound)) return
    MutableRef.set(keyboardBound, true)
    deps.document.addEventListener('keydown', handleKeyDown)
    deps.document.addEventListener('keyup', handleKeyUp)
    // iOS Safari: AudioContext must be created/resumed within a qualifying user
    // gesture. pointerdown with pointerType "touch" does NOT qualify (Apple Dev
    // Forums, WebKit blog). pointerup and click DO qualify for touch events.
    // foldkit dispatches messages asynchronously through a queue, so we eagerly
    // init the AudioContext on the first qualifying gesture in CAPTURE phase.
    const firstTouch = () => {
      // iOS 26+ mute switch silences Web Audio oscillators while HTML <audio>
      // still works. Upgrade the audio session to "playback" to bypass this.
      try {
        const nav = navigator as { audioSession?: { type: string } }
        if (nav.audioSession) nav.audioSession.type = 'playback'
      } catch { /* ignore */ }
      // Playing a silent WAV during a gesture upgrades the audio session from
      // "ambient" to "playback" on older iOS versions (Babylon.js #18366).
      try { new Audio(SILENT_WAV).play().catch(() => { }) } catch { /* ignore */ }
      deps.audio.primeFromGesture()
      deps.document.removeEventListener('pointerup', firstTouch, { capture: true })
      deps.document.removeEventListener('touchend', firstTouch, { capture: true })
      deps.document.removeEventListener('keydown', firstTouch)
      firstTouchHandler = undefined
    }
    firstTouchHandler = firstTouch
    deps.document.addEventListener('pointerup', firstTouch, { capture: true })
    deps.document.addEventListener('touchend', firstTouch, { capture: true })
    deps.document.addEventListener('keydown', firstTouch)
  }

  const handleShortcutKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    if (!(e.target instanceof HTMLElement)) return
    const target = e.target
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
    const key = e.key.toLowerCase()
    const drumKind = DRUM_KEY_MAP[key]
    if (drumKind) {
      e.preventDefault()
      deps.audio.primeFromGesture()
      deps.audio.playDrumHit({ kind: drumKind })
    } else if (key === 'z') {
      e.preventDefault()
      deps.document.getElementById('octave-down')?.click()
    } else if (key === 'x') {
      e.preventDefault()
      deps.document.getElementById('octave-up')?.click()
    } else if (key === ' ') {
      e.preventDefault()
      const playBtn = deps.document.getElementById('musicbox-play')
      const pauseBtn = deps.document.getElementById('musicbox-pause')
      if (playBtn instanceof HTMLButtonElement && !playBtn.disabled) {
        playBtn.click()
      } else if (pauseBtn instanceof HTMLButtonElement && !pauseBtn.disabled) {
        pauseBtn.click()
      }
    }
  }

  const bindShortcutKeys = (): void => {
    if (MutableRef.get(shortcutKeysBound)) return
    MutableRef.set(shortcutKeysBound, true)
    deps.document.addEventListener('keydown', handleShortcutKeyDown)
  }

  const bind = (): void => {
    bindKeyboard()
    bindShortcutKeys()
  }

  const reset = (): void => {
    deps.audio.clearActiveNotes()
    deps.document.removeEventListener('keydown', handleKeyDown)
    deps.document.removeEventListener('keyup', handleKeyUp)
    deps.document.removeEventListener('keydown', handleShortcutKeyDown)
    if (firstTouchHandler) {
      deps.document.removeEventListener('pointerup', firstTouchHandler, { capture: true })
      deps.document.removeEventListener('touchend', firstTouchHandler, { capture: true })
      deps.document.removeEventListener('keydown', firstTouchHandler)
      firstTouchHandler = undefined
    }
    MutableRef.set(keyboardBound, false)
    MutableRef.set(shortcutKeysBound, false)
  }

  return {
    bind,
    reset,
    setOctaveOffset: (octaveOffset) => {
      MutableRef.set(currentOctaveOffset, octaveOffset)
    },
  }
}
