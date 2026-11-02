/* FOLDKID_OFFLINE is injected by the production build; no development URLs are cached. */
const offlinePrefix = `foldkid-offline:${FOLDKID_OFFLINE.base}:`;
const offlineCache = `${offlinePrefix}${FOLDKID_OFFLINE.version}`;
const offlineRoot = new URL(FOLDKID_OFFLINE.base, self.location.origin).href;
const offlineManifestUrl = `${offlineRoot}__offline_manifest__`;
const offlineAssets = FOLDKID_OFFLINE.assets.map(asset => ({ ...asset, url: new URL(asset.url, self.location.origin).href }));
const offlineUrls = new Set(offlineAssets.map(asset => asset.url));
const offlineByUrl = new Map(offlineAssets.map(asset => [asset.url, asset]));
const offlineCacheMode = asset => asset?.critical && /\.(?:js|css)$/.test(asset.url) ? 'force-cache' : 'reload';
let offlineCritical;
let offlinePreload;

const ownedCaches = async () => typeof caches === 'undefined' ? [] : (await caches.keys()).filter(name => name.startsWith(offlinePrefix));
const cachedIn = async (name, request) => {
  try { return await (await caches.open(name)).match(request); } catch { return undefined; }
};
const previousResponse = async request => {
  try {
    const names = (await ownedCaches()).filter(name => name !== offlineCache).reverse();
    for (const name of names) {
      const response = await cachedIn(name, request);
      if (response) return response;
    }
  } catch { /* Browser storage can be unavailable even when service workers are supported. */ }
};
const usableOfflineCache = async name => {
  try {
    const metadata = await (await cachedIn(name, offlineManifestUrl))?.json();
    if (!Array.isArray(metadata)) return false;
    const critical = metadata.filter(asset => asset?.critical === true && typeof asset.url === 'string' && asset.url.startsWith(offlineRoot));
    if (!critical.some(asset => asset.url === offlineRoot)) return false;
    for (const asset of critical) {
      if (!(await cachedIn(name, asset.url))?.ok) return false;
    }
    return true;
  } catch { return false; }
};
const removeOldCaches = async () => {
  const names = (await ownedCaches()).filter(name => name !== offlineCache);
  // A failed update also creates a cache. Keep the last usable build, not that partial install.
  let previous;
  for (const name of [...names].reverse()) {
    if (await usableOfflineCache(name)) { previous = name; break; }
  }
  await Promise.all(names.filter(name => name !== previous).map(name => caches.delete(name)));
};
const previousRevisions = async () => {
  const records = [];
  for (const name of (await ownedCaches()).filter(name => name !== offlineCache).reverse()) {
    try {
      const metadata = await (await cachedIn(name, offlineManifestUrl))?.json();
      if (!Array.isArray(metadata)) continue;
      records.push([name, new Map(metadata.filter(asset => asset && typeof asset.url === 'string' && typeof asset.revision === 'string').map(asset => [asset.url, asset.revision]))]);
    } catch { /* Older or partial caches can have no revision metadata. */ }
  }
  return records;
};
const downloadOffline = async assets => {
  if (typeof caches === 'undefined') return false;
  let cache;
  let previous;
  try {
    cache = await caches.open(offlineCache);
    previous = await previousRevisions();
    await cache.put(offlineManifestUrl, new Response(JSON.stringify(offlineAssets), { headers: { 'Content-Type': 'application/json' } }));
  } catch { return false; }
  let next = 0;
  let complete = true;
  const download = async () => {
    while (next < assets.length) {
      const asset = assets[next++];
      try {
        if (await cache.match(asset.url)) continue;
        let response;
        for (const [name, revisions] of previous) {
          if (revisions.get(asset.url) === asset.revision) response = await cachedIn(name, asset.url);
          if (response?.ok) break;
        }
        if (!response?.ok) {
          // Hashed chunks can reuse the browser's just-loaded copy; public art must refresh when its bytes change.
          response = await fetch(new Request(asset.url, { cache: offlineCacheMode(asset), credentials: 'same-origin' }));
        }
        if (!response.ok || response.type === 'opaque') { complete = false; continue; }
        await cache.put(asset.url, response);
      } catch { complete = false; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, assets.length) }, download));
  return complete;
};
const preloadCritical = () => {
  if (offlineCritical) return offlineCritical;
  offlineCritical = downloadOffline(offlineAssets.filter(asset => asset.critical)).catch(() => false).finally(() => { offlineCritical = undefined; });
  return offlineCritical;
};
const preloadOffline = () => {
  if (offlinePreload) return offlinePreload;
  offlinePreload = (async () => {
    if (!await preloadCritical()) return;
    if (await downloadOffline(offlineAssets.filter(asset => !asset.critical))) {
      try { await removeOldCaches(); } catch { /* Cleanup must not discard a successful preload. */ }
    }
  })().catch(() => {}).finally(() => { offlinePreload = undefined; });
  return offlinePreload;
};

const offlineAssetResponse = async request => {
  const cached = await cachedIn(offlineCache, request);
  if (cached) return cached;
  try {
    const url = typeof request === 'string' ? request : request.url;
    const response = await fetch(new Request(request, { cache: offlineCacheMode(offlineByUrl.get(url)) }));
    if (response.ok && response.type !== 'opaque') {
      try { await (await caches.open(offlineCache)).put(request, response.clone()); } catch { /* Network response is still usable. */ }
      return response;
    }
    return await previousResponse(request) || response;
  } catch (error) {
    const previous = await previousResponse(request);
    if (previous) return previous;
    throw error;
  }
};

self.addEventListener('install', event => {
  event.waitUntil(preloadCritical().then(complete => {
    if (!complete) throw new Error('The offline app shell is incomplete');
    return self.skipWaiting();
  }));
});
self.addEventListener('activate', event => {
  // The app's ready/online message starts the artwork preload after claiming, so artwork cannot delay activation.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'FOLDKID_PRELOAD') event.waitUntil(preloadOffline());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(FOLDKID_OFFLINE.base)) return;
  if (request.mode === 'navigate' && (url.pathname === FOLDKID_OFFLINE.base || url.pathname === `${FOLDKID_OFFLINE.base}index.html`)) {
    event.respondWith(offlineAssetResponse(offlineRoot));
  } else if (offlineUrls.has(url.href)) {
    event.respondWith(offlineAssetResponse(request));
  } else if (url.pathname.startsWith(`${FOLDKID_OFFLINE.base}assets/`) && /\.(?:css|js)$/.test(url.pathname)) {
    // A page from the previous build can still request its original hashed lazy chunk.
    event.respondWith(previousResponse(request).then(response => response || fetch(request)));
  }
});
