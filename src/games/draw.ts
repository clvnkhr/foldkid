import { Effect, Match as M, Queue, Schema as S, Stream } from 'effect'
import { Command } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

const MODEL_LABELS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabdefghnqrt'.split('')
const NUMBER_TARGETS = MODEL_LABELS.filter(char => /\d/.test(char))
const LETTER_TARGETS = MODEL_LABELS.filter(char => /[A-Za-z]/.test(char))
const UPPERCASE_TARGETS = MODEL_LABELS.filter(char => /[A-Z]/.test(char))
const pairsFor = (targets: readonly string[]): string[] => targets.flatMap(left => targets.map(right => `${left}${right}`))
const NUMBER_PAIR_TARGETS = pairsFor(NUMBER_TARGETS)
const LETTER_PAIR_TARGETS = pairsFor(LETTER_TARGETS)
const ORDERED_NUMBER_PAIR_TARGETS = NUMBER_TARGETS.slice(1).flatMap(left => NUMBER_TARGETS.map(right => `${left}${right}`))
const UPPERCASE_PAIR_TARGETS = pairsFor(UPPERCASE_TARGETS)
export const TARGETS = [...MODEL_LABELS, ...NUMBER_PAIR_TARGETS, ...LETTER_PAIR_TARGETS]
const GRID_SIZE = 28
const MODEL_DIR_URL = 'models/lenet-5-emnist-balanced/'
const MODEL_URL = `${MODEL_DIR_URL}model.keras`
const MODEL_MANIFEST_URL = `${MODEL_DIR_URL}weights.json`
const MODEL_WEIGHTS_URL = `${MODEL_DIR_URL}weights.bin`
const MODEL_LABEL = 'LeNet-5 EMNIST model stored locally'
const MODEL_CACHE_KEY = 'foldkid-draw-lenet-cache-v1'
const MODEL_CACHE_VERSION = `${MODEL_MANIFEST_URL}|${MODEL_WEIGHTS_URL}|${MODEL_LABELS.join('')}`
const INK_ALPHA_THRESHOLD = 18
export const RecognitionMode = S.Union([S.Literal('model'), S.Literal('template')])
export type RecognitionMode = typeof RecognitionMode.Type
export const DEFAULT_RECOGNITION_MODE: RecognitionMode = 'model'
export const TargetOrderMode = S.Union([S.Literal('shuffle'), S.Literal('ordered')])
export type TargetOrderMode = typeof TargetOrderMode.Type
export const DEFAULT_TARGET_ORDER_MODE: TargetOrderMode = 'shuffle'
export const MIN_TOP_N = 1
export const MAX_TOP_N = 10
export const DEFAULT_TOP_N = 5
export const MIN_BRUSH_SIZE = 8
export const MAX_BRUSH_SIZE = 38
export const DEFAULT_BRUSH_SIZE = 22
const DEFAULT_INCLUDE_SINGLE = true
const DEFAULT_INCLUDE_PAIRS = true
const DEFAULT_INCLUDE_NUMBERS = true
const DEFAULT_INCLUDE_LETTERS = true
export const INK_COLORS = ['#161616', '#e03131', '#f08c00', '#fcc419', '#2f9e44', '#1971c2', '#7048e8', '#9c36b5'] as const
const DEFAULT_INK_COLOR = INK_COLORS[0]
const DARK_DEFAULT_INK_COLOR = '#fff'
const OCR_CANDIDATES = [...MODEL_LABELS, '+', '-', '=', '?', '!', '@', '$', '%']
const ALLOWED_TARGETS = new Set(MODEL_LABELS)
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
  targetOrderMode: TargetOrderMode,
  freeMode: S.Boolean,
  includeSingle: S.Boolean,
  includePairs: S.Boolean,
  includeNumbers: S.Boolean,
  includeLetters: S.Boolean,
  inkColor: S.String,
  brushSize: S.Number,
  clearCount: S.Number,
  debugImages: S.Array(DebugImage),
  lastBoardImage: S.String,
  winningImage: S.String,
})
export type Model = typeof Model.Type

const PredictionComponents = S.Array(S.Array(Prediction))
export const BoardRecognized = m('DrawBoardRecognized', { target: S.String, mode: RecognitionMode, value: S.String, score: S.Number, predictions: S.Array(Prediction), components: S.optionalKey(PredictionComponents), debugImages: S.Array(DebugImage), boardImage: S.String })
export const SubmitBoard = m('DrawSubmitBoard')
export const NextRound = m('DrawNextRound')
export const SkipTarget = m('DrawSkipTarget')
export const ShuffleTarget = m('DrawShuffleTarget')
export const ClearBoard = m('DrawClearBoard')
export const SetTopN = m('DrawSetTopN', { value: S.Number })
export const SetRecognitionMode = m('DrawSetRecognitionMode', { value: RecognitionMode })
export const SetTargetOrderMode = m('DrawSetTargetOrderMode', { value: TargetOrderMode })
export const SetFreeMode = m('DrawSetFreeMode', { value: S.Boolean })
export const SetIncludeSingle = m('DrawSetIncludeSingle', { value: S.Boolean })
export const SetIncludePairs = m('DrawSetIncludePairs', { value: S.Boolean })
export const SetIncludeNumbers = m('DrawSetIncludeNumbers', { value: S.Boolean })
export const SetIncludeLetters = m('DrawSetIncludeLetters', { value: S.Boolean })
export const SetInkColor = m('DrawSetInkColor', { value: S.String })
export const SetBrushSize = m('DrawSetBrushSize', { value: S.Number })
export const RecognitionFailed = m('DrawRecognitionFailed')

