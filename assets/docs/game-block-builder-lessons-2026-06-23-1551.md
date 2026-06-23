# Block Builder Implementation Lessons

Timestamp: 2026-06-23 15:51 Europe/London

Related plan: `assets/docs/game-block-builder-plan-2026-06-23-1430.md`

The first Block Builder implementation attempt was reverted. The core idea is still good, but the change was too broad for one pass: domain logic, Three.js runtime, app routing, landing-page integration, CSS, i18n, dependency installation, and tests all landed together. That made debugging messy and let a visual regression reach the landing page.

## What Went Wrong

- The implementation touched too many app surfaces at once.
- Three.js was added before the dependency was actually installed and locked.
- The runtime import path made tests and builds sensitive to the missing package.
- The landing page gained another visible game card immediately.
- Existing landing CSS was brittle: it assumed a small visible game set and a narrow flex layout.
- Block Builder's own CSS was scoped, but adding the game exposed landing layout fragility.
- Style budget changes were mixed into the feature work, making the CSS blast radius larger.
- The app was integrated before the game had been proven in isolation.

## What Was Actually Learned

The safest part of the attempt was the pure grid model:

- Blocks can be represented as local integer coordinates inside a group.
- Groups can be represented by an origin plus connected block ids.
- Merge behavior is testable without Three.js.
- Detach behavior is testable with flood fill over six face-neighbor directions.
- Group color can be derived from group size rather than stored as editable state.

The risky parts were integration and rendering:

- Three.js should be introduced only after dependency installation is confirmed.
- The runtime should be developed behind a narrow mount boundary.
- Landing integration should be one of the final steps, not the first visible proof.
- New games should default hidden until visual behavior is checked in browser.
- Global or shared CSS tests should not be adjusted during early gameplay work.

## Safer Restart Sequence

1. Create only `src/games/blockBuilderDomain.ts`.
2. Add tests for coordinates, face directions, merge rejection, merge success, detach, split, and color derivation.
3. Run `npm test` and `npm run typecheck`.
4. Add `three` with a completed package install and lockfile update.
5. Create a standalone runtime spike that is not routed into the app.
6. Verify a nonblank canvas in a local page or isolated mount test.
7. Add a minimal game module with no landing card.
8. Add route integration behind a hidden setting or dev-only path.
9. Add scoped CSS only for the game page.
10. Only after browser screenshots look good, add the landing card.

## Guardrails For Next Attempt

- One PR-sized chunk at a time.
- No landing-page changes in the same chunk as Three.js runtime work.
- No style budget changes unless the exact CSS file that grew is known and justified.
- No package.json dependency change without a matching lockfile change.
- No dynamic runtime import from pure domain modules.
- Keep `src/games/blockBuilderDomain.test.ts` independent of browser, Foldkit view, and Three.js.
- Treat the landing page as a shared surface with its own regression risk.

## Suggested First Chunk

The next implementation should stop after this:

- `src/games/blockBuilderDomain.ts`
- `src/games/blockBuilderDomain.test.ts`

That chunk should expose pure functions such as:

- `colorKeyForSize`
- `attachGroups`
- `detachBlock`
- `connectedComponents`
- `occupiedCellsForGroup`
- `canTranslateGroup`

No CSS, no route, no landing card, no Three.js, no i18n, and no root app model changes.
