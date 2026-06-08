import { Effect, Match as M, Option, Schema as S } from 'effect'
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

interface Instrument {
  key: string
  type: OscillatorType
  gain: number
  filterType?: BiquadFilterType
  filterFreq?: number
  detune?: number
  harmonics?: number[]
}

interface KeyDef {
  pitch: string
  type: 'white' | 'black'
}

const F: Record<string, number> = {
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

const PIANO_TOP = buildKeyboard('C4', 'G5')
const PIANO_BOTTOM = buildKeyboard('C2', 'G3')

const WHITE_KEYS_TOP = PIANO_TOP.keys.filter(k => k.type === 'white')
const BLACK_KEYS_TOP = PIANO_TOP.keys.filter(k => k.type === 'black')
const WHITE_KEYS_BOTTOM = PIANO_BOTTOM.keys.filter(k => k.type === 'white')
const BLACK_KEYS_BOTTOM = PIANO_BOTTOM.keys.filter(k => k.type === 'black')

const TOP_WHITE_COUNT = WHITE_KEYS_TOP.length

const activeNotes = new Map<string, Array<{ osc: OscillatorNode; gain: GainNode }>>()
let pointerDown = false
let selectedInstrumentIndex = 0
let keyboardBound = false

interface QWERTYKey {
  qwerty: string
  pitch: string
}

const QWERTY_WHITES: QWERTYKey[] = [
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

const QWERTY_BLACKS: QWERTYKey[] = [
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

const SONGS: Song[] = [
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

const INSTRUMENTS: Instrument[] = [
  { key: 'piano', type: 'sine', gain: 0.12, harmonics: [1, 0.5, 0.25] },
  { key: 'bell', type: 'sine', gain: 0.1, harmonics: [1, 0.3, 0.15], filterType: 'highpass', filterFreq: 2000 },
  { key: 'flute', type: 'sine', gain: 0.1, harmonics: [1, 0.3] },
  { key: 'organ', type: 'sawtooth', gain: 0.06, harmonics: [1, 0.4, 0.2] },
  { key: 'guitar', type: 'triangle', gain: 0.1, harmonics: [1, 0.4] },
  { key: 'vibes', type: 'sine', gain: 0.08, harmonics: [1, 0.2], detune: 5 },
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
  piano: 'musicBoxPiano',
  bell: 'musicBoxBell',
  flute: 'musicBoxFlute',
  organ: 'musicBoxOrgan',
  guitar: 'musicBoxGuitar',
  vibes: 'musicBoxVibes',
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

const playNoteAudio = (freq: number, dur: number, inst: Instrument): void => {
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime
  const masterGain = ctx.createGain()
  masterGain.gain.setValueAtTime(0, now)
  masterGain.gain.linearRampToValueAtTime(inst.gain, now + 0.02)
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.45)

  if (inst.filterType && inst.filterFreq) {
    const filter = ctx.createBiquadFilter()
    filter.type = inst.filterType
    filter.frequency.value = inst.filterFreq
    masterGain.connect(filter)
    filter.connect(ctx.destination)
  } else {
    masterGain.connect(ctx.destination)
  }

  const harms = inst.harmonics ?? [1]
  for (const h of harms) {
    const osc = ctx.createOscillator()
    osc.type = inst.type
    osc.frequency.value = freq * h
    if (inst.detune) osc.detune.value = inst.detune
    const hGain = ctx.createGain()
    hGain.gain.value = h === 1 ? 1 : 0.5
    osc.connect(hGain)
    hGain.connect(masterGain)
    osc.start(now)
    osc.stop(now + dur * 0.45)
    osc.onended = () => { osc.disconnect(); hGain.disconnect() }
  }

  masterGain.gain.setValueAtTime(0, now + dur * 0.45)
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
      const freq = F[note.pitch]
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
  const freq = F[pitch]
  if (!freq || activeNotes.has(pitch)) return
  const ctx = getCtx()
  if (!ctx) return
  const now = ctx.currentTime
  const masterGain = ctx.createGain()
  masterGain.gain.setValueAtTime(0, now)
  masterGain.gain.linearRampToValueAtTime(inst.gain, now + 0.02)

  if (inst.filterType && inst.filterFreq) {
    const filter = ctx.createBiquadFilter()
    filter.type = inst.filterType
    filter.frequency.value = inst.filterFreq
    masterGain.connect(filter)
    filter.connect(ctx.destination)
  } else {
    masterGain.connect(ctx.destination)
  }

  const harms = inst.harmonics ?? [1]
  const nodes: Array<{ osc: OscillatorNode; gain: GainNode }> = []
  for (const h of harms) {
    const osc = ctx.createOscillator()
    osc.type = inst.type
    osc.frequency.value = freq * h
    if (inst.detune) osc.detune.value = inst.detune
    const hGain = ctx.createGain()
    hGain.gain.value = h === 1 ? 1 : 0.5
    osc.connect(hGain)
    hGain.connect(masterGain)
    osc.start(now)
    nodes.push({ osc, gain: hGain })
  }

  activeNotes.set(pitch, nodes)
  highlightKey(pitch)
}

const stopNote = (pitch: string): void => {
  const nodes = activeNotes.get(pitch)
  if (!nodes) return
  for (const { osc, gain } of nodes) {
    try { osc.stop() } catch { /* already stopped */ }
    osc.disconnect()
    gain.disconnect()
  }
  activeNotes.delete(pitch)
  unhighlightKey(pitch)
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
      MusicBoxPlay: () => [
        { ...model, isPlaying: true },
        [playSongCmd(
          SONGS[model.selectedSong]!,
          INSTRUMENTS[model.selectedInstrument]!,
          SongEnded(),
        )],
      ],
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

const renderPiano = (
  h: ReturnType<typeof html<Message>>,
  whiteKeys: KeyDef[],
  blackKeys: KeyDef[],
  blacks: Record<string, number>,
  whiteCount: number,
  prefix: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  return h.div([h.Class('piano-container')], [
    h.div([h.Class('piano-keys'), h.Style({ '--white-count': whiteCount.toString() })], [
      ...whiteKeys.map((k, i) =>
        h.div([
          h.Class('piano-key piano-white'),
          h.Attribute('data-pitch', k.pitch),
          h.Key(`${prefix}-${k.pitch}`),
          h.Style({ left: `calc(${i} / ${whiteCount} * 100%)`, width: `calc(100% / ${whiteCount})` }),
          h.OnPointerDown(() => {
            pointerDown = true
            return Option.some(NoteOn({ pitch: k.pitch }))
          }),
          h.OnPointerMove(() =>
            pointerDown && !activeNotes.has(k.pitch)
              ? Option.some(NoteOn({ pitch: k.pitch }))
              : Option.none()
          ),
          h.OnPointerUp(() => {
            pointerDown = false
            return Option.some(NoteOff({ pitch: k.pitch }))
          }),
          h.OnPointerLeave(() => Option.some(NoteOff({ pitch: k.pitch }))),
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
          h.OnPointerDown(() => {
            pointerDown = true
            return Option.some(NoteOn({ pitch: k.pitch }))
          }),
          h.OnPointerMove(() =>
            pointerDown && !activeNotes.has(k.pitch)
              ? Option.some(NoteOn({ pitch: k.pitch }))
              : Option.none()
          ),
          h.OnPointerUp(() => {
            pointerDown = false
            return Option.some(NoteOff({ pitch: k.pitch }))
          }),
          h.OnPointerLeave(() => Option.some(NoteOff({ pitch: k.pitch }))),
        ], [
          h.div([h.Class('piano-key-glow')], []),
        ])
      }),
    ]),
  ])
}
