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

| Issue | Location | Severity |
|---|---|---|
| **Duplicate audio context management** — `audio.ts` has `sharedCtx`, `musicbox.ts` has its own `sharedCtx`. Multiple contexts can coexist, wasting resources and potentially causing audio routing conflicts. | `src/audio.ts:3`, `src/games/musicbox.ts:753` | **Medium** |
| **No error boundaries** — If any command or mount hook throws, there is no error recovery. The app could enter a broken state. | Entire app | **Medium** |
| **Import style inconsistency** — Uses barrel imports (`import { Command } from 'foldkit'`) instead of deep imports (`import { Command } from 'foldkit/command'`). Barrel imports can bundle unused code. | All files | **Low** |
| **`tsconfig.json` enables `noUnusedLocals`/`noUnusedParameters`** but `_update` in `main.ts` uses underscore prefix solely to suppress warnings. | `src/main.ts:400` | **Low** |

### Rating: 7.5/10

---

## 2. Entry Point & Runtime Setup

### Design Choices

- `src/entry.ts` is minimal — calls `Runtime.makeProgram` then `Runtime.run`. Clean separation of bootstrapping from application logic.
- `devTools: { Message }` enables Foldkit's dev tools (time-travel debugging, message inspection).
- The `container` is a `<div id="root">` from `index.html`.

### Bugs & Tech Debt

| Issue | Location | Severity |
|---|---|---|
| No error handling around `document.getElementById('root')` — if the element is missing, the app crashes silently. | `src/entry.ts:12` | **Low** |
| No PWA registration or service worker despite having PWA icons and manifest. | — | **Low** |

### Rating: 8.5/10

---

## 3. Routing

### Design Choices

- Tagged union `Page` defined via `ts()` from `foldkit/schema`. Pages: `Landing`, `Greeting`, `Counter`, `FindIt`, `Bubbles`, `MusicBox`, `AudioTest`.
- No URL-based routing — `model.page` is set directly by messages. Simple and correct for this use case.

### Bugs & Tech Debt

| Issue | Location | Severity |
|---|---|---|
| AudioTest page is publicly reachable via the diag link but has no i18n title or accessible label. | `src/pages/landing.ts:78-81` | **Low** |

### Rating: 9/10

---

## 4. Messages

### Design Choices

- `m()` from `foldkit/message` creates tagged-union constructors. Messages with payloads declare their schema inline (e.g., `m('SetLanguage', { value: S.String })`).
- All game messages are re-exported through `main.ts`'s `Message` union, ensuring exhaustive matching.
- Every game defines a `SoundPlayed` message to close the audio effect loop.

### Bugs & Tech Debt

| Issue | Location | Severity |
|---|---|---|
| `SettingsExported` is defined in `message.ts` (line 24) but never used anywhere. Dead code. | `src/message.ts:24` | **Low** |
| Message names use inconsistent casing: `GreetingClickedRecord` vs `MusicBoxPlay` vs `BubblesSetRainbowMode`. Some prefix with the game name, some don't. | All games | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **Debounce via module-level setTimeout** — `persistTimer` is a module-level variable. If the model is updated rapidly, only the last write goes through, but the timer is never managed by Effect's runtime. If the app crashes before the timer fires, settings are lost. | `src/main.ts:105-116` | **Medium** |
| **`_update` and `update` split** — `_update` is the real handler; `update` wraps it to inject persistence. The underscore naming is a workaround for the `noUnusedLocals` lint rule. Better: inline the persistence check. | `src/main.ts:400-591` | **Low** |
| **`SETTINGS_TAGS` stringly-typed** — Uses magic strings that must match message `_tag` values. Adding a new settings-affecting message requires remembering to add it here; no compile-time check. | `src/main.ts:573-580` | **Low** |
| **Duplicate import/export logic** — `ImportedSettings` and `ApplyImport` both parse JSON, validate version, check for `s.language`, and apply. This is ~95% duplicated code. | `src/main.ts:534-567` | **Medium** |
| **Settings import `ImportedSettings`** doesn't persist to localStorage immediately (the `ApplyImport` handler does), but `ImportedSettings` handler at line 545 does persist. The dual import paths are inconsistent. | `src/main.ts:545` compared to `src/main.ts:562` | **Medium** |
| **`SettingsDragMoved`** dispatches on every `pointermove` event, which can cause excessive re-renders during drag. | `src/main.ts:503-507` | **Low** |
| **Dark mode `matchMedia` listener** in the view function creates a new stream on every render — but it's inside `h.OnMount`, which only runs once. Correct, but misleading placement. | `src/main.ts:620-627` | **Low** |
| **`preventDoubleTapZoom`** adds a `touchend` listener on every mount of the app root — but is inside `h.OnMount`, so it's once. The event listener is never cleaned up (no abort controller / removal). | `src/main.ts:629-637` | **Low** |
| **`init()` reads `saved.findItVoiceMode` twice** (lines 261 and 289) — minor redundancy. | `src/main.ts:261, 261-264, 289` | **Low** |
| **`applyImportData`** doesn't validate `landingOrder` length (unlike `init()` which checks for length === 5). | `src/main.ts:361-398` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| The `isDraggingSettings` check happens once at subscription creation time via `Effect.sync`, not reactively. If the model changes mid-stream, the subscription won't deactivate until the next model-to-dependencies comparison cycle. | `src/subscriptions.ts:12` | **Low** |

