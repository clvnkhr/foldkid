import { Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command, Render } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { chime, click, pop } from '../audio'
import { normalizeLanguage, t, tf } from '../i18n'
import { speakNow, type SpeechOptions } from '../speech'
import { baseComponents, canonicalCharacter, CHARACTER_LAB_COMMON_RADICALS, CHARACTER_LAB_PALETTE, characterColors, characterComponentCount, characterHash, isCharacterLabCharacter, mergeGroupCandidates, radicalForms, selectCharacterCombiners, selectCharacterPalette } from './characterLabDomain'
import { createCharacterLabRuntime } from './characterLabRuntime'

export const MAX_CHARACTER_LAB_PIECES = 60
export const CHARACTER_LAB_PALETTE_PAGE_SIZE = 8
const dropChoices = [...CHARACTER_LAB_COMMON_RADICALS, ...CHARACTER_LAB_PALETTE]
const dropChoiceSet = new Set(dropChoices)
export const Piece = S.Struct({
  id: S.Number, character: S.String, atoms: S.Array(S.String), x: S.Number, y: S.Number,
  vx: S.Number, vy: S.Number, angle: S.Number, spin: S.Number, delay: S.Number,
})
export type Piece = typeof Piece.Type
const LastEvent = S.Struct({ kind: S.Literals(['merged', 'split']), first: S.String, second: S.String, result: S.String, parts: S.Array(S.String) })
const Pose = { x: S.Number, y: S.Number, vx: S.Number, vy: S.Number, angle: S.Number, revision: S.Number }
const PendingJoin = S.Struct({ request: S.Number, ids: S.Array(S.Number), ...Pose })
type PendingJoin = typeof PendingJoin.Type
export const Model = S.Struct({
  pieces: S.Array(Piece), nextId: S.Number, revision: S.Number, palettePage: S.Number,
  randomRequest: S.Number, merges: S.Number, lastEvent: S.NullOr(LastEvent), query: S.String,
  joining: S.Array(PendingJoin), joinRequest: S.Number,
})
export type Model = typeof Model.Type
export const DroppedCharacter = m('CharacterLabDroppedCharacter', { character: S.String })
export const NextPalette = m('CharacterLabNextPalette')
export const PreviousPalette = m('CharacterLabPreviousPalette')
export const ChangedSearch = m('CharacterLabChangedSearch', { query: S.String })
export const RequestedRandom = m('CharacterLabRequestedRandom')
export const RandomChosen = m('CharacterLabRandomChosen', { character: S.String, revision: S.Number, request: S.Number })
export const CollidedPieces = m('CharacterLabCollidedPieces', { firstId: S.Number, secondId: S.Number, ...Pose })
export const CollidedGroup = m('CharacterLabCollidedGroup', { ids: S.Array(S.Number), ...Pose })
export const JoinChosen = m('CharacterLabJoinChosen', { request: S.Number, revision: S.Number, character: S.String })
export const TappedPiece = m('CharacterLabTappedPiece', { id: S.Number, ...Pose })
export const Cleared = m('CharacterLabCleared')
export const SoundPlayed = m('CharacterLabSoundPlayed')
export const CharacterSpoken = m('CharacterLabCharacterSpoken')
export const Message = S.Union([DroppedCharacter, NextPalette, PreviousPalette, ChangedSearch, RequestedRandom, RandomChosen, CollidedPieces, CollidedGroup, JoinChosen, TappedPiece, Cleared, SoundPlayed, CharacterSpoken])
export type Message = typeof Message.Type

export const init = (): Model => ({ pieces: [], nextId: 0, revision: 0, palettePage: 0, randomRequest: 0, merges: 0, lastEvent: null, query: '', joining: [], joinRequest: 0 })
export const interrupt = (model: Model): Model => ({ ...model, revision: model.revision + 1, randomRequest: model.randomRequest + 1, joining: [], joinRequest: model.joinRequest + 1 })
export const materialCount = (model: Model): number => model.pieces.reduce((count, piece) => count + piece.atoms.length, 0)
const fits = (model: Model, character: string): boolean => {
  const count = characterComponentCount(character)
  return count > 0 && materialCount(model) + count <= MAX_CHARACTER_LAB_PIECES
}
const validId = (id: number): boolean => Number.isSafeInteger(id) && id >= 0
const validPose = (pose: { x: number; y: number; vx: number; vy: number; angle: number }): boolean =>
  [pose.x, pose.y, pose.vx, pose.vy, pose.angle].every(Number.isFinite) && pose.x >= 0 && pose.x <= 1 && pose.y >= 0 && pose.y <= 1 &&
  Math.abs(pose.vx) <= 6000 && Math.abs(pose.vy) <= 6000 && Math.abs(pose.angle) < 100000
