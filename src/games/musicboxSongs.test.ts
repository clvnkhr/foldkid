import { describe, expect, it } from 'vitest'
import { buildAccompaniment } from './musicboxAccompaniment'
import type { Song } from './musicboxDomain'
import { SONGS } from './musicboxSongs'

const song = (key: string): Song => SONGS.find(song => song.key === key)!
const duration = (song: Song): number => song.notes.reduce((total, note) => total + note.dur, 0)
const section = (key: string, start: number, end: number) => {
  let at = 0
  return song(key).notes.flatMap(note => {
    const onset = at
    at += note.dur
    return onset >= start && onset < end ? [[note.pitch, note.dur]] : []
  })
}

// Musical phrase fixtures transcribed from the scores linked in each song module.
// These catch omitted phrases and incorrect contours, beyond just valid pitch names.
describe('Music Box nursery song audit', () => {
  it.each([
    ['baaBaa', 48, 12], ['hickory', 24, 5], ['hotCross', 32, 4],
    ['blindMice', 48, 8], ['polly', 32, 8], ['humpty', 24, 4],
    ['jackJill', 48, 8], ['heyDiddle', 24, 4], ['thisOldMan', 320, 40], ['boPeep', 24, 4],
  ] as const)('%s retains its complete phrases, drums and both accompaniments', (key, beats, lines) => {
    const tune = song(key)
    expect(duration(tune)).toBe(beats)
    expect(tune.lyrics.filter(line => line.trim())).toHaveLength(lines)
    expect(tune.drums.some(hit => hit.at >= beats - 3)).toBe(true)
    for (const style of ['chords', 'arpeggio'] as const) {
      const backing = buildAccompaniment(tune, style)
      expect(backing.some(event => event.at >= beats - 3)).toBe(true)
      expect(backing.every(event => event.at + event.dur <= beats)).toBe(true)
    }
  })

  it('repeats both opening calls of Three Blind Mice before the farmer’s wife section', () => {
    expect(song('blindMice').lyrics.slice(0, 4)).toEqual([
      'Three blind mice,', 'Three blind mice,', 'See how they run!', 'See how they run!',
    ])
    expect(section('blindMice', 0, 6)).toEqual(section('blindMice', 6, 12))
    expect(section('blindMice', 12, 18)).toEqual([
      ['A4', 1.5], ['G4', 1], ['G4', 0.5], ['F#4', 3],
    ])
    expect(section('blindMice', 18, 24)).toEqual([
      ['A4', 1.5], ['G4', 1], ['G4', 0.5], ['F#4', 2.5], ['A4', 0.5],
    ])
    expect(section('blindMice', 24, 25)).toEqual([['D5', 1]])
  })

  it('uses Baa Baa’s descending middle and reprises the complete question and answer', () => {
    expect(section('baaBaa', 16, 24)).toEqual([
      ['A4', 1], ['A4', 0.5], ['A4', 0.5],
      ['G4', 1], ['G4', 0.5], ['G4', 0.5],
      ['F#4', 1], ['F#4', 0.5], ['F#4', 0.5], ['E4', 1.5], ['E4', 0.5],
    ])
    expect(section('baaBaa', 32, 48)).toEqual(section('baaBaa', 0, 16))
    expect(song('baaBaa').lyrics.slice(-4)).toEqual(song('baaBaa').lyrics.slice(0, 4))
  })

  it('gives “mouse ran up the clock” its six notes without an extra rising step', () => {
    expect(section('hickory', 5.5, 11.5)).toEqual([
      ['F#4', 0.5], ['F#4', 1], ['A4', 0.5], ['A4', 0.5],
      ['B4', 0.5], ['C#5', 0.5], ['D5', 2.5],
    ])
  })

  it('uses Elliott’s Jack and Jill tune and includes the brown-paper verse', () => {
    expect(section('jackJill', 0, 6)).toEqual([
      ['C5', 1], ['G4', 0.5], ['A4', 1], ['G4', 0.5],
      ['C5', 1], ['G4', 0.5], ['A4', 1], ['G4', 0.5],
    ])
    expect(section('jackJill', 24, 48)).toEqual(section('jackJill', 0, 24))
    expect(song('jackJill').lyrics.at(-1)).toBe('With vinegar and brown paper.')
  })

  it('uses the familiar rising dog phrase and descending dish phrase in Hey Diddle Diddle', () => {
    expect(section('heyDiddle', 12, 15)).toEqual([
      ['F4', 0.5], ['G4', 0.5], ['F4', 0.5], ['A4', 1], ['F4', 0.5],
    ])
    expect(section('heyDiddle', 18, 24)).toEqual([
      ['E4', 0.5], ['F4', 0.5], ['E4', 0.5],
      ['D4', 0.5], ['C4', 0.5], ['D4', 0.5], ['C4', 3],
    ])
  })

  it('uses Elliott’s leaping Bo-Peep melody, rather than the repeated-note older tune', () => {
    expect(section('boPeep', 0, 6)).toEqual([
      ['C5', 0.5], ['F5', 0.5], ['A4', 0.5], ['E5', 1], ['D5', 0.5],
      ['C5', 1], ['G4', 0.5], ['A4', 1], ['G4', 0.5],
    ])
    expect(section('boPeep', 18, 24)).toEqual([
      ['F5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 0.5], ['F4', 0.5],
      ['G4', 1.5], ['F4', 0.5], ['', 1],
    ])
  })

  it('counts all ten Old Man verses, keeping seven/heaven singable and each verse 32 beats', () => {
    const lyrics = song('thisOldMan').lyrics.filter(line => line.trim())
    const numbers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
    for (const [index, number] of numbers.entries()) {
      expect(lyrics[index * 4]).toBe(`This old man, he played ${number},`)
      expect(section('thisOldMan', index * 32, (index + 1) * 32)
        .reduce((total, [, dur]) => total + Number(dur), 0)).toBe(32)
      expect(section('thisOldMan', index * 32 + 16, (index + 1) * 32))
        .toEqual(section('thisOldMan', 16, 32))
    }
    expect(section('thisOldMan', 198, 200)).toEqual([['G4', 1], ['G4', 1]])
    expect(section('thisOldMan', 206, 208)).toEqual([['F4', 1], ['F4', 1]])
    expect(lyrics[37]).toBe('He played knick-knack once again;')
  })
})