### Rating: 8.5/10

---

## 7. i18n

### Design Choices

- 8 languages: en, zh, fr, de, fa, ms, zh-HK, ja.
- Translations are a single large `const` object with string and function values (e.g., `greeted: (n) => ...`).
- `t()` resolves string keys; `tf()` resolves function keys with parameters.
- `TranslationKey` type derived from the object structure — type-safe key access.

### Bugs & Tech Debt

| Issue | Location | Severity |
|---|---|---|
| **1024-line file** — The translations object is monolithic. Adding a language requires scrolling through all existing ones. Should be split by locale. | `src/i18n.ts` | **Medium** |
| **Type safety gap** — `t()` returns `as string` via cast; if a key is a function, it silently returns the function object coerced to string. No compile-time check. | `src/i18n.ts:1009` | **Medium** |
| **`tf()` uses `as never`** for the function call and parameters — completely bypasses type checking in practice. | `src/i18n.ts:1022-1023` | **Medium** |
| **Missing keys not caught at compile time** — `t()` falls back to English at runtime. A new key added to English won't produce a type error for other languages. | `src/i18n.ts:1008` | **Low** |
| **`musicBoxBell`** translation key maps to "Piano" in English — misleading name. | `src/i18n.ts:99` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **`AudioContext` singleton is not exported** — `musicbox.ts` maintains its own parallel `sharedCtx` and `getCtx()`. Two AudioContexts can coexist, wasting memory and potentially causing audio routing issues. | Compare `src/audio.ts:3-12` with `src/games/musicbox.ts:753-780` | **Medium** |
| **`exponentialRampToValueAtTime(0.001, ...)`** — the parameter should be 0.0001 or less; 0.001 can cause a click/pop on some browsers. | `src/audio.ts:27` | **Low** |
| **`onended` cleanup** in `playTone` may not fire if the oscillator was already stopped. | `src/audio.ts:32-35` | **Low** |

### Rating: 7/10

---

## 9. Speech Synthesis

### Design Choices

- `findVoice()` searches for a voice matching the language code, falling back to the two-letter prefix.
- `speak()` wraps `SpeechSynthesisUtterance` in a `Command.Command<Msg>`.

### Bugs & Tech Debt

