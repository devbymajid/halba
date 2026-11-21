/**
 * Halba — Boxing Match / مباراة ملاكمة 1v1 مصنّفة (60 ثانية)
 * أوامر: JAB / HOOK / UPPERCUT / SLIP / DODGE — تظهر على الشاشة،
 * والكاميرا تتحقق عبر MoveValidator (حارس → مدى كامل → عودة للحارس).
 * البوت يهاجم دورياً: أي انزلاق أو تفادٍ صحيح أثناء نافذة الهجوم
 * يتفادى الضربة — بمدقق دفاعي مستقل عن الأمر الحالي، لأن اللاعب
 * قد يكون مأموراً بلكمة حين يهاجم البوت. الفوز/الخسارة/التعادل
 * يحدّث ELO وXP. الانسحاب من مباراة مصنفة = خسارة (لا تعادل).
 * المباراة المصنفة تتطلب ملفاً (اسم + كود) قبل البدء.
 */
(function (global) {
  'use strict';
  var Moves = global.HalbaBoxingMoves;
  var Profile = global.HalbaBoxingProfile;

  var COMMAND_POOL = ['JAB', 'HOOK', 'UPPERCUT', 'SLIP', 'DODGE'];
  var DAMAGE = { JAB: 7, CROSS: 9, HOOK: 10, UPPERCUT: 13, BODY: 11, SLIP: 0, DODGE: 0, BLOCK: 0 };
  var BOT_NAMES = ['بوت الحلبة', 'بوت الظل', 'بوت النيون'];

  function BoxingMatch(opts) {
    opts = opts || {};
    this.onUpdate = opts.onUpdate || function () {};
    this.onCommand = opts.onCommand || function () {};
    this.onFeedback = opts.onFeedback || function () {};
    this.onEnd = opts.onEnd || function () {};
    this.durationMs = opts.durationMs || 60000;
    this.botElo = opts.botElo || 1000;
    this.botName = opts.botName || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    // ملف يُحقن من الخارج (اختبار / قلب) يقدَّم على التخزين المحلي.
    this.profileOverride = opts.profile || null;
    this.reset();
  }
  BoxingMatch.prototype.reset = function () {
    this.state = 'idle'; this.playerHp = 100; this.botHp = 100;
    this.timeLeftMs = this.durationMs; this.hits = 0; this.halfAttempts = 0; this.dodges = 0;
    this.currentCommand = null; this.validator = null; this.commandExpiresAt = 0;
    this.botAttackAt = 0; this.botAttackActive = false; this.botAttackExpiresAt = 0;
    this.defenseValidators = null; // مدققان مستقلان: SLIP و DODGE أثناء هجوم البوت
    this.lastGuardLm = null; // آخر إطار حارس (لتسبيق تسلح المدققين الدفاعيين)
    this.lastGuardAt = 0; // ساعة حائط (Date.now) لحداثة لقطة الحارس
    this.timerId = null; this.startedAt = 0; this.lastTick = 0;
    this.profile = this.profileOverride ? Object.assign({}, this.profileOverride) : (Profile ? Profile.loadProfile() : null);
  };
  BoxingMatch.prototype._emit = function () {
    this.onUpdate({
      state: this.state, playerHp: this.playerHp, botHp: this.botHp,
      timeLeftMs: Math.max(0, this.timeLeftMs), hits: this.hits, halfAttempts: this.halfAttempts,
      dodges: this.dodges, command: this.currentCommand, botAttackActive: this.botAttackActive,
      botName: this.botName, botElo: this.botElo, profile: this.profile
    });
  };
  BoxingMatch.prototype._nextCommand = function () {
    var move = COMMAND_POOL[Math.floor(Math.random() * COMMAND_POOL.length)];
    this.currentCommand = move;
    this.validator = new Moves.MoveValidator(move);
    this.commandExpiresAt = Date.now() + 3000;
    this.onCommand(move);
    this._emit();
  };
  BoxingMatch.prototype.start = function () {
    if (this.state === 'running') return true;
    this.reset();
    // مباراة مصنفة بلا ملف (اسم أو كود فارغ) لا تبدأ — سجّل أولاً.
    if (!this.profile || !String(this.profile.name || '').trim() || !String(this.profile.code || this.profile.codeHash || '').trim()) {
      this.onFeedback('سجّل ملفك أولاً — الاسم والكود مطلوبان للمباراة المصنفة');
      this._emit();
      return false;
    }
    this.state = 'running'; this.startedAt = Date.now(); this.lastTick = Date.now();
    this.botAttackAt = Date.now() + 5000;
    var self = this;
    this._nextCommand();
    this.timerId = setInterval(function () { self._tick(); }, 100);
    this._emit();
    return true;
  };
  BoxingMatch.prototype.stop = function (reason) {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    // الانسحاب من مباراة مصنفة = خسارة دائماً (forfeit)، مهما كانت
    // النتيجة لحظتها. لا تعادل بالانسحاب — وإلا كان الانسحاب طريقاً
    // للهروب من خسارة ELO. المعامل reason يُتجاهل عمداً لهذا السبب.
    if (this.state === 'running') { this.state = 'over'; this._finish('loss'); }
    this._emit();
  };
  BoxingMatch.prototype._tick = function () {
    if (this.state !== 'running') return;
    var now = Date.now();
    this.timeLeftMs = this.durationMs - (now - this.startedAt);
    if (this.timeLeftMs <= 0) { this.timeLeftMs = 0; this.state = 'over'; this._finish(this.playerHp === this.botHp ? 'draw' : this.playerHp > this.botHp ? 'win' : 'loss'); return; }
    // انتهاء الأمر بلا تنفيذ: البوت يردّ بضربة خفيفة.
    if (this.currentCommand && now > this.commandExpiresAt) {
      this.playerHp = Math.max(0, this.playerHp - 5);
      this.onFeedback('انتهى وقت الأمر — البوت ردّ عليك (−5)');
      if (this.playerHp <= 0) { this.state = 'over'; this._finish('loss'); return; }
      this._nextCommand();
    }
    // هجوم البوت الدوري.
    if (!this.botAttackActive && now >= this.botAttackAt) {
      this.botAttackActive = true; this.botAttackExpiresAt = now + 1400;
      this._armDefense();
      this.onFeedback('⚠ هجوم البوت! نفّذ SLIP أو DODGE الآن لتتفاداه');
      this._emit();
    }
    if (this.botAttackActive && now > this.botAttackExpiresAt) {
      this.botAttackActive = false;
      this._clearDefense();
      this.playerHp = Math.max(0, this.playerHp - 8);
      this.onFeedback('البوت أصابك (−8) — تفادَ في المرة القادمة');
      this.botAttackAt = now + 3500 + Math.random() * 2000;
      if (this.playerHp <= 0) { this.state = 'over'; this._finish('loss'); return; }
    }
    this._emit();
  };
  BoxingMatch.prototype._finish = function (result) {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
    this.state = 'over'; this.result = result;
    var rec = null;
    if (this.profile && Profile) {
      rec = Profile.recordMatch(this.profile, result, this.botElo);
      this.profile = rec.profile;
      // XP إضافي عن كل إصابة ناجحة.
      Profile.addXp(this.profile, this.hits * 5);
    }
    this.onEnd({ result: result, playerHp: this.playerHp, botHp: this.botHp, hits: this.hits, halfAttempts: this.halfAttempts, dodges: this.dodges, elo: rec ? rec.elo : null, xpBonus: rec ? rec.xp : 0, profile: this.profile });
    this._emit();
  };
  /** مدقق دفاعي مستقل: SLIP و DODGE أثناء نافذة هجوم البوت، مهما كان الأمر الحالي. */
  BoxingMatch.prototype._armDefense = function () {
    this.defenseValidators = {
      SLIP: new Moves.MoveValidator('SLIP'),
      DODGE: new Moves.MoveValidator('DODGE')
    };
    // تسبيق التسلح بلقطة الحارس الأخيرة (حديثة ≤1000ms): مدققا الدفاع
    // يحتاجان 3 إطارات حارس قبل قبول أي انزلاق، وانزلاق يبدأ فوراً مع
    // التحذير كان يضيع في تلك الإطارات. اللاعب يكون غالباً في الحارس
    // بين الأوامر، فلقطة الحارس الأخيرة مرجع صحيح هنا.
    if (this.lastGuardLm && (Date.now() - this.lastGuardAt) <= 1000) {
      var nowMs = Date.now();
      var self = this;
      ['SLIP', 'DODGE'].forEach(function (k) {
        var v = self.defenseValidators[k];
        v.feed(self.lastGuardLm, nowMs);
        v.feed(self.lastGuardLm, nowMs + 1);
        v.feed(self.lastGuardLm, nowMs + 2);
      });
    }
  };
  BoxingMatch.prototype._clearDefense = function () { this.defenseValidators = null; };
  BoxingMatch.prototype._dodgeBotAttack = function () {
    if (!this.botAttackActive) return false;
    this.botAttackActive = false;
    this._clearDefense();
    this.dodges++;
    this.botAttackAt = Date.now() + 3500 + Math.random() * 2000;
    this.onFeedback('تفادٍ ناجح! لم يصبك البوت');
    return true;
  };
  /** يغذي المدققين الدفاعيين بإطار؛ يعيد true إن تم التفادي بهذا الإطار. */
  BoxingMatch.prototype._feedDefense = function (lm, nowMs) {
    if (!this.botAttackActive || !this.defenseValidators) return false;
    var keys = ['SLIP', 'DODGE'];
    for (var i = 0; i < keys.length; i++) {
      var res = this.defenseValidators[keys[i]].feed(lm, nowMs);
      if (res.status === 'valid') return this._dodgeBotAttack();
      if (res.status === 'rejected') this.defenseValidators[keys[i]].reset();
    }
    return false;
  };
  /** تغذية إطار نقاط من الكاميرا (المسار الحقيقي). */
  BoxingMatch.prototype.feedLandmarks = function (lm, nowMs) {
    if (this.state !== 'running') return;
    nowMs = nowMs || Date.now();
    // احتفظ بآخر إطار حارس — مرجع تسبيق تسلح المدققين الدفاعيين.
    // نسخة لا مرجع: مصفوفة التنعيم في المتعقب تُعاد كتابتها كل إطار.
    var m0 = Moves.computeMetrics(lm);
    if (m0 && Moves.isGuard(m0)) {
      this.lastGuardLm = lm.map(function (p) { return { x: p.x || 0, y: p.y || 0, z: p.z || 0 }; });
      this.lastGuardAt = Date.now();
    }
    // تفادي هجوم البوت أولاً بأي حركة دفاعية صحيحة — مستقل عن الأمر الحالي.
    this._feedDefense(lm, nowMs);
    if (!this.validator || !this.currentCommand) return;
    var res = this.validator.feed(lm, nowMs);
    if (res.status === 'valid') {
      this._applyValidMove(this.currentCommand);
    } else if (res.status === 'rejected') {
      if (res.half) { this.halfAttempts++; this.onFeedback('حركة نصفية لا تُحسب: ' + res.reason); }
      else this.onFeedback(res.reason || 'أعد الحركة من الحارس');
      this.validator.reset();
      // بعد رفض، نعيد نفس الأمر بمهلة جديدة قصيرة إن بقي وقت.
      this.commandExpiresAt = Date.now() + 2500;
    }
  };
  BoxingMatch.prototype._applyValidMove = function (move) {
    if (move === 'SLIP' || move === 'DODGE') {
      if (this.botAttackActive) {
        // التفادي سُجّل غالباً عبر المدقق الدفاعي؛ إن لم يكن، سجّله هنا
        // (ولا نعدّه مرتين: _dodgeBotAttack يعيد false إن انتهى الهجوم).
        if (!this._dodgeBotAttack()) this.onFeedback('تفادٍ صحيح — لكن لا هجوم الآن');
      } else {
        this.onFeedback('تفادٍ صحيح — لكن لا هجوم الآن');
      }
    } else {
      var dmg = DAMAGE[move] || 7;
      this.botHp = Math.max(0, this.botHp - dmg);
      this.hits++;
      this.onFeedback(Moves.MOVE_NAMES_AR[move] + ' صحيحة! −' + dmg + ' من صحة البوت');
      if (this.botHp <= 0) { this.state = 'over'; this._finish('win'); return; }
    }
    this.currentCommand = null; this.validator = null;
    if (this.state === 'running') this._nextCommand();
  };
  /** محاكاة حركة (بلا كاميرا): نفس التحقق عبر تسلسل نقاط اصطناعية. */
  BoxingMatch.prototype.trySimulatedMove = function (moveId, full) {
    if (this.state !== 'running' || !this.currentCommand) return { ok: false, reason: 'لا يوجد أمر نشط' };
    // تفادٍ دفاعي أثناء هجوم البوت — مستقل عن الأمر الحالي، ولا يستهلكه.
    if (this.botAttackActive && (moveId === 'SLIP' || moveId === 'DODGE')) {
      var defRes = Moves.validateSequence(Moves.generateMoveFrames(moveId, full !== false), moveId);
      if (defRes.valid) {
        this._dodgeBotAttack();
        return { ok: true, dodged: true, reason: 'تفادٍ ناجح! لم يصبك البوت' };
      }
      return { ok: false, reason: defRes.reason, half: !!defRes.half };
    }
    var res = Moves.validateSequence(Moves.generateMoveFrames(moveId, full !== false), moveId);
    if (!res.valid) {
      if (moveId !== this.currentCommand) return { ok: false, reason: 'الأمر المطلوب هو ' + Moves.MOVE_NAMES_AR[this.currentCommand] + ' وليس ' + Moves.MOVE_NAMES_AR[moveId] };
      this.halfAttempts++; this.onFeedback('حركة نصفية لا تُحسب: ' + res.reason);
      this.validator.reset(); this.commandExpiresAt = Date.now() + 2500;
      return { ok: false, reason: res.reason, half: true };
    }
    if (moveId !== this.currentCommand) return { ok: false, reason: 'الأمر المطلوب هو ' + Moves.MOVE_NAMES_AR[this.currentCommand] };
    this._applyValidMove(moveId);
    return { ok: true, reason: 'حركة كاملة صحيحة' };
  };

  var api = { BoxingMatch: BoxingMatch, COMMAND_POOL: COMMAND_POOL, DAMAGE: DAMAGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
