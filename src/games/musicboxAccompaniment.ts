import { MUSICBOX_FREQUENCIES, transposePitch, type Pitch, type Song } from './musicboxDomain'
import { accompanimentChords, type AccompanimentChords } from './musicboxTheory'

export const ACCOMPANIMENT_STYLES = ['off', 'chords', 'arpeggio'] as const
export type AccompanimentStyle = typeof ACCOMPANIMENT_STYLES[number]

export interface AccompanimentEvent {
  readonly at: number
  readonly dur: number
  readonly pitches: readonly Pitch[]
  readonly voice: 'bass' | 'chord'
  readonly gain: number
}

type Degree = 'I' | 'IV' | 'V'
type Change = readonly [at: number, degree: Degree]
interface Arrangement {
  readonly length: number
  readonly cycle: number
  readonly meter: 2 | 3 | 4
  readonly compound?: boolean
  readonly pickup?: number
  readonly changes: readonly Change[]
  readonly quiet?: readonly (readonly [start: number, end: number])[]
  readonly meterResets?: readonly number[]
  readonly actionGaps?: boolean
}

// Times refer to the authored melodies, including their pickups and repeated verses.
// I, IV and V are arranged phrase harmonies, rather than guesses from individual notes.
const ARRANGEMENTS: Readonly<Record<string, Arrangement>> = {
  twinkle: { length: 96, cycle: 48, meter: 4, changes: [
    [0, 'I'], [4, 'IV'], [6, 'I'], [8, 'IV'], [10, 'I'], [12, 'V'], [14, 'I'],
    [18, 'IV'], [20, 'I'], [22, 'V'], [24, 'I'], [26, 'IV'], [28, 'I'], [30, 'V'],
    [32, 'I'], [36, 'IV'], [38, 'I'], [40, 'IV'], [42, 'I'], [44, 'V'], [46, 'I'],
  ] },
  mary: { length: 160, cycle: 32, meter: 4, changes: [
    [0, 'I'], [8, 'V'], [12, 'I'], [24, 'V'], [28, 'I'],
  ] },
  london: { length: 96, cycle: 32, meter: 4, changes: [
    [0, 'I'], [8, 'V'], [12, 'I'], [24, 'V'], [28, 'I'],
  ] },
  row: { length: 120, cycle: 24, meter: 3, compound: true, changes: [
    [0, 'I'], [18, 'V'], [21, 'I'],
  ] },
  oldMac: { length: 256, cycle: 64, meter: 4, changes: [
    [0, 'I'], [4, 'IV'], [6, 'I'], [10, 'V'], [12, 'I'], [20, 'IV'], [22, 'I'],
    [26, 'V'], [28, 'I'], [52, 'IV'], [54, 'I'], [58, 'V'], [60, 'I'],
  ] },
  incy: { length: 48, cycle: 48, meter: 3, compound: true, pickup: 0.5, changes: [
    [0, 'I'], [6.5, 'V'], [9.5, 'I'], [15.5, 'V'], [18.5, 'IV'], [21.5, 'I'],
    [30.5, 'V'], [33.5, 'I'], [42.5, 'V'], [45.5, 'I'],
  ] },
  fish: { length: 32, cycle: 16, meter: 4, changes: [
    [0, 'I'], [6, 'IV'], [10, 'V'], [12, 'IV'], [14, 'V'], [14.5, 'I'],
  ] },
  duke: { length: 65, cycle: 32, meter: 4, pickup: 1, changes: [
    [0, 'I'], [9, 'V'], [17, 'I'], [21, 'IV'], [25, 'I'], [27, 'V'], [29, 'I'],
  ] },
  frere: { length: 64, cycle: 32, meter: 4, changes: [
    [0, 'I'], [16, 'V'], [18, 'I'], [20, 'V'], [22, 'I'],
  ] },
  happy: { length: 144, cycle: 48, meter: 3, compound: true, pickup: 1.5, actionGaps: true, changes: [
    [0, 'I'], [6, 'V'], [18, 'I'], [25.5, 'IV'], [31.5, 'I'],
    [37.5, 'V'], [42, 'IV'], [43.5, 'I'],
  ] },
  // This arrangement holds the third phrase for an extra beat. The final waltz
  // phrase begins at 20, after its B-flat pickup, rather than on the earlier grid.
  birthday: { length: 25, cycle: 25, meter: 3, pickup: 1, quiet: [[19, 20]], meterResets: [20], changes: [
    [0, 'I'], [4, 'V'], [10, 'I'], [16, 'V'], [17, 'IV'], [20, 'I'], [22, 'V'], [23, 'I'],
  ] },
  baaBaa: { length: 32, cycle: 32, meter: 2, changes: [
    [0, 'I'], [4, 'IV'], [6, 'I'], [8, 'IV'], [10, 'I'], [12, 'V'], [14, 'I'],
    [20, 'IV'], [22, 'I'], [24, 'IV'], [26, 'I'], [28, 'V'], [30, 'I'],
  ] },
  hickory: { length: 24, cycle: 24, meter: 3, compound: true, changes: [
    [0, 'I'], [13.5, 'V'], [15, 'IV'], [16.5, 'V'], [21, 'I'],
  ] },
  hotCross: { length: 32, cycle: 32, meter: 4, changes: [
    [0, 'I'], [2, 'V'], [4, 'I'], [10, 'V'], [12, 'I'], [20, 'V'],
    [24, 'I'], [26, 'V'], [28, 'I'],
  ] },
  blindMice: { length: 36, cycle: 36, meter: 3, compound: true, changes: [
    [0, 'I'], [1.5, 'V'], [3, 'I'], [6, 'V'], [7.5, 'IV'], [9, 'I'],
    [13.5, 'V'], [15, 'I'], [16.5, 'V'], [18, 'I'], [19.5, 'V'], [21, 'I'],
    [22.5, 'V'], [24, 'I'], [25.5, 'V'], [27, 'I'], [27.5, 'V'],
    [30, 'I'], [31.5, 'V'], [33, 'I'],
  ] },
  polly: { length: 32, cycle: 32, meter: 2, changes: [
    [0, 'I'], [4, 'V'], [8, 'I'], [12, 'IV'], [13, 'V'], [14, 'I'],
    [17, 'IV'], [18, 'I'], [20, 'IV'], [22, 'V'], [24, 'I'], [25, 'IV'],
    [26, 'I'], [28, 'IV'], [29, 'V'], [30, 'I'],
  ] },
  humpty: { length: 24, cycle: 24, meter: 3, compound: true, changes: [
    [0, 'I'], [1.5, 'IV'], [3, 'V'], [4.5, 'I'], [6, 'I'], [7.5, 'IV'],
    [9, 'I'], [10.5, 'V'], [12, 'I'], [13.5, 'IV'], [15, 'V'], [16.5, 'I'],
    [19.5, 'IV'], [21, 'V'], [22.5, 'I'],
  ] },
  jackJill: { length: 24, cycle: 24, meter: 3, compound: true, changes: [
    [0, 'I'], [6, 'V'], [9, 'I'], [15, 'IV'], [18, 'V'], [21, 'I'],
  ] },
  heyDiddle: { length: 24, cycle: 24, meter: 3, compound: true, changes: [
    [0, 'I'], [9, 'V'], [12, 'IV'], [18, 'I'],
  ] },
  thisOldMan: { length: 32, cycle: 32, meter: 4, changes: [
    [0, 'I'], [8, 'IV'], [12, 'V'], [16, 'I'], [24, 'V'], [28, 'I'],
  ] },
  boPeep: { length: 24, cycle: 24, meter: 3, compound: true, changes: [
    [0, 'I'], [3, 'V'], [6, 'I'], [6.5, 'IV'], [7, 'V'], [8.5, 'I'],
    [10.5, 'V'], [12, 'I'], [15, 'IV'], [15.5, 'V'], [18, 'I'], [19.5, 'V'], [21, 'I'],
  ] },
}

