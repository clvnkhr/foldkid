# FoldKid Audio Audit

Generated: June 15, 2026

## Executive Summary

Audio is in a much healthier state than it was before the Safari-focused cleanup.

The current architecture has a clear separation between:

- shared short sound effects in `src/audio.ts`
- MusicBox domain typing in `src/games/musicboxDomain.ts`
- MusicBox Web Audio graph/runtime behavior in `src/games/musicboxAudioRuntime.ts`
- MusicBox keyboard and Safari first-touch priming in `src/games/musicboxKeyboardRuntime.ts`
- MusicBox wake recovery in `src/games/musicboxWakeMonitor.ts`
- manual browser diagnostics in `src/pages/audiotest.ts`

The biggest win is that Safari-sensitive behavior is no longer mixed deeply into `musicbox.ts`, but it has also not been abstracted into asynchronous Effect commands. That is the right balance for this app.

Current assessment: **good and improving, with Safari-sensitive production behavior still deserving caution.**

## What Is Working Well

### Shared Audio Context

`src/audio.ts` remains small and stable.

Strengths:

- one shared `AudioContext`
- retired contexts are reset when state is `closed` or `interrupted`
- suspended contexts are resumed opportunistically
- short effects clean up nodes through both `onended` and a timeout fallback
- commands retain useful names such as `PlayClick`, `PlayPop`, and `PlayChime`

This file should stay conservative. It is used by Counter, Find It, Bubbles, and MusicBox.

### MusicBox Runtime Boundary

MusicBox now has a real audio runtime API:

```ts
createMusicBoxAudioRuntime({
  getContext,
  resetContext,
  frequencies,
  hooks,
})
```

Strengths:

- compressor state is private to the audio runtime instance
- active manual notes are private to the audio runtime instance
- manual and scheduled notes share the same compressor path
- note starts receive branded `Pitch` values instead of arbitrary strings
- invalid pitch strings are filtered before crossing into runtime audio behavior
- `primeFromGesture()` is synchronous and can still be called directly inside trusted event/update paths

This is a meaningful improvement over module-global audio state and raw string/frequency plumbing.

### Safari First-Touch Path

The current first-touch path is still intentionally direct:

1. `pointerup` capture listener or `keydown`
2. attempt `navigator.audioSession.type = 'playback'`
3. play silent WAV
4. call `audio.primeFromGesture()`
5. remove first-touch listeners

That ordering is now protected by regression tests and confirmed manually on Safari after Phase 4.

This path should be treated as an audio compatibility contract.

### Wake Recovery

Wake recovery is now isolated behind `createMusicBoxWakeMonitor(...)`.

Strengths:

- starts only once
- removes listener and interval on reset
- resets graph on `pageshow` with `persisted=true`
- detects large time jumps
- is directly unit-tested

This is exactly the kind of browser-defense code that benefits from isolation.

### Domain Typing

`musicboxDomain.ts` now gives MusicBox audio a stronger vocabulary:

- `Pitch`
- `FrequencyHz`
- `FrequencyTable`
- `Instrument`
- `Song`
- `KeyDef`

This makes it easier to tell the difference between:

- a raw note string from a message
- a known pitch in the frequency table
- a raw number
- a branded frequency

That is the right direction for Effect/foldkit work: validate/shape data at boundaries, then keep hot audio paths direct.

## Test Coverage

Current audio coverage is strong for unit and integration behavior.

Protected now:

- simple audio command names
- simple sound command effects
- simple sound cleanup fallback
- shared context between simple sounds and MusicBox
- MusicBox manual note compressor routing
- MusicBox scheduled/song compressor routing
- rapid QWERTY notes start immediately
- release uses `cancelAndHoldAtTime`
- first-touch priming is one-shot and ordered
- wake monitor starts once and resets graph on persisted pageshow
- domain pitch branding rejects unknown pitch names
- keyboard building emits known pitches
- QWERTY pitch mappings resolve

Important limitation:

Unit tests cannot prove Safari trusted-gesture behavior. They can only protect the shape and order of the code. Manual Safari testing remains required after any change to first-touch, context creation, silent WAV playback, audio session handling, or event types.

## Remaining Risks

### 1. Safari Trusted-Gesture Fragility

Risk level: **high if changed, low if left alone**

The app currently works because audio priming happens synchronously from qualifying events. Moving priming into queued commands, timers, promises, or broad app services could break Safari again.

Do not change:

- `pointerup` capture priming
- `keydown` priming
- silent WAV playback
- `audioSession.type = 'playback'`
- synchronous `primeFromGesture()`

without real Safari validation.

### 2. Global QWERTY Behavior

Risk level: **medium product ambiguity**