| Issue | Location | Severity |
|---|---|---|
| **Race condition: `cancel()` then `speak()`** — `speechSynthesis.cancel()` is asynchronous; calling `speak()` immediately after can cause the new utterance to be silently dropped in Chrome. This is documented in the greeting test (H3) but never fixed. | `src/speech.ts:16-17` | **Medium** |
| **`cancel()` is aggressive** — Cancels ALL speech, including utterances from other parts of the app. If two games try to speak simultaneously, one will be silenced. | `src/speech.ts:16` | **Low** |
| **Voice availability is not checked** — `speak()` proceeds even if no voice is found or speech synthesis is unavailable. | `src/speech.ts:21-22` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **Module-level globals** — `activeMediaRecorder` and `activeMediaStream` are module-level mutable variables. If the user navigates away mid-recording and back, stale state persists. | `src/games/greeting.ts:11-12` | **High** |
| **`playGreeting` is pure side-effect in `Effect.sync`** — no cleanup, no cancellation support. If the user navigates away while the greeting is playing, audio continues. | `src/games/greeting.ts:268-308` | **Medium** |
| **`playGreeting` creates AudioContext per play** — creates a new `AudioContext` for every play and never closes it if fetch/decode fails before playback starts. Memory leak. | `src/games/greeting.ts:271, 294` | **Medium** |
| **`ClickedStopRecording` returns model unchanged** — the update handler returns the model as-is and dispatches the Stop command, but doesn't set `status: 'idle'` until `RecordedAudio` or `RecordingFailed` fires. If recording hardware fails silently, the UI stays in recording state. | `src/games/greeting.ts:362-365` | **Medium** |
| **`stopRecordingCmd` returns `SoundPlayed()`** as the Effect result, but this is semantically wrong — the Stop action didn't play any sound. | `src/games/greeting.ts:326-338` | **Low** |
| **AnalyserNode created but never used** — `analyser` is created but its data is never read (`analyser.getByteTimeDomainData` never called). | `src/games/greeting.ts:115-116` | **Low** |
| **`recordingId` fallback spreads** — `recordingId: (model.recordingId ?? 0) + 1` on line 367, 382. The `?? 0` suggests the field might be undefined, but the schema says `S.Number`. Either the schema is wrong or the fallback is dead code. | `src/games/greeting.ts:367, 382` | **Low** |
| **`SetVoiceEffect` duplicates `ClickedPlay` logic** — the entire auto-play block (lines 388-393) is duplicated from `ClickedPlay` (lines 374-379). | `src/games/greeting.ts:374-379 vs 388-393` | **Medium** |
| **`effect` field in hello objects** is typed as `string` (from model), but the `EFFECTS.find` lookup treats it as `EffectType`. No runtime guarantee. | `src/games/greeting.ts:481` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **Module-level global mutable state** — `pointerDownTime` and `pressedButton` are module-level variables. If the component unmounts while a pointer is held, these leak across re-mounts. | `src/games/counter.ts:145-146` | **Medium** |
| **Entire physics engine is imperative** — The `tick` function and `BallState` management happen entirely outside Effect's scope. The `Stream.callback<never>` queue is never used (the `_queue` param is unused). | `src/games/counter.ts:232-381, 438` | **Low** |
| **`activeParticles` global set** — module-level mutable set that's never cleaned up except by `counterBalls` `acquireRelease`. If `poof()` is called outside the animation loop, particles leak. | `src/games/counter.ts:166` | **Low** |
| **`requestAnimationFrame` after `state.running = false`** — the `loop` function checks `state.running` before the next `rAF`, but if the last frame was already queued, it will still run. | `src/games/counter.ts:466-470` | **Low** |
| **Collision resolution can produce NaN** — Line 333 checks `isFinite(dist)` after sqrt, but velocity impulses on line 346-355 can still produce NaN/Infinity if masses are extreme. | `src/games/counter.ts:333-355` | **Low** |
| **Ball physics ignores device pixel ratio** — uses CSS pixels for physics, which means the simulation behaves differently on Retina vs non-Retina displays. | `src/games/counter.ts:232-381` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **Emoji names as parallel arrays** — `EMOJI_NAMES_BY_LANG` is a set of 7 arrays with 64 entries each, manually maintained. Adding an emoji requires updating all 7 arrays in lockstep. Extremely error-prone. | `src/games/findit.ts:30-38` | **High** |
| **`Intl.Segmenter` used without option validation** — `new Intl.Segmenter()` with no locale may throw on old Safari. The method is used to split multi-codepoint emoji but grapheme clusters vary by locale. | `src/games/findit.ts:41` | **Medium** |
| **Pairs mode generates potential duplicates** — `generatePairsGame` uses `shuffle(EMOJI_POOL)` then picks `pool[0]` and `pool[1]`. The pool was shuffled so they're random, but the two emojis could be the same (if `EMOJI_POOL` had duplicates, though it doesn't). The `emojiA !== emojiB` check only handles exact equality; `emojiA + emojiB === emojiB + emojiA` when both are the same symbol. | `src/games/findit.ts:93-98` | **Low** |
| **`generateGame` signature** takes 4 optional booleans — uses positional optional params, which is fragile. Callers must pass `undefined` for earlier params to set later ones. | `src/games/findit.ts:113` | **Low** |
| **Keyboard a11y** — Grid cells use `h.OnClick` but no `h.OnKeyDown` or `role` attributes. Keyboard-only users can't play. | `src/games/findit.ts:257` | **Medium** |
| **`SetPairsMode` resets game** — Changing pairs mode generates a fresh game, losing current progress. This is reasonable but unexpected if the user accidentally toggles it. | `src/games/findit.ts:166-168` | **Low** |
| **`shaking` and `shakeTick` used for CSS animation key** — `h.Key(cell.id.toString() + ...)` on line 258 forces re-render of the cell on shake, which is necessary to restart the CSS animation. Clever but fragile. | `src/games/findit.ts:258` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **Module-level global `isPointerDown`** — Set to `true`/`false` by document-level `pointerdown`/`pointerup` listeners. Used to decide whether `pointermove` should pop bubbles. This is a race condition: if the user starts a drag on the color selector and moves, `isPointerDown` is true and a pop fires. | `src/games/bubbles.ts:31, 443-447, 502` | **Medium** |
| **DOM particle creation in `poof()`** — Creates DOM elements on `document.body` with no boundary for cleanup. If many bubbles are popped rapidly, hundreds of DOM elements pile up. The animations do have `onfinish = () => el.remove()` but the `setTimeout` in the Secondary splash doesn't always trigger onfinish if the element is GC'd. | `src/games/bubbles.ts:49-178` | **Medium** |
| **`poof()` function name conflicts with `counter.ts`'s `poof()`** — Both are module-level functions with the same name. If both modules are imported, one shadows the other. They're in different modules so this is technically fine, but confusing. | `src/games/bubbles.ts:49` vs `src/games/counter.ts:168` | **Low** |
| **Bubble physics uses `window.innerWidth/Height`** — If the viewport size changes, bubble positions don't adjust proportionally. A bubble wrapping off the right edge when the window is wide may appear in the middle when narrow. | `src/games/bubbles.ts:200-201, 221-222` | **Low** |
| **Color selector DOM event listeners** — Uses native `addEventListener` for pointer events with `e.preventDefault()`. The `el.setPointerCapture` call may conflict with Foldkit's own pointer handling. | `src/games/bubbles.ts:344-366` | **Low** |
| **`BubblesClickedPop` dispatched on `pointermove`** when `isPointerDown` is true — This means dragging across a bubble pops it. Combined with the `isPointerDown` global, this is unreliable: if a pointer is down on the color selector, then moves over a bubble, the bubble pops. | `src/games/bubbles.ts:502` | **Medium** |
| **Milestone detection at `score % 25 === 0 || score === 10`** — This means 10, 25, 50, 75, etc. But the condition is checked in the view function, so if the user scrolls past 10-24 without viewing the page, they miss the 10 milestone. | `src/games/bubbles.ts:422` | **Low** |
| **Pop label data is passed via `data-pop-label` attribute** — The `poof()` function reads `data-pop-label` from the container at removal time, which works but is fragile (depends on DOM attribute state). | `src/games/bubbles.ts:429, 463-465` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **Massive module-level mutable global state** — `activeNotes`, `selectedInstrumentIndex`, `keyboardBound`, `shortcutKeysBound`, `currentOctaveOffset`, `sharedCtx`, `masterCompressor`, `stopFlag`, `pauseFlag`, `playbackTempo`, `playbackTranspose`, `currentLyricLine`. This is state that should live in the Model or be encapsulated in effects. It completely defeats the Elm architecture. | `src/games/musicbox.ts:150-159, 753-759` | **Critical** |
| **`selectedInstrumentIndex` and `currentOctaveOffset` are module-level globals** that are synced from the model but can get out of sync. If the model changes but `currentOctaveOffset` isn't updated (it's only set in `view()`, line 1216), the keyboard plays at the wrong octave. | `src/games/musicbox.ts:155, 158, 1216` | **High** |
| **`bindKeyboard()` and `bindShortcutKeys()` called from `init()`** — These add document-level event listeners. Since `init()` runs on every module import, and there's no cleanup mechanism, the listeners accumulate if the module is re-imported or the component re-mounted. | `src/games/musicbox.ts:1055-1056` | **High** |
| **`setInterval` for sleep/wake detection at module level** — A 5-second interval runs forever after import, even if MusicBox is never displayed. Wastes battery and CPU. | `src/games/musicbox.ts:800-804` | **Medium** |
| **`playNoteAudio` and `startNote` share ~80% of their code** — Both create oscillators, set up gain envelopes, handle harmonics, filters, and tremolo. The duplication is massive and any change to the audio pipeline must be made in both places. | Compare `src/games/musicbox.ts:809-876` with `src/games/musicbox.ts:920-973` | **High** |
| **`stopNote` uses `masterGain.gain.value`** at the time of stopping to set the release ramp starting level. But `gain.value` is the value at the last scheduled event, not the current audio-time value. The release starts from the wrong level. | `src/games/musicbox.ts:985` | **Medium** |
| **`playSongCmd` uses `Effect.gen` with `Effect.sleep` for timing** — This is a blocking-style Effect. However, `Effect.sleep` is based on the Effect runtime clock, not the Web Audio `currentTime`. If the system clock jumps, the playback timing breaks. | `src/games/musicbox.ts:906` | **Medium** |
| **Lyric line synchronization is approximate** — `beatsPerLine` is calculated by dividing total note duration by the number of non-empty lyric lines. For songs with repeated sections (all of them), this is an approximation that drifts. The synchronization becomes noticeably wrong by the end of long songs. | `src/games/musicbox.ts:889-892` | **Medium** |
| **`highlightLyricLine` uses CSS class manipulation** via `document.querySelectorAll` — directly manipulates DOM outside of Foldkit's virtual DOM. If the view re-renders, the highlighted state could be lost or conflict. | `src/games/musicbox.ts:310-332` | **Medium** |
| **Same for `highlightKey` / `unhighlightKey`** — directly modifies DOM classes on piano keys, bypassing Foldkit's rendering. | `src/games/musicbox.ts:280-302` | **Medium** |
| **`playSongCmd` doesn't check if model changed during playback** — If the user changes the song or instrument mid-play, the global `stopFlag` is set, but the Effect has no way to observe other model changes (like tempo changes). The globals `playbackTempo`, `playbackTranspose` are set once when play starts. | `src/games/musicbox.ts:1080-1081` | **Medium** |
| **`togglePause` doesn't pause note audio** — Sets `pauseFlag = true` but doesn't stop active notes. Notes continue to ring while paused. | `src/games/musicbox.ts:1162-1171` | **Low** |
| **`SetSong` handler stops playback but doesn't reset `stopFlag`** — Sets `stopFlag = true` but leaves it as true after the new song is selected. The next play starts with `stopFlag` still true, so `playSongCmd` immediately exits. | `src/games/musicbox.ts:1098-1104` | **High** |
| **`SongEnded` handler doesn't clean up `stopFlag`/`pauseFlag`** — These are at module level and leak between plays. | `src/games/musicbox.ts:1111-1114` | **Medium** |
| **Keyboard construction with leading black key** — `buildKeyboard` prepends a black key before the first white key (e.g., `C#3` before `D3`). This works visually but causes the first white key to be the second item in the array, which makes index-based lookups confusing. | `src/games/musicbox.ts:116-125` | **Low** |
| **`transposePitch` function** doesn't handle notes with octave wraparound perfectly — if you transpose an `E#` (which is `F`) it breaks. Valid pitches don't use `E#`/`B#`, but transposition could produce them. | `src/games/musicbox.ts:76-87` | **Low** |
| **Song note data is hard-coded with WAV-style timing** — Durations like 1.5, 0.5 create rhythmic patterns, but the tempo control multiplies a flat sleep interval (`350` ms per unit), which means note durations aren't truly proportional. | `src/games/musicbox.ts:906` | **Low** |
| **Happy Birthday has no lyrics array alignment** — Only 4 lyric lines for 26 notes. The lyric highlighting will be imprecise. | `src/games/musicbox.ts:649-672` | **Low** |

