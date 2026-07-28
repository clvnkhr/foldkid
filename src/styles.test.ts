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
const PER_GAME_CONTRIBUTION = { lines: 210, bytes: 5000, gzip: 1000 }

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
  'rps-result-text--win',
  'rps-result-text--lose',
  'rps-result-text--tie',
  'bubble--star',
  'bubble--heart',
  'bubble--triangle',
  'bubble--oval',
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
