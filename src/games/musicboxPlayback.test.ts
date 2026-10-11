import { Effect, Fiber } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAccompaniment, type AccompanimentStyle } from './musicboxAccompaniment'
import type { ScheduledNote } from './musicboxAudioRuntime'
import { MUSICBOX_FREQUENCIES, Pitch, type DrumHit, type Instrument, type Song } from './musicboxDomain'
import { INSTRUMENTS } from './musicboxInstruments'
import { playMusicBoxSong, type MusicBoxPlaybackDeps } from './musicboxPlayback'
import { song as birthday } from './musicboxSongs/birthday'

const song: Song = {
  key: 'hotCross', tonality: { tonic: 'C', mode: 'major' }, emoji: '🥐',
  notes: [
    { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: '', dur: 1 }, { pitch: 'E4', dur: 29 },
  ],
  drums: [
    { at: 1, kind: 'snare', gain: 0.6 }, { at: 0, kind: 'kick', gain: 0.5 },
    { at: 0.5, kind: 'hatClosed', gain: 0.4 },
  ],
  lyrics: ['', 'First line', '', 'Second line'],
}

const controlsFor = () => ({
  stopped: false, paused: false, tempo: 1, transpose: 0,
  drumVolume: 1, style: 'off' as AccompanimentStyle, accompanimentVolume: 0.45,
  instrument: INSTRUMENTS[0] as Instrument | undefined,
})

interface PlaybackRig {
  readonly controls: ReturnType<typeof controlsFor>
  readonly notes: Array<{ at: number; note: ScheduledNote; instrument: Instrument }>
  readonly drums: Array<{ at: number; hit: Omit<DrumHit, 'at'> }>
  readonly hooks: Readonly<Record<'highlightKey' | 'unhighlightAllKeys' | 'highlightLyricLine' | 'stopAccompanimentNotes' | 'stopScheduledNotes', ReturnType<typeof vi.fn>>>
  readonly deps: MusicBoxPlaybackDeps
  done: Promise<void>
}

const rigs: PlaybackRig[] = []

const makeRig = (source: Song = song, initial: Partial<ReturnType<typeof controlsFor>> = {}): PlaybackRig => {
  const controls = { ...controlsFor(), ...initial }
  const notes: Array<{ at: number; note: ScheduledNote; instrument: Instrument }> = []
  const drums: Array<{ at: number; hit: Omit<DrumHit, 'at'> }> = []
  const hooks = {
    highlightKey: vi.fn(), unhighlightAllKeys: vi.fn(),
    highlightLyricLine: vi.fn(), stopAccompanimentNotes: vi.fn(),
    stopScheduledNotes: vi.fn(),
  }
  const deps: MusicBoxPlaybackDeps = {
    shouldStop: () => controls.stopped,
    isPaused: () => controls.paused,
    getTempo: () => controls.tempo,
    getTranspose: () => controls.transpose,
    getDrumVolume: () => controls.drumVolume,
    getAccompanimentStyle: () => controls.style,
    getAccompanimentVolume: () => controls.accompanimentVolume,
    getInstrument: () => controls.instrument,
    playScheduledNote: vi.fn((note, instrument) => notes.push({ at: Date.now(), note, instrument })),
    playDrumHit: vi.fn(hit => drums.push({ at: Date.now(), hit })),
    ...hooks,
  }
  const rig: PlaybackRig = { controls, deps, hooks, notes, drums, done: Promise.resolve() }
  rigs.push(rig)
  rig.done = Effect.runPromise(playMusicBoxSong(source, deps))
  return rig
}

const tick = (milliseconds: number) => vi.advanceTimersByTimeAsync(milliseconds)
const melodyNotes = (rig: ReturnType<typeof makeRig>) => rig.notes.filter(({ note }) => note.track === 'melody')
const backingNotes = (rig: ReturnType<typeof makeRig>) => rig.notes.filter(({ note }) => note.track === 'accompaniment')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})