export const Message = S.Union([BoardRecognized, SubmitBoard, NextRound, SkipTarget, ShuffleTarget, ClearBoard, SetTopN, SetRecognitionMode, SetTargetOrderMode, SetFreeMode, SetIncludeSingle, SetIncludePairs, SetIncludeNumbers, SetIncludeLetters, SetInkColor, SetBrushSize, RecognitionFailed])
export type Message = typeof Message.Type

interface TargetPoolSettings {
  includeSingle: boolean
  includePairs: boolean
  includeNumbers: boolean
  includeLetters: boolean
  targetOrderMode?: TargetOrderMode
}

const unorderedTargetPoolFor = (settings: TargetPoolSettings): string[] => [
  ...(settings.includeSingle && settings.includeNumbers ? NUMBER_TARGETS : []),
  ...(settings.includeSingle && settings.includeLetters ? LETTER_TARGETS : []),
  ...(settings.includePairs && settings.includeNumbers ? NUMBER_PAIR_TARGETS : []),
  ...(settings.includePairs && settings.includeLetters ? LETTER_PAIR_TARGETS : []),
]

const orderedTargetPoolFor = (settings: TargetPoolSettings): string[] => {
  const activePool = unorderedTargetPoolFor(settings)
  const active = new Set(activePool)
  const preferred = [
    ...(settings.includeSingle && settings.includeNumbers ? NUMBER_TARGETS : []),
    ...(settings.includePairs && settings.includeNumbers ? ORDERED_NUMBER_PAIR_TARGETS : []),
    ...(settings.includeSingle && settings.includeLetters ? UPPERCASE_TARGETS : []),
    ...(settings.includePairs && settings.includeLetters ? UPPERCASE_PAIR_TARGETS : []),
  ].filter(target => active.has(target))
  const seen = new Set(preferred)
  return [...preferred, ...activePool.filter(target => !seen.has(target))]
}

export const targetPoolFor = (settings: TargetPoolSettings): string[] => {
  const pool = settings.targetOrderMode === 'ordered'
    ? orderedTargetPoolFor(settings)
    : unorderedTargetPoolFor(settings)
  return pool.length ? pool : TARGETS
}

const nextTarget = (round: number, settings: TargetPoolSettings): string => {
  const pool = targetPoolFor(settings)
  return pool[round % pool.length] ?? 'A'
}

const randomTarget = (current: string, settings: TargetPoolSettings, random = Math.random): string => {
  const fullPool = targetPoolFor(settings)
  const pool = fullPool.filter(target => target !== current)
  return pool[Math.floor(random() * pool.length)] ?? fullPool[0] ?? 'A'
}

const followingTarget = (current: string, settings: TargetPoolSettings): string => {
  const pool = targetPoolFor(settings)
  const index = pool.indexOf(current)
  return pool[(index + 1) % pool.length] ?? pool[0] ?? 'A'
}

const advanceTarget = (model: Model): string =>
  model.targetOrderMode === 'ordered'
    ? followingTarget(model.target, model)
    : randomTarget(model.target, model)

export const init = (): Model => ({
  target: nextTarget(0, {
    includeSingle: DEFAULT_INCLUDE_SINGLE,
    includePairs: DEFAULT_INCLUDE_PAIRS,
    includeNumbers: DEFAULT_INCLUDE_NUMBERS,
    includeLetters: DEFAULT_INCLUDE_LETTERS,
    targetOrderMode: DEFAULT_TARGET_ORDER_MODE,
  }),
  round: 0,
  score: 0,
  success: false,
  lastGuess: '',
  lastConfidence: 0,
  lastPredictions: [],
  topN: DEFAULT_TOP_N,
  recognitionMode: DEFAULT_RECOGNITION_MODE,
  targetOrderMode: DEFAULT_TARGET_ORDER_MODE,
  freeMode: false,
  includeSingle: DEFAULT_INCLUDE_SINGLE,
  includePairs: DEFAULT_INCLUDE_PAIRS,
  includeNumbers: DEFAULT_INCLUDE_NUMBERS,
  includeLetters: DEFAULT_INCLUDE_LETTERS,
  inkColor: DEFAULT_INK_COLOR,
  brushSize: DEFAULT_BRUSH_SIZE,
  clearCount: 0,
  debugImages: [],
  lastBoardImage: '',
  winningImage: '',
})

