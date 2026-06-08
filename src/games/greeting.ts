import { Effect, Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { t, tf } from '../i18n'
import { findVoice } from '../speech'

const TRIM_THRESHOLD = 0.02
const TRIM_PADDING_SAMPLES = 200

let activeMediaRecorder: MediaRecorder | null = null
let activeMediaStream: MediaStream | null = null

const StatusType = S.Union([S.Literal('idle'), S.Literal('recording')])

export const Model = S.Struct({
  status: StatusType,
  audioUrl: S.String,
  playCount: S.Number,
  autoPlay: S.Boolean,
  recordingId: S.Number,
  hellos: S.Array(S.Struct({ id: S.Number, effect: S.String, left: S.String, top: S.String, color: S.String })),
  voiceEffect: S.String,
})
export type Model = typeof Model.Type

export const ClickedRecord = m('GreetingClickedRecord')
export const ClickedStopRecording = m('GreetingClickedStopRecording')
export const RecordedAudio = m('GreetingRecordedAudio', { audioUrl: S.String })
export const RecordingFailed = m('GreetingRecordingFailed')
export const ClickedPlay = m('GreetingClickedPlay')
export const ClickedReset = m('GreetingClickedReset')
export const SoundPlayed = m('GreetingSoundPlayed')
export const SetVoiceEffect = m('GreetingSetVoiceEffect', { value: S.String })
export const HideHello = m('GreetingHideHello', { id: S.Number })

export const Message = S.Union([ClickedRecord, ClickedStopRecording, RecordedAudio, RecordingFailed, ClickedPlay, ClickedReset, SoundPlayed, SetVoiceEffect, HideHello])
export type Message = typeof Message.Type

export const init: Model = { status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: 0, hellos: [], voiceEffect: 'normal' }

const trimSilence = (samples: Float32Array): Float32Array => {
  const threshold = TRIM_THRESHOLD * (2 ** 0.5)
  let start = 0
  while (start < samples.length && Math.abs(samples[start] as number) < threshold) start++
  start = Math.max(0, start - TRIM_PADDING_SAMPLES)
  let end = samples.length - 1
  while (end > start && Math.abs(samples[end] as number) < threshold) end--
  end = Math.min(samples.length - 1, end + TRIM_PADDING_SAMPLES)
  return samples.slice(start, end + 1)
}

const encodeWav = (samples: Float32Array, sampleRate: number): Blob => {
  const len = samples.length
  const buffer = new ArrayBuffer(44 + len * 2)
  const view = new DataView(buffer)
  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + len * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, len * 2, true)
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] as number))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

const record = (): Command.Command<Message> => ({
  name: 'Record',
  effect: Effect.callback<Message>((resume) => {
    let cancelled = false
    let audioCtx: AudioContext | null = null
    let mediaRecorder: MediaRecorder | null = null
    let stream: MediaStream | null = null

    const fail = (): void => {
      resume(Effect.succeed(RecordingFailed()))
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((ms) => {
        if (cancelled) {
          ms.getTracks().forEach((t) => t.stop())
          return
        }
        stream = ms
        activeMediaStream = ms
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(ms)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        const recorder = new MediaRecorder(ms)
        mediaRecorder = recorder
        activeMediaRecorder = recorder
        const chunks: Blob[] = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        const processAudio = (): void => {
          source.disconnect()
          ms.getTracks().forEach((t) => t.stop())
          activeMediaRecorder = null
          activeMediaStream = null

          const blob = new Blob(chunks, { type: recorder.mimeType })
          blob.arrayBuffer().then((arrayBuffer) => {
            const decodeCtx = new AudioContext()
            decodeCtx.decodeAudioData(arrayBuffer)
              .then((audioBuffer) => {
                const channelData = audioBuffer.getChannelData(0)
                const trimmed = trimSilence(channelData)
                const wavBlob = encodeWav(trimmed, audioBuffer.sampleRate)
                const reader = new FileReader()
                reader.onloadend = () => {
                  decodeCtx.close()
                  if (audioCtx) audioCtx.close()
                  resume(Effect.succeed(RecordedAudio({ audioUrl: reader.result as string })))
                }
                reader.readAsDataURL(wavBlob)
              })
              .catch(() => {
                if (audioCtx) audioCtx.close()
                fail()
              })
          })
        }

        recorder.onstop = processAudio
        recorder.onerror = () => {
          source.disconnect()
          ms.getTracks().forEach((t) => t.stop())
          activeMediaRecorder = null
          activeMediaStream = null
          if (audioCtx) audioCtx.close()
          fail()
        }

        recorder.start()
      })
      .catch(() => {
        fail()
      })

    return Effect.sync(() => {
      cancelled = true
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop()
      } else if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        if (audioCtx) audioCtx.close()
      }
    })
  }),
})

