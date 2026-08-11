/* ============================================================
   sw.js — Service Worker（用户图片长驻缓存）
   ============================================================
   只拦截 Supabase Storage 的 user-assets 公开图片：
     · cache-first：命中缓存直接返回（切页/刷新零网络、零闪烁）
     · 忽略 query 参数（前端用 ?v= 做版本刷新，不影响命中）
     · 未命中才回源并写入缓存；旧图由 settings.js 定期清理
   ============================================================ */

const IMG_CACHE = 'kc-user-assets-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

function isUserAsset(url) {
  return url.hostname.endsWith('supabase.co')
    && url.pathname.includes('/object/public/user-assets/');
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (!isUserAsset(url) || e.request.method !== 'GET') return;

  // 归一化：去掉 query，保证 ?v= 版本参数不影响缓存命中
  const key = new Request(url.origin + url.pathname);

  e.respondWith(
    caches.open(IMG_CACHE).then(async cache => {
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) await cache.put(key, res.clone());
      return res;
    })
  );
});
