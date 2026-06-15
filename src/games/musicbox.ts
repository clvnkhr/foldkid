import { Effect, Match as M, MutableRef, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { t, type StringKey } from '../i18n'
import {
  clearActiveNotes,
  getMusicBoxContext,
  playScheduledNote,
  resetAudioGraph as resetMusicBoxAudioGraph,
  startManualNote,
  stopAllNotes,
  stopManualNote,
  type Instrument,
} from './musicboxAudioRuntime'
import {
  bindKeyboard as bindMusicBoxKeyboard,
  bindShortcutKeys,
  setKeyboardOctaveOffset,
} from './musicboxKeyboardRuntime'
import {
  resetWakeMonitor as resetMusicBoxWakeMonitor,
  startWakeMonitor as startMusicBoxWakeMonitor,
} from './musicboxWakeMonitor'

export {
  QWERTY_BLACKS,
  QWERTY_WHITES,
  resetKeyboardControls,
} from './musicboxKeyboardRuntime'

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

interface KeyDef {
  pitch: string
  type: 'white' | 'black'
}

export const FREQUENCIES: Record<string, number> = {
  C0: 16.35, 'C#0': 17.32, D0: 18.35, 'D#0': 19.45, E0: 20.60, F0: 21.83, 'F#0': 23.12,
  G0: 24.50, 'G#0': 25.96, A0: 27.50, 'A#0': 29.14, B0: 30.87,
  C1: 32.70, 'C#1': 34.65, D1: 36.71, 'D#1': 38.89, E1: 41.20, F1: 43.65, 'F#1': 46.25,
  G1: 49.00, 'G#1': 51.91, A1: 55.00, 'A#1': 58.27, B1: 61.74,
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
  C7: 2093.00, 'C#7': 2217.46, D7: 2349.32, 'D#7': 2489.02, E7: 2637.02, F7: 2793.83,
  'F#7': 2959.96, G7: 3135.96, 'G#7': 3322.44, A7: 3520.00, 'A#7': 3729.31, B7: 3951.07,
  C8: 4186.01, 'C#8': 4434.92, D8: 4698.63, 'D#8': 4978.03, E8: 5274.04, F8: 5587.65,
  'F#8': 5919.91, G8: 6271.93, 'G#8': 6644.88, A8: 7040.00, 'A#8': 7458.62, B8: 7902.13,
  C9: 8372.02, 'C#9': 8869.84, D9: 9397.27, 'D#9': 9956.06, E9: 10548.08, F9: 11175.30,
  'F#9': 11839.82, G9: 12543.85, 'G#9': 13289.75, A9: 14080.00, 'A#9': 14917.24, B9: 15804.27,
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
  const first = start[0]
  if (!first) return start
  const whiteNote = first
  const octave = parseInt(start.slice(-1))
  const whiteIdx = WHITE_NOTES.indexOf(whiteNote)
  const totalIdx = whiteIdx + shift
  const newWhiteNote = WHITE_NOTES[((totalIdx % 7) + 7) % 7]!
  return `${newWhiteNote}${octave + Math.floor(totalIdx / 7)}`
}

export const buildKeyboard = (start: string, whiteCount: number, octaveOffset = 0): { keys: KeyDef[]; blacks: Record<string, number> } => {
  const startWhiteNote = start[0] ?? ''
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

const selectedInstrumentIndex = MutableRef.make(0)

const highlightKey = (pitch: string): void => {
  document.querySelectorAll('.piano-key-glow').forEach(el => {
    if (!(el instanceof HTMLElement)) return
    const parent = el.parentElement
    const p = parent?.getAttribute('data-pitch')
    if (p === pitch) {
      el.classList.remove('piano-key-glow--active')
      void el.offsetHeight
      el.classList.add('piano-key-glow--active')
    }
  })
}

const unhighlightKey = (pitch: string): void => {
  document.querySelectorAll('.piano-key-glow').forEach(el => {
    if (!(el instanceof HTMLElement)) return
    const parent = el.parentElement
    const p = parent?.getAttribute('data-pitch')
    if (p === pitch) {
      el.classList.remove('piano-key-glow--active')
    }
  })
}

const unhighlightAllKeys = (): void => {
  document.querySelectorAll('.piano-key-glow--active').forEach(el => {
    if (el instanceof HTMLElement) el.classList.remove('piano-key-glow--active')
  })
}

const highlightLyricLine = (index: number): void => {
  if (index === MutableRef.get(currentLyricLine)) return
  if (MutableRef.get(currentLyricLine) >= 0) {
    document.querySelectorAll(`[data-lyric-index="${MutableRef.get(currentLyricLine)}"]`).forEach(el => {
      el.classList.remove('lyrics-line--active')
    })
  }
  MutableRef.set(currentLyricLine, index)
  document.querySelectorAll(`[data-lyric-index="${index}"]`).forEach(el => {
    el.classList.add('lyrics-line--active')
  })
  requestAnimationFrame(() => {
    document.querySelectorAll(`[data-lyric-index="${index}"]`).forEach(el => {
      const container = el.closest('.lyrics-box')
      if (container && el instanceof HTMLElement && container instanceof HTMLElement) {
        const containerRect = container.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const isVisible = elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom
        if (!isVisible) container.scrollTop = el.offsetTop - container.offsetTop
      }
    })
  })
}

const unhighlightAllLyricLines = (): void => {
  document.querySelectorAll('.lyrics-line--active').forEach(el => {
    el.classList.remove('lyrics-line--active')
  })
  MutableRef.set(currentLyricLine, -1)
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

export const SONG_TKEYS: Record<string, StringKey> = {
  twinkle: 'musicBoxTwinkle',
  mary: 'musicBoxMary',
  london: 'musicBoxLondon',
  row: 'musicBoxRow',
  oldMac: 'musicBoxOldMac',
  happy: 'musicBoxHappy',
  birthday: 'musicBoxHappyBirthday',
}

export const INST_TKEYS: Record<string, StringKey> = {
  bell: 'musicBoxBell',
  flute: 'musicBoxFlute',
  sawtooth: 'musicBoxSawtooth',
  guitar: 'musicBoxGuitar',
}

const stopFlag = MutableRef.make(false)
const pauseFlag = MutableRef.make(false)
const playbackTempo = MutableRef.make(1)
const playbackTranspose = MutableRef.make(0)
const currentLyricLine = MutableRef.make(-1)

const resetAudioGraph = (): void => {
  resetMusicBoxAudioGraph({ unhighlightAllKeys })
}

export const startWakeMonitor = (): void => {
  startMusicBoxWakeMonitor(resetAudioGraph)
}

export const resetWakeMonitor = (): void => {
  resetMusicBoxWakeMonitor()
}

const playSongCmd = (
  song: Song,
  msg: ReturnType<typeof SongEnded>,
): Command.Command<ReturnType<typeof SongEnded>> => ({
  name: 'PlayMusicBox',
  effect: Effect.gen(function* () {
    MutableRef.set(stopFlag, false)
    MutableRef.set(pauseFlag, false)
    const instr = INSTRUMENTS[MutableRef.get(selectedInstrumentIndex)]
    if (!instr) return msg
    const totalDur = song.notes.reduce((sum, n) => sum + n.dur, 0)
    const nonEmptyIndices = song.lyrics
      .map((line, i) => line === '' ? -1 : i)
      .filter(i => i >= 0)
    const beatsPerLine = totalDur / nonEmptyIndices.length
    let cumDur = 0
    for (let i = 0; i < song.notes.length; i++) {
      if (MutableRef.get(stopFlag)) break
      const note = song.notes[i]!
      if (note.pitch) {
        const tp = transposePitch(note.pitch, MutableRef.get(playbackTranspose))
        const freq = FREQUENCIES[tp]
        if (freq) playScheduledNote(freq, note.dur, instr)
        highlightKey(tp)
      }
      const rawIdx = Math.min(Math.floor(cumDur / beatsPerLine), nonEmptyIndices.length - 1)
      highlightLyricLine(nonEmptyIndices[rawIdx]!)
      cumDur += note.dur
      yield* Effect.sleep((note.dur * 350) / MutableRef.get(playbackTempo))
      unhighlightAllKeys()
      while (MutableRef.get(pauseFlag) && !MutableRef.get(stopFlag)) {
        yield* Effect.sleep(100)
      }
    }
    MutableRef.set(stopFlag, false)
    MutableRef.set(pauseFlag, false)
    unhighlightAllKeys()
    unhighlightAllLyricLines()
    return msg
  }),
})

export const MIN_OCTAVE = -3
export const MAX_OCTAVE = 3

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
  songOrder: S.Array(S.Number),
  hiddenSongs: S.Array(S.Boolean),
  dragIndex: S.Number,
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
export const ToggleSongVisibility = m('MusicBoxToggleSongVisibility', { index: S.Number })
export const SongDragStarted = m('MusicBoxSongDragStarted', { index: S.Number })
export const SongDroppedOn = m('MusicBoxSongDroppedOn', { index: S.Number })
export const SongDragEnded = m('MusicBoxSongDragEnded')

export const Message = S.Union([Play, Stop, SetSong, SetInstrument, SongEnded, NoteOn, NoteOff, AddKey, RemoveKey, OctaveUp, OctaveDown, ToggleBottomKeyboard, ShiftBottom, ShiftTop, TempoUp, TempoDown, ToggleLyrics, TogglePause, TransposeUp, TransposeDown, ToggleSongVisibility, SongDragStarted, SongDroppedOn, SongDragEnded])
export type Message = typeof Message.Type

export const init = (): Model => {
  clearActiveNotes({ unhighlightAllKeys })
  bindMusicBoxKeyboard({
    getInstrument: () => INSTRUMENTS[MutableRef.get(selectedInstrumentIndex)],
    startNote: (pitch, instrument) => startManualNote(pitch, instrument, FREQUENCIES, { highlightKey }),
    stopNote: (pitch) => stopManualNote(pitch, { unhighlightKey }),
    primeAudio: () => {
      getMusicBoxContext()
    },
    clearActiveNotes: () => {
      clearActiveNotes({ unhighlightAllKeys })
    },
  })
  bindShortcutKeys()
  startWakeMonitor()
  MutableRef.set(stopFlag, false)
  MutableRef.set(pauseFlag, false)
  MutableRef.set(selectedInstrumentIndex, 0)
  setKeyboardOctaveOffset(0)
  MutableRef.set(playbackTempo, 1)
  MutableRef.set(playbackTranspose, 0)
  MutableRef.set(currentLyricLine, -1)
  return { selectedSong: 0, selectedInstrument: 0, isPlaying: false, isPaused: false, songTranspose: 0, whiteKeys: 8, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, lyricsExpanded: false, songOrder: SONGS.map((_, i) => i), hiddenSongs: SONGS.map(() => false), dragIndex: -1 }
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
          MutableRef.set(pauseFlag, false)
          return [{ ...model, isPaused: false }, []]
        }
        getMusicBoxContext() // Safari: AudioContext must be created within a user gesture
        MutableRef.set(playbackTempo, model.tempo)
        MutableRef.set(playbackTranspose, model.songTranspose)
        const song = SONGS[model.selectedSong]
        if (!song) return [model, []]
        return [
          { ...model, isPlaying: true, isPaused: false },
          [playSongCmd(song, SongEnded())],
        ]
      },
      MusicBoxStop: () => {
        MutableRef.set(stopFlag, true)
        MutableRef.set(pauseFlag, false)
        stopAllNotes({ unhighlightKey })
        unhighlightAllKeys()
        unhighlightAllLyricLines()
        return [{ ...model, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSetSong: (msg) => {
        if (model.isPlaying) {
          MutableRef.set(stopFlag, true)
          MutableRef.set(pauseFlag, false)
          stopAllNotes({ unhighlightKey })
          unhighlightAllKeys()
        }
        unhighlightAllLyricLines()
        return [{ ...model, selectedSong: msg.value, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSetInstrument: (msg) => {
        MutableRef.set(selectedInstrumentIndex, msg.value)
        return [{ ...model, selectedInstrument: msg.value }, []]
      },
      MusicBoxSongEnded: () => {
        MutableRef.set(pauseFlag, false)
        return [{ ...model, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxNoteOn: (msg) => {
        getMusicBoxContext() // Safari: ensure AudioContext from user gesture
        startManualNote(msg.pitch, INSTRUMENTS[model.selectedInstrument]!, FREQUENCIES, { highlightKey })
        return [model, []]
      },
      MusicBoxNoteOff: (msg) => {
        stopManualNote(msg.pitch, { unhighlightKey })
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
        if (next.tempo !== model.tempo) MutableRef.set(playbackTempo, next.tempo)
        return [next, []]
      },
      MusicBoxTempoDown: () => {
        const t = Math.round((model.tempo - 0.25) * 100) / 100
        const next = t < 0.25 ? model : { ...model, tempo: t }
        if (next.tempo !== model.tempo) MutableRef.set(playbackTempo, next.tempo)
        return [next, []]
      },
      MusicBoxToggleLyrics: () => {
        return [{ ...model, lyricsExpanded: !model.lyricsExpanded }, []]
      },
      MusicBoxTogglePause: () => {
        if (model.isPaused) {
          MutableRef.set(pauseFlag, false)
          return [{ ...model, isPaused: false }, []]
        } else {
          MutableRef.set(pauseFlag, true)
          unhighlightAllKeys()
          return [{ ...model, isPaused: true }, []]
        }
      },
      MusicBoxTransposeUp: () => {
        if (model.songTranspose >= MAX_TRANSPOSE) return [model, []]
        const next = model.songTranspose + 1
        MutableRef.set(playbackTranspose, next)
        return [{ ...model, songTranspose: next }, []]
      },
      MusicBoxTransposeDown: () => {
        if (model.songTranspose <= MIN_TRANSPOSE) return [model, []]
        const next = model.songTranspose - 1
        MutableRef.set(playbackTranspose, next)
        return [{ ...model, songTranspose: next }, []]
      },
      MusicBoxToggleSongVisibility: (msg) => {
        if (msg.index < 0 || msg.index >= SONGS.length) return [model, []]
        const hidden = [...model.hiddenSongs]
        const currentlyHidden = hidden[msg.index] === true
        const visibleCount = model.songOrder.filter(i => !hidden[i]).length
        if (!currentlyHidden && visibleCount <= 1) return [model, []]
        hidden[msg.index] = !hidden[msg.index]
        let selected = model.selectedSong
        if (hidden[msg.index] && selected === msg.index) {
          const visible = model.songOrder.filter(i => !hidden[i])
          selected = visible.length > 0 ? visible[0]! : 0
        }
        return [{ ...model, hiddenSongs: hidden, selectedSong: selected }, []]
      },
      MusicBoxSongDragStarted: (msg) => {
        return [{ ...model, dragIndex: msg.index }, []]
      },
      MusicBoxSongDroppedOn: (msg) => {
        if (model.dragIndex < 0 || model.dragIndex === msg.index) return [{ ...model, dragIndex: -1 }, []]
        const visible = model.songOrder.filter(i => !model.hiddenSongs[i])
        const movedIdx = visible[model.dragIndex]!
        const targetIdx = visible[msg.index]!
        const order = [...model.songOrder]
        const fromPos = order.indexOf(movedIdx)
        const toPos = order.indexOf(targetIdx)
        order.splice(fromPos, 1)
        order.splice(toPos, 0, movedIdx)
        return [{ ...model, songOrder: order, dragIndex: -1 }, []]
      },
      MusicBoxSongDragEnded: () => {
        return [{ ...model, dragIndex: -1 }, []]
      },
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  setKeyboardOctaveOffset(model.octaveOffset)
  const h = html<Message>()
  const topKb = buildKeyboard(shiftStart('C4', model.topShift), model.whiteKeys, model.octaveOffset)
  const topWhite = topKb.keys.filter(k => k.type === 'white')
  const topBlack = topKb.keys.filter(k => k.type === 'black')

  return h.div(
    [h.Class('page')],
    [
        h.div([h.Class('card musicbox-card'), h.Key('card')], [
        h.div([h.Class('musicbox-card-inner'), h.Key('inner')], [
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
                  ...model.songOrder
                    .filter(i => !model.hiddenSongs[i] && i < SONGS.length && SONGS[i] !== undefined)
                    .map(songIdx => {
                      const song = SONGS[songIdx]!
                      const key = SONG_TKEYS[song.key]
                      return h.option(
                        [h.Value(songIdx.toString())],
                        [`${song.emoji} ${t(key ?? 'musicBoxTwinkle', language)}`],
                      )
                    }),
                ],
              ),
            ]),
            h.div([h.Class('playback-btns')], [
              h.button(
                [h.Id('musicbox-play'), h.OnClick(Play()), h.Class('btn btn-tiny musicbox-inline-btn'), h.Disabled(model.isPlaying && !model.isPaused)],
                [h.svg([h.ViewBox('0 0 24 24'), h.Width('18'), h.Height('18'), h.Fill('currentColor')], [
                  h.path([h.D('M6 3l14 9-14 9V3z')], []),
                ])],
              ),
              h.button(
                [h.Id('musicbox-pause'), h.OnClick(TogglePause()), h.Class('btn btn-tiny musicbox-inline-btn'), h.Disabled(!model.isPlaying || model.isPaused)],
                [h.svg([h.ViewBox('0 0 24 24'), h.Width('18'), h.Height('18'), h.Fill('currentColor')], [
                  h.rect([h.X('5'), h.Y('3'), h.Width('4'), h.Height('18'), h.Attribute('rx', '1')], []),
                  h.rect([h.X('15'), h.Y('3'), h.Width('4'), h.Height('18'), h.Attribute('rx', '1')], []),
                ])],
              ),
              h.button(
                [h.Id('musicbox-stop'), h.OnClick(Stop()), h.Class('btn btn-tiny musicbox-inline-btn'), h.Disabled(!model.isPlaying)],
                [h.svg([h.ViewBox('0 0 24 24'), h.Width('18'), h.Height('18'), h.Fill('currentColor')], [
                  h.rect([h.X('4'), h.Y('4'), h.Width('16'), h.Height('16'), h.Attribute('rx', '2')], []),
                ])],
              ),
            ]),
            h.div([h.Class('musicbox-dropdown')], [
              h.label([h.Class('musicbox-dropdown-label')], [t('musicBoxSpeed', language)]),
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
            ]),
            h.div([h.Class('musicbox-dropdown')], [
              h.label([h.Class('musicbox-dropdown-label')], [t('musicBoxTranspose', language)]),
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
          ]),

          h.div(
            [h.Class('lyrics-box' + (model.lyricsExpanded ? '' : ' lyrics-box--compact')), h.OnClick(ToggleLyrics())],
            (SONGS[model.selectedSong]?.lyrics ?? []).map((line, idx) =>
              line === ''
                ? h.div([h.Class('lyrics-gap')], [])
                : h.p([h.Class('lyrics-line'), h.Attribute('data-lyric-index', idx.toString())], [line]),
              ),
            ),
          ]),

        h.div([h.Class('piano-controls'), h.Key('controls')], [
          h.button(
            [h.Id('octave-down'), h.OnClick(OctaveDown()), h.Class('btn btn-tiny'), h.Disabled(model.octaveOffset <= MIN_OCTAVE)],
            ['−8'],
          ),
          h.span([h.Class('octave-indicator')], [model.octaveOffset > 0 ? `+${model.octaveOffset}` : `${model.octaveOffset}`]),
          h.button(
            [h.Id('octave-up'), h.OnClick(OctaveUp()), h.Class('btn btn-tiny'), h.Disabled(model.octaveOffset >= MAX_OCTAVE)],
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
            h.span([h.Class('piano-toggle-text')], [t('musicBoxShowBottom', language)]),
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
        renderPiano(h, topWhite, topBlack, topKb.blacks, model.whiteKeys, 'top', 'piano-top'),
        h.div([h.Class('shift-controls-row'), h.Key('shift-row')], [
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
              renderPiano(h, botWhite, botBlack, botKb.blacks, model.whiteKeys, 'bot', 'piano-bot'),
            ]
          })()
          : []),
        h.div([h.Class('keybind-info'), h.Key('keybind')], [
          'i',
          h.div([h.Class('tooltip')], ['Z/X: Octave  Space: Play/Pause  QWERTY: Piano']),
        ]),
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
      const elWithPitch = el.closest('[data-pitch]')
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
  vnodeKey?: string,
) => {
  return h.div([
    h.Class('piano-container'),
    h.Style({ touchAction: 'none' }),
    ...(vnodeKey ? [h.Key(vnodeKey)] : []),
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
