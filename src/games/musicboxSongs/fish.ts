import { repeat, withDrums } from './helpers'

export const song = withDrums({
  key: 'fish',
  emoji: '🐟',
  lyrics: [
    'One, two, three, four, five,',
    'Once I caught a fish alive.',
    'Six, seven, eight, nine, ten,',
    'Then I let it go again.',
    'Why did you let it go?',
    'Because it bit my finger so.',
    'Which finger did it bite?',
    'This little finger on the right.',
  ],
  notes: repeat([
    { pitch: 'E4', dur: 1 }, { pitch: 'E4', dur: 1 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 },
    { pitch: 'C4', dur: 1 },

    { pitch: 'C4', dur: 0.5 }, { pitch: 'D4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'F4', dur: 1 },

    { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'E4', dur: 0.5 }, { pitch: 'E4', dur: 0.5 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'D4', dur: 1 },

    { pitch: 'C4', dur: 0.5 }, { pitch: 'B3', dur: 0.5 },
    { pitch: 'A3', dur: 0.5 }, { pitch: 'B3', dur: 0.5 },
    { pitch: 'D4', dur: 0.5 }, { pitch: 'C4', dur: 0.5 },
    { pitch: 'C4', dur: 1 },
  ], 2),
})
