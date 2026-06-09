import { Effect, Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { t, type TranslationKey } from '../i18n'

interface Note {
  pitch: string
  dur: number
}

interface Song {
  key: string
  emoji: string
  notes: Note[]
}

interface HarmonicDef {
  ratio: number
  gain: number
}

interface Instrument {
  key: string
  type: OscillatorType
  gain: number
  attack: number
  decay: number
  sustain: number
  release: number
  harmonics: HarmonicDef[]
  filterType?: BiquadFilterType
  filterFreq?: number
  filterQ?: number
  detune?: number
  tremoloFreq?: number
  tremoloDepth?: number
}

interface KeyDef {
  pitch: string
  type: 'white' | 'black'
}

export const FREQUENCIES: Record<string, number> = {
  C2: 65.41, 'C#2': 69.30, D2: 73.42, 'D#2': 77.78, E2: 82.41, F2: 87.31, 'F#2': 92.50,
  G2: 98.00, 'G#2': 103.83, A2: 110.00, 'A#2': 116.54, B2: 123.47,
  C3: 130.81, 'C#3': 138.59, D3: 146.83, 'D#3': 155.56, E3: 164.81, F3: 174.61,
  'F#3': 185.00, G3: 196.00, 'G#3': 207.65, A3: 220.00, 'A#3': 233.08, B3: 246.94,
  C4: 261.63, 'C#4': 277.18, D4: 293.66, 'D#4': 311.13, E4: 329.63, F4: 349.23,
  'F#4': 369.99, G4: 392.00, 'G#4': 415.30, A4: 440.00, 'A#4': 466.16, B4: 493.88,
  C5: 523.25, 'C#5': 554.37, D5: 587.33, 'D#5': 622.25, E5: 659.25, F5: 698.46,
  'F#5': 739.99, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50,
}

  const buildKeyboard = (start: string, end: string): { keys: KeyDef[]; blacks: Record<string, number> } => {
    const allNotes: string[] = []
    let current = start
    const noteOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    while (true) {
      allNotes.push(current)
      if (current === end) break
      const note = current.slice(0, -1)
      const oct = parseInt(current.slice(-1))
      const idx = noteOrder.indexOf(note)
      const next = idx === noteOrder.length - 1
        ? `C${oct + 1}`
        : `${noteOrder[idx + 1]}${oct}`
      current = next
    }
  const keys: KeyDef[] = []
  const blacks: Record<string, number> = {}
  let whiteIdx = 0
  for (const n of allNotes) {
    const isBlack = n.includes('#')
    keys.push({ pitch: n, type: isBlack ? 'black' : 'white' })
    if (isBlack) {
      blacks[n] = whiteIdx
    } else {
      whiteIdx++
    }
  }
  return { keys, blacks }
}

export const PianoKeys = {
  TOP: buildKeyboard('C4', 'G5'),
  BOTTOM: buildKeyboard('C2', 'G3'),
}
const PIANO_TOP = PianoKeys.TOP
const PIANO_BOTTOM = PianoKeys.BOTTOM

const WHITE_KEYS_TOP = PIANO_TOP.keys.filter(k => k.type === 'white')
const BLACK_KEYS_TOP = PIANO_TOP.keys.filter(k => k.type === 'black')
const WHITE_KEYS_BOTTOM = PIANO_BOTTOM.keys.filter(k => k.type === 'white')
const BLACK_KEYS_BOTTOM = PIANO_BOTTOM.keys.filter(k => k.type === 'black')

const TOP_WHITE_COUNT = WHITE_KEYS_TOP.length

const activeNotes = new Map<string, {
  nodes: Array<{ osc: OscillatorNode; gain: GainNode }>
  masterGain: GainNode
  release: number
}>()
let selectedInstrumentIndex = 0
let keyboardBound = false

interface QWERTYKey {
  qwerty: string
  pitch: string
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

const handleKeyDown = (e: KeyboardEvent): void => {
  const pitch = QWERTY_MAP[e.key.toLowerCase()]
  if (pitch) {
    e.preventDefault()
    startNote(pitch, INSTRUMENTS[selectedInstrumentIndex]!)
  }
}

const handleKeyUp = (e: KeyboardEvent): void => {
  const pitch = QWERTY_MAP[e.key.toLowerCase()]
  if (pitch) {
    e.preventDefault()
    stopNote(pitch)
  }
}

const bindKeyboard = (): void => {
  if (keyboardBound) return
  keyboardBound = true
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)
  // Safari: AudioContext must be created/resumed from a user gesture.
  // Foldkit's message dispatch may run async, so we eagerly init the
  // AudioContext on the first raw DOM interaction before any message.
  const firstTouch = () => {
    getCtx()
    document.removeEventListener('pointerdown', firstTouch)
    document.removeEventListener('keydown', firstTouch)
  }
  document.addEventListener('pointerdown', firstTouch)
  document.addEventListener('keydown', firstTouch)
}



const highlightKey = (pitch: string): void => {
  document.querySelectorAll('.piano-key-glow').forEach(el => {
    const parent = (el as HTMLElement).parentElement
    const p = parent?.getAttribute('data-pitch')
    if (p === pitch) {
      (el as HTMLElement).classList.add('piano-key-glow--active')
    }
  })
}

const unhighlightKey = (pitch: string): void => {
  document.querySelectorAll('.piano-key-glow').forEach(el => {
    const parent = (el as HTMLElement).parentElement
    const p = parent?.getAttribute('data-pitch')
    if (p === pitch) {
      (el as HTMLElement).classList.remove('piano-key-glow--active')
    }
  })
}

const unhighlightAllKeys = (): void => {
  document.querySelectorAll('.piano-key-glow--active').forEach(el => {
    ;(el as HTMLElement).classList.remove('piano-key-glow--active')
  })
}

export const SONGS: Song[] = [
  {
    key: 'twinkle',
    emoji: '⭐',
    notes: [
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 2 },
    ],
  },
  {
    key: 'mary',
    emoji: '🐑',
    notes: [
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'E4', dur: 2 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'E4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 2 },
    ],
  },
  {
    key: 'london',
    emoji: '🌉',
    notes: [
      { pitch: 'G4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'D4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'G4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'D4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'C4', dur: 2 },
    ],
  },
  {
    key: 'row',
    emoji: '🚣',
    notes: [
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 2 },
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'C5', dur: 1.5 }, { pitch: 'C5', dur: 0.5 },
      { pitch: 'C5', dur: 2 },
      { pitch: 'G4', dur: 1.5 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'E4', dur: 1.5 }, { pitch: 'E4', dur: 0.5 },
      { pitch: 'E4', dur: 2 },
      { pitch: 'C4', dur: 1.5 }, { pitch: 'C4', dur: 0.5 },
      { pitch: 'C4', dur: 2 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 3 },
    ],
  },
  {
    key: 'oldMac',
    emoji: '🐷',
    notes: [
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 2 },
    ],
  },
  {
    key: 'happy',
    emoji: '😊',
    notes: [
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'E4', dur: 2 },
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 2 },
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'C5', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 2 },
    ],
  },
]

