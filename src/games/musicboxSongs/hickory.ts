import { makeSixEightDrums, withDrums } from './helpers'

// Traditional tune and verse: Our Old Nursery Rhymes (1911), p. 39.
// https://www.gutenberg.org/files/61009/61009-h/61009-h.htm
// 6/8 in D major; tied notes stay continuous. Second phrase cross-checked with:
// https://www.mfiles.co.uk/scores/hickory-dickory-dock.htm
export const song = withDrums({
  key: 'hickory',
  tonality: { tonic: 'D', mode: 'major' },
  emoji: '🕰️',
  lyrics: [
    'Hickory, dickory, dock!',
    'The mouse ran up the clock.',
    'The clock struck one,',
    'The mouse ran down,',
    'Hickory, dickory, dock!',
  ],
  notes: [
    { pitch: 'F#4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'C#5', dur: 0.5 },
    { pitch: 'D5', dur: 2.5 }, { pitch: 'F#4', dur: 0.5 },
    { pitch: 'F#4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'C#5', dur: 0.5 },
    { pitch: 'D5', dur: 2.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'D5', dur: 1 }, { pitch: 'D5', dur: 0.5 },
    { pitch: 'C#5', dur: 1 }, { pitch: 'C#5', dur: 0.5 },
    { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'A4', dur: 1.5 },
    { pitch: 'A4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'F#4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 2.5 }, { pitch: '', dur: 0.5 },
  ],
}, makeSixEightDrums)
