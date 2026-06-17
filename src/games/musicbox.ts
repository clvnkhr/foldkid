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
  type DrumKind,
  type Instrument,
  type KeyDef,
  type Song,
} from './musicboxDomain'
import { SONGS, SONG_TKEYS } from './musicboxSongs'

export {
  DRUM_KEYBINDS,
  QWERTY_BLACKS,
  QWERTY_WHITES,
} from './musicboxKeyboardRuntime'
export { DRUM_KINDS, FREQUENCIES, buildKeyboard, shiftStart } from './musicboxDomain'
export { SONGS, SONG_TKEYS } from './musicboxSongs'

export const MIN_WHITE_KEYS = 1
export const MAX_WHITE_KEYS = 15
export const MIN_TRANSPOSE = -12
export const MAX_TRANSPOSE = 12
export const BOTTOM_PANEL_MODES = ['simple', 'drums', 'keyboard'] as const
export type BottomPanelMode = typeof BOTTOM_PANEL_MODES[number]
export const REPEAT_MODES = ['off', 'loop', 'loopOne', 'shuffle'] as const
export type RepeatMode = typeof REPEAT_MODES[number]
const BottomPanelModeSchema = S.Union([S.Literal('simple'), S.Literal('drums'), S.Literal('keyboard')])
const RepeatModeSchema = S.Union([S.Literal('off'), S.Literal('loop'), S.Literal('loopOne'), S.Literal('shuffle')])
const DrumKindSchema = S.Union([
  S.Literal('kick'),
  S.Literal('snare'),
  S.Literal('hatClosed'),
  S.Literal('hatOpen'),
  S.Literal('tomLow'),
  S.Literal('tomHigh'),
  S.Literal('clap'),
  S.Literal('stomp'),
  S.Literal('cheer'),
])

export const PianoKeys = {
  TOP: buildKeyboard('C4', 12),
  BOTTOM: buildKeyboard('C3', 12),
}

const selectedInstrumentIndex = MutableRef.make(0)
const DRUM_PAD_HIGHLIGHT_MS = 140

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

const highlightDrum = (kind: DrumKind): void => {
  document.querySelectorAll(`[data-drum-kind="${kind}"]`).forEach(el => {
    if (!(el instanceof HTMLElement)) return
    el.classList.remove('drum-pad-button--active')
    void el.offsetHeight
    el.classList.add('drum-pad-button--active')
    window.setTimeout(() => {
      el.classList.remove('drum-pad-button--active')
    }, DRUM_PAD_HIGHLIGHT_MS)
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
    highlightDrum,
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
const playbackId = MutableRef.make(0)
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
  currentPlaybackId: number,
): Command.Command<ReturnType<typeof SongEnded>> => ({
  name: 'PlayMusicBox',
  effect: Effect.gen(function* () {
    const isCurrentPlayback = (): boolean => MutableRef.get(playbackId) === currentPlaybackId
    const shouldStop = (): boolean => MutableRef.get(stopFlag) || !isCurrentPlayback()
    if (!isCurrentPlayback()) return msg
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
      if (shouldStop()) break
      const note = song.notes[i]!
      while (drumIndex < drums.length && drums[drumIndex]!.at <= cumDur + 0.0001 && !shouldStop()) {
        playDrum(drums[drumIndex]!)
        drumIndex += 1
      }
      if (shouldStop()) break
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
      while (drumIndex < drums.length && drums[drumIndex]!.at < noteEnd - 0.0001 && !shouldStop()) {
        const drum = drums[drumIndex]!
        if (drum.at > segmentStart + 0.0001) {
          yield* Effect.sleep(((drum.at - segmentStart) * 350) / MutableRef.get(playbackTempo))
          if (shouldStop()) break
          while (MutableRef.get(pauseFlag) && !shouldStop()) {
            yield* Effect.sleep(100)
          }
          if (shouldStop()) break
        }
        playDrum(drum)
        segmentStart = drum.at
        drumIndex += 1
      }
      if (shouldStop()) break
      cumDur += note.dur
      yield* Effect.sleep(((noteEnd - segmentStart) * 350) / MutableRef.get(playbackTempo))
      if (shouldStop()) break
      unhighlightAllKeys()
      while (MutableRef.get(pauseFlag) && !shouldStop()) {
        yield* Effect.sleep(100)
      }
    }
    if (isCurrentPlayback()) {
      MutableRef.set(stopFlag, false)
      MutableRef.set(pauseFlag, false)
      unhighlightAllKeys()
      unhighlightAllLyricLines()
    }
    return msg
  }),
})

export const MIN_OCTAVE = -3
export const MAX_OCTAVE = 3
export const MIN_DRUM_VOLUME = 0
export const MAX_DRUM_VOLUME = 1
const DRUM_PAD_BUTTONS: ReadonlyArray<{ readonly kind: DrumKind; readonly label: string }> = [
  { kind: 'kick', label: 'Kick' },
  { kind: 'snare', label: 'Snare' },
  { kind: 'hatClosed', label: 'Hat' },
  { kind: 'hatOpen', label: 'Open' },
  { kind: 'tomLow', label: 'Low Tom' },
  { kind: 'tomHigh', label: 'High Tom' },
]

const clampDrumVolume = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_DRUM_VOLUME, Math.max(MIN_DRUM_VOLUME, Math.round(value * 100) / 100))
    : 1

