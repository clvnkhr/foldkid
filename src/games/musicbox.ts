import { Effect, Match as M, MutableRef, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { getContext, resetContext } from '../audio'
import { t, type StringKey } from '../i18n'
import {
  createMusicBoxAudioRuntime,
} from './musicboxAudioRuntime'
import {
  createMusicBoxKeyboardRuntime,
} from './musicboxKeyboardRuntime'
import {
  createMusicBoxWakeMonitor,
} from './musicboxWakeMonitor'
import {
  buildKeyboard,
  MUSICBOX_FREQUENCIES,
  Pitch,
  shiftStart,
  transposePitch,
  type DrumHit,
  type Instrument,
  type KeyDef,
  type Note,
  type Song,
} from './musicboxDomain'

export {
  QWERTY_BLACKS,
  QWERTY_WHITES,
} from './musicboxKeyboardRuntime'
export { DRUM_KINDS, FREQUENCIES, buildKeyboard, shiftStart } from './musicboxDomain'

export const MIN_WHITE_KEYS = 1
export const MAX_WHITE_KEYS = 15
export const MIN_TRANSPOSE = -12
export const MAX_TRANSPOSE = 12

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

const audioRuntime = createMusicBoxAudioRuntime({
  getContext,
  resetContext,
  frequencies: MUSICBOX_FREQUENCIES,
  hooks: {
    highlightKey,
    unhighlightKey,
    unhighlightAllKeys,
  },
})

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

const songDuration = (notes: readonly Note[]): number =>
  notes.reduce((sum, note) => sum + note.dur, 0)

const pushDrum = (drums: DrumHit[], total: number, hit: DrumHit): void => {
  if (hit.at < total) drums.push(hit)
}

const makeFourFourDrums = (notes: readonly Note[]): DrumHit[] => {
  const total = songDuration(notes)
  const drums: DrumHit[] = []
  for (let at = 0; at < total; at += 4) drums.push({ at, kind: 'kick', gain: 0.55 })
  for (let at = 2; at < total; at += 4) drums.push({ at, kind: 'snare', gain: 0.45 })
  for (let at = 1; at < total; at += 2) drums.push({ at, kind: 'hat', gain: 0.35 })
  return drums
}

const makeSixEightDrums = (notes: readonly Note[], offset = 0): DrumHit[] => {
  const total = songDuration(notes)
  const drums: DrumHit[] = []
  for (let at = offset; at < total; at += 3) {
    pushDrum(drums, total, { at, kind: 'kick', gain: 0.5 })
    pushDrum(drums, total, { at: at + 0.5, kind: 'hat', gain: 0.22 })
    pushDrum(drums, total, { at: at + 1, kind: 'hat', gain: 0.18 })
    pushDrum(drums, total, { at: at + 1.5, kind: 'snare', gain: 0.35 })
    pushDrum(drums, total, { at: at + 2, kind: 'hat', gain: 0.22 })
    pushDrum(drums, total, { at: at + 2.5, kind: 'hat', gain: 0.18 })
  }
  return drums
}

const makeThreeFourDrums = (notes: readonly Note[]): DrumHit[] => {
  const total = songDuration(notes)
  const drums: DrumHit[] = []
  for (let at = 0; at < total; at += 3) {
    pushDrum(drums, total, { at, kind: 'kick', gain: 0.48 })
    pushDrum(drums, total, { at: at + 1, kind: 'hat', gain: 0.24 })
    pushDrum(drums, total, { at: at + 2, kind: 'snare', gain: 0.34 })
  }
  return drums
}

const makeHappyDrums = (notes: readonly Note[]): DrumHit[] => {
  const actionDrums: DrumHit[] = []
  const actionRanges: Array<{ start: number; end: number }> = []
  let at = 0
  let restIndex = 0
  for (const note of notes) {
    if (!note.pitch) {
      const verseIndex = Math.floor(restIndex / 6)
      const kind = verseIndex === 0 ? 'clap' : verseIndex === 1 ? 'stomp' : 'cheer'
      actionRanges.push({ start: at, end: at + note.dur })
      actionDrums.push({ at, kind, gain: kind === 'stomp' ? 0.9 : 0.75 })
      restIndex += 1
    }
    at += note.dur
  }
  return [
    ...makeSixEightDrums(notes, 1.5).filter(drum =>
      !actionRanges.some(({ start, end }) => drum.at >= start - 0.0001 && drum.at < end - 0.0001),
    ),
    ...actionDrums,
  ].sort((a, b) => a.at - b.at)
}

const withDrums = (
  song: Omit<Song, 'drums'>,
  makeDrums: (notes: readonly Note[]) => DrumHit[] = makeFourFourDrums,
): Song => ({
  ...song,
  drums: makeDrums(song.notes),
})

export const SONGS: Song[] = [
  withDrums({
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
  }),
  withDrums({
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
  }),
  withDrums({
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
  }),
  withDrums({
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
  }, makeSixEightDrums),
  withDrums({
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
  }),
  withDrums({
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
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 0.5 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'G4', dur: 1.5 },
      { pitch: '', dur: 1.5 }, { pitch: '', dur: 1.5 },
      { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'F4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'A4', dur: 1.5 },
      { pitch: '', dur: 1.5 }, { pitch: '', dur: 1.5 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
      { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 0.5 },
      { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 0.5 },
      { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 0.5 },
      { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 0.5 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
      { pitch: 'A4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
      { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
      { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 0.5 },
      { pitch: 'D4', dur: 1 }, { pitch: 'E4', dur: 0.5 },
      { pitch: 'F4', dur: 1.5 },
      { pitch: '', dur: 1.5 }, { pitch: '', dur: 1.5 },
    ], 3),
  }, makeHappyDrums),
  withDrums({
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
  }, makeThreeFourDrums),
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

const keyboardRuntime = createMusicBoxKeyboardRuntime({
  document,
  frequencies: MUSICBOX_FREQUENCIES,
  getInstrument: () => INSTRUMENTS[MutableRef.get(selectedInstrumentIndex)],
  audio: audioRuntime,
})

export const resetKeyboardControls = (): void => {
  keyboardRuntime.reset()
}

const stopFlag = MutableRef.make(false)
const pauseFlag = MutableRef.make(false)
const playbackTempo = MutableRef.make(1)
const playbackTranspose = MutableRef.make(0)
const playbackDrumVolume = MutableRef.make(1)
const currentLyricLine = MutableRef.make(-1)

const resetAudioGraph = (): void => {
  audioRuntime.resetGraph()
}

const wakeMonitor = createMusicBoxWakeMonitor({
  getWindow: () => typeof window === 'undefined' ? undefined : window,
  resetGraph: resetAudioGraph,
  now: () => Date.now(),
})

export const startWakeMonitor = (): void => {
  wakeMonitor.start()
}

export const resetWakeMonitor = (): void => {
  wakeMonitor.reset()
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
    const drums = [...song.drums].sort((a, b) => a.at - b.at)
    let drumIndex = 0
    const playDrum = (drum: DrumHit): void => {
      const volume = MutableRef.get(playbackDrumVolume)
      if (volume <= 0) return
      audioRuntime.playDrumHit({ kind: drum.kind, gain: (drum.gain ?? 1) * volume })
    }
    let cumDur = 0
    for (let i = 0; i < song.notes.length; i++) {
      if (MutableRef.get(stopFlag)) break
      const note = song.notes[i]!
      while (drumIndex < drums.length && drums[drumIndex]!.at <= cumDur + 0.0001) {
        playDrum(drums[drumIndex]!)
        drumIndex += 1
      }
      if (note.pitch) {
        const tp = transposePitch(note.pitch, MutableRef.get(playbackTranspose))
        const pitch = Pitch.fromString(tp, MUSICBOX_FREQUENCIES)
        if (pitch) audioRuntime.playScheduledNote({ pitch, duration: note.dur }, instr)
        highlightKey(tp)
      }
      const rawIdx = Math.min(Math.floor(cumDur / beatsPerLine), nonEmptyIndices.length - 1)
      highlightLyricLine(nonEmptyIndices[rawIdx]!)
      const noteEnd = cumDur + note.dur
      let segmentStart = cumDur
      while (drumIndex < drums.length && drums[drumIndex]!.at < noteEnd - 0.0001) {
        const drum = drums[drumIndex]!
        if (drum.at > segmentStart + 0.0001) {
          yield* Effect.sleep(((drum.at - segmentStart) * 350) / MutableRef.get(playbackTempo))
          if (MutableRef.get(stopFlag)) break
          while (MutableRef.get(pauseFlag) && !MutableRef.get(stopFlag)) {
            yield* Effect.sleep(100)
          }
        }
        playDrum(drum)
        segmentStart = drum.at
        drumIndex += 1
      }
      if (MutableRef.get(stopFlag)) break
      cumDur += note.dur
      yield* Effect.sleep(((noteEnd - segmentStart) * 350) / MutableRef.get(playbackTempo))
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
export const MIN_DRUM_VOLUME = 0
export const MAX_DRUM_VOLUME = 1

const clampDrumVolume = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_DRUM_VOLUME, Math.max(MIN_DRUM_VOLUME, Math.round(value * 100) / 100))
    : 1

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
  drumVolume: S.Number,
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
export const SetDrumVolume = m('MusicBoxSetDrumVolume', { value: S.Number })
export const ToggleSongVisibility = m('MusicBoxToggleSongVisibility', { index: S.Number })
export const SongDragStarted = m('MusicBoxSongDragStarted', { index: S.Number })
export const SongDroppedOn = m('MusicBoxSongDroppedOn', { index: S.Number })
export const SongDragEnded = m('MusicBoxSongDragEnded')

export const Message = S.Union([Play, Stop, SetSong, SetInstrument, SongEnded, NoteOn, NoteOff, AddKey, RemoveKey, OctaveUp, OctaveDown, ToggleBottomKeyboard, ShiftBottom, ShiftTop, TempoUp, TempoDown, ToggleLyrics, TogglePause, TransposeUp, TransposeDown, SetDrumVolume, ToggleSongVisibility, SongDragStarted, SongDroppedOn, SongDragEnded])
export type Message = typeof Message.Type

export const init = (): Model => {
  audioRuntime.clearActiveNotes()
  keyboardRuntime.bind()
  startWakeMonitor()
  MutableRef.set(stopFlag, false)
  MutableRef.set(pauseFlag, false)
  MutableRef.set(selectedInstrumentIndex, 0)
  keyboardRuntime.setOctaveOffset(0)
  MutableRef.set(playbackTempo, 1)
  MutableRef.set(playbackTranspose, 0)
  MutableRef.set(playbackDrumVolume, 1)
  MutableRef.set(currentLyricLine, -1)
  return { selectedSong: 0, selectedInstrument: 0, isPlaying: false, isPaused: false, songTranspose: 0, whiteKeys: 8, showBottomKeyboard: false, octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, drumVolume: 1, lyricsExpanded: false, songOrder: SONGS.map((_, i) => i), hiddenSongs: SONGS.map(() => false), dragIndex: -1 }
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
        audioRuntime.primeFromGesture() // Safari: AudioContext must be created within a user gesture
        MutableRef.set(playbackTempo, model.tempo)
        MutableRef.set(playbackTranspose, model.songTranspose)
        MutableRef.set(playbackDrumVolume, clampDrumVolume(model.drumVolume))
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
        audioRuntime.stopAllManualNotes()
        unhighlightAllKeys()
        unhighlightAllLyricLines()
        return [{ ...model, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSetSong: (msg) => {
        if (model.isPlaying) {
          MutableRef.set(stopFlag, true)
          MutableRef.set(pauseFlag, false)
          audioRuntime.stopAllManualNotes()
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
        audioRuntime.primeFromGesture() // Safari: ensure AudioContext from user gesture
        const pitch = Pitch.fromString(msg.pitch, MUSICBOX_FREQUENCIES)
        if (pitch) audioRuntime.startManualNote(pitch, INSTRUMENTS[model.selectedInstrument]!)
        return [model, []]
      },
      MusicBoxNoteOff: (msg) => {
        const pitch = Pitch.fromString(msg.pitch, MUSICBOX_FREQUENCIES)
        if (pitch) audioRuntime.stopManualNote(pitch)
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
      MusicBoxSetDrumVolume: (msg) => {
        const next = clampDrumVolume(msg.value)
        MutableRef.set(playbackDrumVolume, next)
        return [{ ...model, drumVolume: next }, []]
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
  keyboardRuntime.setOctaveOffset(model.octaveOffset)
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
          h.Class(`piano-key piano-white${MUSICBOX_FREQUENCIES.get(k.pitch) ? '' : ' piano-key-disabled'}`),
          ...(MUSICBOX_FREQUENCIES.get(k.pitch) ? [h.Attribute('data-pitch', k.pitch)] : []),
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
          h.Class(`piano-key piano-black${MUSICBOX_FREQUENCIES.get(k.pitch) ? '' : ' piano-key-disabled'}`),
          ...(MUSICBOX_FREQUENCIES.get(k.pitch) ? [h.Attribute('data-pitch', k.pitch)] : []),
          h.Key(`${prefix}-${k.pitch}`),
          h.Style({ left: `calc(${boundary} / ${whiteCount} * 100%)` }),
        ], [
          h.div([h.Class('piano-key-glow')], []),
        ])
      }),
    ]),
  ])
}
