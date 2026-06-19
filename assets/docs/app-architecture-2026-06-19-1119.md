# Overall App Architecture

Timestamp: 2026-06-19 11:19 Europe/London

Foldkid is a Vite + TypeScript + Foldkit app for small child-facing games. The app is intentionally centralized: routing, settings, persistence, and game composition live in `src/main.ts`; individual game behavior lives under `src/games/`.

## Main Layers

- Entry: `src/entry.ts` creates and runs the Foldkit program.
- Root app: `src/main.ts` owns the root model, root message union, root update, persistence, settings UI, page rendering, and delegated game updates.
- Routing: `src/route.ts` defines page variants with Effect Schema.
- Subscriptions: `src/subscriptions.ts` owns model-dependent global pointer streams for resizing the settings panel.
- Games: `src/games/*.ts` own game-local models, messages, updates, views, and specialized runtimes.
- Shared services: `src/audio.ts`, `src/speech.ts`, and `src/i18n.ts`.
- Styles: `src/styles.css` imports per-page and per-game CSS files from `src/styles/`.
- Assets: `public/models/lenet-5-emnist-balanced/` stores the local Draw recognition model.

## Pages and Navigation

Routes are not URL-routed in this app; `page` is app state. The root `Page` union includes:

- Landing
- Counter
- Find It
- Bubbles
- Draw
- Music Box
- Audio Test

Navigation messages such as `ClickedCounter`, `ClickedFindIt`, and `ClickedMusicBox` only update `model.page`.

## Settings

Settings are persistent and versioned through localStorage key `foldkid-settings`.

Persisted settings include:

- Language, dark mode, mute, speech rate, speech pitch.
- Counter display mode.
- Find It mode flags and enabled emoji packs.
- Bubbles label/color-speech preferences.
- Draw recognition, target-pool, and free-mode preferences.
- Music Box song order, hidden songs, and drum volume.
- Landing-page game order.

The app uses Effect schemas to decode persisted settings defensively. Invalid or missing fields fall back to defaults.

Settings import/export is also schema-checked. `SettingsExportSchema` wraps version metadata and the settings payload, and version mismatches produce user-facing messages.

## Internationalization

`src/i18n.ts` provides translation dictionaries and helpers:

- `t(key, language)` for simple strings.
- `tf(key, language, value)` for formatted strings.
- `Language` schema for supported language codes.

Find It additionally keeps localized emoji-name tables in `src/games/findit.ts`. Counter uses `n2words` packages for number speech/display in supported languages.

## Audio and Speech

Short sound effects are centralized in `src/audio.ts`, which lazily creates and resumes a shared `AudioContext`. The functions return Foldkit commands rather than playing directly.

Speech is centralized in `src/speech.ts`, which wraps Web Speech API behavior in a `Speak` command. Global settings for speech rate, pitch, and language are passed down by `src/main.ts` when delegating to Counter and Find It.

Music Box has its own richer audio runtime in `src/games/musicboxAudioRuntime.ts`, because it needs manual notes, scheduled song playback, drums, compressor routing, and Safari wake handling.

## Persistence Policy

`PERSISTED_SETTINGS_MESSAGE_TAGS` is the single list of messages that should trigger a settings save. This avoids saving on transient gameplay events such as popping a bubble, clicking a Find It cell, or pressing a piano key.

The test `keeps the persisted message tag list aligned with persistence tests` guards this policy.

## Imperative Runtime Islands

Most state is in Foldkit models, but several features need browser-owned runtime state:

- Counter ball physics uses mounted DOM elements, animation frames, `ResizeObserver`, and `MutationObserver`.
- Bubbles uses global pointer tracking, mutation observation, and particle animations.
- Draw uses canvas event handling plus async recognizer commands.
- Music Box uses Web Audio nodes, keyboard listeners, playback flags, and page wake monitoring.

These are contained behind `OnMount`, command effects, or dedicated runtime modules so the game rules remain testable.

