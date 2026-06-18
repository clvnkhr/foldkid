import { Effect, Match as M, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

const MODEL_LABELS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabdefghnqrt'.split('')
export const TARGETS = MODEL_LABELS
const GRID_SIZE = 28
const MODEL_DIR_URL = 'models/lenet-5-emnist-balanced/'
const MODEL_URL = `${MODEL_DIR_URL}model.keras`
const MODEL_MANIFEST_URL = `${MODEL_DIR_URL}weights.json`
const MODEL_WEIGHTS_URL = `${MODEL_DIR_URL}weights.bin`
const MODEL_LABEL = 'LeNet-5 EMNIST model stored locally'
const MODEL_CACHE_KEY = 'foldkid-draw-lenet-cache-v1'
const MODEL_CACHE_VERSION = `${MODEL_MANIFEST_URL}|${MODEL_WEIGHTS_URL}|${MODEL_LABELS.join('')}`
export const RecognitionMode = S.Union([S.Literal('model'), S.Literal('template')])
export type RecognitionMode = typeof RecognitionMode.Type
export const DEFAULT_RECOGNITION_MODE: RecognitionMode = 'model'
export const MIN_TOP_N = 1
export const MAX_TOP_N = 10
export const DEFAULT_TOP_N = 5
const OCR_CANDIDATES = [...MODEL_LABELS, '+', '-', '=', '?', '!', '@', '$', '%']
const ALLOWED_TARGETS = new Set(TARGETS)
const NEAR_MATCH_GROUPS = [
  new Set(['l', 'I', '1']),
  new Set(['o', 'O', '0']),
]

const DebugImage = S.Struct({
  label: S.String,
  src: S.String,
  kind: S.optionalKey(S.Union([S.Literal('image'), S.Literal('prediction')])),
  value: S.optionalKey(S.String),
})
type DebugImage = typeof DebugImage.Type
const Prediction = S.Struct({
  value: S.String,
  score: S.Number,
})
type Prediction = typeof Prediction.Type

export const Model = S.Struct({
  target: S.String,
  round: S.Number,
  score: S.Number,
  success: S.Boolean,
  lastGuess: S.String,
  lastConfidence: S.Number,
  lastPredictions: S.Array(Prediction),
  topN: S.Number,
  recognitionMode: RecognitionMode,
  clearCount: S.Number,
  debugImages: S.Array(DebugImage),
  lastBoardImage: S.String,
})
export type Model = typeof Model.Type

export const BoardRecognized = m('DrawBoardRecognized', { target: S.String, mode: RecognitionMode, value: S.String, score: S.Number, predictions: S.Array(Prediction), debugImages: S.Array(DebugImage), boardImage: S.String })
export const SubmitBoard = m('DrawSubmitBoard')
export const NextRound = m('DrawNextRound')
export const SkipTarget = m('DrawSkipTarget')
export const ShuffleTarget = m('DrawShuffleTarget')
export const ClearBoard = m('DrawClearBoard')
export const SetTopN = m('DrawSetTopN', { value: S.Number })
export const SetRecognitionMode = m('DrawSetRecognitionMode', { value: RecognitionMode })
export const RecognitionFailed = m('DrawRecognitionFailed')

export const Message = S.Union([BoardRecognized, SubmitBoard, NextRound, SkipTarget, ShuffleTarget, ClearBoard, SetTopN, SetRecognitionMode, RecognitionFailed])
export type Message = typeof Message.Type

const nextTarget = (round: number): string => TARGETS[round % TARGETS.length] ?? 'A'
const randomTarget = (current: string, random = Math.random): string => {
  const pool = TARGETS.filter(target => target !== current)
  return pool[Math.floor(random() * pool.length)] ?? nextTarget(0)
}

export const init = (): Model => ({
  target: nextTarget(0),
  round: 0,
  score: 0,
  success: false,
  lastGuess: '',
  lastConfidence: 0,
  lastPredictions: [],
  topN: DEFAULT_TOP_N,
  recognitionMode: DEFAULT_RECOGNITION_MODE,
  clearCount: 0,
  debugImages: [],
  lastBoardImage: '',
})

const nextRound = (model: Model): Model => {
  const round = model.round + 1
  return {
    ...model,
    target: nextTarget(round),
    round,
    success: false,
    lastGuess: '',
    lastConfidence: 0,
    lastPredictions: [],
    clearCount: model.clearCount,
    lastBoardImage: '',
  }
}

const delayedNextRound = (): Command.Command<Message> => ({
  name: 'DrawNextRoundDelay',
  effect: Effect.sleep(700).pipe(Effect.as(NextRound())),
})

const isNearMatch = (a: string, b: string): boolean =>
  a === b || NEAR_MATCH_GROUPS.some(group => group.has(a) && group.has(b))

export const normalizeTopN = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? Math.min(MAX_TOP_N, Math.max(MIN_TOP_N, Math.round(value))) : DEFAULT_TOP_N

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      DrawBoardRecognized: (msg) => {
        if (model.success) return [model, []]
        if (msg.target !== model.target) return [model, []]
        if (msg.mode !== model.recognitionMode) return [model, []]
        const matched = msg.predictions.slice(0, model.topN).some(prediction => isNearMatch(prediction.value, msg.target))
        return [
          {
            ...model,
            success: matched,
            lastGuess: msg.value,
            lastConfidence: msg.score,
            lastPredictions: msg.predictions,
            debugImages: msg.debugImages,
            lastBoardImage: msg.boardImage,
            score: matched ? model.score + 1 : model.score,
          },
          matched ? [delayedNextRound()] : [],
        ]
      },
      DrawSubmitBoard: () => [model, [recognizeCurrentBoardCmd(model.target, model.recognitionMode)]],
      DrawNextRound: () => [nextRound(model), []],
      DrawSkipTarget: () => [nextRound(model), []],
      DrawShuffleTarget: () => [
        {
          ...model,
          target: randomTarget(model.target),
          round: model.round + 1,
          success: false,
          lastGuess: '',
          lastConfidence: 0,
          lastPredictions: [],
          clearCount: model.clearCount + 1,
          debugImages: [],
          lastBoardImage: '',
        },
        [],
      ],
      DrawClearBoard: () => [
        { ...model, lastGuess: '', lastConfidence: 0, lastPredictions: [], clearCount: model.clearCount + 1, debugImages: [], lastBoardImage: '' },
        [],
      ],
      DrawSetTopN: (msg) => [
        { ...model, topN: normalizeTopN(msg.value) },
        [],
      ],
      DrawSetRecognitionMode: (msg) => [
        { ...model, recognitionMode: msg.value, lastGuess: '', lastConfidence: 0, lastPredictions: [], debugImages: [] },
        model.lastBoardImage ? [recognizeBoardImageCmd(model.target, msg.value, model.lastBoardImage)] : [],
      ],
      DrawRecognitionFailed: () => [model, []],
    }),
  )