afterEach(async () => {
  for (const rig of rigs) {
    rig.controls.stopped = true
    rig.controls.paused = false
  }
  await tick(50)
  await Promise.all(rigs.map(rig => rig.done))
  rigs.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('musicboxPlayback', () => {
  it('synchronizes melody, unsorted percussion and accompaniment on one absolute clock', async () => {
    const rig = makeRig(song, { style: 'arpeggio' })
    await tick(0)
    expect(melodyNotes(rig).map(({ at, note }) => [at, note.pitch, note.duration])).toEqual([[0, 'C4', 0.35]])
    expect(rig.drums[0]).toEqual({ at: 0, hit: { kind: 'kick', gain: 0.5 } })
    expect(backingNotes(rig).map(({ at, note }) => [at, note.pitch])).toEqual([[0, 'C2'], [0, 'C3']])
    await tick(175)
    expect(rig.drums[1]).toEqual({ at: 175, hit: { kind: 'hatClosed', gain: 0.4 } })
    expect(backingNotes(rig).at(-1)).toMatchObject({ at: 175, note: { pitch: 'E3' } })
    await tick(175)
    expect(melodyNotes(rig).at(-1)).toMatchObject({ at: 350, note: { pitch: 'D4', duration: 0.35 } })
    expect(rig.drums[2]).toEqual({ at: 350, hit: { kind: 'snare', gain: 0.6 } })
    expect(backingNotes(rig).at(-1)).toMatchObject({ at: 350, note: { pitch: 'G3' } })
  })

  it('uses exactly the authored events with audible gain scaled once by the backing volume', async () => {
    const rig = makeRig(song, { style: 'chords', accompanimentVolume: 0.5 })
    await tick(350)
    const expected = buildAccompaniment(song, 'chords').filter(event => event.at <= 1)
    const actual = backingNotes(rig)
    expect(actual.map(({ at, note }) => [at, note.pitch])).toEqual(expected.flatMap(event => event.pitches.map(pitch => [event.at * 350, pitch])))
    for (const { note, instrument } of actual) {
      expect(MUSICBOX_FREQUENCIES.has(note.pitch)).toBe(true)
      expect(instrument.gain).toBe(instrument.key === 'accompanimentBass' ? 0.08 : 0.0425)
      expect(instrument.harmonics.length).toBeLessThanOrEqual(3)
    }
    expect(actual[0]!.instrument.type).toBe('triangle')
    expect(actual.at(-1)!.instrument.type).toBe('sine')
    expect(rig.hooks.highlightKey.mock.calls).toEqual([['C4'], ['D4']])
  })

  it.each([
    { style: 'off' as const, accompanimentVolume: 1 },
    { style: 'chords' as const, accompanimentVolume: 0 },
    { style: 'arpeggio' as const, accompanimentVolume: 0 },
  ])('keeps $style backing silent at volume $accompanimentVolume without silencing the melody', async initial => {
    const rig = makeRig(song, { ...initial, drumVolume: 0 })
    await tick(1050)
    expect(backingNotes(rig)).toEqual([])
    expect(melodyNotes(rig).map(({ note }) => note.pitch)).toEqual(['C4', 'D4', 'E4'])
    expect(rig.drums).toEqual([])
    expect(rig.hooks.highlightLyricLine).toHaveBeenCalledWith(1)
  })

  it('transposes both tracks at scheduling while preserving authored pitches', async () => {
    const original = structuredClone(song)
    const rig = makeRig(song, { style: 'arpeggio', transpose: 2 })
    await tick(350)
    expect(melodyNotes(rig).map(({ note }) => note.pitch)).toEqual(['D4', 'E4'])
    expect(backingNotes(rig).map(({ note }) => note.pitch)).toEqual(['D2', 'D3', 'F#3', 'A3'])
    expect(song).toEqual(original)
  })

  it('keeps a pickup unaccompanied and joins melody, drums and backing at the first downbeat', async () => {
    const rig = makeRig(birthday, { style: 'chords' })
    await tick(349)
    expect(backingNotes(rig)).toHaveLength(0)
    await tick(1)
    expect(backingNotes(rig)[0]!.at).toBe(350)
    expect(rig.drums[0]!.at).toBe(350)
  })

  it('responds to tempo changes without accumulating separate-track timing drift', async () => {
    const rig = makeRig(song, { style: 'arpeggio' })
    await tick(140)
    rig.controls.tempo = 2
    await tick(20)
    await tick(190)
    const next = melodyNotes(rig).find(({ note }) => note.pitch === 'D4')!
    expect(next.at).toBeCloseTo(255, -1)
    expect(next.note.duration).toBeCloseTo(0.175, 2)
    expect(rig.drums.find(({ hit }) => hit.kind === 'snare')!.at).toBe(next.at)
    const simultaneous = backingNotes(rig).find(({ at }) => at === next.at)
    expect(simultaneous).toBeDefined()
  })

  it('re-gates a held melody and backing for their remaining beats when the tempo changes', async () => {
    const held = { ...song, notes: [{ pitch: 'C4', dur: 4 }, { pitch: 'D4', dur: 28 }] }
    const rig = makeRig(held, { style: 'chords' })
    await tick(140)
    const first = melodyNotes(rig)[0]!
    expect(first.note.duration).toBe(1.4)
    rig.controls.tempo = 2
    await tick(20)
    const regated = melodyNotes(rig)[1]!
    expect(rig.hooks.stopScheduledNotes).toHaveBeenCalledOnce()
    expect(rig.hooks.stopAccompanimentNotes).not.toHaveBeenCalled()
    expect(regated.note.pitch).toBe('C4')
    expect(regated.note.duration).toBeCloseTo((1.4 - regated.at / 1000) / 2)
    const bass = backingNotes(rig).at(-1)!
    expect(bass.note.pitch).toBe('C2')
    expect(bass.note.duration).toBeCloseTo((1.6 * 0.35 - bass.at / 1000) / 2)
  })

  it('retunes a held melody and backing together and plays an exact boundary only once', async () => {
    const held = { ...song, notes: [{ pitch: 'C4', dur: 4 }, { pitch: 'E4', dur: 28 }] }
    const rig = makeRig(held, { style: 'chords' })
    await tick(100)
    rig.controls.transpose = 2
    await tick(20)
    expect(rig.hooks.stopScheduledNotes).toHaveBeenCalledOnce()
    expect(melodyNotes(rig).map(({ note }) => note.pitch)).toEqual(['C4', 'D4'])
    const retuned = melodyNotes(rig).at(-1)!
    expect(retuned.note.duration).toBeCloseTo(1.4 - retuned.at / 1000)
    expect(backingNotes(rig).at(-1)!.note.pitch).toBe('D2')
    const boundary = makeRig(song)
    await tick(340)
    boundary.controls.transpose = 2
    await tick(20)
    expect(melodyNotes(boundary).filter(({ note }) => note.pitch === 'E4')).toHaveLength(1)
    expect(melodyNotes(boundary).filter(({ note }) => note.pitch === 'D4')).toHaveLength(0)
  })

  it.each(['transpose', 'enable', 'resume'] as const)('plays late boundary events once when controls %s in the same polling pass', async change => {
    const rig = makeRig(song, { style: change === 'enable' ? 'off' : 'chords' })
    await tick(340)
    vi.setSystemTime(353)
    if (change === 'transpose') rig.controls.transpose = 2
    else if (change === 'enable') rig.controls.style = 'chords'
    else rig.controls.paused = true
    await tick(10)
    if (change === 'resume') {
      await tick(500)
      rig.controls.paused = false
      await tick(20)
    }
    const pitch = change === 'transpose' ? 'E4' : 'D4'
    expect(melodyNotes(rig).filter(({ note }) => note.pitch === pitch)).toHaveLength(1)
    const chord = change === 'transpose' ? ['D3', 'F#3', 'A3'] : ['C3', 'E3', 'G3']
    for (const pitch of chord) expect(backingNotes(rig).filter(({ note }) => note.pitch === pitch)).toHaveLength(1)
    expect(rig.drums.filter(({ hit }) => hit.kind === 'snare')).toHaveLength(1)
  })

  it('enables backing midway at the current position without replaying earlier attacks', async () => {
    const rig = makeRig()
    await tick(210)
    expect(backingNotes(rig)).toHaveLength(0)
    rig.controls.style = 'chords'
    await tick(20)
    const resumedBass = backingNotes(rig)[0]!
    expect(resumedBass.at).toBeGreaterThanOrEqual(210)
    expect(resumedBass.at).toBeLessThanOrEqual(230)
    expect(resumedBass.note.pitch).toBe('C2')
    expect(resumedBass.note.duration).toBeCloseTo(1.6 * 0.35 - resumedBass.at / 1000)
    expect(rig.hooks.stopAccompanimentNotes).toHaveBeenCalledOnce()
    expect(rig.hooks.stopScheduledNotes).not.toHaveBeenCalled()
    await tick(120)
    expect(backingNotes(rig).filter(({ note }) => note.pitch === 'C2')).toHaveLength(1)
    expect(backingNotes(rig).filter(({ note }) => note.pitch === 'E3')).toHaveLength(1)
  })

  it('switches style and changes volume/key by releasing old backing and joining the current event', async () => {
    const rig = makeRig(song, { style: 'chords' })
    await tick(400)
    rig.controls.style = 'arpeggio'
    rig.controls.accompanimentVolume = 0.7
    rig.controls.transpose = 2
    const previousCount = backingNotes(rig).length
    await tick(20)
    const joined = backingNotes(rig).slice(previousCount)
    expect(rig.hooks.stopScheduledNotes).toHaveBeenCalledOnce()
    expect(rig.hooks.stopAccompanimentNotes).not.toHaveBeenCalled()
    expect(joined.map(({ note }) => note.pitch)).toEqual(['D2', 'A3'])
    expect(joined[0]!.instrument.gain).toBeCloseTo(0.16 * 0.7)
    expect(joined[1]!.instrument.gain).toBeCloseTo(0.11 * 0.7)
    const accompanimentCount = backingNotes(rig).length
    rig.controls.style = 'off'
    await tick(500)
    expect(rig.hooks.stopAccompanimentNotes).toHaveBeenCalledOnce()
    expect(backingNotes(rig)).toHaveLength(accompanimentCount)
  })

  it('silences a volume-zero change promptly and resumes from current position when raised', async () => {
    const rig = makeRig(song, { style: 'chords' })
    await tick(100)
    rig.controls.accompanimentVolume = 0
    await tick(20)
    expect(rig.hooks.stopAccompanimentNotes).toHaveBeenCalledOnce()
    expect(rig.hooks.stopScheduledNotes).not.toHaveBeenCalled()
    const count = backingNotes(rig).length
    await tick(250)
    expect(backingNotes(rig)).toHaveLength(count)
    rig.controls.accompanimentVolume = 0.3
    await tick(20)
    expect(rig.hooks.stopAccompanimentNotes).toHaveBeenCalledTimes(2)
    expect(backingNotes(rig).length).toBeGreaterThan(count)
    expect(backingNotes(rig).at(-1)!.instrument.gain).toBeCloseTo(0.085 * 0.3)
  })

  it('freezes all musical beats while paused and resumes the remaining note without replaying drums', async () => {
    const rig = makeRig(song, { style: 'arpeggio' })
    await tick(100)
    rig.controls.paused = true
    await tick(20)
    const notesAtPause = rig.notes.length
    const drumsAtPause = rig.drums.length
    expect(rig.hooks.stopScheduledNotes).toHaveBeenCalledOnce()
    await tick(1000)
    expect(rig.notes).toHaveLength(notesAtPause)
    expect(rig.drums).toHaveLength(drumsAtPause)
    rig.controls.paused = false
    await tick(20)
    const resumed = melodyNotes(rig).at(-1)!
    expect(resumed.note.pitch).toBe('C4')
    expect(resumed.note.duration).toBeCloseTo(0.23, 2)
    expect(rig.drums).toHaveLength(drumsAtPause)
    await tick(240)
    const second = melodyNotes(rig).find(({ note }) => note.pitch === 'D4')!
    expect(second.at).toBeGreaterThanOrEqual(1350)
    expect(second.at).toBeLessThanOrEqual(1370)
    expect(rig.drums.find(({ hit }) => hit.kind === 'snare')!.at).toBe(second.at)
  })

  it('can start paused, change settings there, and resume all tracks at beat zero', async () => {
    const rig = makeRig(song, { paused: true, style: 'chords' })
    await tick(500)
    expect(rig.notes).toEqual([])
    expect(rig.drums).toEqual([])
    rig.controls.tempo = 2
    rig.controls.transpose = -2
    rig.controls.style = 'arpeggio'
    rig.controls.paused = false
    await tick(20)
    expect(melodyNotes(rig)[0]).toMatchObject({ note: { pitch: 'A#3', duration: 0.175 } })
    expect(backingNotes(rig).map(({ note }) => note.pitch)).toEqual(['A#1', 'A#2'])
    expect(rig.drums[0]!.at).toBe(melodyNotes(rig)[0]!.at)
  })

  it('stops within a polling pass and emits no late cleanup that could affect a new playback token', async () => {
    const rig = makeRig(song, { style: 'arpeggio' })
    await tick(100)
    const counts = [rig.notes.length, rig.drums.length, rig.hooks.unhighlightAllKeys.mock.calls.length]
    rig.controls.stopped = true
    await tick(20)
    await rig.done
    await tick(1000)
    expect([rig.notes.length, rig.drums.length, rig.hooks.unhighlightAllKeys.mock.calls.length]).toEqual(counts)
    expect(rig.hooks.stopAccompanimentNotes).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('exits a paused or already-stale playback without scheduling new audio', async () => {
    const stale = makeRig(song, { stopped: true, style: 'chords' })
    await stale.done
    expect(stale.notes).toEqual([])
    expect(stale.hooks.unhighlightAllKeys).not.toHaveBeenCalled()
    const paused = makeRig(song, { paused: true, style: 'chords' })
    await tick(100)
    paused.controls.stopped = true
    await tick(20)
    await paused.done
    expect(paused.notes).toEqual([])
  })

  it('cancels its clock sleep and allows the caller to release scheduled voices in a finalizer', async () => {
    const rig = makeRig(song, { stopped: true, style: 'chords' })
    await rig.done
    rig.controls.stopped = false
    const fiber = Effect.runFork(playMusicBoxSong(song, rig.deps).pipe(
      Effect.ensuring(Effect.sync(rig.deps.stopScheduledNotes)),
    ))
    try {
      await tick(100)
      expect(melodyNotes(rig)).toHaveLength(1)
      expect(backingNotes(rig)).toHaveLength(1)
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(rig.hooks.stopScheduledNotes).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
      const notes = rig.notes.length
      await tick(1000)
      expect(rig.notes).toHaveLength(notes)
    } finally {
      await Effect.runPromise(Fiber.interrupt(fiber))
    }
  })

  it('clears melody highlights at rests and completion and skips empty lyric separators', async () => {
    const rig = makeRig({ ...song, key: 'test', notes: [{ pitch: 'C4', dur: 1 }, { pitch: '', dur: 1 }, { pitch: 'D4', dur: 1 }] })
    await tick(1050)
    await rig.done
    expect(melodyNotes(rig).map(({ note }) => note.pitch)).toEqual(['C4', 'D4'])
    expect(rig.hooks.highlightKey.mock.calls).toEqual([['C4'], ['D4']])
    expect(rig.hooks.highlightLyricLine.mock.calls).toEqual([[1], [1], [3]])
    expect(rig.hooks.unhighlightAllKeys).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps fractional melody and drum boundaries aligned through many notes', async () => {
    const notes = Array.from({ length: 100 }, () => ({ pitch: 'C4', dur: 0.1 }))
    const drums = Array.from({ length: 100 }, (_, index) => ({ at: index / 10, kind: 'hatClosed' as const }))
    const rig = makeRig({ ...song, key: 'test', notes, drums, lyrics: [] })
    await tick(3500)
    await rig.done
    expect(melodyNotes(rig)).toHaveLength(100)
    expect(rig.drums).toHaveLength(100)
    expect(melodyNotes(rig).map(({ at }) => at)).toEqual(rig.drums.map(({ at }) => at))
    expect(melodyNotes(rig).at(-1)!.at).toBe(3465)
    expect(rig.hooks.highlightLyricLine).not.toHaveBeenCalled()
  })

  it('safely finishes with absent instruments and rejected audio or DOM hooks', async () => {
    const rig = makeRig({ ...song, key: 'test', notes: [{ pitch: 'C4', dur: 1 }] }, { instrument: undefined })
    vi.spyOn(rig.deps, 'playDrumHit').mockImplementation(() => { throw new Error('unavailable audio') })
    vi.spyOn(rig.deps, 'highlightKey').mockImplementation(() => { throw new Error('detached DOM') })
    vi.spyOn(rig.deps, 'unhighlightAllKeys').mockImplementation(() => { throw new Error('detached DOM') })
    await tick(350)
    await rig.done
    expect(rig.notes).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('contains failures in scheduled notes, backing release and live getter APIs', async () => {
    const rig = makeRig(song, { style: 'chords' })
    vi.spyOn(rig.deps, 'playScheduledNote').mockImplementation(() => { throw new Error('rejected oscillator') })
    vi.spyOn(rig.deps, 'stopAccompanimentNotes').mockImplementation(() => { throw new Error('rejected release') })
    vi.spyOn(rig.deps, 'getTempo').mockImplementation(() => { throw new Error('unavailable setting') })
    await tick(100)
    rig.controls.style = 'off'
    await tick(20)
    rig.controls.stopped = true
    await tick(20)
    await rig.done
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { notes: [] }, { notes: [{ pitch: 'C4', dur: 0 }] }, { notes: [{ pitch: 'C4', dur: -1 }] },
    { notes: [{ pitch: 'C4', dur: Infinity }] }, { notes: [{ pitch: 'C4', dur: NaN }] },
  ])('completes invalid or empty timelines without starting audio: $notes', async ({ notes }) => {
    const rig = makeRig({ ...song, notes }, { style: 'chords' })
    await rig.done
    expect(rig.notes).toEqual([])
    expect(rig.drums).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('normalizes malformed live settings and ignores unplayable pitches without hanging', async () => {
    const rig = makeRig({ ...song, key: 'test', notes: [{ pitch: 'invalid', dur: 1 }, { pitch: 'C4', dur: 1 }] }, {
      tempo: NaN, transpose: NaN, drumVolume: NaN, accompanimentVolume: NaN,
    })
    await tick(700)
    await rig.done
    expect(melodyNotes(rig).map(({ note }) => note.pitch)).toEqual([Pitch.unsafe('C4')])
    expect(rig.hooks.highlightKey.mock.calls).toEqual([['C4']])
    expect(rig.drums).toEqual([])
  })
})
