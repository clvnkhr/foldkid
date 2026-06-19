# Music Box Game Architecture

Timestamp: 2026-06-19 11:19 Europe/London

Main sources:

- `src/games/musicbox.ts`
- `src/games/musicboxDomain.ts`
- `src/games/musicboxAudioRuntime.ts`
- `src/games/musicboxKeyboardRuntime.ts`
- `src/games/musicboxWakeMonitor.ts`
- `src/games/musicboxSongs/*.ts`

Music Box is a song player, piano, and drum pad. It combines pure domain helpers with Web Audio and keyboard runtimes.

## Model

The model stores:

- Song/player state: `selectedSong`, `isPlaying`, `isPaused`, `songTranspose`, `tempo`, `repeatMode`, `lyricsExpanded`.
- Instrument and keyboard: `selectedInstrument`, `whiteKeys`, `octaveOffset`, `bottomPanelMode`, `bottomShift`, `topShift`.
- Drums: `drumVolume`.
- Song management: `songOrder`, `hiddenSongs`, `dragIndex`.

Song order, hidden songs, and drum volume are persisted by root settings.

## Domain Layer

`musicboxDomain.ts` owns:

- `Pitch` validation against `MUSICBOX_FREQUENCIES`.
- `transposePitch`.
- `buildKeyboard`.
- Shared types for songs, notes, drum hits, instruments, and key definitions.

This layer is easy to test because it does not need real audio.

## Songs

Songs are data modules under `src/games/musicboxSongs/`. Each song contains:

- `key`, `emoji`.
- `notes` with pitch and duration.
- `lyrics`.
- `drums` with kind, timing, and optional gain.

`src/invariants.test.ts` checks song keys, translation keys, note durations, frequency validity, lyric presence, drum timing, and drum kinds.

## Audio Runtime

`createMusicBoxAudioRuntime` encapsulates Web Audio behavior:

- Shared compressor routing for manual notes, scheduled notes, and drums.
- Manual note start/stop with duplicate-start protection.
- Scheduled notes for song playback.
- Lofi drum synthesis.
- Open hi-hat choke behavior.
- Highlight hooks for keys and drums.

The main module injects `getContext`, `resetContext`, frequencies, and highlight hooks.

## Keyboard Runtime

`createMusicBoxKeyboardRuntime` maps physical keyboard input to note and drum behavior. The main module binds it during `init`, resets it in tests, and updates octave offset from the view.

## Playback Design

Playback uses Effect command `PlayMusicBox`. It reads mutable refs for:

- Stop and pause flags.
- Tempo.
- Transpose.
- Drum volume.
- Playback id.
- Current lyric line.

The playback id prevents stale `SongEnded` messages from old play commands from affecting the current model.

Song navigation respects visible songs. Repeat modes are:

- `off`
- `loop`
- `loopOne`
- `shuffle`

`nextSongForRepeat` is pure and accepts an injectable random value for tests.

## View Design

The view renders:

- Song select and previous/skip controls.
- Play, pause, stop, repeat.
- Tempo and transpose controls.
- Lyrics with active-line highlighting.
- Upper piano, optional lower piano, or drum pad.
- Keyboard range, instrument, and lower-panel controls.

Inline SVG icons are used for transport/repeat controls in this file.

## Tests

Music Box tests are split by concern:

- `musicboxDomain.test.ts`: pitch branding, transposition, keyboard construction, QWERTY mappings.
- `musicboxAudioRuntime.test.ts`: duplicate manual starts, compressor routing, drum routing, hi-hat choking.
- `musicboxWakeMonitor.test.ts`: wake/reset behavior.
- `musicbox.test.ts`, `musicbox-bot.test.ts`, and `musicbox-pitch.test.ts`: model update, playback, repeat, UI, pitch behavior.
- `invariants.test.ts`: song/instrument integrity.

