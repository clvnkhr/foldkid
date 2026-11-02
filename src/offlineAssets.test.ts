// @vitest-environment node
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { buildOfflineManifest, offlineAssets, offlineWorkerSource, type OfflineManifest } from '../scripts/offlineAssets'
import { TAROT_CARDS } from './games/tarotDomain'

const worker = await readFile(join(process.cwd(), 'scripts/offline-worker.js'), 'utf8')
const origin = 'https://foldkid.test'
const prefix = 'foldkid-offline:/foldkid/:'
const key = (request: Request | string): string => typeof request === 'string' ? request : request.url
const manifest = (version: string, paths = ['/', '/index.html', '/tarot/Fool.webp']): OfflineManifest => ({
  base: '/foldkid/', version,
  assets: paths.map(path => ({ url: `/foldkid${path}`, revision: version, critical: path === '/' || path === '/index.html' })),
})

const harness = (data = manifest('one'), options: { fetch?: (request: Request | string) => Promise<Response>; storage?: boolean } = {}) => {
  const stores = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    if (options.storage === false) throw new Error('Storage unavailable')
    let store = stores.get(name)
    if (!store) { store = new Map(); stores.set(name, store) }
    return {
      match: async (request: Request | string) => store.get(key(request))?.clone(),
      put: async (request: Request | string, response: Response) => { store.set(key(request), response.clone()) },
    }
  }
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const fetch = vi.fn(options.fetch ?? (async (request: Request | string) => new Response(`network:${key(request)}`)))
  const skipWaiting = vi.fn(async () => {})
  const claim = vi.fn(async () => {})
  runInNewContext(offlineWorkerSource(data, worker), {
    URL, Request, Response, fetch,
    caches: { open, keys: async () => [...stores.keys()], delete: async (name: string) => stores.delete(name) },
    self: { location: { origin }, skipWaiting, clients: { claim }, addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => listeners.set(type, listener) },
  })
  const lifecycle = async (type: string, extra: Record<string, unknown> = {}) => {
    const work: Promise<unknown>[] = []
    listeners.get(type)!({ ...extra, waitUntil: (value: Promise<unknown>) => work.push(value) })
    await Promise.all(work)
  }
  const request = (input: Request | { method: string; url: string; mode: string }) => {
    let response: Promise<Response> | undefined
    listeners.get('fetch')!({ request: input, respondWith: (value: Promise<Response>) => { response = value } })
    return response
  }
  const seed = async (name: string, path: string, body: string) => (await open(name)).put(`${origin}${path}`, new Response(body))
  return { stores, fetch, skipWaiting, claim, lifecycle, request, seed }
}

