import type { DrumHit, Note, Song } from '../musicboxDomain'

export const repeat = <T>(arr: readonly T[], n: number): T[] =>
  Array.from({ length: n }, () => [...arr]).flat()

const songDuration = (notes: readonly Note[]): number =>
  notes.reduce((sum, note) => sum + note.dur, 0)

const pushDrum = (drums: DrumHit[], total: number, hit: DrumHit): void => {
  if (hit.at < total) drums.push(hit)
}

const makeFourFourDrums = (notes: readonly Note[]): DrumHit[] => {
  const total = songDuration(notes)
  const drums: DrumHit[] = []
  for (let at = 0; at < total; at += 4) drums.push({ at, kind: 'kick', gain: 0.55 })
  for (let at = 2; at < total; at += 4) drums.push({ at, kind: 'snare', gain: 0.45 })
  for (let at = 1; at < total; at += 2) drums.push({ at, kind: 'hat', gain: 0.35 })
  return drums
}

export const makeSixEightDrums = (notes: readonly Note[], offset = 0): DrumHit[] => {
  const total = songDuration(notes)
  const drums: DrumHit[] = []
  for (let at = offset; at < total; at += 3) {
    pushDrum(drums, total, { at, kind: 'kick', gain: 0.5 })
    pushDrum(drums, total, { at: at + 0.5, kind: 'hat', gain: 0.22 })
    pushDrum(drums, total, { at: at + 1, kind: 'hat', gain: 0.18 })
    pushDrum(drums, total, { at: at + 1.5, kind: 'snare', gain: 0.35 })
    pushDrum(drums, total, { at: at + 2, kind: 'hat', gain: 0.22 })
    pushDrum(drums, total, { at: at + 2.5, kind: 'hat', gain: 0.18 })
  }
  return drums
}

export const makeThreeFourDrums = (notes: readonly Note[]): DrumHit[] => {
  const total = songDuration(notes)
  const drums: DrumHit[] = []
  for (let at = 0; at < total; at += 3) {
    pushDrum(drums, total, { at, kind: 'kick', gain: 0.48 })
    pushDrum(drums, total, { at: at + 1, kind: 'hat', gain: 0.24 })
    pushDrum(drums, total, { at: at + 2, kind: 'snare', gain: 0.34 })
  }
  return drums
}

export const makeHappyDrums = (notes: readonly Note[]): DrumHit[] => {
  const actionDrums: DrumHit[] = []
  const actionRanges: Array<{ start: number; end: number }> = []
  let at = 0
  let restIndex = 0
  for (const note of notes) {
    if (!note.pitch) {
      const verseIndex = Math.floor(restIndex / 6)
      const kind = verseIndex === 0 ? 'clap' : verseIndex === 1 ? 'stomp' : 'cheer'
      actionRanges.push({ start: at, end: at + note.dur })
      actionDrums.push({ at, kind, gain: kind === 'stomp' ? 0.9 : 0.75 })
      restIndex += 1
    }
    at += note.dur
  }
  return [
    ...makeSixEightDrums(notes, 1.5).filter(drum =>
      !actionRanges.some(({ start, end }) => drum.at >= start - 0.0001 && drum.at < end - 0.0001),
    ),
    ...actionDrums,
  ].sort((a, b) => a.at - b.at)
}

export const withDrums = (
  song: Omit<Song, 'drums'>,
  makeDrums: (notes: readonly Note[]) => DrumHit[] = makeFourFourDrums,
): Song => ({
  ...song,
  drums: makeDrums(song.notes),
})
