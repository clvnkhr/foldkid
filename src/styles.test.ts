import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { LANDING_GAME_COUNT } from './pages/landing'

const srcDir = dirname(fileURLToPath(import.meta.url))
const stylesEntryPath = join(srcDir, 'styles.css')

const readStylesheet = (filePath: string, seen = new Set<string>()): string => {
  if (seen.has(filePath)) return ''
  seen.add(filePath)
  const css = readFileSync(filePath, 'utf8')
  return css.replace(/@import\s+['"](.+?)['"];/g, (_, importPath: string) =>
    readStylesheet(join(dirname(filePath), importPath), seen),
  )
}

const PER_GAME_BUDGET = { lines: 600, bytes: 13000, gzip: 3500 }

const NON_GAME_BUDGETS: Record<string, { lines: number; bytes: number; gzip: number }> = {
  'styles/base.css': { lines: 320, bytes: 7000, gzip: 2200 },
  'styles/landing.css': { lines: 160, bytes: 3000, gzip: 1200 },
  'styles/settings.css': { lines: 280, bytes: 5000, gzip: 1500 },
}

const styles = readStylesheet(stylesEntryPath)
const stylesEntry = readFileSync(stylesEntryPath, 'utf8')

const NON_GAME_OVERHEAD = { lines: 800, bytes: 15000, gzip: 5000 }
const PER_GAME_CONTRIBUTION = { lines: 210, bytes: 6000, gzip: 1100 }

const appWideStylesheetBudget = {
  lines: NON_GAME_OVERHEAD.lines + LANDING_GAME_COUNT * PER_GAME_CONTRIBUTION.lines,
  bytes: NON_GAME_OVERHEAD.bytes + LANDING_GAME_COUNT * PER_GAME_CONTRIBUTION.bytes,
  gzipBytes: NON_GAME_OVERHEAD.gzip + LANDING_GAME_COUNT * PER_GAME_CONTRIBUTION.gzip,
}

const readSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return readSourceFiles(path)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return []
    return [readFileSync(path, 'utf8')]
  })

const appSource = readSourceFiles(srcDir).join('\n')

const generatedClassNames = new Set([
  'lang-fa',
  'calc-theme-1',
  'calc-theme-2',
  'calc-theme-3',
  'calc-theme-4',
  'whack-mole--type-2',
  'whack-mole--type-3',
  'whack-mole--type-4',
  'pat-tile--0',
  'pat-tile--1',
  'pat-tile--2',
  'pat-tile--3',
  'magnetic-block-eye--left',
  'magnetic-block-eye--right',
  'talking-keyboard-row--1',
  'talking-keyboard-row--2',
  'rps-result-text--win',
  'rps-result-text--lose',
  'rps-result-text--tie',
  'bubble--star',
  'bubble--heart',
  'bubble--triangle',
  'bubble--oval',
  'bubble--semicircle',
  'bubble--donut',
  'bubble--rectangle',
  'bubble--diamond',
  'bubble--trapezoid',
  'bubble--square',
  'bubble--pentagon',
  'bubble--hexagon',
  'bubble--heptagon',
  'bubble--octagon',
])

const stripDataUrls = (css: string): string =>
  css.replace(/url\([^)]*\)/g, '')

const cssClassNames = (css: string): string[] =>
  [...new Set(
    [...stripDataUrls(css).matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)]
      .map(match => match[1]!)
      .filter(className => !generatedClassNames.has(className)),
  )].sort()

