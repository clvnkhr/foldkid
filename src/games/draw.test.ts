import { describe, expect, it } from 'vitest'
import * as Draw from './draw'

const predictions = (...values: string[]) =>
  values.map((value, index) => ({ value, score: 1 - index * 0.1 }))

const recognized = (
  model: Draw.Model,
  values: string[],
  overrides: Partial<Parameters<typeof Draw.BoardRecognized>[0]> = {},
) =>
  Draw.BoardRecognized({
    target: model.target,
    mode: model.recognitionMode,
    value: values[0] ?? '',
    score: 0.9,
    predictions: predictions(...values),
    debugImages: [{ label: 'debug', src: 'data:image/png;base64,', kind: 'image' }],
    boardImage: 'data:image/png;base64,board',
    ...overrides,
  })

describe('Draw', () => {
  it('init creates the first drawing prompt state', () => {
    const model = Draw.init()

    expect(model.target).toBe('0')
    expect(model.round).toBe(0)
    expect(model.score).toBe(0)
    expect(model.success).toBe(false)
    expect(model.topN).toBe(Draw.DEFAULT_TOP_N)
    expect(model.recognitionMode).toBe(Draw.DEFAULT_RECOGNITION_MODE)
    expect(model.freeMode).toBe(false)
    expect(model.inkColor).toBe(Draw.INK_COLORS[0])
    expect(model.brushSize).toBe(Draw.DEFAULT_BRUSH_SIZE)
  })

  it('normalizes top N into the supported range', () => {
    expect(Draw.normalizeTopN(undefined)).toBe(Draw.DEFAULT_TOP_N)
    expect(Draw.normalizeTopN(-10)).toBe(Draw.MIN_TOP_N)
    expect(Draw.normalizeTopN(99)).toBe(Draw.MAX_TOP_N)
    expect(Draw.normalizeTopN(2.6)).toBe(3)
  })

  it('sets ink color from the palette and falls back for invalid colors', () => {
    const [colored] = Draw.update(Draw.init(), Draw.SetInkColor({ value: Draw.INK_COLORS[3] }))
    const [fallback] = Draw.update(colored, Draw.SetInkColor({ value: '#ffffff' }))

    expect(colored.inkColor).toBe(Draw.INK_COLORS[3])
    expect(fallback.inkColor).toBe(Draw.INK_COLORS[0])
  })

  it('sets brush thickness within the supported range', () => {
    const [thick] = Draw.update(Draw.init(), Draw.SetBrushSize({ value: 31.4 }))
    const [tooSmall] = Draw.update(thick, Draw.SetBrushSize({ value: -1 }))
    const [tooLarge] = Draw.update(tooSmall, Draw.SetBrushSize({ value: 99 }))

    expect(thick.brushSize).toBe(31)
    expect(tooSmall.brushSize).toBe(Draw.MIN_BRUSH_SIZE)
    expect(tooLarge.brushSize).toBe(Draw.MAX_BRUSH_SIZE)
  })

  it('submit creates a recognizer command for the current target and mode', () => {
    const model = { ...Draw.init(), target: 'A', recognitionMode: 'template' as const }
    const [next, cmds] = Draw.update(model, Draw.SubmitBoard())

    expect(next).toBe(model)
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.name).toBe('DrawSubmitBoard')
    expect(cmds[0]?.args).toStrictEqual({ target: 'A', mode: 'template' })
  })

  it('accepts the target when it appears inside top N predictions', () => {
    const model = { ...Draw.init(), target: 'A', topN: 3 }
    const [next, cmds] = Draw.update(model, recognized(model, ['B', 'C', 'A', 'D'], {
      debugImages: [
        { label: 'raw board', src: 'raw', kind: 'image' },
        { label: 'cropped and centered', src: 'cropped', kind: 'image' },
      ],
    }))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
    expect(next.lastGuess).toBe('B')
    expect(next.lastPredictions.map(prediction => prediction.value)).toEqual(['B', 'C', 'A', 'D'])
    expect(next.lastBoardImage).toBe('data:image/png;base64,board')
    expect(next.winningImage).toBe('cropped')
    expect(cmds).toHaveLength(0)
  })

  it('rejects the target when it is outside top N predictions', () => {
    const model = { ...Draw.init(), target: 'A', topN: 2 }
    const [next, cmds] = Draw.update(model, recognized(model, ['B', 'C', 'A']))

    expect(next.success).toBe(false)
    expect(next.score).toBe(0)
    expect(next.lastGuess).toBe('B')
    expect(cmds).toHaveLength(0)
  })

  it('counts l, I, and 1 as near-match successes', () => {
    const model = { ...Draw.init(), target: 'l', topN: 1 }
    const [next] = Draw.update(model, recognized(model, ['1']))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('counts o, O, and 0 as near-match successes', () => {
    const model = { ...Draw.init(), target: 'O', topN: 1 }
    const [next] = Draw.update(model, recognized(model, ['0']))

    expect(next.success).toBe(true)
    expect(next.score).toBe(1)
  })

  it('ignores stale recognition results for another mode or target', () => {
    const model = { ...Draw.init(), target: 'A', recognitionMode: 'model' as const }
    const [wrongMode] = Draw.update(model, recognized(model, ['A'], { mode: 'template' }))
    const [wrongTarget] = Draw.update(model, recognized(model, ['A'], { target: 'B' }))

    expect(wrongMode).toBe(model)
    expect(wrongTarget).toBe(model)
  })

  it('free mode reports the best guess without scoring or checking the target', () => {
    const model = { ...Draw.init(), target: 'A', freeMode: true, topN: 3 }
    const [next, cmds] = Draw.update(model, recognized(model, ['B', 'C'], { target: 'stale-target' }))

    expect(next.success).toBe(false)
    expect(next.score).toBe(0)
    expect(next.lastGuess).toBe('B')
    expect(next.lastConfidence).toBe(0.9)
    expect(next.lastPredictions.map(prediction => prediction.value)).toEqual(['B', 'C'])
    expect(next.lastBoardImage).toBe('data:image/png;base64,board')
    expect(cmds).toHaveLength(0)
  })

  it('free mode can report a split multi-character guess', () => {
    const model = { ...Draw.init(), freeMode: true }
    const [next] = Draw.update(model, recognized(model, ['AB', 'A8']))

    expect(next.lastGuess).toBe('AB')
    expect(next.lastPredictions.map(prediction => prediction.value)).toEqual(['AB', 'A8'])
    expect(next.success).toBe(false)
    expect(next.score).toBe(0)
  })

  it('toggling free mode clears the current board state', () => {
    const model = {
      ...Draw.init(),
      success: true,
      lastGuess: 'A',
      lastPredictions: predictions('A'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'A' }],
      lastBoardImage: 'data:image/png;base64,board',
      winningImage: 'cropped',
      clearCount: 1,
    }
    const [next, cmds] = Draw.update(model, Draw.SetFreeMode({ value: true }))

    expect(next.freeMode).toBe(true)
    expect(next.success).toBe(false)
    expect(next.lastGuess).toBe('')
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(next.lastBoardImage).toBe('')
    expect(next.winningImage).toBe('')
    expect(next.clearCount).toBe(2)
    expect(cmds).toHaveLength(0)
  })

  it('switching mode clears predictions and reprocesses the last board image', () => {
    const model = {
      ...Draw.init(),
      target: 'A',
      lastGuess: 'B',
      lastConfidence: 0.4,
      lastPredictions: predictions('B'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'B' }],
      lastBoardImage: 'data:image/png;base64,board',
    }
    const [next, cmds] = Draw.update(model, Draw.SetRecognitionMode({ value: 'template' }))

    expect(next.recognitionMode).toBe('template')
    expect(next.lastGuess).toBe('')
    expect(next.lastConfidence).toBe(0)
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(cmds).toHaveLength(1)
    expect(cmds[0]?.name).toBe('DrawReprocessBoard')
    expect(cmds[0]?.args).toStrictEqual({ target: 'A', mode: 'template', boardImage: 'data:image/png;base64,board' })
  })

  it('clear removes diagnostics and remounts the board without changing the target', () => {
    const model = {
      ...Draw.init(),
      target: 'A',
      lastGuess: 'B',
      lastConfidence: 0.4,
      lastPredictions: predictions('B'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'B' }],
      lastBoardImage: 'data:image/png;base64,board',
      clearCount: 2,
    }
    const [next, cmds] = Draw.update(model, Draw.ClearBoard())

    expect(next.target).toBe('A')
    expect(next.clearCount).toBe(3)
    expect(next.lastGuess).toBe('')
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(next.lastBoardImage).toBe('')
    expect(cmds).toHaveLength(0)
  })

  it('next advances to a random target and clears the captured board image', () => {
    const model = { ...Draw.init(), target: 'A', success: true, lastBoardImage: 'data:image/png;base64,board', winningImage: 'cropped' }
    const [next, cmds] = Draw.update(model, Draw.NextRound())

    expect(next.round).toBe(1)
    expect(Draw.TARGETS).toContain(next.target)
    expect(next.target).not.toBe('A')
    expect(next.success).toBe(false)
    expect(next.lastBoardImage).toBe('')
    expect(next.winningImage).toBe('')
    expect(next.clearCount).toBe(1)
    expect(cmds).toHaveLength(0)
  })

  it('skip advances to a random target and clears the captured board image', () => {
    const model = { ...Draw.init(), target: 'A', lastBoardImage: 'data:image/png;base64,board' }
    const [next, cmds] = Draw.update(model, Draw.SkipTarget())

    expect(next.round).toBe(1)
    expect(Draw.TARGETS).toContain(next.target)
    expect(next.target).not.toBe('A')
    expect(next.lastBoardImage).toBe('')
    expect(cmds).toHaveLength(0)
  })

  it('shuffle chooses a different target and clears the board state', () => {
    const model = {
      ...Draw.init(),
      target: 'A',
      lastGuess: 'B',
      lastPredictions: predictions('B'),
      debugImages: [{ label: 'old', src: '', kind: 'prediction' as const, value: 'B' }],
      lastBoardImage: 'data:image/png;base64,board',
      clearCount: 1,
    }
    const [next, cmds] = Draw.update(model, Draw.ShuffleTarget())

    expect(Draw.TARGETS).toContain(next.target)
    expect(next.target).not.toBe('A')
    expect(next.round).toBe(1)
    expect(next.clearCount).toBe(2)
    expect(next.lastGuess).toBe('')
    expect(next.lastPredictions).toHaveLength(0)
    expect(next.debugImages).toHaveLength(0)
    expect(next.lastBoardImage).toBe('')
    expect(cmds).toHaveLength(0)
  })
})
