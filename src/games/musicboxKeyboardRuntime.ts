import { MutableRef } from 'effect'
import type { Instrument } from './musicboxAudioRuntime'

interface QWERTYKey {
  qwerty: string
  pitch: string
}

interface KeyboardControls {
  getInstrument: () => Instrument | undefined
  startNote: (pitch: string, instrument: Instrument) => void
  stopNote: (pitch: string) => void
  primeAudio: () => void
  clearActiveNotes: () => void
}

export const QWERTY_WHITES: QWERTYKey[] = [
  { qwerty: 'A', pitch: 'C4' },
  { qwerty: 'S', pitch: 'D4' },
  { qwerty: 'D', pitch: 'E4' },
  { qwerty: 'F', pitch: 'F4' },
  { qwerty: 'G', pitch: 'G4' },
  { qwerty: 'H', pitch: 'A4' },
  { qwerty: 'J', pitch: 'B4' },
  { qwerty: 'K', pitch: 'C5' },
  { qwerty: 'L', pitch: 'D5' },
  { qwerty: ';', pitch: 'E5' },
  { qwerty: "'", pitch: 'F5' },
  { qwerty: '\\', pitch: 'G5' },
]

export const QWERTY_BLACKS: QWERTYKey[] = [
  { qwerty: 'W', pitch: 'C#4' },
  { qwerty: 'E', pitch: 'D#4' },
  { qwerty: 'T', pitch: 'F#4' },
  { qwerty: 'Y', pitch: 'G#4' },
  { qwerty: 'U', pitch: 'A#4' },
  { qwerty: 'O', pitch: 'C#5' },
  { qwerty: 'P', pitch: 'D#5' },
  { qwerty: '[', pitch: 'F#5' },
]

const QWERTY_MAP: Record<string, string> = {}
for (const k of QWERTY_WHITES) QWERTY_MAP[k.qwerty.toLowerCase()] = k.pitch
for (const k of QWERTY_BLACKS) QWERTY_MAP[k.qwerty.toLowerCase()] = k.pitch

const keyboardBound = MutableRef.make(false)
const shortcutKeysBound = MutableRef.make(false)
const currentOctaveOffset = MutableRef.make(0)

const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=='
let firstTouchHandler: (() => void) | undefined
let controls: KeyboardControls | undefined

const applyOctaveOffset = (pitch: string, offset: number): string => {
  if (offset === 0) return pitch
  const m = pitch.match(/^([A-G]#?)(\d+)$/)
  return m ? `${m[1]}${parseInt(m[2] ?? '0') + offset}` : pitch
}

const handleKeyDown = (e: KeyboardEvent): void => {
  const pitch = QWERTY_MAP[e.key.toLowerCase()]
  if (pitch) {
    e.preventDefault()
    const instr = controls?.getInstrument()
    if (!instr) return
    controls?.startNote(applyOctaveOffset(pitch, MutableRef.get(currentOctaveOffset)), instr)
  }
}

const handleKeyUp = (e: KeyboardEvent): void => {
  const pitch = QWERTY_MAP[e.key.toLowerCase()]
  if (pitch) {
    e.preventDefault()
    controls?.stopNote(applyOctaveOffset(pitch, MutableRef.get(currentOctaveOffset)))
  }
}

export const bindKeyboard = (nextControls: KeyboardControls): void => {
  controls = nextControls
  if (MutableRef.get(keyboardBound)) return
  MutableRef.set(keyboardBound, true)
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)
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
    controls?.primeAudio()
    document.removeEventListener('pointerup', firstTouch, { capture: true })
    document.removeEventListener('keydown', firstTouch)
    firstTouchHandler = undefined
  }
  firstTouchHandler = firstTouch
  document.addEventListener('pointerup', firstTouch, { capture: true })
  document.addEventListener('keydown', firstTouch)
}

const handleShortcutKeyDown = (e: KeyboardEvent): void => {
  if (e.repeat) return
  if (!(e.target instanceof HTMLElement)) return
  const target = e.target
  if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
  const key = e.key.toLowerCase()
  if (key === 'z') {
    e.preventDefault()
    document.getElementById('octave-down')?.click()
  } else if (key === 'x') {
    e.preventDefault()
    document.getElementById('octave-up')?.click()
  } else if (key === ' ') {
    e.preventDefault()
    const playBtn = document.getElementById('musicbox-play')
    const pauseBtn = document.getElementById('musicbox-pause')
    if (playBtn instanceof HTMLButtonElement && !playBtn.disabled) {
      playBtn.click()
    } else if (pauseBtn instanceof HTMLButtonElement && !pauseBtn.disabled) {
      pauseBtn.click()
    }
  }
}

export const bindShortcutKeys = (): void => {
  if (MutableRef.get(shortcutKeysBound)) return
  MutableRef.set(shortcutKeysBound, true)
  document.addEventListener('keydown', handleShortcutKeyDown)
}

export const resetKeyboardControls = (): void => {
  controls?.clearActiveNotes()
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('keyup', handleKeyUp)
  document.removeEventListener('keydown', handleShortcutKeyDown)
  if (firstTouchHandler) {
    document.removeEventListener('pointerup', firstTouchHandler, { capture: true })
    document.removeEventListener('keydown', firstTouchHandler)
    firstTouchHandler = undefined
  }
  MutableRef.set(keyboardBound, false)
  MutableRef.set(shortcutKeysBound, false)
}

export const setKeyboardOctaveOffset = (octaveOffset: number): void => {
  MutableRef.set(currentOctaveOffset, octaveOffset)
}
