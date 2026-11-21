/**
 * Halba — Boxing cloud login test (Node, بلا شبكة ولا Firebase حقيقي)
 * تشغيل: node test/boxing-firebase.test.js
 * يخرج 0 عند النجاح، و1 عند أي فشل.
 * يختبر التسجيل/الدخول/المزامنة/الدمج ضد Firestore وهمي في الذاكرة، محقون عبر
 * setFirestore — لا يلمس شبكة ولا حساباً حقيقياً أبداً.
 */
'use strict';
if (typeof global.localStorage === 'undefined') {
  global.localStorage = {
    _s: {},
    getItem(k) { return this._s[k] !== undefined ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
    clear() { this._s = {}; }
  };
}
const assert = require('assert');
const Profile = require('../js/boxing-profile.js');
const Cloud = require('../js/boxing-firebase.js');

let passed = 0;
function ok(cond, label) { assert.ok(cond, label); passed++; console.log('  ✓ ' + label); }
async function rejectsWith(promise, code, label) {
  try { await promise; assert.fail(label + ' — كان يجب أن يرفض'); }
  catch (e) { assert.strictEqual(e.code, code, label + ' (code=' + (e && e.code) + ')'); passed++; console.log('  ✓ ' + label); }
}

// Firestore وهمي: Map + واجهة collection().doc().{get,create,set} — create ذري.
function fakeDb() {
  const store = new Map();
  return {
    _store: store,
    collection(name) {
      return {
        doc(id) {
          const key = name + '/' + id;
          return {
            get: async () => ({ exists: store.has(key), data: () => store.get(key) || null }),
            create: async (data) => {
              if (store.has(key)) { const e = new Error('already exists'); e.code = 'already-exists'; throw e; }
              store.set(key, Object.assign({}, data));
            },
            set: async (data, opts) => {
              if (opts && opts.merge) store.set(key, Object.assign({}, store.get(key) || {}, data));
              else store.set(key, Object.assign({}, data));
            }
          };
        }
      };
    }
  };
}
function testProfile(name) {
  return { name: name || 'مختبر', code: 'PIN1234', age: 20, anime: 'كايتو', elo: 1000, xp: 0, level: 1, wins: 0, losses: 0, draws: 0, matches: 0 };
}

async function run() {
  console.log('— hashCodeWithSalt (مكرر 1000 مرة) —');
  const h1 = Profile.hashCodeWithSalt('PIN1234', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const h2 = Profile.hashCodeWithSalt('PIN1234', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const h3 = Profile.hashCodeWithSalt('PIN1234', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  const h4 = Profile.hashCodeWithSalt('PIN9999', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  ok(h1 === h2, 'نفس الكود + نفس الملح = نفس الهاش');
  ok(h1 !== h3, 'ملح مختلف = هاش مختلف');
  ok(h1 !== h4, 'كود مختلف = هاش مختلف');
  ok(/^[0-9a-f]{64}$/.test(h1), 'الهاش 64 حرف سداسي عشري');
  ok(h1 !== Profile.sha256HexSync('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:PIN1234'), 'الهاش مكرر — ليس SHA-256 مرة واحدة');
  ok(Profile.HASH_ROUNDS === 1000, 'عدد التكرارات 1000');

  console.log('— normalizeName / validName —');
  ok(Cloud.normalizeName('  مجيد  ') === 'مجيد', 'التطبيع يزيل الفراغات');
  ok(Cloud.normalizeName('MAJID') === 'majid', 'التطبيع يصغّر الحروف اللاتينية');
  ok(Cloud.normalizeName('أحمد   علي') === 'احمد علي', 'التطبيع يوحّد أ/إ/آ→ا والفراغات الداخلية');
  ok(Cloud.normalizeName('فاطمة') === 'فاطمه', 'التطبيع يوحّد ة→ه');
  ok(Cloud.validName('مجيد'), 'اسم صالح');
  ok(!Cloud.validName('م'), 'اسم من حرف واحد مرفوض');
  ok(!Cloud.validName('a/b'), 'اسم فيه / مرفوض');
  ok(!Cloud.validName(''), 'اسم فارغ مرفوض');
  ok(!Cloud.validName('x'.repeat(31)), 'اسم أطول من 30 مرفوض');

  console.log('— register + login (Firestore وهمي) —');
  const db = fakeDb();
  Cloud.setFirestore(db);
  Cloud.clearCloudLink();
  const p = testProfile('مجيد');
  const reg = await Cloud.registerCloud(p, 'PIN1234');
  ok(reg.name === 'مجيد' && reg.elo === 1000, 'التسجيل يرجع الملف');
  ok(db._store.has('boxing_profiles/مجيد'), 'المستند حُفظ باسم مطبَّع');
  const stored = db._store.get('boxing_profiles/مجيد');
  ok(stored.codeHash && stored.codeHash.length === 64, 'الهاش محفوظ في المستند');
  ok(stored.salt && stored.salt.length === 32, 'الملح محفوظ في المستند (32 حرفاً)');
  ok(!('code' in stored), 'الكود النصي غير محفوظ في المستند');
  ok(Cloud.getCloudLink() === 'مجيد', 'التسجيل الناجح يسجّل الرابط السحابي');
  await rejectsWith(Cloud.registerCloud(testProfile('مجيد'), 'PIN0000'), 'taken', 'تسجيل نفس الاسم مرة ثانية مرفوض (taken)');
  await rejectsWith(Cloud.registerCloud(testProfile('م'), 'PIN1234'), 'invalid-name', 'تسجيل باسم غير صالح مرفوض');
  await rejectsWith(Cloud.registerCloud(testProfile('سليم'), ''), 'invalid-code', 'تسجيل بلا كود مرفوض');
  await rejectsWith(Cloud.registerCloud(testProfile('سليم'), '12345'), 'code-too-short', 'تسجيل بكود 5 أحرف مرفوض (code-too-short)');
  await rejectsWith(Cloud.registerCloud(testProfile('سليم'), '1'), 'code-too-short', 'تسجيل بكود حرف واحد مرفوض');

  const logged = await Cloud.loginCloud('مجيد', 'PIN1234');
  ok(logged.name === 'مجيد' && logged.elo === 1000 && logged.code === '', 'الدخول بالكود الصحيح يرجع الملف (بلا كود نصي)');
  ok(!('codeHash' in logged), 'fromCloudDoc لا يرجع codeHash (فخ verifyCode)');
  const loggedCase = await Cloud.loginCloud('  مجيد ', 'PIN1234');
  ok(loggedCase.name === 'مجيد', 'الدخول يقبل الاسم بفراغات زائدة');
  await rejectsWith(Cloud.loginCloud('مجيد', 'غلط'), 'wrong-code', 'كود خاطئ مرفوض (wrong-code)');
  await rejectsWith(Cloud.loginCloud('غير موجود', 'PIN1234'), 'not-found', 'اسم غير مسجَّل مرفوض (not-found)');
  await rejectsWith(Cloud.loginCloud('', 'PIN1234'), 'invalid-name', 'دخول بلا اسم مرفوض');

  // حساب قديم بكود قصير: الدخول لا يفرض الطول الأدنى.
  const oldSalt = Cloud.newSalt();
  db._store.set('boxing_profiles/قديم', {
    name: 'قديم', displayName: 'قديم', codeHash: Profile.hashCodeWithSalt('1', oldSalt), salt: oldSalt,
    age: 20, anime: '', elo: 1000, xp: 0, level: 1, wins: 0, losses: 0, draws: 0, matches: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  const oldLogin = await Cloud.loginCloud('قديم', '1');
  ok(oldLogin.name === 'قديم', 'الدخول بكود قصير لحساب قديم ينجح (لا فرض للطول عند الدخول)');

  console.log('— register race (D-F3) —');
  const race = await Promise.allSettled([
    Cloud.registerCloud(testProfile('سباق'), 'PIN1111'),
    Cloud.registerCloud(testProfile('سباق'), 'PIN2222')
  ]);
  const raceOk = race.filter((r) => r.status === 'fulfilled').length;
  const raceTaken = race.filter((r) => r.status === 'rejected' && r.reason && r.reason.code === 'taken').length;
  ok(raceOk === 1 && raceTaken === 1, 'تسجيلان متزامنان لنفس الاسم: واحد ينجح والآخر taken');
  ok(db._store.has('boxing_profiles/سباق'), 'مستند السباق موجود مرة واحدة');

  console.log('— displayName + التطبيع العربي —');
  const docAhmed = Cloud.toCloudDoc(testProfile('أحمد'), 'PIN1234');
  ok(docAhmed.name === 'احمد', 'toCloudDoc يطبّع الاسم في الحقل name');
  ok(docAhmed.displayName === 'أحمد', 'toCloudDoc يحفظ الإملاء الأصلي في displayName');
  ok(Cloud.fromCloudDoc(docAhmed).name === 'أحمد', 'fromCloudDoc يرجع الإملاء الأصلي');

  console.log('— verifyCloudCode —');
  ok(Cloud.verifyCloudCode(stored, 'PIN1234'), 'التحقق يقبل الكود الصحيح مع ملح المستند');
  ok(!Cloud.verifyCloudCode(stored, 'PIN0000'), 'التحقق يرفض الكود الخاطئ');
  ok(!Cloud.verifyCloudCode({ codeHash: 'x' }, 'PIN1234'), 'مستند بلا ملح لا يتحقق');

  console.log('— mergeProfiles (D-F2) —');
  const localNewer = Object.assign(testProfile('مجيد'), { elo: 1200, xp: 500, level: 3, wins: 8, matches: 10 });
  const cloudOlder = { name: 'مجيد', elo: 1000, xp: 0, level: 1, wins: 0, losses: 0, draws: 0, matches: 0 };
  const m1 = Cloud.mergeProfiles(localNewer, cloudOlder);
  ok(m1.keptLocal === true && m1.profile.elo === 1200 && m1.profile.matches === 10, 'ملف محلي أجدد لنفس الاسم يُحافَظ عليه');
  const m2 = Cloud.mergeProfiles(cloudOlder, localNewer);
  ok(m2.keptLocal === false && m2.profile.elo === 1200, 'ملف سحابي أجدد يفوز');
  const m3 = Cloud.mergeProfiles(testProfile('مجيد'), { name: 'سليم', elo: 1100, xp: 50, level: 1, wins: 1, losses: 0, draws: 0, matches: 1 });
  ok(m3.keptLocal === false && m3.profile.name === 'سليم', 'اسم مختلف = تبديل حساب، السحابي يفوز');
  const m4 = Cloud.mergeProfiles(Profile.defaultProfile(), cloudOlder);
  ok(m4.keptLocal === false, 'لا ملف محلي = السحابي يفوز');

  console.log('— syncCloud + الرابط (D-F1) —');
  // بوب يسجّل محلياً باسم سارة المسجَّل (taken) ثم يلعب: مزامنته مرفوضة بلا رابط.
  Cloud.clearCloudLink();
  Cloud.setSessionCode('');
  await Cloud.registerCloud(testProfile('سارة'), 'PIN7777'); // أليس تسجّل أولاً
  const aliceBefore = Object.assign({}, db._store.get('boxing_profiles/ساره'));
  Cloud.clearCloudLink(); // جهاز بوب — بلا رابط
  await rejectsWith(Cloud.registerCloud(testProfile('سارة'), 'PIN8888'), 'taken', 'بوب: تسجيل باسم سارة مرفوض (taken)');
  const bobLocal = Object.assign(testProfile('سارة'), { elo: 1150, xp: 300, wins: 5, matches: 6 });
  const syncBob = await Cloud.syncCloud(bobLocal);
  ok(syncBob.ok === false && syncBob.reason === 'not-linked', 'مزامنة بلا رابط مرفوضة (not-linked)');
  const aliceAfter = db._store.get('boxing_profiles/ساره');
  ok(aliceAfter.elo === aliceBefore.elo && aliceAfter.wins === aliceBefore.wins, 'مستند أليس لم يُمس (D-F1 مغلق)');
  // أليس تدخل (رابط + كود جلسة) ثم تتزامن بنجاح.
  await Cloud.loginCloud('سارة', 'PIN7777');
  ok(Cloud.getCloudLink() === 'ساره', 'الدخول يسجّل الرابط (باسم مطبَّع)');
  const p2 = Object.assign(testProfile('سارة'), { elo: 1042, xp: 150, level: 2, wins: 3, matches: 4 });
  const sync = await Cloud.syncCloud(p2);
  ok(sync.ok === true, 'المزامنة تنجح للاعب مربوط بكود جلسة صحيح');
  const after = db._store.get('boxing_profiles/ساره');
  ok(after.elo === 1042 && after.xp === 150 && after.wins === 3 && after.matches === 4, 'المزامنة تحدّث الحقول التقدمية');
  ok(after.codeHash === aliceBefore.codeHash && after.salt === aliceBefore.salt, 'المزامنة لا تغيّر الهاش ولا الملح');
  // كود جلسة خاطئ: المزامنة ترفض وتمسح الرابط.
  Cloud.setSessionCode('غلط');
  const syncBadCode = await Cloud.syncCloud(p2);
  ok(syncBadCode.ok === false && syncBadCode.reason === 'not-verified', 'كود جلسة خاطئ يرفض المزامنة (not-verified)');
  ok(Cloud.getCloudLink() === '', 'كود جلسة خاطئ يمسح الرابط');
  Cloud.setCloudLink('جديد');
  const syncNew = await Cloud.syncCloud(testProfile('جديد'));
  ok(syncNew.ok === false && syncNew.reason === 'not-registered', 'مزامنة لاعب غير مسجَّل سحابياً ترجع not-registered بلا رمي');
  const syncBad = await Cloud.syncCloud(testProfile(''));
  ok(syncBad.ok === false, 'مزامنة باسم غير صالح ترجع فشلاً بلا رمي');

  console.log('— offline: بلا Firestore —');
  Cloud.setCloudLink('مجيد');
  Cloud.setSessionCode('PIN1234');
  Cloud.setFirestore(null);
  const off = await Cloud.syncCloud(testProfile('مجيد'));
  ok(off.ok === false, 'المزامنة بلا اتصال ترجع فشلاً بلا رمي (اللعب المحلي يستمر)');
  await rejectsWith(Cloud.loginCloud('مجيد', 'PIN1234'), 'not-configured', 'الدخول بلا إعدادات Firebase يرفض برسالة واضحة');

  console.log('\nALL BOXING-FIREBASE TESTS PASS (' + passed + ' checks)');
  process.exit(0);
}
run().catch(function (e) { console.error('FAIL:', e && e.stack || e); process.exit(1); });