const cssRule = (selector: string): string => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('styles.css invariants', () => {
  it('keeps the root stylesheet as an import manifest', () => {
    expect(stylesEntry.trim().split('\n').every(line => line.startsWith('@import '))).toBe(true)
  })

  it('does not keep orphaned class selectors', () => {
    const orphaned = cssClassNames(styles).filter(className => !appSource.includes(className))

    expect(orphaned).toEqual([])
  })

  it('keeps critical app surfaces styled', () => {
    for (const selector of [
      '.app',
      '.settings-panel',
      '.balls-container',
      '.emoji-grid',
      '.bubbles-container',
      '.settings-song-list',
      '.musicbox-card',
      '.piano-key',
    ]) {
      expect(styles, selector).toContain(selector)
    }
  })

  it('keeps musicbox drumpads in the same footprint as the piano keyboard', () => {
    const piano = cssRule('.piano-container')
    const drumPad = cssRule('.drum-pad-panel')
    const drumGrid = cssRule('.drum-pad-grid')

    expect(drumPad).toContain('width: 100%')
    expect(drumPad).toContain('height: 150px')
    expect(drumPad).toContain('padding: 5px 4px 0')
    expect(piano).toContain('width: 100%')
    expect(piano).toContain('height: 150px')
    expect(piano).toContain('padding: 5px 4px 0')
    expect(drumGrid).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(drumGrid).toContain('grid-template-rows: repeat(2, minmax(0, 1fr))')
  })

  it('keeps the settings panel scrollable on touch devices', () => {
    const settingsPanel = cssRule('.settings-panel')
    const dragHandle = cssRule('.settings-drag-handle')

    expect(settingsPanel).toContain('overflow-y: auto')
    expect(settingsPanel).toContain('touch-action: pan-y')
    expect(settingsPanel).toContain('-webkit-overflow-scrolling: touch')
    expect(dragHandle).toContain('touch-action: none')
  })

  it('lets the 3D play area fill the viewport around its controls', () => {
    const app = cssRule('.app--bubbles3d')
    const nav = cssRule('.app--bubbles3d .nav-bar')
    const page = cssRule('.bubbles3d-page')
    const card = cssRule('.bubbles3d-card')
    const stage = cssRule('.bubbles3d-stage')
    const fallback = cssRule('.bubbles3d-bubble-buttons')

    expect(app).toContain('height: 100dvh')
    expect(nav).toContain('position: relative')
    expect(page).toContain('flex: 1 1 0')
    expect(page).toContain('min-height: 0')
    expect(page).toContain('safe-area-inset-bottom')
    expect(card).toContain('width: 100%')
    expect(card).toContain('max-width: none')
    expect(card).toContain('min-height: 0')
    expect(stage).toContain('flex: 1 1 0')
    expect(stage).toContain('min-height: 0')
    expect(stage).not.toContain('height: clamp')
    expect(fallback).toContain('overflow-y: auto')
    expect(fallback).toContain('touch-action: pan-y')
  })

  it('keeps 3D creation holds separate from ordinary touch buttons', () => {
    const color = cssRule('.bubbles3d-color-button')
    const shape = cssRule('.bubbles3d-shape-button')
    expect(color).toContain('touch-action: none')
    expect(color).toContain('min-height: 44px')
    expect(shape).toContain('touch-action: manipulation')
    expect(shape).toContain('overflow-wrap: anywhere')
    expect(styles).toContain('.bubbles3d-color-button:focus-visible')
    expect(styles).toContain('.bubbles3d-color-button--charging')
  })

  it('keeps the 3D board and fallback feedback on the effective app theme', () => {
    const stage = cssRule('.bubbles3d-stage')
    const fallback = cssRule('.bubbles3d-stage[data-renderer="ready"] .bubbles3d-bubble-buttons:focus-within')
    const bubble = cssRule('.bubbles3d-bubble-button')
    const focus = cssRule('.bubbles3d-bubble-button:focus-visible')
    const labels = cssRule('.bubbles3d-shape-icon, .bubbles3d-shape-number')

    expect(stage).toContain('var(--settings-bg)')
    expect(stage).toContain('var(--cell-hover-bg)')
    expect(stage).toContain('border: 1px solid var(--btn-secondary-bg)')
    expect(fallback).toContain('background: var(--card-bg)')
    expect(fallback).toContain('border: 1px solid var(--btn-secondary-bg)')
    expect(cssRule('.bubbles3d-empty')).toContain('color: var(--text-primary)')
    expect(bubble).toContain('color: var(--text-primary)')
    expect(labels).toContain('background: var(--card-bg)')
    expect(focus).toContain('outline: 3px solid var(--text-primary)')
  })

  it('keeps four Growing Numbers cards visible with scrollable history', () => {
    const strip = cssRule('.growing-numbers-sequence--explore')
    const term = cssRule('.growing-numbers-term')

    expect(strip).toContain('display: flex')
    expect(strip).toContain('overflow-x: auto')
    expect(strip).toContain('scroll-snap-type: x proximity')
    expect(strip).toContain('-webkit-overflow-scrolling: touch')
    expect(strip).toContain('--growing-numbers-term-width: calc((100% - 3 * var(--growing-numbers-gap)) / 4)')
    expect(term).toContain('flex: 0 0 var(--growing-numbers-term-width, auto)')
    expect(term).toContain('content-visibility: auto')
  })

  it('keeps handwriting tracing scoped to the board with reachable native controls', () => {
    const board = cssRule('.handwriting-board')
    const choices = cssRule('.handwriting-choices')
    const choice = cssRule('.handwriting-choice')
    const controls = cssRule('.handwriting-mode, .handwriting-case')
    const page = cssRule('.handwriting-page')

    expect(board).toContain('touch-action: none')
    expect(board).toContain('height: clamp(260px, 40dvh, 440px)')
    expect(board).toContain('width: 100%')
    expect(controls).toContain('touch-action: manipulation')
    expect(controls).toContain('min-height: 44px')
    expect(choice).toContain('min-height: 44px')
    expect(choices).toContain('overflow-x: auto')
    expect(choices).toContain('touch-action: pan-x pan-y')
    expect(choices).toContain('-webkit-overflow-scrolling: touch')
    expect(page).toContain('4.75rem')
    expect(page).toContain('safe-area-inset-bottom')
    expect(styles).toContain('.handwriting-board:focus-visible')
    expect(styles).toContain('.handwriting-actions button:focus-visible')
  })

  it('keeps handwriting themes, translated controls, and reduced-motion completion readable', () => {
    const card = cssRule('.handwriting-card')
    const ink = cssRule('.handwriting-ink')
    const completed = cssRule('.handwriting-board[data-complete="true"]')
    const toolbar = cssRule('.handwriting-toolbar')

    expect(card).toContain('background: var(--card-bg)')
    expect(card).toContain('color: var(--text-primary)')
    expect(toolbar).toContain('flex-wrap: wrap')
    expect(cssRule('.handwriting-mode, .handwriting-case')).toContain('overflow-wrap: anywhere')
    expect(cssRule('.handwriting-feedback')).toContain('overflow-wrap: anywhere')
    expect(ink).toContain('stroke-linecap: round')
    expect(ink).not.toMatch(/(?:^|;)\s*stroke\s*:/)
    expect(completed).toContain('border-color: var(--number-color)')
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.handwriting-mode[^}]*transition:\s*none/)
    expect(cssRule('.handwriting-keyboard-hint')).toContain('clip-path: inset(50%)')
  })

  it('keeps Find It card boxes stable while sizing single and pair emoji separately', () => {
    const emojiCell = cssRule('.emoji-cell')
    const pairsCell = cssRule('.emoji-cell--pairs')

    expect(emojiCell).toContain('width: 100%')
    expect(emojiCell).toContain('aspect-ratio: 1')
    expect(emojiCell).toContain('--findit-emoji-size: clamp(2.2rem, 9vw, 4.5rem)')
    expect(emojiCell).toContain('font-size: var(--findit-emoji-size)')
    expect(pairsCell).toContain('--findit-emoji-size: clamp(1.3rem, 6vw, 3rem)')
    expect(pairsCell).toContain('font-size: var(--findit-emoji-size)')
  })

  it('keeps every paged Bubble shape visible and its dark-mode selection readable', () => {
    for (const shape of ['semicircle', 'rectangle', 'diamond', 'trapezoid', 'square', 'pentagon', 'hexagon', 'heptagon', 'octagon']) {
      expect(cssRule(`.bubble--${shape}`), shape).toContain('clip-path:')
    }

    const donut = cssRule('.bubble--donut')
    expect(donut).toContain('-webkit-mask: radial-gradient')
    expect(donut).toContain('mask: radial-gradient')

    const active = cssRule('.shape-btn--active')
    expect(active).toContain('background: #4f46e5')
    expect(active).toContain('color: #fff')

    const darkActive = cssRule('.dark .shape-btn--active')
    expect(darkActive).toContain('background: #818cf8')
    expect(darkActive).toContain('color: #111827')

    const darkNext = cssRule('.dark .shape-btn--next')
    expect(darkNext).toContain('background: #334155')
    expect(darkNext).toContain('color: #f8fafc')

    const darkNextPressed = cssRule('.dark .shape-btn--next:active')
    expect(darkNextPressed).toContain('background: #1e293b')
    expect(darkNextPressed).toContain('color: #f8fafc')
  })

  it('gives the Bubble star a broad sheen without centre or single-lobe artifacts', () => {
    const starShading = cssRule('.bubble--star::before')
    const starHighlight = cssRule('.bubble--star::after')

    expect(starShading).toContain('radial-gradient(ellipse 85% 65%')
    expect(starShading).toContain('linear-gradient')
    expect(starShading).not.toContain('conic-gradient')
    expect(starHighlight).toContain('display: none')
  })

  it('keeps the Talking Keyboard zoo trio within one emoji footprint', () => {
    const trio = cssRule('.talking-keyboard-emoji-trio')
    const firstAnimal = cssRule('.talking-keyboard-emoji-trio > span:first-child')

    expect(trio).toContain('display: inline-grid')
    expect(trio).toContain('grid-template-columns: repeat(2, 1em)')
    expect(trio).toContain('grid-template-rows: repeat(2, 1em)')
    expect(trio).toContain('font-size: 0.5em')
    expect(firstAnimal).toContain('grid-column: 1 / -1')
  })

  it('gives Talking Keyboard long words two lines and lets its keys fill the play area', () => {
    const card = cssRule('.talking-keyboard-card')
    const showcase = cssRule('.talking-keyboard-showcase')
    const word = cssRule('.talking-keyboard-word')
    const keys = cssRule('.talking-keyboard-keys')
    const key = cssRule('.talking-keyboard-key')

    expect(card).toContain('max-width: none')
    expect(showcase).toContain('min-height: clamp(14rem, 29dvh, 17rem)')
    expect(word).toContain('min-height: 2.04em')
    expect(keys).toContain('flex: 1 1 auto')
    expect(keys).toContain('width: 100%')
    expect(key).toContain('max-width: none')
    expect(key).toContain('height: 100%')
  })

  it('does not keep unused keyframes', () => {
    const keyframes = [...styles.matchAll(/@keyframes\s+([-_a-zA-Z0-9]+)/g)].map(match => match[1]!)

    for (const name of keyframes) {
      const references = styles.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []
      expect(references.length, name).toBeGreaterThan(1)
    }
  })

  it('keeps each stylesheet within its domain budget', () => {
    const importedFiles = [...stylesEntry.matchAll(/@import\s+['"].\/styles\/(.+?)['"];/g)].map(m => m[1]!)
    for (const filePath of importedFiles) {
      const css = readFileSync(join(srcDir, 'styles', filePath), 'utf8')
      const budget = NON_GAME_BUDGETS[`styles/${filePath}`] ?? PER_GAME_BUDGET
      expect(css.split('\n').length, `${filePath} lines`).toBeLessThanOrEqual(budget.lines)
      expect(Buffer.byteLength(css, 'utf8'), `${filePath} bytes`).toBeLessThanOrEqual(budget.bytes)
      expect(gzipSync(css).length, `${filePath} gzip bytes`).toBeLessThanOrEqual(budget.gzip)
    }
  })

  it('keeps the combined stylesheet within an app-wide budget', () => {
    expect(styles.split('\n').length).toBeLessThanOrEqual(appWideStylesheetBudget.lines)
    expect(Buffer.byteLength(styles, 'utf8')).toBeLessThanOrEqual(appWideStylesheetBudget.bytes)
    expect(gzipSync(styles).length).toBeLessThanOrEqual(appWideStylesheetBudget.gzipBytes)
  })
})
