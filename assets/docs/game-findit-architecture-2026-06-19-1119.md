# Find It Game Architecture

Timestamp: 2026-06-19 11:19 Europe/London

Source: `src/games/findit.ts`

Find It is an emoji search and collection game. It supports normal target-finding, "any wins" mode, voice prompts, single emoji mode, pair mode, enabled emoji packs, collection drag reorder, grid reorder, and localized emoji names.

## Model

The model stores:

- `grid`: nine `EmojiCell` entries.
- `target`: the emoji or emoji pair to find.
- `count`: completed rounds.
- `won`, `found`: win state and collection history.
- `anyWins`, `voiceMode`, `pairsMode`, `enabledPacks`: configurable rules.
- `wrongCount`, `hintId`, `shaking`, `shakeTick`: feedback after wrong guesses.
- `tooltipEmoji`, `dragIndex`, `gridDragIndex`: collection and grid UI state.

## Generation

`generateGame` builds a nine-cell grid from enabled emoji packs and selects a target from that grid.

`generatePairsGame` builds pair targets by combining emoji graphemes. It guarantees the target appears in the grid and adds reversed/candidate pairs when possible.

`normalizeEmojiPackKeys` prevents empty or invalid pack sets. The update also refuses to disable the last remaining pack.

## Update Design

Correct target click:

- Sets `won`.
- Adds the clicked emoji to `found`.
- Clears wrong-count and hint state.
- Emits boing and speech commands unless muted.

Wrong target click:

- Sets the shaking cell.
- Increments `wrongCount`.
- Reveals `hintId` after three wrong guesses.

Next/reset regenerate the grid while preserving user mode flags. In voice mode, next/reset can speak "Where is ..." using localized emoji names.

Drag messages reorder either the found collection or the current grid. These are model-only operations with no commands.

## View

The view renders a prompt, replay button in voice mode, a 3x3 emoji grid, a win overlay, the found collection, reset, and emoji-name tooltip.

Keys combine cell id and shake tick so a wrong-cell shake can retrigger visibly.

## Localization

`emojiName` handles single graphemes and pairs. Single emoji names come from localized arrays keyed by language. Pairs are segmented with `Intl.Segmenter` and names are joined.

The invariant test ensures every localized emoji-name table matches `EMOJI_COUNT`.

## Tests

`src/games/findit.test.ts` covers:

- Valid game generation for all pack combinations.
- Single and pair modes.
- Correct/wrong click behavior.
- Hint reveal and clearing.
- Any-wins mode.
- Voice prompt command behavior.
- Collection/grid reorder.
- Scene rendering and interaction.

