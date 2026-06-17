import { withDrums } from './helpers'

export const song = withDrums({
  key: 'duke',
  emoji: '🎖️',
  lyrics: [
    'Oh, the grand old Duke of York,',
    'He had ten thousand men.',
    'And he marched them up to the top of the hill,',
    'And he marched them down again.',
    '',
    'And when they were up, they were up,',
    'And when they were down, they were down,',
    'And when they were only halfway up,',
    'They were neither up nor down.',
  ],
  notes: [
    { pitch: 'D#4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'D#4', dur: 1 },
    { pitch: 'D#4', dur: 1 }, { pitch: 'D#4', dur: 1 },
    { pitch: 'D#4', dur: 3 },

    { pitch: 'D#4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 3 },

    { pitch: 'F4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G#4', dur: 1 }, { pitch: 'G#4', dur: 1 }, { pitch: 'G#4', dur: 1 },
    { pitch: 'G#4', dur: 0.5 }, { pitch: 'G#4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'D#4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'D#4', dur: 3 },

    { pitch: 'A#3', dur: 1 }, { pitch: 'D#4', dur: 1 },
    { pitch: 'D#4', dur: 1 }, { pitch: 'D#4', dur: 1 },
    { pitch: 'D#4', dur: 1 }, { pitch: 'D#4', dur: 3 },

    { pitch: 'D#4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'F4', dur: 3 },

    { pitch: 'F4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 }, { pitch: 'G4', dur: 1 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'G4', dur: 0.5 },
    { pitch: 'G#4', dur: 1 }, { pitch: 'G#4', dur: 1 }, { pitch: 'G#4', dur: 1 },
    { pitch: 'G#4', dur: 0.5 }, { pitch: 'G#4', dur: 0.5 },
    { pitch: 'G4', dur: 1 }, { pitch: 'D#4', dur: 1 },
    { pitch: 'F4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'D#4', dur: 3 }, { pitch: '', dur: 1 },
  ],
}, { pickupNotes: 2 })
