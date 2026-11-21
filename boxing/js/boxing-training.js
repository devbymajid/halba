/**
 * Halba — Boxing Training / تدريب فردي بلا خصم
 * اختر حركة وهدف تكرارات؛ كل تكرار صحيح يُحسب فوراً،
 * والنصفية تُرفض مع سبب فوري (مدّ أكثر / عُد للحارس / ابدأ من الحارس).
 */
(function (global) {
  'use strict';
  var Moves = global.HalbaBoxingMoves;
  var Profile = global.HalbaBoxingProfile;

  function BoxingTraining(opts) {
    opts = opts || {};
    this.onUpdate = opts.onUpdate || function () {};
    this.onFeedback = opts.onFeedback || function () {};
    this.move = opts.move || 'JAB';
    this.target = opts.target || 10;
    this.reset();
  }
  BoxingTraining.prototype.reset = function () {
    this.state = 'idle'; this.count = 0; this.halfAttempts = 0; this.wrongAttempts = 0;
    this.streak = 0; this.bestStreak = 0; this.startedAt = 0; this.elapsedMs = 0;
    this.validator = new Moves.MoveValidator(this.move);
    this.profile = Profile ? Profile.loadProfile() : null;
  };
  BoxingTraining.prototype.setMove = function (move) {
    this.move = move; this.validator = new Moves.MoveValidator(move);
    // تغيير الحركة يبدأ تدريباً جديداً عليها: يُصفَّر العداد والسلسلة.
    this.count = 0; this.halfAttempts = 0; this.wrongAttempts = 0;
    this.streak = 0; this.bestStreak = 0;
    this.onFeedback('الحركة الآن: ' + Moves.MOVE_NAMES_AR[move]);
    this._emit();
  };
  BoxingTraining.prototype.setTarget = function (n) { this.target = Math.max(1, n || 10); this._emit(); };
  BoxingTraining.prototype.start = function () {
    this.reset(); this.state = 'running'; this.startedAt = Date.now();
    this.onFeedback('ابدأ من الحارس، ثم نفّذ ' + Moves.MOVE_NAMES_AR[this.move]);
    this._emit();
  };
  BoxingTraining.prototype.stop = function () {
    if (this.state === 'running') {
      this.state = 'done'; this.elapsedMs = Date.now() - this.startedAt;
      if (this.profile && Profile) Profile.addXp(this.profile, this.count * 10); // XP_PER_REP=10 مثل القلب
    }
    this._emit();
  };
  BoxingTraining.prototype._emit = function () {
    var total = this.count + this.halfAttempts + this.wrongAttempts;
    this.onUpdate({
      state: this.state, move: this.move, target: this.target, count: this.count,
      halfAttempts: this.halfAttempts, wrongAttempts: this.wrongAttempts,
      streak: this.streak, bestStreak: this.bestStreak,
      accuracy: total ? Math.round(this.count / total * 100) : 100,
      elapsedMs: this.state === 'running' ? Date.now() - this.startedAt : this.elapsedMs,
      profile: this.profile
    });
  };
  BoxingTraining.prototype.feedLandmarks = function (lm, nowMs) {
    if (this.state !== 'running') return;
    var res = this.validator.feed(lm, nowMs || Date.now());
    if (res.status === 'valid') {
      this.count++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.onFeedback('✓ صحيحة! (' + this.count + '/' + this.target + ')');
      this.validator.reset();
      if (this.count >= this.target) { this.onFeedback('أكملت الهدف! ممتاز'); this.stop(); return; }
    } else if (res.status === 'rejected') {
      if (res.half) { this.halfAttempts++; this.streak = 0; this.onFeedback('✗ نصفية لا تُحسب: ' + res.reason); }
      else { this.wrongAttempts++; this.streak = 0; this.onFeedback('✗ ' + (res.reason || 'أعد من الحارس')); }
      this.validator.reset();
    } else if (res.status === 'peak') {
      this.onFeedback(res.reason);
    }
    this._emit();
  };
  BoxingTraining.prototype.trySimulatedMove = function (moveId, full) {
    if (this.state !== 'running') return { ok: false, reason: 'التدريب غير شغال' };
    if (moveId !== this.move) {
      // حركة خاطئة تُحسب (كانت تُتجاهل قبل الإصلاح).
      this.wrongAttempts++; this.streak = 0;
      this.onFeedback('✗ الحركة المطلوبة هي ' + Moves.MOVE_NAMES_AR[this.move]);
      this.validator.reset(); this._emit();
      return { ok: false, reason: 'الحركة المطلوبة هي ' + Moves.MOVE_NAMES_AR[this.move] };
    }
    var res = Moves.validateSequence(Moves.generateMoveFrames(moveId, full !== false), moveId);
    if (!res.valid) {
      this.halfAttempts++; this.streak = 0;
      this.onFeedback('✗ نصفية لا تُحسب: ' + res.reason);
      this.validator.reset(); this._emit();
      return { ok: false, reason: res.reason, half: true };
    }
    this.count++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.onFeedback('✓ صحيحة! (' + this.count + '/' + this.target + ')');
    this.validator.reset();
    if (this.count >= this.target) { this.onFeedback('أكملت الهدف! ممتاز'); this.stop(); return { ok: true, done: true }; }
    this._emit();
    return { ok: true };
  };

  var api = { BoxingTraining: BoxingTraining };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingTraining = api;
})(typeof window !== 'undefined' ? window : globalThis);
