import { describe, expect, it } from 'vitest'
import { ACCOMPANIMENT_STYLES, buildAccompaniment, type AccompanimentStyle } from './musicboxAccompaniment'
import { MUSICBOX_FREQUENCIES, transposePitch, type Song } from './musicboxDomain'
import { SONGS } from './musicboxSongs'
import { scalePitchClasses, transposeKey } from './musicboxTheory'

const song = (key: string): Song => SONGS.find(song => song.key === key)!
const duration = (song: Song): number => song.notes.reduce((sum, note) => sum + note.dur, 0)
const styles = ['chords', 'arpeggio'] as const
const cases = SONGS.flatMap(song => styles.map(style => [song.key, style, song] as const))

describe('Music Box accompaniment catalogue', () => {
  it('offers the two accompaniment styles and the silent default', () => {
    expect(ACCOMPANIMENT_STYLES).toEqual(['off', 'chords', 'arpeggio'])
    expect(SONGS).toHaveLength(21)
    for (const arranged of SONGS) expect(buildAccompaniment(arranged, 'off')).toEqual([])
  })

  it.each(cases)('arranges %s in %s with valid low voices and bounded event timing', (_key, style, arranged) => {
    const before = structuredClone(arranged)
    const events = buildAccompaniment(arranged, style)
    const scale = scalePitchClasses(arranged.tonality)
    expect(events.length).toBeGreaterThan(0)
    expect(events.some(event => event.voice === 'bass')).toBe(true)
    expect(events.some(event => event.voice === 'chord')).toBe(true)
    let previousAt = -1
    for (const event of events) {
      expect(Number.isFinite(event.at)).toBe(true)
      expect(Number.isFinite(event.dur)).toBe(true)
      expect(event.at).toBeGreaterThanOrEqual(previousAt)
      expect(event.dur).toBeGreaterThan(0)
      expect(event.at + event.dur).toBeLessThanOrEqual(duration(arranged))
      expect(event.gain).toBeGreaterThan(0)
      expect(event.gain).toBeLessThanOrEqual(0.16)
      expect(event.pitches).toHaveLength(event.voice === 'chord' && style === 'chords' ? 3 : 1)
      for (const pitch of event.pitches) {
        expect(MUSICBOX_FREQUENCIES.has(pitch)).toBe(true)
        expect(scale).toContain(pitch.slice(0, -1))
        expect(Number(pitch.slice(-1))).toBeGreaterThanOrEqual(event.voice === 'bass' ? 2 : 3)
        expect(Number(pitch.slice(-1))).toBeLessThanOrEqual(event.voice === 'bass' ? 2 : 4)
      }
      previousAt = event.at
    }
    expect(arranged).toEqual(before)
    expect(buildAccompaniment(arranged, style)).toEqual(events)
  })

  it.each(cases)('transposes the original %s %s voices without discarding octave shifts', (_key, style, arranged) => {
    const original = buildAccompaniment(arranged, style)
    for (const shift of [-12, -2, 7, 12]) {
      const shifted = buildAccompaniment(arranged, style, shift)
      expect(shifted).toEqual(original.map(event => ({
        ...event, pitches: event.pitches.map(pitch => transposePitch(pitch, shift)),
      })))
      const scale = scalePitchClasses(transposeKey(arranged.tonality, shift))
      for (const event of shifted) {
        for (const pitch of event.pitches) expect(scale).toContain(pitch.slice(0, -1))
      }
    }
  })

  it.each([
    ['twinkle', 48], ['mary', 32], ['london', 32], ['row', 24], ['oldMac', 64], ['fish', 16], ['frere', 32], ['happy', 48],
  ] as const)('repeats the %s harmonic arrangement with each existing verse', (key, cycle) => {
    for (const style of styles) {
      const events = buildAccompaniment(song(key), style)
      const verse = events.filter(event => event.at < cycle)
      const nextVerse = events.filter(event => event.at >= cycle && event.at < cycle * 2)
      expect(nextVerse).toEqual(verse.map(event => ({ ...event, at: event.at + cycle })))
    }
  })
})

