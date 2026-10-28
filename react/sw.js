/* 離線支援：把網頁本身、圖示與字型存在手機，沒有網路時也能打開。資料庫的內容另外由 App 存快照。 */
const CACHE = 'trip-shell-v1'
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com']

// 伺服器常帶 Vary: Origin，不同請求方式會對不上已存的檔案，所以比對時忽略它
const MATCH_OPTIONS = { ignoreSearch: true, ignoreVary: true }

const cacheable = url => url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname)

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

const store = async (request, response) => {
  if (response && (response.ok || response.type === 'opaque')) (await caches.open(CACHE)).put(request, response.clone())
  return response
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (!cacheable(url)) return

  if (request.mode === 'navigate') {
    // 網頁本身：有網路就用最新的，沒網路才用存起來的
    event.respondWith(fetch(request).then(response => store(request, response)).catch(async () => (await caches.match(request, MATCH_OPTIONS)) ?? (await caches.match(new URL('./', self.location.href).href, MATCH_OPTIONS)) ?? Response.error()))
    return
  }
  // 檔名帶雜湊的程式與樣式、字型、圖示：先用存起來的，背景再更新
  event.respondWith(
    caches.match(request, MATCH_OPTIONS).then(cached => {
      const refresh = fetch(request).then(response => store(request, response)).catch(() => cached)
      return cached ?? refresh
    }),
  )
})

// 第一次載入時頁面已經抓完的資源，請它補存一份
self.addEventListener('message', event => {
  if (event.data?.type !== 'cache-urls') return
  event.waitUntil(Promise.all(event.data.urls.map(async href => {
    try {
      const url = new URL(href)
      if (!cacheable(url)) return
      const request = new Request(href)
      if (!(await caches.match(request, MATCH_OPTIONS))) await store(request, await fetch(request))
    } catch { /* 單一檔案失敗不影響其他 */ }
  })))
})
