import { describe, expect, it } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Greeting from './greeting'

describe('Greeting', () => {
  it('init state', () => {
    expect(Greeting.init).toStrictEqual({ status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: 0 })
  })

  it('ClickedRecord sets status to recording', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'idle', audioUrl: '', playCount: 0, autoPlay: false }),
      Story.message(Greeting.ClickedRecord()),
      Story.model((model) => {
        expect(model.status).toBe('recording')
      }),
      Story.Command.resolveAll([{ name: 'Record' }, Greeting.RecordingFailed()]),
      Story.Command.expectNone(),
    )
  })

  it('RecordedAudio sets idle with autoPlay flag', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'recording', audioUrl: '', playCount: 0, autoPlay: false }),
      Story.message(Greeting.RecordedAudio({ audioUrl: 'data:audio/wav;base64,test' })),
      Story.model((model) => {
        expect(model.status).toBe('idle')
        expect(model.audioUrl).toBe('data:audio/wav;base64,test')
        expect(model.autoPlay).toBe(true)
        expect(model.playCount).toBe(0)
      }),
      Story.Command.expectNone(),
    )
  })

  it('RecordingFailed sets status back to idle', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'recording', audioUrl: '', playCount: 0, autoPlay: false }),
      Story.message(Greeting.RecordingFailed()),
      Story.model((model) => {
        expect(model.status).toBe('idle')
      }),
      Story.Command.expectNone(),
    )
  })

  it('ClickedPlay increments playCount and dispatches playGreeting', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 0, autoPlay: false }),
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
      Story.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 3, autoPlay: false }),
      Story.message(Greeting.ClickedReset()),
      Story.model((model) => {
        expect(model.status).toBe('idle')
        expect(model.audioUrl).toBe('')
        expect(model.playCount).toBe(0)
        expect(model.autoPlay).toBe(false)
      }),
      Story.Command.expectNone(),
    )
  })

  it('SoundPlayed is a no-op', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 3, autoPlay: false }),
      Story.message(Greeting.SoundPlayed()),
      Story.model((m) => {
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
      Scene.with({ status: 'recording', audioUrl: '', playCount: 0, autoPlay: false }),
      Scene.expect(Scene.text('Recording... speak your name!')).toExist(),
      Scene.expect(Scene.text('🎤 Record Your Name')).toBeAbsent(),
      Scene.Command.expectNone(),
    )
  })

  it('renders Say Hello button when idle with audio', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 0, autoPlay: false }),
      Scene.expect(Scene.text('Say Hello')).toExist(),
      Scene.expect(Scene.text('🎤 Record Your Name')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Reset button after recording', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 1, autoPlay: false }),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Reset button after play', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: '', playCount: 2, autoPlay: false }),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows play count after greeting', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: '', playCount: 3, autoPlay: false }),
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
      Scene.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 1, autoPlay: false }),
      Scene.expect(Scene.text('Say Hello')).toExist(),
      Scene.expect(Scene.text('🎤 Record Your Name')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('H1: autoPlay key does not change on re-recording', () => {
    Story.story(
      Greeting.update,
      Story.with(Greeting.init),
      Story.message(Greeting.ClickedRecord()),
      Story.Command.resolveAll(
        [{ name: 'Record' }, Greeting.RecordedAudio({ audioUrl: 'data:audio/wav;base64,first' })],
      ),
      Story.model((model) => {
        expect(model.autoPlay).toBe(true)
        expect(model.playCount).toBe(0)
      }),
      Story.message(Greeting.ClickedPlay()),
      Story.Command.resolveAll(
        [{ name: 'PlayGreeting' }, Greeting.SoundPlayed()],
      ),
      Story.model((model) => {
        expect(model.playCount).toBe(1)
        expect(model.autoPlay).toBe(false)
      }),
      Story.message(Greeting.ClickedRecord()),
      Story.Command.resolveAll(
        [{ name: 'Record' }, Greeting.RecordedAudio({ audioUrl: 'data:audio/wav;base64,second' })],
      ),
      Story.model((model) => {
        expect(model.autoPlay).toBe(true)
        expect(model.playCount).toBe(1) // stale — OnMount won't re-fire
      }),
    )
  })

  it('H2: playGreeting uses Effect.sync with no cleanup — fire-and-forget', () => {
    // PlayGreeting should be fire-and-forget: Effect.sync, not Effect.callback
    // The effect has no cleanup and returns immediately
    Story.story(
      Greeting.update,
      Story.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 0, autoPlay: false }),
      Story.message(Greeting.ClickedPlay()),
      Story.model((model) => {
        expect(model.autoPlay).toBe(false)
      }),
      Story.Command.resolveAll(
        [{ name: 'PlayGreeting' }, Greeting.SoundPlayed()],
      ),
      Story.Command.expectNone(),
    )
  })

  it('H3: speechSynthesis.cancel() before speak() can drop utterance', () => {
    // The playGreeting command calls speechSynthesis.cancel() then immediately
    // creates an utterance and calls speak(). In Chrome, this race condition
    // causes the new utterance to be silently dropped.
    // Verify the code path exists.
    Story.story(
      Greeting.update,
      Story.with(Greeting.init),
      Story.message(Greeting.ClickedRecord()),
      Story.Command.resolveAll(
        [{ name: 'Record' }, Greeting.RecordedAudio({ audioUrl: 'data:audio/wav;base64,test' })],
      ),
      Story.message(Greeting.ClickedPlay()),
      Story.Command.resolveAll(
        [{ name: 'PlayGreeting' }, Greeting.SoundPlayed()],
      ),
      Story.model((model) => {
        expect(model.playCount).toBe(1)
      }),
    )
  })
})