export const INSTRUMENTS: Instrument[] = [
  {
    key: 'bell',
    type: 'sine',
    gain: 0.22,
    attack: 0.008,
    decay: 0.4,
    sustain: 0.55,
    release: 1.0,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.6 },
      { ratio: 3, gain: 0.35 },
      { ratio: 4, gain: 0.15 },
    ],
  },
  {
    key: 'flute',
    type: 'sine',
    gain: 0.1,
    attack: 0.08,
    decay: 0.05,
    sustain: 0.95,
    release: 0.15,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.2 },
    ],
    detune: 4,
  },
  {
    key: 'brass',
    type: 'sawtooth',
    gain: 0.1,
    attack: 0.02,
    decay: 0.2,
    sustain: 0.6,
    release: 0.35,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.25 },
    ],
    filterType: 'lowpass',
    filterFreq: 2000,
    filterQ: 0.5,
  },
  {
    key: 'organ',
    type: 'sawtooth',
    gain: 0.05,
    attack: 0.01,
    decay: 0.02,
    sustain: 1.0,
    release: 0.05,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.4 },
      { ratio: 3, gain: 0.2 },
      { ratio: 4, gain: 0.1 },
    ],
  },
  {
    key: 'guitar',
    type: 'triangle',
    gain: 0.1,
    attack: 0.002,
    decay: 0.3,
    sustain: 0.1,
    release: 0.2,
    harmonics: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.4 },
      { ratio: 3, gain: 0.15 },
    ],
  },
]

