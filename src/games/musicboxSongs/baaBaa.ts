import { makeTwoFourDrums, withDrums } from './helpers'

// Traditional melody: The Child's Own Music Book (1918), p. 44.
// https://en.wikisource.org/wiki/Page:Childs_own_music_book.djvu/52
// 2/4 in D major; the familiar “little boy” lyric gets a repeated note on “who lives”.
export const song = withDrums({
  key: 'baaBaa',
  tonality: { tonic: 'D', mode: 'major' },
  emoji: '🐑',
  lyrics: [
    'Baa, baa, black sheep,',
    'Have you any wool?',
    'Yes sir, yes sir,',
    'Three bags full.',
    'One for my master,',
    'And one for my dame,',
    'And one for the little boy',
    'Who lives down the lane.',
  ],
  notes: [
    { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 1 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'B4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'A4', dur: 2 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
    { pitch: 'F#4', dur: 1 }, { pitch: 'F#4', dur: 1 },
    { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 2 },
    { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'A4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 0.5 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'A4', dur: 1.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'F#4', dur: 0.5 }, { pitch: 'F#4', dur: 0.5 },
    { pitch: 'F#4', dur: 0.5 }, { pitch: 'F#4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 2 },
  ],
}, makeTwoFourDrums)
