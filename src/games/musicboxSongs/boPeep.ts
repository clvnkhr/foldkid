import { makeSixEightDrums, withDrums } from './helpers'

// Traditional melody and first verse, The Baby's Opera (1877), p. 36.
// https://www.gutenberg.org/files/25418/25418-h/music/bopeep.xml
export const song = withDrums({
  key: 'boPeep',
  tonality: { tonic: 'F', mode: 'major' },
  emoji: '🐑',
  lyrics: [
    'Little Bo-Peep, she lost her sheep,',
    "And didn't know where to find them;",
    "Let them alone, they'll all come home",
    'And bring their tails behind them.',
  ],
  notes: [
    { pitch: 'F4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'A#4', dur: 0.5 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'C5', dur: 0.5 }, { pitch: 'A#4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 1.5 }, { pitch: 'G4', dur: 1 }, { pitch: '', dur: 0.5 },

    { pitch: 'C5', dur: 0.5 }, { pitch: 'A4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A#4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'A#4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F4', dur: 1.5 }, { pitch: 'F4', dur: 1 }, { pitch: '', dur: 0.5 },
  ],
}, makeSixEightDrums)
