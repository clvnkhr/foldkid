import { Effect } from 'effect'
import { Scene, Story } from 'foldkit/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Audio from '../audio'
import { t, tf } from '../i18n'
import * as Speech from '../speech'
import * as Lab from './characterLab'
import { baseComponents, canonicalCharacter, CHARACTER_LAB_COMMON_RADICALS, CHARACTER_LAB_PALETTE, CHARACTER_LAB_RECIPES, characterColors, isCharacterLabCharacter, mergeCandidates, mergeCharacters, mergeGroupCandidates, radicalForms, selectCharacterPalette } from './characterLabDomain'

const update = (model: Lab.Model, message: Lab.Message) => Lab.update(model, message, 'en', true, {})
const view = (model: Lab.Model) => Lab.view(model, 'en', true)
const mounted = [{ name: 'characterLabPhysics' }, Lab.SoundPlayed()] as const
const pose = { x: .5, y: .55, vx: 15, vy: -30, angle: .2, revision: 0 }
const add = (model: Lab.Model, character: string): Lab.Model => update(model, Lab.DroppedCharacter({ character }))[0]
const pair = (first = '木', second = '木'): Lab.Model => add(add(Lab.init(), first), second)
const collision = (model: Lab.Model, firstId = 0, secondId = 1) => Lab.CollidedPieces({ ...pose, revision: model.revision, firstId, secondId })
const tap = (model: Lab.Model, id: number) => Lab.TappedPiece({ ...pose, revision: model.revision, id })
const sound = (kind: 'Drop' | 'Merge' | 'Split') => [{ name: `CharacterLabPlay${kind}Sound` }, Lab.SoundPlayed()] as const
const spoken = [{ name: 'CharacterLabSpeakCharacter' }, Lab.CharacterSpoken()] as const
const choices = [...CHARACTER_LAB_COMMON_RADICALS, ...CHARACTER_LAB_PALETTE]

afterEach(() => vi.restoreAllMocks())