const feedback = (kind: 'Drop' | 'Merge' | 'Split', character: string, muted: boolean, speech: SpeechOptions): ReadonlyArray<Command.Command<Message>> => muted ? [] : [
  { name: `CharacterLabPlay${kind}Sound`, effect: (kind === 'Merge' ? chime(SoundPlayed()) : kind === 'Split' ? pop(SoundPlayed()) : click(SoundPlayed())).effect
    .pipe(Effect.catchCause(() => Effect.succeed(SoundPlayed()))) },
  { name: 'CharacterLabSpeakCharacter', effect: Effect.sync(() => { speakNow(character, { ...speech, lang: 'zh-CN' }); return CharacterSpoken() })
    .pipe(Effect.catchCause(() => Effect.succeed(CharacterSpoken()))) },
]
const drop = (model: Model, input: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const character = canonicalCharacter(input)
  if (!isCharacterLabCharacter(character) || !fits(model, character) || !validId(model.nextId)) return [model, []]
  const id = model.nextId
  const hash = characterHash(`${character}:${id}`)
  const piece: Piece = {
    id, character, atoms: baseComponents(character), x: [.4, .5, .6, .45, .55][id % 5]!, y: .07,
    vx: (id % 2 === 0 ? 1 : -1) * (90 + id % 3 * 25), vy: 25,
    angle: (hash % 60 - 30) * Math.PI / 180, spin: (hash % 2 === 0 ? 1 : -1) * (1 + hash % 20 / 10), delay: 180,
  }
  return [{ ...model, pieces: [...model.pieces, piece], nextId: id + 1, lastEvent: null }, feedback('Drop', character, muted, speech)]
}

const chooseRandom = (choices: ReadonlyArray<string>): Effect.Effect<string> => Effect.sync(() => {
  const sample = Math.random()
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Invalid random sample')
  return choices[Math.floor(sample * choices.length)]!
}).pipe(Effect.catchCause(() => Effect.succeed(choices[0]!)))
const applyJoin = (model: Model, join: PendingJoin, character: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  const ids = new Set(join.ids)
  const ingredients = join.ids.map(id => model.pieces.find(piece => piece.id === id)!)
  const piece: Piece = {
    id: model.nextId, character, atoms: ingredients.flatMap(part => part.atoms).map(canonicalCharacter),
    x: join.x, y: join.y, vx: join.vx, vy: join.vy, angle: join.angle,
    spin: (characterHash(character) % 2 === 0 ? 1 : -1) * 1.4, delay: 180,
  }
  const parts = ingredients.map(part => canonicalCharacter(part.character))
  return [{ ...model, pieces: [...model.pieces.filter(part => !ids.has(part.id)), piece], nextId: model.nextId + 1,
    joining: model.joining.filter(pending => pending.request !== join.request), merges: model.merges + 1,
    lastEvent: { kind: 'merged', first: parts[0]!, second: parts[1]!, result: character, parts },
  }, feedback('Merge', character, muted, speech)]
}
const startJoin = (model: Model, join: Omit<PendingJoin, 'request'>, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] => {
  if (join.revision !== model.revision || !validPose(join) || join.ids.length < 2 || join.ids.length > MAX_CHARACTER_LAB_PIECES ||
    !join.ids.every(validId) || new Set(join.ids).size !== join.ids.length || !validId(model.nextId)) return [model, []]
  if (model.joining.some(pending => pending.ids.some(id => join.ids.includes(id)))) return [model, []]
  const ingredients = join.ids.map(id => model.pieces.find(piece => piece.id === id))
  if (ingredients.some(piece => !piece)) return [model, []]
  const choices = mergeGroupCandidates(ingredients.map(piece => piece!.character))
  if (choices.length === 0) return [model, []]
  const pending: PendingJoin = { request: model.joinRequest + 1, ids: [...join.ids], x: join.x, y: join.y,
    vx: join.vx, vy: join.vy, angle: join.angle, revision: join.revision }
  if (choices.length === 1) return applyJoin(model, pending, choices[0]!, muted, speech)
  return [{ ...model, joinRequest: pending.request, joining: [...model.joining, pending] }, [{ name: 'CharacterLabChooseJoin',
    effect: chooseRandom(choices).pipe(Effect.map(character => JoinChosen({ character, request: pending.request, revision: join.revision }))),
  }]]
}