const applyEffect = (ctx: AudioContext, source: AudioBufferSourceNode, effect: string): void => {
  switch (effect) {
    case 'normal':
      source.connect(ctx.destination)
      break
    case 'high':
      source.playbackRate.value = 1.5
      source.connect(ctx.destination)
      break
    case 'low':
      source.playbackRate.value = 0.6
      source.connect(ctx.destination)
      break
    case 'echo': {
      const delay = ctx.createDelay(1.0)
      delay.delayTime.value = 0.2
      const feedback = ctx.createGain()
      feedback.gain.value = 0.4
      source.connect(delay)
      delay.connect(feedback)
      feedback.connect(delay)
      source.connect(ctx.destination)
      delay.connect(ctx.destination)
      break
    }
    case 'highpass': {
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 3000
      source.connect(filter)
      filter.connect(ctx.destination)
      break
    }
    case 'lowpass': {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 800
      source.connect(filter)
      filter.connect(ctx.destination)
      break
    }
    case 'reverse':
      source.connect(ctx.destination)
      break
    case 'robot': {
      const gain = ctx.createGain()
      gain.gain.value = 0.5
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 50
      lfo.type = 'sine'
      const mod = ctx.createGain()
      mod.gain.value = 0.4
      lfo.connect(mod)
      mod.connect(gain.gain)
      source.connect(gain)
      gain.connect(ctx.destination)
      lfo.start()
      break
    }
    case 'alien': {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 3
      lfo.type = 'sine'
      const mod = ctx.createGain()
      mod.gain.value = 0.5
      lfo.connect(mod)
      mod.connect(source.playbackRate)
      source.playbackRate.value = 1
      source.connect(ctx.destination)
      lfo.start()
      break
    }
    case 'chipmunk':
      source.playbackRate.value = 2.5
      source.connect(ctx.destination)
      break
    default:
      source.connect(ctx.destination)
  }
}

const playGreeting = (audioUrl: string, language: string, voiceEffect: string): Command.Command<Message> => ({
  name: 'PlayGreeting',
  effect: Effect.sync(() => {
    const ctx = new AudioContext()
    let audioBuffer: AudioBuffer | null = null
    let helloDone = false

    const tryPlay = (): void => {
      if (!helloDone || !audioBuffer) return
      const src = ctx.createBufferSource()
      src.buffer = audioBuffer
      applyEffect(ctx, src, voiceEffect)
      src.start()
      src.onended = () => { ctx.close() }
    }

    fetch(audioUrl).then(r => r.arrayBuffer()).then(buf =>
      ctx.decodeAudioData(buf),
    ).then(buf => {
      audioBuffer = buf
      if (voiceEffect === 'reverse') {
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
          audioBuffer.getChannelData(c).reverse()
        }
      }
      tryPlay()
    }).catch(() => { ctx.close() })

    const hello = new SpeechSynthesisUtterance(t('greetingHello', language))
    hello.rate = 0.85
    hello.pitch = 1.1
    hello.lang = language
    const voice = findVoice(language)
    if (voice) hello.voice = voice
    hello.onend = () => {
      helloDone = true
      tryPlay()
    }
    speechSynthesis.speak(hello)
  }).pipe(Effect.as(SoundPlayed())),
})

const EFFECTS = [
  { value: 'normal', emoji: '😊', labelKey: 'effectNormal' as const },
  { value: 'high', emoji: '🐹', labelKey: 'effectHigh' as const },
  { value: 'low', emoji: '🦁', labelKey: 'effectLow' as const },
  { value: 'echo', emoji: '🗣️', labelKey: 'effectEcho' as const },
  { value: 'highpass', emoji: '📞', labelKey: 'effectHighpass' as const },
  { value: 'lowpass', emoji: '🧸', labelKey: 'effectLowpass' as const },
  { value: 'reverse', emoji: '⏪', labelKey: 'effectReverse' as const },
  { value: 'robot', emoji: '🤖', labelKey: 'effectRobot' as const },
  { value: 'alien', emoji: '👽', labelKey: 'effectAlien' as const },
  { value: 'chipmunk', emoji: '🐿️', labelKey: 'effectChipmunk' as const },
] as const

const randomHelloColor = (): string =>
  `hsl(${Math.round(Math.random() * 360)}, 80%, 55%)`

const stopRecordingCmd = (): Command.Command<Message> => ({
  name: 'Stop',
  effect: Effect.sync(() => {
    if (activeMediaRecorder && activeMediaRecorder.state === 'recording') {
      activeMediaRecorder.stop()
    } else if (activeMediaStream) {
      activeMediaStream.getTracks().forEach((t) => t.stop())
      activeMediaStream = null
    }
    activeMediaRecorder = null
    return SoundPlayed()
  }),
})

const hideHelloCmd = (id: number): Command.Command<Message> => ({
  name: 'HideHello',
  effect: Effect.callback<Message>((resume) => {
    setTimeout(() => {
      resume(Effect.succeed(HideHello({ id })))
    }, 1500)
  }),
})

