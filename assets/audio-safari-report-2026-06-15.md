# FoldKid Audio + Safari Safety Report

Generated: June 15, 2026

## Phase 1 Implementation Status

Phase 1 has been implemented as diagnostic-only work:

- the Audio Test page now shows a visible diagnostic version/date
- each strategy logs event type, trusted-event status, user activation state, audio session state before/after, `AudioContext` creation/state, resume calls, and silent WAV playback results where relevant
- the broader codebase audit links back to this audio report
- production audio behavior in `src/audio.ts` and `src/games/musicbox.ts` was not changed

## Phase 2 Implementation Status

Phase 2 has been implemented as regression-test work only:

- song playback is now tested to route note gains through the MusicBox master compressor
- Safari first-touch priming is tested as a one-shot path that attempts `audioSession`, silent WAV playback, and context/compressor creation in that order
- wake recovery is tested through `pageshow` with `persisted=true`, proving the next note gets a fresh context and compressor
- production audio behavior in `src/audio.ts` and `src/games/musicbox.ts` was not changed

## Executive Summary

FoldKid currently has two audio paths:

1. `src/audio.ts` provides small command-based sound effects for Counter, Find It, and Bubbles.
2. `src/games/musicbox.ts` provides a richer Web Audio synth for MusicBox, sharing the same `AudioContext` but adding instruments, envelopes, a compressor, keyboard listeners, gesture priming, and sleep/wake recovery.

The current implementation is working and should be treated as fragile around Safari. The safe improvement strategy is not to "clean up" audio broadly. The safe strategy is:

- preserve the exact trusted-gesture timing currently used by MusicBox
- isolate diagnostics from behavior changes
- make one audio behavior change per patch
- test each behavior change on real Safari/mobile before committing
- improve observability and tests around the current behavior before extracting internals

The highest-value low-risk work is to consolidate audio diagnostics and document invariants. The highest-risk work is changing `src/audio.ts`, changing first-touch priming, or moving MusicBox note creation out of direct event/update timing without proving Safari still considers the call user-activated.

## Browser Policy Context

Safari and other browsers restrict audible media until the page has had user interaction. MDN's autoplay guide says media with audio is generally blocked if started programmatically before user interaction, and notes that Web Audio can also be blocked until page activation. MDN also documents that `AudioContext.resume()` returns a Promise and is the standard way to resume a suspended context.

WebKit's own iOS media policy guidance is especially important for this app: WebKit says the JavaScript that starts media must directly result from certain user event handlers such as `touchend`, `click`, `doubleclick`, or `keydown`. That is the reason FoldKid's current MusicBox code primes audio from capture-phase `pointerup` and `keydown`, not from a later async command.

The Audio Session API is still experimental and limited availability, but MDN documents `navigator.audioSession.type = "playback"` as the media-playback audio session type. FoldKid uses this carefully as a feature-detected Safari/mobile workaround, which is reasonable as long as it stays guarded and diagnostic-backed.

Sources:

- WebKit: <https://webkit.org/blog/6784/new-video-policies-for-ios/>
- MDN autoplay guide: <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay>
- MDN `AudioContext.resume()`: <https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume>
- MDN `navigator.audioSession`: <https://developer.mozilla.org/en-US/docs/Web/API/Navigator/audioSession>
- MDN `AudioSession.type`: <https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type>

## Current Architecture

### Shared Sound Effects

File: `src/audio.ts`

The shared audio module owns one `AudioContext` in a `MutableRef`:

- `sharedCtx` is created at `src/audio.ts:3`
- retired contexts are detected if state is `closed` or `interrupted`
- `resetContext()` closes and clears the shared context
- `getContext()` creates the context lazily, resumes it if suspended, and returns `undefined` if construction fails

Small sound effects are `Effect` commands:

- `click`
- `pop`
- `chime`
- `boing`
- `swoosh`

Each sound creates a short oscillator and gain envelope, then cleans up nodes through both `osc.onended` and a timeout fallback.

Important properties:

- The module is intentionally small.
- It does not install global gesture listeners.
- It does not try to own all browser audio policy.
- Its command names are testable through Foldkit command tests.

### MusicBox Synth Path

File: `src/games/musicbox.ts`

MusicBox shares the same `AudioContext` through `getContext()` from `src/audio.ts`, but wraps it with a MusicBox-specific `getCtx()` that creates one `DynamicsCompressorNode` per context:

- compressor state is tracked near `src/games/musicbox.ts:772`
- compressor setup happens at `src/games/musicbox.ts:781`
- compressor connects to `ctx.destination`
- note gains connect through the compressor when available

MusicBox has two note paths:

- song playback uses `playNoteAudio()` at `src/games/musicbox.ts:837`
- manual piano/QWERTY input uses `startNote()` and `stopNote()` at `src/games/musicbox.ts:949`

Song playback schedules short notes with a safety margin:

- `SAFETY_MARGIN = 0.03`
- oscillator starts at `ctx.currentTime + SAFETY_MARGIN`
- envelope ramps down to zero before cleanup

