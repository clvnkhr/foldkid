import { MUSICBOX_FREQUENCIES, type FrequencyTable, type Pitch } from './musicboxDomain'

export type PitchClass =
  | 'C' | 'C#' | 'Db' | 'D' | 'D#' | 'Eb' | 'E' | 'F'
  | 'F#' | 'Gb' | 'G' | 'G#' | 'Ab' | 'A' | 'A#' | 'Bb' | 'B'

export type MusicalMode = 'major' | 'minor'

export interface MusicalKey {
  readonly tonic: PitchClass
  readonly mode: MusicalMode
}

const CHROMATIC: readonly PitchClass[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MAJOR_TONICS: readonly PitchClass[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_TONICS: readonly PitchClass[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
const FLAT_EQUIVALENTS: Partial<Record<PitchClass, PitchClass>> = {
  Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
}

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const

const wrap = (semitones: number): number => ((semitones % 12) + 12) % 12
const tonicIndex = (tonic: PitchClass): number => CHROMATIC.indexOf(FLAT_EQUIVALENTS[tonic] ?? tonic)

export const transposeKey = (key: MusicalKey, semitones: number): MusicalKey => {
  if (!Number.isSafeInteger(semitones) || wrap(semitones) === 0) return key
  const tonics = key.mode === 'major' ? MAJOR_TONICS : MINOR_TONICS
  return { tonic: tonics[wrap(tonicIndex(key.tonic) + wrap(semitones))]!, mode: key.mode }
}

export const tonicLabel = (key: MusicalKey): string => key.tonic.replace('#', '♯').replace('b', '♭')

// Playback pitch classes use the same sharp spellings as the frequency table.
export const scalePitchClasses = (key: MusicalKey): readonly PitchClass[] =>
  SCALE_INTERVALS[key.mode].map(interval => CHROMATIC[wrap(tonicIndex(key.tonic) + interval)]!)

export type AccompanimentChords = Readonly<Record<'tonic' | 'subdominant' | 'dominant', readonly Pitch[]>>

// Minor keys use the natural-minor scale; a raised leading note must be an explicit arrangement choice.
export const accompanimentChords = (
  key: MusicalKey,
  octave = 3,
  frequencies: FrequencyTable = MUSICBOX_FREQUENCIES,
): AccompanimentChords | undefined => {
  if (!Number.isSafeInteger(octave)) return undefined
  const intervals = SCALE_INTERVALS[key.mode]
  const root = octave * 12 + tonicIndex(key.tonic)
  const triad = (degree: number): readonly Pitch[] | undefined => {
    const pitches = [degree, degree + 2, degree + 4].map(index => {
      const semitone = root + intervals[index % 7]! + 12 * Math.floor(index / 7)
      return frequencies.pitch(`${CHROMATIC[wrap(semitone)]}${Math.floor(semitone / 12)}`)
    })
    return pitches.every((pitch): pitch is Pitch => pitch !== undefined) ? pitches : undefined
  }
  const tonic = triad(0)
  const subdominant = triad(3)
  const dominant = triad(4)
  return tonic && subdominant && dominant ? { tonic, subdominant, dominant } : undefined
}