export const update = (model: Model, message: Message, _language: string, muted: boolean, speech: SpeechOptions): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(), M.tagsExhaustive({
    CharacterLabDroppedCharacter: msg => drop(model, msg.character, muted, speech),
    CharacterLabNextPalette: () => {
      const pages = Math.ceil(selectCharacterPalette(model.query).length / CHARACTER_LAB_PALETTE_PAGE_SIZE)
      return pages > 1 ? [{ ...model, palettePage: (model.palettePage + 1) % pages }, []] : [model, []]
    },
    CharacterLabPreviousPalette: () => {
      const pages = Math.ceil(selectCharacterPalette(model.query).length / CHARACTER_LAB_PALETTE_PAGE_SIZE)
      return pages > 1 ? [{ ...model, palettePage: (model.palettePage + pages - 1) % pages }, []] : [model, []]
    },
    CharacterLabChangedSearch: msg => {
      const query = [...msg.query].slice(0, 64).join('')
      return query === model.query ? [model, []] : [{ ...model, query, palettePage: 0 }, []]
    },
    CharacterLabRequestedRandom: () => {
      const remaining = MAX_CHARACTER_LAB_PIECES - materialCount(model)
      if (remaining <= 0) return [model, []]
      const choices = dropChoices.filter(character => { const count = characterComponentCount(character); return count > 0 && count <= remaining })
      if (choices.length === 0) return [model, []]
      const request = model.randomRequest + 1
      const result = (character: string) => RandomChosen({ character, revision: model.revision, request })
      return [{ ...model, randomRequest: request }, [{ name: 'CharacterLabChooseRandom', effect: chooseRandom(choices).pipe(Effect.map(result)) }]]
    },
    CharacterLabRandomChosen: msg => msg.revision === model.revision && validId(msg.request) && msg.request > 0 && msg.request === model.randomRequest && dropChoiceSet.has(msg.character)
      ? drop({ ...model, randomRequest: model.randomRequest + 1 }, msg.character, muted, speech) : [model, []],
    CharacterLabCollidedPieces: msg => startJoin(model, { ...msg, ids: [msg.firstId, msg.secondId] }, muted, speech),
    CharacterLabCollidedGroup: msg => startJoin(model, msg, muted, speech),
    CharacterLabJoinChosen: msg => {
      if (msg.revision !== model.revision || !validId(msg.request)) return [model, []]
      const join = model.joining.find(pending => pending.request === msg.request)
      if (!join || join.revision !== msg.revision) return [model, []]
      const ingredients = join.ids.map(id => model.pieces.find(piece => piece.id === id))
      if (ingredients.some(piece => !piece) || !mergeGroupCandidates(ingredients.map(piece => piece!.character)).includes(msg.character)) return [model, []]
      return applyJoin(model, join, msg.character, muted, speech)
    },
    CharacterLabTappedPiece: msg => {
      if (msg.revision !== model.revision || !validId(msg.id) || !validPose(msg)) return [model, []]
      if (model.joining.some(join => join.ids.includes(msg.id))) return [model, []]
      const piece = model.pieces.find(piece => piece.id === msg.id)
      if (!piece || piece.atoms.length < 2) return [model, []]
      const parts = piece.atoms.map(canonicalCharacter)
      const count = parts.length
      const children = parts.map((character, index): Piece => {
        const direction = count === 2 ? (index === 0 ? -3 * Math.PI / 4 : -Math.PI / 4) : index * Math.PI * 2 / count - Math.PI / 2
        return {
          id: model.nextId + index, character, atoms: [character],
          x: Math.max(.04, Math.min(.96, msg.x + Math.cos(direction) * .065)), y: Math.max(.04, Math.min(.96, msg.y + Math.sin(direction) * .065)),
          vx: msg.vx * .25 + Math.cos(direction) * 340, vy: Math.min(0, msg.vy * .15) - 190 + Math.sin(direction) * 240,
          angle: msg.angle + direction * .16, spin: (index % 2 === 0 ? 1 : -1) * 3.5, delay: 1100,
        }
      })
      return [{ ...model, pieces: [...model.pieces.filter(current => current.id !== piece.id), ...children], nextId: model.nextId + children.length,
        lastEvent: { kind: 'split', first: piece.character, second: '', result: '', parts } }, feedback('Split', piece.character, muted, speech)]
    },
    CharacterLabCleared: () => model.pieces.length > 0 ? [{ ...interrupt(model), pieces: [], merges: 0, lastEvent: null }, []] : [model, []],
    CharacterLabSoundPlayed: () => [model, []],
    CharacterLabCharacterSpoken: () => [model, []],
  }))

