// @vitest-environment node
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { t } from './i18n'

const repo = process.cwd()
const fontNames = [
  'comic-neue-400-latin.woff2', 'comic-neue-700-latin.woff2',
  'rubik-400-900-arabic.woff2', 'rubik-400-900-latin.woff2',
]

describe('bundled native and web assets', () => {
  it('bundles localized optional motion permission text from all eight app dictionaries', async () => {
    const locales = { en: 'en', zh: 'zh-Hans', fr: 'fr', de: 'de', fa: 'fa', ms: 'ms', 'zh-HK': 'zh-HK', ja: 'ja' }
    const plist = await readFile(join(repo, 'ios/App/App/Info.plist'), 'utf8')
    expect(plist).toContain(`<key>NSMotionUsageDescription</key>\n\t<string>${t('iosMotionUsage', 'en')}</string>`)
    expect([...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map(match => match[1])).toEqual(['NSMotionUsageDescription'])
    const project = await readFile(join(repo, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
    const variant = project.match(/([A-F0-9]{24}) \/\* InfoPlist\.strings \*\/ = \{\s*isa = PBXVariantGroup;([\s\S]*?)\n\t\t\};/)
    expect(variant).not.toBeNull()
    const resource = project.match(new RegExp(`([A-F0-9]{24}) /\\* InfoPlist\\.strings in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${variant![1]}`))
    expect(resource).not.toBeNull()
    const resourcesPhase = project.match(/isa = PBXResourcesBuildPhase;([\s\S]*?)\n\t\t\};/)?.[1]
    expect(resourcesPhase).toContain(`${resource![1]} /* InfoPlist.strings in Resources */`)
    const knownRegions = project.match(/knownRegions = \(([\s\S]*?)\);/)?.[1]
    for (const [language, locale] of Object.entries(locales)) {
      const text = await readFile(join(repo, `ios/App/App/${locale}.lproj/InfoPlist.strings`), 'utf8')
      const value = text.match(/"NSMotionUsageDescription"\s*=\s*("(?:[^"\\]|\\.)*")\s*;/)?.[1]
      expect(value, locale).toBeDefined()
      expect(JSON.parse(value!), locale).toBe(t('iosMotionUsage', language))
      expect(knownRegions).toMatch(new RegExp(`\\b${locale}\\b`))
      expect(project).toContain(`path = "${locale}.lproj/InfoPlist.strings"`)
      expect(variant![2]).toContain(`/* ${locale} */`)
    }
  })

  it('ships compact licensed fonts, including the Arabic subset used by the Farsi UI', async () => {
    const fonts = await Promise.all(fontNames.map(name => readFile(join(repo, 'public/fonts', name))))
    expect(fonts.every(font => font.subarray(0, 4).toString() === 'wOF2')).toBe(true)
    expect(fonts.reduce((bytes, font) => bytes + font.length, 0)).toBeLessThan(128 * 1024)
    for (const family of ['comicneue', 'rubik']) {
      expect(await readFile(join(repo, `public/fonts/${family}-OFL.txt`), 'utf8')).toContain('SIL OPEN FONT LICENSE')
    }
    const stylesheet = await readFile(join(repo, 'src/styles/fonts.css'), 'utf8')
    expect(stylesheet).toContain('U+0600-06FF')
    expect(stylesheet).toContain('font-weight: 400 900')
    const manifest = JSON.parse(await readFile(join(repo, 'public/manifest.json'), 'utf8')) as { start_url: string; icons: { src: string }[] }
    for (const base of ['https://foldkid.test/foldkid/', 'capacitor://localhost/']) {
      const location = new URL('manifest.json', base)
      expect(new URL(manifest.start_url, location).href).toBe(base)
      expect(manifest.icons.map(icon => new URL(icon.src, location).href)).toEqual([
        new URL('icon-192.png', base).href, new URL('icon-512.png', base).href,
      ])
    }
  })

  it.each(['/foldkid/', '/', './'])('builds local fonts and icons correctly with base %s', async base => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'foldkid-native-assets-')))
    try {
      await mkdir(join(root, 'src'))
      await writeFile(join(root, 'index.html'), await readFile(join(repo, 'index.html')))
      await writeFile(join(root, 'src/styles.css'), await readFile(join(repo, 'src/styles/fonts.css')))
      await writeFile(join(root, 'src/entry.ts'), 'document.documentElement.dataset.ready = "true"')
      const result = await build({ configFile: false, root, base, publicDir: join(repo, 'public'), logLevel: 'silent', build: { write: false } })
      const output = Array.isArray(result) ? result[0] : result
      if (!output || !('output' in output)) throw new Error('Missing Vite build output')
      const text = (fileName: string) => {
        const file = output.output.find(file => file.fileName === fileName)
        if (!file || file.type !== 'asset') throw new Error(`Missing ${fileName}`)
        return typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source)
      }
      const html = text('index.html')
      const cssName = output.output.find(file => file.fileName.endsWith('.css'))?.fileName
      if (!cssName) throw new Error('Missing bundled stylesheet')
      const css = text(cssName)
      for (const name of ['manifest.json', 'favicon.svg', 'apple-touch-icon.png']) expect(html).toContain(`${base}${name}`)
      for (const name of fontNames) expect(css).toContain(`${base === './' ? '../' : base}fonts/${name}`)
      expect(html).not.toMatch(/https?:\/\/fonts\.(?:googleapis|gstatic)\.com/)
      expect(css).not.toMatch(/url\(["']?https?:/)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
