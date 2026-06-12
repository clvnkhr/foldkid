# FoldKid Codebase Audit

Generated: June 12, 2026

---

## Table of Contents

1. [Overall Architecture](#1-overall-architecture)
2. [Entry Point & Runtime Setup](#2-entry-point--runtime-setup)
3. [Routing](#3-routing)
4. [Messages (Action System)](#4-messages)
5. [Main Model / Update / View](#5-main-model--update--view)
6. [Subscriptions](#6-subscriptions)
7. [i18n](#7-i18n)
8. [Audio System](#8-audio-system)
9. [Speech Synthesis](#9-speech-synthesis)
10. [Game: Greeting](#10-game-greeting)
11. [Game: Counter](#11-game-counter)
12. [Game: Find It](#12-game-find-it)
13. [Game: Bubbles](#13-game-bubbles)
14. [Game: Music Box](#14-game-music-box)
15. [Pages: Landing](#15-pages-landing)
16. [Pages: AudioTest](#16-pages-audiotest)
17. [CSS/Styling](#17-cssstyling)
18. [Tests](#18-tests)
19. [Project-Level Summary](#19-project-level-summary)

---

## 1. Overall Architecture

### Design Choices

- **Single-page Elm Architecture via Foldkit**: The entire app is a single `Model` -> `Message` -> `update` -> `view` loop. No URL-based routing; page dispatch is an in-app tagged union (`Page`). This is appropriate for a kids' games app where URL semantics and back-button navigation are irrelevant.
- **Effect-TS as the functional effect system**: All side effects (audio, speech, localStorage, recording) are wrapped as `Command.Command<Message>` objects containing an `Effect`. The runtime executes these and feeds results back as messages.
- **Effect-TS Schema for models & messages**: Both `Model` and `Message` are defined as `Schema` types, giving runtime validation alongside static types. This is a strong pattern — it ensures message payloads are type-safe at the boundary.
- **Foldkit's `h.OnMount()` for imperative DOM escapes**: Rather than fighting the virtual DOM, imperative browser APIs (audio contexts, animation frames, media recording) escape via mount hooks that return Effect streams. Pragmatic, but creates untestable code paths.
- **Monorepo layout**: The app (`src/`) lives alongside the `foldkit` framework source and the `effect` ecosystem source in `packages/`. The app imports `foldkit` and `effect` as npm dependencies.

### Effect-TS & Foldkit Patterns (Reusable)

| Pattern | Location | Description |
|---|---|---|
| `Schema.Struct` for sub-models | Each game's `Model` | Runtime validation + static type in one declaration |
| `m()` message constructors | `message.ts`, each game | Creates tagged-union message creators with payload schemas |
| `M.tagsExhaustive()` in update | Each game's `update` | Exhaustive pattern match on message tags — if a new message is added without a handler, it's a compile error |
| `Command.Command<Msg>` for effects | `audio.ts`, `speech.ts`, etc. | Named commands with an `Effect` inside; runtime dispatches and feeds result back |
| `h.OnMount()` for imperative code | Counter balls, bubbles, piano | Mount hooks that return `Stream.Stream<Message>` — bridges imperative DOM to the Elm loop |
| `Subscription.make` | `subscriptions.ts` | Derives a stream from model dependencies, enabling reactive document-level listeners |
| `Effect.acquireRelease` for resources | Counter balls, bubbles animation | Proper resource cleanup lifecycle tied to vnode mount/unmount |
| Generic helper factories | `click<Msg>`, `pop<Msg>`, `speak<Msg>` | Command factories parameterized on the message type for composability |

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Duplicate audio context management** — `audio.ts` has `sharedCtx`, `musicbox.ts` has its own `sharedCtx`. Multiple contexts can coexist, wasting resources and potentially causing audio routing conflicts. | `src/audio.ts:3`, `src/games/musicbox.ts:753` | **Medium** | **2/5** | Straightforward refactor: export `getContext` from `audio.ts` and use it in `musicbox.ts`. No architectural changes needed. |
| **No error boundaries** — If any command or mount hook throws, there is no error recovery. The app could enter a broken state. | Entire app | **Medium** | **3/5** | Requires a top-level Effect error handler wrapping the runtime, plus per-game `Effect.catchAll` for critical paths. Moderate effort to add systematically. |

### Rating: 7.5/10

---

## 2. Entry Point & Runtime Setup

### Design Choices

- `src/entry.ts` is minimal — calls `Runtime.makeProgram` then `Runtime.run`. Clean separation of bootstrapping from application logic.
- `devTools: { Message }` enables Foldkit's dev tools (time-travel debugging, message inspection).
- The `container` is a `<div id="root">` from `index.html`.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| No error handling around `document.getElementById('root')` — if the element is missing, the app crashes silently. | `src/entry.ts:12` | **Low** | **1/5** | Add a null check with a helpful console error. One-line fix. |

### Rating: 8.5/10

---

## 3. Routing

### Design Choices

- Tagged union `Page` defined via `ts()` from `foldkit/schema`. Pages: `Landing`, `Greeting`, `Counter`, `FindIt`, `Bubbles`, `MusicBox`, `AudioTest`.
- No URL-based routing — `model.page` is set directly by messages. Simple and correct for this use case.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| _(Not applicable — AudioTest is dev-only and intentionally has no i18n.)_ | | | | |

### Rating: 9/10

---

## 4. Messages

### Design Choices

- `m()` from `foldkit/message` creates tagged-union constructors. Messages with payloads declare their schema inline (e.g., `m('SetLanguage', { value: S.String })`).
- All game messages are re-exported through `main.ts`'s `Message` union, ensuring exhaustive matching.
- Every game defines a `SoundPlayed` message to close the audio effect loop.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| `SettingsExported` is defined in `message.ts` (line 24) but never used anywhere. Dead code. | `src/message.ts:24` | **Low** | **1/5** | Delete the unused constructor. No downstream impact. |

### Rating: 8/10

---

## 5. Main Model / Update / View

### Design Choices

- **Single monolithic Model struct** with sub-objects for each game (`model.greeting`, `model.counter`, etc.). Settings panel state (drag, width, overlays) lives at the top level.
- **Persistence layer**: Settings auto-save to `localStorage` via a 200ms debounced timer. A `SETTINGS_TAGS` set identifies which messages should trigger persistence.
- **Delegation pattern**: `updateGreeting`, `updateCounter`, etc. extract sub-model, call the game's `update`, and merge results back. Clean separation.
- **Import/Export**: Full settings serialization with version checking.
- **View** uses `Match.tagsExhaustive` on `Page` to render the correct page view.

### Effect-TS Patterns

- `Stream.fromEventListener` for the dark mode `matchMedia` change listener.
- `persistSettings` returns a `Command.Command<Message>` with debounced `localStorage` write inside an `Effect.sync`.
- `copyExportCmd` uses `Effect.sync` wrapping `navigator.clipboard.writeText`.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Debounce via module-level setTimeout** — `persistTimer` is a module-level variable. If the model is updated rapidly, only the last write goes through, but the timer is never managed by Effect's runtime. If the app crashes before the timer fires, settings are lost. | `src/main.ts:105-116` | **Medium** | **3/5** | Replace with Effect `Schedule` + `Queue` or use Foldkit's built-in debounce. Requires understanding how to integrate Effect scheduling with the command lifecycle. |
| **`SETTINGS_TAGS` stringly-typed** — Uses magic strings that must match message `_tag` values. Adding a new settings-affecting message requires remembering to add it here; no compile-time check. | `src/main.ts:573-580` | **Low** | **3/5** | Could use a type-level utility or a helper function that tags messages at definition time. Requires TypeScript type gymnastics. |
| **Duplicate import/export logic** — `ImportedSettings` and `ApplyImport` both parse JSON, validate version, check for `s.language`, and apply. This is ~95% duplicated code. | `src/main.ts:534-567` | **Medium** | **2/5** | Extract a shared `parseAndApplyImport(data)` function. Both handlers call it. Straightforward. |
| **Settings import `ImportedSettings`** doesn't persist to localStorage immediately (the `ApplyImport` handler does), but `ImportedSettings` handler at line 545 does persist. The dual import paths are inconsistent. | `src/main.ts:545` compared to `src/main.ts:562` | **Medium** | **2/5** | Consolidate into one import path. The overlay-based import (`ApplyImport`) already works; the `ImportedSettings` path may be dead code. |
| **`_update` and `update` split** — `_update` is the real handler; `update` wraps it to inject persistence. The underscore naming is a workaround for the `noUnusedLocals` lint rule. Better: inline the persistence check. | `src/main.ts:400-591` | **Low** | **1/5** | Merge the two functions or suppress the lint rule for this one function. Trivial. |
| **`SettingsDragMoved` dispatches on every `pointermove`** — can cause excessive re-renders during drag. | `src/main.ts:503-507` | **Low** | **2/5** | Throttle updates in the update function or batch width changes. Easy mitigation. |
| **Dark mode `matchMedia` listener** in the view function creates a new stream on every render — but it's inside `h.OnMount`, which only runs once. Correct, but misleading placement. | `src/main.ts:620-627` | **Low** | **1/5** | Move to `subscriptions.ts` for clarity. No functional change. |
| **`preventDoubleTapZoom`** adds a `touchend` listener on every mount of the app root — but is inside `h.OnMount`, so it's once. The event listener is never cleaned up (no abort controller / removal). | `src/main.ts:629-637` | **Low** | **1/5** | Store the listener reference and remove it in a cleanup callback. Minor change. |
| **`init()` reads `saved.findItVoiceMode` twice** (lines 261 and 289) — minor redundancy. | `src/main.ts:261, 261-264, 289` | **Low** | **1/5** | Use the variable already extracted. One-line fix. |
| **`applyImportData`** doesn't validate `landingOrder` length (unlike `init()` which checks for length === 5). | `src/main.ts:361-398` | **Low** | **1/5** | Add the same length check. Trivial. |

### Rating: 7/10

---

## 6. Subscriptions

### Design Choices

- Single subscription: settings panel drag resizing. Uses `Subscription.make` with `modelToDependencies` watching `isDraggingSettings`.
- Only subscribes to `pointermove`/`pointerup` on `document` when dragging is active, via `Stream.when`.

### Effect-TS Patterns

- `Stream.when(stream, Effect.sync(() => isDraggingSettings))` — elegant conditional subscription.
- `Subscription.make` with dependency-based activation.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| The `isDraggingSettings` check happens once at subscription creation time via `Effect.sync`, not reactively. If the model changes mid-stream, the subscription won't deactivate until the next model-to-dependencies comparison cycle. | `src/subscriptions.ts:12` | **Low** | **2/5** | Restructure to use `Stream.changes` on the dependency or re-evaluate `isDraggingSettings` on each event via `Effect.sync` inside the stream. Minor architectural tweak. |

### Rating: 8.5/10

---

## 7. i18n

### Design Choices

- 8 languages: en, zh, fr, de, fa, ms, zh-HK, ja.
- Translations are a single large `const` object with string and function values (e.g., `greeted: (n) => ...`).
- `t()` resolves string keys; `tf()` resolves function keys with parameters.
- `TranslationKey` type derived from the object structure — type-safe key access.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **1024-line file** — The translations object is monolithic. Adding a language requires scrolling through all existing ones. Should be split by locale. | `src/i18n.ts` | **Medium** | **2/5** | Split into `i18n/en.ts`, `i18n/zh.ts`, etc., then re-export from `i18n/index.ts`. Mechanical but touches many imports. |
| **Type safety gap** — `t()` returns `as string` via cast; if a key is a function, it silently returns the function object coerced to string. No compile-time check. | `src/i18n.ts:1009` | **Medium** | **3/5** | Use a conditional type to separate string-valued and function-valued keys into two lookup functions. Requires TypeScript type-level programming. |
| **`tf()` uses `as never`** for the function call and parameters — completely bypasses type checking in practice. | `src/i18n.ts:1022-1023` | **Medium** | **2/5** | Better constraint on `K` and proper parameter inference from the translation object type. Doable with mapped types. |
| **Missing keys not caught at compile time** — `t()` falls back to English at runtime. A new key added to English won't produce a type error for other languages. | `src/i18n.ts:1008` | **Low** | **4/5** | Structural typing of the translations object. A compile-time check would require a type that enforces all languages have the same keys. Possible with a generic helper type but complex. |
| **`musicBoxBell`** translation key maps to "Piano" in English — misleading name. | `src/i18n.ts:99` | **Low** | **1/5** | Rename the key. Requires updating all 8 language files. Mechanical. |

### Rating: 7.5/10

---

## 8. Audio System

### Design Choices

- Shared singleton `AudioContext` with lazy init + automatic resume.
- Five sound helpers (`click`, `pop`, `chime`, `boing`, `swoosh`) — each returns a `Command.Command<Msg>` generic over the result message.
- All sounds are simple oscillator tones (no samples).

### Effect-TS Patterns

- `playTone` is `Effect<void>` created with `Effect.sync`.
- Command helpers are generic `<Msg>` factories: `click<Msg>(msg) => ({ name, effect })`.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **`AudioContext` singleton is not exported** — `musicbox.ts` maintains its own parallel `sharedCtx` and `getCtx()`. Two AudioContexts can coexist, wasting memory and potentially causing audio routing issues. | Compare `src/audio.ts:3-12` with `src/games/musicbox.ts:753-780` | **Medium** | **2/5** | Export `getContext` from `audio.ts` and use it in `musicbox.ts`. Remove `musicbox.ts`'s local version. Straightforward. |
| **`exponentialRampToValueAtTime(0.001, ...)`** — the parameter should be 0.0001 or less; 0.001 can cause a click/pop on some browsers. | `src/audio.ts:27` | **Low** | **1/5** | Change `0.001` to `0.0001`. One character change. |
| **`onended` cleanup** in `playTone` may not fire if the oscillator was already stopped. | `src/audio.ts:32-35` | **Low** | **2/5** | Add a `setTimeout` fallback for cleanup, or use `osc.stop()` directly and clean up synchronously after. Standard audio pattern. |

### Rating: 7/10

---

## 9. Speech Synthesis

### Design Choices

- `findVoice()` searches for a voice matching the language code, falling back to the two-letter prefix.
- `speak()` wraps `SpeechSynthesisUtterance` in a `Command.Command<Msg>`.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Race condition: `cancel()` then `speak()`** — `speechSynthesis.cancel()` is asynchronous; calling `speak()` immediately after can cause the new utterance to be silently dropped in Chrome. This is documented in the greeting test (H3) but never fixed. | `src/speech.ts:16-17` | **Medium** | **3/5** | Add a small delay (`requestAnimationFrame` or `setTimeout(0)`) between `cancel()` and `speak()`, or omit `cancel()` and track utterance references. Well-known Chrome bug, many workarounds documented. |
| **`cancel()` is aggressive** — Cancels ALL speech, including utterances from other parts of the app. If two games try to speak simultaneously, one will be silenced. | `src/speech.ts:16` | **Low** | **3/5** | Track utterance IDs and only cancel the current game's utterances. Requires a shared utterance registry. |
| **Voice availability is not checked** — `speak()` proceeds even if no voice is found or speech synthesis is unavailable. | `src/speech.ts:21-22` | **Low** | **1/5** | Add a `voices.length === 0` guard and return early. One-liner. |

### Rating: 6.5/10

---

## 10. Game: Greeting

### Design Choices

- Records audio via `MediaRecorder` API, trims silence, encodes to WAV, stores as data URL.
- 10 voice effects applied via Web Audio API (BiquadFilter, Delay, LFO, playbackRate).
- Recording state managed via module-level globals (`activeMediaRecorder`, `activeMediaStream`).
- `recordingId` key forces re-mount for auto-play after recording.
- `HideHello` command with 1500ms timeout removes floating "Hello!" text.

### Effect-TS Patterns

- `Effect.callback<Message>` for the `record()` command — bridges callback-based `MediaRecorder` to Effect.
- `Effect.sync` for `playGreeting()` — deliberately fire-and-forget (no cleanup needed as it's a synchronous start).

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Module-level globals** — `activeMediaRecorder` and `activeMediaStream` are module-level mutable variables. If the user navigates away mid-recording and back, stale state persists. | `src/games/greeting.ts:11-12` | **High** | **4/5** | Refactor recording to use Effect-managed resources with `Effect.acquireRelease`. The `record()` command already uses `Effect.callback`; extend it to manage the recorder lifetime. Non-trivial because `MediaRecorder` is event-driven. |
| **`playGreeting` is pure side-effect in `Effect.sync`** — no cleanup, no cancellation support. If the user navigates away while the greeting is playing, audio continues. | `src/games/greeting.ts:268-308` | **Medium** | **3/5** | Convert to `Effect.callback` or `Effect.async` with a cleanup that stops audio and closes the context. Requires wrapping the `AudioBufferSourceNode.onended` callback. |
| **`playGreeting` creates AudioContext per play** — creates a new `AudioContext` for every play and never closes it if fetch/decode fails before playback starts. Memory leak. | `src/games/greeting.ts:271, 294` | **Medium** | **2/5** | Use the shared `audio.ts` context instead of creating one per play, and ensure `ctx.close()` is called in error paths. Straightforward. |
| **`ClickedStopRecording` returns model unchanged** — the update handler returns the model as-is and dispatches the Stop command, but doesn't set `status: 'idle'` until `RecordedAudio` or `RecordingFailed` fires. If recording hardware fails silently, the UI stays in recording state. | `src/games/greeting.ts:362-365` | **Medium** | **2/5** | Set `status: 'idle'` immediately on Stop, with the understanding that recording continues in the background. Simple model update. |
| **`stopRecordingCmd` returns `SoundPlayed()`** as the Effect result, but this is semantically wrong — the Stop action didn't play any sound. | `src/games/greeting.ts:326-338` | **Low** | **1/5** | Create a dedicated `StoppedRecording` message. Trivial. |
| **AnalyserNode created but never used** — `analyser` is created but its data is never read (`analyser.getByteTimeDomainData` never called). | `src/games/greeting.ts:115-116` | **Low** | **1/5** | Remove the `AnalyserNode` creation. Dead code. |
| **`recordingId` fallback spreads** — `recordingId: (model.recordingId ?? 0) + 1` on line 367, 382. The `?? 0` suggests the field might be undefined, but the schema says `S.Number`. Either the schema is wrong or the fallback is dead code. | `src/games/greeting.ts:367, 382` | **Low** | **1/5** | Remove the `?? 0` fallbacks or add a default to the schema. One-liner. |
| **`SetVoiceEffect` duplicates `ClickedPlay` logic** — the entire auto-play block (lines 388-393) is duplicated from `ClickedPlay` (lines 374-379). | `src/games/greeting.ts:374-379 vs 388-393` | **Medium** | **2/5** | Extract the play logic into a shared helper. Both handlers call the helper. Straightforward. |
| **`effect` field in hello objects** is typed as `string` (from model), but the `EFFECTS.find` lookup treats it as `EffectType`. No runtime guarantee. | `src/games/greeting.ts:481` | **Low** | **1/5** | Use `as EffectType` cast or refine the model to use the union type directly. One-liner. |

### Rating: 6/10

---

## 11. Game: Counter

### Design Choices

- Three display modes: number, word (via `n2words`), both.
- Physics simulation: balls spawn, fall with gravity, bounce, collide, settle.
- Long-press detection: font size grows with hold duration.
- Speech synthesis for each count.

### Effect-TS Patterns

- `Effect.acquireRelease` for the ball animation loop — cleanly tears down `ResizeObserver`, `MutationObserver`, `requestAnimationFrame` on unmount.
- `Stream.callback<never>` for the animation loop — bridges rAF to Effect streams.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Module-level global mutable state** — `pointerDownTime` and `pressedButton` are module-level variables. If the component unmounts while a pointer is held, these leak across re-mounts. | `src/games/counter.ts:145-146` | **Medium** | **3/5** | Store timing state per-button-instance via `data-*` attributes or a WeakMap keyed on the DOM element. Moderate refactor of the pointer event handlers. |
| **`activeParticles` global set** — module-level mutable set that's never cleaned up except by `counterBalls` `acquireRelease`. If `poof()` is called outside the animation loop, particles leak. | `src/games/counter.ts:166` | **Low** | **2/5** | Tie the particle lifecycle to the animation state's `acquireRelease`. Particles spawned during the animation loop are already cleaned up; adding a guard for external calls is simple. |
| **`requestAnimationFrame` after `state.running = false`** — the `loop` function checks `state.running` before the next `rAF`, but if the last frame was already queued, it will still run. | `src/games/counter.ts:466-470` | **Low** | **1/5** | Check `state.running` at the start of `tick()` as well. One-liner. |
| **Collision resolution can produce NaN** — Line 333 checks `isFinite(dist)` after sqrt, but velocity impulses on line 346-355 can still produce NaN/Infinity if masses are extreme. | `src/games/counter.ts:333-355` | **Low** | **2/5** | Add `isFinite` guards on velocity components after impulse calculation. Standard physics safety measure. |
| **Ball physics ignores device pixel ratio** — uses CSS pixels for physics, which means the simulation behaves differently on Retina vs non-Retina displays. | `src/games/counter.ts:232-381` | **Low** | **2/5** | Multiply initial positions and velocities by `window.devicePixelRatio`. Minor change. |

### Rating: 7/10

---

## 12. Game: Find It

### Design Choices

- 64 emoji pool with names in 7 languages.
- Three modes: "Find" (find target emoji), "Any" (click any), "Pairs" (match two-emoji combos).
- Hint after 3 wrong guesses.
- Drag-to-reorder collection box and grid cells.
- Voice mode: asks "Where is [emoji]?" via speech synthesis.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Emoji names as parallel arrays** — `EMOJI_NAMES_BY_LANG` is a set of 7 arrays with 64 entries each, manually maintained. Adding an emoji requires updating all 7 arrays in lockstep. Extremely error-prone. | `src/games/findit.ts:30-38` | **High** | **4/5** | Convert to a structured data format (e.g., a single array of `{ emoji, names: { en, zh, fr, ... } }` objects). Requires restructuring the data and updating all translation lookups. Significant effort. |
| **`Intl.Segmenter` used without option validation** — `new Intl.Segmenter()` with no locale may throw on old Safari. The method is used to split multi-codepoint emoji but grapheme clusters vary by locale. | `src/games/findit.ts:41` | **Medium** | **2/5** | Add a locale argument and wrap in try-catch. Simple fix. |
| **Keyboard a11y** — Grid cells use `h.OnClick` but no `h.OnKeyDown` or `role` attributes. Keyboard-only users can't play. | `src/games/findit.ts:257` | **Medium** | **3/5** | Add `tabindex="0"`, `role="button"`, and `onKeyDown` handlers for Enter/Space. Moderate effort across all games. |
| **`generateGame` signature** takes 4 optional booleans — uses positional optional params, which is fragile. Callers must pass `undefined` for earlier params to set later ones. | `src/games/findit.ts:113` | **Low** | **1/5** | Convert to a single options object parameter. Mechanical refactor. |
| **`shaking` and `shakeTick` used for CSS animation key** — `h.Key(cell.id.toString() + ...)` forces re-render of the cell on shake, which is necessary to restart the CSS animation. Clever but fragile. | `src/games/findit.ts:258` | **Low** | **2/5** | Could use CSS animation re-trigger via class removal/re-addition with `void el.offsetHeight` trick instead of keyed re-render. Moderate. |

### Rating: 7/10

---

## 13. Game: Bubbles

### Design Choices

- 9 color choices + rainbow gradient.
- Bubble size depends on press duration.
- Physics: bubbles float upward with wrap-around.
- Rich particle effects on pop: center flash, primary burst, secondary splash, sparkles, score popup.
- Optional pop label or spoken color name.
- Milestone celebration at 10, 25, 50+ pops.

### Effect-TS Patterns

- `Stream.callback` for the color selector — queues `ClickedColor` messages from DOM pointer events.
- `Effect.acquireRelease` for the animation loop — tears down observer and event listeners on unmount.
- `MutationObserver` inside `h.OnMount` to detect DOM addition/removal of bubble elements.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Module-level global `isPointerDown`** — Set to `true`/`false` by document-level `pointerdown`/`pointerup` listeners. Used to decide whether `pointermove` should pop bubbles. This is a race condition: if the user starts a drag on the color selector and moves, `isPointerDown` is true and a pop fires. | `src/games/bubbles.ts:31, 443-447, 502` | **Medium** | **3/5** | Move `isPointerDown` into the animation component's scope (it's already inside `h.OnMount`), or use the pointer's `buttons` property to check if the primary button is held. Moderate refactor. |
| **DOM particle creation in `poof()`** — Creates DOM elements on `document.body` with no boundary for cleanup. If many bubbles are popped rapidly, hundreds of DOM elements pile up. The animations do have `onfinish = () => el.remove()` but the `setTimeout` in the Secondary splash doesn't always trigger onfinish if the element is GC'd. | `src/games/bubbles.ts:49-178` | **Medium** | **3/5** | Cap simultaneous particles (e.g., max 50), use a pool, and ensure cleanup on page navigation. Moderate effort. |
| **`poof()` function name conflicts with `counter.ts`'s `poof()`** — Both are module-level functions with the same name. If both modules are imported, one shadows the other. They're in different modules so this is technically fine, but confusing. | `src/games/bubbles.ts:49` vs `src/games/counter.ts:168` | **Low** | **1/5** | Rename one to `bubblePoof` or `particleBurst`. Cosmetic. |
| **Bubble physics uses `window.innerWidth/Height`** — If the viewport size changes, bubble positions don't adjust proportionally. A bubble wrapping off the right edge when the window is wide may appear in the middle when narrow. | `src/games/bubbles.ts:200-201, 221-222` | **Low** | **2/5** | Add a `ResizeObserver` inside the animation mount to update width/height dynamically. Straightforward. |
| **Color selector DOM event listeners** — Uses native `addEventListener` for pointer events with `e.preventDefault()`. The `el.setPointerCapture` call may conflict with Foldkit's own pointer handling. | `src/games/bubbles.ts:344-366` | **Low** | **3/5** | Use Foldkit's `h.OnPointerDown`/`h.OnPointerUp` instead of raw DOM events to stay within the framework's event system. Moderate. |
| **`BubblesClickedPop` dispatched on `pointermove`** when `isPointerDown` is true — This means dragging across a bubble pops it. Combined with the `isPointerDown` global, this is unreliable: if a pointer is down on the color selector, then moves over a bubble, the bubble pops. | `src/games/bubbles.ts:502` | **Medium** | **3/5** | Track which element the pointer started on and only pop if the pointer started on a bubble, not on the color selector. Requires per-pointerId tracking of initial target. |
| **Milestone detection at `score % 25 === 0 || score === 10`** — This means 10, 25, 50, 75, etc. But the condition is checked in the view function, so if the user scrolls past 10-24 without viewing the page, they miss the 10 milestone. | `src/games/bubbles.ts:422` | **Low** | **2/5** | Track the last milestone shown in the model and trigger celebration messages in the update function instead of the view. Straightforward. |
| **Pop label data is passed via `data-pop-label` attribute** — The `poof()` function reads `data-pop-label` from the container at removal time, which works but is fragile (depends on DOM attribute state). | `src/games/bubbles.ts:429, 463-465` | **Low** | **1/5** | Pass the pop label text directly in the animation's internal state instead of reading from the DOM. Simple refactor. |

### Rating: 6.5/10

---

## 14. Game: Music Box

### Design Choices

- 7 nursery rhymes with full note data and lyrics.
- 4 instruments with ADSR envelopes, harmonic series, and filter modeling.
- Two piano keyboards (top C4, bottom C3), each independently shiftable.
- QWERTY keyboard support for playing notes.
- Sleep/wake AudioContext recovery via `pageshow` listener + 5-second polling interval.
- iOS Safari mute switch workaround (audio session upgrade + silent WAV).
- SVG icons for play/pause/stop buttons.

### Effect-TS Patterns

- `Stream.mergeAll` for the piano pointer stream — merges `pointerdown`, `pointermove`, `pointerup`, `pointercancel` into a single stream of `NoteOn`/`NoteOff` messages.
- `Effect.gen` for `playSongCmd` — sequential note playback with `Effect.sleep` for timing.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Massive module-level mutable global state** — `activeNotes`, `selectedInstrumentIndex`, `keyboardBound`, `shortcutKeysBound`, `currentOctaveOffset`, `sharedCtx`, `masterCompressor`, `stopFlag`, `pauseFlag`, `playbackTempo`, `playbackTranspose`, `currentLyricLine`. This is state that should live in the Model or be encapsulated in effects. It completely defeats the Elm architecture. | `src/games/musicbox.ts:150-159, 753-759` | **Critical** | **5/5** | The most invasive fix in the audit. Each global needs a strategy: move to Model (instrument, octave, tempo, transpose), encapsulate in Effects (activeNotes, flags, AudioContext), or manage via mount hooks (keyboard listeners). Essentially a partial rewrite of the game. |
| **`selectedInstrumentIndex` and `currentOctaveOffset` are module-level globals** that are synced from the model but can get out of sync. If the model changes but `currentOctaveOffset` isn't updated (it's only set in `view()`, line 1216), the keyboard plays at the wrong octave. | `src/games/musicbox.ts:155, 158, 1216` | **High** | **4/5** | These should be read from the Model directly rather than synced to globals. Requires changing `startNote`, `stopNote`, `playSongCmd`, and QWERTY handlers to accept model-derived parameters. Significant refactor. |
| **`bindKeyboard()` and `bindShortcutKeys()` called from `init()`** — These add document-level event listeners. Since `init()` runs on every module import, and there's no cleanup mechanism, the listeners accumulate if the module is re-imported or the component re-mounted. | `src/games/musicbox.ts:1055-1056` | **High** | **4/5** | Move to a mount hook with proper cleanup (return a finalizer from the Effect). The `keyboardBound`/`shortcutKeysBound` guards prevent duplicates, but there's no unbind on unmount. Requires tracking listener references. |
| **`setInterval` for sleep/wake detection at module level** — A 5-second interval runs forever after import, even if MusicBox is never displayed. Wastes battery and CPU. | `src/games/musicbox.ts:800-804` | **Medium** | **3/5** | Start the interval only in a mount hook and clear it on unmount. A `pageshow` listener plus conditional interval is cleaner. Moderate. |
| **`playNoteAudio` and `startNote` share ~80% of their code** — Both create oscillators, set up gain envelopes, handle harmonics, filters, and tremolo. The duplication is massive and any change to the audio pipeline must be made in both places. | Compare `src/games/musicbox.ts:809-876` with `src/games/musicbox.ts:920-973` | **High** | **3/5** | Extract the oscillator/gain setup into a helper `createNoteNodes(ctx, freq, dur, inst)` that returns the node array. Both callers use it. Moderate refactor. |
| **`stopNote` uses `masterGain.gain.value`** at the time of stopping to set the release ramp starting level. But `gain.value` is the value at the last scheduled event, not the current audio-time value. The release starts from the wrong level. | `src/games/musicbox.ts:985` | **Medium** | **3/5** | Use `masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime)` to capture the current scheduled value at the correct audio time, then ramp to 0. Standard Web Audio pattern. |
| **`playSongCmd` uses `Effect.gen` with `Effect.sleep` for timing** — This is a blocking-style Effect. However, `Effect.sleep` is based on the Effect runtime clock, not the Web Audio `currentTime`. If the system clock jumps, the playback timing breaks. | `src/games/musicbox.ts:906` | **Medium** | **4/5** | Schedule all note events ahead of time using Web Audio `currentTime` instead of `Effect.sleep`. This is a fundamental redesign of the playback engine. Complex. |
| **Lyric line synchronization is approximate** — `beatsPerLine` is calculated by dividing total note duration by the number of non-empty lyric lines. For songs with repeated sections (all of them), this is an approximation that drifts. The synchronization becomes noticeably wrong by the end of long songs. | `src/games/musicbox.ts:889-892` | **Medium** | **3/5** | Map each note to a specific lyric line index in the song data, rather than deriving it algorithmically. Requires adding per-note lyric indices to the song definitions. Tedious but straightforward. |
| **`highlightLyricLine` uses CSS class manipulation** via `document.querySelectorAll` — directly manipulates DOM outside of Foldkit's virtual DOM. If the view re-renders, the highlighted state could be lost or conflict. | `src/games/musicbox.ts:310-332` | **Medium** | **3/5** | Add a `currentLyricLine` field to the Model and use it in the view to conditionally apply the active class. Requires the model to be updated on each note. Moderate. |
| **Same for `highlightKey` / `unhighlightKey`** — directly modifies DOM classes on piano keys, bypassing Foldkit's rendering. | `src/games/musicbox.ts:280-302` | **Medium** | **3/5** | Track active keys in the Model (or in mount-local state) and conditionally apply the glow class in the view. Moderate. |
| **`playSongCmd` doesn't check if model changed during playback** — If the user changes the song or instrument mid-play, the global `stopFlag` is set, but the Effect has no way to observe other model changes (like tempo changes). The globals `playbackTempo`, `playbackTranspose` are set once when play starts. | `src/games/musicbox.ts:1080-1081` | **Medium** | **4/5** | Stream model changes to the playing Effect via a `Queue` or `Ref`, allowing the playback loop to react to tempo/transpose changes in real-time. Complex. |
| **`togglePause` doesn't pause note audio** — Sets `pauseFlag = true` but doesn't stop active notes. Notes continue to ring while paused. | `src/games/musicbox.ts:1162-1171` | **Low** | **2/5** | Call `stopAllNotes()` when pausing. Simple addition. |
| **`SetSong` handler stops playback but doesn't reset `stopFlag`** — Sets `stopFlag = true` but leaves it as true after the new song is selected. The next play starts with `stopFlag` still true, so `playSongCmd` immediately exits. | `src/games/musicbox.ts:1098-1104` | **High** | **2/5** | Reset `stopFlag = false` after stopping. Two-line fix, but the root cause is the global flag pattern. |
| **`SongEnded` handler doesn't clean up `stopFlag`/`pauseFlag`** — These are at module level and leak between plays. | `src/games/musicbox.ts:1111-1114` | **Medium** | **1/5** | Reset both flags in the handler. Trivial. |
| **`transposePitch` function** doesn't handle notes with octave wraparound perfectly — if you transpose an `E#` (which is `F`) it breaks. Valid pitches don't use `E#`/`B#`, but transposition could produce them. | `src/games/musicbox.ts:76-87` | **Low** | **2/5** | Add normalization: after transposing, map `E#` -> `F`, `B#` -> `C`, and their flat equivalents. Standard music theory utility. |
| **Keyboard construction with leading black key** — `buildKeyboard` prepends a black key before the first white key (e.g., `C#3` before `D3`). This works visually but causes the first white key to be the second item in the array, which makes index-based lookups confusing. | `src/games/musicbox.ts:116-125` | **Low** | **1/5** | Document the behavior or adjust keyboard rendering to handle the leading black key explicitly. Cosmetic. |
| **Song note data is hard-coded with WAV-style timing** — Durations like 1.5, 0.5 create rhythmic patterns, but the tempo control multiplies a flat sleep interval (`350` ms per unit), which means note durations aren't truly proportional. | `src/games/musicbox.ts:906` | **Low** | **3/5** | Derive note timing from beats-per-minute (BPM) instead of a magic constant. Requires re-basing all song durations on a fractional beat system. Moderate. |
| **Happy Birthday has no lyrics array alignment** — Only 4 lyric lines for 26 notes. The lyric highlighting will be imprecise. | `src/games/musicbox.ts:649-672` | **Low** | **2/5** | Expand lyrics to one line per phrase or use note-level lyric indices. Moderate. |

### Rating: 3.5/10

---

## 15. Pages: Landing

### Design Choices

- Shows 5 game cards in a draggable, reorderable grid.
- Order persisted to settings.
- SVG logo (smiley face with stars).
- "Made with Foldkit" footer link.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Separate `Message` type** — Defines its own `type Message` union instead of importing from `main.ts`. If new messages are added that the landing page dispatches, this type will be incomplete. | `src/pages/landing.ts:6-14` | **Low** | **1/5** | Import `Message` from `main.ts`. Trivial. |
| **`dragIndex` check on `game-card` uses partial equality** — `dragIndex === displayIdx` but `dragIndex` could be `-1` (no drag), which would incorrectly mark a card with `displayIdx === -1` (impossible, but poor type boundary). | `src/pages/landing.ts:57` | **Low** | **1/5** | Add an explicit `dragIndex >= 0` guard before comparing. One-liner. |
| **`GAMES` array length hard-coded as 5** — `init()` checks `saved.landingOrder.length === 5`. Adding or removing a game requires updating this magic number. | `src/main.ts:304-306` | **Low** | **1/5** | Use `GAMES.length` instead of hard-coded `5`. One-liner. |

### Rating: 8/10

---

## 16. Pages: AudioTest

### Design Choices

- Diagnostic page for testing AudioContext initialization strategies on iOS Safari.
- 20+ strategies organized into groups by approach (event types, session upgrades, silent WAV priming, legacy APIs).
- Console-based diagnostics on first load.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| _(Intentional — AudioTest is dev-only diagnostic tool. Not a bug.)_ | | | | |
| **Duplicated WAV-generation code** — Strategy Z generates a 440Hz sine WAV inline, duplicating the WAV header logic from `greeting.ts`. | `src/pages/audiotest.ts:211-251` vs `src/games/greeting.ts:66-91` | **Low** | **2/5** | Extract the WAV encoding logic into a shared utility in `audio.ts` and use it from both places. Straightforward. |

### Rating: 7/10

---

## 17. CSS/Styling

### Design Choices

- 1700-line single `styles.css` file.
- CSS custom properties for theming (light/dark mode).
- Comic Neue font (Rubik for Farsi).
- Extensive use of `@keyframes` for animations.
- Dark mode via `.dark` class toggle.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **Single monolithic CSS file** — 1700 lines. No CSS modules, no scoped styles. Class naming convention based on BEM-like patterns but not enforced. | `src/styles.css` | **Medium** | **3/5** | Split into per-page/per-game CSS files (e.g., `games/musicbox.css`, `pages/landing.css`). Requires build tool config for CSS modules or imports. Moderate effort. |

### Rating: 7/10

---

## 18. Tests

### Test Files

| File | Type | Lines | Assertions |
|---|---|---|---|
| `main.test.ts` | Story (model/update) + Scene | 234 | 9 Story tests, 1 describe |
| `greeting.test.ts` | Story + Scene | 315 | 18 tests |
| `counter.test.ts` | Story + Scene | 252 | 15 tests + numberToWord suite |
| `findit.test.ts` | Story + Scene | 334 | 20 tests |
| `bubbles.test.ts` | Story + Scene | 239 | 16 tests |
| `musicbox.test.ts` | Story + Scene | 665 | 45 tests |
| `musicbox-bot.test.ts` | Story + Scene | 159 | 12 tests |
| `_pitch_check.test.ts` | Story | 11 | 1 test |
| `landing.test.ts` | Scene | 50 | 3 tests |
| `i18n.test.ts` | Unit | 33 | 2 tests |

**Total: ~2292 lines of test code, ~140 test cases, 10 test files.**

### Foldkit Test Patterns

- **`Story.story`** for testing pure model transitions: `Story.with(initialModel).message(msg).model(assert).Command.resolveAll(...).Command.expectNone()`.
- **`Scene.scene`** for testing view rendering: `Scene.with(model).expect(Scene.text(...)).toExist()`.
- **`Scene.Mount.resolveAll`** to simulate mount hook resolution.
- **`Scene.click` / `Scene.pointerDown` / `Scene.pointerUp`** for simulating user interactions.

### Bugs & Tech Debt

| Issue | Location | Severity | Difficulty | Fix Rationale |
|---|---|---|---|---|
| **`_pitch_check.test.ts` starts with underscore** — Vitest picks it up despite the underscore convention suggesting it should be excluded. | `src/games/_pitch_check.test.ts` | **Low** | **1/5** | Rename or add to vitest exclude config. Trivial. |
| **No tests for audio commands** — The actual audio side effects (oscillator tones, speech synthesis, media recording) are never tested. Tests validate that commands are dispatched, but not that their effects work correctly. | All test files | **Medium** | **4/5** | Testing Web Audio requires mocking the AudioContext API. Possible with vitest + happy-dom, but complex. The command-dispatch tests are a reasonable pragmatic compromise. |
| **No tests for Subscription logic** — `subscriptions.ts` has zero test coverage. | — | **Medium** | **3/5** | Requires creating an integration test that runs the Foldkit runtime with subscriptions. Framework-level testing. |
| **`musicbox.test.ts` doesn't test note playback correctness** — Verifies that `Play` dispatches a `PlayMusicBox` command, but doesn't verify that the song plays correct notes in correct order. | `src/games/musicbox.test.ts:67-83` | **Medium** | **3/5** | Would require mocking the AudioContext to capture note frequencies/timing. Feasible but non-trivial. |
| **`musicbox-bot.test.ts` tests bottom keyboard rendering but not bottom keyboard note playback** — Tests that `C3` is rendered but never that clicking `C3` dispatches `NoteOn({ pitch: 'C3' })`. | `src/games/musicbox-bot.test.ts` | **Low** | **2/5** | Add a `Scene.click` + `Story.story` test for `NoteOn` dispatch. Straightforward. |
| **`createModel()` in `main.test.ts` overrides `findIt`** with a minimal grid, skipping model.Schema validation. If the FindIt model changes, this test helper won't catch it. | `src/main.test.ts:228-234` | **Low** | **1/5** | Use `Schema.parse` or `Schema.decodeSync` to ensure the fixture stays valid. One-liner. |
| **`nonSettingsMessages` test array** doesn't verify that the messages do NOT cause persistence — it only checks that they don't crash. The `Story.Command.expectNone()` at the end only checks there are no remaining commands AFTER resolution, not before. | `src/main.test.ts:15-26` | **Low** | **2/5** | Add a model assertion that settings-related fields haven't changed after the message is processed (or check no PersistSettings command was emitted before resolution). Moderate. |

### Rating: 7/10

---

## 19. Project-Level Summary

### Overall Assessment

FoldKid is a well-architected children's games application that demonstrates sophisticated use of Effect-TS and the Foldkit Elm-architecture framework. The codebase is clean, well-structured, and the functional patterns (exhaustive matching, schema-validated models, command-based effects) enable a high degree of type safety.

The biggest architectural strength is the consistent application of the Elm Architecture with Effect-TS — each game is a self-contained module with its own `Model`, `Message`, `update`, and `view`. The separation of concerns is excellent at the file level.

The biggest weakness is the Music Box game, which has accumulated significant tech debt through module-level global mutable state that subverts the architecture. The Music Box accounts for ~30% of the total source code but ~60% of the identified issues.

### Game Ratings

| Area | Rating |
|---|---|
| Architecture & Patterns | 7.5/10 |
| Entry Point / Runtime | 8.5/10 |
| Routing | 9/10 |
| Messages | 8/10 |
| Main Model/Update/View | 7/10 |
| Subscriptions | 8.5/10 |
| i18n | 7.5/10 |
| Audio System | 7/10 |
| Speech Synthesis | 6.5/10 |
| **Greeting** | **6/10** |
| **Counter** | **7/10** |
| **Find It** | **7/10** |
| **Bubbles** | **6.5/10** |
| **Music Box** | **3.5/10** |
| Landing Page | 8/10 |
| Audio Test | 7/10 |
| CSS/Styles | 7/10 |
| Tests | 7/10 |

**Total: 133/180 = 73.9%**

### Top Issues by Effort vs Impact

| Priority | Issue | Severity | Difficulty | Impact |
|---|---|---|---|---|
| 1 | **Music Box: Fix `SetSong` leaving `stopFlag` set** | High | 2/5 | Fixes broken song switching. Simple fix, high impact. |
| 2 | **Music Box: Extract shared audio pipeline** (`playNoteAudio`/`startNote`) | High | 3/5 | Eliminates massive code duplication. Makes future audio changes safe. |
| 3 | **Greeting: Remove recording module-level globals** | High | 4/5 | Eliminates stale-state bugs and enables proper cleanup. |
| 4 | **Music Box: Consolidate AudioContext** with `audio.ts` | Medium | 2/5 | Fixes resource waste and potential audio conflicts. |
| 5 | **Greeting: Fix `SetVoiceEffect` / `ClickedPlay` duplication** | Medium | 2/5 | Eliminates maintainability risk from duplicated logic. |
| 6 | **i18n: Split the translations file** | Medium | 2/5 | Makes adding/editing translations much easier. |
| 7 | **Main: Extract shared import/export helper** | Medium | 2/5 | Eliminates duplicated validation logic. |
| 8 | **Find It: Fix `Intl.Segmenter` locale** | Medium | 2/5 | Prevents potential crash on older Safari. |
| 9 | **Speech: Fix `cancel()` race condition** | Medium | 3/5 | Prevents Chrome from dropping speech utterances. |
| 10 | **Music Box: Eliminate module-level globals** | Critical | 5/5 | Highest impact but also highest effort. Architectural rewrite. |

### What's Done Well

- Nearly every update function uses `M.tagsExhaustive()`, ensuring compile-time coverage of all message variants.
- Resource cleanup via `Effect.acquireRelease` is used correctly in animation loops.
- Each game is truly self-contained with its own model, messages, update, and view.
- The command pattern for side effects (audio, speech, recording) is clean and composable.
- Test coverage is good (140+ tests) and uses Foldkit's Story/Scene testing DSL effectively.
- The i18n system is type-safe for key access and supports function-valued translations.
- Settings persistence with versioning and sanitization is robust.
- The `Subscription.make` pattern elegantly manages document-level event listeners.