const parseBottomPanelMode = (value: string): BottomPanelMode =>
  BOTTOM_PANEL_MODES.includes(value as BottomPanelMode) ? value as BottomPanelMode : 'simple'

const repeatModeOrDefault = (value: RepeatMode | undefined): RepeatMode =>
  value && REPEAT_MODES.includes(value) ? value : 'off'

const nextRepeatMode = (mode: RepeatMode): RepeatMode =>
  REPEAT_MODES[(REPEAT_MODES.indexOf(mode) + 1) % REPEAT_MODES.length]!

export const Model = S.Struct({
  selectedSong: S.Number,
  selectedInstrument: S.Number,
  isPlaying: S.Boolean,
  isPaused: S.Boolean,
  songTranspose: S.Number,
  whiteKeys: S.Number,
  bottomPanelMode: BottomPanelModeSchema,
  octaveOffset: S.Number,
  bottomShift: S.Number,
  topShift: S.Number,
  tempo: S.Number,
  drumVolume: S.Number,
  repeatMode: RepeatModeSchema,
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
export const SongEnded = m('MusicBoxSongEnded', { playbackId: S.Number })
export const PreviousSong = m('MusicBoxPreviousSong')
export const SkipSong = m('MusicBoxSkipSong')
export const NoteOn = m('MusicBoxNoteOn', { pitch: S.String })
export const NoteOff = m('MusicBoxNoteOff', { pitch: S.String })
export const AddKey = m('MusicBoxAddKey')
export const RemoveKey = m('MusicBoxRemoveKey')
export const OctaveUp = m('MusicBoxOctaveUp')
export const OctaveDown = m('MusicBoxOctaveDown')
export const ToggleBottomKeyboard = m('MusicBoxToggleBottomKeyboard')
export const SetBottomPanelMode = m('MusicBoxSetBottomPanelMode', { value: BottomPanelModeSchema })
export const ShiftBottom = m('MusicBoxShiftBottom', { delta: S.Number })
export const ShiftTop = m('MusicBoxShiftTop', { delta: S.Number })
export const TempoUp = m('MusicBoxTempoUp')
export const TempoDown = m('MusicBoxTempoDown')
export const ToggleLyrics = m('MusicBoxToggleLyrics')
export const TogglePause = m('MusicBoxTogglePause')
export const TransposeUp = m('MusicBoxTransposeUp')
export const TransposeDown = m('MusicBoxTransposeDown')
export const CycleRepeatMode = m('MusicBoxCycleRepeatMode')
export const SetDrumVolume = m('MusicBoxSetDrumVolume', { value: S.Number })
export const DrumPadHit = m('MusicBoxDrumPadHit', { kind: DrumKindSchema })
export const ToggleSongVisibility = m('MusicBoxToggleSongVisibility', { index: S.Number })
export const SongDragStarted = m('MusicBoxSongDragStarted', { index: S.Number })
export const SongDroppedOn = m('MusicBoxSongDroppedOn', { index: S.Number })
export const SongDragEnded = m('MusicBoxSongDragEnded')

export const Message = S.Union([Play, Stop, SetSong, SetInstrument, SongEnded, PreviousSong, SkipSong, NoteOn, NoteOff, AddKey, RemoveKey, OctaveUp, OctaveDown, ToggleBottomKeyboard, SetBottomPanelMode, ShiftBottom, ShiftTop, TempoUp, TempoDown, ToggleLyrics, TogglePause, TransposeUp, TransposeDown, CycleRepeatMode, SetDrumVolume, DrumPadHit, ToggleSongVisibility, SongDragStarted, SongDroppedOn, SongDragEnded])
export type Message = typeof Message.Type

const visibleSongOrder = (model: Model): number[] =>
  model.songOrder.filter(i => !model.hiddenSongs[i] && i < SONGS.length && SONGS[i] !== undefined)

const adjacentVisibleSong = (model: Model, delta: -1 | 1): number | undefined => {
  const visible = visibleSongOrder(model)
  if (visible.length === 0) return undefined
  const currentIndex = visible.indexOf(model.selectedSong)
  if (currentIndex < 0) return visible[0]
  return visible[(currentIndex + delta + visible.length) % visible.length]
}

const stopPlaybackForSongChange = (): void => {
  MutableRef.set(stopFlag, true)
  MutableRef.set(pauseFlag, false)
  MutableRef.set(playbackId, MutableRef.get(playbackId) + 1)
  audioRuntime.stopAllManualNotes()
  unhighlightAllKeys()
  unhighlightAllLyricLines()
}

const playSelectedSong = (model: Model, selectedSong: number): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  MutableRef.set(playbackTempo, model.tempo)
  MutableRef.set(playbackTranspose, model.songTranspose)
  MutableRef.set(playbackDrumVolume, clampDrumVolume(model.drumVolume))
  const song = SONGS[selectedSong]
  if (!song) return [model, []]
  const nextPlaybackId = MutableRef.get(playbackId) + 1
  MutableRef.set(playbackId, nextPlaybackId)
  return [
    { ...model, selectedSong, isPlaying: true, isPaused: false },
    [playSongCmd(song, SongEnded({ playbackId: nextPlaybackId }), nextPlaybackId)],
  ]
}

export const nextSongForRepeat = (model: Model, random = Math.random()): number | undefined => {
  const mode = repeatModeOrDefault(model.repeatMode)
  if (mode === 'off') return undefined
  const visible = visibleSongOrder(model)
  if (visible.length === 0) return undefined
  if (mode === 'loopOne') return visible.includes(model.selectedSong) ? model.selectedSong : visible[0]
  if (mode === 'shuffle') {
    const pool = visible.length > 1 ? visible.filter(index => index !== model.selectedSong) : visible
    const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random * pool.length)))
    return pool[index]
  }
  const currentIndex = visible.indexOf(model.selectedSong)
  return visible[(currentIndex + 1) % visible.length]
}

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
  MutableRef.set(playbackId, 0)
  MutableRef.set(currentLyricLine, -1)
  return { selectedSong: 0, selectedInstrument: 0, isPlaying: false, isPaused: false, songTranspose: 0, whiteKeys: 8, bottomPanelMode: 'simple', octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1, drumVolume: 1, repeatMode: 'off', lyricsExpanded: false, songOrder: SONGS.map((_, i) => i), hiddenSongs: SONGS.map(() => false), dragIndex: -1 }
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
        return playSelectedSong(model, model.selectedSong)
      },
      MusicBoxStop: () => {
        MutableRef.set(stopFlag, true)
        MutableRef.set(pauseFlag, false)
        MutableRef.set(playbackId, MutableRef.get(playbackId) + 1)
        audioRuntime.stopAllManualNotes()
        unhighlightAllKeys()
        unhighlightAllLyricLines()
        return [{ ...model, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSetSong: (msg) => {
        if (model.isPlaying) stopPlaybackForSongChange()
        else unhighlightAllLyricLines()
        return [{ ...model, selectedSong: msg.value, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxPreviousSong: () => {
        const selectedSong = adjacentVisibleSong(model, -1)
        if (selectedSong === undefined) return [model, []]
        const shouldAutoPlay = model.isPlaying && !model.isPaused
        if (model.isPlaying) stopPlaybackForSongChange()
        else unhighlightAllLyricLines()
        if (shouldAutoPlay) return playSelectedSong(model, selectedSong)
        return [{ ...model, selectedSong, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSkipSong: () => {
        const selectedSong = adjacentVisibleSong(model, 1)
        if (selectedSong === undefined) return [model, []]
        const shouldAutoPlay = model.isPlaying && !model.isPaused
        if (model.isPlaying) stopPlaybackForSongChange()
        else unhighlightAllLyricLines()
        if (shouldAutoPlay) return playSelectedSong(model, selectedSong)
        return [{ ...model, selectedSong, isPlaying: false, isPaused: false }, []]
      },
      MusicBoxSetInstrument: (msg) => {
        MutableRef.set(selectedInstrumentIndex, msg.value)
        return [{ ...model, selectedInstrument: msg.value }, []]
      },
      MusicBoxSongEnded: (msg) => {
        MutableRef.set(pauseFlag, false)
        if (msg.playbackId !== MutableRef.get(playbackId)) return [model, []]
        if (!model.isPlaying) return [{ ...model, isPaused: false }, []]
        const selectedSong = nextSongForRepeat(model)
        if (selectedSong === undefined) return [{ ...model, isPlaying: false, isPaused: false }, []]
        return playSelectedSong(model, selectedSong)
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
        const next = model.bottomPanelMode === 'keyboard' ? 'simple' : 'keyboard'
        return [{ ...model, bottomPanelMode: next }, []]
      },
      MusicBoxSetBottomPanelMode: (msg) => {
        return [{ ...model, bottomPanelMode: msg.value }, []]
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
      MusicBoxCycleRepeatMode: () => {
        return [{ ...model, repeatMode: nextRepeatMode(repeatModeOrDefault(model.repeatMode)) }, []]
      },
      MusicBoxSetDrumVolume: (msg) => {
        const next = clampDrumVolume(msg.value)
        MutableRef.set(playbackDrumVolume, next)
        return [{ ...model, drumVolume: next }, []]
      },
      MusicBoxDrumPadHit: (msg) => {
        const gain = clampDrumVolume(model.drumVolume)
        if (gain > 0) {
          audioRuntime.primeFromGesture()
          audioRuntime.playDrumHit({ kind: msg.kind, gain })
        }
        return [model, []]
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

const repeatModeLabel = (mode: RepeatMode): string => {
  switch (mode) {
    case 'off': return 'Repeat off'
    case 'loop': return 'Loop all'
    case 'loopOne': return 'Loop one'
    case 'shuffle': return 'Shuffle'
  }
}

const repeatModeClass: Record<RepeatMode, string> = {
  off: 'repeat-mode-btn--off',
  loop: 'repeat-mode-btn--loop',
  loopOne: 'repeat-mode-btn--loopOne',
  shuffle: 'repeat-mode-btn--shuffle',
}

const repeatSvgAttrs = (h: ReturnType<typeof html<Message>>) => [
  h.ViewBox('0 0 24 24'),
  h.Width('17'),
  h.Height('17'),
  h.Fill('none'),
  h.Attribute('stroke', 'currentColor'),
  h.Attribute('stroke-width', '2'),
  h.Attribute('stroke-linecap', 'round'),
  h.Attribute('stroke-linejoin', 'round'),
]

const renderRepeatIcon = (h: ReturnType<typeof html<Message>>, mode: RepeatMode) => {
  switch (mode) {
    case 'off':
      return h.svg(repeatSvgAttrs(h), [
        h.path([h.D('M17 2l4 4-4 4')], []),
        h.path([h.D('M3 11V9a3 3 0 013-3h15')], []),
        h.path([h.D('M7 22l-4-4 4-4')], []),
        h.path([h.D('M21 13v2a3 3 0 01-3 3H3')], []),
        h.path([h.D('M4 4l16 16')], []),
      ])
    case 'loop':
      return h.svg(repeatSvgAttrs(h), [
        h.path([h.D('M17 2l4 4-4 4')], []),
        h.path([h.D('M3 11V9a3 3 0 013-3h15')], []),
        h.path([h.D('M7 22l-4-4 4-4')], []),
        h.path([h.D('M21 13v2a3 3 0 01-3 3H3')], []),
      ])
    case 'loopOne':
      return h.svg(repeatSvgAttrs(h), [
        h.path([h.D('M17 2l4 4-4 4')], []),
        h.path([h.D('M3 11V9a3 3 0 013-3h15')], []),
        h.path([h.D('M7 22l-4-4 4-4')], []),
        h.path([h.D('M21 13v2a3 3 0 01-3 3H3')], []),
        h.path([h.D('M12 9v6')], []),
        h.path([h.D('M10.5 10.5L12 9l1.5 1.5')], []),
      ])
    case 'shuffle':
      return h.svg(repeatSvgAttrs(h), [
        h.path([h.D('M18 4l3 3-3 3')], []),
        h.path([h.D('M18 14l3 3-3 3')], []),
        h.path([h.D('M3 7h3c2 0 3.5 1.5 5 5s3 5 5 5h5')], []),
        h.path([h.D('M3 17h3c1.7 0 3-1 4.1-3')], []),
        h.path([h.D('M14 7c1.1 0 2.1 0 4 0h3')], []),
      ])
  }
}

const renderSongNavIcon = (h: ReturnType<typeof html<Message>>, direction: 'previous' | 'skip') =>
  h.svg([h.ViewBox('0 0 24 24'), h.Width('16'), h.Height('16'), h.Fill('currentColor')], direction === 'previous'
    ? [
        h.path([h.D('M6 5h2v14H6z')], []),
        h.path([h.D('M19 5v14L9 12l10-7z')], []),
      ]
    : [
        h.path([h.D('M16 5h2v14h-2z')], []),
        h.path([h.D('M5 5v14l10-7L5 5z')], []),
      ])

export const view = (model: Model, language: string = 'en') => {
  keyboardRuntime.setOctaveOffset(model.octaveOffset)
  const h = html<Message>()
  const repeatMode = repeatModeOrDefault(model.repeatMode)
  const visibleSongs = visibleSongOrder(model)
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
              h.div([h.Class('musicbox-song-label-row')], [
                h.label([h.Class('musicbox-dropdown-label')], [t('musicBoxPickSong', language)]),
                h.div([h.Class('musicbox-song-nav')], [
                  h.button(
                    [
                      h.Id('musicbox-previous'),
                      h.OnClick(PreviousSong()),
                      h.Class('btn btn-tiny musicbox-song-nav-btn'),
                      h.Disabled(visibleSongs.length <= 1),
                      h.Attribute('aria-label', 'Previous song'),
                      h.Attribute('title', 'Previous song'),
                    ],
                    [renderSongNavIcon(h, 'previous')],
                  ),
                  h.button(
                    [
                      h.Id('musicbox-skip'),
                      h.OnClick(SkipSong()),
                      h.Class('btn btn-tiny musicbox-song-nav-btn'),
                      h.Disabled(visibleSongs.length <= 1),
                      h.Attribute('aria-label', 'Skip song'),
                      h.Attribute('title', 'Skip song'),
                    ],
                    [renderSongNavIcon(h, 'skip')],
                  ),
                ]),
              ]),
              h.select(
                [
                  h.Value(model.selectedSong.toString()),
                  h.OnChange(v => SetSong({ value: parseInt(v) })),
                  h.Class('musicbox-select'),
                ],
                [
                  ...visibleSongs.map(songIdx => {
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
              h.button(
                [
                  h.Id('musicbox-repeat'),
                  h.OnClick(CycleRepeatMode()),
                  h.Class(`btn btn-tiny musicbox-inline-btn repeat-mode-btn ${repeatModeClass[repeatMode]}`),
                  h.Attribute('aria-label', repeatModeLabel(repeatMode)),
                  h.Attribute('title', repeatModeLabel(repeatMode)),
                ],
                [renderRepeatIcon(h, repeatMode)],
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
          h.select(
            [
              h.Value(model.bottomPanelMode),
              h.OnChange(v => SetBottomPanelMode({ value: parseBottomPanelMode(v) })),
              h.Class('musicbox-select bottom-panel-select'),
              h.Attribute('aria-label', 'Lower panel'),
            ],
            [
              h.option([h.Value('simple')], ['🎹']),
              h.option([h.Value('drums')], ['🎹🥁']),
              h.option([h.Value('keyboard')], ['🎹🎹']),
            ],
          ),
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
          ...(model.bottomPanelMode === 'keyboard'
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
        ...(model.bottomPanelMode === 'keyboard'
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
        ...(model.bottomPanelMode === 'drums'
          ? [renderDrumPad(h, model.drumVolume)]
          : []),
        h.div([h.Class('keybind-info'), h.Key('keybind')], [
          'i',
          h.div([h.Class('tooltip')], ['Z/X: Octave  Space: Play/Pause  QWERTY: Piano  C/V/B/N/M/,: Drums']),
        ]),
      ]),
    ],
  )
}

const renderDrumPad = (h: ReturnType<typeof html<Message>>, drumVolume: number) =>
  h.div([h.Class('drum-pad-panel'), h.Key('drum-pad')], [
    h.div([h.Class('drum-pad-grid')], DRUM_PAD_BUTTONS.map(({ kind, label }) =>
      h.button(
        [
          h.Class('drum-pad-button'),
          h.OnClick(DrumPadHit({ kind })),
          h.Disabled(clampDrumVolume(drumVolume) <= 0),
          h.Attribute('data-drum-kind', kind),
        ],
        [
          h.span([h.Class('drum-pad-kind')], [label]),
          h.span([h.Class('drum-pad-hint')], [kind]),
        ],
      ),
    )),
  ])

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
