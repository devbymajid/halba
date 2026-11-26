// KIAI service worker (rondex deploy): cache the app shell + characters once.
// Navigation is network-first (fresh page every open when online, cache only as offline fallback).
// VRM / libs / pictures stay cache-first.
// Firebase MUST be left alone: the worker never intercepts cross-origin
// requests (Firebase Auth/Firestore, gstatic SDKs, jsDelivr) — caching or
// replacing one of those with the app page breaks sign-in/registration.
var CACHE = "halba-assets-v13";
var CORE = ["boxing.html",
  "assets/1377772477470045499.vrm", "assets/7772DF27-FD1D-45C3-A9A0-F9D3D82E2C7C-5838127647292564606.vrm", "assets/6C82879B-137E-446F-9E67-03052412B605-4655493345819974077.vrm", "assets/5BE26657-7FAD-4E42-86A8-ACD81F6FE923-2496223250082808139.vrm", "assets/B66B5482-2387-4C58-ACB4-66A0ED4FC3B6-5037406147021842787.vrm",
  "assets/js/three.min.js", "assets/js/GLTFLoader.js", "assets/js/three-vrm.js",
  "assets/js/pose.js", "assets/register-bg-boy-girl.jpg", "assets/register-bg.jpg",
  "assets/icon-rondex-192.png", "assets/icon-rondex-512.png", "assets/section-squat.webp"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    var old = keys.filter(function (k) { return k !== CACHE; });
    /* Carry the notif prefs into the new cache BEFORE wiping the old ones, or a
       master-OFF user silently falls back to PREFS_DEFAULT (all on). First hit wins. */
    var found = false, migrate = Promise.resolve();
    old.forEach(function (k) {
      migrate = migrate.then(function () {
        if (found) return;
        return caches.open(k).then(function (c) { return c.match(PREFS_KEY); }).then(function (hit) {
          if (!hit) return;
          found = true;
          return caches.open(CACHE).then(function (nc) { return nc.put(PREFS_KEY, hit.clone()); });
        }).catch(function () {});
      });
    });
    return migrate.then(function () { return Promise.all(old.map(function (k) { return caches.delete(k); })); });
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

/* ---- Push notifications (background) ----
   The app posts {type:"halba-notif-prefs", prefs:{master,messages,friendRequests,challenges}}
   whenever the notification switches change; the prefs are persisted INSIDE the main
   cache (same CACHE name), so the activate cleanup (which deletes caches != CACHE)
   never wipes them. The push sender delivers FCM data-only messages with data
   {type, fromName, preview, peer}; the text built here mirrors the app's notifTextFor. */
var PREFS_KEY = "halba-notif-prefs.json";
var PREFS_DEFAULT = { master: true, messages: true, friendRequests: true, challenges: true };
function notifPrefsLoad() {
  return caches.open(CACHE).then(function (c) { return c.match(PREFS_KEY); }).then(function (res) {
    if (!res) return PREFS_DEFAULT;
    return res.json().then(function (p) { return (p && typeof p === "object") ? Object.assign({}, PREFS_DEFAULT, p) : PREFS_DEFAULT; }).catch(function () { return PREFS_DEFAULT; });
  }).catch(function () { return PREFS_DEFAULT; });
}
self.addEventListener("message", function (e) {
  var data = e && e.data;
  if (!data || data.type !== "halba-notif-prefs" || !data.prefs) return;
  var body = JSON.stringify(data.prefs);
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.put(PREFS_KEY, new Response(body, { headers: { "Content-Type": "application/json" } }));
  }).catch(function () {}));
});
self.addEventListener("push", function (e) {
  var payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (err) {}
  var d = (payload && payload.data) || {};
  var notif = (payload && payload.notification) || {};
  e.waitUntil(notifPrefsLoad().then(function (prefs) {
    if (!prefs || prefs.master === false) return;
    var nm = d.fromName || "لاعب";
    var title = null, body = null;
    if (d.type === "message") {
      if (!prefs.messages) return;
      title = nm; body = d.preview || "وصلتك رسالة جديدة";
    } else if (d.type === "friend" || d.type === "friendRequest") {
      if (!prefs.friendRequests) return;
      title = "طلب صداقة جديد من " + nm; body = "افتح التطبيق لقبول الطلب أو رفضه";
    } else if (d.type === "challenge") {
      if (!prefs.challenges) return;
      title = "تحدٍّ جديد من " + nm; body = "افتح التطبيق لبدء المباراة";
    } else {
      return;
    }
    if (notif.title) title = notif.title;
    if (notif.body) body = notif.body;
    return self.registration.showNotification(title, {
      body: body,
      icon: "assets/icon-rondex-192.png",
      tag: (d.type || "") + ":" + (d.peer || d.chatId || d.roomId || ""),
      data: { type: d.type || "", peer: d.peer || "", chatId: d.chatId || "", roomId: d.roomId || "", target: d.target || d.screen || d.openTarget || "" }
    });
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var client = list[i];
      if (client.url.indexOf("boxing.html") !== -1 || client.url.indexOf(self.registration.scope) === 0) {
        if ("navigate" in client) { client.navigate("boxing.html").catch(function () {}); }
        return client.focus();
      }
    }
    return clients.openWindow("boxing.html");
  }));
});
