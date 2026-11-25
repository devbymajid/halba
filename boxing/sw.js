// KIAI service worker (rondex deploy): cache the app shell + characters once.
// Navigation is network-first (fresh page every open when online, cache only as offline fallback).
// VRM / libs / pictures stay cache-first.
// Firebase MUST be left alone: the worker never intercepts cross-origin
// requests (Firebase Auth/Firestore, gstatic SDKs, jsDelivr) — caching or
// replacing one of those with the app page breaks sign-in/registration.
var CACHE = "halba-assets-v10";
var CORE = ["boxing.html",
  "assets/1377772477470045499.vrm", "assets/7772DF27-FD1D-45C3-A9A0-F9D3D82E2C7C-5838127647292564606.vrm", "assets/6C82879B-137E-446F-9E67-03052412B605-4655493345819974077.vrm", "assets/5BE26657-7FAD-4E42-86A8-ACD81F6FE923-2496223250082808139.vrm", "assets/B66B5482-2387-4C58-ACB4-66A0ED4FC3B6-5037406147021842787.vrm",
  "assets/js/three.min.js", "assets/js/GLTFLoader.js", "assets/js/three-vrm.js",
  "assets/js/pose.js", "assets/register-bg-boy-girl.jpg", "assets/register-bg.jpg",
  "assets/icon-rondex-192.png", "assets/icon-rondex-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return; /* cross-origin (Firebase/gstatic/CDN): never touch, never cache */
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}); });
      return res;
    }).catch(function () { return caches.match("boxing.html"); }));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}); });
      return res;
    }).catch(function () { return caches.match("boxing.html"); });
  }));
});
