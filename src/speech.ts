import { Effect } from 'effect'
import { playTone } from './audio'

export const DEFAULT_SPEECH_RATE = 0.85
export const DEFAULT_SPEECH_PITCH = 1.1

export interface SpeechOptions {
  readonly rate?: number
  readonly pitch?: number
  readonly lang?: string
}

const getSpeechSynthesis = (): SpeechSynthesis | undefined =>
  typeof globalThis.speechSynthesis === 'undefined' ? undefined : globalThis.speechSynthesis

export const findVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  const synth = getSpeechSynthesis()
  if (!synth) return undefined
  const voices = synth.getVoices()
  if (voices.length === 0) return undefined
  return voices.find(v => v.lang.startsWith(lang)) ?? voices.find(v => v.lang.startsWith(lang.slice(0, 2)))
}

// NOTE (iOS Safari): the event that triggers the message dispatch MUST be a
// qualifying user gesture for audio. `touchstart` and `pointerdown` with touch
// do NOT qualify — `touchend`, `pointerup`, and `click` DO. Using `touchstart`
// means Web Audio and speech synthesis commands (which run async via forkDetach)
// will be silently blocked. Always use `OnTouchEnd` or `OnPointerUp` for game
// interactions that trigger audio or speech.
export const speak = <Msg>(
  text: string,
  msg: Msg,
  options?: SpeechOptions,
) => ({
  name: 'Speak',
  effect: playTone(800, 0.06, 'square').pipe(
    Effect.flatMap(() =>
      Effect.sync(() => {
        const synth = getSpeechSynthesis()
        if (!synth || typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
          return msg
        }
        synth.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = options?.rate ?? DEFAULT_SPEECH_RATE
        utterance.pitch = options?.pitch ?? DEFAULT_SPEECH_PITCH
        utterance.lang = options?.lang ?? 'en'
        const voice = findVoice(utterance.lang)
        if (voice) utterance.voice = voice
        try {
          synth.speak(utterance)
        } catch {
          // speech synthesis failed
        }
        return msg
      }),
    ),
  ),
})