type Grid = Float32Array

interface RecognitionResult {
  value: string
  score: number
  predictions: Prediction[]
  debugImages: DebugImage[]
}

interface TensorSpec {
  shape: number[]
  offset: number
  length: number
}

interface WeightsManifest {
  labels: string[]
  tensors: Record<string, TensorSpec>
  floatCount: number
}

interface CachedLeNetModel {
  version: string
  manifest: WeightsManifest
  weightsBase64: string
}

interface LeNetModel {
  labels: string[]
  conv1Kernel: Float32Array
  conv1Bias: Float32Array
  conv2Kernel: Float32Array
  conv2Bias: Float32Array
  dense1Kernel: Float32Array
  dense1Bias: Float32Array
  dense2Kernel: Float32Array
  dense2Bias: Float32Array
  dense3Kernel: Float32Array
  dense3Bias: Float32Array
}

let leNetModelPromise: Promise<LeNetModel> | null = null

const tensor = (weights: Float32Array, spec: TensorSpec): Float32Array =>
  weights.subarray(spec.offset, spec.offset + spec.length)

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const base64ToArrayBuffer = (value: string): ArrayBuffer => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

const clearLeNetCache = (): void => {
  try {
    localStorage.removeItem(MODEL_CACHE_KEY)
  } catch {
    // Ignore storage access failures.
  }
}

const cachedLeNetFiles = (): readonly [WeightsManifest, ArrayBuffer] | null => {
  try {
    const raw = localStorage.getItem(MODEL_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as Partial<CachedLeNetModel>
    if (cached.version !== MODEL_CACHE_VERSION || !cached.manifest || !cached.weightsBase64) return null
    return [cached.manifest, base64ToArrayBuffer(cached.weightsBase64)]
  } catch {
    clearLeNetCache()
    return null
  }
}

const cacheLeNetFiles = (manifest: WeightsManifest, buffer: ArrayBuffer): void => {
  try {
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify({
      version: MODEL_CACHE_VERSION,
      manifest,
      weightsBase64: arrayBufferToBase64(buffer),
    } satisfies CachedLeNetModel))
  } catch {
    // Storage can be unavailable or full; the bundled model still works without the cache.
  }
}

