import { makeThreeFourDrums, withDrums } from './helpers'

export const song = withDrums({
  key: 'birthday',
  emoji: '🎂',
  lyrics: [
    "Happy birthday to you,",
    "Happy birthday to you,",
    "Happy birthday dear you,",
    "Happy birthday to you!",
  ],
  notes: [
    { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'D4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'E4', dur: 2 },
    { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'D4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 2 },
    { pitch: 'C4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'C5', dur: 1 }, { pitch: 'A4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'E4', dur: 1 },
    { pitch: 'D4', dur: 2 },
    { pitch: 'A#4', dur: 1 }, { pitch: 'A#4', dur: 1 },
    { pitch: 'A4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'G4', dur: 1 }, { pitch: 'F4', dur: 2 },
  ],
}, makeThreeFourDrums)