const SONG_TKEYS: Record<string, TranslationKey> = {
  twinkle: 'musicBoxTwinkle',
  mary: 'musicBoxMary',
  london: 'musicBoxLondon',
  row: 'musicBoxRow',
  oldMac: 'musicBoxOldMac',
  happy: 'musicBoxHappy',
}

const INST_TKEYS: Record<string, TranslationKey> = {
  bell: 'musicBoxBell',
  flute: 'musicBoxFlute',
  brass: 'musicBoxBrass',
  organ: 'musicBoxOrgan',
  guitar: 'musicBoxGuitar',
}

let sharedCtx: AudioContext | undefined
let stopFlag = false

const getCtx = (): AudioContext | undefined => {
  if (sharedCtx?.state === 'closed') sharedCtx = undefined
  if (!sharedCtx) {
    try { sharedCtx = new AudioContext() } catch { return }
  }
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}

const SAFETY_MARGIN = 0.03

const playNoteAudio = (freq: number, dur: number, inst: Instrument): void => {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime + SAFETY_MARGIN
  const totalTime = Math.max(dur * 0.45, inst.attack + inst.release + 0.02)
  const relStart = now + totalTime - inst.release

  const masterGain = ctx.createGain()

  masterGain.gain.setValueAtTime(0, now)
  masterGain.gain.linearRampToValueAtTime(inst.gain, now + inst.attack)
  const decEnd = now + inst.attack + inst.decay
  masterGain.gain.linearRampToValueAtTime(inst.gain * inst.sustain, decEnd)
  if (relStart > decEnd) {
    masterGain.gain.setValueAtTime(inst.gain * inst.sustain, relStart)
  }
  const end = now + totalTime
  masterGain.gain.linearRampToValueAtTime(0, end)

  if (inst.filterType && inst.filterFreq) {
    const filter = ctx.createBiquadFilter()
    filter.type = inst.filterType
    filter.frequency.value = inst.filterFreq
    filter.Q.value = inst.filterQ ?? 1
    masterGain.connect(filter)
    filter.connect(ctx.destination)
  } else {
    masterGain.connect(ctx.destination)
  }

  const nodes: Array<{ osc: OscillatorNode; gain: GainNode }> = []
  for (const h of inst.harmonics) {
    const osc = ctx.createOscillator()
    osc.type = inst.type
    osc.frequency.value = freq * h.ratio
    if (inst.detune) osc.detune.value = inst.detune
    const hGain = ctx.createGain()
    hGain.gain.value = h.gain
    osc.connect(hGain)
    hGain.connect(masterGain)
    osc.start(now)
    osc.stop(end + 0.01)
    nodes.push({ osc, gain: hGain })
  }

  if (inst.tremoloFreq && inst.tremoloDepth) {
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = inst.tremoloFreq
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = inst.tremoloDepth
    lfo.connect(lfoGain)
    lfoGain.connect(masterGain.gain)
    lfo.start()
    lfo.stop(end + 0.01)
    nodes.push({ osc: lfo, gain: lfoGain })
  }

  setTimeout(() => {
    for (const { osc, gain } of nodes) {
      try { osc.stop() } catch { /* already stopped */ }
      osc.disconnect()
      gain.disconnect()
    }
    masterGain.disconnect()
  }, totalTime * 1000 + 100)
}

