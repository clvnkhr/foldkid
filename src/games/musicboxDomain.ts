export interface Note {
  pitch: string
  dur: number
}

export interface Song {
  key: string
  emoji: string
  notes: Note[]
  lyrics: string[]
}

export interface HarmonicDef {
  readonly ratio: number
  readonly gain: number
}

export interface Instrument {
  readonly key: string
  readonly type: OscillatorType
  readonly gain: number
  readonly attack: number
  readonly decay: number
  readonly sustain: number
  readonly release: number
  readonly harmonics: readonly HarmonicDef[]
  readonly filterType?: BiquadFilterType
  readonly filterFreq?: FrequencyHz
  readonly filterQ?: number
  readonly detune?: number
  readonly tremoloFreq?: FrequencyHz
  readonly tremoloDepth?: number
}

declare const PitchBrand: unique symbol
export type Pitch = string & { readonly [PitchBrand]: true }

export const Pitch = {
  unsafe: (value: string): Pitch => value as Pitch,
  fromString: (value: string, frequencies: FrequencyTable = MUSICBOX_FREQUENCIES): Pitch | undefined =>
    frequencies.has(value) ? value : undefined,
}

declare const FrequencyHzBrand: unique symbol
export type FrequencyHz = number & { readonly [FrequencyHzBrand]: true }

export const FrequencyHz = {
  unsafe: (value: number): FrequencyHz => value as FrequencyHz,
}

export interface FrequencyTable {
  readonly values: Readonly<Record<string, FrequencyHz>>
  readonly get: (pitch: string) => FrequencyHz | undefined
  readonly has: (value: string) => value is Pitch
  readonly pitch: (value: string) => Pitch | undefined
}

export interface KeyDef {
  pitch: Pitch
  type: 'white' | 'black'
}

export interface KeyboardDef {
  keys: KeyDef[]
  blacks: Record<string, number>
}

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

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

export const createFrequencyTable = (values: Readonly<Record<string, number>>): FrequencyTable => {
  const brandedValues = Object.fromEntries(
    Object.entries(values).map(([pitch, frequency]) => [pitch, FrequencyHz.unsafe(frequency)]),
  ) as Record<string, FrequencyHz>
  return {
    values: brandedValues,
    get: (pitch) => brandedValues[pitch],
    has: (value): value is Pitch => brandedValues[value] !== undefined,
    pitch: (value) => brandedValues[value] === undefined ? undefined : Pitch.unsafe(value),
  }
}

export const MUSICBOX_FREQUENCIES = createFrequencyTable(FREQUENCIES)

export const transposePitch = (
  pitch: string,
  semitones: number,
  frequencies: FrequencyTable = MUSICBOX_FREQUENCIES,
): string => {
  if (!pitch) return pitch
  const note = pitch.slice(0, -1)
  const octave = parseInt(pitch.slice(-1))
  const semiIdx = CHROMATIC_NOTES.indexOf(note)
  if (semiIdx === -1) return pitch
  const newIdx = semiIdx + semitones
  const newOctave = octave + Math.floor(newIdx / 12)
  const newNote = CHROMATIC_NOTES[((newIdx % 12) + 12) % 12]!
  const result = `${newNote}${newOctave}`
  return frequencies.has(result) ? result : pitch
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

export const buildKeyboard = (
  start: string,
  whiteCount: number,
  octaveOffset = 0,
  frequencies: FrequencyTable = MUSICBOX_FREQUENCIES,
): KeyboardDef => {
  const startWhiteNote = start[0] ?? ''
  const startOctave = parseInt(start.slice(-1)) + octaveOffset
  const startWhiteIdx = WHITE_NOTES.indexOf(startWhiteNote)
  const keys: KeyDef[] = []
  const blacks: Record<string, number> = {}

  const prevWhiteIdx = (startWhiteIdx - 1 + 7) % 7
  const prevBlack = getBlackBetween(WHITE_NOTES[prevWhiteIdx]!)
  if (prevBlack) {
    const prevOctave = startOctave + Math.floor((startWhiteIdx - 1) / 7)
    const bp = `${prevBlack}${prevOctave}`
    const pitch = frequencies.pitch(bp)
    if (pitch) {
      keys.push({ pitch, type: 'black' })
      blacks[bp] = 0
    }
  }

  for (let i = 0; i < whiteCount; i++) {
    const wi = (startWhiteIdx + i) % 7
    const oct = startOctave + Math.floor((startWhiteIdx + i) / 7)
    const whitePitchName = `${WHITE_NOTES[wi]}${oct}`
    const whitePitch = frequencies.pitch(whitePitchName)
    if (whitePitch) keys.push({ pitch: whitePitch, type: 'white' })

    const black = getBlackBetween(WHITE_NOTES[wi]!)
    if (black) {
      const bp = `${black}${oct}`
      const pitch = frequencies.pitch(bp)
      if (pitch) {
        keys.push({ pitch, type: 'black' })
        blacks[bp] = i + 1
      }
    }
  }

  return { keys, blacks }
}
