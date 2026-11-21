/**
 * Halba — Boxing bot-level test (Node, بلا كاميرا)
 * تشغيل: node test/boxing-botlevel.test.js
 * يخرج 0 عند النجاح، و1 عند أي فشل.
 * مستويات البوت: سهل 800 / متوسط 1200 / صعب 1600 — متوسط = قيم v1 الأصلية.
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
require('../js/boxing-moves.js');
require('../js/boxing-profile.js');
const Match = require('../js/boxing-match.js');

let pass = 0, fail = 0;
const asyncTests = [];
function check(name, fn) { asyncTests.push({ name, fn: async () => fn() }); }
function asyncCheck(name, fn) { asyncTests.push({ name, fn }); }

function testProfile() {
  return { name: 'مختبر', code: 'TEST1', age: 20, anime: 'كايتو', elo: 1000, xp: 0, level: 1, wins: 0, losses: 0, draws: 0, matches: 0 };
}
function newMatch(opts) {
  const o = Object.assign({ profile: testProfile(), onUpdate: () => {}, onCommand: () => {}, onFeedback: () => {}, onEnd: () => {} }, opts || {});
  return new Match.BoxingMatch(o);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1. القيم الافتراضية = متوسط = سلوك v1 تماماً ---
check('default level is medium, botElo 1200, v1 values', () => {
  const m = newMatch();
  assert.strictEqual(m.botLevel, 'medium');
  assert.strictEqual(m.botElo, 1200);
  assert.deepStrictEqual(m.levelParams, Match.BOT_LEVELS.medium);
  assert.strictEqual(m.levelParams.firstAttackMs, 5000);
  assert.strictEqual(m.levelParams.attackGapMin, 3500);
  assert.strictEqual(m.levelParams.attackGapRand, 2000);
  assert.strictEqual(m.levelParams.attackWindowMs, 1400);
  assert.strictEqual(m.levelParams.attackDamage, 8);
  assert.strictEqual(m.levelParams.timeoutDamage, 5);
});

// --- 2. جدول المستويات ---
check('easy: elo 800, slower + weaker', () => {
  const m = newMatch({ botLevel: 'easy' });
  assert.strictEqual(m.botLevel, 'easy');
  assert.strictEqual(m.botElo, 800);
  assert.strictEqual(m.levelParams.firstAttackMs, 7000);
  assert.strictEqual(m.levelParams.attackWindowMs, 1800);
  assert.strictEqual(m.levelParams.attackDamage, 5);
  assert.strictEqual(m.levelParams.timeoutDamage, 3);
});
check('hard: elo 1600, faster + stronger', () => {
  const m = newMatch({ botLevel: 'hard' });
  assert.strictEqual(m.botLevel, 'hard');
  assert.strictEqual(m.botElo, 1600);
  assert.strictEqual(m.levelParams.firstAttackMs, 3500);
  assert.strictEqual(m.levelParams.attackWindowMs, 1100);
  assert.strictEqual(m.levelParams.attackDamage, 12);
  assert.strictEqual(m.levelParams.timeoutDamage, 8);
});
check('unknown level falls back to medium', () => {
  const m = newMatch({ botLevel: 'nope' });
  assert.strictEqual(m.botLevel, 'medium');
  assert.strictEqual(m.botElo, 1200);
});
check('explicit botElo still overrides the number only', () => {
  const m = newMatch({ botLevel: 'easy', botElo: 900 });
  assert.strictEqual(m.botLevel, 'easy');
  assert.strictEqual(m.botElo, 900);
  assert.strictEqual(m.levelParams.attackDamage, 5);
});

// --- 3. setBotLevel ---
check('setBotLevel before start switches level + elo + emits', () => {
  let last = null;
  const m = newMatch({ onUpdate: (s) => { last = s; } });
  assert.strictEqual(m.setBotLevel('hard'), true);
  assert.strictEqual(m.botLevel, 'hard');
  assert.strictEqual(m.botElo, 1600);
  assert.strictEqual(last.botLevel, 'hard');
  assert.strictEqual(last.botElo, 1600);
});
check('setBotLevel with invalid level falls back to medium', () => {
  const m = newMatch({ botLevel: 'hard' });
  assert.strictEqual(m.setBotLevel('nope'), true);
  assert.strictEqual(m.botLevel, 'medium');
  assert.strictEqual(m.botElo, 1200);
});
asyncCheck('setBotLevel during a running match is refused', async () => {
  const m = newMatch();
  assert.strictEqual(m.start(), true);
  assert.strictEqual(m.setBotLevel('easy'), false);
  assert.strictEqual(m.botLevel, 'medium');
  assert.strictEqual(m.botElo, 1200);
  m.stop();
});
check('level survives start() + stop() (reset keeps it)', () => {
  const m = newMatch({ botLevel: 'hard' });
  assert.strictEqual(m.start(), true);
  m.stop();
  assert.strictEqual(m.botLevel, 'hard');
  assert.strictEqual(m.botElo, 1600);
  assert.strictEqual(m.start(), true);
  assert.strictEqual(m.botLevel, 'hard');
  m.stop();
});

// --- 4. الضرر يتبع المستوى ---
asyncCheck('bot attack damage follows level (easy 5 / hard 12)', async () => {
  const easy = newMatch({ botLevel: 'easy' });
  assert.strictEqual(easy.start(), true);
  easy.botAttackActive = true;
  easy.botAttackExpiresAt = Date.now() - 1;
  easy._tick();
  assert.strictEqual(easy.playerHp, 95);
  easy.stop();

  const hard = newMatch({ botLevel: 'hard' });
  assert.strictEqual(hard.start(), true);
  hard.botAttackActive = true;
  hard.botAttackExpiresAt = Date.now() - 1;
  hard._tick();
  assert.strictEqual(hard.playerHp, 88);
  hard.stop();
});
asyncCheck('command timeout damage follows level (easy 3 / hard 8)', async () => {
  let msgEasy = '', msgHard = '';
  const easy = newMatch({ botLevel: 'easy', onFeedback: (m) => { msgEasy = m; } });
  assert.strictEqual(easy.start(), true);
  easy.currentCommand = 'JAB';
  easy.commandExpiresAt = Date.now() - 1;
  easy._tick();
  assert.strictEqual(easy.playerHp, 97);
  assert.ok(msgEasy.indexOf('−3') !== -1, 'easy timeout message must say −3, got: ' + msgEasy);
  easy.stop();

  const hard = newMatch({ botLevel: 'hard', onFeedback: (m) => { msgHard = m; } });
  assert.strictEqual(hard.start(), true);
  hard.currentCommand = 'JAB';
  hard.commandExpiresAt = Date.now() - 1;
  hard._tick();
  assert.strictEqual(hard.playerHp, 92);
  assert.ok(msgHard.indexOf('−8') !== -1, 'hard timeout message must say −8, got: ' + msgHard);
  hard.stop();
});

// --- 5. ELO يستعمل ELO المستوى ---
asyncCheck('draw vs easy (800) loses ELO, draw vs hard (1600) gains ELO', async () => {
  let endEasy = null, endHard = null;
  const easy = newMatch({ botLevel: 'easy', durationMs: 50, onEnd: (r) => { endEasy = r; } });
  assert.strictEqual(easy.start(), true);
  await sleep(300);
  assert.ok(endEasy, 'easy match must have ended');
  assert.strictEqual(endEasy.result, 'draw');
  assert.ok(endEasy.elo && endEasy.elo.delta < 0, 'draw vs weaker bot must lose ELO, got ' + JSON.stringify(endEasy.elo));

  const hard = newMatch({ botLevel: 'hard', durationMs: 50, onEnd: (r) => { endHard = r; } });
  assert.strictEqual(hard.start(), true);
  await sleep(300);
  assert.ok(endHard, 'hard match must have ended');
  assert.strictEqual(endHard.result, 'draw');
  assert.ok(endHard.elo && endHard.elo.delta > 0, 'draw vs stronger bot must gain ELO, got ' + JSON.stringify(endHard.elo));
});

(async function () {
  for (const t of asyncTests) {
    try { await t.fn(); pass++; console.log('PASS', t.name); }
    catch (e) { fail++; console.log('FAIL', t.name, '-', e.message); }
  }
  console.log(fail === 0 ? 'ALL BOT-LEVEL TESTS PASS (' + pass + ' checks)' : fail + ' TEST(S) FAILED');
  process.exit(fail === 0 ? 0 : 1);
})();
