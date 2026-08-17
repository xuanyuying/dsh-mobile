/**
 * DSH Mobile - Service Worker
 * 提供离线缓存与 PWA 安装支持
 */
'use strict';

const CACHE_NAME = 'dsh-mobile-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/balance.js',
  './js/storage.js',
  './js/md.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 请求：缓存优先（网络请求如 API 不缓存）
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 请求（api.deepseek.com）永不缓存，走网络
  if (url.hostname === 'api.deepseek.com') return;

  // 页面导航：网络优先，失败回退缓存（离线可用）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源：缓存优先，网络回填
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