const playSongCmd = (
  song: Song,
  inst: Instrument,
  msg: ReturnType<typeof SongEnded>,
): Command.Command<ReturnType<typeof SongEnded>> => ({
  name: 'PlayMusicBox',
  effect: Effect.gen(function* () {
    stopFlag = false
    for (let i = 0; i < song.notes.length; i++) {
      if (stopFlag) break
      const note = song.notes[i]!
      const freq = FREQUENCIES[note.pitch]
      if (freq) playNoteAudio(freq, note.dur, inst)
      highlightKey(note.pitch)
      yield* Effect.sleep(note.dur * 350)
      unhighlightAllKeys()
    }
    stopFlag = false
    unhighlightAllKeys()
    return msg
  }),
})

const startNote = (pitch: string, inst: Instrument): void => {
  const freq = FREQUENCIES[pitch]
  if (!freq || activeNotes.has(pitch)) return
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime + SAFETY_MARGIN
  const masterGain = ctx.createGain()

  masterGain.gain.setValueAtTime(0, now)
  masterGain.gain.linearRampToValueAtTime(inst.gain, now + inst.attack)
  const decEnd = now + inst.attack + inst.decay
  masterGain.gain.linearRampToValueAtTime(inst.gain * inst.sustain, decEnd)

  if (inst.filterType && inst.filterFreq) {
    const filter = ctx.createBiquadFilter()
    filter.type = inst.filterType
    filter.frequency.value = inst.filterFreq
    filter.Q.value = inst.filterQ ?? 1
    masterGain.connect(filter)
    filter.connect(ctx.destination)
  } else {
    masterGain.connect(ctx.destination)
  }

  const nodes: Array<{ osc: OscillatorNode; gain: GainNode }> = []
  for (const h of inst.harmonics) {
    const osc = ctx.createOscillator()
    osc.type = inst.type
    osc.frequency.value = freq * h.ratio
    if (inst.detune) osc.detune.value = inst.detune
    const hGain = ctx.createGain()
    hGain.gain.value = h.gain
    osc.connect(hGain)
    hGain.connect(masterGain)
    osc.start(now)
    nodes.push({ osc, gain: hGain })
  }

  if (inst.tremoloFreq && inst.tremoloDepth) {
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = inst.tremoloFreq
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = inst.tremoloDepth
    lfo.connect(lfoGain)
    lfoGain.connect(masterGain.gain)
    lfo.start()
    nodes.push({ osc: lfo, gain: lfoGain })
  }

  activeNotes.set(pitch, { nodes, masterGain, release: inst.release })
  highlightKey(pitch)
}

const stopNote = (pitch: string): void => {
  const entry = activeNotes.get(pitch)
  if (!entry) return
  const { nodes, masterGain, release } = entry
  activeNotes.delete(pitch)
  unhighlightKey(pitch)
  const ctx = getCtx()
  const now = (ctx?.currentTime ?? performance.now() / 1000) + SAFETY_MARGIN

  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setValueAtTime(masterGain.gain.value, now)
  masterGain.gain.linearRampToValueAtTime(0, now + release)

  setTimeout(() => {
    for (const { osc, gain } of nodes) {
      try { osc.stop() } catch { /* already stopped */ }
      osc.disconnect()
      gain.disconnect()
    }
    masterGain.disconnect()
  }, release * 1000 + 50)
}

const stopAllNotes = (): void => {
  for (const pitch of activeNotes.keys()) {
    stopNote(pitch)
  }
}

export const Model = S.Struct({
  selectedSong: S.Number,
  selectedInstrument: S.Number,
  isPlaying: S.Boolean,
})
export type Model = typeof Model.Type

export const Play = m('MusicBoxPlay')
export const Stop = m('MusicBoxStop')
export const SetSong = m('MusicBoxSetSong', { value: S.Number })
export const SetInstrument = m('MusicBoxSetInstrument', { value: S.Number })
export const SongEnded = m('MusicBoxSongEnded')
export const NoteOn = m('MusicBoxNoteOn', { pitch: S.String })
export const NoteOff = m('MusicBoxNoteOff', { pitch: S.String })

