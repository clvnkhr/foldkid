import { Stream } from 'effect'
import { html } from 'foldkit/html'

import { ClickedLanding } from '../message'

type AudioTestMessage = ReturnType<typeof ClickedLanding>

// Minimal silent WAV (1 sample, 16-bit mono, 44.1kHz) — used to upgrade
// iOS Safari's audio session from "ambient" to "playback" so Web Audio
// can bypass the hardware mute switch.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=='

const playTone = (ctx: AudioContext, freq: number, dur: number): void => {
  const t = ctx.currentTime + 0.01
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.3, t)
  gain.gain.linearRampToValueAtTime(0, t + dur)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

const playSilentWav = (): void => {
  try {
    const a = new Audio(SILENT_WAV)
    a.play().catch(() => {})
  } catch { /* ignore */ }
}

const setAudioSessionPlayback = (): void => {
  try {
    const nav = navigator as { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
  } catch { /* ignore */ }
}

// ============================================================
// DIAGNOSTIC — report device info to console
// ============================================================
const logDiagnostics = (): void => {
  console.log('=== AudioContext Diagnostic ===')
  console.log('User agent:', navigator.userAgent)
  console.log('Has AudioContext:', typeof AudioContext !== 'undefined')
  try {
    const ctx = new AudioContext()
    console.log('Fresh ctx state:', ctx.state)
    console.log('Fresh ctx sampleRate:', ctx.sampleRate)
    console.log('Fresh ctx baseLatency:', ctx.baseLatency)
    ctx.close()
  } catch (e) {
    console.log('new AudioContext() threw:', e)
  }
  try {
    const nav = navigator as { audioSession?: { type: string } }
    console.log('Has audioSession:', !!nav.audioSession)
    if (nav.audioSession) console.log('audioSession.type:', nav.audioSession.type)
  } catch { /* ignore */ }
  try {
    const a = new Audio(SILENT_WAV)
    console.log('new Audio(SILENT_WAV) OK')
    a.play().then(() => console.log('Silent WAV play() resolved')).catch(e => console.log('Silent WAV play() rejected:', e))
  } catch (e) {
    console.log('new Audio() threw:', e)
  }
  console.log('===============================')
}

// ============================================================
// STRATEGIES — each is a function called from a pointerdown
// listener. The listener runs WITHIN the user gesture.
// ============================================================

// J: click event instead of pointerdown
const strategyJ = (): void => {
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// K: touchend event instead of pointerdown  
const strategyK = (): void => {
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// L: use pointerup (qualifies for touch)
const strategyL = (): void => {
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// M: Also add a silent WAV + audioSession playback upgrade
const strategyM = (): void => {
  setAudioSessionPlayback()
  playSilentWav()
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// N: audioSession only, then Web Audio
const strategyN = (): void => {
  setAudioSessionPlayback()
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// O: Silent WAV only, then Web Audio
const strategyO = (): void => {
  playSilentWav()
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// P: HTMLAudioElement fallback (not Web Audio at all)
const strategyP = (): void => {
  try {
    const a = new Audio()
    a.src = SILENT_WAV
    a.loop = true
    a.play().catch(() => {})
    // Play beep via Web Audio as well
    const ctx = new AudioContext()
    playTone(ctx, 440, 0.3)
  } catch { /* ignore */ }
}

// Q: Create ctx first, then play silent WAV, then beep
const strategyQ = (): void => {
  const ctx = new AudioContext()
  playSilentWav()
  playTone(ctx, 440, 0.3)
}

// R: audioSession + silent WAV + ctx + beep (full combo)
const strategyR = (): void => {
  setAudioSessionPlayback()
  playSilentWav()
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// S: Use OscillatorNode with start(0) instead of currentTime
const strategyS = (): void => {
  const ctx = new AudioContext()
  const t = 0
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 440
  gain.gain.setValueAtTime(0.3, t)
  gain.gain.linearRampToValueAtTime(0, t + 0.3)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.35)
}

// T: Create ctx, resume (if needed), wait 50ms via setTimeout, then beep
const strategyT = (): void => {
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  setTimeout(() => playTone(ctx, 440, 0.3), 50)
}

// U: Silent buffer trick — create 1-sample buffer and play before tone
const strategyU = (): void => {
  const ctx = new AudioContext()
  // Prime with a silent buffer
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start(ctx.currentTime)
  src.stop(ctx.currentTime + 0.01)
  // Then play real tone
  playTone(ctx, 440, 0.3)
}

// V: Create context, call resume(), then DON'T check state, just play
const strategyV = (): void => {
  const ctx = new AudioContext()
  ctx.resume().catch(() => {})
  playTone(ctx, 440, 0.3)
}

// W: Multiple event types — bind to click AND pointerup on same button
const strategyW = (): void => {
  const ctx = new AudioContext()
  playTone(ctx, 440, 0.3)
}

// X: Create context, DON'T call resume(), just play (might fail but worth trying)
const strategyX = (): void => {
  const ctx = new AudioContext()
  // NOT calling resume() — just try to play directly
  playTone(ctx, 440, 0.3)
}

// Y: Try webkitAudioContext (legacy Safari)
const strategyY = (): void => {
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext
  if (!AC) return
  const ctx = new AC()
  playTone(ctx, 440, 0.3)
}

// Z: HTMLAudioElement only — no Web Audio at all
const strategyZ = (): void => {
  // Generate a 440Hz sine WAV and play it via <audio>
  try {
    const sampleRate = 44100
    const duration = 0.3
    const numSamples = Math.floor(sampleRate * duration)
    const volume = 0.3
    const data = new Uint8Array(44 + numSamples * 2)
    // WAV header
    const writeString = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) data[offset + i] = s.charCodeAt(i)
    }
    writeString(0, 'RIFF')
    const fileSize = 36 + numSamples * 2
    data[4] = fileSize & 0xff; data[5] = (fileSize >> 8) & 0xff; data[6] = (fileSize >> 16) & 0xff; data[7] = (fileSize >> 24) & 0xff
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    data[16] = 16; data[17] = 0; data[18] = 0; data[19] = 0
    data[20] = 1; data[21] = 0
    data[22] = 1; data[23] = 0
    data[24] = (sampleRate) & 0xff; data[25] = (sampleRate >> 8) & 0xff; data[26] = (sampleRate >> 16) & 0xff; data[27] = (sampleRate >> 24) & 0xff
    const byteRate = sampleRate * 2
    data[28] = byteRate & 0xff; data[29] = (byteRate >> 8) & 0xff; data[30] = (byteRate >> 16) & 0xff; data[31] = (byteRate >> 24) & 0xff
    data[32] = 2; data[33] = 0
    data[34] = 16; data[35] = 0
    writeString(36, 'data')
    const dataSize = numSamples * 2
    data[40] = dataSize & 0xff; data[41] = (dataSize >> 8) & 0xff; data[42] = (dataSize >> 16) & 0xff; data[43] = (dataSize >> 24) & 0xff
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * volume * 32767
      const val = Math.max(-32768, Math.min(32767, sample))
      data[44 + i * 2] = val & 0xff
      data[44 + i * 2 + 1] = (val >> 8) & 0xff
    }
    const blob = new Blob([data], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const a = new Audio(url)
    a.onended = () => URL.revokeObjectURL(url)
    a.play().catch(() => {})
  } catch { /* ignore */ }
}

// ============================================================
// Mount helpers
// ============================================================
const mountTap = (name: string, eventType: string, fn: () => void) => ({
  name,
  f: (element: Element) => {
    element.addEventListener(eventType, (e) => {
      e.preventDefault()
      fn()
    }, { capture: true, passive: false })
    return Stream.never
  },
})

// For strategies that need multiple event types or the click event
const mountDual = (name: string, fn: () => void) => ({
  name,
  f: (element: Element) => {
    const handler = (e: Event) => { e.preventDefault(); fn() }
    element.addEventListener('pointerdown', handler, { capture: true, passive: false })
    element.addEventListener('click', handler, { capture: true, passive: false })
    return Stream.never
  },
})

const viewRow = (
  h: ReturnType<typeof html<AudioTestMessage>>,
  label: string,
  desc: string,
  strategy: string,
  mount: ReturnType<typeof mountTap | typeof mountDual>,
) =>
  h.div([
    h.Class('test-row'),
    h.OnMount(mount),
  ], [
    h.div([h.Class('test-label')], [
      h.strong([], [strategy]),
      h.span([h.Class('test-desc')], [desc]),
    ]),
    h.div([h.Class('test-btn')], [label]),
  ])

export const view = (_language: string) => {
  const h = html<AudioTestMessage>()

  return h.div([h.Class('test-container')], [
    h.a([h.Href('/'), h.Class('back-link')], ['← Back']),
    h.h1([], ['AudioContext Diagnostic — v2']),
    h.p([], [
      'First tap "Diagnose" to check console logs. Then tap each button. If you hear a 440Hz beep, that strategy works.',
      h.button([h.Class('test-btn'), h.Style({ marginLeft: '0.5rem' }), h.OnMount(mountTap('diag', 'pointerdown', logDiagnostics))], ['Diagnose']),
    ]),
    h.p([h.Class('test-note')], ['Check the Safari/iOS mute switch! Web Audio may be silent when mute is on. ']),
    h.h2([h.Style({ fontSize: '1rem', marginTop: '1rem' })], ['Group 1 — Different event types']),
    h.div([h.Class('test-grid')], [
      viewRow(h, 'Beep ▶', 'click event (ALWAYS qualifies)', 'J', mountTap('tap-j', 'click', strategyJ)),
      viewRow(h, 'Beep ▶', 'touchend (qualifies for touch)', 'K', mountTap('tap-k', 'touchend', strategyK)),
      viewRow(h, 'Beep ▶', 'pointerup (qualifies for touch)', 'L', mountTap('tap-l', 'pointerup', strategyL)),
      viewRow(h, 'Beep ▶', 'pointerdown+click (dual)', 'W', mountDual('tap-w', strategyW)),
    ]),
    h.h2([h.Style({ fontSize: '1rem', marginTop: '1rem' })], ['Group 2 — audioSession + silent WAV workarounds']),
    h.p([h.Class('test-note')], ['These fix iOS 26+ mute switch silencing Web Audio oscillators.']),
    h.div([h.Class('test-grid')], [
      viewRow(h, 'Beep ▶', 'audioSession=playback + Web Audio', 'N', mountTap('tap-n', 'pointerdown', strategyN)),
      viewRow(h, 'Beep ▶', 'Silent WAV + Web Audio', 'O', mountTap('tap-o', 'pointerdown', strategyO)),
      viewRow(h, 'Beep ▶', 'Silent WAV first, then Web Audio', 'Q', mountTap('tap-q', 'pointerdown', strategyQ)),
      viewRow(h, 'Beep ▶', 'audioSession + silent WAV + ctx', 'M', mountTap('tap-m', 'pointerdown', strategyM)),
      viewRow(h, 'Beep ▶', 'FULL: audioSession+WAV+click', 'R', mountTap('tap-r', 'click', strategyR)),
    ]),
    h.h2([h.Style({ fontSize: '1rem', marginTop: '1rem' })], ['Group 3 — Different Web Audio patterns']),
    h.div([h.Class('test-grid')], [
      viewRow(h, 'Beep ▶', 'osc.start(0) not currentTime', 'S', mountTap('tap-s', 'pointerdown', strategyS)),
      viewRow(h, 'Beep ▶', 'resume() + setTimeout 50ms', 'T', mountTap('tap-t', 'pointerdown', strategyT)),
      viewRow(h, 'Beep ▶', 'Silent buffer + tone', 'U', mountTap('tap-u', 'pointerdown', strategyU)),
      viewRow(h, 'Beep ▶', 'resume() then play immediately', 'V', mountTap('tap-v', 'pointerdown', strategyV)),
      viewRow(h, 'Beep ▶', 'NO resume() — play on suspended', 'X', mountTap('tap-x', 'pointerdown', strategyX)),
    ]),
    h.h2([h.Style({ fontSize: '1rem', marginTop: '1rem' })], ['Group 4 — Fallbacks & legacy']),
    h.div([h.Class('test-grid')], [
      viewRow(h, 'Beep ▶', 'webkitAudioContext', 'Y', mountTap('tap-y', 'pointerdown', strategyY)),
      viewRow(h, 'Beep ▶', 'HTMLAudioElement (WAV gen)', 'Z', mountTap('tap-z', 'pointerdown', strategyZ)),
      viewRow(h, 'Beep ▶', 'Silent WAV loop + Web Audio', 'P', mountTap('tap-p', 'pointerdown', strategyP)),
    ]),
    h.h2([h.Style({ fontSize: '1rem', marginTop: '1rem' })], ['Group 5 — Best guess combos']),
    h.div([h.Class('test-grid')], [
      viewRow(h, 'Beep ▶', 'audioSession + click event', 'J2', mountTap('tap-j2', 'click', () => { setAudioSessionPlayback(); strategyJ() })),
      viewRow(h, 'Beep ▶', 'Silent WAV + click event', 'J3', mountTap('tap-j3', 'click', () => { playSilentWav(); strategyJ() })),
      viewRow(h, 'Beep ▶', 'audioSession + touchend', 'K2', mountTap('tap-k2', 'touchend', () => { setAudioSessionPlayback(); strategyK() })),
      viewRow(h, 'Beep ▶', 'Silent WAV + touchend', 'K3', mountTap('tap-k3', 'touchend', () => { playSilentWav(); strategyK() })),
    ]),
    h.p([h.Class('test-note'), h.Style({ marginTop: '1.5rem', fontSize: '0.75rem' })], [
      'Tip: If ALL Web Audio strategies fail but HTMLAudio (Z) works, the mute switch is silencing oscillators.',
    ]),
  ])
}
