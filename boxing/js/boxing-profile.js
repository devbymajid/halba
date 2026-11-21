/**
 * Halba — Boxing Profile / الملف و ELO
 * ملف مستقل لوضع الملاكمة. يخزّن محلياً فقط (localStorage) — لا رفع أبداً.
 * نقطة الربط المتوقعة مع القلب لاحقاً:
 *   القلب سيملك ملف اللاعب الرئيسي (js/app.js / js/store.js في halba).
 *   عند الدمج: استبدل loadProfile/saveProfile هنا بقراءة/كتابة ملف القلب،
 *   وأبقِ نفس الحقول (name, code, age, anime, elo, xp, level, wins, losses, draws)
 *   ونفس دالة updateElo حتى لا يتغير حساب الملاكمة.
 * المستوى: صيغة القلب نفسها — xpForLevel(L) = 100*L*(L-1)/2 (مستوى 2 بـ
 * 100 XP، مستوى 3 بـ 300 XP مجموع). إن وُجد window.FitStore.Levels
 * استُعملت دواله، وإلا استُعملت الصيغة نفسها محلياً، فلا يكون للاعب
 * مستويان مختلفان في الملاكمة والقلب.
 * الكود: لا يُخزَّن نصاً عادياً أبداً — يُحفظ هاش SHA-256 + ملح فقط
 * (مثل القلب)، والكود النصي يبقى في الذاكرة لجلسة واحدة فقط.
 */
(function (global) {
  'use strict';
  var KEY = 'halba_boxing_profile_v1';
  var KEY_SALT = 'halba_boxing_profile_salt_v1';
  var K_FACTOR = 32;

  // ---- SHA-256 متزامن (للهاش المحلي فقط؛ القلب يستعمل SHA-256 + ملح) ----
  function sha256HexSync(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var b = 7; b >= 0; b--) bytes.push((bitLen / Math.pow(2, b * 8)) & 0xff);
    for (var off = 0; off < bytes.length; off += 64) {
      var w = new Array(64);
      for (var t = 0; t < 16; t++) w[t] = ((bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) | (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3]) | 0;
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], cc = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & bb) ^ (a & cc) ^ (bb & cc);
        var temp2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + temp1) | 0; d = cc; cc = bb; bb = a; a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = '';
    for (var i2 = 0; i2 < 8; i2++) out += ('00000000' + (H[i2] >>> 0).toString(16)).slice(-8);
    return out;
  }
  function getSalt() {
    try {
      var s = localStorage.getItem(KEY_SALT);
      if (s) return s;
      var rnd = '';
      if (global.crypto && global.crypto.getRandomValues) {
        var arr = new Uint8Array(16); global.crypto.getRandomValues(arr);
        for (var i = 0; i < arr.length; i++) rnd += ('0' + arr[i].toString(16)).slice(-2);
      } else { for (var j = 0; j < 32; j++) rnd += Math.floor(Math.random() * 16).toString(16); }
      localStorage.setItem(KEY_SALT, rnd);
      return rnd;
    } catch (e) { return 'halba-local-salt'; }
  }
  function hashCode(code) { return sha256HexSync(getSalt() + ':' + String(code || '')); }

  function defaultProfile() {
    return { name: '', code: '', codeHash: '', age: 18, anime: '', elo: 1000, xp: 0, level: 1, wins: 0, losses: 0, draws: 0, matches: 0, createdAt: new Date().toISOString() };
  }
  function loadProfile() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultProfile();
      var stored = Object.assign(defaultProfile(), JSON.parse(raw));
      stored.code = ''; // الكود النصي لا يُحفظ أبداً — يُعاد إدخاله كل جلسة
      return stored;
    } catch (e) { return defaultProfile(); }
  }
  function saveProfile(p) {
    // يُحفظ الهاش فقط، لا الكود النصي. الكائن في الذاكرة يحتفظ بالكود للجلسة.
    try {
      var toStore = Object.assign({}, p);
      if (toStore.code) toStore.codeHash = hashCode(toStore.code);
      toStore.code = '';
      localStorage.setItem(KEY, JSON.stringify(toStore));
    } catch (e) { /* التخزين غير متاح — نكمل في الذاكرة فقط */ }
    return p;
  }
  function hasProfile(p) {
    return !!(p && String(p.name || '').trim() && (String(p.code || '').trim() || String(p.codeHash || '').trim()));
  }
  function verifyCode(p, code) {
    if (!p || !p.codeHash) return false;
    return hashCode(code) === p.codeHash;
  }
  // ---- المستوى: صيغة القلب xpForLevel(L) = 100*L*(L-1)/2 ----
  function xpForLevel(level) {
    var L = Math.max(1, Math.floor(level || 1));
    return 100 * L * (L - 1) / 2;
  }
  function levelForXpLocal(xp) {
    xp = Math.max(0, xp || 0);
    // أكبر L بحيث 100*L*(L-1)/2 <= xp: L = floor((1 + sqrt(1 + 0.08*xp)) / 2)
    return Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2));
  }
  function levelForXp(xp) {
    var FitStore = global.FitStore || null;
    if (FitStore && FitStore.Levels) {
      if (typeof FitStore.Levels.levelForXp === 'function') return FitStore.Levels.levelForXp(xp);
      if (typeof FitStore.Levels.xpForLevel === 'function') {
        var L = 1;
        while (FitStore.Levels.xpForLevel(L + 1) <= (xp || 0)) L++;
        return L;
      }
    }
    return levelForXpLocal(xp);
  }
  function xpToNextLevel(xp) {
    var L = levelForXp(xp);
    return xpForLevel(L + 1) - (xp || 0);
  }
  function addXp(p, amount) {
    p.xp = (p.xp || 0) + amount;
    p.level = levelForXp(p.xp);
    return saveProfile(p);
  }
  /** ELO كلاسيكي: توقّع + تحديث. result: 1 فوز، 0.5 تعادل، 0 خسارة. */
  function expectedScore(eloA, eloB) { return 1 / (1 + Math.pow(10, (eloB - eloA) / 400)); }
  function updateElo(p, opponentElo, result) {
    var exp = expectedScore(p.elo, opponentElo);
    var delta = Math.round(K_FACTOR * (result - exp));
    p.elo = Math.max(100, p.elo + delta);
    return { delta: delta, newElo: p.elo, expected: Math.round(exp * 100) / 100 };
  }
  function recordMatch(p, result, opponentElo) {
    // result: 'win' | 'loss' | 'draw'
    p.matches = (p.matches || 0) + 1;
    if (result === 'win') p.wins++;
    else if (result === 'loss') p.losses++;
    else p.draws++;
    var score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    var elo = updateElo(p, opponentElo, score);
    var xp = result === 'win' ? 50 : result === 'draw' ? 25 : 10;
    addXp(p, xp);
    return { elo: elo, xp: xp, profile: p };
  }

  var api = { KEY: KEY, KEY_SALT: KEY_SALT, K_FACTOR: K_FACTOR, defaultProfile: defaultProfile, loadProfile: loadProfile, saveProfile: saveProfile, hasProfile: hasProfile, verifyCode: verifyCode, sha256HexSync: sha256HexSync, hashCode: hashCode, getSalt: getSalt, levelForXp: levelForXp, levelForXpLocal: levelForXpLocal, xpForLevel: xpForLevel, xpToNextLevel: xpToNextLevel, addXp: addXp, expectedScore: expectedScore, updateElo: updateElo, recordMatch: recordMatch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
