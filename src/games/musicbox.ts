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
  lyrics: string[]
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
  'F#5': 739.99, G5: 783.99, 'G#5': 830.61, A5: 880.00, 'A#5': 932.33, B5: 987.77,
  C6: 1046.50, 'C#6': 1108.73, D6: 1174.66, 'D#6': 1244.51, E6: 1318.51, F6: 1396.91,
  'F#6': 1479.98, G6: 1567.98, 'G#6': 1661.22, A6: 1760.00, 'A#6': 1864.66, B6: 1975.53,
}

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const MIN_WHITE_KEYS = 1
export const MAX_WHITE_KEYS = 15
export const MIN_TRANSPOSE = -12
export const MAX_TRANSPOSE = 12

const transposePitch = (pitch: string, semitones: number): string => {
  if (!pitch) return pitch
  const note = pitch.slice(0, -1)
  const octave = parseInt(pitch.slice(-1))
  const semiIdx = CHROMATIC_NOTES.indexOf(note)
  if (semiIdx === -1) return pitch
  const newIdx = semiIdx + semitones
  const newOctave = octave + Math.floor(newIdx / 12)
  const newNote = CHROMATIC_NOTES[((newIdx % 12) + 12) % 12]!
  const result = `${newNote}${newOctave}`
  return FREQUENCIES[result] ? result : pitch
}

const getBlackBetween = (whiteNote: string): string | null => {
  const map: Record<string, string> = {
    C: 'C#', D: 'D#', F: 'F#', G: 'G#', A: 'A#',
  }
  return map[whiteNote] ?? null
}

export const shiftStart = (start: string, shift: number): string => {
  const whiteNote = start[0]!
  const octave = parseInt(start.slice(-1))
  const whiteIdx = WHITE_NOTES.indexOf(whiteNote)
  const totalIdx = whiteIdx + shift
  const newWhiteNote = WHITE_NOTES[((totalIdx % 7) + 7) % 7]!
  return `${newWhiteNote}${octave + Math.floor(totalIdx / 7)}`
}

export const buildKeyboard = (start: string, whiteCount: number, octaveOffset = 0): { keys: KeyDef[]; blacks: Record<string, number> } => {
  const startWhiteNote = start[0]!
  const startOctave = parseInt(start.slice(-1)) + octaveOffset
  const startWhiteIdx = WHITE_NOTES.indexOf(startWhiteNote)
  const keys: KeyDef[] = []
  const blacks: Record<string, number> = {}

  // leading black key: if keyboard starts at D/E/G/A/B, the preceding
  // white note's black key should sit before the first white key
  const prevWhiteIdx = (startWhiteIdx - 1 + 7) % 7
  const prevBlack = getBlackBetween(WHITE_NOTES[prevWhiteIdx]!)
  if (prevBlack) {
    const prevOctave = startOctave + Math.floor((startWhiteIdx - 1) / 7)
    const bp = `${prevBlack}${prevOctave}`
    if (FREQUENCIES[bp]) {
      keys.push({ pitch: bp, type: 'black' })
      blacks[bp] = 0
    }
  }

  for (let i = 0; i < whiteCount; i++) {
    const wi = (startWhiteIdx + i) % 7
    const oct = startOctave + Math.floor((startWhiteIdx + i) / 7)
    keys.push({ pitch: `${WHITE_NOTES[wi]}${oct}`, type: 'white' })

    const black = getBlackBetween(WHITE_NOTES[wi]!)
    if (black) {
      const bp = `${black}${oct}`
      if (FREQUENCIES[bp]) {
        keys.push({ pitch: bp, type: 'black' })
        blacks[bp] = i + 1
      }
    }
  }

  return { keys, blacks }
}

export const PianoKeys = {
  TOP: buildKeyboard('C4', 12),
  BOTTOM: buildKeyboard('C3', 12),
}

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

const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=='

const bindKeyboard = (): void => {
  if (keyboardBound) return
  keyboardBound = true
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
    getCtx()
    document.removeEventListener('pointerup', firstTouch, { capture: true })
    document.removeEventListener('keydown', firstTouch)
  }
  document.addEventListener('pointerup', firstTouch, { capture: true })
  document.addEventListener('keydown', firstTouch)
}



