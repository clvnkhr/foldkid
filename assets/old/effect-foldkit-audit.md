# Effect-TS / Foldkit Usage Audit

Generated: June 13, 2026

## Executive Summary

FoldKid is using Foldkit well as its main application architecture. The model/message/update/view loop is clear, game updates are delegated cleanly from the root update, messages are schema-backed, and the tests mostly match the architecture through `foldkit/test` stories and scenes.

Effect-TS is useful here, but the app uses it mostly as boundary glue for browser APIs rather than as a full service/runtime layer. That is a reasonable choice for this app. The best next improvements are not broad rewrites; they are small boundary hardening changes with regression tests.

Overall rating: **8/10**

- Foldkit usage: **8.5/10**
- Effect-TS usage: **7/10**
- Type/schema discipline: **8/10**
- Resource lifecycle discipline: **7/10**
- Test alignment with architecture: **8.5/10**

## Important Lesson: Do Not Refactor Working Web Audio Casually

During follow-up work, an uncommitted attempt to improve the shared audio lifecycle broke sound in Safari. Counter, Bubbles, and MusicBox all went silent, which showed the issue was not the piano keybinds but the shared browser audio path.

The reverted experiments included broad app-level audio unlock behavior, capture-phase gesture listeners, silent priming audio, `webkitAudioContext` fallback wiring, and changes to shared `audio.ts` construction/unlock behavior. Even plausible Web Audio changes can break Safari because playback depends on exact trusted-gesture timing, browser policy, and current `AudioContext` state.

Rule going forward:

- Treat `src/audio.ts` and MusicBox Web Audio internals as high-risk.
- Do not bundle audio changes with type/schema cleanup.
- Do not add global audio unlock listeners without a browser-side diagnostic first.
- Change one audio behavior at a time, test in real Safari, then commit.
- Unit tests cannot prove Safari gesture-unlock correctness.

If audio needs work again, first add a temporary diagnostic that reports:

- whether the user gesture handler fired
- whether `AudioContext` construction succeeded
- context state before and after `resume()`
- whether oscillator `start()` ran
- whether the command ran inside or after the trusted gesture

## Improvements Already Made

### Settings Persistence

Settings are now schema-backed and persistence side effects are represented as commands.

Good current patterns:

- `PersistedSettingsSchema` and `SettingsExportSchema` define runtime boundaries.
- `loadSettings` decodes persisted JSON through Effect Schema.
- import/export uses one shared parse/apply path.
- `PersistSettings` and `RemoveSettings` perform `localStorage` writes/removes inside command effects.
- tests run those command effects and assert real `localStorage` results.

This is a strong Effect/Foldkit improvement: update declares the effect, and tests can resolve or run it.

### Root Mount Cleanup

`preventDoubleTapZoomStream` now uses `Effect.acquireRelease`, so the `touchend` listener has a real teardown path.

This is the right pattern for DOM listeners that live outside normal element event attributes.

### Speech Command

`speech.ts` is more robust:

- `speak()` uses `Effect.callback`.
- it handles missing browser speech APIs.
- the deferred speak timer is cleaned up if the effect is interrupted.
- tests cover missing speech APIs and interruption before deferred `speak()`.

This is a good example of wrapping callback/browser behavior with Effect rather than pretending it is synchronous.

### Counter Press State

Counter no longer relies on view-local variables for press timing. Pointer-down time and pressed button are part of the model, so rerenders do not turn quick taps into long holds.

This is exactly the right Foldkit move: interaction state that affects update behavior belongs in the model.

### MusicBox Listener Lifecycle

MusicBox keyboard and wake monitor state is better controlled:

- shortcut listeners now have stable handler references
- `resetKeyboardControls()` removes document listeners in tests
- the wake monitor has explicit start/reset functions
- tests cover listener cleanup and wake monitor cleanup

This is an improvement, though MusicBox remains the biggest imperative module.

## What Is Working Well

### 1. Foldkit Runtime Shape

The app follows the expected Foldkit shape:

- `src/main.ts` defines the root model, message union, update, and view.
- each game owns its own model/message/update/view.
- root update delegates to game updates.
- page rendering uses exhaustive matching.
- commands are returned from updates rather than being executed from views.

This foundation is good and should be preserved.

### 2. Schema-Backed Messages

Messages are consistently built with `m()` and Effect Schema payloads. This gives both type pressure and runtime metadata.

Best examples:

- root messages in `src/message.ts`
- Counter messages with duration payloads
- FindIt drag/drop messages
- Bubbles color/pop messages
- MusicBox playback, note, keyboard, transpose, and drag messages

### 3. Exhaustive Update Matching

The app uses `Match.tagsExhaustive` across root and game updates. This makes message additions visible at compile time.

Keep this pattern.

### 4. Tests Match The Architecture