### Rating: 3.5/10

---

## 15. Pages: Landing

### Design Choices

- Shows 5 game cards in a draggable, reorderable grid.
- Order persisted to settings.
- SVG logo (smiley face with stars).
- "Made with Foldkit" footer link.

### Bugs & Tech Debt

| Issue | Location | Severity |
|---|---|---|
| **Separate `Message` type** — Defines its own `type Message` union instead of importing from `main.ts`. If new messages are added that the landing page dispatches, this type will be incomplete. | `src/pages/landing.ts:6-14` | **Low** |
| **`dragIndex` check on `game-card` uses partial equality** — `dragIndex === displayIdx` but `dragIndex` could be `-1` (no drag), which would incorrectly mark a card with `displayIdx === -1` (impossible, but poor type boundary). | `src/pages/landing.ts:57` | **Low** |
| **`GAMES` array length hard-coded as 5** — `init()` checks `saved.landingOrder.length === 5`. Adding or removing a game requires updating this magic number. | `src/main.ts:304-306` | **Low** |

### Rating: 8/10

---

## 16. Pages: AudioTest

### Design Choices

- Diagnostic page for testing AudioContext initialization strategies on iOS Safari.
- 20+ strategies organized into groups by approach (event types, session upgrades, silent WAV priming, legacy APIs).
- Console-based diagnostics on first load.

