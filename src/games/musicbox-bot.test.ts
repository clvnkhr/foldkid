import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit/test'
import { Story } from 'foldkit/test'
import * as MusicBox from './musicbox'

const resolvePianoTop = [{ name: 'piano-top' as const }, MusicBox.NoteOn({ pitch: 'C4' })] as const
const resolvePianoBot = [{ name: 'piano-bot' as const }, MusicBox.NoteOn({ pitch: 'C3' })] as const
const defaultSongOrder = () => MusicBox.SONGS.map((_, index) => index)
const defaultHiddenSongs = () => MusicBox.SONGS.map(() => false)

const baseModel = {
  selectedSong: 0, selectedInstrument: 0, isPlaying: false, isPaused: false,
  songTranspose: 0, whiteKeys: 8, bottomPanelMode: 'simple',
  octaveOffset: 0, bottomShift: 0, topShift: 0, tempo: 1,
  lyricsExpanded: false, songOrder: defaultSongOrder(),
  hiddenSongs: defaultHiddenSongs(), dragIndex: -1,
}

describe('bottom keyboard', () => {
  it('renders bottom keyboard keys when visible', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with({ ...baseModel, bottomPanelMode: 'keyboard' }),
      Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
      Scene.expect(Scene.text('C3')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('does not render C3 key when hidden', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with(baseModel),
      Scene.Mount.resolveAll(resolvePianoTop),
      Scene.expect(Scene.text('C3')).not.toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('toggle opens the bottom keyboard', () => {
    Story.story(
      MusicBox.update,
      Story.with(MusicBox.init()),
      Story.message(MusicBox.ToggleBottomKeyboard()),
      Story.model((model) => {
        expect(model.bottomPanelMode).toBe('keyboard')
      }),
      Story.Command.expectNone(),
    )
  })

  it('toggle from on to off', () => {
    Story.story(
      MusicBox.update,
      Story.with({ ...MusicBox.init(), bottomPanelMode: 'keyboard' }),
      Story.message(MusicBox.ToggleBottomKeyboard()),
      Story.model((model) => {
        expect(model.bottomPanelMode).toBe('simple')
      }),
      Story.Command.expectNone(),
    )
  })

  it('bottom keyboard has data-pitch C3', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with({ ...baseModel, bottomPanelMode: 'keyboard' }),
      Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
      Scene.expect(Scene.selector('[data-pitch="C3"]')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('top keyboard works alongside bottom keyboard', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with({ ...baseModel, bottomPanelMode: 'keyboard' }),
      Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
      Scene.expect(Scene.selector('[data-pitch="C4"]')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('bottom keyboard has correct number of white keys', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with({ ...baseModel, bottomPanelMode: 'keyboard', whiteKeys: 7 }),
      Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
      Scene.expect(Scene.text('G3')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('NoteOn from bottom keyboard is handled by update', () => {
    Story.story(
      MusicBox.update,
      Story.with(MusicBox.init()),
      Story.message(MusicBox.NoteOn({ pitch: 'C3' })),
      Story.model((model) => {
        expect(model).toStrictEqual(MusicBox.init())
      }),
      Story.Command.expectNone(),
    )
  })

  it('piano-bot has vnode key when bottom keyboard shown', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with({ ...baseModel, bottomPanelMode: 'keyboard' }),
      Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
      Scene.expect(Scene.selector('[key="piano-bot"]')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('keybind-info has vnode key when bottom keyboard hidden', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with(baseModel),
      Scene.Mount.resolveAll(resolvePianoTop),
      Scene.expect(Scene.selector('[key="keybind"]')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('keybind-info has vnode key when bottom keyboard shown', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with({ ...baseModel, bottomPanelMode: 'keyboard' }),
      Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
      Scene.expect(Scene.selector('[key="keybind"]')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('piano-top has vnode key', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with(baseModel),
      Scene.Mount.resolveAll(resolvePianoTop),
      Scene.expect(Scene.selector('[key="piano-top"]')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('all six children have distinct vnode keys when bottom keyboard shown', () => {
    Scene.scene(
      { update: MusicBox.update, view: MusicBox.view },
      Scene.with({ ...baseModel, bottomPanelMode: 'keyboard' }),
      Scene.Mount.resolveAll(resolvePianoTop, resolvePianoBot),
      Scene.expect(Scene.selector('[key="card"]')).toExist(),
      Scene.expect(Scene.selector('[key="inner"]')).toExist(),
      Scene.expect(Scene.selector('[key="controls"]')).toExist(),
      Scene.expect(Scene.selector('[key="piano-top"]')).toExist(),
      Scene.expect(Scene.selector('[key="shift-row"]')).toExist(),
      Scene.expect(Scene.selector('[key="piano-bot"]')).toExist(),
      Scene.expect(Scene.selector('[key="keybind"]')).toExist(),
      Scene.Command.expectNone(),
    )
  })
})