describe('Character Lab composition and material conservation', () => {
  it('drops moving, rotating characters, merges compatible contacts, and pops their original ingredients', () => {
    Story.story(update, Story.with(Lab.init()),
      Story.message(Lab.DroppedCharacter({ character: '木' })),
      Story.message(Lab.DroppedCharacter({ character: '木' })),
      Story.model(model => {
        expect(model.pieces.map(piece => piece.character)).toEqual(['木', '木'])
        expect(model.pieces[0]!.spin).not.toBe(0)
        expect(model.pieces[0]!.vx).not.toBe(model.pieces[1]!.vx)
      }),
      Story.message(Lab.CollidedPieces({ ...pose, firstId: 0, secondId: 1 })),
      Story.model(model => {
        expect(model.pieces).toHaveLength(1)
        expect(model.pieces[0]).toMatchObject({ id: 2, character: '林', atoms: ['木', '木'], x: pose.x, y: pose.y })
        expect(model.merges).toBe(1)
        expect(Lab.materialCount(model)).toBe(2)
      }),
      Story.message(Lab.TappedPiece({ ...pose, id: 2 })),
      Story.model(model => {
        expect(model.pieces.map(piece => piece.character)).toEqual(['木', '木'])
        expect(model.pieces.map(piece => piece.id)).toEqual([3, 4])
        expect(model.pieces.every(piece => piece.delay >= 1000)).toBe(true)
        expect(model.pieces[0]!.vx).not.toBe(model.pieces[1]!.vx)
        expect(Lab.materialCount(model)).toBe(2)
      }), Story.Command.expectNone(),
    )
  })

  it('lets a compound dropped directly pop into all of its base radicals', () => {
    const model = add(Lab.init(), '森')
    expect(model.pieces[0]!.atoms).toEqual(['木', '木', '木'])
    const [split, commands] = update(model, tap(model, 0))
    expect(split.pieces.map(piece => piece.character)).toEqual(['木', '木', '木'])
    expect(split.pieces.every(piece => piece.x >= 0 && piece.x <= 1 && piece.y >= 0 && piece.y <= 1)).toBe(true)
    expect(commands).toEqual([])
  })

  it.each([['亻', '木', '人', '休'], ['氵', '青', '水', '清'], ['忄', '青', '心', '情'], ['扌', '白', '手', '拍']])(
    'drops %s in its standalone form and uses it to make %s + %s → %s', (variant, partner, original, result) => {
      const initial = pair(variant, partner)
      expect(initial.pieces[0]).toMatchObject({ character: original, atoms: [original] })
      const merged = update(initial, collision(initial))[0]
      expect(merged.pieces).toHaveLength(1)
      expect(merged.pieces[0]!.character).toBe(result)
      const split = update(merged, tap(merged, merged.pieces[0]!.id))[0]
      expect(split.pieces.map(piece => piece.character)).toEqual([original, ...baseComponents(partner)])
      expect(split.lastEvent?.parts).toEqual(split.pieces.map(piece => piece.character))
    },
  )

  it('normalizes older component pieces when splitting without resetting their identity or the board', () => {
    const model = add(Lab.init(), '休')
    const legacy = { ...model, pieces: model.pieces.map(piece => ({ ...piece, atoms: ['亻', '木'] })) }
    const split = update(legacy, tap(legacy, 0))[0]
    expect(split.pieces.map(piece => piece.character)).toEqual(['人', '木'])
    expect(split.revision).toBe(legacy.revision)
    expect(split.nextId).toBe(legacy.nextId + 2)
  })

  it('preserves every recipe’s actual material through merge and split', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const failures: string[] = []
    for (const recipe of CHARACTER_LAB_RECIPES) {
      const initial = pair(...recipe.parts)
      const atoms = initial.pieces.flatMap(piece => piece.atoms)
      const expected = mergeCharacters(...recipe.parts.map(canonicalCharacter) as [string, string])
      let [merged, commands] = update(initial, collision(initial))
      if (commands[0]?.name === 'CharacterLabChooseJoin') [merged, commands] = update(merged, await Effect.runPromise(commands[0].effect))
      const result = merged.pieces[0]
      if (!expected || merged.pieces.length !== 1 || result?.character !== expected || commands.length > 0 || JSON.stringify(result.atoms) !== JSON.stringify(atoms)) {
        failures.push(`${recipe.character}: merge`); continue
      }
      const split = update(merged, tap(merged, result.id))[0]
      if (JSON.stringify(split.pieces.map(piece => piece.character)) !== JSON.stringify(atoms) || Lab.materialCount(split) !== atoms.length || split.pieces.some(piece => !isCharacterLabCharacter(piece.character))) failures.push(`${recipe.character}: split`)
    }
    expect(failures).toEqual([])
  })

  it.each(['学', '画', '脑', '哭', '品', '晶', '淼', '鑫'])('drops and splits the expanded multi-part character %s', character => {
    const model = add(Lab.init(), character)
    const parts = baseComponents(character)
    expect(parts.length).toBeGreaterThanOrEqual(3)
    expect(model.pieces).toHaveLength(1)
    const [split, commands] = update(model, tap(model, 0))
    expect(split.pieces.map(piece => piece.character)).toEqual(parts)
    expect(Lab.materialCount(split)).toBe(parts.length)
    expect(commands).toEqual([])
  })

  it('uniformly selects each distinct valid result for an ambiguous join', async () => {
    const initial = pair('口', '囗')
    expect(initial.pieces.map(piece => piece.character)).toEqual(['口', '口'])
    const candidates = mergeCandidates('口', '口')
    expect(candidates).toContain('吕')
    expect(candidates).toContain('吅')
    expect(new Set(candidates).size).toBe(candidates.length)
    for (const [index, candidate] of candidates.entries()) {
      const random = vi.spyOn(Math, 'random').mockReturnValue((index + .5) / candidates.length)
      const [waiting, commands] = update(initial, collision(initial))
      expect(random).not.toHaveBeenCalled()
      expect(commands.map(command => command.name)).toEqual(['CharacterLabChooseJoin'])
      expect(waiting.pieces).toBe(initial.pieces)
      expect(waiting.joining[0]!.ids).toEqual([0, 1])
      expect(update(waiting, collision(waiting))).toEqual([waiting, []])
      expect(update(waiting, tap(waiting, 0))).toEqual([waiting, []])
      const choice = await Effect.runPromise(commands[0]!.effect)
      expect(choice).toEqual(Lab.JoinChosen({ character: candidate, revision: 0, request: 1 }))
      const [joined, feedback] = update(waiting, choice)
      expect(joined.pieces.map(piece => piece.character)).toEqual([candidate])
      expect(joined.joining).toEqual([])
      expect(feedback).toEqual([])
      expect(update(joined, choice)).toEqual([joined, []])
      vi.restoreAllMocks()
    }
  })

  it('ignores invalid, repeated and stale random join completions and recovers from missing RNG', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unavailable') })
    const [waiting, commands] = update(pair('口', '口'), collision(pair('口', '口')))
    const choice = await Effect.runPromise(commands[0]!.effect)
    expect(choice).toEqual(Lab.JoinChosen({ character: mergeCandidates('口', '口')[0]!, revision: 0, request: 1 }))
    for (const invalid of [
      Lab.JoinChosen({ character: '林', revision: 0, request: 1 }),
      Lab.JoinChosen({ character: '吕', revision: 1, request: 1 }),
      Lab.JoinChosen({ character: '吕', revision: 0, request: -1 }),
      Lab.JoinChosen({ character: '吕', revision: 0, request: 99 }),
    ]) expect(update(waiting, invalid)).toEqual([waiting, []])
    const cleared = update(waiting, Lab.Cleared())[0]
    expect(cleared.joining).toEqual([])
    expect(update(cleared, choice)).toEqual([cleared, []])
    const left = Lab.interrupt(waiting)
    expect(left.joining).toEqual([])
    expect(update(left, choice)).toEqual([left, []])
  })

  it('allows disjoint pending joins to finish in reverse order while other pieces keep working', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const initial = ['口', '口', '口', '口', '木', '木'].reduce(add, Lab.init())
    const [first, firstCommands] = update(initial, collision(initial, 0, 1))
    const [second, secondCommands] = update(first, collision(first, 2, 3))
    expect(second.joining.map(join => join.request)).toEqual([1, 2])
    const wooden = update(second, collision(second, 4, 5))[0]
    expect(wooden.pieces.find(piece => piece.id === 6)?.character).toBe('林')
    expect(wooden.joining).toHaveLength(2)
    const extra = add(wooden, '心')
    const [resolvedSecond] = update(extra, await Effect.runPromise(secondCommands[0]!.effect))
    expect(resolvedSecond.joining.map(join => join.request)).toEqual([1])
    const [resolvedFirst] = update(resolvedSecond, await Effect.runPromise(firstCommands[0]!.effect))
    expect(resolvedFirst.joining).toEqual([])
    expect(resolvedFirst.pieces.map(piece => piece.id)).toEqual([6, 7, 8, 9])
    expect(new Set(resolvedFirst.pieces.map(piece => piece.id)).size).toBe(4)
    expect(Lab.materialCount(resolvedFirst)).toBe(7)
  })

  it('joins three pieces directly without a two-piece precursor and conserves each ingredient', async () => {
    const initial = ['口', '口', '犬'].reduce(add, Lab.init())
    expect(CHARACTER_LAB_RECIPES.some(recipe => recipe.character === '哭')).toBe(false)
    expect(mergeGroupCandidates(['口', '口', '犬'])).toContain('哭')
    let [joined, commands] = update(initial, Lab.CollidedGroup({ ...pose, ids: [0, 1, 2] }))
    if (commands[0]?.name === 'CharacterLabChooseJoin') {
      const request = joined.joining[0]!.request
      const result = update(joined, Lab.JoinChosen({ character: '哭', revision: 0, request }))
      joined = result[0]
      commands = result[1]
    }
    expect(joined.pieces).toHaveLength(1)
    expect(joined.pieces[0]).toMatchObject({ character: '哭', atoms: ['口', '口', '犬'] })
    expect(commands).toEqual([])
    const split = update(joined, tap(joined, joined.pieces[0]!.id))[0]
    expect(split.pieces.map(piece => piece.character)).toEqual(['口', '口', '犬'])
    for (const ids of [[0, 0, 2], [0, 1, 99], [0], [], [0, 1, -1]]) {
      expect(update(initial, Lab.CollidedGroup({ ...pose, ids }))).toEqual([initial, []])
    }
  })

  it('rejects incompatible, repeated, stale and malformed collision/tap messages', () => {
    const model = pair()
    for (const message of [
      Lab.DroppedCharacter({ character: '<script>' }), collision(model, 0, 0), collision(model, 0, 99), collision(model, -.5, 1),
      Lab.CollidedPieces({ ...pose, firstId: 0, secondId: 1, revision: 99 }),
      ...[{ x: NaN }, { x: -1 }, { y: 1.1 }, { vy: Infinity }, { vx: 9000 }, { angle: NaN }].map(invalid => Lab.CollidedPieces({ ...pose, ...invalid, firstId: 0, secondId: 1 })),
      Lab.TappedPiece({ ...pose, id: -1 }), Lab.TappedPiece({ ...pose, id: 0 }), Lab.TappedPiece({ ...pose, id: 99 }),
    ]) expect(update(model, message)).toEqual([model, []])
    const incompatible = pair('森', '清')
    expect(update(incompatible, collision(incompatible))).toEqual([incompatible, []])
    const merged = update(model, collision(model))[0]
    expect(update(merged, collision(model))).toEqual([merged, []])
    const split = update(merged, tap(merged, 2))[0]
    expect(update(split, tap(merged, 2))).toEqual([split, []])
  })

  it('reserves enough capacity for every piece to split even when the board is full', () => {
    let model = add(Lab.init(), '森')
    for (let index = 3; index < Lab.MAX_CHARACTER_LAB_PIECES; index++) model = add(model, '木')
    expect(Lab.materialCount(model)).toBe(Lab.MAX_CHARACTER_LAB_PIECES)
    expect(update(model, Lab.DroppedCharacter({ character: '木' }))).toEqual([model, []])
    const split = update(model, tap(model, 0))[0]
    expect(split.pieces).toHaveLength(Lab.MAX_CHARACTER_LAB_PIECES)
    expect(Lab.materialCount(split)).toBe(Lab.MAX_CHARACTER_LAB_PIECES)
  })

  it('invalidates old physics and random work on clear or navigation without reusing piece ids', () => {
    const initial = pair()
    const [cleared] = update(initial, Lab.Cleared())
    expect(cleared).toMatchObject({ pieces: [], revision: 1, nextId: 2, merges: 0 })
    expect(update(cleared, collision(initial))).toEqual([cleared, []])
    const dropped = add(cleared, '日')
    expect(dropped.pieces[0]!.id).toBe(2)
    const interrupted = Lab.interrupt(initial)
    expect(interrupted.pieces).toBe(initial.pieces)
    expect(update(interrupted, collision(initial))).toEqual([interrupted, []])
    expect(update(interrupted, Lab.RandomChosen({ character: '木', revision: 0, request: 1 }))).toEqual([interrupted, []])
    expect(update(Lab.init(), Lab.Cleared())).toEqual([Lab.init(), []])
  })
})

