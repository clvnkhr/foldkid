import { Effect, Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { t, tf } from '../i18n'
import { findVoice } from '../speech'

const MAX_RECORDING_MS = 10_000
const SILENCE_THRESHOLD = 3
const SILENCE_FRAMES_LIMIT = 90
const TRIM_THRESHOLD = 0.02
const TRIM_PADDING_SAMPLES = 200

export const Model = S.Struct({ status: S.String, audioUrl: S.String, playCount: S.Number, autoPlay: S.Boolean, recordingId: S.Number })
export type Model = typeof Model.Type

export const ClickedRecord = m('GreetingClickedRecord')
export const RecordedAudio = m('GreetingRecordedAudio', { audioUrl: S.String })
export const RecordingFailed = m('GreetingRecordingFailed')
export const ClickedPlay = m('GreetingClickedPlay')
export const ClickedReset = m('GreetingClickedReset')
export const SoundPlayed = m('GreetingSoundPlayed')

export const Message = S.Union([ClickedRecord, RecordedAudio, RecordingFailed, ClickedPlay, ClickedReset, SoundPlayed])
export type Message = typeof Message.Type

export const init: Model = { status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: 0 }

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
    let rafId = 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let audioCtx: AudioContext | null = null
    let mediaRecorder: MediaRecorder | null = null
    let stream: MediaStream | null = null

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((ms) => {
        if (cancelled) {
          ms.getTracks().forEach((t) => t.stop())
          return
        }
        stream = ms
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(ms)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        const recorder = new MediaRecorder(ms)
        mediaRecorder = recorder
        const chunks: Blob[] = []

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        const processAudio = (): void => {
          if (timeoutId !== null) clearTimeout(timeoutId)
          source.disconnect()
          ms.getTracks().forEach((t) => t.stop())

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
                resume(Effect.succeed(RecordingFailed()))
              })
          })
        }

        recorder.onstop = processAudio
        recorder.onerror = () => {
          source.disconnect()
          ms.getTracks().forEach((t) => t.stop())
          if (audioCtx) audioCtx.close()
          resume(Effect.succeed(RecordingFailed()))
        }

        let silentFrames = 0
        const data = new Uint8Array(analyser.frequencyBinCount)

        const detectSilence = (): void => {
          if (cancelled) return
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            sum += ((data[i] as number) - 128) ** 2
          }
          const rms = Math.sqrt(sum / data.length)
          if (rms < SILENCE_THRESHOLD) {
            silentFrames++
            if (silentFrames >= SILENCE_FRAMES_LIMIT) {
              if (recorder.state === 'recording') recorder.stop()
              return
            }
          } else {
            silentFrames = 0
          }
          rafId = requestAnimationFrame(detectSilence)
        }

        timeoutId = setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop()
        }, MAX_RECORDING_MS)

        recorder.start()
        rafId = requestAnimationFrame(detectSilence)
      })
      .catch(() => {
        resume(Effect.succeed(RecordingFailed()))
      })

    return Effect.sync(() => {
      cancelled = true
      cancelAnimationFrame(rafId)
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop()
      } else if (stream) {
        stream.getTracks().forEach((t) => t.stop())
        if (audioCtx) audioCtx.close()
      }
    })
  }),
})

const playGreeting = (audioUrl: string, language: string): Command.Command<Message> => ({
  name: 'PlayGreeting',
  effect: Effect.sync(() => {
    const ctx = new AudioContext()
    let audioBuffer: AudioBuffer | null = null
    let helloDone = false

    const tryPlay = (): void => {
      if (!helloDone || !audioBuffer) return
      const src = ctx.createBufferSource()
      src.buffer = audioBuffer
      src.connect(ctx.destination)
      src.start()
      src.onended = () => { ctx.close() }
    }

    fetch(audioUrl).then(r => r.arrayBuffer()).then(buf =>
      ctx.decodeAudioData(buf),
    ).then(buf => {
      audioBuffer = buf
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
        { ...model, status: 'recording', autoPlay: false },
        [record()],
      ],
      GreetingRecordedAudio: (msg) => [
        { ...model, status: 'idle', audioUrl: msg.audioUrl, autoPlay: true, recordingId: (model.recordingId ?? 0) + 1 },
        [],
      ],
      GreetingRecordingFailed: () => [
        { ...model, status: 'idle' },
        [],
      ],
      GreetingClickedPlay: () => [
        { ...model, autoPlay: false, playCount: model.playCount + 1 },
        muted ? [] : [playGreeting(model.audioUrl, language)],
      ],
      GreetingClickedReset: () => [
        { status: 'idle', audioUrl: '', playCount: 0, autoPlay: false, recordingId: 0 },
        [],
      ],
      GreetingSoundPlayed: () => [model, []],
    }),
  )

export const view = (model: Model, language: string = 'en') => {
  const h = html<Message>()

  return h.div(
    [h.Class('page')],
    [
      h.div([h.Class('card')], [
        h.h1([h.Class('title')], [t('greetingTitle', language)]),
        model.status === 'recording'
          ? h.p([h.Class('recording-indicator')], [t('recording', language)])
          : null,
        h.div([h.Class('buttons')], [
          model.status === 'idle' && model.audioUrl
            ? h.button(
              [
                h.OnClick(ClickedPlay()),
                h.Class('btn btn-primary'),
                h.Key('say-hello-' + model.recordingId),
                ...(model.autoPlay ? [h.OnMount({
                  name: 'autoPlayGreeting',
                  f: (el) => {
                    requestAnimationFrame(() => (el as HTMLElement).click())
                    return Stream.empty
                  },
                })] : []),
              ],
              [t('sayHello', language)],
            )
            : null,
          model.status === 'idle'
            ? h.button(
              [h.OnClick(ClickedRecord()), h.Class('btn btn-primary')],
              [t('recordName', language)],
            )
            : null,
          model.audioUrl || model.playCount > 0
            ? h.button(
              [h.OnClick(ClickedReset()), h.Class('btn btn-secondary')],
              [t('reset', language)],
            )
            : null,
        ]),
        h.div([h.Class('display-area')], [
          model.status === 'recording'
            ? h.p([h.Class('recording-animation')], ['⏺'])
            : null,
          model.playCount > 0
            ? h.p([h.Class('count')], [tf('greeted', language, model.playCount)])
            : null,
        ]),
      ]),
    ],
  )
}
