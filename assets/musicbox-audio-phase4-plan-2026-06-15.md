# MusicBox Audio Phase 4 Plan

Generated: June 15, 2026

## Goal

Phase 4 should turn the extracted MusicBox runtime modules into a small, fully typed runtime boundary without changing audio behavior.

The end goal is not a grand audio engine. The end goal is a boring, explicit API that makes Safari-sensitive behavior hard to accidentally break:

- user-gesture priming stays synchronous
- note start/stop stays immediate
- compressor routing stays centralized
- wake reset stays explicit
- instrument and pitch data become harder to misuse
- tests describe the audio invariants we rely on

This phase should not directly fix the known behavior where QWERTY piano keys continue working outside the MusicBox page. That should remain a separate product decision with its own tests.

## Current Shape

Phase 3 split the MusicBox runtime into:

- `src/games/musicboxAudioRuntime.ts`
- `src/games/musicboxKeyboardRuntime.ts`
- `src/games/musicboxWakeMonitor.ts`

`src/games/musicbox.ts` still owns:

- model and message definitions
- song and instrument data
- playback command orchestration
- view rendering
- DOM highlighting hooks

The current boundary is better, but still loosely typed:

- pitches are plain `string`
- frequencies are `Record<string, number>`
- durations are plain `number`
- runtime hooks are anonymous object shapes
- keyboard controls can be rebound with different callbacks
- `musicboxAudioRuntime.ts` still knows about raw DOM/Web Audio node cleanup details and pitch lookup at the same API layer

## Phase 4 Design Principles

### Preserve Trusted Gesture Timing

Any API that unlocks or primes audio must remain callable directly inside a DOM event handler. It must return `void`, not an `Effect`, `Promise`, queued command, or delayed callback.

Good:

```ts
runtime.primeFromGesture()
```

Avoid:

```ts
Effect.runPromise(runtime.primeFromGesture)
setTimeout(runtime.primeFromGesture, 0)
Command.of(runtime.primeFromGesture)
```

### Use Types To Remove Invalid States

Prefer named domain types where MusicBox has real rules:

- `Pitch`
- `FrequencyHz`
- `BeatDuration`
- `Semitone`
- `Instrument`
- `ScheduledNote`
- `ManualNoteHandle`
- `MusicBoxRuntime`

The aim is not type ceremony. The aim is that the compiler can distinguish "a pitch name" from "a keyboard key" from "a raw frequency number".

### Keep Effects At The Edges

Effect is useful for command orchestration and tests, but the synchronous audio API should stay synchronous where the browser requires it.

Use Effect for:

- song playback sequencing
- tests that fork/interrupt playback commands
- schema decoding where app state crosses persistence boundaries

Do not use Effect for:

- the first Safari audio unlock inside `pointerup`
- manual note start from a direct key event
- immediate note release

### Make Runtime Dependencies Explicit

Runtime modules should receive their dependencies as typed objects instead of reaching across module boundaries for unrelated data.

Good:

```ts
const runtime = createMusicBoxAudioRuntime({
  getContext,
  resetContext,
  frequencies,
  hooks,
})
```

Avoid spreading global mutable state across multiple modules without a clear owner.

## Target API

The target API should be a single stable runtime object created by `musicbox.ts`.

```ts
export interface MusicBoxAudioRuntime {
  primeFromGesture(): void
  playScheduledNote(note: ScheduledNote, instrument: Instrument): void
  startManualNote(pitch: Pitch, instrument: Instrument): void
  stopManualNote(pitch: Pitch): void
  stopAllManualNotes(): void
  resetGraph(): void
}
```

The keyboard runtime should depend on this smaller audio API instead of hand-assembled callbacks:

```ts
export interface MusicBoxKeyboardRuntime {
  bind(): void
  reset(): void
  setOctaveOffset(offset: OctaveOffset): void
}
```

Wake monitoring should stay tiny:

```ts
export interface MusicBoxWakeMonitor {
  start(): void
  reset(): void
}
```

`musicbox.ts` should assemble these pieces in one obvious place:

```ts
const runtime = createMusicBoxRuntime({
  audio: createMusicBoxAudioRuntime(...),
  keyboard: createMusicBoxKeyboardRuntime(...),
  wake: createMusicBoxWakeMonitor(...),
})
```

This wrapper is optional if it feels too abstract. The important target is stable typed boundaries, not an extra layer for its own sake.

## Domain Types

### Pitch

Start with a lightweight branded type:

```ts
declare const PitchBrand: unique symbol
export type Pitch = string & { readonly [PitchBrand]: true }
```

Then expose safe constructors:

```ts
export const Pitch = {
  fromString(value: string, frequencies: Readonly<Record<string, number>>): Pitch | undefined {
    return frequencies[value] === undefined ? undefined : value as Pitch
  },
  unsafe(value: string): Pitch {
    return value as Pitch
  },
}
```

Use `unsafe` only for trusted constants like `SONGS`, `QWERTY_WHITES`, and keyboard construction after invariant tests prove they exist in `FREQUENCIES`.

Later, this could become an Effect schema:

```ts
export const PitchSchema = S.String.pipe(S.brand('Pitch'))
```

But do not force schema parsing into the hot path for note starts.

### FrequencyHz

Frequency values should be named:

```ts
declare const FrequencyHzBrand: unique symbol
export type FrequencyHz = number & { readonly [FrequencyHzBrand]: true }
```

The lookup boundary should return `FrequencyHz | undefined`.

```ts
export interface FrequencyTable {
  readonly get: (pitch: Pitch) => FrequencyHz | undefined
}
```

### BeatDuration

Song note durations are musical durations, not milliseconds.

```ts
declare const BeatDurationBrand: unique symbol
export type BeatDuration = number & { readonly [BeatDurationBrand]: true }
```

This clarifies the conversion point:

```ts
const sleepMs = (duration: BeatDuration, tempo: Tempo): number =>
  (duration * 350) / tempo
```

### Instrument

Move `Instrument` and `HarmonicDef` out of the audio runtime into a domain module:

- `src/games/musicboxDomain.ts`

Target:

```ts
export interface HarmonicDef {
  readonly ratio: number
  readonly gain: number
}

export interface Instrument {
  readonly key: InstrumentKey
  readonly type: OscillatorType
  readonly gain: number
  readonly attack: Seconds
  readonly decay: Seconds
  readonly sustain: number
  readonly release: Seconds
  readonly harmonics: readonly HarmonicDef[]
  readonly filterType?: BiquadFilterType
  readonly filterFreq?: FrequencyHz
  readonly filterQ?: number
  readonly detune?: number
  readonly tremoloFreq?: FrequencyHz
  readonly tremoloDepth?: number
}
```

Keep this as TypeScript first. Add Effect schemas only if we need runtime validation for external or persisted data.

## Proposed File Layout

Target layout:

```text
src/games/musicbox.ts
src/games/musicboxDomain.ts
src/games/musicboxAudioRuntime.ts
src/games/musicboxKeyboardRuntime.ts
src/games/musicboxWakeMonitor.ts
src/games/musicboxRuntime.ts
```

Responsibilities:

`musicbox.ts`

- Foldkit model/update/view
- song playback command
- runtime assembly

`musicboxDomain.ts`

- domain types
- pitch helpers
- frequency table
- instrument and song types
- transposition helpers

`musicboxAudioRuntime.ts`

- Web Audio graph
- compressor
- active manual notes
- scheduled note playback
- graph reset

`musicboxKeyboardRuntime.ts`

- QWERTY key mapping
- first-touch priming listener
- shortcut listeners
- octave offset mapping

`musicboxWakeMonitor.ts`

- `pageshow persisted` reset
- time-jump reset

`musicboxRuntime.ts`

- optional assembly module if `musicbox.ts` starts getting noisy

## Implementation Slices

### Slice 1: Move Domain Types

Create `musicboxDomain.ts` and move:

- `Note`
- `Song`
- `HarmonicDef`
- `Instrument`
- `KeyDef`
- pitch/frequency helper types if introduced
- `transposePitch`
- `shiftStart`
- `buildKeyboard`

