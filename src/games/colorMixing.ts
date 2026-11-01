import { Effect, Match as M, Schema as S } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { chime } from '../audio'
import { t, type StringKey } from '../i18n'
import { speakNow, type SpeechOptions } from '../speech'
import { COLOR_NAMES, DEFAULT_SEED, INKS, RECIPES, hex, makePuzzle, mix, type ColorName, type RGB } from './colorMixingDomain'

export const Length = S.Literals([2, 3])
const Color = S.Struct({ rgb: S.Tuple([S.Number, S.Number, S.Number]), name: S.Literals(COLOR_NAMES) })
export const Model = S.Struct({ length: Length, recipe: S.Number, choices: S.Array(Color), answer: S.Number, seed: S.Number, round: S.Number, token: S.Number, status: S.Literals(['matching', 'revealed']), wrong: S.Number, seeded: S.Boolean, seeding: S.Boolean })
export type Model = typeof Model.Type
export const Entered = m('ColorMixingEntered')
export const Seeded = m('ColorMixingSeeded', { seed: S.Number, token: S.Number })
export const SetLength = m('ColorMixingSetLength', { length: Length })
export const Pick = m('ColorMixingPick', { index: S.Number, round: S.Number, token: S.Number })
export const RoundReady = m('ColorMixingRoundReady', { round: S.Number, token: S.Number })
export const Message = S.Union([Entered, Seeded, SetLength, Pick, RoundReady])
export type Message = typeof Message.Type
export const init = (): Model => ({ ...makePuzzle(DEFAULT_SEED, 2), length: 2, round: 0, token: 0, status: 'matching', wrong: -1, seeded: false, seeding: false })
const nextRound = (model: Model): Model => ({ ...model, ...makePuzzle(model.seed, model.length, model.recipe), round: model.round + 1, token: model.token + 1, status: 'matching', wrong: -1 })
export const interrupt = (model: Model): Model => model.status === 'revealed' ? nextRound(model) : { ...model, token: model.token + 1, seeding: false }
const keys: Record<ColorName, StringKey> = {
  pink: 'colorMixingPink', apricot: 'colorMixingApricot', paleYellow: 'colorMixingPaleYellow', paleChartreuse: 'colorMixingPaleChartreuse', paleGreen: 'colorMixingPaleGreen', mint: 'colorMixingMint', paleCyan: 'colorMixingPaleCyan', lightAzure: 'colorMixingLightAzure', periwinkle: 'colorMixingPeriwinkle', lilac: 'colorMixingLilac', paleMagenta: 'colorMixingPaleMagenta', rosePink: 'colorMixingRosePink',
  red: 'colorMixingRed', orange: 'colorMixingOrange', brown: 'colorMixingBrown', yellow: 'colorMixingYellow', olive: 'colorMixingOlive', chartreuse: 'colorMixingChartreuse', green: 'colorMixingGreen', emerald: 'colorMixingEmerald', cyan: 'colorMixingCyan', teal: 'colorMixingTeal', azure: 'colorMixingAzure', blue: 'colorMixingBlue', navy: 'colorMixingNavy', violet: 'colorMixingViolet', purple: 'colorMixingPurple', magenta: 'colorMixingMagenta', rose: 'colorMixingRose', maroon: 'colorMixingMaroon', black: 'colorMixingBlack', gray: 'colorMixingGray',
}
const colorName = (name: string, language: string): string => t(keys[name as ColorName] ?? 'colorMixingGray', language)
const valid = (value: number): boolean => Number.isSafeInteger(value) && value >= 0
const current = (model: Model, msg: { readonly round: number; readonly token: number }): boolean => valid(msg.round) && valid(msg.token) && msg.round === model.round && msg.token === model.token
const mounted = (model: Model): boolean => typeof document !== 'undefined' && document.querySelector<HTMLElement>('.color-mixing-card')?.dataset.revision === `${model.round}-${model.token}`
export const update = (model: Model, message: Message, language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    ColorMixingEntered: () => {
      if (model.seeded || model.seeding) return [model, []]
      const next = { ...model, seeding: true, token: model.token + 1 }
      return [next, [{ name: 'ColorMixingSeed', effect: Effect.sync(() => Seeded({ seed: Math.floor(Math.random() * 0x100000000), token: next.token })) }]]
    },
    ColorMixingSeeded: msg => model.seeding && msg.token === model.token && valid(msg.seed) && msg.seed <= 0xffffffff
      ? [{ ...model, ...makePuzzle(msg.seed, model.length), seeded: true, seeding: false, token: model.token + 1 }, []] : [model, []],
    ColorMixingSetLength: msg => {
      if (!S.is(Length)(msg.length) || msg.length === model.length) return [model, []]
      const next = nextRound({ ...model, length: msg.length, seeding: !model.seeded })
      return model.seeded ? [next, []] : [next, [{ name: 'ColorMixingSeed', effect: Effect.sync(() => Seeded({ seed: Math.floor(Math.random() * 0x100000000), token: next.token })) }]]
    },
    ColorMixingPick: msg => {
      if (!current(model, msg) || model.status !== 'matching' || model.seeding || !valid(msg.index) || msg.index >= model.choices.length) return [model, []]
      if (msg.index !== model.answer) return [{ ...model, wrong: msg.index }, []]
      const next: Model = { ...model, status: 'revealed', wrong: -1, token: model.token + 1 }
      const done = RoundReady({ round: next.round, token: next.token })
      return [next, [{ name: 'ColorMixingCelebrate', effect: Effect.gen(function* () {
        yield* Render.afterCommit
        if (!muted && mounted(next)) {
          yield* chime(done).effect.pipe(Effect.catchCause(() => Effect.succeed(done)))
          yield* Effect.sync(() => { if (mounted(next)) speakNow(colorName(next.choices[next.answer]!.name, language), { ...speech, lang: language }) })
        }
        const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        yield* Effect.sleep(reduced ? 350 : 1100)
        return done
      }).pipe(Effect.catchCause(() => Effect.succeed(done))) }]]
    },
    ColorMixingRoundReady: msg => current(model, msg) && model.status === 'revealed' ? [nextRound(model), []] : [model, []],
  }))

