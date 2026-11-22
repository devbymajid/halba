/**
 * Halba — Boxing Cloud Login / الدخول عبر Firebase (Firestore)
 * ملف مستقل لوضع الملاكمة. يتيح للاعب مسجَّل الدخول من أي جهاز باسمه وكوده،
 * واسترجاع ملفه (ELO وXP والمباريات).
 *
 * التصميم (محلي أولاً):
 * - الملف المحلي (localStorage) هو مصدر الحقيقة عند اللعب؛ السحابة نسخة
 *   تُزامَن عند التسجيل والدخول ونهاية المباراة. إن فشل الاتصال أو تحميل
 *   مكتبة Firebase، يستمر اللعب محلياً بلا أي توقف — الدخول وحده يحتاج النت.
 * - مجموعة Firestore: boxing_profiles، والمستند = الاسم بعد التطبيع
 *   (trim + lowercase + أ/إ/آ→ا + ة→ه). الحقول: name, displayName, codeHash,
 *   salt, age, anime, elo, xp, level, wins, losses, draws, matches,
 *   createdAt, updatedAt.
 * - الكود لا يُرفَع نصاً أبداً: يُحفظ هاش SHA-256 مكرر 1000 مرة + ملح خاص
 *   بكل لاعب (الملح يُحفظ في المستند نفسه؛ الهاش يُحسب في المتصفح).
 *   التسجيل يفرض كوداً من 6 أحرف على الأقل؛ الدخول لا يفرضه (حسابات قديمة).
 * - الربط السحابي: بعد registerCloud/loginCloud ناجح فقط، يُحفظ رابط
 *   (اسم الحساب) في localStorage؛ syncCloud لا يكتب إلا إن طابق الرابط
 *   اسم الملف، وإن توفّر كود الجلسة يتحقق منه قبل الكتابة. هكذا لا تكتب
 *   مزامنة مباراة فوق حساب لاعب آخر بالغلط.
 * - الدخول لا يمسح تقدّماً محلياً أجدد: mergeProfiles يحافظ على الملف
 *   المحلي إن كان لنفس الاسم وعنده مباريات/XP أكثر، ويدفعه للسحابة.
 * - حدود الأمان الصريحة: الكود هنا رمز لعبة (PIN) وليس كلمة سر بنكية —
 *   قراءة الهاش متاحة لمن يعرف الاسم (لازمة للتحقق من جهة العميل)، وقواعد
 *   Firestore (firestore.rules) تمنع الحذف وتقيّد الحقول وتجمّد codeHash
 *   وsalt وcreatedAt عند التحديث، لكن كتابة متعمّدة عبر API مباشرة ممكنة
 *   حتى يجي Firebase Auth. نظام الحساب الكامل يأتي مع الدمج مع القلب.
 * - تحميل مكتبة Firebase (compat) كسول: لا تُحمَّل إلا عند أول عملية سحابية،
 *   بمهلة 12 ثانية ورسالة واضحة عند الفشل.
 */
