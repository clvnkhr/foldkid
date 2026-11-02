import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

export interface OfflineFile { readonly fileName: string; readonly source: string | Uint8Array }
export interface OfflineManifest {
  readonly base: string
  readonly version: string
  readonly assets: ReadonlyArray<{ readonly url: string; readonly revision: string; readonly critical: boolean }>
}
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')
const publicAsset = (name: string): boolean =>
  !name.startsWith('tarot/sources.') && /\.(?:avif|bin|css|gif|ico|jpeg|jpg|json|js|keras|mp3|ogg|png|svg|wav|webp|woff2?)$/i.test(name)

export const buildOfflineManifest = (base: string, files: ReadonlyArray<OfflineFile>, worker: string): OfflineManifest => {
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..') || base.includes('?') || base.includes('#')) throw new Error('Offline assets need an absolute app base path')
  const entries = files.map(file => ({ url: `${base}${file.fileName}`, revision: hash(file.source), critical: /\.(?:html|css|js)$/.test(file.fileName) })).sort((a, b) => a.url.localeCompare(b.url))
  const index = entries.find(entry => entry.url === `${base}index.html`)
  if (!index) throw new Error('Offline assets are missing the built index.html')
  const assets = [{ url: base, revision: index.revision, critical: true }, ...entries]
  return { base, assets, version: hash(`${worker}\n${JSON.stringify(assets)}`).slice(0, 24) }
}

export const offlineWorkerSource = (manifest: OfflineManifest, worker: string): string =>
  `const FOLDKID_OFFLINE = ${JSON.stringify(manifest)};\n${worker}`

export const readOfflinePublicFiles = async (root: string, dir = root): Promise<OfflineFile[]> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return readOfflinePublicFiles(root, path)
    const fileName = relative(root, path).replaceAll('\\', '/')
    return entry.isFile() && publicAsset(fileName) ? [{ fileName, source: await readFile(path) }] : []
  }))
  return nested.flat()
}

/** The worker changes whenever an emitted chunk or an unhashed public asset changes. */
export const offlineAssets = (): Plugin => {
  let config: ResolvedConfig
  return {
    name: 'foldkid-offline-assets',
    apply: 'build',
    enforce: 'post',
    configResolved: resolved => { config = resolved },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const files: OfflineFile[] = Object.values(bundle).flatMap(file =>
          file.type === 'chunk' ? [{ fileName: file.fileName, source: file.code }]
            : /\.(?:html|css|js|woff2?)$/i.test(file.fileName) ? [{ fileName: file.fileName, source: file.source }] : [])
        if (config.publicDir) files.push(...await readOfflinePublicFiles(config.publicDir))
        const worker = await readFile(join(config.root, 'scripts/offline-worker.js'), 'utf8')
        const manifest = buildOfflineManifest(config.base, files, worker)
        this.emitFile({ type: 'asset', fileName: 'offline-worker.js', source: offlineWorkerSource(manifest, worker) })
      },
    },
  }
}
