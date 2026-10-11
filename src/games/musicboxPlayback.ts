import { Clock, Effect } from 'effect'
import {
  buildAccompaniment,
  type AccompanimentEvent,
  type AccompanimentStyle,
} from './musicboxAccompaniment'
import type { ScheduledNote } from './musicboxAudioRuntime'
import {
  FrequencyHz,
  MUSICBOX_FREQUENCIES,
  Pitch,
  transposePitch,
  type DrumHit,
  type Instrument,
  type Song,
} from './musicboxDomain'

export interface MusicBoxPlaybackDeps {
  readonly shouldStop: () => boolean
  readonly isPaused: () => boolean
  readonly getTempo: () => number
  readonly getTranspose: () => number
  readonly getDrumVolume: () => number
  readonly getAccompanimentStyle: () => AccompanimentStyle
  readonly getAccompanimentVolume: () => number
  readonly getInstrument: () => Instrument | undefined
  readonly playScheduledNote: (note: ScheduledNote, instrument: Instrument) => void
  readonly playDrumHit: (hit: Omit<DrumHit, 'at'>) => void
  readonly stopAccompanimentNotes: () => void
  readonly stopScheduledNotes: () => void
  readonly highlightKey: (pitch: string) => void
  readonly unhighlightAllKeys: () => void
  readonly highlightLyricLine: (index: number) => void
}

const BEAT_MS = 350
const POLL_MS = 20
const EPSILON = 0.000000001
const beatTime = (value: number): number => Math.round(value * 1e9) / 1e9

// Quiet, inexpensive backing voices leave the selected instrument in front.
const chordInstrument: Instrument = {
  key: 'accompanimentChord', type: 'sine', gain: 0.14,
  attack: 0.005, decay: 0.12, sustain: 0.78, release: 0.12,
  harmonics: [
    { ratio: 1, gain: 1, decay: 1.8 },
    { ratio: 2, gain: 0.3, decay: 1.1 },
    { ratio: 3, gain: 0.12, decay: 0.6 },
  ],
  filterType: 'lowpass', filterFreq: FrequencyHz.unsafe(3200), filterRatio: 7, filterQ: 0.5,
}

const bassInstrument: Instrument = {
  key: 'accompanimentBass', type: 'triangle', gain: 0.16,
  attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.1,
  harmonics: [{ ratio: 1, gain: 1 }],
  filterType: 'lowpass', filterFreq: FrequencyHz.unsafe(1000), filterRatio: 5, filterQ: 0.5,
}

interface MelodyEvent {
  readonly kind: 'melody'
  readonly at: number
  readonly end: number
  readonly pitch: string
}

type PlaybackEvent = MelodyEvent
  | { readonly kind: 'drum'; readonly at: number; readonly hit: DrumHit }
  | { readonly kind: 'accompaniment'; readonly at: number; readonly style: AccompanimentStyle; readonly event: AccompanimentEvent }

const safeRead = <A>(read: () => A, fallback: A): A => {
  try { return read() } catch { return fallback }
}

const safely = (run: () => void): void => {
  try { run() } catch { /* a missing audio/DOM API must not strand playback */ }
}

const volume = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
const tempoValue = (value: number): number => Number.isFinite(value) ? Math.max(0.25, Math.min(3, value)) : 1