Keep data arrays in `musicbox.ts` at first to reduce churn.

Tests:

- existing MusicBox tests
- existing pitch/invariant tests
- typecheck

Risk:

- low, mostly import movement

### Slice 2: Type Pitch Lookup

Introduce a `FrequencyTable` wrapper:

```ts
export interface FrequencyTable {
  get(pitch: Pitch): FrequencyHz | undefined
  has(value: string): value is Pitch
}
```

Replace runtime signatures that accept `Record<string, number>` with `FrequencyTable`.

Tests:

- pitch lookup rejects unknown notes
- all song notes resolve
- all QWERTY mapped pitches resolve
- all rendered keyboard pitches resolve for configured min/max ranges

Risk:

- medium, touches many call sites but should not change behavior

### Slice 3: Create `MusicBoxAudioRuntime`

Replace free functions in `musicboxAudioRuntime.ts` with a factory:

```ts
export const createMusicBoxAudioRuntime = (deps: MusicBoxAudioRuntimeDeps): MusicBoxAudioRuntime => {
  // private state here
}
```

Dependencies:

```ts
export interface MusicBoxAudioRuntimeDeps {
  readonly getContext: () => AudioContext | undefined
  readonly resetContext: () => void
  readonly frequencies: FrequencyTable
  readonly hooks: KeyHighlightHooks
}
```

This makes compressor state and active notes private to the runtime instance instead of module-global state.

Tests:

- manual notes still route through one compressor
- song playback still routes through one compressor
- duplicate manual note starts are ignored
- release still uses `cancelAndHoldAtTime`
- reset graph clears active notes and creates a new compressor on next note

Risk:

- medium, because state moves from module scope to closure scope

### Slice 4: Create `MusicBoxKeyboardRuntime`

Replace keyboard free functions with a factory:

```ts
export const createMusicBoxKeyboardRuntime = (deps: MusicBoxKeyboardRuntimeDeps): MusicBoxKeyboardRuntime => {
  // listener state here
}
```

Dependencies:

```ts
export interface MusicBoxKeyboardRuntimeDeps {
  readonly getInstrument: () => Instrument | undefined
  readonly audio: Pick<MusicBoxAudioRuntime, 'primeFromGesture' | 'startManualNote' | 'stopManualNote' | 'stopAllManualNotes'>
  readonly document: Document
}
```

Important:

- preserve `document.addEventListener('pointerup', firstTouch, { capture: true })`
- preserve first-touch order:
  1. set `navigator.audioSession.type = 'playback'`
  2. play silent WAV
  3. call `audio.primeFromGesture()`
  4. remove first-touch listeners
- keep shortcuts unchanged
- do not scope QWERTY to route/page in this slice

Tests:

- listener installation/removal count stays unchanged
- first-touch one-shot order stays unchanged
- QWERTY keydown starts expected pitch
- QWERTY keyup releases expected pitch
- octave offset still applies

Risk:

- medium-high only because Safari gesture timing is fragile

### Slice 5: Create `MusicBoxWakeMonitor`

Convert wake monitor to a tiny factory:

```ts
export const createMusicBoxWakeMonitor = (deps: MusicBoxWakeMonitorDeps): MusicBoxWakeMonitor => {
  // page show and interval state here
}
```

Dependencies:

```ts
export interface MusicBoxWakeMonitorDeps {
  readonly window: Window
  readonly resetGraph: () => void
  readonly now: () => number
}
```

Tests:

- starts only once
- `reset()` removes listener and interval
- `pageshow persisted` calls reset graph
- large time jump calls reset graph
- normal interval tick does not reset graph

Risk:

- low-medium

### Slice 6: Assemble Runtime Once

Create one runtime instance at module scope or through a small lazy initializer.

The simplest safe shape:

```ts
const audioRuntime = createMusicBoxAudioRuntime(...)
const keyboardRuntime = createMusicBoxKeyboardRuntime(...)
const wakeMonitor = createMusicBoxWakeMonitor(...)
```

Avoid recreating runtime instances on every `init()`.

Tests:

