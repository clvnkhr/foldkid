import type { Note } from '../musicboxDomain'
import { makeSixEightDrums, withDrums } from './helpers'

// J. W. Elliott's familiar tune, The Most Popular Mother Goose Songs (1910), p. 2.
// Vocal line; sustain the short articulation gaps within each sung syllable.
// https://s9.imslp.org/files/imglnks/usimg/1/1b/IMSLP643598-PMLP1032191-most_pop_m_goose.pdf
const verseNotes: Note[] = [
  { pitch: 'C5', dur: 1 },
  { pitch: 'G4', dur: 0.5 },
  { pitch: 'A4', dur: 1 },
  { pitch: 'G4', dur: 0.5 },
  { pitch: 'C5', dur: 1 },
  { pitch: 'G4', dur: 0.5 },
  { pitch: 'A4', dur: 1 },
  { pitch: 'G4', dur: 0.5 },
  { pitch: 'E5', dur: 1 },
  { pitch: 'D5', dur: 0.5 },
  { pitch: 'C5', dur: 1 },
  { pitch: 'B4', dur: 0.5 },
  { pitch: 'A4', dur: 1.5 },
  { pitch: 'G4', dur: 1 },
  { pitch: '', dur: 0.5 },
  { pitch: 'F4', dur: 1 },
  { pitch: 'F4', dur: 0.5 },
  { pitch: 'D5', dur: 1 },
  { pitch: 'F4', dur: 0.5 },
  { pitch: 'E4', dur: 1 },
  { pitch: 'E4', dur: 0.5 },
  { pitch: 'C5', dur: 1 },
  { pitch: 'E4', dur: 0.5 },
  { pitch: 'D4', dur: 0.5 },
  { pitch: 'D4', dur: 0.5 },
  { pitch: 'A4', dur: 0.5 },
  { pitch: 'G4', dur: 1 },
  { pitch: 'B3', dur: 0.5 },
  { pitch: 'D4', dur: 1.5 },
  { pitch: 'C4', dur: 0.5 },
  { pitch: '', dur: 1 },
]

export const song = withDrums({
  key: 'jackJill',
  tonality: { tonic: 'C', mode: 'major' },
  emoji: '🪣',
  lyrics: [
    'Jack and Jill went up the hill',
    'To fetch a pail of water;',
    'Jack fell down and broke his crown,',
    'And Jill came tumbling after.',
    '',
    'Up Jack got, and home did trot,',
    'As fast as he could caper;',
    'Went to bed to mend his head,',
    'With vinegar and brown paper.',
  ],
  notes: [...verseNotes, ...verseNotes],
}, makeSixEightDrums)