const highlightKey = (pitch: string): void => {
  document.querySelectorAll('.piano-key-glow').forEach(el => {
    const parent = (el as HTMLElement).parentElement
    const p = parent?.getAttribute('data-pitch')
    if (p === pitch) {
      const glow = el as HTMLElement
      glow.classList.remove('piano-key-glow--active')
      void glow.offsetHeight
      glow.classList.add('piano-key-glow--active')
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
    ; (el as HTMLElement).classList.remove('piano-key-glow--active')
  })
}

const highlightLyricLine = (index: number): void => {
  if (index === currentLyricLine) return
  if (currentLyricLine >= 0) {
    document.querySelectorAll(`[data-lyric-index="${currentLyricLine}"]`).forEach(el => {
      el.classList.remove('lyrics-line--active')
    })
  }
  currentLyricLine = index
  const els = document.querySelectorAll(`[data-lyric-index="${index}"]`)
  els.forEach(el => {
    el.classList.add('lyrics-line--active')
    const container = el.closest('.lyrics-box')
    if (container && el instanceof HTMLElement && container instanceof HTMLElement) {
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom
      if (!isVisible) container.scrollTop = el.offsetTop - container.offsetTop
    }
  })
}

const unhighlightAllLyricLines = (): void => {
  document.querySelectorAll('.lyrics-line--active').forEach(el => {
    el.classList.remove('lyrics-line--active')
  })
  currentLyricLine = -1
}

const repeat = <T>(arr: T[], n: number): T[] =>
  Array.from({ length: n }, () => [...arr]).flat()

export const SONGS: Song[] = [
  {
    key: 'twinkle',
    emoji: '⭐',
    lyrics: [
      'Twinkle, twinkle, little star,',
      'How I wonder what you are!',
      'Up above the world so high,',
      'Like a diamond in the sky.',
      'Twinkle, twinkle, little star,',
      'How I wonder what you are!',
      '',
      'When the blazing sun is gone,',
      'When he nothing shines upon,',
      'Then you show your little light,',
      'Twinkle, twinkle, all the night.',
      'Twinkle, twinkle, little star,',
      'How I wonder what you are!',
    ],
    notes: repeat([
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 2 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 2 },
    ], 2),
  },
  {
    key: 'mary',
    emoji: '🐑',
    lyrics: [
      "Mary had a little lamb,",
      "Little lamb, little lamb,",
      "Mary had a little lamb,",
      "Its fleece was white as snow.",
      '',
      "And everywhere that Mary went,",
      "Mary went, Mary went,",
      "And everywhere that Mary went,",
      "The lamb was sure to go.",
      '',
      "It followed her to school one day,",
      "School one day, school one day,",
      "It followed her to school one day,",
      "Which was against the rules.",
      '',
      "It made the children laugh and play,",
      "Laugh and play, laugh and play,",
      "It made the children laugh and play,",
      "To see a lamb at school.",
      '',
      "Why does the lamb love Mary so?",
      "Love Mary so? Love Mary so?",
      "Why does the lamb love Mary so?",
      "The eager children cry.",
    ],
    notes: repeat([
      { pitch: 'E4', dur: 1.5 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'E4', dur: 2 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'E4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'E4', dur: 1.5 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'C4', dur: 4 },
    ], 5),
  },
  {
    key: 'london',
    emoji: '🌉',
    lyrics: [
      'London Bridge is falling down,',
      'Falling down, falling down,',
      'London Bridge is falling down,',
      'My fair lady.',
      '',
      'Build it up with iron bars,',
      'Iron bars, iron bars,',
      'Build it up with iron bars,',
      'My fair lady.',
      '',
      'Iron bars will bend and break,',
      'Bend and break, bend and break,',
      'Iron bars will bend and break,',
      'My fair lady.',
    ],
    notes: repeat([
      { pitch: 'G4', dur: 1.5 }, { pitch: 'A4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'D4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'F4', dur: 2 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'G4', dur: 1.5 }, { pitch: 'A4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'D4', dur: 2 }, { pitch: 'G4', dur: 2 },
      { pitch: 'E4', dur: 1 }, { pitch: 'C4', dur: 3 },
    ], 3),
  },
  {
    key: 'row',
    emoji: '🚣',
    lyrics: [
      'Row, row, row your boat,',
      'Gently down the stream.',
      'Merrily, merrily, merrily, merrily,',
      'Life is but a dream.',
      '',
      'Row, row, row your boat,',
      'Gently down the stream.',
      'If you see a crocodile,',
      "Don't forget to scream!",
      '',
      'Row, row, row your boat,',
      'Gently down the river.',
      'If you see a polar bear,',
      "Don't forget to shiver!",
      '',
      'Row, row, row your boat,',
      'Gently to the shore.',
      'If you see a lion there,',
      "Don't forget to roar!",
      '',
      'Row, row, row your boat,',
      'Gently down the lake.',
      'If you see a little snake,',
      "Don't forget to shake!",
    ],
    notes: repeat([
      { pitch: 'C4', dur: 1.5 }, { pitch: 'C4', dur: 1.5 },
      { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'E4', dur: 1.5 },
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'G4', dur: 3 },
      { pitch: 'C5', dur: 0.5 }, { pitch: 'C5', dur: 0.5 },
      { pitch: 'C5', dur: 0.5 },
      { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 0.5 },
      { pitch: 'E4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
      { pitch: 'E4', dur: 0.5 },
      { pitch: 'C4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 },
      { pitch: 'C4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'C4', dur: 3 },
    ], 5),
  },
  {
    key: 'oldMac',
    emoji: '🐷',
    lyrics: [
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
      'And on his farm he had a pig,',
      'E-I-E-I-O,',
      'With an oink oink here and an oink oink there,',
      'Here an oink, there an oink, everywhere an oink oink.',
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
      '',
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
      'And on his farm he had a cow,',
      'E-I-E-I-O,',
      'With a moo moo here and a moo moo there,',
      'Here a moo, there a moo, everywhere a moo moo.',
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
      '',
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
      'And on his farm he had a duck,',
      'E-I-E-I-O,',
      'With a quack quack here and a quack quack there,',
      'Here a quack, there a quack, everywhere a quack quack.',
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
      '',
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
      'And on his farm he had a horse,',
      'E-I-E-I-O,',
      'With a neigh neigh here and a neigh neigh there,',
      'Here a neigh, there a neigh, everywhere a neigh neigh.',
      'Old MacDonald had a farm,',
      'E-I-E-I-O,',
    ],
    notes: repeat([
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 3 }, { pitch: 'D4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 3 }, { pitch: 'D4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'D4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: '', dur: 1 },
      { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 0.5 }, { pitch: '', dur: 0.5 },
      { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 0.5 }, { pitch: '', dur: 0.5 },

      { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },

      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 2 },
      { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 4 },
    ], 4),
  },
  {
    key: 'happy',
    emoji: '😊',
    lyrics: [
      "If you're happy and you know it, clap your hands!",
      "If you're happy and you know it, clap your hands!",
      "If you're happy and you know it, then your face will surely show it,",
      "If you're happy and you know it, clap your hands!",
      '',
      "If you're happy and you know it, stomp your feet!",
      "If you're happy and you know it, stomp your feet!",
      "If you're happy and you know it, then your face will surely show it,",
      "If you're happy and you know it, stomp your feet!",
      '',
      "If you're happy and you know it, shout hurray!",
      "If you're happy and you know it, shout hurray!",
      "If you're happy and you know it, then your face will surely show it,",
      "If you're happy and you know it, shout hurray!",
    ],
    notes: repeat([
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'G4', dur: 2 },
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'A4', dur: 2 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 1 },
      { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
      { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 1 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'D4', dur: 1 }, { pitch: 'E4', dur: 1 },
      { pitch: 'F4', dur: 2 },
    ], 3),
  },
  {
    key: 'birthday',
    emoji: '🎂',
    lyrics: [
      "Happy birthday to you,",
      "Happy birthday to you,",
      "Happy birthday dear you,",
      "Happy birthday to you!",
    ],
    notes: [
      // Verse 1
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
    gain: 0.06,
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
    key: 'sawtooth',
    type: 'sawtooth',
    gain: 0.08,
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
  birthday: 'musicBoxHappyBirthday',
}

const INST_TKEYS: Record<string, TranslationKey> = {
  bell: 'musicBoxBell',
  flute: 'musicBoxFlute',
  sawtooth: 'musicBoxSawtooth',
  guitar: 'musicBoxGuitar',
}

let sharedCtx: AudioContext | undefined
let stopFlag = false
let pauseFlag = false
let playbackTempo = 1
let playbackTranspose = 0
let currentLyricLine = -1

const getCtx = (): AudioContext | undefined => {
  if (sharedCtx?.state === 'closed' || sharedCtx?.state === 'interrupted') {
    try { sharedCtx.close() } catch { /* ignore */ }
    sharedCtx = undefined
  }
  if (!sharedCtx) {
    try { sharedCtx = new AudioContext() } catch { return }
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => { })
  }
  return sharedCtx
}

if (typeof window !== 'undefined') {
  // Recreate AudioContext after sleep/wake. Safari's context becomes a zombie
  // (state==="running" but no audio) or gets interrupted. Closing and letting
  // the next user gesture recreate is the only reliable fix.
  const recreateCtx = (): void => {
    if (sharedCtx) {
      try { sharedCtx.close() } catch { /* ignore */ }
      sharedCtx = undefined
    }
  }
  // pageshow with persisted=true fires on bfcache restore (includes wake)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) recreateCtx()
  })
  // Time-jump polling: catches ALL sleep/wake scenarios including Power Nap
  // and external display wake where visibilitychange may not fire.
  let lastWakeCheck = Date.now()
  setInterval(() => {
    const now = Date.now()
    if (now - lastWakeCheck > 15_000) recreateCtx()
    lastWakeCheck = now
  }, 5_000)
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
  msg: ReturnType<typeof SongEnded>,
): Command.Command<ReturnType<typeof SongEnded>> => ({
  name: 'PlayMusicBox',
  effect: Effect.gen(function* () {
    stopFlag = false
    pauseFlag = false
    const totalDur = song.notes.reduce((sum, n) => sum + n.dur, 0)
    const nonEmptyIndices = song.lyrics
      .map((line, i) => line === '' ? -1 : i)
      .filter(i => i >= 0)
    const beatsPerLine = totalDur / nonEmptyIndices.length
    let cumDur = 0
    for (let i = 0; i < song.notes.length; i++) {
      if (stopFlag) break
      const note = song.notes[i]!
      if (note.pitch) {
        const tp = transposePitch(note.pitch, playbackTranspose)
        const freq = FREQUENCIES[tp]
        if (freq) playNoteAudio(freq, note.dur, INSTRUMENTS[selectedInstrumentIndex]!)
        highlightKey(tp)
      }
      const rawIdx = Math.min(Math.floor(cumDur / beatsPerLine), nonEmptyIndices.length - 1)
      highlightLyricLine(nonEmptyIndices[rawIdx]!)
      cumDur += note.dur
      yield* Effect.sleep((note.dur * 350) / playbackTempo)
      unhighlightAllKeys()
      while (pauseFlag && !stopFlag) {
        yield* Effect.sleep(100)
      }
    }
    stopFlag = false
    pauseFlag = false
    unhighlightAllKeys()
    unhighlightAllLyricLines()
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

export const MIN_OCTAVE = -2
export const MAX_OCTAVE = 1

export const Model = S.Struct({
  selectedSong: S.Number,
  selectedInstrument: S.Number,
  isPlaying: S.Boolean,
  isPaused: S.Boolean,
  songTranspose: S.Number,
  whiteKeys: S.Number,
  showBottomKeyboard: S.Boolean,
  octaveOffset: S.Number,
  bottomShift: S.Number,
  topShift: S.Number,
  tempo: S.Number,
  lyricsExpanded: S.Boolean,
})
export type Model = typeof Model.Type

export const Play = m('MusicBoxPlay')
export const Stop = m('MusicBoxStop')
export const SetSong = m('MusicBoxSetSong', { value: S.Number })
export const SetInstrument = m('MusicBoxSetInstrument', { value: S.Number })
export const SongEnded = m('MusicBoxSongEnded')
export const NoteOn = m('MusicBoxNoteOn', { pitch: S.String })
export const NoteOff = m('MusicBoxNoteOff', { pitch: S.String })
export const AddKey = m('MusicBoxAddKey')
export const RemoveKey = m('MusicBoxRemoveKey')
export const OctaveUp = m('MusicBoxOctaveUp')
export const OctaveDown = m('MusicBoxOctaveDown')
export const ToggleBottomKeyboard = m('MusicBoxToggleBottomKeyboard')
export const ShiftBottom = m('MusicBoxShiftBottom', { delta: S.Number })
export const ShiftTop = m('MusicBoxShiftTop', { delta: S.Number })
export const TempoUp = m('MusicBoxTempoUp')
export const TempoDown = m('MusicBoxTempoDown')
export const ToggleLyrics = m('MusicBoxToggleLyrics')
export const TogglePause = m('MusicBoxTogglePause')
export const TransposeUp = m('MusicBoxTransposeUp')
export const TransposeDown = m('MusicBoxTransposeDown')

export const Message = S.Union([Play, Stop, SetSong, SetInstrument, SongEnded, NoteOn, NoteOff, AddKey, RemoveKey, OctaveUp, OctaveDown, ToggleBottomKeyboard, ShiftBottom, ShiftTop, TempoUp, TempoDown, ToggleLyrics, TogglePause, TransposeUp, TransposeDown])
export type Message = typeof Message.Type

export const init = (): Model => {
  bindKeyboard()
  return { selectedSong: 0, selectedInstrument: 0, isPlaying: false, isPaused: false, songTranspose: 0, whiteKeys: 8, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false }
}

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      MusicBoxPlay: () => {
        if (model.isPaused) {
          pauseFlag = false
          return [{ ...model, isPaused: false }, []]
        }
        getCtx() // Safari: AudioContext must be created within a user gesture
        playbackTempo = model.tempo
        playbackTranspose = model.songTranspose
        return [
          { ...model, isPlaying: true, isPaused: false },
          [playSongCmd(
            SONGS[model.selectedSong]!,
            SongEnded(),
          )],
        ]
      },
      MusicBoxStop: () => {
        stopFlag = true
        pauseFlag = false
        stopAllNotes()
        unhighlightAllKeys()
        unhighlightAllLyricLines()
        return [{ ...model, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSetSong: (msg) => {
        if (model.isPlaying) {
          stopFlag = true
          pauseFlag = false
          stopAllNotes()
          unhighlightAllKeys()
        }
        unhighlightAllLyricLines()
        return [{ ...model, selectedSong: msg.value, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSetInstrument: (msg) => {
        selectedInstrumentIndex = msg.value
        return [{ ...model, selectedInstrument: msg.value }, []]
      },
      MusicBoxSongEnded: () => {
        pauseFlag = false
        return [{ ...model, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxNoteOn: (msg) => {
        getCtx() // Safari: ensure AudioContext from user gesture
        startNote(msg.pitch, INSTRUMENTS[model.selectedInstrument]!)
        return [model, []]
      },
      MusicBoxNoteOff: (msg) => {
        stopNote(msg.pitch)
        return [model, []]
      },
      MusicBoxAddKey: () => {
        return model.whiteKeys < MAX_WHITE_KEYS ? [{ ...model, whiteKeys: model.whiteKeys + 1 }, []] : [model, []]
      },
      MusicBoxRemoveKey: () => {
        return model.whiteKeys > MIN_WHITE_KEYS ? [{ ...model, whiteKeys: model.whiteKeys - 1 }, []] : [model, []]
      },
      MusicBoxToggleBottomKeyboard: () => {
        return [{ ...model, showBottomKeyboard: !model.showBottomKeyboard }, []]
      },
      MusicBoxOctaveUp: () => {
        return model.octaveOffset < MAX_OCTAVE ? [{ ...model, octaveOffset: model.octaveOffset + 1 }, []] : [model, []]
      },
      MusicBoxOctaveDown: () => {
        return model.octaveOffset > MIN_OCTAVE ? [{ ...model, octaveOffset: model.octaveOffset - 1 }, []] : [model, []]
      },
      MusicBoxShiftBottom: (msg) => {
        const newShift = model.bottomShift + msg.delta
        return newShift < -7 || newShift > 7 ? [model, []] : [{ ...model, bottomShift: newShift }, []]
      },
      MusicBoxShiftTop: (msg) => {
        const newShift = model.topShift + msg.delta
        return newShift < -7 || newShift > 7 ? [model, []] : [{ ...model, topShift: newShift }, []]
      },
      MusicBoxTempoUp: () => {
        const t = Math.round((model.tempo + 0.25) * 100) / 100
        const next = t > 3 ? model : { ...model, tempo: t }
        if (next.tempo !== model.tempo) playbackTempo = next.tempo
        return [next, []]
      },
      MusicBoxTempoDown: () => {
        const t = Math.round((model.tempo - 0.25) * 100) / 100
        const next = t < 0.25 ? model : { ...model, tempo: t }
        if (next.tempo !== model.tempo) playbackTempo = next.tempo
        return [next, []]
      },
      MusicBoxToggleLyrics: () => {
        return [{ ...model, lyricsExpanded: !model.lyricsExpanded }, []]
      },
      MusicBoxTogglePause: () => {
        if (model.isPaused) {
          pauseFlag = false
          return [{ ...model, isPaused: false }, []]
        } else {
          pauseFlag = true
          unhighlightAllKeys()
          return [{ ...model, isPaused: true }, []]
        }
      },
      MusicBoxTransposeUp: () => {
        if (model.songTranspose >= MAX_TRANSPOSE) return [model, []]
        const next = model.songTranspose + 1
        playbackTranspose = next
        return [{ ...model, songTranspose: next }, []]
      },
      MusicBoxTransposeDown: () => {
        if (model.songTranspose <= MIN_TRANSPOSE) return [model, []]
        const next = model.songTranspose - 1
        playbackTranspose = next
        return [{ ...model, songTranspose: next }, []]
      },
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()
  const topKb = buildKeyboard(shiftStart('C4', model.topShift), model.whiteKeys, model.octaveOffset)
  const topWhite = topKb.keys.filter(k => k.type === 'white')
  const topBlack = topKb.keys.filter(k => k.type === 'black')

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
            h.div([h.Class('playback-btns')], [
              h.button(
                [h.OnClick(Play()), h.Class('btn btn-tiny musicbox-inline-btn'), h.Disabled(model.isPlaying && !model.isPaused)],
                ['▶'],
              ),
              h.button(
                [h.OnClick(TogglePause()), h.Class('btn btn-tiny musicbox-inline-btn'), h.Disabled(!model.isPlaying || model.isPaused)],
                ['⏸'],
              ),
              h.button(
                [h.OnClick(Stop()), h.Class('btn btn-tiny musicbox-inline-btn'), h.Disabled(!model.isPlaying)],
                ['⏹'],
              ),
            ]),
            h.div([h.Class('tempo-controls')], [
              h.button(
                [h.OnClick(TempoDown()), h.Class('btn btn-tiny'), h.Disabled(model.tempo <= 0.25)],
                ['−'],
              ),
              h.span([h.Class('tempo-label')], [`${model.tempo.toFixed(2)}×`]),
              h.button(
                [h.OnClick(TempoUp()), h.Class('btn btn-tiny'), h.Disabled(model.tempo >= 3)],
                ['+'],
              ),
            ]),
            h.div([h.Class('tempo-controls')], [
              h.button(
                [h.OnClick(TransposeDown()), h.Class('btn btn-tiny'), h.Disabled(model.songTranspose <= MIN_TRANSPOSE)],
                ['−'],
              ),
              h.span([h.Class('tempo-label')], [`${model.songTranspose > 0 ? '+' : ''}${model.songTranspose}`]),
              h.button(
                [h.OnClick(TransposeUp()), h.Class('btn btn-tiny'), h.Disabled(model.songTranspose >= MAX_TRANSPOSE)],
                ['+'],
              ),
            ]),
          ]),

          h.div(
            [h.Class('lyrics-box' + (model.lyricsExpanded ? '' : ' lyrics-box--compact')), h.OnClick(ToggleLyrics())],
            SONGS[model.selectedSong]!.lyrics.map((line, idx) =>
              line === ''
                ? h.div([h.Class('lyrics-gap')], [])
                : h.p([h.Class('lyrics-line'), h.Attribute('data-lyric-index', idx.toString())], [line]),
            ),
          ),

        ]),

        h.div([h.Class('piano-controls')], [
          h.button(
            [h.OnClick(OctaveDown()), h.Class('btn btn-tiny'), h.Disabled(model.octaveOffset <= MIN_OCTAVE)],
            ['−8'],
          ),
          h.button(
            [h.OnClick(OctaveUp()), h.Class('btn btn-tiny'), h.Disabled(model.octaveOffset >= MAX_OCTAVE)],
            ['+8'],
          ),
          h.span([h.Class('piano-range-label')], [t('musicBoxPianoRange', language)]),
          h.button(
            [h.OnClick(RemoveKey()), h.Class('btn btn-tiny btn-key-dec'), h.Disabled(model.whiteKeys <= MIN_WHITE_KEYS)],
            ['−'],
          ),
          h.button(
            [h.OnClick(AddKey()), h.Class('btn btn-tiny'), h.Disabled(model.whiteKeys >= MAX_WHITE_KEYS)],
            ['+'],
          ),
          h.label([h.Class('piano-toggle-label')], [
            h.input([h.Type('checkbox'), h.Checked(model.showBottomKeyboard), h.OnChange(() => ToggleBottomKeyboard())]),
            t('musicBoxShowBottom', language),
          ]),
          h.select(
            [
              h.Value(model.selectedInstrument.toString()),
              h.OnChange(v => SetInstrument({ value: parseInt(v) })),
              h.Class('musicbox-select instrument-inline'),
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
        renderPiano(h, topWhite, topBlack, topKb.blacks, model.whiteKeys, 'top'),
        h.div([h.Class('shift-controls-row')], [
          h.div([h.Class('shift-controls')], [
            h.button(
              [h.OnClick(ShiftTop({ delta: -1 })), h.Class('btn btn-tiny'), h.Disabled(model.topShift <= -7)],
              ['−'],
            ),
            h.span([h.Class('shift-label')], [shiftStart('C4', model.topShift)]),
            h.button(
              [h.OnClick(ShiftTop({ delta: 1 })), h.Class('btn btn-tiny'), h.Disabled(model.topShift >= 7)],
              ['+'],
            ),
          ]),
          ...(model.showBottomKeyboard
            ? [h.div([h.Class('shift-controls')], [
              h.button(
                [h.OnClick(ShiftBottom({ delta: -1 })), h.Class('btn btn-tiny'), h.Disabled(model.bottomShift <= -7)],
                ['−'],
              ),
              h.span([h.Class('shift-label')], [shiftStart('C3', model.bottomShift)]),
              h.button(
                [h.OnClick(ShiftBottom({ delta: 1 })), h.Class('btn btn-tiny'), h.Disabled(model.bottomShift >= 7)],
                ['+'],
              ),
            ])]
            : []),
        ]),
        ...(model.showBottomKeyboard
          ? (() => {
            const bottomStart = shiftStart('C3', model.bottomShift)
            const botKb = buildKeyboard(bottomStart, model.whiteKeys, model.octaveOffset)
            const botWhite = botKb.keys.filter(k => k.type === 'white')
            const botBlack = botKb.keys.filter(k => k.type === 'black')
            return [
              renderPiano(h, botWhite, botBlack, botKb.blacks, model.whiteKeys, 'bot'),
            ]
          })()
          : []),
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
          h.Class(`piano-key piano-white${FREQUENCIES[k.pitch] ? '' : ' piano-key-disabled'}`),
          ...(FREQUENCIES[k.pitch] ? [h.Attribute('data-pitch', k.pitch)] : []),
          h.Key(`${prefix}-${k.pitch}`),
          h.Style({ left: `calc(${i} / ${whiteCount} * 100%)`, width: `calc(100% / ${whiteCount})` }),
        ], [
          h.div([h.Class('piano-key-glow')], []),
          h.div([h.Class('piano-key-label')], [k.pitch]),
        ]),
      ),
      ...blackKeys.map(k => {
        const boundary = blacks[k.pitch] ?? 1
        return h.div([
          h.Class(`piano-key piano-black${FREQUENCIES[k.pitch] ? '' : ' piano-key-disabled'}`),
          ...(FREQUENCIES[k.pitch] ? [h.Attribute('data-pitch', k.pitch)] : []),
          h.Key(`${prefix}-${k.pitch}`),
          h.Style({ left: `calc(${boundary} / ${whiteCount} * 100%)` }),
        ], [
          h.div([h.Class('piano-key-glow')], []),
        ])
      }),
    ]),
  ])
}