QWERTY MusicBox keys currently work outside the MusicBox page after MusicBox has initialized. This is known and currently not considered part of the audio cleanup.

Pros:

- instant keyboard play
- no focus problems

Cons:

- surprising sound outside MusicBox
- document-level key interception can affect other app surfaces

Recommendation: leave it alone until it becomes a product task. If changed, scope it explicitly with tests.

### 3. Shared Context Coupling

Risk level: **medium**

Simple effects and MusicBox share `src/audio.ts`. This is good for browser resource use, but any change to shared context lifecycle can affect all games.

Recommendation: keep `src/audio.ts` small. If adding new behavior, use tests that exercise both simple sounds and MusicBox.

### 4. Runtime Test Mocks Are Still Local

Risk level: **low-medium**

Audio tests now contain several local Web Audio mocks. They are useful, but duplication could grow.

Recommendation: if more audio tests are added, extract a small test helper such as:

- `src/test/audioContextMock.ts`

Do this only when duplication becomes painful.

### 5. Scheduled Playback Cleanup Is Timer-Based

Risk level: **low currently**

MusicBox scheduled notes and manual releases clean up with `setTimeout`. This is practical and works, but timer behavior can be throttled in background tabs.

Current wake recovery reduces this risk. No change is recommended unless a real bug appears.

## Recommended Next Work

### 1. Add Direct Keyboard Runtime Tests

Priority: **medium**

`musicbox.test.ts` currently protects keyboard behavior through MusicBox integration tests. A focused `musicboxKeyboardRuntime.test.ts` would make the new boundary more complete.

Suggested tests:

- bind installs keydown, keyup, pointerup capture, first-touch keydown, and shortcut keydown
- reset removes those listeners
- first-touch is one-shot
- keydown starts a mapped pitch
- keyup releases the mapped pitch
- octave offset shifts pitch through `FrequencyTable`
- shortcuts ignore input/select/textarea targets

### 2. Add Audio Runtime Reset Tests

Priority: **medium**

Current tests cover compressor routing and duplicate manual starts. Add direct tests for:

- `resetGraph()` calls `resetContext`
- `resetGraph()` clears active notes
- next note after reset creates a new compressor
- `stopAllManualNotes()` releases all active notes

### 3. Consider Branded Duration Types

Priority: **low**

`dur`, `attack`, `decay`, and `release` are still plain numbers. This is acceptable, but branded types could clarify:

- beat duration
- seconds
- tempo multiplier

Do not do this if it makes song data noisy. The current bigger win was pitch/frequency typing.

### 4. Keep Audio Test Page As A Manual Lab

Priority: **ongoing**

The Audio Test page remains valuable because Safari behavior cannot be fully simulated in Vitest/happy-dom.

Keep it separate from production behavior. Do not promote experimental strategies into production without a focused bug and device test.

### 5. Document Safari Checks In PR/Commit Notes

Priority: **ongoing**

Any future audio-affecting commit should mention whether Safari was tested and which checklist was run.

Minimum checklist:

1. MusicBox piano tap before Play
2. rapid MusicBox note presses
3. Play/Pause/Play song
4. instrument change
5. Counter sound
6. Bubbles sound
7. sleep/wake then MusicBox
8. mute switch if available

## Things To Avoid

Avoid these unless there is a focused failing case:

- moving `primeFromGesture()` into an Effect command
- replacing `pointerup` capture with `pointerdown`
- deleting silent WAV playback
- deleting `navigator.audioSession` handling
- changing compressor settings as part of unrelated cleanup
- making `AudioContext` eager on app load
- broad refactors of `src/audio.ts`
- merging Audio Test strategies into production all at once
- changing global QWERTY behavior while doing audio runtime work

## Overall Grade

**Architecture: B+**

The architecture is now cleanly split and much easier to reason about. The remaining complexity is mostly genuine browser/audio complexity.

**Type Safety: B+**

Pitch and frequency handling are much safer. Durations and instrument numeric ranges are still plain numbers, but that is acceptable for now.

**Test Coverage: B+**

The critical regressions are covered, including compressor routing, first-touch order, wake recovery, and domain invariants. Direct keyboard-runtime tests are the most obvious remaining gap.

**Safari Safety: B**

The important behavior is preserved and manually confirmed. The grade is not higher because Safari audio compatibility is inherently hard to prove in automated tests.

## Bottom Line

Audio is now in a good place. The codebase has moved from fragile working behavior to structured working behavior, which is exactly what we wanted.

The best next step is not more production audio changes. The best next step is small, focused test expansion around `musicboxKeyboardRuntime.ts` and `musicboxAudioRuntime.ts`, while preserving the Safari-tested behavior exactly.