describe('Music Box accompaniment phrasing', () => {
  it('changes Twinkle between tonic, subdominant and dominant before resolving its cadences', () => {
    const bass = buildAccompaniment(song('twinkle'), 'chords').filter(event => event.voice === 'bass')
    const pitchAt = (at: number): string | undefined => bass.find(event => event.at === at)?.pitches[0]
    expect([0, 4, 6, 8, 10, 12, 14].map(pitchAt)).toEqual(['C2', 'F2', 'C2', 'F2', 'C2', 'G2', 'C2'])
    expect([44, 46, 92, 94].map(pitchAt)).toEqual(['G2', 'C2', 'G2', 'C2'])
  })

  it('uses an alternating duple bass and chord pulse for Polly', () => {
    const events = buildAccompaniment(song('polly'), 'chords')
    expect(events.slice(0, 4).map(({ at, voice }) => [at, voice])).toEqual([
      [0, 'bass'], [1, 'chord'], [2, 'bass'], [3, 'chord'],
    ])
    expect(events.find(event => event.at === 4)?.pitches).toEqual(['D2'])
    expect(events.find(event => event.at === 14)?.pitches).toEqual(['G2'])
    expect(events.find(event => event.at === 29)?.pitches).toEqual(['D3', 'F#3', 'A3'])
  })

  it.each(['row', 'hickory', 'blindMice', 'humpty', 'jackJill', 'heyDiddle', 'boPeep'])('keeps %s on the two dotted-quarter pulses', key => {
    const events = buildAccompaniment(song(key), 'chords')
    expect(events.slice(0, 4).map(({ at, voice }) => [at, voice])).toEqual([
      [0, 'bass'], [1.5, 'chord'], [3, 'bass'], [4.5, 'chord'],
    ])
  })

  it.each([['incy', 0.5], ['duke', 1], ['happy', 1.5], ['birthday', 1]] as const)('lets the %s opening pickup lead into its first downbeat', (key, pickup) => {
    for (const style of styles) {
      const events = buildAccompaniment(song(key), style)
      expect(events[0]?.at).toBe(pickup)
      expect(events[0]?.voice).toBe('bass')
    }
  })

  it('follows Birthday’s waltz, B-flat subdominant and delayed final phrase', () => {
    const events = buildAccompaniment(song('birthday'), 'chords')
    expect(events.filter(event => event.voice === 'bass').map(event => event.at)).toEqual([1, 4, 7, 10, 13, 16, 20, 23])
    expect(events.find(event => event.at === 17)?.pitches).toEqual(['A#3', 'D4', 'F4'])
    expect(events.find(event => event.at === 20)?.pitches).toEqual(['F2'])
    expect(events.find(event => event.at === 22)?.pitches).toEqual(['C3', 'E3', 'G3'])
    expect(events.find(event => event.at === 23)?.pitches).toEqual(['F2'])
    for (const event of events) {
      expect(event.at < 19 || event.at >= 20).toBe(true)
      if (event.at < 19) expect(event.at + event.dur).toBeLessThanOrEqual(19)
    }
  })

  it('leaves Happy’s action rests and repeated verse pickups free for its percussion', () => {
    for (const style of styles) {
      const events = buildAccompaniment(song('happy'), style)
      for (const verseAt of [0, 48, 96]) {
        for (const [start, end] of [[0, 1.5], [9, 12], [21, 24], [45, 48]]) {
          for (const event of events) {
            expect(event.at + event.dur <= verseAt + start! || event.at >= verseAt + end!).toBe(true)
          }
        }
      }
    }
  })

  it('breaks the triad into single notes with a quieter bass below it', () => {
    const events = buildAccompaniment(song('row'), 'arpeggio')
    expect(events.filter(event => event.voice === 'chord').slice(0, 6).map(({ at, pitches }) => [at, pitches[0]])).toEqual([
      [0, 'C3'], [0.5, 'E3'], [1, 'G3'], [1.5, 'C3'], [2, 'E3'], [2.5, 'G3'],
    ])
    expect(events.find(event => event.voice === 'bass')?.pitches).toEqual(['C2'])
  })
})

describe('Music Box accompaniment malformed input', () => {
  it.each([NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, 1000, -1000])('rejects the unavailable transposition %s', shift => {
    expect(buildAccompaniment(song('twinkle'), 'chords', shift)).toEqual([])
  })

  it.each([
    undefined, null, {},
    { ...song('twinkle'), key: 'missing' },
    { ...song('twinkle'), key: 'constructor' },
    { ...song('twinkle'), tonality: { tonic: 'H', mode: 'major' } },
    { ...song('twinkle'), tonality: { tonic: 'C', mode: 'unknown' } },
    { ...song('twinkle'), notes: [] },
    { ...song('twinkle'), notes: null },
    { ...song('twinkle'), notes: [{ pitch: 'C4', dur: 96.5 }] },
    { ...song('twinkle'), notes: [{ pitch: 'C4', dur: NaN }] },
    { ...song('twinkle'), notes: [{ pitch: 'C4', dur: Infinity }] },
    { ...song('twinkle'), notes: [{ pitch: 'C4', dur: 0 }] },
    { ...song('twinkle'), notes: [{ pitch: 'C4', dur: -1 }] },
    { ...song('twinkle'), notes: [{ pitch: 'missing', dur: 96 }] },
    { ...song('twinkle'), notes: [null] },
  ])('safely rejects a malformed or unsupported arrangement', malformed => {
    for (const style of styles) expect(buildAccompaniment(malformed as Song, style)).toEqual([])
  })

  it('rejects unknown styles and empty melodies without mutating the song', () => {
    expect(buildAccompaniment(song('twinkle'), 'unknown' as AccompanimentStyle)).toEqual([])
    expect(buildAccompaniment({ ...song('twinkle'), notes: [{ pitch: '', dur: 96 }] }, 'chords')).toEqual([])
  })
})
