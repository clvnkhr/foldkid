import { withDrums } from './helpers'

// Traditional melody, English Folk-Songs for Schools (1906), p. 94; F to C.
// Quarter-note durations doubled for the familiar 4/4 counting-song pulse.
// https://imslp.org/wiki/English_Folk-Songs_for_Schools_(Baring-Gould,_Sabine)
// Cross-checked with the monophonic score at https://www.flutetunes.com/tunes.php?id=1942
export const song = withDrums({
  key: 'thisOldMan',
  tonality: { tonic: 'C', mode: 'major' },
  emoji: '🦴',
  lyrics: [
    'This old man, he played one,',
    'He played knick-knack on my thumb;',
    'Knick-knack paddywhack, give a dog a bone,',
    'This old man came rolling home.',
  ],
  notes: [
    { pitch: 'G4', dur: 1 }, { pitch: 'E4', dur: 1 }, { pitch: 'G4', dur: 2 },
    { pitch: 'G4', dur: 1 }, { pitch: 'E4', dur: 1 }, { pitch: 'G4', dur: 2 },
    { pitch: 'A4', dur: 1 }, { pitch: 'G4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'E4', dur: 1 },
    { pitch: 'D4', dur: 1 }, { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 2 },

    { pitch: 'G4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'C4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 }, { pitch: 'C4', dur: 1 },
    { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 }, { pitch: 'G4', dur: 2 },
    { pitch: 'G4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'D4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'E4', dur: 1 }, { pitch: 'D4', dur: 1 }, { pitch: 'C4', dur: 2 },
  ],
})