describe('production offline assets build', () => {
  it('versions built bytes, public art bytes and worker logic deterministically', () => {
    const files = [{ fileName: 'index.html', source: '<html>app</html>' }, { fileName: 'tarot/Fool.webp', source: new Uint8Array([1, 2, 3]) }]
    const first = buildOfflineManifest('/foldkid/', files, worker)
    expect(buildOfflineManifest('/foldkid/', [...files].reverse(), worker)).toEqual(first)
    expect(first.assets.map(asset => asset.url)).toContain('/foldkid/')
    expect(buildOfflineManifest('/foldkid/', [{ ...files[0]!, source: '<html>new app</html>' }, files[1]!], worker).version).not.toBe(first.version)
    expect(buildOfflineManifest('/foldkid/', [files[0]!, { ...files[1]!, source: new Uint8Array([4]) }], worker).version).not.toBe(first.version)
    expect(buildOfflineManifest('/foldkid/', files, `${worker}\n// update`).version).not.toBe(first.version)
    expect(() => buildOfflineManifest('/foldkid/', [], worker)).toThrow('index.html')
    expect(() => buildOfflineManifest('./', files, worker)).toThrow('absolute app base')
  })

  it('emits a worker containing all 78 illustrations, the shell, styles and a lazy game chunk', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'foldkid-offline-build-')))
    try {
      await mkdir(join(root, 'scripts'))
      await writeFile(join(root, 'scripts/offline-worker.js'), worker)
      await writeFile(join(root, 'index.html'), '<div id="root"></div><script type="module" src="/entry.ts"></script>')
      await writeFile(join(root, 'entry.ts'), "import './style.css'; document.addEventListener('click', () => import('./bubbles3dRuntime'))")
      await writeFile(join(root, 'bubbles3dRuntime.ts'), 'export const game = "lazy"; console.log(game)')
      await writeFile(join(root, 'style.css'), 'body { color: red; }')
      const result = await build({ configFile: false, root, base: '/foldkid/', publicDir: join(process.cwd(), 'public'), plugins: [offlineAssets()], logLevel: 'silent', build: { write: false } })
      const output = Array.isArray(result) ? result[0] : result
      if (!output || !('output' in output)) throw new Error('Missing production output')
      const generated = output.output.find(file => file.fileName === 'offline-worker.js')
      if (!generated || generated.type !== 'asset') throw new Error('Missing production worker')
      const source = typeof generated.source === 'string' ? generated.source : new TextDecoder().decode(generated.source)
      const data = JSON.parse(source.split('\n')[0]!.slice('const FOLDKID_OFFLINE = '.length, -1)) as OfflineManifest
      const urls = data.assets.map(asset => asset.url)
      expect(urls.filter(url => url.endsWith('.webp'))).toHaveLength(78)
      for (const [id] of TAROT_CARDS) expect(urls).toContain(`/foldkid/tarot/${id}.webp`)
      expect(urls).toContain('/foldkid/')
      expect(urls).toContain('/foldkid/index.html')
      expect(urls).toContain('/foldkid/icon-192.png')
      expect(urls).toContain('/foldkid/models/lenet-5-emnist-balanced/weights.bin')
      expect(urls.some(url => /bubbles3dRuntime.*\.js$/.test(url))).toBe(true)
      expect(urls.some(url => url.endsWith('.css'))).toBe(true)
      expect(urls.some(url => /sources\.json|SOURCES\.md|\/src\//.test(url))).toBe(false)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})

describe('offline worker caching', () => {
  it('limits background downloads to three and coalesces repeated startup messages', async () => {
    let active = 0
    let peak = 0
    const paths = Array.from({ length: 12 }, (_, index) => `/tarot/${index}.webp`)
    const app = harness(manifest('one', paths), { fetch: async request => {
      active++; peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 2))
      active--
      return new Response(key(request))
    } })
    await Promise.all([app.lifecycle('install'), app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })])
    expect(peak).toBe(3)
    expect(app.fetch).toHaveBeenCalledTimes(12)
    expect(app.fetch.mock.calls.every(([request]) => request instanceof Request && request.cache === 'reload' && request.credentials === 'same-origin')).toBe(true)
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect(app.fetch).toHaveBeenCalledTimes(12)
    expect(app.skipWaiting).toHaveBeenCalledOnce()
  })

  it('installs only the app shell first, with cached hashed chunks, then preloads artwork after activation', async () => {
    const data = manifest('one', ['/', '/index.html', '/assets/app-deadbeef.js', '/assets/app-deadbeef.css', '/tarot/Fool.webp'])
    const app = harness({ ...data, assets: data.assets.map(asset => ({ ...asset, critical: !asset.url.endsWith('.webp') })) })
    await app.lifecycle('install')
    expect(app.fetch).toHaveBeenCalledTimes(4)
    expect(app.fetch.mock.calls.some(([request]) => key(request).endsWith('.webp'))).toBe(false)
    expect(app.fetch.mock.calls.filter(([request]) => /\.(?:js|css)$/.test(key(request))).every(([request]) => request instanceof Request && request.cache === 'force-cache')).toBe(true)
    await app.lifecycle('activate')
    expect(app.claim).toHaveBeenCalledOnce()
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect(app.fetch).toHaveBeenCalledTimes(5)
  })

  it('does not activate an incomplete app update and retries only its missing critical file', async () => {
    let working = false
    const app = harness(manifest('new'), { fetch: async request => key(request).endsWith('index.html') && !working ? new Response('failed', { status: 503 }) : new Response('new shell') })
    await app.seed(`${prefix}old`, '/foldkid/', 'working old shell')
    await expect(app.lifecycle('install')).rejects.toThrow('app shell is incomplete')
    expect(app.skipWaiting).not.toHaveBeenCalled()
    expect(app.stores.has(`${prefix}old`)).toBe(true)
    expect(app.fetch).toHaveBeenCalledTimes(2)
    working = true
    await app.lifecycle('install')
    expect(app.fetch).toHaveBeenCalledTimes(3)
    expect(app.skipWaiting).toHaveBeenCalledOnce()
  })

  it('copies unchanged artwork by matching content revisions without downloading it on every app update', async () => {
    const data = manifest('new', ['/', '/index.html', '/tarot/Fool.webp', '/tarot/CupsAce.webp'])
    const app = harness({ ...data, assets: data.assets.map(asset => asset.url.endsWith('/Fool.webp') ? { ...asset, revision: 'unchanged-art' } : asset) })
    await app.seed(`${prefix}old`, '/foldkid/tarot/Fool.webp', 'same illustrated card')
    await app.seed(`${prefix}old`, '/foldkid/tarot/CupsAce.webp', 'older changed card')
    await app.seed(`${prefix}old`, '/foldkid/__offline_manifest__', JSON.stringify([
      { url: `${origin}/foldkid/tarot/Fool.webp`, revision: 'unchanged-art' },
      { url: `${origin}/foldkid/tarot/CupsAce.webp`, revision: 'old-art' },
    ]))
    await app.lifecycle('install')
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect(app.fetch).toHaveBeenCalledTimes(3)
    expect(app.fetch.mock.calls.some(([request]) => key(request).endsWith('/Fool.webp'))).toBe(false)
    expect(await (await app.request(new Request(`${origin}/foldkid/tarot/Fool.webp`)))?.text()).toBe('same illustrated card')
    const changed = app.fetch.mock.calls.find(([request]) => key(request).endsWith('/CupsAce.webp'))?.[0]
    expect(changed instanceof Request && changed.cache).toBe('reload')
  })

  it('refreshes uncached artwork even when a foreground draw arrives before the background preload', async () => {
    const app = harness()
    await app.lifecycle('install')
    expect(await (await app.request(new Request(`${origin}/foldkid/tarot/Fool.webp`)))?.text()).toBe(`network:${origin}/foldkid/tarot/Fool.webp`)
    const art = app.fetch.mock.calls.find(([request]) => key(request).endsWith('/Fool.webp'))?.[0]
    expect(art instanceof Request && art.cache).toBe('reload')
  })

  it('retains successful files and retries failed HTTP and network downloads on the next preload', async () => {
    let retry = false
    const app = harness(manifest('one', ['/good.webp', '/bad-http.webp', '/bad-network.webp']), { fetch: async request => {
      const url = key(request)
      if (!retry && url.endsWith('bad-http.webp')) return new Response('unavailable', { status: 503 })
      if (!retry && url.endsWith('bad-network.webp')) throw new Error('Offline')
      return new Response('ready')
    } })
    await app.lifecycle('install')
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect(app.stores.get(`${prefix}one`)?.size).toBe(2)
    retry = true
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect(app.fetch).toHaveBeenCalledTimes(5)
    expect(app.stores.get(`${prefix}one`)?.size).toBe(4)
    await app.lifecycle('activate')
    expect(app.claim).toHaveBeenCalledOnce()
  })

  it('serves preloaded art and the app shell offline while ignoring unrelated requests', async () => {
    let online = true
    const app = harness(manifest('one'), { fetch: async request => {
      if (!online) throw new Error('Offline')
      return new Response(`ready:${key(request)}`)
    } })
    await app.lifecycle('install')
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    online = false
    expect(await (await app.request(new Request(`${origin}/foldkid/tarot/Fool.webp`)))?.text()).toBe(`ready:${origin}/foldkid/tarot/Fool.webp`)
    expect(await (await app.request({ method: 'GET', url: `${origin}/foldkid/?from=home`, mode: 'navigate' }))?.text()).toBe(`ready:${origin}/foldkid/`)
    for (const request of [new Request('https://other.test/foldkid/tarot/Fool.webp'), new Request(`${origin}/other/app.js`), new Request(`${origin}/foldkid/api`), new Request(`${origin}/foldkid/tarot/Fool.webp`, { method: 'POST' })]) expect(app.request(request)).toBeUndefined()
    expect(app.fetch).toHaveBeenCalledTimes(3)
  })

  it('refreshes unhashed art and retains only the previous app build without touching other caches', async () => {
    const app = harness(manifest('three'), { fetch: async () => new Response('new art') })
    await app.seed(`${prefix}one`, '/foldkid/tarot/Fool.webp', 'very old art')
    await app.seed(`${prefix}two`, '/foldkid/tarot/Fool.webp', 'old art')
    await app.seed(`${prefix}two`, '/foldkid/assets/bubbles3d-old.js', 'old lazy game')
    await app.seed(`${prefix}two`, '/foldkid/', 'previous app shell')
    await app.seed(`${prefix}two`, '/foldkid/__offline_manifest__', JSON.stringify([
      { url: `${origin}/foldkid/`, revision: 'two', critical: true },
      { url: `${origin}/foldkid/assets/bubbles3d-old.js`, revision: 'two', critical: true },
    ]))
    await app.seed('another-app-cache', '/another/app.js', 'other')
    await app.seed('foldkid-offline:/other/:one', '/other/app.js', 'other scope')
    await app.lifecycle('install')
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect([...app.stores.keys()]).toEqual([`${prefix}two`, 'another-app-cache', 'foldkid-offline:/other/:one', `${prefix}three`])
    expect(await (await app.request(new Request(`${origin}/foldkid/tarot/Fool.webp`)))?.text()).toBe('new art')
    expect(await (await app.request(new Request(`${origin}/foldkid/assets/bubbles3d-old.js`)))?.text()).toBe('old lazy game')
  })

  it('retains the last usable build after an interrupted update creates a newer partial cache', async () => {
    const app = harness(manifest('three'), { fetch: async () => new Response('current build') })
    const ready = `${prefix}one`
    const partial = `${prefix}two`
    const oldChunk = '/foldkid/assets/bubbles3d-one.js'
    await app.seed(ready, '/foldkid/', 'working app shell')
    await app.seed(ready, oldChunk, 'working lazy game')
    await app.seed(ready, '/foldkid/__offline_manifest__', JSON.stringify([
      { url: `${origin}/foldkid/`, revision: 'one', critical: true },
      { url: `${origin}${oldChunk}`, revision: 'one', critical: true },
    ]))
    await app.seed(partial, '/foldkid/', 'interrupted update shell')
    await app.seed(partial, '/foldkid/__offline_manifest__', JSON.stringify([
      { url: `${origin}/foldkid/`, revision: 'two', critical: true },
      { url: `${origin}/foldkid/assets/bubbles3d-two.js`, revision: 'two', critical: true },
    ]))
    await app.seed('another-app-cache', '/another/app.js', 'other app')
    await app.seed('foldkid-offline:/other/:one', '/other/app.js', 'other scope')
    await app.lifecycle('install')
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect(app.stores.has(ready)).toBe(true)
    expect(app.stores.has(partial)).toBe(false)
    expect(app.stores.has('another-app-cache')).toBe(true)
    expect(app.stores.has('foldkid-offline:/other/:one')).toBe(true)
    expect(await (await app.request(new Request(`${origin}${oldChunk}`)))?.text()).toBe('working lazy game')
  })

  it('keeps previous cached files available when an update download fails', async () => {
    const app = harness(manifest('new'), { fetch: async request => { if (key(request).endsWith('.webp')) throw new Error('Offline'); return new Response('new shell') } })
    await app.seed(`${prefix}old`, '/foldkid/tarot/Fool.webp', 'cached old card')
    await app.lifecycle('install')
    await app.lifecycle('message', { data: { type: 'FOLDKID_PRELOAD' } })
    expect(await (await app.request(new Request(`${origin}/foldkid/tarot/Fool.webp`)))?.text()).toBe('cached old card')
    expect(app.stores.has(`${prefix}old`)).toBe(true)
  })

  it('continues using the network when browser storage is unavailable', async () => {
    const options = { storage: true }
    const app = harness(manifest('one'), options)
    await app.lifecycle('install')
    options.storage = false
    expect(app.skipWaiting).toHaveBeenCalledOnce()
    expect(await (await app.request(new Request(`${origin}/foldkid/tarot/Fool.webp`)))?.text()).toBe(`network:${origin}/foldkid/tarot/Fool.webp`)
    expect(app.fetch).toHaveBeenCalledTimes(3)
  })
})
