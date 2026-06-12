# Effect-TS / Foldkit Usage Audit

Generated: June 12, 2026

## Executive Summary

FoldKid is using Foldkit well as its main application architecture: model, message, update, view, commands, subscriptions, and test stories are all recognizably in the Foldkit style. The strongest parts of the codebase are the typed message constructors, schema-backed models, exhaustive update matches, and the focused `foldkit/test` coverage around update and scene behavior.

Effect-TS is used productively, but mostly as boundary glue rather than as a fuller application effect system. That is a reasonable choice for a small browser game app. The main opportunity is to move more browser-resource lifecycle work into Effect/Foldkit boundaries instead of relying on module-level mutable state, raw timers, global listeners, and direct DOM/audio side effects inside update functions.

Overall rating: **7.5/10**

- Foldkit usage: **8.5/10**
- Effect-TS usage: **6.5/10**
- Type/schema discipline: **8/10**
- Resource lifecycle discipline: **6/10**
- Test alignment with architecture: **8/10**

## What Is Working Well

### 1. Foldkit Runtime Shape Is Clear

`src/entry.ts` creates one Foldkit program with `Runtime.makeProgram`, passing `Model`, `init`, `update`, `view`, `subscriptions`, and dev tools message schema. That is the right top-level shape for Foldkit.

The app keeps the core Foldkit loop easy to follow:

- `src/main.ts` defines the root `Model` and root `Message`.
- Each game module owns its own model, message union, update, and view.
- Root update delegates submessages to `Counter.update`, `FindIt.update`, `Bubbles.update`, and `MusicBox.update`.
- Page rendering is selected with an exhaustive page match.

This is a good Foldkit foundation.

### 2. Message Modeling Is Strong

Messages are consistently created with `m()` from `foldkit/message`, with payloads declared using Effect Schema. This gives the app both runtime validation metadata and useful static types.

Examples:

- `src/message.ts` for top-level app/settings messages
- `src/games/counter.ts` for counter messages
- `src/games/findit.ts` for game messages and drag/drop messages
- `src/games/bubbles.ts` for bubble/color messages
- `src/games/musicbox.ts` for playback, piano, transpose, and song-order messages

This is one of the codebase's best uses of Foldkit.

### 3. Exhaustive Updates Are Doing Real Work

The app consistently uses `Match.tagsExhaustive` in update functions. That means adding a message without handling it is a compile-time event instead of a quiet runtime bug.

This pattern appears in:

- Root `update` in `src/main.ts`
- `Counter.update`
- `FindIt.update`
- `Bubbles.update`
- `MusicBox.update`

That is exactly the kind of type pressure that makes Foldkit/Effect pleasant.

### 4. Commands Represent Most User-Facing Effects

Audio and speech actions are usually returned as `Command.Command<Message>` values rather than being run directly from views. This keeps the user-flow effects connected to messages and testable through Foldkit stories.

Good examples:

- `src/audio.ts` exposes generic `click`, `pop`, `chime`, `boing`, and `swoosh` command factories.
- `src/speech.ts` wraps `SpeechSynthesisUtterance` in `Effect.callback`.
- `Counter.update`, `FindIt.update`, and `Bubbles.update` return sound/speech commands.
- `MusicBoxPlay` returns a `PlayMusicBox` command instead of trying to play the full song directly in the view.

### 5. Subscriptions Are Used Appropriately

`src/subscriptions.ts` uses `Subscription.make` for document-level settings-panel drag behavior. This is the right tool for events that are not naturally scoped to a single rendered element.

The dependency mapping is simple:

- dependency: `isDraggingSettings`
- active streams: `pointermove` and `pointerup`
- emitted messages: `SettingsDragMoved` and `SettingsDragEnded`

This is a good Foldkit subscription example.

### 6. Mount Hooks Are Used For Imperative Widgets

The app uses `h.OnMount` where imperative browser APIs are unavoidable:

- counter ball physics
- bubbles animation and mutation tracking
- color-selector pointer capture
- music-box piano pointer streams
- dark-mode media-query listener
- audio-test controls

The better mount hooks use `Stream.callback` plus `Effect.acquireRelease`, which gives a clear setup/cleanup lifecycle. `Bubbles` is a good example here.

