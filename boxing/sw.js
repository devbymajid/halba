// Halba service worker: cache the app shell + characters once, serve cache-first.
var CACHE = "halba-assets-v1";
var CORE = ["boxing.html",
  "assets/1377772477470045499.vrm", "assets/7772DF27-FD1D-45C3-A9A0-F9D3D82E2C7C-5838127647292564606.vrm", "assets/5BE26657-7FAD-4E42-86A8-ACD81F6FE923-2496223250082808139.vrm", "assets/B66B5482-2387-4C58-ACB4-66A0ED4FC3B6-5037406147021842787.vrm",
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
