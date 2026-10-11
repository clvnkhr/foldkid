import { makeSixEightDrums, withDrums } from './helpers'

// Traditional melody, The Baby's Opera (1877), back cover; transposed E to C.
// https://www.gutenberg.org/files/25418/25418-h/music/backcover.xml
export const song = withDrums({
  key: 'heyDiddle',
  tonality: { tonic: 'C', mode: 'major' },
  emoji: '🎻',
  lyrics: [
    'Hey diddle diddle! The cat and the fiddle,',
    'The cow jumped over the moon;',
    'The little dog laughed to see the fine sport,',
    'And the dish ran away with the spoon.',
  ],
  notes: [
    { pitch: 'E4', dur: 0.75 }, { pitch: 'F4', dur: 0.25 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 2.5 }, { pitch: 'E4', dur: 0.5 },

    { pitch: 'F4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'F4', dur: 1 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'F4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'C5', dur: 0.5 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'C4', dur: 3 },
  ],
}, makeSixEightDrums)