const nextRound = (model: Model): Model => {
  const round = model.round + 1
  return {
    ...model,
    target: advanceTarget(model),
    round,
    success: false,
    lastGuess: '',
    lastConfidence: 0,
    lastPredictions: [],
    clearCount: model.clearCount + 1,
    lastBoardImage: '',
    winningImage: '',
  }
}

const isNearMatch = (a: string, b: string): boolean =>
  a === b || NEAR_MATCH_GROUPS.some(group => group.has(a) && group.has(b))

const isTargetMatch = (prediction: string, target: string): boolean => {
  if (prediction.length !== target.length) return false
  return [...target].every((char, index) => isNearMatch(prediction[index] ?? '', char))
}

const componentsMatchTarget = (components: readonly (readonly Prediction[])[] | undefined, target: string, topN: number): boolean =>
  components?.length === target.length &&
  [...target].every((char, index) =>
    (components[index] ?? []).slice(0, topN).some(prediction => isNearMatch(prediction.value, char)))

export const normalizeTopN = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? Math.min(MAX_TOP_N, Math.max(MIN_TOP_N, Math.round(value))) : DEFAULT_TOP_N

export const normalizeBrushSize = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? Math.min(MAX_BRUSH_SIZE, Math.max(MIN_BRUSH_SIZE, Math.round(value))) : DEFAULT_BRUSH_SIZE

export const normalizeTargetForPool = (model: Model): Model =>
  targetPoolFor(model).includes(model.target) ? model : { ...model, target: targetPoolFor(model)[0] ?? 'A' }

const withTargetPoolSetting = (model: Model, patch: Partial<TargetPoolSettings>): Model => {
  const next = { ...model, ...patch, success: false, lastGuess: '', lastConfidence: 0, lastPredictions: [], debugImages: [], lastBoardImage: '', winningImage: '' }
  return targetPoolFor(next).includes(next.target)
    ? next
    : { ...next, target: next.targetOrderMode === 'ordered' ? targetPoolFor(next)[0] ?? 'A' : randomTarget(next.target, next), round: next.round + 1, clearCount: next.clearCount + 1 }
}

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<Command.Command<Message>>]>(),
    M.tagsExhaustive({
      DrawBoardRecognized: (msg) => {
        if (msg.mode !== model.recognitionMode) return [model, []]
        if (model.freeMode) {
          return [
            {
              ...model,
              success: false,
              lastGuess: msg.value,
              lastConfidence: msg.score,
              lastPredictions: msg.predictions,
              debugImages: msg.debugImages,
              lastBoardImage: msg.boardImage,
              winningImage: '',
            },
            [],
          ]
        }
        if (model.success) return [model, []]
        if (msg.target !== model.target) return [model, []]
        const matched = msg.components?.length === msg.target.length
          ? componentsMatchTarget(msg.components, msg.target, model.topN)
          : msg.predictions.slice(0, model.topN).some(prediction => isTargetMatch(prediction.value, msg.target))
        const winningImage = matched ? msg.debugImages.find(image => image.label === 'cropped and centered')?.src ?? msg.boardImage : ''
        return [
          {
            ...model,
            success: matched,
            lastGuess: msg.value,
            lastConfidence: msg.score,
            lastPredictions: msg.predictions,
            debugImages: msg.debugImages,
            lastBoardImage: msg.boardImage,
            winningImage,
            score: matched ? model.score + 1 : model.score,
          },
          [],
        ]
      },
      DrawSubmitBoard: () => [model, [RecognizeCurrentBoard({ target: model.target, mode: model.recognitionMode })]],
      DrawNextRound: () => [nextRound(model), []],
      DrawSkipTarget: () => [nextRound(model), []],
      DrawShuffleTarget: () => [
        {
          ...model,
          target: advanceTarget(model),
          round: model.round + 1,
          success: false,
          lastGuess: '',
          lastConfidence: 0,
          lastPredictions: [],
          clearCount: model.clearCount + 1,
          debugImages: [],
          lastBoardImage: '',
          winningImage: '',
        },
        [],
      ],
      DrawClearBoard: () => [
        { ...model, success: false, lastGuess: '', lastConfidence: 0, lastPredictions: [], clearCount: model.clearCount + 1, debugImages: [], lastBoardImage: '', winningImage: '' },
        [],
      ],
      DrawSetTopN: (msg) => [
        { ...model, topN: normalizeTopN(msg.value) },
        [],
      ],
      DrawSetRecognitionMode: (msg) => [
        { ...model, recognitionMode: msg.value, lastGuess: '', lastConfidence: 0, lastPredictions: [], debugImages: [] },
        model.lastBoardImage ? [RecognizeBoardImage({ target: model.target, mode: msg.value, boardImage: model.lastBoardImage })] : [],
      ],
      DrawSetTargetOrderMode: (msg) => [
        { ...model, targetOrderMode: msg.value },
        [],
      ],
      DrawSetFreeMode: (msg) => [
        { ...model, freeMode: msg.value, success: false, lastGuess: '', lastConfidence: 0, lastPredictions: [], clearCount: model.clearCount + 1, debugImages: [], lastBoardImage: '', winningImage: '' },
        [],
      ],
      DrawSetIncludeSingle: (msg) => [
        withTargetPoolSetting(model, { includeSingle: msg.value }),
        [],
      ],
      DrawSetIncludePairs: (msg) => [
        withTargetPoolSetting(model, { includePairs: msg.value }),
        [],
      ],
      DrawSetIncludeNumbers: (msg) => [
        withTargetPoolSetting(model, { includeNumbers: msg.value }),
        [],
      ],
      DrawSetIncludeLetters: (msg) => [
        withTargetPoolSetting(model, { includeLetters: msg.value }),
        [],
      ],
      DrawSetInkColor: (msg) => [
        { ...model, inkColor: INK_COLORS.includes(msg.value as typeof INK_COLORS[number]) ? msg.value : DEFAULT_INK_COLOR },
        [],
      ],
      DrawSetBrushSize: (msg) => [
        { ...model, brushSize: normalizeBrushSize(msg.value) },
        [],
      ],
      DrawRecognitionFailed: () => [model, []],
    }),
  )

