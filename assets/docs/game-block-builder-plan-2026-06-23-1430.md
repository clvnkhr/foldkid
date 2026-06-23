# Block Builder Game Plan

Timestamp: 2026-06-23 14:30 Europe/London

Planned source: `src/games/blockBuilder.ts`

Block Builder is a child-friendly 3D construction game built with Three.js. The player can pick up cube blocks, move them around, snap them onto other blocks when faces get close enough, and pull blocks or whole groups apart again. Blocks connect on a unit grid through their six face directions. Each connected group is color coded by group size so the child can see when small pieces have become a bigger structure.

## Product Shape

The first version should be a single-screen toy:

- A full-bleed 3D play area with a ground plane, soft shadows, and a small set of starting blocks.
- Pointer controls for selecting, dragging, snapping, and detaching blocks.
- Simple camera orbit, pan, and zoom with child-safe limits.
- A reset button, an add-block button, and a detach-mode toggle.
- Immediate visual feedback when a block is near a valid face attachment.
- Color updates whenever groups merge or split.

The game is exploratory rather than score-based. Success is making and remaking shapes.

## Core Rules

Each block is an axis-aligned cube occupying an integer grid coordinate within its group. A block can attach to another block when:

- The dragged block is not already connected to the target block.
- The dragged block has one face close to one exposed target face.
- The candidate target grid coordinate is empty inside the target group.
- The dragged block group can be translated into that target coordinate without overlapping any block in the target group.
- The pointer is released while the candidate attachment remains within snap distance.

Face directions are the six unit vectors:

- `+x` right
- `-x` left
- `+y` top
- `-y` bottom
- `+z` front
- `-z` back

The first version should keep rotations out of the block rules. Blocks and groups stay axis-aligned. Camera rotation is allowed, but block rotation is not needed for cube-to-cube grid snapping.

## Model

The pure game model should store serializable state only:

- `blocks`: block records keyed by stable `id`.
- `groups`: connected component summaries keyed by stable `groupId`.
- `selectedBlockId`: the currently picked block, if any.
- `hoverSnap`: the current candidate snap target, if any.
- `mode`: `move` or `detach`.
- `nextBlockId` and `nextGroupId`.

Each block stores:

- `id`
- `groupId`
- `local`: integer grid coordinate inside its group.
- `world`: world-space integer coordinate used when the group is settled.

Each group stores:

- `id`
- `blockIds`
- `origin`: world-space grid coordinate for the group's local `(0, 0, 0)`.
- `colorKey`: derived from group size, not independently edited.

During pointer drag, the runtime can hold transient floating positions in Three.js objects. The Foldkit model should only be updated when selection, snap candidates, attachments, detachments, reset, or add-block actions happen.

## Group Color Coding

Color should be deterministic from connected group size:

- 1 block: warm yellow
- 2 blocks: coral
- 3 blocks: green
- 4 blocks: cyan
- 5 blocks: blue
- 6 blocks: violet
- 7 or more blocks: magenta/pink

All blocks in a connected group share the group color. When a group splits, each resulting component gets recolored from its new size. When groups merge, the merged group gets recolored immediately.

This color rule teaches connectedness without needing labels.

## Attachment Algorithm

The runtime should evaluate snap candidates while dragging:

1. Raycast the pointer into the scene and move the selected block or selected group along a drag plane.
2. For each exposed face on non-dragged target groups, compute the world position of the face center.
3. For each compatible face on the dragged group, compute its world face center.
4. Find the closest opposing face pair within `SNAP_DISTANCE`, initially `0.35` cube units.
5. Convert that face pair into an integer translation for the dragged group.
6. Reject candidates that would overlap target group cells.
7. Store the best candidate as `hoverSnap`.

On pointer release, if `hoverSnap` exists, merge the dragged group into the target group:

- Translate every dragged block into the target group's local grid.
- Reassign those blocks to the target `groupId`.
- Delete the old dragged group.
- Recompute the merged group's `blockIds` and color.

If there is no candidate, the group settles at its current rounded world grid position.

## Detach Algorithm

The simplest child-friendly detach interaction is a toggle:

- In move mode, dragging a block moves its whole connected group.
- In detach mode, clicking a block removes that block from its current group and starts dragging it as a new one-block group.

After a block is removed, the remaining blocks may split into multiple connected components. The pure domain function should:

1. Remove the block from its group.
2. Run a flood fill over the remaining blocks using the six face-neighbor offsets.
3. Create one new group for each connected component.
4. Normalize each component's local coordinates around a stable origin.
5. Recolor every new group by size.

This gives a clear "pull apart" mechanic without needing spring physics or brittle force thresholds.

## Three.js Runtime

Three.js should live in an imperative runtime module, likely `src/games/blockBuilderRuntime.ts`, mounted by the game view. The runtime owns:

- `Scene`, `PerspectiveCamera`, `WebGLRenderer`, lights, shadows, and resize handling.
- Cube meshes and edge outlines.
- Raycaster-based pointer picking.
- Drag planes and pointer capture.
- Orbit controls or a small local equivalent with constrained camera movement.
- Animation loop and cleanup on unmount.

The Foldkit view should render a stable host element, for example:

- `.block-builder-page`
- `.block-builder-stage`
- `.block-builder-toolbar`

The mounted runtime should receive the current model through data or an update bridge and emit Foldkit messages for game events. Avoid storing source-of-truth gameplay state only inside Three.js objects.

## Messages

Game-local messages should be small and domain-oriented:

- `ClickedReset`
- `ClickedAddBlock`
- `SetMode({ mode })`
- `SelectedBlock({ blockId })`
- `HoveredSnap({ snap })`
- `ReleasedSelection({ settlement })`
- `DetachedBlock({ blockId })`

The exact pointer movement messages do not need to pass through Foldkit on every frame. The runtime can animate drag movement locally and send semantic messages when state changes.

## View

The view should keep controls minimal:

- Icon button for add block.
- Icon button for reset.
- Segmented or toggle control for move/detach mode.
- Small group count or block count display.

The 3D scene should be the main surface, not a preview inside a card. Controls can sit in a compact overlay or a top toolbar. On mobile, controls should remain reachable without covering the central build area.

## Styling

`src/styles/blockBuilder.css` should define:

- A responsive full-height play area.
- A canvas host with stable dimensions and no layout shift.
- Compact toolbar controls.
- High-contrast focus states.
- A restrained background so group colors remain readable.

Avoid a one-color palette. The neutral scene background, grid floor, and varied group colors should do most of the visual work.

## App Integration

Implementation will need:

- Add `three` as a dependency.
- Add `src/games/blockBuilder.ts`.
- Add `src/games/blockBuilderRuntime.ts`.
- Add `src/styles/blockBuilder.css` and import it from `src/styles.css`.
- Add `PageBlockBuilder` to `src/route.ts`.
- Add the nested model and message delegation in `src/main.ts`.
- Add a landing-page game card, likely with a block/cube emoji.
- Add i18n keys for the title, controls, and mode labels.

Persisted settings are probably unnecessary for version one. Gameplay state should reset on app load unless a later version adds saved builds.

## Tests

Pure tests should focus on the grid domain:

- Initial model creates separate one-block groups.
- Adjacent block merge creates one group and recolors by size.
- Merge rejects overlapping target cells.
- Merge supports every face direction.
- Detaching one block creates a one-block group.
- Detaching a bridge block splits the old group into multiple groups.
- Group color keys update after merge and split.
- Add block creates a stable id and a new one-block group.
- Reset returns to the default scene.

Runtime tests can stay lighter:

- The view renders the stage host and toolbar controls.
- The runtime cleanup removes listeners, disposes renderer resources, and cancels animation frames.
- A Playwright or browser-level smoke test confirms the canvas renders nonblank pixels once Three.js is wired in.

## Implementation Sequence

1. Add the dependency and domain model with pure grid helpers.
2. Test merge, overlap, group-color, and detach behavior before rendering.
3. Wire the game into route, root model, landing page, i18n, and styles.
4. Build the Three.js runtime with static block rendering first.
5. Add picking and group dragging.
6. Add snap previews and release-to-attach.
7. Add detach mode and connected-component splitting.
8. Verify desktop and mobile rendering with screenshots and a nonblank-canvas check.

## Open Decisions

- Starting scene: use 6 loose blocks in a shallow arc, or 4 loose blocks plus one prebuilt two-block group.
- Camera control: use `OrbitControls` from Three.js examples, or implement a tiny local orbit controller to avoid extra example imports.
- Add-block placement: place new blocks at the first empty grid cell near the camera target, or drop them onto a visible spawn pad.
- Detach affordance: keep the explicit mode toggle, or later allow long-press to detach on touch devices.