const DEGREE_CHORD: Readonly<Record<Degree, keyof AccompanimentChords>> = {
  I: 'tonic', IV: 'subdominant', V: 'dominant',
}
const TONICS = new Set(['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'])

const validMelody = (song: Song, arrangement: Arrangement): boolean => {
  if (!Array.isArray(song.notes) || !song.tonality || !TONICS.has(song.tonality.tonic)
    || !['major', 'minor'].includes(song.tonality.mode)) return false
  let total = 0
  let sounding = false
  for (const note of song.notes) {
    if (!note || !Number.isFinite(note.dur) || note.dur <= 0 || typeof note.pitch !== 'string'
      || (note.pitch !== '' && !MUSICBOX_FREQUENCIES.has(note.pitch))) return false
    total += note.dur
    sounding ||= note.pitch !== ''
    if (total > arrangement.length) return false
  }
  return sounding && total === arrangement.length
}

const degreeAt = (arrangement: Arrangement, at: number): Degree => {
  const local = at % arrangement.cycle
  let degree: Degree = 'I'
  for (const [start, next] of arrangement.changes) {
    if (start > local) break
    degree = next
  }
  return degree
}

type Quiet = readonly [start: number, end: number]
const quietSpans = (song: Song, arrangement: Arrangement): readonly Quiet[] => {
  const quiet: Quiet[] = []
  for (let start = 0; start < arrangement.length; start += arrangement.cycle) {
    if (arrangement.pickup) quiet.push([start, start + arrangement.pickup])
    for (const [from, to] of arrangement.quiet ?? []) quiet.push([start + from, start + to])
  }
  if (arrangement.actionGaps) {
    let at = 0
    for (const note of song.notes) {
      if (!note.pitch) quiet.push([at, at + note.dur])
      at += note.dur
    }
  }
  return quiet.sort(([a], [b]) => a - b)
}