const fetchLeNetFiles = async (): Promise<readonly [WeightsManifest, ArrayBuffer]> => {
  const [manifest, buffer] = await Promise.all([
    fetch(MODEL_MANIFEST_URL).then(response => response.json() as Promise<WeightsManifest>),
    fetch(MODEL_WEIGHTS_URL).then(response => response.arrayBuffer()),
  ])
  cacheLeNetFiles(manifest, buffer)
  return [manifest, buffer]
}

const buildLeNetModel = (manifest: WeightsManifest, buffer: ArrayBuffer): LeNetModel => {
  const weights = new Float32Array(buffer)
  if (weights.length !== manifest.floatCount) {
    throw new Error(`Bad EMNIST weights length: ${weights.length}`)
  }
  const tensors = manifest.tensors
  return {
    labels: manifest.labels,
    conv1Kernel: tensor(weights, tensors.conv1Kernel!),
    conv1Bias: tensor(weights, tensors.conv1Bias!),
    conv2Kernel: tensor(weights, tensors.conv2Kernel!),
    conv2Bias: tensor(weights, tensors.conv2Bias!),
    dense1Kernel: tensor(weights, tensors.dense1Kernel!),
    dense1Bias: tensor(weights, tensors.dense1Bias!),
    dense2Kernel: tensor(weights, tensors.dense2Kernel!),
    dense2Bias: tensor(weights, tensors.dense2Bias!),
    dense3Kernel: tensor(weights, tensors.dense3Kernel!),
    dense3Bias: tensor(weights, tensors.dense3Bias!),
  }
}

const loadLeNetModel = (): Promise<LeNetModel> => {
  if (leNetModelPromise) return leNetModelPromise
  leNetModelPromise = (async () => {
    const cached = cachedLeNetFiles()
    if (cached) {
      try {
        return buildLeNetModel(...cached)
      } catch {
        clearLeNetCache()
      }
    }
    const [manifest, buffer] = await fetchLeNetFiles()
    return buildLeNetModel(manifest, buffer)
  })()
  return leNetModelPromise
}

const conv2d = (
  input: Float32Array,
  inH: number,
  inW: number,
  inC: number,
  kernel: Float32Array,
  bias: Float32Array,
  outC: number,
  padding: 'same' | 'valid',
): readonly [Float32Array, number, number, number] => {
  const k = 5
  const pad = padding === 'same' ? 2 : 0
  const outH = padding === 'same' ? inH : inH - k + 1
  const outW = padding === 'same' ? inW : inW - k + 1
  const output = new Float32Array(outH * outW * outC)

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      for (let oc = 0; oc < outC; oc++) {
        let sum = bias[oc] ?? 0
        for (let ky = 0; ky < k; ky++) {
          const iy = oy + ky - pad
          if (iy < 0 || iy >= inH) continue
          for (let kx = 0; kx < k; kx++) {
            const ix = ox + kx - pad
            if (ix < 0 || ix >= inW) continue
            for (let ic = 0; ic < inC; ic++) {
              sum += (input[(iy * inW + ix) * inC + ic] ?? 0) * (kernel[((ky * k + kx) * inC + ic) * outC + oc] ?? 0)
            }
          }
        }
        output[(oy * outW + ox) * outC + oc] = Math.max(0, sum)
      }
    }
  }
  return [output, outH, outW, outC]
}

const averagePool2d = (
  input: Float32Array,
  inH: number,
  inW: number,
  inC: number,
): readonly [Float32Array, number, number, number] => {
  const outH = Math.floor(inH / 2)
  const outW = Math.floor(inW / 2)
  const output = new Float32Array(outH * outW * inC)
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      for (let c = 0; c < inC; c++) {
        const baseY = oy * 2
        const baseX = ox * 2
        const sum =
          (input[(baseY * inW + baseX) * inC + c] ?? 0) +
          (input[(baseY * inW + baseX + 1) * inC + c] ?? 0) +
          (input[((baseY + 1) * inW + baseX) * inC + c] ?? 0) +
          (input[((baseY + 1) * inW + baseX + 1) * inC + c] ?? 0)
        output[(oy * outW + ox) * inC + c] = sum / 4
      }
    }
  }
  return [output, outH, outW, inC]
}

