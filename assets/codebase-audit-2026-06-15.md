# FoldKid Codebase Audit

Generated: June 15, 2026

## Executive Summary

The codebase is in a better place than the earlier Effect/Foldkit audit. The app now has stronger schema boundaries, many more regression tests, a useful invariant test suite, CSS split by domain, and a local mobile test script. Foldkit is being used well as the core model/message/update/view architecture, and Effect is being used pragmatically for command effects, streams, schema decoding, and browser callback wrappers.

The biggest remaining risks are not broad type problems. They are concentrated in a few places:

- settings persistence is still coordinated by a string tag list, and one persisted Bubbles setting currently appears to be missed
- MusicBox still mixes pure model updates with module-level runtime state, DOM querying, Web Audio, keyboard listeners, and wake monitoring
- browser-sensitive behavior, especially audio, needs characterization tests and diagnostics before refactors
- non-`src` tooling scripts are outside the normal lint/typecheck path

Overall rating: **8/10**

- Foldkit architecture: **8.5/10**
- Effect usage: **8/10**
- Type/schema discipline: **8/10**
- Test coverage and regression posture: **8.5/10**
- Browser/audio safety: **6.5/10**
- Maintainability under future feature growth: **7.5/10**

## What Is Working Well

### Foldkit Architecture

The app has a clear root `Model`, root `Message`, delegated game updates, and exhaustive message handling. The game modules own their own models/messages/updates/views, while `src/main.ts` handles routing, global settings, persistence, and shared settings UI.

Good patterns to preserve:

- schema-backed messages through `m(...)`
- `Match.tagsExhaustive` for root and game updates
- update functions returning `[model, commands]`
- tests using `foldkit/test` `Story` and `Scene`

### Effect Usage

Effect is doing useful work where it fits the app:

- settings decode through Effect Schema
- browser command effects are represented as Foldkit commands
- speech uses `Effect.callback` with interruption cleanup
- streams use `Effect.acquireRelease` for DOM listener lifecycle
- invariant tests decode models/messages through schemas

This is the right scale of Effect for FoldKid. The app does not need to become a full Effect service graph just to be "more Effect-y."

### Regression Tests

The test suite is now broad and well aligned with the architecture:

- `src/invariants.test.ts` protects emoji packs, MusicBox song/instrument alignment, i18n dictionary compatibility, and schema decode boundaries.
- `src/styles.test.ts` protects CSS imports, orphan selectors, critical UI selectors, keyframes, per-file CSS budgets, and app-wide CSS budgets.
- game tests cover update behavior and view/mount behavior with `Story` and `Scene`.
- audio and speech have pragmatic mocks.

The invariant tests are especially valuable because the app has a lot of parallel arrays and localized data.

### CSS Organization

Splitting `src/styles.css` into domain files is a good move. The root file is now an import manifest, and the budget test gives each domain a separate ceiling instead of one blunt global line limit.

Current split:

- base
- landing
- counter
- findit
- bubbles
- settings
- musicbox
- audiotest

This should prevent the stylesheet from turning back into a 1700-line catch-all.

## High-Confidence Findings

### 1. Bubbles Selected Color Is Persisted But Color Changes Do Not Trigger Persistence

Severity: **Medium**

`bubblesSelectedColor` exists in the persisted schema and export data:

- `src/main.ts:48`
- `src/main.ts:110`

Bubbles color changes update `selectedColor`:

- `src/games/bubbles.ts:291`
- `src/games/bubbles.ts:300`
- `src/games/bubbles.ts:313`

But the persistence trigger list only includes:

- `BubblesSetPopLabel`
- `BubblesSetSayColor`

See `SETTINGS_TAGS` at `src/main.ts:595`.

Impact: choosing a bubble color or rainbow mode likely will not persist unless another persisted setting changes afterward.

Recommended fix:

- add `BubblesClickedColor` and `BubblesSetRainbowMode` to the persistence path
- add a regression test in `src/main.test.ts` that asserts both messages emit `PersistSettings`
- add an effect-running test that confirms `bubblesSelectedColor` is written to `localStorage`

### 2. Settings Persistence Is Still Stringly Typed

Severity: **Medium**

`SETTINGS_TAGS` is a manually maintained `Set<string>`:

- `src/main.ts:595`

This is easy to drift from the actual message union. The Bubbles color issue above is exactly the kind of bug this approach invites.

Recommended fix:

- replace the raw string set with a typed classifier function:
  `const shouldPersistSettings = (message: Message): boolean => ...`
- implement it with exhaustive-ish branches grouped by message domain
- add a table test that covers every settings-affecting message

Do not over-engineer this. A boring classifier plus tests is enough.

### 3. MusicBox Still Has Too Much Module-Level Runtime State

Severity: **Medium-High**

MusicBox keeps important runtime state outside the model:

- active notes and selected instrument refs at `src/games/musicbox.ts:151`
- keyboard listener refs at `src/games/musicbox.ts:157`
- playback flags and tempo/transpose refs at `src/games/musicbox.ts:775`
- compressor and wake monitor state at `src/games/musicbox.ts:772`

Some of this is appropriate for Web Audio handles, but the amount of state makes behavior harder to reason about and harder to test. `MusicBox.init()` also binds document listeners and starts wake monitoring:

- `src/games/musicbox.ts:1097`

That makes `init()` impure in practice.

Recommended direction:

- keep Web Audio handles out of the model, but put them behind a small audio runtime module
- move keyboard and wake monitor binding toward `OnMount` streams or explicit commands with acquire/release
- keep `init()` as close to pure model construction as possible
- continue using `resetKeyboardControls()` and `resetWakeMonitor()` in tests until the lifecycle moves

