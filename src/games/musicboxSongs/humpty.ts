import { makeSixEightDrums, withDrums } from './helpers'

// Public-domain nursery melody by J. W. Elliott (1870), transposed G to C.
// Melody verified against https://www.mfiles.co.uk/scores/humpty-dumpty.pdf
// Original collection: https://archive.org/details/nationalnurseryr00elli
// Only the traditional melody is used, not the modern piano accompaniment.
export const song = withDrums({
  key: 'humpty',
  tonality: { tonic: 'C', mode: 'major' },
  emoji: '🥚',
  lyrics: [
    'Humpty Dumpty sat on a wall,',
    'Humpty Dumpty had a great fall;',
    "All the king's horses and all the king's men",
    "Couldn't put Humpty together again.",
  ],
  notes: [
    { pitch: 'E4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'C5', dur: 1.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 1.5 },

    { pitch: 'E4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'C5', dur: 1.5 },
    { pitch: 'E5', dur: 0.5 }, { pitch: 'E5', dur: 0.5 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'F5', dur: 0.5 }, { pitch: 'F5', dur: 0.5 }, { pitch: 'E5', dur: 0.5 },
    { pitch: 'D5', dur: 0.5 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'C5', dur: 1.5 },
  ],
}, makeSixEightDrums)
