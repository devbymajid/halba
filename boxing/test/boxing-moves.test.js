/**
 * Halba — Boxing moves test (Node, بلا كاميرا)
 * تشغيل: node test/boxing-moves.test.js
 * يخرج 0 عند النجاح، و1 عند أي فشل.
 */
'use strict';
// localStorage وهمي في Node — يجب أن يكون قبل تحميل الملفات التي تستعمله.
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
const Moves = require('../js/boxing-moves.js');
const Combos = require('../js/boxing-combos.js');
const Profile = require('../js/boxing-profile.js');
const Match = require('../js/boxing-match.js');
const Training = require('../js/boxing-training.js');
const Pose = require('../js/boxing-pose.js');

function testProfile() {
  return { name: 'مختبر', code: 'TEST1', age: 20, anime: 'كايتو', elo: 1000, xp: 0, level: 1, wins: 0, losses: 0, draws: 0, matches: 0 };
}
function newMatch() {
  return new Match.BoxingMatch({ profile: testProfile(), onUpdate: () => {}, onCommand: () => {}, onFeedback: () => {}, onEnd: () => {} });
}
// محاكاة أمينة لمتعقب القلب الحقيقي (devbymajid/halba، js/pose.js):
// المُنشئ دالة تأخذ (videoEl, canvasEl, callbacks) وتعيد
// { start, stop, pause, resume, inject, running }؛ والـ callbacks
// ثابتة في الإغلاق — بلا setCallbacks ولا subscribe ولا on.
function FakeCoreTracker(videoEl, canvasEl, callbacks) {
  return {
    start: async function () {},
    stop: function () {},
    pause: function () {},
    resume: function () {},
    inject: function (lm) { if (callbacks && callbacks.onLandmarks) callbacks.onLandmarks(lm, Date.now()); },
    get running() { return true; }
  };
}

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { failures++; console.log('FAIL', name, '-', e.message); }
}

for (const mv of ['JAB', 'CROSS', 'HOOK', 'UPPERCUT', 'SLIP', 'DODGE', 'BODY', 'BLOCK']) {
  check(mv + ' full counts', () => {
    const r = Moves.validateSequence(Moves.generateMoveFrames(mv, true), mv);
    assert.strictEqual(r.valid, true, JSON.stringify(r));
  });
  check(mv + ' half does NOT count', () => {
    const r = Moves.validateSequence(Moves.generateMoveFrames(mv, false), mv);
    assert.strictEqual(r.valid, false, JSON.stringify(r));
  });
}
check('no guard first is rejected', () => {
  const r = Moves.validateSequence([{ lm: Moves.peakLandmarks('JAB'), t: 0 }], 'JAB');
  assert.strictEqual(r.valid, false, JSON.stringify(r));
});
check('guard pose is recognised', () => {
  assert.strictEqual(Moves.isGuard(Moves.computeMetrics(Moves.guardLandmarks())), true);
});
check('combo ladder is 11,112,1121,11212,112123,1121235B with B=body', () => {
  const codes = Combos.COMBO_LADDER.map(c => c.code);
  assert.deepStrictEqual(codes, ['11', '112', '1121', '11212', '112123', '1121235B']);
  const last = Combos.COMBO_LADDER[Combos.COMBO_LADDER.length - 1];
  assert.deepStrictEqual(last.seq, ['JAB', 'JAB', 'CROSS', 'JAB', 'CROSS', 'HOOK', 'UPPERCUT', 'BODY']);
  assert.strictEqual(Moves.DIGIT_TO_MOVE['B'], 'BODY');
  // السرعة تزيد: مهلة اللكمة تنقص مع المستوى.
  const times = Combos.COMBO_LADDER.map(c => c.timePerPunchMs);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] < times[i - 1], 'time must decrease');
});
check('combo engine: clean row advances, half resets row', () => {
  const eng = new Combos.ComboEngine({ onUpdate: () => {}, onFeedback: () => {} });
  eng.selectLevel(0); eng.start();
  let r = eng.trySimulatedMove('JAB', true); assert.strictEqual(r.ok, true);
  assert.strictEqual(eng.position, 1);
  r = eng.trySimulatedMove('JAB', false); assert.strictEqual(r.ok, false);
  assert.strictEqual(eng.position, 0, 'half must reset the row');
  eng.trySimulatedMove('JAB', true); eng.trySimulatedMove('JAB', true);
  assert.strictEqual(eng.unlocked, 1, 'clean row must unlock next');
});

