# Memory Cards Game Architecture

Timestamp: 2026-06-20 23:06 Europe/London

Source: `src/games/memory.ts`

Memory Cards is a classic pair-matching game built as a small Foldkit module. It reuses Find It's emoji pack data, generates a shuffled deck of twelve cards, tracks attempts and matched pairs, and exposes per-game emoji-pack settings from the shared settings overlay.

## Model

The model stores:

- `deck`: twelve `MemoryCard` entries, built from six emoji pairs.
- `flippedIds`: currently face-up, unmatched picks.
- `attempts`: completed two-card guesses.
- `won`: true when every card is matched.
- `enabledPacks`: Find It emoji pack keys used to build the deck.

Each card stores `id`, `pairId`, `value`, `flipped`, and `matched`. `id` is assigned after shuffling so the rendered keys and click messages remain stable for the generated deck. `pairId` identifies the two cards that belong together.

## Generation

`buildDeck` normalizes around the shared Find It emoji pool:

- It gets candidate emoji with `FindIt.emojiPoolForPacks`.
- It shuffles that pool and takes `PAIR_COUNT`, currently six.
- It duplicates each selected emoji into a pair.
- It shuffles the twelve cards again.
- It assigns sequential ids and starts every card face down and unmatched.

`init` creates a fresh deck, clears attempts and win state, and stores normalized emoji pack keys. The default pack set comes from `FindIt.DEFAULT_EMOJI_PACK_KEYS`.

## Update Design

Card clicks are pure model updates and emit no commands.

Before a new pick is handled, `closeUnmatchedFlips` closes a previously visible mismatch. This means two wrong cards remain visible until the child chooses another card, avoiding a timer-driven command or animation dependency.

Clicking a card:

- No-ops if the game is already won.
- No-ops if the card id is missing, already flipped, or already matched.
- Flips the picked card.
- Counts an attempt once two cards are face up.
- Marks both cards as matched when their `pairId` values match.
- Clears `flippedIds` after a successful match.
- Sets `won` once the whole deck is matched.

Reset calls `init(model.enabledPacks)`, preserving the chosen emoji packs while starting a new shuffled game.

Emoji-pack changes use `FindIt.normalizeEmojiPackKeys`. Disabling the final enabled pack is rejected, and any real pack change regenerates the deck immediately.

## View

The view renders:

- A page wrapper with `memory-page`.
- A `card memory-card` container.
- The localized title.
- Attempts and matched-pair stats.
- A responsive card grid.
- A localized win message when complete.
- A reset button.

Cards are buttons. Face-down cards render `?`; flipped or matched cards render their emoji value. Matched cards are disabled so they cannot be picked again. The `aria-label` is the hidden game title for face-down cards and the emoji value for visible cards.

## Styling

`src/styles/memory.css` keeps the game compact:

- Desktop uses a four-column grid for twelve cards.
- Small screens switch to three columns.
- Tiles have a fixed square aspect ratio.
- Face-down cards use a blue/teal gradient.
- Flipped and matched cards use the shared cell background.
- Matched cards are dimmed and outlined with a green success ring.

## App Integration

Memory Cards is available from the landing page as the `🃏` game card and routes through `PageMemory`.

The root model stores `memory: Memory.Model`. Root update delegates `MemoryClickedCard`, `MemoryClickedReset`, and `MemorySetEmojiPackEnabled` to `Memory.update`.

The settings overlay shows Memory-specific emoji pack buttons only while the Memory page is active. These controls reuse the Find It pack labels and samples.

Persisted settings include only `memoryEnabledPacks`. Deck order, flipped state, attempts, and win state are session state. Importing settings with memory packs creates a fresh Memory model from those packs.

## Localization

The game uses shared i18n keys for:

- `memoryCardsTitle`
- `memoryAttempts`
- `memoryMatched`
- `memoryYouWon`
- `pageTitleMemoryCards`
- `reset`
- Find It emoji-pack labels in settings

## Tests

`src/games/memory.test.ts` covers:

- Initial deck size, pair count, face-down state, and default packs.
- Matching pair behavior and attempt counting.
- Mismatched cards staying visible until the next pick.
- Win detection and reset behavior.
- Deck generation from selected emoji packs.
- Emoji-pack setting changes and prevention of disabling the last pack.
- Shuffled generated card order.

Root tests also cover settings export/import for `memoryEnabledPacks` and confirm imported decks are rebuilt from the selected pack pool.
