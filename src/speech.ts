import { Effect } from 'effect'

const getSpeechSynthesis = (): SpeechSynthesis | undefined =>
  typeof globalThis.speechSynthesis === 'undefined' ? undefined : globalThis.speechSynthesis

export const findVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  const synth = getSpeechSynthesis()
  if (!synth) return undefined
  const voices = synth.getVoices()
  if (voices.length === 0) return undefined
  return voices.find(v => v.lang.startsWith(lang)) ?? voices.find(v => v.lang.startsWith(lang.slice(0, 2)))
}

export const speak = <Msg>(
  text: string,
  msg: Msg,
  options?: { rate?: number; pitch?: number; lang?: string },
) => ({
  name: 'Speak',
  effect: Effect.callback<Msg>((resume) => {
    const synth = getSpeechSynthesis()
    if (!synth || typeof globalThis.SpeechSynthesisUtterance === 'undefined') {
      resume(Effect.succeed(msg))
      return Effect.void
    }
    synth.cancel()
    const timer = globalThis.setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = options?.rate ?? 0.85
      utterance.pitch = options?.pitch ?? 1.1
      utterance.lang = options?.lang ?? 'en'
      const voice = findVoice(utterance.lang)
      if (voice) utterance.voice = voice
      utterance.onend = () => resume(Effect.succeed(msg))
      utterance.onerror = () => resume(Effect.succeed(msg))
      synth.speak(utterance)
    }, 0)
    return Effect.sync(() => { globalThis.clearTimeout(timer) })
  }),
})