export const Message = S.Union([Play, Stop, SetSong, SetInstrument, SongEnded, NoteOn, NoteOff])
export type Message = typeof Message.Type

export const init = (): Model => {
  bindKeyboard()
  return { selectedSong: 0, selectedInstrument: 0, isPlaying: false }
}

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      MusicBoxPlay: () => {
        getCtx() // Safari: AudioContext must be created within a user gesture
        return [
          { ...model, isPlaying: true },
          [playSongCmd(
            SONGS[model.selectedSong]!,
            INSTRUMENTS[model.selectedInstrument]!,
            SongEnded(),
          )],
        ]
      },
      MusicBoxStop: () => {
        stopFlag = true
        stopAllNotes()
        unhighlightAllKeys()
        return [{ ...model, isPlaying: false }, []]
      },
      MusicBoxSetSong: (msg) => [{ ...model, selectedSong: msg.value }, []],
      MusicBoxSetInstrument: (msg) => {
  selectedInstrumentIndex = msg.value
  return [{ ...model, selectedInstrument: msg.value }, []]
},
      MusicBoxSongEnded: () => [{ ...model, isPlaying: false }, []],
      MusicBoxNoteOn: (msg) => {
        getCtx() // Safari: ensure AudioContext from user gesture
        startNote(msg.pitch, INSTRUMENTS[model.selectedInstrument]!)
        return [model, []]
      },
      MusicBoxNoteOff: (msg) => {
        stopNote(msg.pitch)
        return [model, []]
      },
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
    [
        h.div([h.Class('card musicbox-card')], [
          h.div([h.Class('musicbox-card-inner')], [
          h.h1([h.Class('title')], [t('musicBoxTitle', language)]),

          h.div([h.Class('musicbox-controls')], [
            h.div([h.Class('musicbox-dropdown')], [
              h.label([h.Class('musicbox-dropdown-label')], [t('musicBoxPickSong', language)]),
              h.select(
                [
                  h.Value(model.selectedSong.toString()),
                  h.OnChange(v => SetSong({ value: parseInt(v) })),
                  h.Disabled(model.isPlaying),
                  h.Class('musicbox-select'),
                ],
                [
                  ...SONGS.map((song, i) =>
                    h.option(
                      [h.Value(i.toString())],
                      [`${song.emoji} ${t(SONG_TKEYS[song.key]!, language)}`],
                    ),
                  ),
                ],
              ),
            ]),
            h.div([h.Class('musicbox-dropdown')], [
              h.label([h.Class('musicbox-dropdown-label')], [t('musicBoxPickInstrument', language)]),
              h.select(
                [
                  h.Value(model.selectedInstrument.toString()),
                  h.OnChange(v => SetInstrument({ value: parseInt(v) })),
                  h.Disabled(model.isPlaying),
                  h.Class('musicbox-select'),
                ],
                [
                  ...INSTRUMENTS.map((inst, i) =>
                    h.option(
                      [h.Value(i.toString())],
                      [`${t(INST_TKEYS[inst.key]!, language)}`],
                    ),
                  ),
                ],
              ),
            ]),
          ]),

          h.div([h.Class('buttons')], [
            model.isPlaying
              ? h.button(
                [h.OnClick(Stop()), h.Class('btn btn-secondary musicbox-stop-btn')],
                ['⏹ ' + t('stop', language)],
              )
              : h.button(
                [h.OnClick(Play()), h.Class('btn btn-primary musicbox-play-btn')],
                ['▶ ' + t('play', language)],
              ),
          ]),

          ]),

          renderPiano(h, WHITE_KEYS_TOP, BLACK_KEYS_TOP, PIANO_TOP.blacks, TOP_WHITE_COUNT, 'top'),
          renderPiano(h, WHITE_KEYS_BOTTOM, BLACK_KEYS_BOTTOM, PIANO_BOTTOM.blacks, WHITE_KEYS_BOTTOM.length, 'bot'),
        ]),
      ],
    )
  }

// ── Piano keyboard view helper ──────────────────────────────────────────

