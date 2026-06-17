import { MutableRef } from 'effect'
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
      deps.document.removeEventListener('keydown', firstTouch)
      firstTouchHandler = undefined
    }
    firstTouchHandler = firstTouch
    deps.document.addEventListener('pointerup', firstTouch, { capture: true })
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