The test suite uses:

- `Story.story` for model transitions and command production
- `Story.Command.resolveAll` for command loops
- `Scene.scene` for view and mount behavior
- direct `Effect.runPromise` for command effects

This is the right testing style for Foldkit.

## Remaining Gaps

### 1. MusicBox Still Mixes Model, Runtime State, DOM, And Audio

MusicBox is feature-rich, but it is still the largest architectural outlier.

Remaining concerns:

- note start/stop happens directly inside update handlers
- playback flags are module-level `MutableRef`s
- active notes and compressor state live outside the model
- DOM highlighting uses direct document queries
- keyboard listeners are still bound from `init()`

Recommended direction, but only in small steps:

- first add diagnostics and tests around existing behavior
- then move one imperative operation at a time behind a named command
- avoid changing Web Audio construction/unlock behavior unless testing in Safari immediately

### 2. Audio Is A Special Case

`src/audio.ts` is intentionally simple and currently working. The audit should not pressure broad changes there.

Acceptable future audio changes:

- tiny, isolated, browser-tested fixes
- diagnostic-only additions
- tests that verify command names and command completion

Avoid:

- app-wide audio unlock streams
- global capture listeners for every gesture
- changing oscillator/gain cleanup without testing in Safari
- changing context construction and MusicBox behavior in the same patch

### 3. Some Update Handlers Still Perform Direct Side Effects

Most settings side effects are now commands, but MusicBox still performs direct audio and DOM effects from update.

This weakens replayability and makes stories less representative of real runtime behavior.

Recommended direction:

- move non-audio DOM cleanup to commands first
- leave audio internals alone until a diagnostic proves the change is needed
- prefer command wrappers for stop/highlight cleanup before touching oscillator logic

### 4. Domain Types Can Still Be Sharper

Some string/numeric fields remain broad:

- language is still mostly a string in the current committed app
- `settingsOverlay` is a string
- song keys and instrument keys are plain strings
- settings tags are string literals in a `Set`

Good future targets:

- `Language` literal schema
- `settingsOverlay` literal union
- typed settings-affecting message classifier
- literal unions for song and instrument keys

These are safer than audio work and should be preferred.

### 5. `SETTINGS_TAGS` Is Still Stringly Typed

`SETTINGS_TAGS` depends on message `_tag` strings matching actual message tags.

This works, but a future rename could silently skip persistence.

Possible improvement:

- create a typed helper around settings-affecting message tags
- or colocate persistence behavior with message handlers

## Updated Recommendations

### Highest Priority

1. **Protect the working audio path.**
   Do not refactor `src/audio.ts` or MusicBox Web Audio internals without a diagnostic and real Safari test.

2. **Continue schema/domain typing away from audio.**
   Good targets are `Language`, `settingsOverlay`, song keys, and instrument keys.

3. **Move non-audio direct side effects into commands.**
   Start with DOM/highlight cleanup or settings/UI effects, not oscillator playback.

### Medium Priority

4. **Make `SETTINGS_TAGS` safer.**
   Reduce string drift around persistence.

5. **Continue listener lifecycle cleanup.**
   Use `Effect.acquireRelease` for document/window listeners where behavior is already understood.

6. **Add diagnostics for browser-sensitive systems.**
   Audio, speech, and media APIs need real runtime observability because unit tests do not model browser policy.

### Lower Priority

7. **Split large files only when behavior is stable.**
   `i18n.ts` and `musicbox.ts` are large, but splitting them should be mechanical and should not coincide with behavior changes.

8. **Refine numeric schemas if invalid values become real bugs.**
   Tempo, transpose, panel width, and white key count could eventually use refined schemas.

## Safe Next Work

Good next tasks:

- add `Language` schema and normalize persisted/imported language
- make `settingsOverlay` a literal union
- tighten import/export tests
- make settings persistence tags safer
- add diagnostics-only audio test page fields
- update stale audit comments after each completed improvement

Risky next tasks:

- changing `src/audio.ts`
- changing Safari unlock behavior
- changing MusicBox oscillator/gain/compressor routing
- moving keyboard listeners and audio unlock in the same patch
- adding global capture-phase listeners

## Best Patterns To Preserve

- `m()` message constructors with schema payloads
- root `Message = S.Union([...])`
- `Match.tagsExhaustive`
- root-to-game update delegation
- command factories for effects
- `Effect.acquireRelease` for mount/listener lifecycles
- `foldkit/test` stories for update and command assertions

## Final Notes

The app is in a healthier state than the original audit, mainly because settings persistence, import validation, speech cleanup, root mount cleanup, and Counter interaction state have improved.

The main lesson from the failed audio experiment is that "more Effect-managed" is not automatically safer for browser media. For Web Audio, preserving the exact working gesture path matters more than architectural neatness.
