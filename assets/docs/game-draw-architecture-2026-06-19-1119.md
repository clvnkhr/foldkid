# Draw Game Architecture

Timestamp: 2026-06-19 11:19 Europe/London

Source: `src/games/draw.ts`

Draw is the app's most domain-heavy game. It asks the child to draw a number, letter, or pair, then recognizes the canvas through either a bundled LeNet EMNIST model or a local template matcher.

## Model

The model stores:

- Prompt/scoring: `target`, `round`, `score`, `success`.
- Recognition output: `lastGuess`, `lastConfidence`, `lastPredictions`, `debugImages`, `lastBoardImage`, `winningImage`.
- Settings: `topN`, `recognitionMode`, `targetOrderMode`, `freeMode`.
- Target pool toggles: `includeSingle`, `includePairs`, `includeNumbers`, `includeLetters`.
- Drawing controls: `inkColor`, `brushSize`, `clearCount`.

`clearCount` is a remount signal for clearing the canvas.

## Target Pool Design

Targets come from:

- Single digits and model-supported letters.
- Number pairs.
- Letter pairs.

`targetPoolFor` derives the active pool from the four include flags. If all categories are disabled, it falls back to all targets so the game never has an empty prompt set.

Ordered mode starts with `0-9`, then `10-99`, then uppercase letters, then uppercase pairs, with remaining supported targets appended afterward. Shuffle mode picks random targets.

## Recognition Modes

`recognitionMode` is either:

- `model`: local LeNet-5 EMNIST weights from `public/models/lenet-5-emnist-balanced/`.
- `template`: canvas-rendered glyph templates compared by distance.

The model files are cached in localStorage under `foldkid-draw-lenet-cache-v1`, with a version string based on manifest/weights URLs and labels.

## Recognition Pipeline

The recognizer:

1. Captures the raw board.
2. Finds ink bounds from alpha data.
3. Detects a left/right split for pair targets when a significant blank column separates ink regions.
4. Crops and centers either the full drawing or both split components.
5. Normalizes each crop to a 28x28 grid.
6. Runs model or template prediction.
7. Returns `BoardRecognized` with predictions and debug images.

Pair recognition can succeed either through split component predictions or through a combined top-N prediction.

## Matching Rules

A target succeeds if it appears within `topN`. Near-match groups deliberately accept visually similar characters:

- `l`, `I`, `1`
- `o`, `O`, `0`

Free mode does not score; it displays the recognizer's best guess and predictions regardless of target.

Stale async recognitions are ignored if their target or mode does not match the current model.

## View and Canvas Runtime

The view renders controls for prompt/free mode, top-N, recognition mode, target order, target-pool toggles, ink color, brush size, and recognition debug output.

The drawing surface is a mounted canvas runtime. It owns pointer drawing and emits recognizer commands on submit. This keeps raw canvas operations outside the pure update logic.

## Tests

`src/games/draw.test.ts` focuses on pure domain behavior:

- Target pool composition and ordering.
- Top-N, ink color, and brush-size normalization.
- Pool repair when settings exclude the current target.
- Recognition command creation.
- Top-N success/failure.
- Near-match acceptance.
- Pair-component matching.
- Stale recognition rejection.
- Free-mode behavior.
- Reprocessing when recognition mode changes and a board image exists.

