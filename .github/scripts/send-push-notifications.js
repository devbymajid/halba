// send-push-notifications.js
// Runs every 5 minutes from GitHub Actions (free — the repo is public).
// Watches Firestore for new chat messages, friend requests and challenges,
// and sends an FCM push to the recipient — but ONLY when the recipient
// enabled that type in the app settings (notifPrefs) and has an FCM token.
// Dedup: every sent push is recorded in the `push_log` collection, so a
// rerun never sends the same notification twice.
// Auth: the Firebase Admin SDK — with the FIREBASE_SERVICE_ACCOUNT secret
// (a service-account JSON) when set, otherwise Application Default
// Credentials (GitHub Actions OIDC / Workload Identity). The Admin SDK
// this script only READS game data and WRITES push_log — it never writes
// to players/chats/challenge_rooms.
// NOTE on field names: the app's notifPrefs keys are not pinned here —
// the script checks several candidate keys per type and defaults to ON
// when none is present (the player enabled notifications overall).
// Scaling note: the friend-request scan reads every players doc each run.
// That is fine while the player count is small (it is today); if the game
// grows, scope it to players with a token/requests first.
'use strict';

const admin = require('firebase-admin');

const LOOKBACK_MS = 10 * 60 * 1000; // events from the last 10 minutes
const MAX_BODY = 100;

function toMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') return v.toMillis(); // Firestore Timestamp
    if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
    if (v instanceof Date) return v.getTime();
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function firstBool(obj, keys) {
  for (const k of keys) {
    if (typeof obj[k] === 'boolean') return obj[k];
  }
  return null;
}

// A master key, when present, gates all types; otherwise each type is
// checked on its own candidate keys, defaulting to ON.
function prefOn(prefs, candidates) {
  if (!prefs || typeof prefs !== 'object') return true;
  const master = firstBool(prefs, ['enabled', 'all', 'master', 'notifications']);
  if (master === false) return false;
  return firstBool(prefs, candidates) !== false;
}