type Grid = Float32Array

interface RecognitionResult {
  value: string
  score: number
  predictions: Prediction[]
  components?: Prediction[][]
  debugImages: DebugImage[]
}
type RecognitionMessage = ReturnType<typeof BoardRecognized> | ReturnType<typeof RecognitionFailed>

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

const tensorFor = (weights: Float32Array, tensors: Record<string, TensorSpec>, name: typeof REQUIRED_TENSORS[number]): Float32Array => {
  const spec = tensors[name]
  if (!spec) throw new Error(`Missing EMNIST tensor: ${name}`)
  return tensor(weights, spec)
}

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
    if (
      cached.version !== MODEL_CACHE_VERSION ||
      !cached.manifest ||
      !isWeightsManifest(cached.manifest) ||
      typeof cached.weightsBase64 !== 'string'
    ) return null
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

const fetchOk = async (url: string): Promise<Response> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`)
  return response
}

const fetchLeNetFiles = async (): Promise<readonly [WeightsManifest, ArrayBuffer]> => {
  const [manifest, buffer] = await Promise.all([
    fetchOk(MODEL_MANIFEST_URL).then(async response => {
      const manifest = await response.json() as unknown
      if (!isWeightsManifest(manifest)) throw new Error('Bad EMNIST weights manifest')
      return manifest
    }),
    fetchOk(MODEL_WEIGHTS_URL).then(response => response.arrayBuffer()),
  ])
  cacheLeNetFiles(manifest, buffer)
  return [manifest, buffer]
}

const REQUIRED_TENSORS = [
  'conv1Kernel',
  'conv1Bias',
  'conv2Kernel',
  'conv2Bias',
  'dense1Kernel',
  'dense1Bias',
  'dense2Kernel',
  'dense2Bias',
  'dense3Kernel',
  'dense3Bias',
] as const

const isTensorSpec = (value: unknown): value is TensorSpec =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as TensorSpec).shape) &&
  (value as TensorSpec).shape.every(item => Number.isInteger(item)) &&
  Number.isInteger((value as TensorSpec).offset) &&
  Number.isInteger((value as TensorSpec).length)

const isWeightsManifest = (value: unknown): value is WeightsManifest => {
  if (typeof value !== 'object' || value === null) return false
  const manifest = value as WeightsManifest
  return Array.isArray(manifest.labels) &&
    manifest.labels.every(label => typeof label === 'string') &&
    Number.isInteger(manifest.floatCount) &&
    typeof manifest.tensors === 'object' &&
    manifest.tensors !== null &&
    REQUIRED_TENSORS.every(name => isTensorSpec(manifest.tensors[name]))
}

const buildLeNetModel = (manifest: WeightsManifest, buffer: ArrayBuffer): LeNetModel => {
  const weights = new Float32Array(buffer)
  if (weights.length !== manifest.floatCount) {
    throw new Error(`Bad EMNIST weights length: ${weights.length}`)
  }
  const tensors = manifest.tensors
  return {
    labels: manifest.labels,
    conv1Kernel: tensorFor(weights, tensors, 'conv1Kernel'),
    conv1Bias: tensorFor(weights, tensors, 'conv1Bias'),
    conv2Kernel: tensorFor(weights, tensors, 'conv2Kernel'),
    conv2Bias: tensorFor(weights, tensors, 'conv2Bias'),
    dense1Kernel: tensorFor(weights, tensors, 'dense1Kernel'),
    dense1Bias: tensorFor(weights, tensors, 'dense1Bias'),
    dense2Kernel: tensorFor(weights, tensors, 'dense2Kernel'),
    dense2Bias: tensorFor(weights, tensors, 'dense2Bias'),
    dense3Kernel: tensorFor(weights, tensors, 'dense3Kernel'),
    dense3Bias: tensorFor(weights, tensors, 'dense3Bias'),
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
  })().catch(error => {
    leNetModelPromise = null
    throw error
  })
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

interface SplitSide {
  bounds: Bounds
  separator?: {
    slope: number
    centerY: number
    limit: number
    side: 'left' | 'right'
  }
}

interface SplitBounds {
  left: SplitSide
  right: SplitSide
}

const findInkBounds = (data: Uint8ClampedArray, width: number, height: number): Bounds | null => {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0
      if (alpha > INK_ALPHA_THRESHOLD) {
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

const findInkBoundsInColumns = (data: Uint8ClampedArray, width: number, height: number, minCol: number, maxCol: number): Bounds | null => {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = minCol; x <= maxCol; x++) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0
      if (alpha > INK_ALPHA_THRESHOLD) {
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

const findLeftRightSplit = (data: Uint8ClampedArray, width: number, height: number, allowAngled = false): SplitBounds | null => {
  const bounds = findInkBounds(data, width, height)
  if (!bounds) return null
  const inkWidth = bounds.maxX - bounds.minX + 1
  if (inkWidth < width * 0.22) return null

  const columns: number[] = []
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    let count = 0
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > INK_ALPHA_THRESHOLD) count++
    }
    columns[x] = count
  }

  let bestStart = -1
  let bestEnd = -1
  let runStart = -1
  for (let x = bounds.minX; x <= bounds.maxX; x++) {
    if ((columns[x] ?? 0) === 0) {
      if (runStart < 0) runStart = x
    } else if (runStart >= 0) {
      if (x - runStart > bestEnd - bestStart + 1) {
        bestStart = runStart
        bestEnd = x - 1
      }
      runStart = -1
    }
  }
  if (runStart >= 0 && bounds.maxX + 1 - runStart > bestEnd - bestStart + 1) {
    bestStart = runStart
    bestEnd = bounds.maxX
  }
  const gapWidth = bestEnd - bestStart + 1
  const leftWidth = bestStart - bounds.minX
  const rightWidth = bounds.maxX - bestEnd
  const minSide = Math.max(24, inkWidth * 0.18)
  const minGap = Math.max(18, inkWidth * 0.08)
  if (bestStart < 0 || gapWidth < minGap || leftWidth < minSide || rightWidth < minSide) {
    return allowAngled ? findAngledLeftRightSplit(data, width, height, bounds, minSide) : null
  }

  return splitBoundsInColumns(data, width, height, bounds.minX, bestStart - 1, bestEnd + 1, bounds.maxX)
}

const splitBoundsInColumns = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  leftMinCol: number,
  leftMaxCol: number,
  rightMinCol: number,
  rightMaxCol: number,
): SplitBounds | null => {
  const left = findInkBoundsInColumns(data, width, height, leftMinCol, leftMaxCol)
  const right = findInkBoundsInColumns(data, width, height, rightMinCol, rightMaxCol)
  return left && right ? { left: { bounds: left }, right: { bounds: right } } : null
}

const ANGLED_SPLIT_DEGREES = [-20, -10, 10, 20] as const

const projectedX = (x: number, y: number, slope: number, centerY: number): number =>
  Math.round(x - slope * (y - centerY))

const findInkBoundsBySplitSide = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: Bounds,
  slope: number,
  centerY: number,
  limit: number,
  side: 'left' | 'right',
): Bounds | null => {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const u = projectedX(x, y, slope, centerY)
      const onSide = side === 'left' ? u <= limit : u >= limit
      if (!onSide || (data[(y * width + x) * 4 + 3] ?? 0) <= INK_ALPHA_THRESHOLD) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { minX, minY, maxX, maxY }
}

const findAngledSplitForSlope = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: Bounds,
  minSide: number,
  slope: number,
): SplitBounds | null => {
  const centerY = (bounds.minY + bounds.maxY) / 2
  const columns = new Set<number>()
  let minU = Number.POSITIVE_INFINITY
  let maxU = Number.NEGATIVE_INFINITY
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > INK_ALPHA_THRESHOLD) {
        const u = projectedX(x, y, slope, centerY)
        columns.add(u)
        minU = Math.min(minU, u)
        maxU = Math.max(maxU, u)
      }
    }
  }
  if (!Number.isFinite(minU) || !Number.isFinite(maxU)) return null

  let bestStart = -1
  let bestEnd = -1
  let runStart = -1
  for (let u = minU; u <= maxU; u++) {
    if (!columns.has(u)) {
      if (runStart < 0) runStart = u
    } else if (runStart >= 0) {
      if (u - runStart > bestEnd - bestStart + 1) {
        bestStart = runStart
        bestEnd = u - 1
      }
      runStart = -1
    }
  }
  if (runStart >= 0 && maxU + 1 - runStart > bestEnd - bestStart + 1) {
    bestStart = runStart
    bestEnd = maxU
  }
  if (bestStart < 0) return null

  const gapWidth = bestEnd - bestStart + 1
  const minGap = Math.max(8, (bounds.maxX - bounds.minX + 1) * 0.035)
  if (gapWidth < minGap || bestStart - minU < minSide || maxU - bestEnd < minSide) return null

  const leftLimit = bestStart - 1
  const rightLimit = bestEnd + 1
  const leftBounds = findInkBoundsBySplitSide(data, width, height, bounds, slope, centerY, leftLimit, 'left')
  const rightBounds = findInkBoundsBySplitSide(data, width, height, bounds, slope, centerY, rightLimit, 'right')
  if (!leftBounds || !rightBounds) return null
  return {
    left: { bounds: leftBounds, separator: { slope, centerY, limit: leftLimit, side: 'left' } },
    right: { bounds: rightBounds, separator: { slope, centerY, limit: rightLimit, side: 'right' } },
  }
}

const findAngledLeftRightSplit = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: Bounds,
  minSide: number,
): SplitBounds | null => {
  for (const degrees of ANGLED_SPLIT_DEGREES) {
    const split = findAngledSplitForSlope(data, width, height, bounds, minSide, Math.tan(degrees * Math.PI / 180))
    if (split) return split
  }
  return null
}

const strokeColorForCanvas = (canvas: HTMLCanvasElement): string => {
  const selectedColor = canvas.dataset.inkColor ?? DEFAULT_INK_COLOR
  return selectedColor === DEFAULT_INK_COLOR && canvas.closest('.dark')
    ? DARK_DEFAULT_INK_COLOR
    : selectedColor
}

export const __drawTest = { findLeftRightSplit, strokeColorForCanvas }

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

const blackInkCanvas = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const output = document.createElement('canvas')
  output.width = canvas.width
  output.height = canvas.height
  const outputContext = output.getContext('2d')
  const inputContext = canvas.getContext('2d')
  if (!outputContext || !inputContext) return canvas
  const image = inputContext.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const alpha = image.data[i + 3] ?? 0
    image.data[i] = 0
    image.data[i + 1] = 0
    image.data[i + 2] = 0
    image.data[i + 3] = alpha
  }
  outputContext.putImageData(image, 0, 0)
  return output
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

const cropAndCenterBounds = (canvas: HTMLCanvasElement, bounds: Bounds): HTMLCanvasElement | null => {
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

const cropAndCenterSplitSide = (canvas: HTMLCanvasElement, side: SplitSide): HTMLCanvasElement | null => {
  if (!side.separator) return cropAndCenterBounds(canvas, side.bounds)

  const inputContext = canvas.getContext('2d')
  if (!inputContext) return null
  const image = inputContext.getImageData(0, 0, canvas.width, canvas.height)
  const masked = document.createElement('canvas')
  masked.width = canvas.width
  masked.height = canvas.height
  const maskedContext = masked.getContext('2d')
  if (!maskedContext) return null

  for (let y = side.bounds.minY; y <= side.bounds.maxY; y++) {
    for (let x = side.bounds.minX; x <= side.bounds.maxX; x++) {
      const u = projectedX(x, y, side.separator.slope, side.separator.centerY)
      const keep = side.separator.side === 'left' ? u <= side.separator.limit : u >= side.separator.limit
      if (keep) continue
      image.data[(y * canvas.width + x) * 4 + 3] = 0
    }
  }
  maskedContext.putImageData(image, 0, 0)
  return cropAndCenterBounds(masked, side.bounds)
}

const cropAndCenterCanvas = (canvas: HTMLCanvasElement): HTMLCanvasElement | null => {
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const bounds = findInkBounds(image.data, image.width, image.height)
  return bounds ? cropAndCenterBounds(canvas, bounds) : null
}

const recognizeCenteredCanvas = (
  centered: HTMLCanvasElement,
  mode: RecognitionMode,
  debugImages: DebugImage[],
): Promise<RecognitionResult | null> =>
  RECOGNIZERS[mode](blackInkCanvas(centered), [...debugImages, snapshotCanvas(centered, 'cropped and centered')])

const combineSplitResults = (left: RecognitionResult, right: RecognitionResult, debugImages: DebugImage[]): RecognitionResult => ({
  value: `${left.value}${right.value}`,
  score: (left.score + right.score) / 2,
  components: [left.predictions, right.predictions],
  predictions: [{
    value: `${left.value}${right.value}`,
    score: (left.score + right.score) / 2,
  }, ...left.predictions.slice(1, 6).flatMap((leftPrediction, index) => {
    const rightPrediction = right.predictions[index + 1]
    return rightPrediction ? [{ value: `${leftPrediction.value}${rightPrediction.value}`, score: (leftPrediction.score + rightPrediction.score) / 2 }] : []
  })],
  debugImages: [
    ...debugImages,
    textDebugItem(`split result ${left.value}${right.value}`),
    ...left.debugImages.slice(1).map(image => ({ ...image, label: `left ${image.label}` })),
    ...right.debugImages.slice(1).map(image => ({ ...image, label: `right ${image.label}` })),
  ],
})

const recognizeFromBoard = async (canvas: HTMLCanvasElement, mode: RecognitionMode, expectedGlyphs = 1): Promise<RecognitionResult | null> => {
  const debugImages = [snapshotCanvas(canvas, 'raw board')]
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const split = findLeftRightSplit(image.data, image.width, image.height, expectedGlyphs === 2)
  if (split) {
    const leftCanvas = cropAndCenterSplitSide(canvas, split.left)
    const rightCanvas = cropAndCenterSplitSide(canvas, split.right)
    if (leftCanvas && rightCanvas) {
      const [left, right] = await Promise.all([
        recognizeCenteredCanvas(leftCanvas, mode, [snapshotCanvas(leftCanvas, 'left cropped and centered')]),
        recognizeCenteredCanvas(rightCanvas, mode, [snapshotCanvas(rightCanvas, 'right cropped and centered')]),
      ])
      if (left && right) return combineSplitResults(left, right, debugImages)
    }
  }
  const centered = cropAndCenterCanvas(canvas)
  if (!centered) return null
  return recognizeCenteredCanvas(centered, mode, debugImages)
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

const recognizeBoardImage = async (target: string, mode: RecognitionMode, boardImage: string): Promise<RecognitionMessage> => {
  try {
    const canvas = await boardImageToCanvas(boardImage)
    const result = await recognizeFromBoard(canvas, mode, target.length)
    return result ? BoardRecognized({ ...result, target, mode, boardImage }) : RecognitionFailed()
  } catch {
    return RecognitionFailed()
  }
}

const recognizeCurrentBoard = async (target: string, mode: RecognitionMode): Promise<RecognitionMessage> => {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>('#draw-board')
    if (!canvas) return RecognitionFailed()
    const boardImage = canvas.toDataURL('image/png')
    const result = await recognizeFromBoard(canvas, mode, target.length)
    return result ? BoardRecognized({ ...result, target, mode, boardImage }) : RecognitionFailed()
  } catch {
    return RecognitionFailed()
  }
}

const RecognizeBoardImage = (args: { target: string; mode: RecognitionMode; boardImage: string }): Command.Command<Message> => ({
  name: 'DrawReprocessBoard',
  args,
  effect: Effect.promise(() => recognizeBoardImage(args.target, args.mode, args.boardImage)),
})

const RecognizeCurrentBoard = (args: { target: string; mode: RecognitionMode }): Command.Command<Message> => ({
  name: 'DrawSubmitBoard',
  args,
  effect: Effect.promise(() => recognizeCurrentBoard(args.target, args.mode)),
})

const modeFromCanvas = (canvas: HTMLCanvasElement): RecognitionMode =>
  canvas.dataset.recognitionMode === 'template' ? 'template' : 'model'

const brushSizeFromCanvas = (canvas: HTMLCanvasElement): number =>
  normalizeBrushSize(Number.parseFloat(canvas.dataset.brushSize ?? ''))

const mountWhiteboard = (target: string) => (element: Element): Stream.Stream<Message> =>
  Stream.callback<Message>(queue =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const canvas = element as HTMLCanvasElement
          const context = canvas.getContext('2d')
          const activePointers = new Set<number>()

          if (context) {
            context.lineCap = 'round'
            context.lineJoin = 'round'
            context.strokeStyle = strokeColorForCanvas(canvas)
            context.lineWidth = brushSizeFromCanvas(canvas)
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
            context.strokeStyle = strokeColorForCanvas(canvas)
            context.lineWidth = brushSizeFromCanvas(canvas)
            const [x, y] = point(event)
            context.lineTo(x, y)
            context.stroke()
          }

          const onDown = (event: PointerEvent): void => {
            if (!context) return
            event.preventDefault()
            canvas.setPointerCapture(event.pointerId)
            activePointers.add(event.pointerId)
            context.strokeStyle = strokeColorForCanvas(canvas)
            context.lineWidth = brushSizeFromCanvas(canvas)
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
            if (canvas.dataset.freeMode !== 'true') return
            const mode = modeFromCanvas(canvas)
            void recognizeFromBoard(canvas, mode, target.length).then(result => {
              if (result) Queue.offerUnsafe(queue, BoardRecognized({ ...result, target, mode, boardImage: canvas.toDataURL('image/png') }))
            })
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
  const topNHasTarget = topN.some(prediction => isTargetMatch(prediction.value, model.target))
  const prompt = model.freeMode
    ? 'Draw anything'
    : model.target.length > 1 && model.target.match(/^\d+$/)
      ? `Write the number ${model.target}`
      : model.target.length > 1
        ? `Write the letters ${model.target}`
        : model.target.match(/[A-Za-z]/)
    ? `Write the letter ${model.target}`
    : `Write the number ${model.target}`

  return h.div(
    [h.Class(model.success ? 'draw-page draw-page--success' : 'draw-page')],
    [
      h.div([h.Class('draw-top')], [
        h.h1([h.Class('draw-question')], [prompt]),
        model.freeMode ? null : h.div([h.Class('draw-score')], [`${model.score}`]),
      ]),
      h.div([h.Class('draw-board-wrap')], [
        model.success && !model.freeMode
          ? h.div([h.Class('draw-win-card')], [
            h.img([h.Class('draw-win-img'), h.Src(model.winningImage), h.Alt('Winning drawing')]),
            h.div([h.Class('draw-win-mark')], ['✓']),
            h.div([h.Class('draw-win-confidence')], [confidence]),
            h.button([h.Class('btn btn-primary draw-win-next'), h.OnClick(NextRound())], ['Next']),
          ])
          : h.canvas([
            h.Class('draw-board'),
            h.Id('draw-board'),
            h.Width('640'),
            h.Height('420'),
            h.Key(`draw-board-${model.round}-${model.clearCount}`),
            h.OnMount({ name: 'drawWhiteboard', args: { target: model.target }, f: mountWhiteboard(model.target) }),
            h.Attribute('data-model-url', MODEL_URL),
            h.Attribute('data-recognition-mode', model.recognitionMode),
            h.Attribute('data-free-mode', model.freeMode ? 'true' : 'false'),
            h.Attribute('data-ink-color', model.inkColor),
            h.Attribute('data-brush-size', model.brushSize.toString()),
          ], []),
      ]),
      h.div([h.Class('draw-bottom')], [
        model.success && !model.freeMode
          ? null
          : model.freeMode
            ? h.div([h.Class('draw-actions')], [
              ...INK_COLORS.map(color =>
                h.button([
                  h.Class(color === model.inkColor ? 'draw-swatch draw-swatch--active' : 'draw-swatch'),
                  h.Style({ background: color }),
                  h.AriaLabel(`Draw in ${color}`),
                  h.OnClick(SetInkColor({ value: color })),
                ], [])),
              h.input([
                h.Type('range'),
                h.Min(MIN_BRUSH_SIZE.toString()),
                h.Max(MAX_BRUSH_SIZE.toString()),
                h.Step('1'),
                h.Value(model.brushSize.toString()),
                h.AriaLabel('Brush thickness'),
                h.OnInput((value) => SetBrushSize({ value: parseFloat(value) })),
              ]),
              h.button([h.Class('btn btn-secondary'), h.OnClick(ClearBoard())], ['Clear']),
            ])
            : h.div([h.Class('draw-actions')], [
              ...INK_COLORS.map(color =>
                h.button([
                  h.Class(color === model.inkColor ? 'draw-swatch draw-swatch--active' : 'draw-swatch'),
                  h.Style({ background: color }),
                  h.AriaLabel(`Draw in ${color}`),
                  h.OnClick(SetInkColor({ value: color })),
                ], [])),
              h.input([
                h.Type('range'),
                h.Min(MIN_BRUSH_SIZE.toString()),
                h.Max(MAX_BRUSH_SIZE.toString()),
                h.Step('1'),
                h.Value(model.brushSize.toString()),
                h.AriaLabel('Brush thickness'),
                h.OnInput((value) => SetBrushSize({ value: parseFloat(value) })),
              ]),
              h.button([h.Class('btn btn-primary'), h.OnClick(SubmitBoard())], ['Submit']),
              h.button([h.Class('btn btn-secondary'), h.OnClick(SkipTarget())], ['Skip']),
              h.button([h.Class('btn btn-secondary'), h.OnClick(ShuffleTarget())], [model.targetOrderMode === 'ordered' ? 'Next' : 'Shuffle']),
              h.button([h.Class('btn btn-secondary'), h.OnClick(ClearBoard())], ['Clear']),
            ]),
        model.success && !model.freeMode
          ? null
          : model.lastGuess
            ? h.span([h.Class('draw-guess')], [
              model.freeMode
                ? `I saw ${model.lastGuess} (${confidence}); top ${model.topN}: ${topPredictions}`
                : `I saw ${model.lastGuess} (${confidence}); target ${model.target} ${topNHasTarget ? 'is' : 'is not'} in top ${model.topN}: ${topPredictions}`,
            ])
            : h.span([h.Class('draw-model')], [modeLabel]),
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
