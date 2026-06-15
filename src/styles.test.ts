import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

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

const styles = readStylesheet(stylesEntryPath)
const stylesEntry = readFileSync(stylesEntryPath, 'utf8')
const stylesheetBudgets = [
  ['styles/base.css', 320, 7000, 2200],
  ['styles/landing.css', 160, 3000, 1200],
  ['styles/counter.css', 120, 2500, 1000],
  ['styles/findit.css', 300, 6500, 1800],
  ['styles/bubbles.css', 200, 4500, 1500],
  ['styles/settings.css', 280, 5000, 1500],
  ['styles/musicbox.css', 560, 12000, 3200],
  ['styles/audiotest.css', 120, 2200, 900],
] as const

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
])

const stripDataUrls = (css: string): string =>
  css.replace(/url\([^)]*\)/g, '')

const cssClassNames = (css: string): string[] =>
  [...new Set(
    [...stripDataUrls(css).matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)]
      .map(match => match[1]!)
      .filter(className => !generatedClassNames.has(className)),
  )].sort()

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

  it('does not keep unused keyframes', () => {
    const keyframes = [...styles.matchAll(/@keyframes\s+([-_a-zA-Z0-9]+)/g)].map(match => match[1]!)

    for (const name of keyframes) {
      const references = styles.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []
      expect(references.length, name).toBeGreaterThan(1)
    }
  })

  it('keeps each stylesheet within its domain budget', () => {
    for (const [filePath, maxLines, maxBytes, maxGzipBytes] of stylesheetBudgets) {
      const css = readFileSync(join(srcDir, filePath), 'utf8')
      expect(css.split('\n').length, `${filePath} lines`).toBeLessThanOrEqual(maxLines)
      expect(Buffer.byteLength(css, 'utf8'), `${filePath} bytes`).toBeLessThanOrEqual(maxBytes)
      expect(gzipSync(css).length, `${filePath} gzip bytes`).toBeLessThanOrEqual(maxGzipBytes)
    }
  })

  it('keeps the combined stylesheet within an app-wide budget', () => {
    expect(styles.split('\n').length).toBeLessThanOrEqual(1800)
    expect(Buffer.byteLength(styles, 'utf8')).toBeLessThanOrEqual(36000)
    expect(gzipSync(styles).length).toBeLessThanOrEqual(8000)
  })
})