export const mountCharacterLab = (element: Element): Stream.Stream<Message> => Stream.callback<Message>(queue => Effect.gen(function* () {
  yield* Render.afterCommit
  yield* Effect.acquireRelease(Effect.sync(() => createCharacterLabRuntime(element as HTMLElement, {
    collision: (firstId, secondId, x, y, vx, vy, angle, revision) => Queue.offerUnsafe(queue, CollidedPieces({ firstId, secondId, x, y, vx, vy, angle, revision })),
    groupCollision: (ids, x, y, vx, vy, angle, revision) => Queue.offerUnsafe(queue, CollidedGroup({ ids, x, y, vx, vy, angle, revision })),
    tapped: (id, revision, x, y, vx, vy, angle) => Queue.offerUnsafe(queue, TappedPiece({ id, revision, x, y, vx, vy, angle })),
  })), cleanup => Effect.sync(cleanup))
  return yield* Effect.never
}))

const colorVariables = (character: string): Record<string, string> => {
  const colors = characterColors(character)
  return { '--char-light-bg': colors.light.background, '--char-light-ink': colors.light.ink, '--char-light-border': colors.light.border,
    '--char-dark-bg': colors.dark.background, '--char-dark-ink': colors.dark.ink, '--char-dark-border': colors.dark.border }
}
export const view = (model: Model, language: string, _muted: boolean) => {
  const h = html<Message>()
  const number = new Intl.NumberFormat(normalizeLanguage(language))
  const start = model.palettePage * CHARACTER_LAB_PALETTE_PAGE_SIZE
  const palette = selectCharacterPalette(model.query)
  const canPage = palette.length > CHARACTER_LAB_PALETTE_PAGE_SIZE
  const remaining = MAX_CHARACTER_LAB_PIECES - materialCount(model)
  const available = remaining > 0 && dropChoices.some(character => characterComponentCount(character) <= remaining)
  const dropButton = (character: string) => {
    const forms = radicalForms(character)
    const relationship = forms.length > 0 ? tf('characterLabRadicalForms', language, character,
      new Intl.ListFormat(normalizeLanguage(language), { style: 'short', type: 'conjunction' }).format([...forms])) : ''
    return h.button([
      h.Class('character-lab-drop'), h.Key(`character-lab-drop-${character}`), h.Attribute('type', 'button'), h.Attribute('lang', 'zh-CN'),
      h.Attribute('aria-label', tf('characterLabDrop', language, character)), h.Attribute('aria-description', relationship), h.Attribute('title', relationship),
      h.Disabled(!fits(model, character)), h.Style(colorVariables(character)), h.OnClick(DroppedCharacter({ character })),
    ], [h.span([h.Class('character-lab-drop-glyph'), h.AriaHidden(true)], [character]),
      ...(forms.length > 0 ? [h.span([h.Class('character-lab-forms'), h.AriaHidden(true), h.Attribute('dir', 'ltr')], [forms[0]!])] : []),
    ])
  }
  const event = model.lastEvent
  const description = event?.kind === 'merged' ? (event.parts.length > 2
    ? tf('characterLabGroupMerged', language, new Intl.ListFormat(normalizeLanguage(language), { style: 'long', type: 'conjunction' }).format([...event.parts]), event.result)
    : tf('characterLabMerged', language, event.first, event.second, event.result)) : event?.kind === 'split'
    ? tf('characterLabSplit', language, event.first, new Intl.ListFormat(normalizeLanguage(language), { style: 'short', type: 'conjunction' }).format([...event.parts]))
    : materialCount(model) >= MAX_CHARACTER_LAB_PIECES ? t('characterLabFull', language) : tf('characterLabCount', language, number.format(model.pieces.length))
  return h.div([h.Class('page character-lab-page'), h.Attribute('data-multitouch-scroll', 'true')], [h.div([h.Class('card character-lab-card')], [
    h.div([h.Class('character-lab-toolbar')], [
      h.h1([h.Class('title')], [t('characterLabTitle', language)]),
      h.div([h.Class('character-lab-actions')], [
        h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.Disabled(!available), h.OnClick(RequestedRandom())], [t('characterLabRandom', language)]),
        h.button([h.Class('btn btn-secondary'), h.Attribute('type', 'button'), h.Disabled(model.pieces.length === 0), h.OnClick(Cleared())], [t('characterLabClear', language)]),
      ]),
    ]),
    h.div([h.Class('character-lab-palette'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('characterLabPalette', language))], [
      h.div([h.Class('character-lab-palette-group'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('characterLabCommonRadicals', language))], [
        h.div([h.Class('character-lab-radicals'), h.Attribute('data-multitouch-scroll', 'true')], selectCharacterCombiners(model.query).map(dropButton)),
      ]),
      h.div([h.Class('character-lab-palette-group'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('characterLabCharacters', language))], [
        h.div([h.Class('character-lab-characters')], [
          ...palette.slice(start, start + CHARACTER_LAB_PALETTE_PAGE_SIZE).map(dropButton),
          h.input([h.Class('character-lab-search'), h.Key('character-lab-search'), h.Attribute('type', 'search'), h.Attribute('lang', 'zh-CN'),
            h.Attribute('aria-label', t('characterLabSearch', language)), h.Placeholder(t('characterLabSearch', language)), h.Value(model.query),
            h.Attribute('autocomplete', 'off'), h.Attribute('autocapitalize', 'off'), h.Attribute('spellcheck', 'false'), h.OnInput(query => ChangedSearch({ query })),
          ]),
          h.button([h.Class('character-lab-pager'), h.Attribute('type', 'button'), h.Disabled(!canPage), h.OnClick(PreviousPalette())], [t('characterLabPrevious', language)]),
          h.button([h.Class('character-lab-pager'), h.Attribute('type', 'button'), h.Disabled(!canPage), h.OnClick(NextPalette())], [t('characterLabMore', language)]),
        ]),
      ]),
    ]),
    h.div([h.Class('character-lab-stage'), h.Attribute('role', 'group'), h.Attribute('aria-label', t('characterLabStage', language)),
      h.Attribute('aria-busy', String(model.joining.length > 0)),
      h.Attribute('data-character-lab-revision', String(model.revision)),
      h.OnMount({ name: 'characterLabPhysics', f: mountCharacterLab })], [
      ...model.pieces.map(piece => {
        const character = canonicalCharacter(piece.character)
        return h.button([
        h.Class('character-lab-piece'), h.Key(`character-lab-piece-${piece.id}`), h.Attribute('type', 'button'), h.Attribute('lang', 'zh-CN'),
        h.Attribute('aria-label', tf('characterLabPiece', language, character)), h.Attribute('data-multitouch-owned', 'true'),
        h.Attribute('data-character-lab-id', String(piece.id)), h.Attribute('data-character-lab-character', character),
        ...(['x', 'y', 'vx', 'vy', 'angle', 'spin'] as const).map(key => h.Attribute(`data-${key}`, String(piece[key]))),
        h.Attribute('data-merge-delay', String(piece.delay)),
        h.Style({ ...colorVariables(character), left: `${piece.x * 100}%`, top: `${piece.y * 100}%`, transform: `translate(-50%,-50%) rotate(${piece.angle}rad)` }),
        h.OnClick(TappedPiece({ id: piece.id, x: piece.x, y: piece.y, vx: piece.vx, vy: piece.vy, angle: piece.angle, revision: model.revision })),
      ], [h.span([h.Class('character-lab-glyph'), h.AriaHidden(true)], [character])])
      }),
    ]),
    h.p([h.Class('character-lab-feedback'), h.Attribute('role', 'status'), h.Attribute('aria-live', 'polite'), h.Attribute('aria-atomic', 'true')], [description]),
  ])])
}