function trunc(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  } else {
    admin.initializeApp({ projectId: 'studio-5633829332-99f59' }); // Application Default Credentials (GitHub Actions OIDC / Workload Identity) — projectId is explicit because the WIF credentials file has none
  }
  const db = admin.firestore();
  const messaging = admin.messaging();
  const now = Date.now();
  const cutoff = now - LOOKBACK_MS;
  let sent = 0, skipped = 0, failed = 0;

  const playerCache = new Map();
  async function playerDoc(username) {
    if (!username) return null;
    const key = String(username).trim().toLowerCase();
    if (playerCache.has(key)) return playerCache.get(key);
    const snap = await db.collection('players').doc(key).get();
    const data = snap.exists ? snap.data() : null;
    playerCache.set(key, data);
    return data;
  }

  async function alreadySent(key) {
    const snap = await db.collection('push_log').doc(key).get();
    return snap.exists;
  }
  async function markSent(key, info) {
    await db.collection('push_log').doc(key).set({ ...info, at: admin.firestore.FieldValue.serverTimestamp() });
  }
  async function sendPush({ key, token, title, body, data }) {
    if (await alreadySent(key)) { skipped++; return; }
    if (!token) { skipped++; return; }
    const cleanData = {};
    for (const [k, v] of Object.entries(data || {})) cleanData[k] = String(v == null ? '' : v);
    try {
      await messaging.send({ token, notification: { title, body }, data: cleanData });
      await markSent(key, { title });
      sent++;
      console.log('sent', key);
    } catch (e) {
      failed++;
      console.error('send failed', key, e.code || e.message);
      // Do NOT mark as sent: a later run retries. Except a permanently
      // invalid token, which would retry forever — record it as dead.
      if (e.code === 'messaging/registration-token-not-registered' ||
          e.code === 'messaging/invalid-registration-token') {
        await markSent(key, { deadToken: true, error: String(e.code) });
      }
    }
  }

  // ---- 1. Chat messages (collection group, single range filter only —
  // no composite index needed; read==false is filtered in code). ----
  try {
    const msgs = await db.collectionGroup('messages')
      .where('at', '>=', new Date(cutoff)).get();
    for (const doc of msgs.docs) {
      const m = doc.data();
      if (m.read !== false) continue;
      const atMs = toMillis(m.at);
      if (atMs == null || atMs < cutoff) continue;
      const chatDoc = doc.ref.parent.parent;
      if (!chatDoc) continue;
      const parts = String(chatDoc.id).split('__');
      if (parts.length !== 2) continue;
      const sender = String(m.sender || '').trim().toLowerCase();
      const recipient = parts[0] === sender ? parts[1] : parts[0];
      if (!recipient || recipient === sender) continue;
      const player = await playerDoc(recipient);
      if (!player || !player.fcmToken) { skipped++; continue; }
      if (!prefOn(player.notifPrefs, ['messages', 'message', 'msg', 'chat'])) { skipped++; continue; }
      const senderDoc = await playerDoc(sender);
      const senderName = (senderDoc && senderDoc.displayName) || sender;
      await sendPush({
        key: `${recipient}__message__${chatDoc.id}__${doc.id}`,
        token: player.fcmToken,
        title: String(senderName),
        body: trunc(m.text || '', MAX_BODY),
        data: { type: 'message', chatId: chatDoc.id, peer: sender, target: 'chat', screen: 'chat', openTarget: 'chat' },
      });
    }
  } catch (e) { console.error('messages scan failed', e.message); failed++; }

  // ---- 2. Friend requests (stateful diff of friendReqIn per player). ----
  try {
    const players = await db.collection('players').get();
    for (const pdoc of players.docs) {
      const p = pdoc.data();
      const username = pdoc.id;
      const current = Array.isArray(p.friendReqIn) ? p.friendReqIn.map(String) : [];
      const stateRef = db.collection('push_log').doc(`_friendReqState__${username}`);
      const stateSnap = await stateRef.get();
      const previous = stateSnap.exists && Array.isArray(stateSnap.data().reqIn)
        ? stateSnap.data().reqIn.map(String) : [];
      const fresh = current.filter(u => !previous.includes(u));
      for (const requester of fresh) {
        if (!p.fcmToken) { skipped++; continue; }
        if (!prefOn(p.notifPrefs, ['friendRequests', 'friendReqs', 'friendReq', 'requests'])) { skipped++; continue; }
        const reqDoc = await playerDoc(requester);
        const reqName = (reqDoc && reqDoc.displayName) || requester;
        await sendPush({
          key: `${username}__friendRequest__${requester}`,
          token: p.fcmToken,
          title: 'طلب صداقة جديد',
          body: `${reqName} أرسل إليك طلب صداقة`,
          data: { type: 'friendRequest', peer: requester, target: 'friendRequests', screen: 'friendRequests', openTarget: 'friendRequests' },
        });
      }
      // Forget dedup entries for requests that were withdrawn, so a
      // re-request after a cancel notifies again.
      for (const gone of previous.filter(u => !current.includes(u))) {
        await db.collection('push_log').doc(`${username}__friendRequest__${gone}`).delete().catch(() => {});
      }
      await stateRef.set({ reqIn: current, at: admin.firestore.FieldValue.serverTimestamp() });
    }
  } catch (e) { console.error('friend requests scan failed', e.message); failed++; }

  // ---- 3. Challenges (waiting rooms created recently). ----
  try {
    const rooms = await db.collection('challenge_rooms').where('status', '==', 'waiting').get();
    for (const rdoc of rooms.docs) {
      const r = rdoc.data();
      const createdMs = toMillis(r.createdAt);
      if (createdMs == null || createdMs < cutoff) continue;
      const guest = String(r.guest || '').trim().toLowerCase();
      const host = String(r.host || '').trim().toLowerCase();
      if (!guest || !host || guest === host) continue;
      const player = await playerDoc(guest);
      if (!player || !player.fcmToken) { skipped++; continue; }
      if (!prefOn(player.notifPrefs, ['challenges', 'challenge'])) { skipped++; continue; }
      const hostDoc = await playerDoc(host);
      const hostName = (hostDoc && hostDoc.displayName) || r.hostDisplay || host;
      await sendPush({
        key: `${guest}__challenge__${rdoc.id}`,
        token: player.fcmToken,
        title: 'تحدٍّ جديد',
        body: `${hostName} تحدّاك في مباراة`,
        data: { type: 'challenge', roomId: rdoc.id, peer: host, target: 'challenge', screen: 'challenge', openTarget: 'challenge' },
      });
    }
  } catch (e) { console.error('challenges scan failed', e.message); failed++; }

  console.log(`done: sent=${sent} skipped=${skipped} failed=${failed}`);
}

main().catch(e => { console.error('fatal', e); process.exit(1); });