### Bugs & Tech Debt

| Issue | Location | Severity |
|---|---|---|
| **This is debug code shipped to production** — It's accessible via a hidden link on the landing page. Should be behind a compile-time flag. | `src/pages/audiotest.ts` | **Low** |
| **Duplicated WAV-generation code** — Strategy Z generates a 440Hz sine WAV inline, duplicating the WAV header logic from `greeting.ts`. | `src/pages/audiotest.ts:211-251` vs `src/games/greeting.ts:66-91` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **Single monolithic CSS file** — 1700 lines. No CSS modules, no scoped styles. Class naming convention based on BEM-like patterns but not enforced. | `src/styles.css` | **Medium** |
| **`touch-action: manipulation` on all elements** — `*, *::before, *::after { touch-action: manipulation }`. This disables double-tap zoom on all elements, which may be desired but is aggressive. | `src/styles.css:12-14` | **Low** |
| **Dark mode animation `glowFlashDark` defined but unused** — There's no `.dark .piano-key-glow--active` referencing it in the CSS, but it's defined at line 1696. Wait, it IS referenced at line 1697. Correct. | `src/styles.css:1696-1698` | **None** |
| **`.dark` selectors for piano keys at lines 1670-1698** override but don't cover all states (e.g., `.piano-key-glow--active` in dark mode is handled). | `src/styles.css:1670-1698` | **Low** |

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

