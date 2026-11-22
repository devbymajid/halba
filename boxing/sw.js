// Halba service worker: cache the app shell + characters once, serve cache-first.
var CACHE = "halba-assets-v1";
var CORE = ["boxing.html",
  "assets/gojo.vrm", "assets/toji.vrm", "assets/hatsune.vrm", "assets/sara.vrm",
  "assets/js/three.min.js", "assets/js/GLTFLoader.js", "assets/js/three-vrm.js",
  "assets/js/pose.js", "assets/register-bg-boy-girl.jpg"];
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
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    if (hit) return hit;
    return fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy).catch(function () {}); });
      return res;
    }).catch(function () { return caches.match("boxing.html"); });
  }));
});