const dense = (input: Float32Array, kernel: Float32Array, bias: Float32Array, outSize: number, relu: boolean): Float32Array => {
  const output = new Float32Array(outSize)
  for (let out = 0; out < outSize; out++) {
    let sum = bias[out] ?? 0
    for (let i = 0; i < input.length; i++) {
      sum += (input[i] ?? 0) * (kernel[i * outSize + out] ?? 0)
    }
    output[out] = relu ? Math.max(0, sum) : sum
  }
  return output
}

const softmax = (logits: Float32Array): Float32Array => {
  const output = new Float32Array(logits.length)
  let max = Number.NEGATIVE_INFINITY
  for (const value of logits) max = Math.max(max, value)
  let sum = 0
  for (let i = 0; i < logits.length; i++) {
    const value = Math.exp((logits[i] ?? 0) - max)
    output[i] = value
    sum += value
  }
  for (let i = 0; i < output.length; i++) output[i] = (output[i] ?? 0) / sum
  return output
}

const predictLeNet = (model: LeNetModel, input: Grid): Array<{ char: string; score: number }> => {
  const [conv1, conv1H, conv1W, conv1C] = conv2d(input, 28, 28, 1, model.conv1Kernel, model.conv1Bias, 6, 'same')
  const [pool1, pool1H, pool1W, pool1C] = averagePool2d(conv1, conv1H, conv1W, conv1C)
  const [conv2, conv2H, conv2W, conv2C] = conv2d(pool1, pool1H, pool1W, pool1C, model.conv2Kernel, model.conv2Bias, 16, 'valid')
  const [pool2] = averagePool2d(conv2, conv2H, conv2W, conv2C)
  const dense1 = dense(pool2, model.dense1Kernel, model.dense1Bias, 120, true)
  const dense2 = dense(dense1, model.dense2Kernel, model.dense2Bias, 84, true)
  const logits = dense(dense2, model.dense3Kernel, model.dense3Bias, model.labels.length, false)
  const probabilities = softmax(logits)
  return model.labels
    .map((char, index) => ({ char, score: probabilities[index] ?? 0 }))
    .sort((a, b) => b.score - a.score)
}

const glyphCanvas = document.createElement('canvas')
glyphCanvas.width = GRID_SIZE
glyphCanvas.height = GRID_SIZE
const glyphContext = glyphCanvas.getContext('2d')
const templateCache = new Map<string, Grid>()

interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const findInkBounds = (data: Uint8ClampedArray, width: number, height: number): Bounds | null => {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0
      if (alpha > 18) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { minX, minY, maxX, maxY }
}

const normalizeGrid = (data: Uint8ClampedArray, width: number, height: number): Grid | null => {
  const bounds = findInkBounds(data, width, height)
  if (!bounds) return null

  const cropW = Math.max(1, bounds.maxX - bounds.minX + 1)
  const cropH = Math.max(1, bounds.maxY - bounds.minY + 1)
  const scale = Math.min((GRID_SIZE - 6) / cropW, (GRID_SIZE - 6) / cropH)
  const drawW = Math.max(1, Math.round(cropW * scale))
  const drawH = Math.max(1, Math.round(cropH * scale))
  const padX = Math.floor((GRID_SIZE - drawW) / 2)
  const padY = Math.floor((GRID_SIZE - drawH) / 2)
  const grid = new Float32Array(GRID_SIZE * GRID_SIZE)

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const sx = Math.floor(bounds.minX + ((gx - padX + 0.5) / drawW) * cropW)
      const sy = Math.floor(bounds.minY + ((gy - padY + 0.5) / drawH) * cropH)
      if (gx < padX || gx >= padX + drawW || gy < padY || gy >= padY + drawH || sx < 0 || sy < 0 || sx >= width || sy >= height) {
        grid[gy * GRID_SIZE + gx] = 0
      } else {
        grid[gy * GRID_SIZE + gx] = (data[(sy * width + sx) * 4 + 3] ?? 0) / 255
      }
    }
  }
  return grid
}

const snapshotCanvas = (canvas: HTMLCanvasElement, label: string): DebugImage => {
  const output = document.createElement('canvas')
  output.width = canvas.width
  output.height = canvas.height
  const context = output.getContext('2d')
  if (context) {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, output.width, output.height)
    context.drawImage(canvas, 0, 0)
  }
  return { label, src: output.toDataURL('image/png'), kind: 'image' }
}

