# Counter Game Architecture

Timestamp: 2026-06-19 11:19 Europe/London

Source: `src/games/counter.ts`

Counter is the smallest game and the clearest example of the app pattern: schema model, typed messages, pure update, command-returning side effects, and a view with a mounted animation runtime.

## Model

The model stores:

- `count`: current number.
- `fontSize`: visual size of the number and spawned balls.
- `holding`, `pointerDownTime`, `pressedButton`: pointer gesture tracking.
- `displayMode`: `number`, `word`, or `both`.

`displayMode` is persisted by the root settings system.

## Update Design

Pointer-down is separate from increment/decrement completion. This supports long presses and mobile edge cases where `pointerup` and `pointerleave` can both fire.

The helper `shouldCompletePress` allows a press to complete only if the button still matches. Tests cover duplicate pointer completion so a drag/tap increments exactly once.

Longer press duration increases `fontSize` through `calcFontSize`, clamped from 3 to 20.

## Effects

Increment/decrement returns a click sound plus a speech command unless muted. Reset returns a swoosh plus speech for zero.

The visible text can use localized words through `numberToWord`, backed by `n2words` language-specific functions and special handling for Malay and Chinese.

## View and Animation

The view renders:

- `-1`, reset, and `+1` buttons.
- A `balls-container` with `data-count` and `data-fontsize`.
- The text count in the selected display mode.

The `counterBalls` mount creates a requestAnimationFrame loop. It reads count/font-size changes through a `MutationObserver`, tracks container size with `ResizeObserver`, and simulates balls with gravity, collisions, wall bounce, and pop particles.

This is a deliberate split: the model stores count and visual intent, while the physics runtime owns DOM particles and animation state.

## Tests

`src/games/counter.test.ts` covers:

- Basic increment, decrement, reset, and sound command resolution.
- Long press sizing.
- Duplicate mobile pointer events.
- Scene rendering and clicking.
- Parser helpers for DOM data attributes.
- Localized number words.