Important: do this slowly. MusicBox audio has already taught us that plausible refactors can break Safari.

### 4. MusicBox Update Still Performs Direct DOM And Audio Effects

Severity: **Medium**

Several MusicBox update branches directly call functions that touch Web Audio or the DOM:

- play and note handlers around `src/games/musicbox.ts:1124`
- stop/song change cleanup around `src/games/musicbox.ts:1138`
- key and lyric highlighting around `src/games/musicbox.ts:299`
- playback command effect around `src/games/musicbox.ts:907`

This weakens the nice Foldkit property where update is mostly a pure transition plus declared commands.

Recommended direction:

- start by moving non-audio DOM cleanup/highlight effects behind named commands
- add command-level tests that assert the command is produced
- leave oscillator construction and unlock behavior alone unless a focused Safari/mobile test is ready

### 5. Browser Audio Needs A Permanent "Change Carefully" Policy

Severity: **High for regressions, Low for immediate code change**

Current `src/audio.ts` is intentionally small and working. MusicBox has a compressor again and a wake monitor:

- compressor setup at `src/games/musicbox.ts:781`
- wake monitor at `src/games/musicbox.ts:804`

Do not treat the audio code as ordinary cleanup territory. Web Audio behavior depends on trusted gesture timing, Safari policy, mute switch behavior, sleep/wake state, and `AudioContext` lifecycle.

Recommended policy:

- one audio behavior change per patch
- test on real Safari/mobile before committing
- prefer diagnostics before refactors
- never combine audio changes with type/CSS/settings cleanup

## Medium-Priority Improvements

### Tighten Domain Schemas

Several fields are schema-backed but still broad:

- `counterDisplayMode` is `S.String` in persistence even though the app knows valid modes
- `bubblesSelectedColor` is `S.String`
- `settingsOverlay` is `S.String`
- MusicBox selected song/instrument/index fields are numeric but mostly unbounded

Recommended next steps:

- introduce literal schemas for display mode and settings overlay
- use a color schema or explicit sentinel values for Bubbles selected color
- add bounded decode/sanitize helpers for MusicBox indexes
- continue using runtime sanitizers where persisted user data can be malformed

### Expand Persistence Regression Tests

The suite already tests many persistence paths, but it should also prove that every field in `buildSettingsData` has at least one corresponding mutation test.

Recommended tests:

- `BubblesClickedColor` persists `bubblesSelectedColor`
- `BubblesSetRainbowMode` persists rainbow selection
- import/export round trips all current settings fields
- malformed MusicBox song order and hidden-song arrays sanitize to valid lengths

### Add Mobile/Touch Characterization Tests Where Possible

The counter mobile double-increment bug was the right kind of regression to capture. Continue that pattern for:

- Bubbles color hold duration
- drag-off behavior in Counter and Bubbles
- settings panel drag-close threshold
- MusicBox keyboard shortcuts ignoring inputs/selects/textareas

Unit tests cannot fully simulate Safari audio policy, but they can protect the event routing around it.

### Bring Scripts Into The Checked Surface

`scripts/mobile-dev.mjs` is useful, but it is outside the current lint/typecheck config:

- ESLint only checks `src/**/*.ts` at `eslint.config.mjs:7`
- TypeScript includes only `src/**/*.ts` and `vite.config.ts` at `tsconfig.json:17`

Recommended options:

- add a `check:scripts` script with `node --check scripts/*.mjs`
- or extend linting to include scripts with a JS config block
- include `node --check scripts/mobile-dev.mjs` in `npm run build` or a broader `npm run check`

### Rename `_pitch_check.test.ts`

`src/games/_pitch_check.test.ts` is a real Vitest test despite the underscore name. The underscore makes it look temporary or excluded.

Recommended fix:

- rename it to `musicbox-pitch.test.ts`
- optionally fold it into `src/invariants.test.ts`

## Lower-Priority Improvements

### Split Large TypeScript Files Carefully

Current largest files:

- `src/games/musicbox.ts`: 1566 lines
- `src/main.ts`: 1017 lines
- `src/i18n.ts`: 824 lines

Splitting can help, but only if it follows ownership:

- MusicBox data: songs, instruments, keyboard layout, audio runtime, view
- Main settings: persistence schemas, settings view, root update
- i18n: language dictionaries can move per language only if key compatibility tests remain

Avoid splitting while changing behavior.

### Consider A Small Browser Diagnostic Surface

The audio test page is useful but intentionally manual. A small read-only diagnostic panel could show:

- current audio session type when available
- shared `AudioContext` state
- wake monitor status
- last audio unlock attempt

This would make future Safari regressions less mysterious.

### Add Visual/E2E Smoke Later

The CSS invariant tests are good static protection, but they cannot prove mobile layout. When the app stabilizes, add a very small Playwright smoke suite for:

- landing page
- settings panel on narrow viewport
- MusicBox piano visible and non-overlapping
- Counter mobile button tap

This is lower priority than fixing persistence and containing MusicBox state.

## Recommended Next Work

1. Fix Bubbles color/rainbow persistence and add regression tests.
2. Replace `SETTINGS_TAGS` with a typed persistence classifier plus tests.
3. Add `check:scripts` for `scripts/mobile-dev.mjs`.
4. Rename `_pitch_check.test.ts`.
5. Add two or three more invariant tests around persisted settings round trips.
6. Start a careful MusicBox extraction by moving song/instrument data out first, with no behavior changes.
7. Only after that, consider lifecycle work for keyboard/wake monitor streams.

## Caution

Do not start with `src/audio.ts` or oscillator internals. They are working now, and the previous breakage showed that audio correctness in Safari is not something TypeScript can prove. Treat audio as a browser behavior boundary, not a normal refactor target.
