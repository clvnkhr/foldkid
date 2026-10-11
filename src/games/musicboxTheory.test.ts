import { describe, expect, it } from 'vitest'
import { createFrequencyTable, MUSICBOX_FREQUENCIES, transposePitch } from './musicboxDomain'
import { SONGS } from './musicboxSongs'
import {
  accompanimentChords,
  scalePitchClasses,
  tonicLabel,
  transposeKey,
  type MusicalKey,
} from './musicboxTheory'

describe('Music Box arrangement tonality', () => {
  const expectedKeys = [
    ['twinkle', 'C'], ['mary', 'C'], ['london', 'C'], ['row', 'C'],
    ['oldMac', 'G'], ['incy', 'G'], ['fish', 'C'], ['duke', 'Eb'],
    ['frere', 'C'], ['happy', 'F'], ['birthday', 'F'],
  ] as const

  it('keeps the existing catalogue identifiers and order', () => {
    expect(SONGS.slice(0, expectedKeys.length).map(song => song.key)).toEqual(expectedKeys.map(([id]) => id))
  })

  it.each(expectedKeys)('authors the actual key of %s as %s major', (id, tonic) => {
    const song = SONGS.find(song => song.key === id)!
    expect(song.tonality).toEqual({ tonic, mode: 'major' })
    const scale = scalePitchClasses(song.tonality)
    const soundingNotes = song.notes.filter(note => note.pitch)
    for (const note of soundingNotes) {
      expect(MUSICBOX_FREQUENCIES.has(note.pitch)).toBe(true)
      expect(scale).toContain(note.pitch.slice(0, -1))
    }
    expect(soundingNotes.at(-1)?.pitch.slice(0, -1)).toBe(scale[0])
  })

  it.each(SONGS.slice(expectedKeys.length).map(song => [song.key, song] as const))('keeps the added %s melody in its declared key with a tonic ending', (_id, song) => {
    const scale = scalePitchClasses(song.tonality)
    const pitches = song.notes.filter(note => note.pitch).map(note => note.pitch.slice(0, -1))
    expect(new Set(pitches).size).toBeGreaterThanOrEqual(3)
    for (const pitch of pitches) expect(scale).toContain(pitch)
    expect(pitches.at(-1)).toBe(scale[0])
  })

  it('includes the arranged B-flat in F-major birthday and happy songs', () => {
    for (const id of ['birthday', 'happy']) {
      const song = SONGS.find(song => song.key === id)!
      expect(song.notes.some(note => note.pitch === 'A#4')).toBe(true)
      expect(scalePitchClasses(song.tonality)).toContain('A#')
      expect(scalePitchClasses(song.tonality)).not.toContain('B')
    }
  })

  it.each(SONGS.map(song => [song.key, song] as const))('keeps transposed %s notes and accompaniment in the same key', (_id, song) => {
    for (let semitones = -12; semitones <= 12; semitones++) {
      const key = transposeKey(song.tonality, semitones)
      const scale = scalePitchClasses(key)
      for (const note of song.notes.filter(note => note.pitch)) {
        expect(scale).toContain(transposePitch(note.pitch, semitones).slice(0, -1))
      }
      const chords = accompanimentChords(key)!
      expect(chords).toBeDefined()
      for (const pitches of Object.values(chords)) {
        expect(pitches).toHaveLength(3)
        for (const pitch of pitches) {
          expect(MUSICBOX_FREQUENCIES.has(pitch)).toBe(true)
          expect(scale).toContain(pitch.slice(0, -1))
        }
      }
    }
  })
})