Manual piano notes:

- start immediately at `ctx.currentTime`
- keep active note handles in `activeNotes`
- reject duplicate starts for the same pitch
- release with `cancelAndHoldAtTime` when supported, falling back to cancel/setValue

### Safari Gesture Priming

MusicBox installs a first-touch priming handler in `bindKeyboard()`:

- code starts at `src/games/musicbox.ts:224`
- listeners are `pointerup` capture-phase and `keydown`
- first touch sets `navigator.audioSession.type = "playback"` if supported
- it plays a minimal silent WAV via `HTMLAudioElement`
- it calls MusicBox `getCtx()`, which creates/resumes the shared `AudioContext` and compressor
- it removes its one-shot listeners after firing

This is the most Safari-sensitive part of the app. The comment in the code explicitly says Foldkit dispatches messages asynchronously through a queue, so MusicBox eagerly initializes audio in the capture-phase gesture handler. That is a real architectural constraint, not incidental code.

### Sleep/Wake Recovery

MusicBox also has a wake monitor:

- `startWakeMonitor()` at `src/games/musicbox.ts:804`
- `pageshow` with `persisted` resets the audio graph
- a 5-second interval detects large time jumps and resets the graph
- `resetWakeMonitor()` removes the listener and interval

The goal is to handle Safari contexts that become unusable after sleep/wake. This is browser-specific defensive code and should remain isolated.

### Audio Diagnostic Page

File: `src/pages/audiotest.ts`

The diagnostic page is not production audio architecture. It is a manual lab for testing browser behavior. It includes:

- device/context logging
- silent WAV tests
- `audioSession` tests
- `click`, `touchend`, `pointerup`, and `pointerdown` variants
- Web Audio patterns like `resume()`, delayed playback, silent buffer priming
- HTMLAudioElement fallback testing
- legacy `webkitAudioContext` testing

This page is valuable because Safari behavior cannot be fully unit-tested in `happy-dom`.

## What Existing Tests Protect

### `src/audio.test.ts`

Current coverage includes:

- command names for simple sounds
- command effects return the expected message
- short sounds ramp down to a quiet target
- oscillator/gain nodes disconnect even if `onended` does not fire
- simple sounds and MusicBox notes share one `AudioContext`

This is good unit coverage for the shared module. It does not prove Safari trusted-gesture behavior.

### `src/games/musicbox.test.ts`

Current audio-related coverage includes:

- QWERTY keys start and release notes
- QWERTY keys follow octave offset
- manual piano notes route through one master compressor
- rapid distinct key presses start immediately
- note release holds the current envelope before fading
- keyboard listeners are removed by `resetKeyboardControls()`
- wake monitor starts once and can be reset
- song playback produces the `PlayMusicBox` command

This coverage is much better than the app had before. The remaining gap is not ordinary unit behavior; it is real Safari browser policy.

## Known Safari Risk Areas

### 1. Trusted Gesture Timing

The most dangerous change would be moving `AudioContext` creation/resume later in the event lifecycle.

Risky changes:

- replacing capture-phase `pointerup`/`keydown` priming with a command that runs later
- moving audio initialization into a timeout, Promise callback, or queued Foldkit command
- relying on `pointerdown` for touch without proving it works on current iOS Safari
- assuming a click handler and Foldkit update timing are equivalent to direct DOM event timing

Safe rule:

Keep the first unlock call directly inside a known qualifying user event until a real Safari test proves a new path works.

### 2. Shared `AudioContext` Lifecycle

The shared context is used by simple sounds and MusicBox. Changing it can break every game at once.

Risky changes:

- changing `getContext()` semantics
- making context creation eager on page load
- adding global app-level unlock listeners
- changing reset behavior while MusicBox has active notes
- adding `webkitAudioContext` fallback without tests and real Safari validation

Safe rule:

Treat `src/audio.ts` as a small stable boundary. Prefer wrappers and diagnostics before changing its behavior.

### 3. Compressor Path

The compressor is important for preventing loudness spikes when multiple MusicBox notes overlap. Current tests assert that manual notes route through one compressor.

Risky changes:

- bypassing `masterCompressor`
- creating a new compressor per note
- resetting the graph without clearing the compressor state
- changing instrument gains without testing rapid multi-key input

Safe rule:

Keep compressor behavior as a protected invariant. Any synth extraction should include the current compressor test and add one song-playback compressor test.

### 4. Manual Note Release

The release code uses `cancelAndHoldAtTime` when available. This helps avoid abrupt pops by preserving the current envelope value before ramping down.

Risky changes:

- replacing release with `setValueAtTime(masterGain.gain.value, now)` only
- stopping oscillators immediately on keyup
- disconnecting nodes before the release envelope completes

Safe rule:

Do not simplify release behavior unless a test proves no abrupt stop and Safari/mobile testing confirms no pops.

### 5. Sleep/Wake Recovery

The wake monitor is intentionally defensive. It may look strange because it is guarding against browser state, not app state.