export const view = (model: Model, language: string) => {
  const h = html<Message>()
  const recipe = RECIPES[model.length][model.recipe] ?? RECIPES[model.length][0]!
  const positions = model.length === 2 ? [[112, 140], [188, 140]] : [[112, 112], [188, 112], [150, 178]]
  const circle = (index: number, color: string) => h.circle([h.Attribute('cx', String(positions[index]![0])), h.Attribute('cy', String(positions[index]![1])), h.Attribute('r', '78'), h.Fill(color)], [])
  const clip = (indices: readonly number[], node: ReturnType<typeof circle>): ReturnType<typeof circle> => indices.reduceRight((child, index) => h.g([h.Attribute('clip-path', `url(#color-mixing-clip-${index})`)], [child]), node)
  const lightKeys: readonly StringKey[] = ['colorMixingLightRed', 'colorMixingLightGreen', 'colorMixingLightBlue', 'colorMixingLightCyan', 'colorMixingLightMagenta', 'colorMixingLightYellow']
  const sourceNames = recipe.sources.map(index => index >= 12 ? t(lightKeys[index - 12]!, language) : colorName(INKS[index]!.name, language))
  const revealed = model.status === 'revealed'
  return h.div([h.Class('page color-mixing-page')], [h.div([h.Class('card color-mixing-card'), h.Attribute('data-revision', `${model.round}-${model.token}`), h.Attribute('aria-busy', String(model.seeding || revealed))], [
    h.h1([h.Class('title')], [t('colorMixingTitle', language)]),
    h.div([h.Class('color-mixing-settings'), h.Role('group'), h.Attribute('aria-label', t('colorMixingCount', language))], ([2, 3] as const).map(length => h.button([h.Class('color-mixing-mode'), h.Attribute('type', 'button'), h.Attribute('aria-pressed', String(model.length === length)), h.OnClick(SetLength({ length }))], [t(length === 2 ? 'colorMixingTwo' : 'colorMixingThree', language)]))),
    h.p([h.Class('color-mixing-kind')], [t('colorMixingInks', language)]),
    h.div([h.Class(`color-mixing-diagram${revealed ? ' color-mixing-diagram--revealed' : ''}`), h.Key(`mixture-${model.round}-${model.length}`)], [
      h.svg([h.ViewBox('0 0 300 280'), h.Role('img'), h.Attribute('aria-label', t('colorMixingDiagram', language)), h.Attribute('focusable', 'false')], [
        h.defs([], positions.map((_, index) => h.clipPath([h.Id(`color-mixing-clip-${index}`)], [circle(index, '#fff')]))),
        ...recipe.sources.map((ink, index) => circle(index, hex(INKS[ink]!.rgb))),
        ...recipe.sources.flatMap((_, a) => recipe.sources.flatMap((__, b) => b > a ? [h.g([h.Attribute('data-color-mixing-pair', `${a}-${b}`)], [clip([a], circle(b, hex(mix([INKS[recipe.sources[a]!]!.rgb, INKS[recipe.sources[b]!]!.rgb]))))])] : [])),
        h.g([h.Attribute('data-color-mixing-common', 'true')], [clip(recipe.sources.slice(0, -1).map((_, index) => index), circle(model.length - 1, revealed ? hex(recipe.result.rgb) : 'var(--card-bg)'))]),
      ]),
      ...(!revealed ? [h.span([h.Class('color-mixing-missing'), h.AriaHidden(true)], ['?'])] : [h.span([h.Class('color-mixing-missing color-mixing-check'), h.AriaHidden(true)], ['✓'])]),
    ]),
    h.ul([h.Class('color-mixing-sources')], sourceNames.map((name, index) => h.li([], [h.span([h.Class('color-mixing-dot'), h.Style({ background: hex(INKS[recipe.sources[index]!]!.rgb) }), h.AriaHidden(true)], []), name]))),
    h.p([h.Class('color-mixing-status'), h.Role('status'), h.Attribute('aria-live', 'polite')], [revealed ? colorName(recipe.result.name, language) : t(model.wrong >= 0 ? 'colorMixingTryAgain' : 'colorMixingQuestion', language)]),
    h.div([h.Class('color-mixing-choices')], model.choices.map((choice, index) => h.button([
      h.Class(`color-mixing-choice${revealed && index === model.answer ? ' color-mixing-choice--correct' : model.wrong === index ? ' color-mixing-choice--wrong' : ''}`), h.Attribute('type', 'button'), h.Disabled(revealed || model.seeding), h.Attribute('data-multitouch-revision', String(model.round)), h.OnClick(Pick({ index, round: model.round, token: model.token })),
    ], [h.span([h.Class('color-mixing-swatch'), h.Style({ background: hex(choice.rgb as RGB) }), h.AriaHidden(true)], []), h.span([], [colorName(choice.name, language)]), ...(revealed && index === model.answer ? [h.span([h.AriaHidden(true)], ['✓'])] : [])]))),
  ])])
}