const gridToDebugImage = (grid: Grid, label: string): DebugImage => {
  const scale = 6
  const output = document.createElement('canvas')
  output.width = GRID_SIZE * scale
  output.height = GRID_SIZE * scale
  const context = output.getContext('2d')
  if (context) {
    context.imageSmoothingEnabled = false
    context.fillStyle = '#fff'
    context.fillRect(0, 0, output.width, output.height)
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const value = grid[y * GRID_SIZE + x] ?? 0
        context.fillStyle = `rgba(0,0,0,${value.toFixed(3)})`
        context.fillRect(x * scale, y * scale, scale, scale)
      }
    }
  }
  return { label, src: output.toDataURL('image/png'), kind: 'image' }
}

const predictionDebugItem = (prediction: Prediction, index: number): DebugImage => ({
  label: `${index + 1}. ${prediction.value} ${Math.round(prediction.score * 100)}%`,
  src: '',
  kind: 'prediction',
  value: prediction.value,
})

const textDebugItem = (label: string): DebugImage => ({ label, src: '', kind: 'prediction' })

const templateFor = (char: string): Grid => {
  const cached = templateCache.get(char)
  if (cached) return cached
  if (!glyphContext) return new Float32Array(GRID_SIZE * GRID_SIZE)

  glyphContext.clearRect(0, 0, GRID_SIZE, GRID_SIZE)
  glyphContext.fillStyle = '#000'
  glyphContext.textAlign = 'center'
  glyphContext.textBaseline = 'middle'
  glyphContext.font = char.match(/[a-z]/)
    ? '700 25px Arial'
    : char.match(/[+%@$]/)
      ? '700 23px Arial'
      : '700 27px Arial'
  glyphContext.fillText(char, GRID_SIZE / 2, GRID_SIZE / 2 + 1)

  const grid = normalizeGrid(glyphContext.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data, GRID_SIZE, GRID_SIZE) ?? new Float32Array(GRID_SIZE * GRID_SIZE)
  templateCache.set(char, grid)
  return grid
}

const distance = (a: Grid, b: Grid): number => {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    sum += d * d
  }
  return sum / a.length
}

const recognizeTemplate = (canvas: HTMLCanvasElement, debugImages: DebugImage[]): RecognitionResult | null => {
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const grid = normalizeGrid(image.data, image.width, image.height)
  if (!grid) return null

  const predictions = OCR_CANDIDATES
    .map((char) => ({ char, score: distance(grid, templateFor(char)) }))
    .sort((a, b) => a.score - b.score)
  const bestAllowed = predictions.find(prediction => ALLOWED_TARGETS.has(prediction.char))
  if (!bestAllowed) return null
  const allowedPredictions = predictions
    .filter(prediction => ALLOWED_TARGETS.has(prediction.char))
    .map(prediction => ({
      value: prediction.char,
      score: Math.max(0, 1 - prediction.score * 5),
    }))
  const predictionImages = allowedPredictions.map((prediction, index) =>
    gridToDebugImage(
      templateFor(prediction.value),
      `${index + 1}. ${prediction.value} ${Math.round(prediction.score * 100)}%`,
    ))
  return {
    value: bestAllowed.char,
    score: Math.max(0, 1 - bestAllowed.score * 5),
    predictions: allowedPredictions,
    debugImages: [
      ...debugImages,
      gridToDebugImage(grid, 'normalized 28x28 input'),
      ...predictionImages,
    ],
  }
}

const recognizeWithModel = async (canvas: HTMLCanvasElement, debugImages: DebugImage[]): Promise<RecognitionResult | null> => {
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const grid = normalizeGrid(image.data, image.width, image.height)
  if (!grid) return null

  const model = await loadLeNetModel()
  const predictions = predictLeNet(model, grid)
  const bestAllowed = predictions.find(prediction => ALLOWED_TARGETS.has(prediction.char))
  if (!bestAllowed) return null
  const allowedPredictions = predictions
    .filter(prediction => ALLOWED_TARGETS.has(prediction.char))
    .map(prediction => ({ value: prediction.char, score: prediction.score }))
  return {
    value: bestAllowed.char,
    score: bestAllowed.score,
    predictions: allowedPredictions,
    debugImages: [
      ...debugImages,
      gridToDebugImage(grid, 'normalized 28x28 input'),
      ...allowedPredictions.map((prediction, index) =>
        predictionDebugItem(prediction, index)),
    ],
  }
}