const pointerStream = (element: Element): Stream.Stream<Message> => {
  const activePointerPitch = new Map<number, string>()
  const target = element as unknown as Stream.EventListener<PointerEvent>

  const findPitch = (clientX: number, clientY: number): string | undefined => {
    const els = document.elementsFromPoint(clientX, clientY)
    for (const el of els) {
      const elWithPitch = (el as HTMLElement).closest('[data-pitch]')
      if (elWithPitch) return elWithPitch.getAttribute('data-pitch')!
    }
    return undefined
  }

  const onDown = Stream.fromEventListener(target, 'pointerdown', { passive: false }).pipe(
    Stream.flatMap((e) => {
      e.preventDefault()
      const pitch = findPitch(e.clientX, e.clientY)
      if (pitch) {
        activePointerPitch.set(e.pointerId, pitch)
        return Stream.make(NoteOn({ pitch }))
      }
      return Stream.empty
    }),
  )

  const onMove = Stream.fromEventListener(target, 'pointermove', { passive: false }).pipe(
    Stream.filter((e) => (e.buttons & 1) !== 0),
    Stream.flatMap((e) => {
      const pitch = findPitch(e.clientX, e.clientY)
      const prev = activePointerPitch.get(e.pointerId)
      if (!pitch && prev) {
        activePointerPitch.delete(e.pointerId)
        return Stream.make(NoteOff({ pitch: prev }))
      }
      if (pitch && pitch !== prev) {
        activePointerPitch.set(e.pointerId, pitch)
        return prev
          ? Stream.make(NoteOff({ pitch: prev }), NoteOn({ pitch }))
          : Stream.make(NoteOn({ pitch }))
      }
      return Stream.empty
    }),
  )

  const onUp = Stream.fromEventListener(target, 'pointerup').pipe(
    Stream.flatMap((e) => {
      const pitch = activePointerPitch.get(e.pointerId)
      if (pitch) {
        activePointerPitch.delete(e.pointerId)
        return Stream.make(NoteOff({ pitch }))
      }
      return Stream.empty
    }),
  )

  const onCancel = Stream.fromEventListener(target, 'pointercancel').pipe(
    Stream.flatMap((e) => {
      const pitch = activePointerPitch.get(e.pointerId)
      if (pitch) {
        activePointerPitch.delete(e.pointerId)
        return Stream.make(NoteOff({ pitch }))
      }
      return Stream.empty
    }),
  )

  return Stream.mergeAll({ concurrency: 'unbounded' })([onDown, onMove, onUp, onCancel])
}

const renderPiano = (
  h: ReturnType<typeof html<Message>>,
  whiteKeys: KeyDef[],
  blackKeys: KeyDef[],
  blacks: Record<string, number>,
  whiteCount: number,
  prefix: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  return h.div([
    h.Class('piano-container'),
    h.Style({ touchAction: 'none' }),
    h.OnMount({
      name: `piano-${prefix}`,
      f: pointerStream,
    }),
  ], [
    h.div([h.Class('piano-keys'), h.Style({ '--white-count': whiteCount.toString() })], [
      ...whiteKeys.map((k, i) =>
        h.div([
          h.Class('piano-key piano-white'),
          h.Attribute('data-pitch', k.pitch),
          h.Key(`${prefix}-${k.pitch}`),
          h.Style({ left: `calc(${i} / ${whiteCount} * 100%)`, width: `calc(100% / ${whiteCount})` }),
        ], [
          h.div([h.Class('piano-key-glow')], []),
        ]),
      ),
      ...blackKeys.map(k => {
        const boundary = blacks[k.pitch] ?? 1
        return h.div([
          h.Class('piano-key piano-black'),
          h.Attribute('data-pitch', k.pitch),
          h.Key(`${prefix}-${k.pitch}`),
          h.Style({ left: `calc(${boundary} / ${whiteCount} * 100%)` }),
        ], [
          h.div([h.Class('piano-key-glow')], []),
        ])
      }),
    ]),
  ])
}