- `init()` twice still installs one keyboard listener set
- `init()` twice still installs one wake monitor
- `resetKeyboardControls()` and `resetWakeMonitor()` still clean up for tests

Risk:

- medium if initialization ordering changes

## End-State Example

This is the approximate shape we want in `musicbox.ts`:

```ts
const audioRuntime = createMusicBoxAudioRuntime({
  getContext,
  resetContext,
  frequencies: MUSICBOX_FREQUENCIES,
  hooks: {
    highlightKey,
    unhighlightKey,
    unhighlightAllKeys,
  },
})

const keyboardRuntime = createMusicBoxKeyboardRuntime({
  document,
  getInstrument: () => INSTRUMENTS[MutableRef.get(selectedInstrumentIndex)],
  audio: audioRuntime,
})

const wakeMonitor = createMusicBoxWakeMonitor({
  window,
  resetGraph: audioRuntime.resetGraph,
  now: () => Date.now(),
})
```

And then `init()` becomes orchestration:

```ts
export const init = (): Model => {
  audioRuntime.stopAllManualNotes()
  keyboardRuntime.bind()
  wakeMonitor.start()
  resetPlaybackRefs()
  return initialModel()
}
```

The MusicBox update path should remain obvious:

```ts
MusicBoxNoteOn: (msg) => {
  audioRuntime.primeFromGesture()
  audioRuntime.startManualNote(msg.pitch, INSTRUMENTS[model.selectedInstrument]!)
  return [model, []]
}
```

## Test Plan

Phase 4 should keep the existing MusicBox tests and add focused runtime tests as pieces become injectable.

Recommended new tests:

1. `musicboxAudioRuntime.test.ts`
   - one compressor per context
   - manual and scheduled notes route through compressor
   - duplicate manual note starts are ignored
   - stop uses `cancelAndHoldAtTime`
   - reset graph closes context and clears compressor state

2. `musicboxKeyboardRuntime.test.ts`
   - listener install/remove behavior
   - first-touch one-shot order
   - keydown starts mapped note
   - keyup releases mapped note
   - shortcuts ignore input/select/textarea targets

3. `musicboxWakeMonitor.test.ts`
   - starts once
   - reset removes listeners
   - persisted pageshow resets graph
   - large time jump resets graph

4. `musicboxDomain.test.ts`
   - all songs use known pitches
   - all QWERTY pitches resolve
   - transposition never returns unknown pitch for supported song transpose range
   - keyboard building stays inside known pitch range for supported settings

## Safari Manual Test After Each Risky Slice

Run the full Safari checklist after Slice 3 and Slice 4.

Minimum checklist:

1. Open with `npm run mobile`.
2. On iPhone/iPad Safari, tap MusicBox piano keys before pressing Play.
3. Press several piano keys quickly.
4. Play, pause, and resume a song.
5. Change instrument and play again.
6. Change octave and play QWERTY keys on Mac Safari.
7. Verify Counter and Bubbles still make sound.
8. Lock/wake device, then play MusicBox again.

## Non-Goals

Phase 4 should not:

- change audio envelope values
- change compressor settings
- change first-touch event types or capture options
- introduce an app-wide audio unlock service
- convert gesture priming into an Effect command
- add `webkitAudioContext` fallback
- remove silent WAV playback
- remove `navigator.audioSession` handling
- scope QWERTY behavior to the MusicBox page
- redesign instruments or song data

## Done Criteria

Phase 4 is done when:

- MusicBox audio, keyboard, and wake runtimes expose stable typed factory APIs
- raw `string` pitch usage is mostly isolated to data definitions and decode boundaries
- runtime state is private to runtime instances, not scattered across modules
- all existing tests pass
- new runtime tests cover the extracted boundaries
- Safari manual tests pass after the audio and keyboard runtime slices
- the code is easier to change without touching `src/audio.ts`

## Commit Strategy

Keep commits small:

1. domain type move only
2. pitch/frequency wrapper only
3. audio runtime factory only
4. keyboard runtime factory only
5. wake monitor factory only
6. test expansion and report update

Each commit should pass:

```text
npm test
npm run build
```

Run Safari manual tests after commits 3 and 4.
