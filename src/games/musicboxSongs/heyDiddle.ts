import { makeSixEightDrums, withDrums } from './helpers'

// Familiar traditional C-major melody (rather than the older Baby's Opera variant).
// https://www.mfiles.co.uk/scores/hey-diddle-diddle.htm
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
    { pitch: 'E4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 2.5 }, { pitch: 'E4', dur: 0.5 },

    { pitch: 'F4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'C4', dur: 3 },
  ],
}, makeSixEightDrums)
