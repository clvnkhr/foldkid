# Bubbles Game Architecture

Timestamp: 2026-06-19 11:19 Europe/London

Source: `src/games/bubbles.ts`

Bubbles is a tactile color and popping game. The Foldkit model tracks bubbles and score; mounted DOM code handles floating movement, pop particles, and press-duration bubble sizing.

## Model

The model stores:

- `bubbles`: bubble records with `id`, `color`, `popped`, and `size`.
- `score`: number popped.
- `nextId`: stable id allocation.
- `rainbowMode`, `selectedColor`: current palette state.
- `popLabel`, `sayColor`: mutually exclusive feedback preferences.

Only `popLabel` and `sayColor` are persisted by root settings. `selectedColor` is intentionally transient.

## Update Design

`ClickedColor` creates a bubble. The held duration controls size:

```ts
const size = Math.min(10 + msg.duration * 0.07, 200)
```

`rainbow` is converted to a gradient. Hex colors stay as color strings.

`ClickedPop` marks a bubble popped and increments score. The bubble stays in the model as historical state but is filtered out of the rendered live bubbles.

`ClickedReset` clears bubbles and score, but preserves `nextId`.

`SetPopLabel` and `SetSayColor` turn each other off, keeping feedback mode simple.

## Effects

Adding a bubble returns `PlayChime`; popping returns `PlayPop`; reset returns `PlaySwoosh`, unless muted.

## View and Animation

The color selector is a mounted pointer handler. It records pointer-down time per pointer id and emits `ClickedColor` on release.

The bubble container mount owns:

- Floating positions and velocities.
- Growing radii capped at 200.
- Wraparound movement.
- A `MutationObserver` that detects removed bubble elements and emits particle bursts.
- Document pointer state for drag-popping across bubbles.

The model says which bubbles exist. The mount decides how they drift and how the pop visual is animated.

## Tests

`src/games/bubbles.test.ts` covers:

- Empty initial state.
- Hex and rainbow bubble creation.
- Duration-to-size behavior.
- Pop by id and no cross-bubble mutation.
- Reset/no-op reset.
- Scene rendering for empty, active, and all-popped states.
- Color selector presence.

