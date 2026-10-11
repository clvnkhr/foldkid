import { makeSixEightDrums, withDrums } from './helpers'

// Traditional melody and first verse, The Baby's Opera (1877), p. 52.
// https://www.gutenberg.org/files/25418/25418-h/music/jackandjill.xml
export const song = withDrums({
  key: 'jackJill',
  tonality: { tonic: 'C', mode: 'major' },
  emoji: '🪣',
  lyrics: [
    'Jack and Jill went up the hill',
    'To fetch a pail of water;',
    'Jack fell down and broke his crown,',
    'And Jill came tumbling after.',
  ],
  notes: [
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'C5', dur: 1 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'C5', dur: 1 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'D5', dur: 1 }, { pitch: 'D5', dur: 0.5 },
    { pitch: 'D5', dur: 1 }, { pitch: 'D5', dur: 0.5 },
    { pitch: 'E5', dur: 1.5 }, { pitch: 'C5', dur: 1 }, { pitch: '', dur: 0.5 },

    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'C4', dur: 1.5 }, { pitch: 'C4', dur: 1 }, { pitch: '', dur: 0.5 },
  ],
}, makeSixEightDrums)
