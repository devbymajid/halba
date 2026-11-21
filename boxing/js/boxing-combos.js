/**
 * Halba — Combo Ladder / سلّم الكومبو التدريجي
 * 11 ← 112 ← 1121 ← 11212 ← 112123 ← 1121235B
 * 1=جاب، 2=كروس، 3=هوك، 5=أبركت، B=لكمة للجسم (body)
 * — هذا تعريف B حسب TEAM-LOG.md في ريبو halba.
 * كل صف يُكمَّل نظيفاً (بلا حركة نصفية ولا خطأ) يفتح الذي بعده.
 * بطيء ونظيف أولاً، ثم السرعة تزيد: مهلة كل لكمة تنقص من 3000ms إلى 1500ms.
 * خطأ أو نصفية = إعادة الصف الحالي من البداية (المستوى المفتوح لا يضيع).
 */
(function (global) {
  'use strict';
  var Moves = global.HalbaBoxingMoves;
  var Profile = global.HalbaBoxingProfile;

  var COMBO_LADDER = [
    { code: '11', seq: ['JAB', 'JAB'], timePerPunchMs: 3000 },
    { code: '112', seq: ['JAB', 'JAB', 'CROSS'], timePerPunchMs: 2600 },
    { code: '1121', seq: ['JAB', 'JAB', 'CROSS', 'JAB'], timePerPunchMs: 2400 },
    { code: '11212', seq: ['JAB', 'JAB', 'CROSS', 'JAB', 'CROSS'], timePerPunchMs: 2100 },
    { code: '112123', seq: ['JAB', 'JAB', 'CROSS', 'JAB', 'CROSS', 'HOOK'], timePerPunchMs: 1800 },
    { code: '1121235B', seq: ['JAB', 'JAB', 'CROSS', 'JAB', 'CROSS', 'HOOK', 'UPPERCUT', 'BODY'], timePerPunchMs: 1500 }
  ];
  var STORE_KEY = 'halba_boxing_combos_v1';

  function loadUnlocked() {
    try { var v = parseInt(localStorage.getItem(STORE_KEY) || '0', 10); return isNaN(v) ? 0 : Math.max(0, Math.min(v, COMBO_LADDER.length - 1)); } catch (e) { return 0; }
  }
  function saveUnlocked(i) { try { localStorage.setItem(STORE_KEY, String(i)); } catch (e) {} }

  function ComboEngine(opts) {
    opts = opts || {};
    this.onUpdate = opts.onUpdate || function () {};
    this.onFeedback = opts.onFeedback || function () {};
    this.unlocked = loadUnlocked();
    this.level = 0; this.position = 0; this.state = 'idle';
    this.validator = null; this.deadline = 0; this.attempts = 0; this.completed = 0;
    this.profile = Profile ? Profile.loadProfile() : null;
  }
  ComboEngine.prototype._combo = function () { return COMBO_LADDER[this.level]; };
  ComboEngine.prototype._emit = function () {
    this.onUpdate({
      state: this.state, level: this.level, unlocked: this.unlocked,
      combo: this._combo(), position: this.position,
      nextMove: this.state === 'running' ? this._combo().seq[this.position] : null,
      attempts: this.attempts, completed: this.completed, profile: this.profile
    });
  };
  ComboEngine.prototype.selectLevel = function (i) {
    if (i < 0 || i > this.unlocked || i >= COMBO_LADDER.length) return false;
    this.level = i; this.position = 0; this.state = 'idle'; this.validator = null;
    this._emit(); return true;
  };
  ComboEngine.prototype.start = function () {
    this.position = 0; this.state = 'running'; this.attempts++;
    this._armCurrent();
    this.onFeedback('الكومبو ' + this._combo().code + ' — ابدأ من الحارس، ثم ' + Moves.MOVE_NAMES_AR[this._combo().seq[0]]);
    this._emit();
  };
  ComboEngine.prototype._armCurrent = function () {
    var move = this._combo().seq[this.position];
    this.validator = new Moves.MoveValidator(move);
    this.deadline = Date.now() + this._combo().timePerPunchMs;
  };
  ComboEngine.prototype._resetRow = function (reason) {
    this.position = 0;
    this.onFeedback('✗ ' + reason + ' — أعد الصف من البداية');
    this._armCurrent(); this._emit();
  };
  ComboEngine.prototype._advance = function () {
    this.position++;
    if (this.position >= this._combo().seq.length) {
      this.completed++;
      this.onFeedback('✓ كومبو ' + this._combo().code + ' كامل ونظيف!');
      if (this.profile && Profile) Profile.addXp(this.profile, 20 + this.level * 10);
      if (this.level < COMBO_LADDER.length - 1 && this.level === this.unlocked) {
        this.unlocked++; saveUnlocked(this.unlocked);
        this.onFeedback('فتحت الكومبو التالي: ' + COMBO_LADDER[this.unlocked].code);
      }
      if (this.level >= COMBO_LADDER.length - 1) {
        this.state = 'done'; this.onFeedback('أكملت كل السلّم! أنت بطل الحلبة');
      } else {
        this.level++; this.position = 0; this.state = 'idle';
      }
      this.validator = null; this._emit(); return;
    }
    this._armCurrent();
    this.onFeedback('التالية: ' + Moves.MOVE_NAMES_AR[this._combo().seq[this.position]]);
    this._emit();
  };
  ComboEngine.prototype.feedLandmarks = function (lm, nowMs) {
    if (this.state !== 'running' || !this.validator) return;
    nowMs = nowMs || Date.now();
    if (nowMs > this.deadline) { this._resetRow('انتهت مهلة اللكمة'); return; }
    var res = this.validator.feed(lm, nowMs);
    if (res.status === 'valid') this._advance();
    else if (res.status === 'rejected') this._resetRow(res.reason || 'حركة غير صحيحة');
    else this._emit();
  };
  /** محاكاة لكمة (بلا كاميرا): نفس التحقق عبر تسلسل نقاط اصطناعية. */
  ComboEngine.prototype.trySimulatedMove = function (moveId, full) {
    if (this.state !== 'running' || !this.validator) return { ok: false, reason: 'الكومبو غير شغال' };
    if (Date.now() > this.deadline) { this._resetRow('انتهت مهلة اللكمة'); return { ok: false, reason: 'انتهت المهلة' }; }
    var expected = this._combo().seq[this.position];
    if (moveId !== expected) { this._resetRow('اللكمة المطلوبة هي ' + Moves.MOVE_NAMES_AR[expected] + ' وليست ' + Moves.MOVE_NAMES_AR[moveId]); return { ok: false, reason: 'لكمة خاطئة' }; }
    var res = Moves.validateSequence(Moves.generateMoveFrames(moveId, full !== false), moveId);
    if (!res.valid) { this._resetRow(res.reason); return { ok: false, reason: res.reason, half: !!res.half }; }
    this._advance();
    return { ok: true };
  };

  var api = { ComboEngine: ComboEngine, COMBO_LADDER: COMBO_LADDER, STORE_KEY: STORE_KEY, loadUnlocked: loadUnlocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingCombos = api;
})(typeof window !== 'undefined' ? window : globalThis);