### 7. Tests Match The Architecture

The tests use `foldkit/test` well:

- `Story.story` checks model transitions and command production.
- `Story.Command.resolveAll` verifies command-to-message loops.
- `Scene.scene` checks rendered text and mounted streams.
- Direct `Effect.runPromise` tests exist for command effects such as audio/speech.

Current verification:

- `npm run typecheck` passes.
- `npm test` passes: 11 files, 191 tests.

## Main Gaps

### 1. Too Much Module-Level Mutable Runtime State

Several browser resources and runtime flags live in module scope:

- `src/audio.ts`: shared `AudioContext` via `MutableRef`
- `src/speech.ts`: global `speechSynthesis.cancel()`
- `src/main.ts`: persisted settings debounce timer
- `src/games/bubbles.ts`: global pointer-down ref
- `src/games/musicbox.ts`: audio context, compressor, playback flags, active notes, current lyric line, keyboard binding flags

Some module-level state is acceptable for singleton browser resources, but the code currently mixes app state, runtime state, and resource state. That makes behavior harder to reason about under remounts, tests, hot reload, page sleep/wake, and multiple active flows.

Recommended direction:

- Keep domain state in Foldkit models.
- Keep browser resources in small services/modules with explicit acquire/release operations.
- Prefer `Effect.acquireRelease`, `Effect.addFinalizer`, `Scope`, or `OnMount` lifecycles for long-lived listeners and animation loops.
- Avoid mutating singleton flags directly from update handlers when a command can express the effect.

### 2. Some Side Effects Happen Directly Inside Update

The architecture is cleanest when `update` is pure and returns commands. A few places break that boundary:

- `ConfirmResetSettings` directly calls `localStorage.removeItem`.
- import handlers directly write `localStorage`.
- `MusicBox.update` directly calls `getCtx`, `startNote`, `stopNote`, `stopAllNotes`, and DOM highlight helpers.
- `MusicBox` tempo/pause/transpose handlers directly mutate `MutableRef` playback flags.

This is pragmatic and works, but it weakens testability and makes updates less replayable. Since Foldkit already has `Command`, these should gradually move behind commands.

Recommended direction:

- Create named commands for localStorage writes/removes.
- Create named commands for music box note-on/note-off/stop-all/highlight behavior.
- Keep update as "calculate next model + declare effects".

### 3. Persistence Is Not Using Effect Scheduling

`persistSettings` creates a command but performs the actual debounce setup immediately through a module-level `setTimeout`. The returned command only resolves `SettingsPersisted`.

That means the main side effect is outside the command's `Effect`, so Foldkit/Effect cannot supervise, cancel, or test it directly.

Recommended direction:

- Put the timer/write inside the command effect.
- Consider an Effect queue/debounce loop if persistence becomes more complex.
- At minimum, make `PersistSettings` perform the `localStorage.setItem` in `Effect.sync`, and use a single app-level subscription/command loop for debouncing.

### 4. Runtime Data Validation Stops Short At Boundaries

Models and messages use Effect Schema, which is great. But persisted/imported settings are parsed as JSON and then manually checked with partial guards.

Current behavior checks things like version and language, and filters some arrays. But `PersistedSettings` itself is only a TypeScript interface, not an Effect Schema.

Recommended direction:

- Define `PersistedSettingsSchema` with `Schema.Struct`.
- Decode imported JSON with Effect Schema.
- Use transforms/defaults to normalize old or partial settings.
- Reuse the same schema for `loadSettings`, import, export, and tests.

This would make settings import/export feel much more "Effect-native".

### 5. Resource Cleanup Is Mixed

Some mount hooks clean up well with `Effect.acquireRelease`. Others install global resources without a matching teardown:

- `main.ts` adds a `touchend` listener in `preventDoubleTapZoom` but returns `Stream.never`, with no cleanup.
- `musicbox.ts` binds keyboard listeners globally from `init()` via module-level flags.
- `musicbox.ts` adds `pageshow` and interval wake checks at module load.

Recommended direction:

- Move global listeners into subscriptions or `OnMount` streams with cleanup.
- Avoid binding listeners in `init()`.
- Give long-running intervals a release path.

### 6. MusicBox Is The Largest Architectural Outlier

