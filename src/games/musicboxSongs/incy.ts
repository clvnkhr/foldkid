import { makeSixEightDrums, withDrums } from './helpers'

export const song = withDrums({
  key: 'incy',
  emoji: '🕷️',
  lyrics: [
    'Incy Wincy Spider climbed up the spout',
    'Down came the rain and washed the spider out',
    'Out came the sunshine and dried up all the rain',
    'Incy Wincy Spider climbed up the spout again!',
  ],
  notes: [
    { pitch: 'D4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 1.5 }, { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'G4', dur: 3 },

    { pitch: 'B4', dur: 1.5 }, { pitch: 'B4', dur: 1 }, { pitch: 'C5', dur: 0.5 },
    { pitch: 'D5', dur: 1.5 }, { pitch: 'D5', dur: 1.5 },
    { pitch: 'C5', dur: 1 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'C5', dur: 1 }, { pitch: 'D5', dur: 0.5 },
    { pitch: 'B4', dur: 3 },

    { pitch: 'G4', dur: 1.5 }, { pitch: 'G4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 1.5 }, { pitch: 'B4', dur: 1.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'G4', dur: 1.5 }, { pitch: 'D4', dur: 1 }, { pitch: 'D4', dur: 0.5 },

    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'B4', dur: 1.5 }, { pitch: 'B4', dur: 1 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'A4', dur: 1 }, { pitch: 'B4', dur: 0.5 },
    { pitch: 'G4', dur: 1.5 }, { pitch: 'G4', dur: 1 },
  ],
}, makeSixEightDrums, { pickupNotes: 1 })