const RECOGNIZERS = {
  template: (canvas: HTMLCanvasElement, debugImages: DebugImage[]) => Promise.resolve(recognizeTemplate(canvas, debugImages)),
  model: async (canvas: HTMLCanvasElement, debugImages: DebugImage[]) => {
    try {
      return await recognizeWithModel(canvas, debugImages)
    } catch (error) {
      console.warn('EMNIST model recognition failed', error)
      return {
        value: 'model error',
        score: 0,
        predictions: [],
        debugImages: [...debugImages, textDebugItem('model prediction failed; no template fallback used')],
      }
    }
  },
} as const

const cropAndCenterCanvas = (canvas: HTMLCanvasElement): HTMLCanvasElement | null => {
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const bounds = findInkBounds(image.data, image.width, image.height)
  if (!bounds) return null

  const cropW = Math.max(1, bounds.maxX - bounds.minX + 1)
  const cropH = Math.max(1, bounds.maxY - bounds.minY + 1)
  const output = document.createElement('canvas')
  output.width = canvas.width
  output.height = canvas.height
  const outputContext = output.getContext('2d')
  if (!outputContext) return null

  const scale = Math.min((output.width * 0.76) / cropW, (output.height * 0.76) / cropH)
  const drawW = Math.max(1, cropW * scale)
  const drawH = Math.max(1, cropH * scale)
  const x = (output.width - drawW) / 2
  const y = (output.height - drawH) / 2
  outputContext.drawImage(canvas, bounds.minX, bounds.minY, cropW, cropH, x, y, drawW, drawH)
  return output
}

const recognizeFromBoard = async (canvas: HTMLCanvasElement, mode: RecognitionMode): Promise<RecognitionResult | null> => {
  const debugImages = [snapshotCanvas(canvas, 'raw board')]
  const centered = cropAndCenterCanvas(canvas)
  if (!centered) return null
  return RECOGNIZERS[mode](centered, [...debugImages, snapshotCanvas(centered, 'cropped and centered')])
}

const boardImageToCanvas = (src: string): Promise<HTMLCanvasElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Unable to create canvas context'))
        return
      }
      context.drawImage(image, 0, 0)
      resolve(canvas)
    }
    image.onerror = () => reject(new Error('Unable to load board image'))
    image.src = src
  })

const recognizeBoardImageCmd = (target: string, mode: RecognitionMode, boardImage: string): Command.Command<Message> => ({
  name: 'DrawReprocessBoard',
  effect: Effect.tryPromise(async () => {
    try {
      const canvas = await boardImageToCanvas(boardImage)
      const result = await recognizeFromBoard(canvas, mode)
      return result ? BoardRecognized({ ...result, target, mode, boardImage }) : RecognitionFailed()
    } catch {
      return RecognitionFailed()
    }
  }),
})

const recognizeCurrentBoardCmd = (target: string, mode: RecognitionMode): Command.Command<Message> => ({
  name: 'DrawSubmitBoard',
  effect: Effect.tryPromise(async () => {
    try {
      const canvas = document.querySelector<HTMLCanvasElement>('#draw-board')
      if (!canvas) return RecognitionFailed()
      const boardImage = canvas.toDataURL('image/png')
      const result = await recognizeFromBoard(canvas, mode)
      return result ? BoardRecognized({ ...result, target, mode, boardImage }) : RecognitionFailed()
    } catch {
      return RecognitionFailed()
    }
  }),
})

