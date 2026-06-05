import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Greeting from './greeting'

const resolveSwoosh = [{ name: 'PlaySwoosh' }, Greeting.SoundPlayed()] as const

describe('Greeting', () => {
  it('init state', () => {
    expect(Greeting.init).toStrictEqual({ status: 'idle', audioUrl: '', playCount: 0 })
  })

  it('ClickedRecord sets status to recording', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'idle', audioUrl: '', playCount: 0 }),
      Story.message(Greeting.ClickedRecord()),
      Story.model((model) => {
        expect(model.status).toBe('recording')
      }),
      Story.Command.resolveAll([{ name: 'Record' }, Greeting.RecordingFailed()]),
      Story.Command.expectNone(),
    )
  })

  it('RecordedAudio sets status to ready', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'recording', audioUrl: '', playCount: 0 }),
      Story.message(Greeting.RecordedAudio({ audioUrl: 'data:audio/wav;base64,test' })),
      Story.model((model) => {
        expect(model.status).toBe('ready')
        expect(model.audioUrl).toBe('data:audio/wav;base64,test')
      }),
      Story.Command.expectNone(),
    )
  })

  it('RecordingFailed sets status back to idle', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'recording', audioUrl: '', playCount: 0 }),
      Story.message(Greeting.RecordingFailed()),
      Story.model((model) => {
        expect(model.status).toBe('idle')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedPlay increments playCount', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'ready', audioUrl: 'data:audio/wav;base64,test', playCount: 0 }),
      Story.message(Greeting.ClickedPlay()),
      Story.model((model) => {
        expect(model.playCount).toBe(1)
      }),
      Story.Command.resolveAll([{ name: 'PlayGreeting' }, Greeting.SoundPlayed()]),
      Story.Command.expectNone(),
    )
  })

  it('ClickedReset returns to idle state', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'ready', audioUrl: 'data:audio/wav;base64,test', playCount: 3 }),
      Story.message(Greeting.ClickedReset()),
      Story.model((model) => {
        expect(model.status).toBe('idle')
        expect(model.audioUrl).toBe('')
        expect(model.playCount).toBe(0)
      }),
      Story.Command.resolveAll(resolveSwoosh),
      Story.Command.expectNone(),
    )
  })

  it('SoundPlayed goes back to idle', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'ready', audioUrl: 'data:audio/wav;base64,test', playCount: 3 }),
      Story.message(Greeting.SoundPlayed()),
      Story.model((m) => {
        expect(m.status).toBe('idle')
        expect(m.audioUrl).toBe('data:audio/wav;base64,test')
        expect(m.playCount).toBe(3)
      }),
      Story.Command.expectNone(),
    )
  })

  it('renders record button when idle', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with(Greeting.init),
      Scene.expect(Scene.text('🎤 Record Your Name')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders recording indicator when recording', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'recording', audioUrl: '', playCount: 0 }),
      Scene.expect(Scene.text('Recording... speak your name!')).toExist(),
      Scene.expect(Scene.text('🎤 Record Your Name')).toBeAbsent(),
      Scene.Command.expectNone(),
    )
  })

  it('renders Say Hello button when ready', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'ready', audioUrl: 'data:audio/wav;base64,test', playCount: 0 }),
      Scene.expect(Scene.text('Say Hello')).toExist(),
      Scene.expect(Scene.text('🎤 Record Your Name')).toBeAbsent(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Reset button after recording', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'ready', audioUrl: 'data:audio/wav;base64,test', playCount: 0 }),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Reset button after play', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: '', playCount: 2 }),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows play count after greeting', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: '', playCount: 3 }),
      Scene.expect(Scene.text("You've been greeted 3 times!")).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('hides Reset when idle with no plays', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with(Greeting.init),
      Scene.expect(Scene.text('Reset')).toBeAbsent(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Say Hello replay button when idle with existing audio', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 1 }),
      Scene.expect(Scene.text('Say Hello')).toExist(),
      Scene.expect(Scene.text('🎤 Record Your Name')).toExist(),
      Scene.Command.expectNone(),
    )
  })
})