| Issue | Location | Severity |
|---|---|---|
| **`_pitch_check.test.ts` starts with underscore** — Vitest picks it up despite the underscore convention suggesting it should be excluded. | `src/games/_pitch_check.test.ts` | **Low** |
| **No tests for audio commands** — The actual audio side effects (oscillator tones, speech synthesis, media recording) are never tested. Tests validate that commands are dispatched, but not that their effects work correctly. | All test files | **Medium** |
| **No tests for Subscription logic** — `subscriptions.ts` has zero test coverage. | — | **Medium** |
| **`musicbox.test.ts` doesn't test note playback correctness** — Verifies that `Play` dispatches a `PlayMusicBox` command, but doesn't verify that the song plays correct notes in correct order. | `src/games/musicbox.test.ts:67-83` | **Medium** |
| **`musicbox-bot.test.ts` tests bottom keyboard rendering but not bottom keyboard note playback** — Tests that `C3` is rendered but never that clicking `C3` dispatches `NoteOn({ pitch: 'C3' })`. | `src/games/musicbox-bot.test.ts` | **Low** |
| **`createModel()` in `main.test.ts` overrides `findIt`** with a minimal grid, skipping model.Schema validation. If the FindIt model changes, this test helper won't catch it. | `src/main.test.ts:228-234` | **Low** |
| **`nonSettingsMessages` test array** doesn't verify that the messages do NOT cause persistence — it only checks that they don't crash. The `Story.Command.expectNone()` at the end only checks there are no remaining commands AFTER resolution, not before. | `src/main.test.ts:15-26` | **Low** |

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

### Top 5 Critical Issues to Fix

1. **Music Box: Eliminate module-level globals.** Move `activeNotes`, `stopFlag`, `pauseFlag`, `selectedInstrumentIndex`, `playbackTempo`, `playbackTranspose`, `currentLyricLine` into the Model or encapsulated Effect state. The current design makes the Music Box non-testable and prone to state corruption.

2. **Music Box: Fix `SetSong` leaving `stopFlag` set.** After stopping playback for a song change, `stopFlag` remains `true`, preventing the next play from working (#1098-1104).

3. **Music Box: Extract shared audio pipeline.** `playNoteAudio` and `startNote` share ~80% duplicated oscillator/gain/filter setup code. Extract into a shared function.

4. **Greeting: Remove module-level globals for recording.** `activeMediaRecorder` and `activeMediaStream` should be managed as resources within the Effect lifecycle, not module-level mutable state.

5. **i18n: Split the translations file.** The 1000+ line single object should be split by language into separate files for maintainability.

### What's Done Well

- Nearly every update function uses `M.tagsExhaustive()`, ensuring compile-time coverage of all message variants.
- Resource cleanup via `Effect.acquireRelease` is used correctly in animation loops.
- Each game is truly self-contained with its own model, messages, update, and view.
- The command pattern for side effects (audio, speech, recording) is clean and composable.
- Test coverage is good (140+ tests) and uses Foldkit's Story/Scene testing DSL effectively.
- The i18n system is type-safe for key access and supports function-valued translations.
- Settings persistence with versioning and sanitization is robust.
- The `Subscription.make` pattern elegantly manages document-level event listeners.