// ---- إصلاحات المراجعة 2026-11-21 ~19:14 (عيوب 1-3 + ثانوية) ----
check('defect 2: sideways arm raise is NOT a jab', () => {
  const r = Moves.validateSequence(Moves.generateSidewaysFrames('JAB'), 'JAB');
  assert.strictEqual(r.valid, false, JSON.stringify(r));
  // والرفع الجانبي نفسه كان يمر بالامتداد والمرفق وحدهما:
  const m = Moves.computeMetrics(Moves.sidewaysRaiseLandmarks('JAB'));
  assert.ok(m.wristDistR >= 1.35 && m.elbowAngleR >= 155, 'sideways peak must be extended+open (old code would count it)');
  assert.strictEqual(Moves.peakScore(Moves.sidewaysRaiseLandmarks('JAB'), 'JAB', { wristZR: -0.16 }).peak, false);
});
check('defect 2: sideways arm raise is NOT a cross', () => {
  const r = Moves.validateSequence(Moves.generateSidewaysFrames('CROSS'), 'CROSS');
  assert.strictEqual(r.valid, false, JSON.stringify(r));
});
check('defect 2: full jab/cross still count (forward z present)', () => {
  assert.strictEqual(Moves.validateSequence(Moves.generateMoveFrames('JAB', true), 'JAB').valid, true);
  assert.strictEqual(Moves.validateSequence(Moves.generateMoveFrames('CROSS', true), 'CROSS').valid, true);
});
check('defect 1: dodge during a non-defensive command (simulated)', () => {
  const m = newMatch();
  assert.strictEqual(m.start(), true);
  m.currentCommand = 'JAB'; m.validator = new Moves.MoveValidator('JAB');
  m.botAttackActive = true; m._armDefense();
  const r = m.trySimulatedMove('SLIP', true);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.dodged, true);
  assert.strictEqual(m.dodges, 1);
  assert.strictEqual(m.botAttackActive, false);
  assert.strictEqual(m.currentCommand, 'JAB', 'dodge must not consume the current command');
  m.stop();
});
check('defect 1: dodge during a non-defensive command (camera frames)', () => {
  const m = newMatch();
  assert.strictEqual(m.start(), true);
  m.currentCommand = 'JAB'; m.validator = new Moves.MoveValidator('JAB');
  m.botAttackActive = true; m._armDefense();
  let t = 1000;
  const feed = (lm) => { m.feedLandmarks(lm, t); t += 100; };
  feed(Moves.guardLandmarks()); feed(Moves.guardLandmarks()); feed(Moves.guardLandmarks());
  feed(Moves.peakLandmarks('SLIP')); feed(Moves.peakLandmarks('SLIP'));
  feed(Moves.guardLandmarks());
  assert.strictEqual(m.dodges, 1, 'slip frames during a JAB command must dodge the bot attack');
  assert.strictEqual(m.botAttackActive, false);
  m.stop();
});
check('defect 3: quitting a losing ranked match records a loss, not a draw', () => {
  const m = newMatch();
  assert.strictEqual(m.start(), true);
  m.playerHp = 30; m.botHp = 80; // خاسرة
  const eloBefore = m.profile.elo;
  m.stop('quit');
  assert.strictEqual(m.state, 'over');
  assert.strictEqual(m.result, 'loss');
  assert.strictEqual(m.profile.losses, 1);
  assert.strictEqual(m.profile.draws, 0);
  assert.ok(m.profile.elo < eloBefore, 'ELO must drop on a forfeit loss');
});
check('defect 3: quitting while winning is still a loss (forfeit)', () => {
  const m = newMatch();
  assert.strictEqual(m.start(), true);
  m.playerHp = 90; m.botHp = 20; // فائزة لحظتها
  m.stop();
  assert.strictEqual(m.result, 'loss');
  assert.strictEqual(m.profile.losses, 1);
});
check('ranked match without a profile does not start', () => {
  global.localStorage.clear();
  const m = new Match.BoxingMatch({ onUpdate: () => {}, onCommand: () => {}, onFeedback: () => {}, onEnd: () => {} });
  assert.strictEqual(m.start(), false);
  assert.notStrictEqual(m.state, 'running');
});
check('level formula matches the core: xpForLevel = 100*L*(L-1)/2', () => {
  assert.strictEqual(Profile.xpForLevel(1), 0);
  assert.strictEqual(Profile.xpForLevel(2), 100);
  assert.strictEqual(Profile.xpForLevel(3), 300);
  assert.strictEqual(Profile.xpForLevel(4), 600);
  assert.strictEqual(Profile.levelForXp(0), 1);
  assert.strictEqual(Profile.levelForXp(99), 1);
  assert.strictEqual(Profile.levelForXp(100), 2);
  assert.strictEqual(Profile.levelForXp(299), 2);
  assert.strictEqual(Profile.levelForXp(300), 3);
  assert.strictEqual(Profile.levelForXp(600), 4);
  assert.strictEqual(Profile.levelForXp(1000), 5);
});
check('level uses FitStore.Levels when present', () => {
  global.FitStore = { Levels: { levelForXp: () => 99 } };
  assert.strictEqual(Profile.levelForXp(0), 99);
  delete global.FitStore;
  assert.strictEqual(Profile.levelForXp(0), 1);
});
check('SHA-256 matches known vectors', () => {
  assert.strictEqual(Profile.sha256HexSync(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(Profile.sha256HexSync('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
check('code is never stored in plain text', () => {
  global.localStorage.clear();
  const p = Profile.defaultProfile();
  p.name = 'مختبر'; p.code = 'SECRET123';
  Profile.saveProfile(p);
  const raw = global.localStorage.getItem(Profile.KEY);
  assert.ok(raw.indexOf('SECRET123') === -1, 'plain code must not appear in storage');
  assert.ok(raw.indexOf('codeHash') !== -1, 'a hash must be stored instead');
  const loaded = Profile.loadProfile();
  assert.strictEqual(loaded.code, '', 'plain code is not loaded back');
  assert.strictEqual(Profile.verifyCode(loaded, 'SECRET123'), true);
  assert.strictEqual(Profile.verifyCode(loaded, 'WRONG'), false);
});
check('training setMove resets count and streak; wrong simulated move counts', () => {
  const tr = new Training.BoxingTraining({ onUpdate: () => {}, onFeedback: () => {} });
  tr.start();
  let r = tr.trySimulatedMove('JAB', true); assert.strictEqual(r.ok, true);
  assert.strictEqual(tr.count, 1);
  tr.setMove('HOOK');
  assert.strictEqual(tr.count, 0);
  assert.strictEqual(tr.streak, 0);
  assert.strictEqual(tr.bestStreak, 0);
  r = tr.trySimulatedMove('JAB', true); // حركة خاطئة والآن المطلوبة HOOK
  assert.strictEqual(r.ok, false);
  assert.strictEqual(tr.wrongAttempts, 1, 'wrong simulated move must increase wrongAttempts');
  tr.stop();
});
check('pose: shared core tracker is preferred, no second camera', () => {
  assert.strictEqual(Pose.PoseTracker.hasCoreTracker(), false);
  const fake = { setCallbacks: () => {} };
  Pose.PoseTracker.setSharedTracker(fake);
  assert.strictEqual(Pose.PoseTracker.hasCoreTracker(), true);
  assert.strictEqual(Pose.PoseTracker.getSharedTracker(), fake);
  const t = Pose.createPoseTracker({ onLandmarks: () => {}, onStatus: () => {} });
  assert.strictEqual(t.sharedTracker, fake);
  Pose.PoseTracker.clearSharedTracker();
  assert.strictEqual(Pose.PoseTracker.hasCoreTracker(), false);
  global.FitPose = { PoseTracker: function () {} };
  assert.strictEqual(Pose.PoseTracker.hasCoreTracker(), true, 'FitPose presence must be detected');
  delete global.FitPose;
  assert.strictEqual(Pose.PoseTracker.hasCoreTracker(), false);
});

// ---- إصلاح العيب 5 (المراجعة الثانية 2026-11-21 ~19:24): الكاميرا المشتركة ----
// القلب الحقيقي: PoseTracker(videoEl, canvasEl, callbacks) — callbacks في
// المُنشئ فقط، بلا setCallbacks. الدمج الصحيح fan-out عند الإنشاء.
check('defect 5: createSharedCallbacks fans out to both sides and isolates errors', () => {
  const a = [], b = [];
  const combined = Pose.PoseTracker.createSharedCallbacks(
    { onLandmarks: (lm) => { a.push(lm); }, onStatus: (s) => { a.push(s); } },
    { onLandmarks: (lm) => { b.push(lm); throw new Error('boxing handler throws'); }, onStatus: (s) => { b.push(s); } }
  );
  combined.onLandmarks(Moves.guardLandmarks(), 7);
  combined.onStatus('tracking');
  assert.strictEqual(a.length, 2, 'core side must receive landmarks + status');
  assert.strictEqual(b.length, 2, 'boxing side must receive landmarks + status even though its handler throws');
});
check('defect 5 note 2: forward advance of exactly 0.08 counts (float edge)', () => {
  // -0.16 - -0.24 = 0.07999999999999999 في JS — كان يُرفض قبل هامش epsilon.
  assert.ok((-0.16 - -0.24) < 0.08, 'sanity: the float edge really exists in JS');
  const g = Moves.guardLandmarks();
  const p = Moves.guardLandmarks();
  p[16] = { x: 0.60, y: 0.34, z: -0.24 }; // تقدم z يساوي 0.08 بالضبط
  p[14] = { x: 0.60, y: 0.35, z: -0.15 }; // مرفق مفتوح
  const frames = [];
  let t = 0;
  const push = (lm) => { frames.push({ lm: JSON.parse(JSON.stringify(lm)), t }); t += 100; };
  push(g); push(g); push(g); push(p); push(p); push(g); push(g);
  const r = Moves.validateSequence(frames, 'JAB');
  assert.strictEqual(r.valid, true, JSON.stringify(r));
});
check('defect 5 note 1: slip starting immediately with the attack warning still dodges (pre-armed defense)', () => {
  const m = newMatch();
  assert.strictEqual(m.start(), true);
  m.currentCommand = 'JAB'; m.validator = new Moves.MoveValidator('JAB');
  // إطارات حارس قبل الهجوم — تملأ lastGuardLm لتسبيق التسلح.
  let t = Date.now();
  m.feedLandmarks(Moves.guardLandmarks(), t); t += 100;
  m.feedLandmarks(Moves.guardLandmarks(), t); t += 100;
  // أشعل هجوم البوت الآن عبر _tick.
  m.botAttackAt = Date.now() - 1;
  m._tick();
  assert.strictEqual(m.botAttackActive, true, 'bot attack must be active');
  // انزلاق يبدأ فوراً: بلا أي إطار حارس جديد — أول إطار منتصف انزلاق.
  const frames = Moves.generateMoveFrames('SLIP', true).slice(3);
  for (const f of frames) { m.feedLandmarks(f.lm, Date.now() + 100); }
  assert.strictEqual(m.dodges, 1, 'immediate slip must dodge the bot attack');
  assert.strictEqual(m.botAttackActive, false);
  m.stop();
});

// ---- فحوصات غير متزامنة (initCamera يعيد Promise) ----
const asyncTests = [];
function asyncCheck(name, fn) { asyncTests.push({ name, fn }); }

asyncCheck('defect 5: fan-out feeds boxing from a faithful core tracker (constructor callbacks, no setCallbacks)', async () => {
  const boxingSeen = [], coreSeen = [];
  const boxing = Pose.createPoseTracker({
    onLandmarks: (lm) => { boxingSeen.push(lm); },
    onStatus: () => {}
  });
  const coreCallbacks = { onLandmarks: (lm) => { coreSeen.push(lm); }, onStatus: () => {} };
  const combined = Pose.PoseTracker.createSharedCallbacks(coreCallbacks, boxing.getCallbacks());
  const core = new FakeCoreTracker(null, null, combined);
  assert.strictEqual(typeof core.setCallbacks, 'undefined', 'real core tracker has no setCallbacks');
  assert.strictEqual(typeof core.subscribe, 'undefined', 'real core tracker has no subscribe');
  Pose.PoseTracker.setSharedTracker(core, { wired: true });
  const ok = await boxing.initCamera(null);
  assert.strictEqual(ok, true, 'initCamera must accept the wired shared tracker');
  assert.strictEqual(boxing.mode, 'core-shared');
  core.inject(Moves.guardLandmarks());
  assert.strictEqual(coreSeen.length, 1, 'core must still receive landmarks');
  assert.strictEqual(boxingSeen.length, 1, 'boxing must receive landmarks through the fan-out');
  assert.ok(boxingSeen[0] && boxingSeen[0].length >= 33, 'boxing must receive full 33-point landmarks');
  boxing.stop();
  Pose.PoseTracker.clearSharedTracker();
});
asyncCheck('defect 5: shared tracker without any subscription path fails LOUDLY (no silent core-shared)', async () => {
  let statusMsg = '';
  // شكل مثيل القلب الحقيقي تماماً: start/stop/pause/resume/inject، بلا setCallbacks.
  const bare = { start: async () => {}, stop: () => {}, pause: () => {}, resume: () => {}, inject: () => {} };
  assert.strictEqual(typeof bare.setCallbacks, 'undefined');
  Pose.PoseTracker.setSharedTracker(bare);
  const boxing = Pose.createPoseTracker({ onLandmarks: () => {}, onStatus: (msg) => { statusMsg = msg; } });
  const ok = await boxing.initCamera(null);
  assert.strictEqual(ok, false, 'initCamera must refuse a tracker it cannot subscribe to');
  assert.strictEqual(boxing.mode, 'core-pending', 'must never claim core-shared without landmarks');
  assert.ok(/setCallbacks/.test(statusMsg), 'status must explain the missing subscription: ' + statusMsg);
  Pose.PoseTracker.clearSharedTracker();
});
asyncCheck('defect 5: tracker WITH setCallbacks still attaches (backward compat)', async () => {
  const seen = [];
  let bound = null;
  const withSet = { setCallbacks: (cb) => { bound = cb; }, stop: () => {} };
  Pose.PoseTracker.setSharedTracker(withSet);
  const boxing = Pose.createPoseTracker({ onLandmarks: (lm) => { seen.push(lm); }, onStatus: () => {} });
  const ok = await boxing.initCamera(null);
  assert.strictEqual(ok, true);
  assert.strictEqual(boxing.mode, 'core-shared');
  bound.onLandmarks(Moves.guardLandmarks(), 123);
  assert.strictEqual(seen.length, 1, 'landmarks must flow through setCallbacks');
  boxing.stop();
  Pose.PoseTracker.clearSharedTracker();
});
asyncCheck('defect 5: tracker with subscribe() attaches and stop() unsubscribes (never stops the core tracker)', async () => {
  const seen = [];
  let sub = null, coreStopped = false;
  const withSub = {
    subscribe: (cb) => { sub = cb; return () => { sub = null; }; },
    stop: () => { coreStopped = true; }
  };
  Pose.PoseTracker.setSharedTracker(withSub);
  const boxing = Pose.createPoseTracker({ onLandmarks: (lm) => { seen.push(lm); }, onStatus: () => {} });
  assert.strictEqual(await boxing.initCamera(null), true);
  assert.strictEqual(boxing.mode, 'core-shared');
  sub.onLandmarks(Moves.guardLandmarks(), 1);
  assert.strictEqual(seen.length, 1, 'landmarks must flow through subscribe');
  boxing.stop();
  assert.strictEqual(sub, null, 'stop must unsubscribe');
  assert.strictEqual(coreStopped, false, 'stop must never stop the core tracker itself');
  Pose.PoseTracker.clearSharedTracker();
});

(async function () {
  for (const t of asyncTests) {
    try { await t.fn(); console.log('PASS', t.name); }
    catch (e) { failures++; console.log('FAIL', t.name, '-', e.message); }
  }
  console.log(failures === 0 ? 'ALL TESTS PASS' : failures + ' TEST(S) FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
