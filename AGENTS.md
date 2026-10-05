# FoldKid repo rules

## Repo

- Scope: whole repo; nearer `AGENTS.md` wins. App=root npm project; app work in `src/`, `public/`, `scripts/`.
- `packages/effect/`, `packages/foldkit/` = vendored refs, never app imports/edits. Explicit package task: use its nested rules/package manager.
- Canon=current app code/tests, not newer/stricter vendored templates. npm + preserve lockfile; strict TS, ESM, Vite, Effect 4, Foldkit; CI Node 22.
- Start: `git status --short` + relevant diff. Preserve dirty/unrelated user work; no reset, overwrite, broad format.
- Read analogous game/test/CSS/root wiring. Refs: RPS=compact; ShapeWorkshop/GrowingNumbers=i18n speech, async tokens, animation fallback, status a11y; MusicBox=domain/runtime extraction; TalkingClock/Counter/MagneticBlocks=imperative mounts.
- This guide beats legacy inconsistencies. Improve touched code only. Smallest coherent implementation+root+i18n+CSS+tests change; never half-wire.

## Architecture

- One Elm/Foldkit app. `src/entry.ts` only wires/runs Model/init/update/view/subscriptions/devtools; no runtime boot in importable game/test module.
- Nav=root model, not URLs: pages `src/route.ts`, nav msgs `src/message.ts`, `src/main.ts` changes `model.page`. Children init once; nav keeps state. Reset/on-entry work explicit.
- Game contract: `Model = S.Struct(...)` + inferred type; `m(...)` constructors; `Message = S.Union([...])` + type; `init`; pure `update`; `view`.
- Tags globally unique, full game prefix, preferably facts; root matches literals. Update exactly `readonly [Model, ReadonlyArray<Command.Command<Message>>]`; dispatch `M.value` + `M.withReturnType` + `M.tagsExhaustive`.
- `update`: deterministic, immutable model+Commands; no DOM/timer/storage/audio/speech/global read/mutation. `view`: local `const h = html<Message>()`; `h.Key` for token/revision/structural identity replacement.
- Simple game=one module; extract testable domain/runtime/catalogue when complex. Language/mute/speech rate+pitch/app settings=root-owned, explicitly passed update/view; no game copies or accidental `main.ts` defaults.

## Effects / async / DOM

- Update one-shot effect => stable/specific named Command (name=test API) => typed msg. Catch fallible Effect to `Failed*`/safe completion. No `NoOp`; explicit handled ack/result, e.g. `SoundPlayed`, `PieceFlightFinished`.
- Long-lived resource => `OnMount`/subscription; only sync exception=`warmAudio()` in trusted gesture. Own/release every listener, observer, timer, RAF, capture, generated node on unmount/interruption.
- `update` rejects invalid/range/duplicate/locked/post-complete msgs; handlers aren't trust boundaries. Async surviving reset/replay/nav/new request gets token/playback ID + validation context; increment to invalidate, ignore stale result.
- Newly rendered DOM query/measure: await `Render.afterCommit`. Animation must semantically finish under reduced motion, missing DOM, zero geometry, unsupported API, missing event/error; immediate + timeout/error fallback as needed. Reduced motion in TS+CSS; same result/end state.
- Avoid stale mount closures: args or observed/read `data-*`; geometry => `ResizeObserver`. High-rate paint/physics may mutate scoped runtime/transforms; semantic state via msgs, never second persistent app model.
- Transient overlay: `aria-hidden`, pointerless, token/revision-keyed, removed success/interruption/error.

## Audio / input

- Shared `src/audio.ts`/`src/speech.ts` only; no second general `AudioContext`. Sound game accepts needed `language`, `muted`, `SpeechOptions`; pass `{ ...speech, lang: language }` unless explicitly teaching spoken English.
- Mute gates incidental feedback/narration/auto announcements, not state/visuals. Core-audio exception only if sound=activity and explicit in root/tests; MusicBox currently exempt.
- iOS unlock/resume only in click, `keydown`/keyboard activation, `pointerup`, `touchend`; never trust touch `pointerdown`/`touchstart`. Async Foldkit dispatch: sync `warmAudio()` in qualifying handler before msg.
- Already-unlocked latency control may play on down only w/ explicit warm-up+tested iOS fallback. Pointerdown may start drag/draw/hold; sound/speech after successful qualifying release; handle `pointercancel`; dedupe touch+click.
- Missing/rejected audio/speech API: Command still resolves.

## i18n / a11y