// Keep each chord root in octave 3, even when the key helper's upward voicing
// crosses an octave; derive a separate octave-2 bass before applying transposition.
const voicePitches = (chords: AccompanimentChords, transpose: number): Readonly<Record<Degree, {
  readonly bass: Pitch
  readonly chord: readonly Pitch[]
}>> | undefined => {
  const voices: Partial<Record<Degree, { bass: Pitch; chord: readonly Pitch[] }>> = {}
  for (const degree of ['I', 'IV', 'V'] as const) {
    const original = chords[DEGREE_CHORD[degree]]
    const rootOctave = Number(original[0]!.slice(-1))
    const chord = original.map(pitch => transposePitch(pitch, (3 - rootOctave) * 12))
    const bass = transposePitch(chord[0]!, -12)
    const shift = (pitch: string): Pitch | undefined => {
      const result = transposePitch(pitch, transpose)
      if (transpose !== 0 && result === pitch) return undefined
      return MUSICBOX_FREQUENCIES.pitch(result)
    }
    const shiftedChord = chord.map(shift)
    const shiftedBass = shift(bass)
    if (!shiftedBass || !shiftedChord.every((pitch): pitch is Pitch => pitch !== undefined)) return undefined
    voices[degree] = { bass: shiftedBass, chord: shiftedChord }
  }
  return voices as Readonly<Record<Degree, { readonly bass: Pitch; readonly chord: readonly Pitch[] }>>
}

export const buildAccompaniment = (
  song: Song,
  style: AccompanimentStyle,
  transpose = 0,
): readonly AccompanimentEvent[] => {
  if (!song || typeof song.key !== 'string' || style === 'off' || !['chords', 'arpeggio'].includes(style) || !Number.isSafeInteger(transpose)
    || !Object.hasOwn(ARRANGEMENTS, song.key)) return []
  const arrangement = ARRANGEMENTS[song.key]!
  if (!validMelody(song, arrangement)) return []
  const chords = accompanimentChords(song.tonality)
  const voices = chords && voicePitches(chords, transpose)
  if (!voices) return []
  const quiet = quietSpans(song, arrangement)
  const events: AccompanimentEvent[] = []
  const push = (at: number, dur: number, pitches: readonly Pitch[], voice: AccompanimentEvent['voice'], gain: number): void => {
    if (quiet.some(([start, end]) => at >= start && at < end)) return
    const nextQuiet = quiet.find(([start]) => start > at)?.[0] ?? arrangement.length
    const cycleStart = Math.floor(at / arrangement.cycle) * arrangement.cycle
    const nextChange = arrangement.changes.find(([start]) => start > at - cycleStart)?.[0] ?? arrangement.cycle
    const clipped = Math.min(dur, arrangement.length - at, nextQuiet - at, cycleStart + nextChange - at)
    if (clipped > 0) events.push({ at, dur: clipped, pitches, voice, gain })
  }
  const starts = [arrangement.pickup ?? 0, ...arrangement.meterResets ?? [], arrangement.length]
  for (let section = 0; section < starts.length - 1; section++) {
    const start = starts[section]!
    const end = starts[section + 1]!
    const pulse = arrangement.compound ? 1.5 : 1
    const bassStep = arrangement.meter === 4 ? 2 : arrangement.meter
    for (let at = start; at < end; at += bassStep) {
      push(at, Math.min(bassStep * 0.8, end - at), [voices[degreeAt(arrangement, at)].bass], 'bass', 0.16)
    }
    if (style === 'chords') {
      for (let at = start + pulse; at < end; at += pulse) {
        if ((at - start) % bassStep === 0) continue
        push(at, Math.min(pulse * 0.7, end - at), voices[degreeAt(arrangement, at)].chord, 'chord', 0.085)
      }
    } else {
      for (let at = start; at < end; at += 0.5) {
        const chord = voices[degreeAt(arrangement, at)].chord
        const index = Math.round(((at - start) % arrangement.cycle) * 2)
        push(at, Math.min(0.44, end - at), [chord[index % 3]!], 'chord', 0.11)
      }
    }
  }
  return events.sort((a, b) => a.at - b.at || (a.voice === b.voice ? 0 : a.voice === 'bass' ? -1 : 1))
}
