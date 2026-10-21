import { makeSixEightDrums, withDrums } from './helpers'

// Traditional verse: Our Old Nursery Rhymes (1911), p. 15.
// https://www.gutenberg.org/files/61009/61009-h/61009-h.htm
// Includes the familiar repeated opening calls. 6/8 in D major; tied phrase endings are sustained rather than re-struck.
export const song = withDrums({
  key: 'blindMice',
  tonality: { tonic: 'D', mode: 'major' },
  emoji: '🐭',
  lyrics: [
    'Three blind mice,',
    'Three blind mice,',
    'See how they run!',
    'See how they run!',
    "They all ran after the farmer's wife,",
    'Who cut off their tails with a carving knife,',
    'Did you ever hear such a tale in your life,',
    'As three blind mice!',
  ],
  notes: [
    { pitch: 'F#4', dur: 1.5 }, { pitch: 'E4', dur: 1.5 },
    { pitch: 'D4', dur: 2.5 }, { pitch: '', dur: 0.5 },
    { pitch: 'F#4', dur: 1.5 }, { pitch: 'E4', dur: 1.5 },
    { pitch: 'D4', dur: 2.5 }, { pitch: '', dur: 0.5 },
    { pitch: 'A4', dur: 1.5 }, { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F#4', dur: 3 },
    { pitch: 'A4', dur: 1.5 }, { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F#4', dur: 2.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'D5', dur: 1 }, { pitch: 'D5', dur: 0.5 },
    { pitch: 'C#5', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'C#5', dur: 0.5 },
    { pitch: 'D5', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'D5', dur: 0.5 }, { pitch: 'D5', dur: 0.5 }, { pitch: 'D5', dur: 0.5 },
    { pitch: 'C#5', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'C#5', dur: 0.5 },
    { pitch: 'D5', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'D5', dur: 0.5 }, { pitch: 'D5', dur: 0.5 }, { pitch: 'D5', dur: 0.5 },
    { pitch: 'C#5', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'C#5', dur: 0.5 },
    { pitch: 'D5', dur: 0.5 }, { pitch: 'A4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F#4', dur: 1.5 }, { pitch: 'E4', dur: 1.5 },
    { pitch: 'D4', dur: 2.5 }, { pitch: '', dur: 0.5 },
  ],
}, makeSixEightDrums)
