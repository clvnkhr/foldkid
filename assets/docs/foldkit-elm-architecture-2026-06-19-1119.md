# Foldkit and Elm Architecture

Timestamp: 2026-06-19 11:19 Europe/London

Foldkid is built in the Elm architecture style through Foldkit: one model, typed messages, one update function, declarative views, explicit commands, and model-dependent subscriptions.

## Boot Flow

`src/entry.ts` is the browser entry point:

```ts
const program = Runtime.makeProgram({
  Model,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  devTools: { Message },
})

Runtime.run(program)
```

This keeps `src/main.ts` importable from tests without booting the runtime.

## Model

The root model in `src/main.ts` contains app-level state plus one nested model per game:

- `page`, `darkMode`, `language`, settings panel state, import/export state.
- `musicBox`, `counter`, `findIt`, `bubbles`, `draw`.
- `landingOrder` for draggable landing-page game order.

Each game owns its own model schema. For example, `src/games/findit.ts` owns `grid`, `target`, `found`, `anyWins`, `voiceMode`, pack settings, tooltip state, and drag state.

## Message

Messages are tagged values made with `foldkit/message`:

```ts
export const ClickedCounter = m('ClickedCounter')
export const SetLanguage = m('SetLanguage', { value: Language })
```

Game modules do the same. The root `Message` union in `src/main.ts` includes app messages and child game messages.

## Update

The root update delegates child messages:

- Counter messages go through `updateCounter`.
- Find It messages go through `updateFindIt`.
- Bubbles messages go through `updateBubbles`.
- Draw messages go through `updateDraw`.
- Music Box messages go through `updateMusicBox`.

The app uses `Match.tagsExhaustive`, so new message variants must be handled explicitly.

Settings persistence is layered around the normal update:

```ts
const result = _update(model, message)
if (shouldPersistSettings(message)) {
  return [result[0], [...result[1], persistSettings(result[0])]]
}
return result
```

This keeps persistence policy centralized in `PERSISTED_SETTINGS_MESSAGE_TAGS`.

## View

Views are pure functions over model state that return Foldkit virtual DOM:

- `src/main.ts` renders navigation, settings, and the selected page.
- Each game exports a `view(model, language)` function.
- DOM listeners produce typed messages such as `ClickedCell({ id })` or `SetDrumVolume({ value })`.

Foldkit `OnMount` is used when view code needs a real DOM element, such as canvas drawing, animation loops, or pointer capture.

## Subscriptions

`src/subscriptions.ts` declares subscriptions as a function of the model. The settings drag stream only emits pointer messages while `isDraggingSettings` is true. This follows Elm's principle that subscriptions are derived from state.

## What This Buys the App

The codebase can be tested by sending messages into update functions, resolving commands by name, and asserting resulting models. This is why tests in `src/main.test.ts`, `src/games/counter.test.ts`, and `src/games/findit.test.ts` can cover behavior without re-creating the browser by hand.

