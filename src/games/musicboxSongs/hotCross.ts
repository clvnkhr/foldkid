import { withDrums } from './helpers'

// Traditional three-note nursery melody, verified against the publisher's score:
// https://pianodemy.com/pieces/hot-cross-buns
// Traditional verse: The Baby's Bouquet, p. 10 (not its different historical tune).
// https://www.gutenberg.org/files/25432/25432-h/25432-h.htm
// C major, 4/4: broad half-note phrases leave room to sing at the app's default tempo.
export const song = withDrums({
  key: 'hotCross',
  tonality: { tonic: 'C', mode: 'major' },
  emoji: '🥐',
  lyrics: [
    'Hot cross buns!',
    'Hot cross buns!',
    'One a penny, two a penny,',
    'Hot cross buns!',
  ],
  notes: [
    { pitch: 'E4', dur: 2 }, { pitch: 'D4', dur: 2 }, { pitch: 'C4', dur: 4 },
    { pitch: 'E4', dur: 2 }, { pitch: 'D4', dur: 2 }, { pitch: 'C4', dur: 4 },
    { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'E4', dur: 2 }, { pitch: 'D4', dur: 2 }, { pitch: 'C4', dur: 4 },
  ],
})