export const update = (
  model: Model,
  message: Message,
  language: string = 'en',
  muted: boolean = false,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      GreetingClickedRecord: () => [
        { ...model, status: 'recording', autoPlay: false, hellos: [] },
        [record()],
      ],
      GreetingClickedStopRecording: () => [
        model,
        [stopRecordingCmd()],
      ],
      GreetingRecordedAudio: (msg) => [
        { ...model, status: 'idle', audioUrl: msg.audioUrl, autoPlay: true, recordingId: (model.recordingId ?? 0) + 1 },
        [],
      ],
      GreetingRecordingFailed: (_msg) => [
        { ...model, status: 'idle' },
        [],
      ],
      GreetingClickedPlay: () => {
        const next = model.playCount + 1
        return [
          { ...model, autoPlay: false, playCount: next, hellos: [...(model.hellos ?? []), { id: next, effect: model.voiceEffect ?? 'normal', left: `${Math.round(Math.random() * 60 - 30)}%`, top: `${Math.round(Math.random() * 60 - 30)}%`, color: randomHelloColor() }] },
          muted ? [hideHelloCmd(next)] : [playGreeting(model.audioUrl, language, model.voiceEffect ?? 'normal'), hideHelloCmd(next)],
        ]
      },
      GreetingClickedReset: () => [
        { status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: (model.recordingId ?? 0) + 1, hellos: [], voiceEffect: 'normal' },
        [],
      ],
      GreetingSoundPlayed: () => [model, []],
      GreetingHideHello: (msg) => [{ ...model, hellos: (model.hellos ?? []).filter(h => h.id !== msg.id) }, []],
      GreetingSetVoiceEffect: (msg) => {
        if (model.status === 'idle' && model.audioUrl) {
          const next = model.playCount + 1
          return [
            { ...model, voiceEffect: msg.value, playCount: next, hellos: [...(model.hellos ?? []), { id: next, effect: msg.value ?? 'normal', left: `${Math.round(Math.random() * 60 - 30)}%`, top: `${Math.round(Math.random() * 60 - 30)}%`, color: randomHelloColor() }] },
            muted ? [hideHelloCmd(next)] : [playGreeting(model.audioUrl, language, msg.value), hideHelloCmd(next)],
          ]
        }
        return [
          { ...model, voiceEffect: msg.value },
          [],
        ]
      },
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  const hasState = model.audioUrl || model.playCount > 0

  const mainText = model.status === 'recording'
    ? t('stopRecording', language)
    : model.audioUrl
      ? t('sayHello', language)
      : t('recording', language)

  const mainClass = 'btn btn-primary btn-large' + (model.status === 'recording' ? ' recording' : '')

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.div([h.Class('buttons')], [
          h.button(
            [
              h.Class(mainClass),
              h.Key('main-action-' + model.recordingId),
              ...(model.status === 'recording'
                ? [h.OnClick(ClickedStopRecording())]
                : model.audioUrl
                  ? [h.OnClick(ClickedPlay())]
                  : [h.OnClick(ClickedRecord())]),
              ...(model.status === 'idle' && !model.audioUrl
                ? [h.OnMount({
                  name: 'speakPrompt',
                  f: () => {
                    const hello = new SpeechSynthesisUtterance(t('recording', language))
                    hello.rate = 0.85
                    hello.pitch = 1.1
                    hello.lang = language
                    const voice = findVoice(language)
                    if (voice) hello.voice = voice
                    speechSynthesis.speak(hello)
                    return Stream.empty
                  },
                })]
                : []),
              ...(model.status === 'idle' && model.audioUrl && model.autoPlay
                ? [h.OnMount({
                  name: 'autoPlayGreeting',
                  f: (el) => {
                    requestAnimationFrame(() => (el as HTMLElement).click())
                    return Stream.empty
                  },
                })]
                : []),
            ],
            [mainText],
          ),
          h.button(
            [
              h.Class('btn btn-secondary'),
              h.Key('reset-btn'),
              ...(hasState ? [h.OnClick(ClickedReset())] : []),
            ],
            [t('reset', language)],
          ),
        ]),
          h.div([h.Class('effect-buttons')], [
            ...EFFECTS.map(({ value, emoji, labelKey }) =>
              h.button(
                [
                  h.Class(value === model.voiceEffect ? 'btn btn-primary' : 'btn btn-secondary'),
                  h.OnClick(SetVoiceEffect({ value })),
                ],
                [`${emoji} ${t(labelKey, language)}`],
              ),
            ),
          ]),
          h.div([h.Class('display-area')], [
          ...(model.hellos ?? []).map(hello =>
            h.p(
              [h.Class('hello-text'), h.Key('hello-' + hello.id), h.Style({ left: hello.left, top: hello.top, color: hello.color })],
              [`Hello! ${(EFFECTS.find(e => e.value === hello.effect) ?? EFFECTS[0]).emoji}`],
            ),
          ),
          h.p([h.Class('count')], [tf('greeted', language, model.playCount)]),
        ]),
      ]),
    ],
  )
}
