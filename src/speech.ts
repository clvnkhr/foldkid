import { Effect } from 'effect'

export const findVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  const voices = speechSynthesis.getVoices()
  if (voices.length === 0) return undefined
  return voices.find(v => v.lang.startsWith(lang)) ?? voices.find(v => v.lang.startsWith(lang.slice(0, 2)))
}

export const speak = <Msg>(
  text: string,
  msg: Msg,
  options?: { rate?: number; pitch?: number; lang?: string },
) => ({
  name: 'Speak',
  effect: Effect.sync(() => {
    speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = options?.rate ?? 0.85
    utterance.pitch = options?.pitch ?? 1.1
    utterance.lang = options?.lang ?? 'en'
    const voice = findVoice(utterance.lang)
    if (voice) utterance.voice = voice
    speechSynthesis.speak(utterance)
  }).pipe(Effect.as(msg)),
})