describe('Character Lab commands and accessible controls', () => {
  it('consumes random results once and ignores older requests', () => {
    Story.story(update, Story.with(Lab.init()),
      Story.message(Lab.RequestedRandom()),
      Story.Command.resolveAll([{ name: 'CharacterLabChooseRandom' }, Lab.RandomChosen({ character: '木', revision: 0, request: 1 })]),
      Story.message(Lab.RandomChosen({ character: '木', revision: 0, request: 1 })),
      Story.model(model => { expect(model.pieces).toHaveLength(1); expect(model.randomRequest).toBe(2) }),
      Story.Command.expectNone(),
    )
    const [first] = update(Lab.init(), Lab.RequestedRandom())
    const [second] = update(first, Lab.RequestedRandom())
    expect(update(second, Lab.RandomChosen({ character: '木', revision: 0, request: 1 }))).toEqual([second, []])
    expect(update(second, Lab.RandomChosen({ character: '外来字', revision: 0, request: 2 }))).toEqual([second, []])
  })

  it('random generation handles endpoint choices and a rejected RNG safely', async () => {
    for (const sample of [0, .999999]) {
      vi.spyOn(Math, 'random').mockReturnValue(sample)
      const [waiting, commands] = update(Lab.init(), Lab.RequestedRandom())
      const result = await Effect.runPromise(commands[0]!.effect)
      expect(result).toEqual(Lab.RandomChosen({ character: sample === 0 ? choices[0]! : choices.at(-1)!, revision: 0, request: 1 }))
      expect(update(waiting, result)[0].pieces).toHaveLength(1)
      vi.restoreAllMocks()
    }
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unavailable') })
    const [, commands] = update(Lab.init(), Lab.RequestedRandom())
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Lab.RandomChosen({ character: choices[0]!, revision: 0, request: 1 }))
  })

  it.each([false, true])('keeps merge and split visuals with mute=%s and forwards Mandarin voice settings', async muted => {
    const speak = vi.spyOn(Speech, 'speakNow').mockImplementation(() => {})
    const [merged, commands] = Lab.update(pair(), collision(pair()), 'fr', muted, { rate: .65, pitch: 1.35, lang: 'fr' })
    expect(merged.pieces[0]!.character).toBe('林')
    if (muted) expect(commands).toEqual([])
    else {
      expect(commands.map(command => command.name)).toEqual(['CharacterLabPlayMergeSound', 'CharacterLabSpeakCharacter'])
      expect(await Effect.runPromise(commands[1]!.effect)).toEqual(Lab.CharacterSpoken())
      expect(speak).toHaveBeenCalledExactlyOnceWith('林', { rate: .65, pitch: 1.35, lang: 'zh-CN' })
    }
    const [split] = Lab.update(merged, tap(merged, 2), 'fr', muted, {})
    expect(split.pieces.map(piece => piece.character)).toEqual(['木', '木'])
  })

  it('acknowledges rejected audio/speech APIs and defines stable command names', async () => {
    vi.spyOn(Audio, 'chime').mockReturnValue({ name: 'PlayChime', effect: Effect.die(new Error('missing audio')) })
    vi.spyOn(Speech, 'speakNow').mockImplementation(() => { throw new Error('missing speech') })
    const unmuted = (model: Lab.Model, message: Lab.Message) => Lab.update(model, message, 'en', false, {})
    Story.story(unmuted, Story.with(Lab.init()),
      Story.message(Lab.DroppedCharacter({ character: '木' })), Story.Command.resolveAll(sound('Drop'), spoken),
      Story.message(Lab.DroppedCharacter({ character: '木' })), Story.Command.resolveAll(sound('Drop'), spoken),
      Story.message(Lab.CollidedPieces({ ...pose, firstId: 0, secondId: 1 })), Story.Command.resolveAll(sound('Merge'), spoken),
      Story.message(Lab.TappedPiece({ ...pose, id: 2 })), Story.Command.resolveAll(sound('Split'), spoken), Story.Command.expectNone(),
    )
    const [, commands] = unmuted(pair(), collision(pair()))
    expect(await Effect.runPromise(commands[0]!.effect)).toEqual(Lab.SoundPlayed())
    expect(await Effect.runPromise(commands[1]!.effect)).toEqual(Lab.CharacterSpoken())
  })

  it('offers native drop controls, scoped draggable pieces, and live composition feedback', () => {
    Scene.scene({ update, view }, Scene.with(Lab.init()),
      Scene.Mount.resolveAll(mounted),
      Scene.expect(Scene.role('button', { name: t('characterLabClear', 'en') })).toBeDisabled(),
      Scene.expect(Scene.selector('.character-lab-page')).toHaveAttr('data-multitouch-scroll', 'true'),
      Scene.expectAll(Scene.all.selector('.character-lab-palette-label')).toHaveCount(0),
      Scene.expectAll(Scene.all.selector('.character-lab-hint')).toHaveCount(0),
      Scene.expectAll(Scene.all.selector('.character-lab-empty')).toHaveCount(0),
      Scene.expect(Scene.role('group', { name: t('characterLabCommonRadicals', 'en') })).toBeVisible(),
      Scene.expect(Scene.role('group', { name: t('characterLabCharacters', 'en') })).toBeVisible(),
      Scene.expectAll(Scene.all.selector('.character-lab-radicals button')).toHaveCount(CHARACTER_LAB_COMMON_RADICALS.length),
      Scene.expect(Scene.role('button', { name: tf('characterLabDrop', 'en', '心') })).toHaveAttr('title', tf('characterLabRadicalForms', 'en', '心', new Intl.ListFormat('en', { style: 'short', type: 'conjunction' }).format([...radicalForms('心')]))),
      Scene.expectAll(Scene.all.role('button', { name: tf('characterLabDrop', 'en', '忄') })).toHaveCount(0),
      Scene.click(Scene.role('button', { name: tf('characterLabDrop', 'en', '木') })),
      Scene.expect(Scene.role('button', { name: t('characterLabClear', 'en') })).not.toBeDisabled(),
      Scene.expect(Scene.role('button', { name: tf('characterLabPiece', 'en', '木') })).toHaveAttr('data-multitouch-owned', 'true'),
      Scene.expect(Scene.selector('.character-lab-piece')).toHaveAttr('data-character-lab-id', '0'),
      Scene.expect(Scene.selector('.character-lab-piece')).toHaveAttr('data-x', '0.4'),
      Scene.expect(Scene.selector('.character-lab-feedback[role="status"][aria-live="polite"]')).toHaveText(tf('characterLabCount', 'en', '1')),
      Scene.click(Scene.role('button', { name: t('characterLabMore', 'en') })),
      Scene.expect(Scene.role('button', { name: tf('characterLabDrop', 'en', '心') })).toBeVisible(),
      Scene.expectAll(Scene.all.selector('.character-lab-radicals button')).toHaveCount(CHARACTER_LAB_COMMON_RADICALS.length),
      Scene.expect(Scene.role('button', { name: tf('characterLabDrop', 'en', CHARACTER_LAB_PALETTE[8]!) })).toBeVisible(),
      Scene.click(Scene.role('button', { name: t('characterLabPrevious', 'en') })),
      Scene.expect(Scene.role('button', { name: tf('characterLabDrop', 'en', '木') })).toBeVisible(),
      Scene.expect(Scene.role('button', { name: tf('characterLabDrop', 'en', CHARACTER_LAB_PALETTE[0]!) })).toBeVisible(),
      Scene.Command.expectNone(),
    )
    const colors = characterColors('木')
    expect(colors.light.ink).not.toBe(colors.dark.ink)
    expect(baseComponents('森')).toEqual(['木', '木', '木'])
  })

  it('searches the large catalogue without changing pieces or physics, preserving Chinese IME input', () => {
    const board = add(Lab.init(), '明')
    const paged = update(board, Lab.NextPalette())[0]
    for (const query of ['xin', '心', '忄', ' 日 月 ', '𰻝', '']) {
      const [searched, commands] = update(query === '' ? { ...paged, query: '心' } : paged, Lab.ChangedSearch({ query }))
      expect(searched.query).toBe(query)
      expect(searched.palettePage).toBe(0)
      expect(searched.pieces).toBe(board.pieces)
      expect(searched.revision).toBe(board.revision)
      expect(searched.nextId).toBe(board.nextId)
      expect(commands).toEqual([])
    }
    const [bounded] = update(board, Lab.ChangedSearch({ query: '𰻝'.repeat(65) }))
    expect([...bounded.query]).toHaveLength(64)
    expect(update(bounded, Lab.ChangedSearch({ query: bounded.query }))).toEqual([bounded, []])
  })

  it('keeps filtered pagination finite with no results and wraps through the whole unfiltered catalogue', () => {
    const empty = update(Lab.init(), Lab.ChangedSearch({ query: 'no such character' }))[0]
    expect(selectCharacterPalette(empty.query)).toEqual([])
    expect(update(empty, Lab.NextPalette())).toEqual([empty, []])
    expect(update(empty, Lab.PreviousPalette())).toEqual([empty, []])
    const pages = Math.ceil(CHARACTER_LAB_PALETTE.length / Lab.CHARACTER_LAB_PALETTE_PAGE_SIZE)
    const last = update(Lab.init(), Lab.PreviousPalette())[0]
    expect(last.palettePage).toBe(pages - 1)
    expect(update(last, Lab.NextPalette())[0].palettePage).toBe(0)
    expect(update(empty, Lab.ChangedSearch({ query: '' }))[0].palettePage).toBe(0)
  })

  it('offers native search and keeps the common radicals usable while the lower row is filtered', () => {
    const label = t('characterLabSearch', 'en')
    Scene.scene({ update, view }, Scene.with(Lab.init()),
      Scene.Mount.resolveAll(mounted),
      Scene.type(Scene.label(label), '心'),
      Scene.expect(Scene.label(label)).toHaveValue('心'),
      Scene.expect(Scene.role('button', { name: tf('characterLabDrop', 'en', '情') })).toBeVisible(),
      Scene.expectAll(Scene.all.selector('.character-lab-radicals button')).toHaveCount(16),
      Scene.type(Scene.label(label), 'no results'),
      Scene.expectAll(Scene.all.selector('.character-lab-characters .character-lab-drop')).toHaveCount(0),
      Scene.expect(Scene.role('button', { name: t('characterLabMore', 'en') })).toBeDisabled(),
      Scene.expect(Scene.role('button', { name: t('characterLabPrevious', 'en') })).toBeDisabled(),
      Scene.click(Scene.role('button', { name: tf('characterLabDrop', 'en', '心') })),
      Scene.expect(Scene.role('button', { name: tf('characterLabPiece', 'en', '心') })).toBeVisible(),
      Scene.type(Scene.label(label), ''),
      Scene.expect(Scene.role('button', { name: tf('characterLabDrop', 'en', '青') })).toBeVisible(),
      Scene.expectAll(Scene.all.selector('.character-lab-characters .character-lab-drop')).toHaveCount(8),
      Scene.Command.expectNone(),
    )
  })
})