/** The caller owns token-guarded final cleanup, including interruption and failure. */
export const playMusicBoxSong = (song: Song, deps: MusicBoxPlaybackDeps): Effect.Effect<void> =>
  Effect.gen(function* () {
    const stopped = (): boolean => safeRead(deps.shouldStop, true)
    if (stopped() || song.notes.length === 0 || song.notes.some(note => !Number.isFinite(note.dur) || note.dur <= 0)) return

    let total = 0
    const melody: MelodyEvent[] = song.notes.map(note => {
      const at = total
      total = beatTime(total + note.dur)
      return { kind: 'melody', at, end: total, pitch: note.pitch }
    })
    if (!Number.isFinite(total) || total <= 0) return
    const accompaniment = {
      chords: buildAccompaniment(song, 'chords', 0),
      arpeggio: buildAccompaniment(song, 'arpeggio', 0),
      off: [],
    }
    const events: PlaybackEvent[] = [
      ...melody,
      ...song.drums.filter(hit => Number.isFinite(hit.at) && hit.at >= 0 && hit.at < total)
        .map(hit => ({ kind: 'drum' as const, at: beatTime(hit.at), hit })),
      ...(['chords', 'arpeggio'] as const).flatMap(style => accompaniment[style]
        .filter(event => Number.isFinite(event.at) && event.at >= 0 && event.at < total && Number.isFinite(event.dur) && event.dur > 0)
        .map(event => ({ kind: 'accompaniment' as const, at: beatTime(event.at), style, event }))),
    ].sort((a, b) => a.at - b.at)
    const lyricLines = song.lyrics.map((line, index) => line.trim() ? index : -1).filter(index => index >= 0)

    const readControls = () => {
      const style = safeRead(deps.getAccompanimentStyle, 'off')
      const transpose = safeRead(deps.getTranspose, 0)
      return {
        style: style === 'chords' || style === 'arpeggio' ? style : 'off' as const,
        volume: volume(safeRead(deps.getAccompanimentVolume, 0)),
        transpose: Number.isSafeInteger(transpose) ? Math.max(-12, Math.min(12, transpose)) : 0,
      }
    }
    let controls = readControls()
    let tempo = tempoValue(safeRead(deps.getTempo, 1))
    let anchorTime = yield* Clock.currentTimeMillis
    let anchorBeat = 0
    let paused = false
    let eventIndex = 0

    const playMelody = (event: MelodyEvent, beat: number): void => {
      if (event.end <= beat + EPSILON || stopped()) return
      safely(deps.unhighlightAllKeys)
      if (event.pitch) {
        const pitch = Pitch.fromString(transposePitch(event.pitch, controls.transpose), MUSICBOX_FREQUENCIES)
        const instrument = safeRead(deps.getInstrument, undefined)
        if (pitch && instrument) safely(() => deps.playScheduledNote({
          pitch, duration: (event.end - beat) * BEAT_MS / 1000 / tempo, track: 'melody',
        }, instrument))
        if (pitch && !stopped()) safely(() => deps.highlightKey(pitch))
      }
      if (lyricLines.length > 0 && !stopped()) {
        const line = Math.min(lyricLines.length - 1, Math.floor(event.at / total * lyricLines.length))
        safely(() => deps.highlightLyricLine(lyricLines[line]!))
      }
    }

    const playBacking = (event: AccompanimentEvent, beat: number): void => {
      const remaining = Math.min(total, event.at + event.dur) - beat
      if (remaining <= EPSILON || controls.style === 'off' || controls.volume <= 0 || stopped()) return
      const pitches = event.pitches.map(pitch => Pitch.fromString(transposePitch(pitch, controls.transpose), MUSICBOX_FREQUENCIES))
        .filter((pitch): pitch is Pitch => pitch !== undefined)
      if (pitches.length === 0) return
      const base = event.voice === 'bass' ? bassInstrument : chordInstrument
      const gain = controls.volume * volume(event.gain)
      if (gain <= 0) return
      const instrument = { ...base, gain }
      for (const pitch of pitches) {
        if (stopped()) return
        safely(() => deps.playScheduledNote({
          pitch, duration: remaining * BEAT_MS / 1000 / tempo, track: 'accompaniment',
        }, instrument))
      }
    }

    while (!stopped()) {
      const now = yield* Clock.currentTimeMillis
      const beat = Math.min(total, paused ? anchorBeat : anchorBeat + Math.max(0, now - anchorTime) * tempo / BEAT_MS)
      const nextTempo = tempoValue(safeRead(deps.getTempo, 1))
      const nextPaused = safeRead(deps.isPaused, false)
      const nextControls = readControls()
      const backingChanged = nextControls.style !== controls.style || nextControls.volume !== controls.volume || nextControls.transpose !== controls.transpose
      const resumed = paused && !nextPaused
      const regate = nextTempo !== tempo || nextControls.transpose !== controls.transpose
      const pausing = nextPaused && !paused
      if (nextTempo !== tempo || nextPaused !== paused) {
        anchorBeat = beat
        anchorTime = now
        tempo = nextTempo
      }
      if (stopped()) return
      if (regate || pausing) safely(deps.stopScheduledNotes)
      else if (backingChanged) safely(deps.stopAccompanimentNotes)
      if (pausing) safely(deps.unhighlightAllKeys)
      controls = nextControls
      paused = nextPaused
      if (stopped()) return
      if (paused) {
        yield* Effect.sleep(POLL_MS)
        continue
      }
      if (beat >= total - EPSILON) break

      // A late polling tick can cross an onset while a control changes. Only
      // restart events already consumed; the queue plays newly due events once.
      const pendingAt = events[eventIndex]?.at ?? total
      if (resumed || regate) {
        const current = melody.find(event => event.at < pendingAt - EPSILON && event.at < beat - EPSILON && event.end > beat + EPSILON)
        if (current) playMelody(current, beat)
      }
      if ((backingChanged || resumed || regate) && controls.style !== 'off') {
        for (const event of accompaniment[controls.style]) {
          if (event.at < pendingAt - EPSILON && event.at < beat - EPSILON && event.at + event.dur > beat + EPSILON) playBacking(event, beat)
        }
      }

      while (eventIndex < events.length && events[eventIndex]!.at <= beat + EPSILON) {
        if (stopped()) return
        const event = events[eventIndex]!
        eventIndex += 1
        if (event.kind === 'melody') playMelody(event, beat)
        else if (event.kind === 'accompaniment') {
          if (event.style === controls.style) playBacking(event.event, beat)
        } else {
          const drumVolume = volume(safeRead(deps.getDrumVolume, 0))
          // A suspended tab must not replay a burst of old percussion on waking.
          if (drumVolume > 0 && (beat - event.at) * BEAT_MS / tempo <= POLL_MS * 2) {
            safely(() => deps.playDrumHit({ kind: event.hit.kind, gain: (event.hit.gain ?? 1) * drumVolume }))
          }
        }
      }
      const nextBeat = events[eventIndex]?.at ?? total
      yield* Effect.sleep(Math.max(1, Math.min(POLL_MS, (nextBeat - beat) * BEAT_MS / tempo)))
    }
    if (!stopped()) safely(deps.unhighlightAllKeys)
  }).pipe(Effect.catchCause(() => Effect.void))