(function (global) {
  'use strict';
  var Profile = global.HalbaBoxingProfile || null;
  var COLLECTION = 'boxing_profiles';
  var LINK_KEY = 'halba_boxing_cloud_link_v1';
  var SDK_VERSION = '10.12.2';
  var SDK_TIMEOUT_MS = 12000;
  var NAME_MIN = 2, NAME_MAX = 30;
  var CODE_MIN = 6;

  var _db = null;        // مثيل Firestore (حقيقي بعد التحميل، أو مُحقون في الاختبارات)
  var _readyPromise = null;
  var _sessionCode = ''; // كود الجلسة فقط (ذاكرة) — للتحقق قبل المزامنة

  function cloudError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }
  function getConfig() {
    var c = global.HALBA_FIREBASE_CONFIG || null;
    if (!c || !c.apiKey || !c.projectId) return null;
    return c;
  }
  function isConfigured() { return !!getConfig(); }
  function storage() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  // ---- الاسم: تطبيع + تحقق ----
  // أ/إ/آ/ٱ → ا، ة → ه: «أحمد» و«احمد» حساب واحد، لا حسابان.
  function normalizeName(name) {
    var n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    n = n.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه');
    return n;
  }
  function validName(name) {
    var n = normalizeName(name);
    if (n.length < NAME_MIN || n.length > NAME_MAX) return false;
    if (n.indexOf('/') !== -1) return false;
    return true;
  }
  function newSalt() {
    var hex = '';
    try {
      if (global.crypto && global.crypto.getRandomValues) {
        var arr = new Uint8Array(16); global.crypto.getRandomValues(arr);
        for (var i = 0; i < arr.length; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
        return hex;
      }
    } catch (e) { /* fallback أدناه */ }
    for (var j = 0; j < 32; j++) hex += Math.floor(Math.random() * 16).toString(16);
    return hex;
  }

  // ---- الربط السحابي (يُسجَّل فقط بعد تسجيل/دخول ناجح) ----
  function getCloudLink() {
    var st = storage(); if (!st) return '';
    try { return String(st.getItem(LINK_KEY) || ''); } catch (e) { return ''; }
  }
  function setCloudLink(name) {
    var st = storage(); if (!st) return;
    try { st.setItem(LINK_KEY, normalizeName(name)); } catch (e) { /* تجاهل */ }
  }
  function clearCloudLink() {
    var st = storage(); if (!st) return;
    try { st.removeItem(LINK_KEY); } catch (e) { /* تجاهل */ }
  }
  function setSessionCode(code) { _sessionCode = String(code || ''); }
  function getSessionCode() { return _sessionCode; }

  // ---- تحويل بين الملف المحلي ومستند Firestore ----
  function toCloudDoc(profile, code, salt) {
    var s = salt || newSalt();
    var hashFn = Profile && Profile.hashCodeWithSalt
      ? Profile.hashCodeWithSalt
      : function (c, sl) { return sl + ':' + c; }; // لا يحدث في الصفحة الحقيقية
    return {
      name: normalizeName(profile.name),
      displayName: String(profile.name || '').trim(),
      codeHash: hashFn(code, s),
      salt: s,
      age: profile.age || 18,
      anime: profile.anime || '',
      elo: profile.elo || 1000,
      xp: profile.xp || 0,
      level: profile.level || 1,
      wins: profile.wins || 0,
      losses: profile.losses || 0,
      draws: profile.draws || 0,
      matches: profile.matches || 0,
      createdAt: profile.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  function fromCloudDoc(doc) {
    // لا نرجع codeHash أبداً: إن حُفظ هذا الكائن محلياً بلا كود،
    // يبقى verifyCode مكسوراً نهائياً. الكود يُعاد إدخاله في الصفحة
    // ثم saveProfile يحسب الهاش المحلي من جديد.
    return {
      name: doc.displayName || doc.name || '',
      code: '', // الكود النصي لا يأتي من السحابة أبداً — يُدخله اللاعب
      age: doc.age || 18,
      anime: doc.anime || '',
      elo: doc.elo || 1000,
      xp: doc.xp || 0,
      level: doc.level || 1,
      wins: doc.wins || 0,
      losses: doc.losses || 0,
      draws: doc.draws || 0,
      matches: doc.matches || 0,
      createdAt: doc.createdAt || new Date().toISOString()
    };
  }
  function verifyCloudCode(doc, code) {
    if (!doc || !doc.codeHash || !doc.salt) return false;
    var hashFn = Profile && Profile.hashCodeWithSalt
      ? Profile.hashCodeWithSalt
      : function (c, sl) { return sl + ':' + c; };
    return hashFn(code, doc.salt) === doc.codeHash;
  }
  // دمج عند الدخول: إن كان الملف المحلي لنفس الاسم وعنده تقدّم أكثر
  // (مباريات أو XP — مثلاً لُعب أوفلاين بلا مزامنة)، نحافظ عليه.
  function mergeProfiles(localProfile, cloudProfile) {
    var same = localProfile && cloudProfile &&
      normalizeName(localProfile.name) === normalizeName(cloudProfile.name) &&
      String(localProfile.name || '').trim() !== '';
    if (same && ((localProfile.matches || 0) > (cloudProfile.matches || 0) ||
                 (localProfile.xp || 0) > (cloudProfile.xp || 0))) {
      var kept = Object.assign({}, cloudProfile, {
        name: localProfile.name,
        age: localProfile.age, anime: localProfile.anime,
        elo: localProfile.elo, xp: localProfile.xp, level: localProfile.level,
        wins: localProfile.wins, losses: localProfile.losses,
        draws: localProfile.draws, matches: localProfile.matches
      });
      return { profile: kept, keptLocal: true };
    }
    return { profile: cloudProfile, keptLocal: false };
  }

  // ---- تحميل مكتبة Firebase (متصفح فقط، كسول، بمهلة) ----
  function loadScript(src, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') { reject(cloudError('no-browser', 'لا يوجد متصفح')); return; }
      var timer = setTimeout(function () { reject(cloudError('sdk-load-failed', 'انتهت مهلة تحميل Firebase')); }, timeoutMs || SDK_TIMEOUT_MS);
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { clearTimeout(timer); resolve(); };
      s.onerror = function () { clearTimeout(timer); reject(cloudError('sdk-load-failed', 'تعذّر تحميل Firebase')); };
      document.head.appendChild(s);
    });
  }
  function ensureReady() {
    if (_db) return Promise.resolve(_db);
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async function () {
      var cfg = getConfig();
      if (!cfg) throw cloudError('not-configured', 'إعدادات Firebase غير موجودة');
      if (typeof document === 'undefined') throw cloudError('no-browser', 'لا يوجد متصفح');
      var fb = global.firebase;
      if (!fb || !fb.firestore) {
        await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/firebase-firestore-compat.js');
        fb = global.firebase;
      }
      if (!fb || !fb.firestore) throw cloudError('sdk-load-failed', 'تعذّر تحميل Firebase');
      if (!fb.apps || !fb.apps.length) fb.initializeApp(cfg);
      _db = fb.firestore();
      return _db;
    })();
    // عند الفشل نسمح بإعادة المحاولة لاحقاً (لا نعلّق على وعد مرفوض).
    _readyPromise.catch(function () { _readyPromise = null; });
    return _readyPromise;
  }
  // حقن مثيل Firestore (الاختبارات؛ أو مثيل جاهز من صفحة أخرى).
  function setFirestore(db) { _db = db || null; _readyPromise = null; }

  // ---- العمليات ----
  // تسجيل سحابي: create ذري — يفشل إن كان الاسم مسجَّلاً (taken)،
  // فلا يسجّل لاعبان نفس الاسم في نفس اللحظة.
  async function registerCloud(profile, code) {
    if (!validName(profile && profile.name)) throw cloudError('invalid-name', 'الاسم غير صالح (حرفان إلى 30 حرفاً، بلا /)');
    if (!code) throw cloudError('invalid-code', 'الكود مطلوب');
    if (String(code).length < CODE_MIN) throw cloudError('code-too-short', 'الكود قصير — 6 أحرف على الأقل');
    var db = await ensureReady();
    var id = normalizeName(profile.name);
    var ref = db.collection(COLLECTION).doc(id);
    var doc = toCloudDoc(profile, code);
    if (ref.create) {
      try { await ref.create(doc); }
      catch (e) {
        if (e && (e.code === 'already-exists' || /already-exists|already exists/i.test(e.message || ''))) throw cloudError('taken', 'هذا الاسم مسجَّل من قبل — استعمل الدخول');
        throw e;
      }
    } else {
      // fallback لمثيل قديم بلا create (لا يستعمل في الصفحة الحقيقية).
      var snap = await ref.get();
      if (snap.exists) throw cloudError('taken', 'هذا الاسم مسجَّل من قبل — استعمل الدخول');
      await ref.set(doc);
    }
    setCloudLink(id);
    setSessionCode(code);
    return fromCloudDoc(doc);
  }
  // دخول: يرجع الملف كاملاً عند تطابق الكود، وإلا يرمي not-found / wrong-code.
  // لا يفرض طول الكود هنا (حسابات قديمة بكود قصير تبقى تدخل).
  async function loginCloud(name, code) {
    if (!validName(name)) throw cloudError('invalid-name', 'الاسم غير صالح');
    if (!code) throw cloudError('invalid-code', 'الكود مطلوب');
    var db = await ensureReady();
    var snap = await db.collection(COLLECTION).doc(normalizeName(name)).get();
    if (!snap.exists) throw cloudError('not-found', 'لا يوجد حساب بهذا الاسم — سجّل أولاً');
    var doc = snap.data();
    if (!verifyCloudCode(doc, code)) throw cloudError('wrong-code', 'الكود غير صحيح');
    setCloudLink(normalizeName(name));
    setSessionCode(code);
    return fromCloudDoc(doc);
  }
  // مزامنة: أفضل جهد، لا ترمي أبداً — الفشل يعني ببساطة بقاء الملف محلياً.
  // لا تكتب إلا إن كان الحساب مربوطاً بهذا الجهاز (رابط من تسجيل/دخول ناجح)
  // وطابق اسم الملف؛ وإن توفّر كود الجلسة يتحقق منه قبل الكتابة.
  async function syncCloud(profile) {
    try {
      if (!profile || !validName(profile.name)) return { ok: false, reason: 'invalid-name' };
      if (getCloudLink() !== normalizeName(profile.name)) return { ok: false, reason: 'not-linked' };
      var db = await ensureReady();
      var ref = db.collection(COLLECTION).doc(normalizeName(profile.name));
      var snap = await ref.get();
      if (!snap.exists) return { ok: false, reason: 'not-registered' };
      var existing = snap.data() || {};
      if (_sessionCode && !verifyCloudCode(existing, _sessionCode)) {
        clearCloudLink();
        return { ok: false, reason: 'not-verified' };
      }
      // نحافظ على الهاش والملح وcreatedAt السحابيين؛ نزامن الحقول التقدمية فقط.
      await ref.set({
        age: profile.age || 18, anime: profile.anime || '',
        elo: profile.elo || 1000, xp: profile.xp || 0, level: profile.level || 1,
        wins: profile.wins || 0, losses: profile.losses || 0,
        draws: profile.draws || 0, matches: profile.matches || 0,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: (e && e.code) || 'offline' };
    }
  }

  // ---- الترتيب العام: كل اللاعبين مرتبين حسب XP ثم ELO ثم الاسم ----
  // يُستعمل لعرض منصة التتويج (الأول والثاني والثالث) ثم باقي اللاعبين.
  async function listProfiles() {
    var db = await ensureReady();
    var snap = await db.collection(COLLECTION).get();
    var out = [];
    snap.forEach(function (d) {
      var p = fromCloudDoc(d.data());
      if (p && p.name) out.push(p);
    });
    out.sort(function (a, b) {
      return (b.xp - a.xp) || (b.elo - a.elo) || String(a.name).localeCompare(String(b.name), 'ar');
    });
    return out;
  }

  var api = {
    COLLECTION: COLLECTION, LINK_KEY: LINK_KEY, SDK_VERSION: SDK_VERSION,
    CODE_MIN: CODE_MIN, NAME_MIN: NAME_MIN, NAME_MAX: NAME_MAX,
    isConfigured: isConfigured, getConfig: getConfig,
    normalizeName: normalizeName, validName: validName, newSalt: newSalt,
    getCloudLink: getCloudLink, setCloudLink: setCloudLink, clearCloudLink: clearCloudLink,
    setSessionCode: setSessionCode, getSessionCode: getSessionCode,
    toCloudDoc: toCloudDoc, fromCloudDoc: fromCloudDoc, verifyCloudCode: verifyCloudCode,
    mergeProfiles: mergeProfiles,
    ensureReady: ensureReady, setFirestore: setFirestore,
    registerCloud: registerCloud, loginCloud: loginCloud, syncCloud: syncCloud, listProfiles: listProfiles
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingCloud = api;
})(typeof window !== 'undefined' ? window : globalThis);