`MusicBox` is feature-rich, but it is also where the app departs most from Foldkit purity:

- audio nodes are created and stopped from helper functions called by update
- playback flags are module-level `MutableRef`s
- keyboard listeners are bound from `init()`
- DOM highlighting is done with `document.querySelectorAll`
- song playback is an Effect command, but note-level imperative state is outside the model/command boundary

This is not a disaster; music/audio often needs imperative work. But it would benefit from a clearer boundary.

Recommended direction:

- Introduce a small `MusicAudio` module with commands:
  - `playSong`
  - `stopSong`
  - `noteOn`
  - `noteOff`
  - `stopAllNotes`
- Keep all Web Audio nodes inside that module.
- Let update return commands instead of touching audio directly.
- Keep keyboard/pointer listeners mounted by the piano view or root subscriptions.

### 7. Types Are Good, But Domain Types Could Be Sharper

The recent translation key split is a good improvement: `t()` now accepts string-valued keys, while `tf()` handles function-valued keys. That prevents accidentally passing `greeted`/`whereIs` into `t()`.

Other opportunities:

- `language` is still mostly `string`; it could be a `Language` literal union/schema.
- song keys and instrument keys are plain strings; they could be literal unions derived from data.
- model fields like `settingsOverlay` could be a tagged union or literal union instead of `string`.
- numeric fields such as tempo, transpose, white key count, and panel width could be branded/refined schemas if invalid values matter at runtime.

The codebase is already strict TypeScript. These refinements would make the domain more self-documenting and less defensive.

## Prioritized Recommendations

### High Impact

1. **Move localStorage side effects fully into commands.**
   Keep `update` pure and make persistence testable through command resolution.

2. **Schema-decode persisted/imported settings.**
   Replace the `PersistedSettings` interface plus ad hoc guards with a real Effect Schema.

3. **Create an explicit MusicBox audio boundary.**
   Keep Web Audio resource mutation behind commands/services instead of inside update.

### Medium Impact

4. **Move global listeners into subscriptions or acquired mount hooks.**
   Start with music-box keyboard listeners and `preventDoubleTapZoom`.

5. **Replace stringly state with literal unions.**
   Good first targets: `language`, `settingsOverlay`, song keys, instrument keys.

6. **Make `SETTINGS_TAGS` safer.**
   Today it is a string set of message tags. A typed helper or settings-message classifier would reduce drift.

### Lower Impact

7. **Consolidate shared audio context handling.**
   `src/audio.ts` exports `getContext`, but `MusicBox` still owns its own `AudioContext`. Sharing a single audio service would simplify resource behavior.

8. **Add command-level tests for failure cases.**
   Examples: clipboard failure, speech synthesis unavailable, audio context unavailable, invalid settings import.

9. **Consider smaller model schemas.**
   Some `S.Struct({...})` definitions are single long lines. Splitting them improves maintainability without changing behavior.

## Best Examples To Preserve

- `m()` message constructors with schema payloads.
- Root `Message = S.Union([...])`.
- `Match.tagsExhaustive` in every update.
- Game-level update delegation from root update.
- `foldkit/test` stories for command-producing updates.
- `Stream.fromEventListener` in subscriptions and piano pointer streams.
- `Effect.acquireRelease` in animation mount hooks.

## Risk Assessment

The app is in a healthy state for a small browser game suite. Its biggest risks are not type errors right now; they are lifecycle and replayability risks:

- global mutable state can survive longer than the model that conceptually owns it
- direct update side effects make stories less representative of real runtime behavior
- timers/listeners without clear finalizers can accumulate after hot reloads or remounts
- imported settings validation is weaker than the model/message schema discipline

None of these require a rewrite. The architecture is good enough that incremental cleanup should work well.

## Final Rating

FoldKid is using Foldkit strongly and Effect-TS competently. It gets the core typed Elm architecture right: schema-backed messages, exhaustive updates, commands, subscriptions, and Foldkit-specific tests. To use Effect "at its best", the next step is not more abstraction everywhere; it is cleaner resource ownership at the browser boundary.

Final score: **7.5/10**

With schema-backed settings, command-based persistence, and a cleaner music/audio boundary, this could comfortably become an **8.5-9/10** Effect/Foldkit codebase.