const mountWhiteboard = () => (element: Element): Stream.Stream<Message> =>
  Stream.callback<Message>(() =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const canvas = element as HTMLCanvasElement
          const context = canvas.getContext('2d')
          const activePointers = new Set<number>()

          if (context) {
            context.lineCap = 'round'
            context.lineJoin = 'round'
            context.strokeStyle = '#161616'
            context.lineWidth = 22
          }

          const point = (event: PointerEvent): readonly [number, number] => {
            const rect = canvas.getBoundingClientRect()
            return [
              ((event.clientX - rect.left) / rect.width) * canvas.width,
              ((event.clientY - rect.top) / rect.height) * canvas.height,
            ]
          }

          const drawTo = (event: PointerEvent): void => {
            if (!context || !activePointers.has(event.pointerId)) return
            event.preventDefault()
            const [x, y] = point(event)
            context.lineTo(x, y)
            context.stroke()
          }

          const onDown = (event: PointerEvent): void => {
            if (!context) return
            event.preventDefault()
            canvas.setPointerCapture(event.pointerId)
            activePointers.add(event.pointerId)
            const [x, y] = point(event)
            context.beginPath()
            context.moveTo(x, y)
            context.lineTo(x + 0.01, y + 0.01)
            context.stroke()
          }

          const onUp = (event: PointerEvent): void => {
            if (!activePointers.has(event.pointerId)) return
            event.preventDefault()
            activePointers.delete(event.pointerId)
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
          }

          canvas.addEventListener('pointerdown', onDown)
          canvas.addEventListener('pointermove', drawTo)
          canvas.addEventListener('pointerup', onUp)
          canvas.addEventListener('pointercancel', onUp)

          return { canvas, onDown, drawTo, onUp }
        }),
        ({ canvas, onDown, drawTo, onUp }) => Effect.sync(() => {
          canvas.removeEventListener('pointerdown', onDown)
          canvas.removeEventListener('pointermove', drawTo)
          canvas.removeEventListener('pointerup', onUp)
          canvas.removeEventListener('pointercancel', onUp)
        }),
      )
      return yield* Effect.never
    }),
  )

export const view = (model: Model) => {
  const h = html<Message>()
  const confidence = `${Math.round(model.lastConfidence * 100)}%`
  const modeLabel = model.recognitionMode === 'model' ? MODEL_LABEL : 'Template recognizer'
  const topN = model.lastPredictions.slice(0, model.topN)
  const topPredictions = topN.map(prediction => prediction.value).join(', ')
  const topNHasTarget = topN.some(prediction => isNearMatch(prediction.value, model.target))
  const prompt = model.target.match(/[A-Za-z]/)
    ? `Write the letter ${model.target}`
    : `Write the number ${model.target}`

  return h.div(
    [h.Class(model.success ? 'draw-page draw-page--success' : 'draw-page')],
    [
      h.div([h.Class('draw-top')], [
        h.h1([h.Class('draw-question')], [prompt]),
        h.div([h.Class('draw-score')], [`${model.score}`]),
      ]),
      h.div([h.Class('draw-board-wrap')], [
        h.canvas([
          h.Class('draw-board'),
          h.Id('draw-board'),
          h.Width('640'),
          h.Height('420'),
          h.Key(`draw-board-${model.round}-${model.clearCount}`),
          h.OnMount({ name: 'drawWhiteboard', args: {}, f: mountWhiteboard() }),
          h.Attribute('data-model-url', MODEL_URL),
          h.Attribute('data-recognition-mode', model.recognitionMode),
        ], []),
        model.success
          ? h.div([h.Class('draw-success')], ['✓'])
          : null,
      ]),
      h.div([h.Class('draw-bottom')], [
        h.div([h.Class('draw-actions')], [
          h.button([h.Class('btn btn-primary'), h.OnClick(SubmitBoard())], ['Submit']),
          h.button([h.Class('btn btn-secondary'), h.OnClick(SkipTarget())], ['Skip']),
          h.button([h.Class('btn btn-secondary'), h.OnClick(ShuffleTarget())], ['Shuffle']),
          h.button([h.Class('btn btn-secondary'), h.OnClick(ClearBoard())], ['Clear']),
        ]),
        model.lastGuess && !model.success
          ? h.span([h.Class('draw-guess')], [`I saw ${model.lastGuess} (${confidence}); target ${model.target} ${topNHasTarget ? 'is' : 'is not'} in top ${model.topN}: ${topPredictions}`])
          : h.span([h.Class('draw-model')], [modeLabel]),
        h.div([h.Class('draw-bottom-spacer')], []),
      ]),
      model.debugImages.length > 0
        ? h.div([h.Class('draw-debug')], [
          ...model.debugImages.map((image, index) => {
            const isPrediction = image.kind === 'prediction'
            return h.figure([h.Class(index < 3 ? 'draw-debug-item draw-debug-item--stage' : 'draw-debug-item'), h.Key(`${index}-${image.label}`)], [
              isPrediction
                ? h.div([h.Class('draw-debug-prediction')], [image.value ?? image.label])
                : h.img([h.Class('draw-debug-img'), h.Src(image.src), h.Alt(image.label)]),
              h.figcaption([h.Class('draw-debug-label')], [image.label]),
            ])
          }),
        ])
        : null,
    ],
  )
}
