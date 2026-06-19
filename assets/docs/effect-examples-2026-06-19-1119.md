# Effect in Foldkid

Timestamp: 2026-06-19 11:19 Europe/London

This app uses Effect in three main ways: data schemas, explicit side effects, and long-lived streams. Foldkit sits on top of these ideas, so most user-visible behavior is still expressed as Elm-style `Model -> Message -> update -> view`.

## Schemas as Runtime Boundaries

Effect Schema describes app data and messages at runtime, not only at TypeScript compile time. Examples:

- `src/main.ts` defines `PersistedSettingsSchema`, `SettingsExportSchema`, and the root `Model`.
- `src/route.ts` defines page variants with `ts('PageLanding')`, `ts('PageCounter')`, and so on, then combines them with `S.Union`.
- Each game exports its own `Model` and `Message` schema, then `src/main.ts` combines child game messages into the root `Message`.

This is why tests can decode real payloads:

```ts
const decodeMessage = S.decodeUnknownOption(Main.Message)
decodeMessage({ _tag: 'SetLanguage', value: 'zh-HK' })
```

The invariant tests also reject invalid nested payloads such as `{ _tag: 'FindItSetEmojiPackEnabled', key: 'space', value: true }`.

## Commands as Values

Side effects are returned from `update` as command values. The reducer itself stays predictable: it returns the next model plus commands for the runtime to execute.

Examples:

- `src/audio.ts` returns commands named `PlayClick`, `PlayPop`, `PlayChime`, `PlayBoing`, and `PlaySwoosh`.
- `src/speech.ts` returns a `Speak` command backed by `Effect.callback`.
- `src/main.ts` persists settings with a `PersistSettings` command.
- `src/games/draw.ts` creates recognition commands such as `DrawSubmitBoard`.

Counter shows the pattern clearly:

```ts
CounterPressedIncrement: (msg) => [
  { ...model, count: model.count + 1, fontSize: calcFontSize(msg.duration) },
  muted ? [] : [click(SoundPlayed()), speak(numberToWord(model.count + 1, language), SoundPlayed())],
]
```

The model update is immediate. Audio and speech are described and resolved later by the runtime.

## Streams and Managed Lifecycles

Effect streams are used when behavior lives longer than one click:

- `src/subscriptions.ts` creates a model-dependent stream for settings-panel drag events.
- `src/main.ts` mounts a dark-mode media-query listener and a double-tap zoom prevention stream.
- `src/games/bubbles.ts` uses `Stream.callback` and `Effect.acquireRelease` for pointer handling, mutation observation, and cleanup.
- `src/games/counter.ts` mounts a `requestAnimationFrame` physics loop and releases observers/particles on unmount.
- `src/games/draw.ts` mounts canvas input handling and returns recognition messages through queues.

The common shape is:

```ts
Stream.callback<Message>(queue =>
  Effect.gen(function* () {
    yield* Effect.acquireRelease(
      Effect.sync(() => { /* attach listeners */ }),
      resource => Effect.sync(() => { /* cleanup */ }),
    )
    return yield* Effect.never
  }),
)
```

That makes browser resource ownership visible in code.

## MutableRef Usage

The code uses `MutableRef` for state that belongs to browser runtimes rather than the app model:

- `src/audio.ts` stores the shared `AudioContext`.
- `src/games/musicbox.ts` tracks playback flags, selected instrument, tempo, transpose, and current lyric line.
- `src/games/bubbles.ts` tracks global pointer-down state for drag-popping bubbles.

These refs are deliberately outside persisted app state. They model imperative resources that should not be serialized or time-traveled as user settings.

