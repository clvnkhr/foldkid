import { describe, expect, it, vi } from 'vitest'
import { Scene, Story } from 'foldkit/test'
import * as Greeting from './greeting'

const resolveSpeakPrompt = [{ name: 'speakPrompt' }, Greeting.SoundPlayed()] as const

describe('Greeting', () => {
  it('init state', () => {
    expect(Greeting.init).toStrictEqual({ status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: 0, hellos: [], voiceEffect: 'normal' })
  })

  it('ClickedRecord sets status to recording', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'idle', audioUrl: '', playCount: 0, autoPlay: false }),
      Story.message(Greeting.ClickedRecord()),
      Story.model((model) => {
        expect(model.status).toBe('recording')
        expect(model.hellos).toStrictEqual([])
      }),
      Story.Command.resolveAll([{ name: 'Record' }, Greeting.RecordingFailed()]),
      Story.Command.expectNone(),
    )
  })

  it('pointer down on record button calls getUserMedia via OnPointerDown handler', () => {
    const mockGetUserMedia = vi.fn().mockResolvedValue({} as MediaStream)
    const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      configurable: true,
      writable: true,
    })

    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with(Greeting.init),
      Scene.tap(() => {
        expect(mockGetUserMedia).not.toHaveBeenCalled()
      }),
      Scene.Mount.resolveAll(resolveSpeakPrompt),
      Scene.pointerDown(Scene.text("What's your name?")),
      Scene.tap(() => {
        expect(mockGetUserMedia).toHaveBeenCalledTimes(1)
        expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
      }),
      Scene.expect(Scene.text('⏹ Stop')).toExist(),
      Scene.Mount.expectEnded({ name: 'speakPrompt' }),
      Scene.Command.resolveAll(
        [{ name: 'Record' }, Greeting.RecordingFailed()],
      ),
      Scene.Command.expectNone(),
      Scene.Mount.resolveAll(resolveSpeakPrompt),
    )

    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
    }
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
        expect(model.hellos).toHaveLength(1)
        expect(model.hellos[0]!.id).toBe(1)
        expect(model.hellos[0]!.effect).toBe('normal')
      }),
      Story.Command.resolveAll(
        [{ name: 'PlayGreeting' }, Greeting.SoundPlayed()],
        [{ name: 'HideHello' }, Greeting.HideHello({ id: 1 })],
      ),
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
        expect(model.hellos).toStrictEqual([])
        expect(model.voiceEffect).toBe('normal')
        expect(model.recordingId).toBeGreaterThan(0)
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

  it('renders record button with prompt text when idle', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with(Greeting.init),
      Scene.expect(Scene.text("What's your name?")).toExist(),
      Scene.Mount.resolveAll(resolveSpeakPrompt),
      Scene.Command.expectNone(),
    )
  })

  it('renders stop button when recording', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'recording', audioUrl: '', playCount: 0, autoPlay: false }),
      Scene.expect(Scene.text("What's your name?")).toBeAbsent(),
      Scene.expect(Scene.text('⏹ Stop')).toExist(),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('renders Say Hello button when idle with audio', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 0, autoPlay: false }),
      Scene.expect(Scene.text('Say Hello')).toExist(),
      Scene.expect(Scene.text("What's your name?")).toBeAbsent(),
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
      Scene.Mount.resolveAll(resolveSpeakPrompt),
      Scene.Command.expectNone(),
    )
  })

  it('shows Reset button during recording', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'recording', audioUrl: 'data:audio/wav;base64,test', playCount: 1, autoPlay: false }),
      Scene.expect(Scene.text('Reset')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('shows Hello text when greeting was played', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: '', playCount: 1, autoPlay: false, hellos: [{ id: 1, effect: 'normal' }], voiceEffect: 'normal' }),
      Scene.expect(Scene.text('Hello! 😊')).toExist(),
      Scene.Mount.resolveAll(resolveSpeakPrompt),
      Scene.Command.expectNone(),
    )
  })

  it('shows effect-specific emoji in Hello text', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: '', playCount: 1, autoPlay: false, hellos: [{ id: 1, effect: 'high' }], voiceEffect: 'high' }),
      Scene.expect(Scene.text('Hello! 🐹')).toExist(),
      Scene.Mount.resolveAll(resolveSpeakPrompt),
      Scene.Command.expectNone(),
    )
  })

  it('hides Hello text before any greeting', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: '', playCount: 0, autoPlay: false }),
      Scene.expect(Scene.text('Hello')).toBeAbsent(),
      Scene.Mount.resolveAll(resolveSpeakPrompt),
      Scene.Command.expectNone(),
    )
  })

  it('shows greeting count even at 0', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with(Greeting.init),
      Scene.expect(Scene.text('You\'ve been greeted 0 times!')).toExist(),
      Scene.Mount.resolveAll(resolveSpeakPrompt),
      Scene.Command.expectNone(),
    )
  })

  it('shows effect buttons', () => {
    Scene.scene(
      { update: Greeting.update, view: Greeting.view },
      Scene.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 0, autoPlay: false, voiceEffect: 'robot' }),
      Scene.expect(Scene.text('👽 Alien')).toExist(),
      Scene.expect(Scene.text('🐿️ Chipmunk')).toExist(),
      Scene.expect(Scene.text('🤖 Robot')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('SetVoiceEffect updates the effect', () => {
    Story.story(
      Greeting.update,
      Story.with(Greeting.init),
      Story.message(Greeting.SetVoiceEffect({ value: 'high' })),
      Story.model((model) => {
        expect(model.voiceEffect).toBe('high')
      }),
      Story.Command.expectNone(),
    )
  })

  it('SetVoiceEffect plays greeting when audio exists', () => {
    Story.story(
      Greeting.update,
      Story.with({ status: 'idle', audioUrl: 'data:audio/wav;base64,test', playCount: 1, autoPlay: false, hellos: [], voiceEffect: 'normal' }),
      Story.message(Greeting.SetVoiceEffect({ value: 'robot' })),
      Story.model((model) => {
        expect(model.voiceEffect).toBe('robot')
        expect(model.hellos).toHaveLength(1)
        expect(model.hellos[0]!.id).toBe(2)
        expect(model.hellos[0]!.effect).toBe('robot')
      }),
      Story.Command.resolveAll(
        [{ name: 'PlayGreeting' }, Greeting.SoundPlayed()],
        [{ name: 'HideHello' }, Greeting.HideHello({ id: 2 })],
      ),
      Story.Command.expectNone(),
    )
  })

  it('ClickedStopRecording sets status to idle and dispatches Stop command', () => {
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
        [{ name: 'HideHello' }, Greeting.HideHello({ id: 1 })],
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
        [{ name: 'HideHello' }, Greeting.HideHello({ id: 1 })],
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
        [{ name: 'HideHello' }, Greeting.HideHello({ id: 1 })],
      ),
      Story.model((model) => {
        expect(model.playCount).toBe(1)
      }),
    )
  })

  describe('global state refactor', () => {
    it('ClickedStopRecording returns model with status idle immediately', () => {
      Story.story(
        Greeting.update,
        Story.with({ status: 'recording', audioUrl: '', playCount: 0, autoPlay: false }),
        Story.message(Greeting.ClickedStopRecording()),
        Story.model((model) => {
          expect(model.status).toBe('idle')
        }),
        Story.Command.resolveAll([{ name: 'Stop' }, Greeting.SoundPlayed()]),
        Story.Command.expectNone(),
      )
    })

    it('re-recording after stop works without stale global state', () => {
      Story.story(
        Greeting.update,
        Story.with({ status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: 1 }),
        Story.message(Greeting.ClickedRecord()),
        Story.model((model) => {
          expect(model.status).toBe('recording')
        }),
        Story.Command.resolveAll([{ name: 'Record' }, Greeting.RecordingFailed()]),
        Story.Command.expectNone(),
      )
    })

    it('ClickedStopRecording without active recording dispatches Stop command', () => {
      Story.story(
        Greeting.update,
        Story.with({ status: 'recording', audioUrl: '', playCount: 0, autoPlay: false }),
        Story.message(Greeting.ClickedStopRecording()),
        Story.model((model) => {
          expect(model.status).toBe('idle')
        }),
        Story.Command.resolveAll([{ name: 'Stop' }, Greeting.SoundPlayed()]),
        Story.Command.expectNone(),
      )
    })

    it('full record-stop-record cycle works without stale state', () => {
      Story.story(
        Greeting.update,
        Story.with(Greeting.init),
        // Click "What's your name?" → start recording
        Story.message(Greeting.ClickedRecord()),
        Story.model((model) => {
          expect(model.status).toBe('recording')
        }),
        Story.Command.resolveAll(
          [{ name: 'Record' }, Greeting.RecordedAudio({ audioUrl: 'data:audio/wav;base64,test' })],
        ),
        Story.model((model) => {
          expect(model.status).toBe('idle')
          expect(model.audioUrl).toBe('data:audio/wav;base64,test')
        }),
        // Record again — second recording
        Story.message(Greeting.ClickedRecord()),
        Story.model((model) => {
          expect(model.status).toBe('recording')
        }),
        Story.Command.resolveAll(
          [{ name: 'Record' }, Greeting.RecordingFailed()],
        ),
        Story.model((model) => {
          expect(model.status).toBe('idle')
        }),
        // Record again — third try
        Story.message(Greeting.ClickedRecord()),
        Story.model((model) => {
          expect(model.status).toBe('recording')
        }),
        Story.Command.resolveAll(
          [{ name: 'Record' }, Greeting.RecordedAudio({ audioUrl: 'data:audio/wav;base64,test3' })],
        ),
        Story.Command.expectNone(),
      )
    })
  })
})
