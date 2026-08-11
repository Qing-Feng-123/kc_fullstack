/* ============================================================
   sw.js — Service Worker（用户图片长驻缓存）
   ============================================================
   只拦截 Supabase Storage 的 user-assets 公开图片：
     · cache-first：命中缓存直接返回（切页/刷新零网络、零闪烁）
     · 以完整 URL（含 ?v= 版本号）为缓存键：同版本长期命中，
       重新上传后版本号变化 → 自动回源取新图，并清理同路径旧版本
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

  e.respondWith(
    caches.open(IMG_CACHE).then(async cache => {
      // 完整 URL（含 ?v=）作为缓存键：版本不变时长期命中
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) {
        // 新图入库前，清掉同一路径的旧版本条目（含早期无 query 的归一化键）
        const keys = await cache.keys();
        await Promise.all(keys.map(k => {
          const ku = new URL(k.url);
          if (ku.origin === url.origin && ku.pathname === url.pathname && k.url !== e.request.url) {
            return cache.delete(k);
          }
        }));
        await cache.put(e.request, res.clone());
      }
      return res;
    })
  );
});
