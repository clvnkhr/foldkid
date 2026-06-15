import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit/test'
import * as Main from '../main'
import { ClickedLanding } from '../message'
import { AUDIO_DIAGNOSTIC_VERSION, view } from './audiotest'

const diagnosticMountNames = [
  'diag',
  'tap-j',
  'tap-k',
  'tap-l',
  'tap-w',
  'tap-n',
  'tap-o',
  'tap-q',
  'tap-m',
  'tap-r',
  'tap-s',
  'tap-t',
  'tap-u',
  'tap-v',
  'tap-x',
  'tap-y',
  'tap-z',
  'tap-p',
  'tap-j2',
  'tap-j3',
  'tap-k2',
  'tap-k3',
] as const

const resolveDiagnosticMounts = diagnosticMountNames.map(name =>
  [{ name }, ClickedLanding()] as const
)

describe('Audio Test page', () => {
  it('renders the diagnostic version and Safari strategy labels', () => {
    expect(AUDIO_DIAGNOSTIC_VERSION).toBe('v3 - 2026-06-15 phase 1')

    Scene.scene(
      { update: Main.update, view: () => view('en') },
      Scene.with(Main.init()[0]),
      Scene.expect(Scene.text(AUDIO_DIAGNOSTIC_VERSION)).toExist(),
      Scene.expect(Scene.text('AudioContext Diagnostic')).toExist(),
      Scene.expect(Scene.text('FULL: audioSession+WAV+click')).toExist(),
      Scene.expect(Scene.text('Silent WAV first, then Web Audio')).toExist(),
      Scene.expect(Scene.text('HTMLAudioElement (WAV gen)')).toExist(),
      Scene.Mount.resolveAll(...resolveDiagnosticMounts),
      Scene.Command.expectNone(),
    )
  })
})