describe('Music Box key helpers', () => {
  it.each([
    [{ tonic: 'C', mode: 'major' }, 1, { tonic: 'Db', mode: 'major' }],
    [{ tonic: 'C', mode: 'major' }, -2, { tonic: 'Bb', mode: 'major' }],
    [{ tonic: 'F', mode: 'major' }, -2, { tonic: 'Eb', mode: 'major' }],
    [{ tonic: 'G', mode: 'major' }, 24 + 3, { tonic: 'Bb', mode: 'major' }],
    [{ tonic: 'C', mode: 'minor' }, 1, { tonic: 'C#', mode: 'minor' }],
    [{ tonic: 'A', mode: 'minor' }, -27, { tonic: 'F#', mode: 'minor' }],
    [{ tonic: 'B', mode: 'minor' }, 1, { tonic: 'C', mode: 'minor' }],
    [{ tonic: 'Bb', mode: 'minor' }, -12 + 1, { tonic: 'B', mode: 'minor' }],
    [{ tonic: 'B', mode: 'major' }, Number.MAX_SAFE_INTEGER, { tonic: 'Gb', mode: 'major' }],
    [{ tonic: 'B', mode: 'major' }, -Number.MAX_SAFE_INTEGER, { tonic: 'E', mode: 'major' }],
  ] satisfies readonly (readonly [MusicalKey, number, MusicalKey])[])(
    'wraps key transposition and preserves its mode', (key, semitones, result) => {
      expect(transposeKey(key, semitones)).toEqual(result)
    },
  )

  it('preserves explicitly authored spelling on zero or whole-octave shifts', () => {
    const key: MusicalKey = { tonic: 'F#', mode: 'major' }
    for (const semitones of [0, 12, -12, 120, -120]) expect(transposeKey(key, semitones)).toBe(key)
  })

  it.each([NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('ignores an invalid key shift %s', semitones => {
    const key: MusicalKey = { tonic: 'C', mode: 'major' }
    expect(transposeKey(key, semitones)).toBe(key)
  })

  it('shows readable flat and sharp tonic labels', () => {
    expect(tonicLabel({ tonic: 'Bb', mode: 'major' })).toBe('B♭')
    expect(tonicLabel({ tonic: 'Eb', mode: 'major' })).toBe('E♭')
    expect(tonicLabel({ tonic: 'F#', mode: 'minor' })).toBe('F♯')
    expect(tonicLabel({ tonic: 'C', mode: 'major' })).toBe('C')
  })

  it('derives major and natural-minor scales in frequency-table spelling', () => {
    expect(scalePitchClasses({ tonic: 'F', mode: 'major' })).toEqual(['F', 'G', 'A', 'A#', 'C', 'D', 'E'])
    expect(scalePitchClasses({ tonic: 'Eb', mode: 'major' })).toEqual(['D#', 'F', 'G', 'G#', 'A#', 'C', 'D'])
    expect(scalePitchClasses({ tonic: 'C#', mode: 'minor' })).toEqual(['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B'])
    expect(scalePitchClasses({ tonic: 'Db', mode: 'major' })).toEqual(scalePitchClasses({ tonic: 'C#', mode: 'major' }))
  })

  it('voices tonic, subdominant, and dominant triads upward from their roots', () => {
    expect(accompanimentChords({ tonic: 'C', mode: 'major' })).toEqual({
      tonic: ['C3', 'E3', 'G3'], subdominant: ['F3', 'A3', 'C4'], dominant: ['G3', 'B3', 'D4'],
    })
    expect(accompanimentChords({ tonic: 'F', mode: 'major' })).toEqual({
      tonic: ['F3', 'A3', 'C4'], subdominant: ['A#3', 'D4', 'F4'], dominant: ['C4', 'E4', 'G4'],
    })
    expect(accompanimentChords({ tonic: 'Eb', mode: 'major' }, 2)).toEqual({
      tonic: ['D#2', 'G2', 'A#2'], subdominant: ['G#2', 'C3', 'D#3'], dominant: ['A#2', 'D3', 'F3'],
    })
    expect(accompanimentChords({ tonic: 'A', mode: 'minor' })).toEqual({
      tonic: ['A3', 'C4', 'E4'], subdominant: ['D4', 'F4', 'A4'], dominant: ['E4', 'G4', 'B4'],
    })
  })

  it('returns no partial chord set when the chosen range is unavailable', () => {
    const key: MusicalKey = { tonic: 'C', mode: 'major' }
    const incomplete = createFrequencyTable({ C3: 130.81, E3: 164.81, G3: 196 })
    expect(accompanimentChords(key, 3, incomplete)).toBeUndefined()
    for (const octave of [-1, 9, 10, NaN, Infinity, 3.5]) {
      expect(accompanimentChords(key, octave)).toBeUndefined()
    }
  })
})
