import { repeat, withDrums } from './helpers'

export const song = withDrums({
  key: 'frere',
  emoji: '🔔',
  lyrics: [
    'Frere Jacques, Frere Jacques,',
    'Dormez-vous? Dormez-vous?',
    'Sonnez les matines, sonnez les matines,',
    'Ding, dang, dong. Ding, dang, dong.',
    '',
    'Are you sleeping? Are you sleeping?',
    'Brother John? Brother John?',
    'Morning bells are ringing. Morning bells are ringing.',
    'Ding-ding-dong. Ding-ding-dong.',
  ],
  notes: repeat([
    { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'E4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'C4', dur: 1 }, { pitch: 'D4', dur: 1 },
    { pitch: 'E4', dur: 1 }, { pitch: 'C4', dur: 1 },

    { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'G4', dur: 2 },
    { pitch: 'E4', dur: 1 }, { pitch: 'F4', dur: 1 },
    { pitch: 'G4', dur: 2 },

    { pitch: 'G4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'C4', dur: 1 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'A4', dur: 0.5 },
    { pitch: 'G4', dur: 0.5 }, { pitch: 'F4', dur: 0.5 },
    { pitch: 'E4', dur: 1 }, { pitch: 'C4', dur: 1 },

    { pitch: 'C4', dur: 1 }, { pitch: 'G3', dur: 1 },
    { pitch: 'C4', dur: 2 },
    { pitch: 'C4', dur: 1 }, { pitch: 'G3', dur: 1 },
    { pitch: 'C4', dur: 2 },
  ], 2),
})