- Every visible UI/status/title/general speech in `src/i18n.ts`; every key/formatter in all 8 dicts; exact parity. `t`=string, `tf`=locale grammar; no English-order fragment concat.
- Phrase numbers/lists: `Intl.NumberFormat`/`Intl.ListFormat`; math-order equation/count: `dir="ltr"`.
- Action=native `h.button`, prefer click; pointer-only also Enter/Space. Icon-only gets localized name; selection/mode `aria-pressed`; unavailable `disabled`; related controls labeled group.
- Feedback `role="status"`+`aria-live="polite"`; pending lock `aria-busy`. Decorative SVG/emoji/animation hidden; SVG `focusable="false"`. Visible `:focus-visible`; never color/motion/sound-only feedback.

## New game checklist

1. Module + focused tests + game-prefixed CSS.
2. `ClickedGame` in `src/message.ts`; `PageGame` declaration + `Page` union in `src/route.ts`.
3. Nav type + `src/pages/landing.ts::LANDING_GAMES` card; append only. Persisted indices: insert/reorder requires stable-ID migration.
4. `src/main.ts`: import; child Model/init; every child msg in root schema; update delegator; nav + every literal-tag handler; localized page title; view branch.
5. Explicitly forward root language/mute/speech; all game/page/UI/status/speech keys in every locale; CSS import in import-only `src/styles.css`.
6. Extend `src/pages/landing.test.ts`, root nav/delegation tests, `src/invariants.test.ts` initial model + malformed nested msg.
7. Preferences => full persistence checklist.
8. `LANDING_GAME_COUNT` derived: audit indexed order/visibility; >=1 visible. Append keeps index meaning but current length check resets saved custom order; preserving order needs normalize/migrate by appending missing indices.

## Persistence / external data

- Preferences only; no transient play state.
- Each setting wires `PersistedSettingsSchema`, load/init normalization, `buildSettingsData`, `applyImportData`, settings UI, `PERSISTED_SETTINGS_MESSAGE_TAGS`.
- Optional only additive/legacy persisted fields; live model explicit. Effect-Schema decode unknown storage/import, then semantic normalize finite/range, unique indices, catalogue members, >=1 visible.
- Compatible optional add: keep `SETTINGS_VERSION`; incompatible export/schema: deliberate bump + version/migration tests.
- Changing msg tag => `PERSISTED_SETTINGS_MESSAGE_TAGS` (auto-save+type), no manual duplicate persist. Test round-trip/invalid/legacy/tag classification/export/import; invalid import never partial-mutates.
- Positional catalogue, esp. `LANDING_GAMES`: migration/stable IDs, else old valid index may mean wrong item.

## CSS / mobile

- `src/styles.css`=imports only; rules in namespaced page/game CSS. Reuse base vars; cover light/dark, narrow, fixed-nav clearance, dynamic viewport/safe area, long translations.
- Default `touch-action: manipulation`; `none` only real drag/draw/play, cancellation + capture where reliable; preserve/test native touch fallback for WebKit capture bugs. Scroll: `pan-y`, contained overscroll, momentum.
- Flexible grid/wrap+`clamp()` over fixed desktop geometry; inspect existing 480–560px breakpoints first.
- `src/styles.test.ts` guards orphan selectors, unused keyframes, budgets, layout/touch; dynamic-only class => intentional `generatedClassNames`.
- Per-game max 600 lines/13,000 bytes/3,500 gzip. Don't raise to pass; justify/test growth. Style invariant=behavior, not arbitrary text; string tests != browser/device inspection.

## Tests / handoff

- Colocate `src/**/*.test.ts`; Vitest/`happy-dom`. Direct assertions for pure helper/domain/catalogue.
- Update sequence: `Story.story`; assert Command name/order, resolve every result via `Story.Command.resolve`/`resolveAll`, end `Story.Command.expectNone()`.
- Mounted view/a11y: `Scene.scene`; role/label/text queries; check disabled/pressed/busy/live; resolve mount Commands first.
- Browser effect, exact speech text/options, cleanup/fallback: `Effect.runPromise(command.effect)`; minimal mocks; restore globals/timers/listeners/DOM/fibers in hook/`finally`.
- Cover happy + relevant malformed/range/repeat, touch-click duplicate, pointer cancel, locked/post-complete, stale, reset/nav, mute, missing API, reduced motion, effect failure.
- Change map: schema/catalogue=>`src/invariants.test.ts`; i18n=>`src/i18n.test.ts`; CSS=>`src/styles.test.ts`; root/persistence=>`src/main.test.ts`.
- Iterate `npm test -- src/games/counter.test.ts`. App handoff: `npm test` + `npm run build` (build excludes tests). Docs-only: diff/format enough. Report required check skipped.
- Touch/layout/audio/Safari: `npm run mobile -- --port <port>`=LAN/real device; `npm run test:safari` (macOS opt-in, drives Safari, needs Develop > Allow JavaScript from Apple Events). Smoke != visual/mobile coverage: manually check trusted audio gesture, scroll/reachability, drag/cancel, narrow, light/dark, long/RTL locale, reduced motion, mute; report omissions.