Risky changes:

- removing the time-jump detector
- resetting only app model state but not the audio graph
- recreating the context while notes are still active without clearing notes first

Safe rule:

If wake recovery changes, test: play a note, sleep/wake or lock/unlock, then play again on Safari.

## Recommended Improvement Plan

### Phase 1: Documentation And Diagnostics

Low risk.

1. Keep this report near the audit docs.
2. Add a short `AUDIO_SAFETY.md` or link this report from the main audit.
3. Add a visible version/date to the audio diagnostic page so screenshots from mobile testing identify the code under test.
4. Make the diagnostic page report:
   - current `AudioContext.state`
   - whether `resume()` was called
   - whether `resume()` resolved or rejected
   - whether `navigator.audioSession` exists
   - audio session type before and after setting `playback`
   - which event type fired
   - whether the test ran in `pointerdown`, `pointerup`, `touchend`, `click`, or `keydown`

Do not change production audio behavior in this phase.

### Phase 2: Regression Tests Around Current Invariants

Implemented as test-only work.

Add tests that lock down current intended behavior:

1. MusicBox song playback routes note gains through the compressor, not just manual notes.
2. `resetAudioGraph()` clears compressor state when the context is reset. This may need a small exported test hook, or can be covered through wake monitor behavior.
3. First-touch listener is one-shot:
   - installed once
   - removed after firing
   - removed by `resetKeyboardControls()`
4. First-touch handler order is stable:
   - audio session attempted
   - silent WAV attempted
   - `getCtx()` called
   - listeners removed

Avoid asserting too much implementation detail unless the test is explicitly named as a Safari safety invariant.

### Phase 3: Extract Without Behavior Change

Medium risk, but manageable if mechanical.

Possible extraction:

- `musicbox/audioRuntime.ts`
- `musicbox/keyboardRuntime.ts`
- `musicbox/wakeMonitor.ts`

Rules:

- do not change event types
- do not change capture/passive options
- do not change when `getCtx()` is called
- do not change envelope constants
- do not change compressor settings
- move code in one runtime at a time
- run existing tests after each move
- test on Safari/mobile after the keyboard/audio runtime move

This phase is about containment, not redesign.

### Phase 4: Improve Audio Runtime API

Medium risk.

Once extraction is complete, define a tiny runtime API:

```ts
interface MusicBoxAudioRuntime {
  primeFromGesture(): void
  startManualNote(pitch: string, instrument: Instrument): void
  stopManualNote(pitch: string): void
  playScheduledNote(pitch: string, duration: number, instrument: Instrument): void
  stopAll(): void
  resetGraph(): void
}
```

The important part is not the exact interface. The important part is that Safari-sensitive operations remain synchronous and callable directly inside a trusted gesture handler.

### Phase 5: Optional Fallbacks

Higher risk. Only do after diagnostics prove a need.

Potential fallback ideas:

- feature-detected `webkitAudioContext`
- HTMLAudioElement fallback for simple beep/chime sounds
- a user-visible "Tap to enable sound" state if context remains suspended
- a diagnostic event log saved in memory for support/debugging

Do not add these speculatively. The app has already broken once from plausible audio changes.

## Changes To Avoid

Avoid these unless there is a focused failing case and real Safari validation:

- broad refactor of `src/audio.ts`
- global app-wide audio unlock streams
- changing first audio init from `pointerup`/`keydown` to `pointerdown`
- moving unlock behavior from direct DOM event handlers into Foldkit commands
- changing `getContext()` to eagerly construct on app init
- removing the compressor
- removing the silent WAV or `audioSession` behavior without diagnostic evidence
- merging diagnostic strategies into production all at once
- changing audio and MusicBox UI/keybind behavior in the same patch

## Suggested Manual Safari Test Checklist

Run this before merging any audio behavior change:

1. Open the app through `npm run mobile` on the same Wi-Fi.
2. On iPhone/iPad Safari, verify Counter click sound.
3. Verify Bubbles color add sound and pop sound.
4. Verify MusicBox on-screen piano note on/off.
5. Verify QWERTY key notes on Mac Safari.
6. Press many MusicBox keys quickly and listen for skipped notes or loud spikes.
7. Toggle mute switch on iOS if available and test MusicBox.
8. Lock the device or sleep the Mac, wake it, then play MusicBox again.
9. Open the Audio Test page and record which strategy letters work.
10. Check console diagnostics for context state and audio session type.

## Recommended Next Commit

The safest next commit should be report-only or diagnostic-only:

- add this report
- add an audio diagnostic page version label
- add non-behavioral tests around first-touch listener cleanup/order if practical

After that, the next safe implementation target is extracting MusicBox audio runtime code mechanically without changing behavior.

## Bottom Line

FoldKid's current audio is not perfect, but it is working. The best improvement path is containment and observability, not cleverness. Safari compatibility depends on exact timing around user gestures, so the app should preserve the current gesture priming path until a real device proves a replacement.
