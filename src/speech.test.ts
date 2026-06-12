import { Effect } from 'effect'
import { beforeAll, describe, expect, it } from 'vitest'
import { findVoice, speak } from './speech'

let lastUtterance: SpeechSynthesisUtterance | null = null

beforeAll(() => {
  // Mock speechSynthesis for test environment
  const mockVoices: SpeechSynthesisVoice[] = []
  const mockSpeechSynthesis = {
    getVoices: () => mockVoices,
    cancel: () => { lastUtterance = null },
    speak: (utterance: SpeechSynthesisUtterance) => {
      lastUtterance = utterance
      setTimeout(() => utterance.onend?.(), 0)
    },
    pending: false,
    speaking: false,
    paused: false,
    onvoiceschanged: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    pause: () => {},
    resume: () => {},
  }
  globalThis.speechSynthesis = mockSpeechSynthesis as unknown as SpeechSynthesis
  globalThis.SpeechSynthesisUtterance = class MockUtterance {
    text: string
    rate = 1
    pitch = 1
    lang = 'en'
    voice: SpeechSynthesisVoice | null = null
    onstart: (() => void) | null = null
    onend: (() => void) | null = null
    onerror: ((e: SpeechSynthesisErrorEvent) => void) | null = null
    onpause: (() => void) | null = null
    onresume: (() => void) | null = null
    onmark: ((e: SpeechSynthesisEvent) => void) | null = null
    onboundary: ((e: SpeechSynthesisEvent) => void) | null = null
    constructor(text: string) { this.text = text }
  } as unknown as typeof SpeechSynthesisUtterance
})

describe('speech', () => {
  it('findVoice returns undefined when no voices available', () => {
    // In test environment, mock speechSynthesis.getVoices() returns []
    expect(findVoice('en')).toBeUndefined()
  })

  it('speak returns a command with name Speak', () => {
    const cmd = speak('hello', 'test_msg')
    expect(cmd.name).toBe('Speak')
  })

  it('speak returns a command with an Effect', () => {
    const cmd = speak('world', 42)
    expect(cmd.effect).toBeDefined()
    expect(typeof cmd.effect.pipe).toBe('function')
  })

  it('speak accepts rate/pitch/lang options', () => {
    const cmd = speak('hello', 'msg', { rate: 0.5, pitch: 2, lang: 'fr' })
    expect(cmd.name).toBe('Speak')
  })

  it('speak produces the correct result message', async () => {
    const cmd = speak('test', 'result_msg')
    const result = await Effect.runPromise(cmd.effect)
    expect(result).toBe('result_msg')
  })
})
