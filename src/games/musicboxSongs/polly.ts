import { makeTwoFourDrums, withDrums } from './helpers'

// Traditional two-verse tune: Our Old Nursery Rhymes (1911), p. 61.
// https://www.gutenberg.org/files/61009/61009-h/61009-h.htm
// 2/4 in G major, with the source's answering melody for the Sukey verse.
export const song = withDrums({
  key: 'polly',
  tonality: { tonic: 'G', mode: 'major' },
  emoji: '🫖',
  lyrics: [
    'Polly put the kettle on,',
    'Polly put the kettle on,',
    'Polly put the kettle on,',
    "We'll all have tea.",
    '',
    'Sukey take it off again,',
    'Sukey take it off again,',
    'Sukey take it off again,',
    "They've all gone away.",
  ],
  notes: [
    { pitch: 'D5', dur: 0.5 }, { pitch: 'E5', dur: 0.5 },
    { pitch: 'D5', dur: 0.5 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 1 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F#4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 }, { pitch: 'D4', dur: 1 },
    { pitch: 'D5', dur: 0.5 }, { pitch: 'E5', dur: 0.5 },
    { pitch: 'D5', dur: 0.5 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'F#4', dur: 1 }, { pitch: 'G4', dur: 2 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'C5', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 1 },
    { pitch: 'C5', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F#4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 }, { pitch: 'D4', dur: 1 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'C5', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'F#4', dur: 0.75 },
    { pitch: 'F#4', dur: 0.25 }, { pitch: 'G4', dur: 2 },
  ],
}, makeTwoFourDrums)
