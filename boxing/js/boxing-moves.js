/**
 * Halba — Boxing Moves / مانع الغش
 * وضع الملاكمة — التحقق من الحركات عبر نقاط الجسم (MediaPipe Pose، 33 نقطة).
 * 100% أصلي. لا تسجيل فيديو ولا رفع أبداً — كل المعالجة في المتصفح.
 *
 * فكرة مانع الغش لكل حركة:
 *   1) ابدأ من وضع الحارس (GUARD) — مرفقان مثنيان، قبضتان قريبتان من الذقن.
 *   2) الوصول إلى المدى الكامل (PEAK) — امتداد كامل للمرفق / قوس أفقي /
 *      صعود القبضة من الأسفل / إزاحة الرأس.
 *   3) العودة إلى الحارس (RETURN) خلال مهلة قصيرة.
 * حركة نصفية = بدأت ولم تصل إلى PEAK ثم عادت → تُرفض ولا تُحسب.
 * حركة بلا حارس أولاً، أو بلا عودة، أو بطيئة جداً → تُرفض أيضاً.
 *
 * أرقام النقاط (MediaPipe Pose):
 *  0 أنف، 11 كتف أيسر، 12 كتف أيمن، 13 مرفق أيسر، 14 مرفق أيمن،
 *  15 معصم أيسر، 16 معصم أيمن، 23 ورك أيسر، 24 ورك أيمن.
 * اليد اليمنى للمستخدم = المعصم 16 (اليد الأمامية / الجاب)،
 * اليد اليسرى = المعصم 15 (اليد الخلفية / الكروس).
 * يعمل في وضع الكاميرا وفي وضع المحاكاة بنفس الكود تماماً.
 */
(function (global) {
  'use strict';

  // تكامل مع القلب (js/repcounter.js): إن وُجد window.FitRep نستعمل
  // فهارسه ودالة زاويته، ولا ننسخها. وإلا نستعمل النسخة المستقلة هنا
  // (نفس فهارس MediaPipe القياسية) فيبقى وضع الملاكمة شغالاً وحده.
  var _FitRep = (typeof global !== 'undefined' && global.FitRep) || null;
  var LM = (_FitRep && _FitRep.LM) || { NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12, L_ELBOW: 13, R_ELBOW: 14, L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24 };

  var MOVE_NAMES_AR = {
    JAB: 'جاب', CROSS: 'كروس', HOOK: 'هوك', UPPERCUT: 'أبركت',
    SLIP: 'انزلاق', DODGE: 'تفادٍ', BLOCK: 'بلوك', BODY: 'لكمة للجسم'
  };
  // التقدم الأمامي الأدنى (z) للجاب/الكروس، مع هامش تمثيل عشري ثنائي:
  // -0.16 - -0.24 = 0.07999999999999999 في JS، فيجب ألا يُرفض تقدم
  // يساوي 0.08 بالضبط. الجاب الكامل الحقيقي يتقدم ~0.14، فالهامش آمن.
  var FWD_MIN_Z = 0.08;
  var FWD_EPS = 1e-6;
  var MOVE_DIGITS = { JAB: '1', CROSS: '2', HOOK: '3', UPPERCUT: '5', BODY: 'B' };
  var DIGIT_TO_MOVE = { '1': 'JAB', '2': 'CROSS', '3': 'HOOK', '5': 'UPPERCUT', 'B': 'BODY' };

  function dist(a, b) {
    if (!a || !b) return 0;
    var dx = (a.x || 0) - (b.x || 0), dy = (a.y || 0) - (b.y || 0), dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function angleAt(a, b, c) {
    if (_FitRep && typeof _FitRep.angleDeg === 'function') return _FitRep.angleDeg(a, b, c);
    // الزاوية عند b بين a-b-c بالدرجات، في 3D (x,y,z) — ضروري لأن
    // ثني المرفق في وضع الحارس يكون أساساً في العمق (z)، لا في الصورة 2D.
    if (!a || !b || !c) return 0;
    var v1x = (a.x || 0) - (b.x || 0), v1y = (a.y || 0) - (b.y || 0), v1z = (a.z || 0) - (b.z || 0);
    var v2x = (c.x || 0) - (b.x || 0), v2y = (c.y || 0) - (b.y || 0), v2z = (c.z || 0) - (b.z || 0);
    var d1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z), d2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);
    if (d1 === 0 || d2 === 0) return 0;
    var cos = (v1x * v2x + v1y * v2y + v1z * v2z) / (d1 * d2);
    cos = Math.max(-1, Math.min(1, cos));
    return Math.acos(cos) * 180 / Math.PI;
  }
  function cloneLm(lm) {
    return (lm || []).map(function (p) { return p ? { x: p.x || 0, y: p.y || 0, z: p.z || 0 } : { x: 0, y: 0, z: 0 }; });
  }

  /** مقاييس هندسية موحّدة من إطار نقاط واحد. */
  function computeMetrics(lm) {
    if (!lm || lm.length < 25) return null;
    var ls = lm[LM.L_SHOULDER], rs = lm[LM.R_SHOULDER];
    var le = lm[LM.L_ELBOW], re = lm[LM.R_ELBOW];
    var lw = lm[LM.L_WRIST], rw = lm[LM.R_WRIST];
    var nose = lm[LM.NOSE];
    if (!ls || !rs || !le || !re || !lw || !rw || !nose) return null;
    var shoulderWidth = Math.max(0.05, dist(ls, rs));
    var midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2, z: (ls.z + rs.z) / 2 };
    return {
      shoulderWidth: shoulderWidth,
      midShoulder: midShoulder,
      nose: nose,
      elbowAngleR: angleAt(rs, re, rw),
      elbowAngleL: angleAt(ls, le, lw),
      wristDistR: dist(rs, rw) / shoulderWidth, // امتداد الذراع اليمنى
      wristDistL: dist(ls, lw) / shoulderWidth, // امتداد الذراع اليسرى
      wristYR: rw.y, wristYL: lw.y,
      wristXR: rw.x, wristXL: lw.x,
      wristZR: rw.z, wristZL: lw.z,
      noseX: nose.x, noseY: nose.y,
      shoulderY: midShoulder.y
    };
  }

  /** هل الإطار في وضع الحارس؟ */
  function isGuard(m, opts) {
    opts = opts || {};
    if (!m) return false;
    var rOk = m.elbowAngleR >= 35 && m.elbowAngleR <= 85 && m.wristDistR >= 0.4 && m.wristDistR <= 1.15;
    var lOk = m.elbowAngleL >= 35 && m.elbowAngleL <= 85 && m.wristDistL >= 0.4 && m.wristDistL <= 1.15;
    // القبضتان قريبتان من خط الوسط / الذقن عمودياً (لا متدليتان ولا ممدودتان).
    var heightOk = Math.abs(m.wristYR - m.shoulderY) < 0.22 && Math.abs(m.wristYL - m.shoulderY) < 0.22;
    return rOk && lOk && heightOk;
  }

  /**
   * هل وصل الإطار إلى ذروة الحركة؟ يعيد {peak, score} — score من 0 إلى 1
   * يعبّر عن اكتمال المدى (1 = كامل). نصف الحركة تعطي score ~0.4-0.6.
   */
  function peakScore(lm, moveId, guard) {
    var m = computeMetrics(lm);
    if (!m || !guard) return { peak: false, score: 0, detail: 'لا توجد نقاط' };
    var sw = m.shoulderWidth;
    switch (moveId) {
      case 'JAB': {
        var ext = Math.min(1, Math.max(0, (m.wristDistR - 0.9) / (1.35 - 0.9)));
        var elb = Math.min(1, Math.max(0, (m.elbowAngleR - 70) / (155 - 70)));
        // الإزاحة الأمامية (z) — ضرورية: رفع الذراع جانبياً يمدّ المرفق
        // ويزيد المسافة، لكن z لا يتقدم، فيجب أن يُرفض. z في MediaPipe
        // سالب نحو الكاميرا، فالتقدم = نقصان z عن الحارس. العتبة 0.08
        // (نحو 0.5 × عرض الكتفين) — ذروة الجاب الكاملة تتقدم ~0.14.
        var fwd = Math.min(1, Math.max(0, ((guard.wristZR || 0) - m.wristZR) / FWD_MIN_Z));
        var s = (ext + elb + fwd) / 3;
        // الجاب الكامل يحتاج امتداداً + مرفقاً مفتوحاً + تقدماً أمامياً معاً.
        var full = m.wristDistR >= 1.35 && m.elbowAngleR >= 155 && ((guard.wristZR || 0) - m.wristZR) >= FWD_MIN_Z - FWD_EPS;
        return { peak: full, score: Math.round(s * 100) / 100, detail: 'امتداد ' + m.wristDistR.toFixed(2) + '، مرفق ' + Math.round(m.elbowAngleR) + '°، تقدم ' + (((guard.wristZR || 0) - m.wristZR)).toFixed(2) };
      }
      case 'CROSS': {
        var ext2 = Math.min(1, Math.max(0, (m.wristDistL - 0.9) / (1.35 - 0.9)));
        var elb2 = Math.min(1, Math.max(0, (m.elbowAngleL - 70) / (155 - 70)));
        // نفس فحص الاتجاه الأمامي لليد الخلفية (اليسرى).
        var fwd2 = Math.min(1, Math.max(0, ((guard.wristZL || 0) - m.wristZL) / FWD_MIN_Z));
        var s2 = (ext2 + elb2 + fwd2) / 3;
        var full2 = m.wristDistL >= 1.35 && m.elbowAngleL >= 155 && ((guard.wristZL || 0) - m.wristZL) >= FWD_MIN_Z - FWD_EPS;
        return { peak: full2, score: Math.round(s2 * 100) / 100, detail: 'امتداد ' + m.wristDistL.toFixed(2) + '، مرفق ' + Math.round(m.elbowAngleL) + '°، تقدم ' + (((guard.wristZL || 0) - m.wristZL)).toFixed(2) };
      }
      case 'HOOK': {
        var dx = Math.abs(m.wristXR - guard.wristXR) / sw;
        var dxScore = Math.min(1, dx / 0.45);
        var bent = (m.elbowAngleR >= 70 && m.elbowAngleR <= 135) ? 1 : 0.4;
        var s3 = Math.min(dxScore, bent);
        var full3 = dx >= 0.45 && m.elbowAngleR >= 70 && m.elbowAngleR <= 135 && m.wristDistR >= 0.85;
        return { peak: full3, score: Math.round(s3 * 100) / 100, detail: 'إزاحة أفقية ' + dx.toFixed(2) + '، مرفق ' + Math.round(m.elbowAngleR) + '°' };
      }
      case 'UPPERCUT': {
        var rise = ((guard.wristYR || m.wristYR) - m.wristYR) / sw; // موجب = صعود
        var riseScore = Math.min(1, Math.max(0, rise / 0.35));
        var elbU = Math.min(1, Math.max(0, (m.elbowAngleR - 70) / (130 - 70)));
        var s4 = Math.min(riseScore, Math.max(elbU, 0.6));
        var full4 = rise >= 0.35 && m.elbowAngleR >= 110 && m.wristYR <= m.shoulderY + 0.05;
        return { peak: full4, score: Math.round(s4 * 100) / 100, detail: 'صعود ' + rise.toFixed(2) + '، مرفق ' + Math.round(m.elbowAngleR) + '°' };
      }
      case 'BODY': {
        // لكمة للجسم: قبضة تنزل لمستوى الجذع ثم تمتد للأمام، مرفق مفتوح.
        var low = (m.wristYR - m.shoulderY) / sw; // موجب = منخفض
        var lowScore = Math.min(1, Math.max(0, low / 0.12));
        var extB = Math.min(1, Math.max(0, (m.wristDistR - 0.9) / (1.25 - 0.9)));
        var elbB = Math.min(1, Math.max(0, (m.elbowAngleR - 70) / (130 - 70)));
        var sB = (lowScore + extB + elbB) / 3;
        var fullB = low >= 0.12 && m.wristDistR >= 1.25 && m.elbowAngleR >= 130;
        return { peak: fullB, score: Math.round(sB * 100) / 100, detail: 'انخفاض ' + low.toFixed(2) + '، امتداد ' + m.wristDistR.toFixed(2) + '، مرفق ' + Math.round(m.elbowAngleR) + '°' };
      }
      case 'SLIP': {
        var sx = Math.abs(m.noseX - guard.noseX) / sw;
        var s5 = Math.min(1, sx / 0.32);
        var full5 = sx >= 0.32 && m.wristDistR <= 1.2 && m.wristDistL <= 1.2;
        return { peak: full5, score: Math.round(s5 * 100) / 100, detail: 'إزاحة رأس ' + sx.toFixed(2) };
      }
      case 'DODGE': {
        var dy = (m.noseY - guard.noseY) / sw; // موجب = نزول
        var sx2 = Math.abs(m.noseX - guard.noseX) / sw;
        var s6 = Math.min(1, Math.max(dy / 0.28, sx2 / 0.45));
        var full6 = (dy >= 0.28 || sx2 >= 0.45) && m.wristDistR <= 1.2 && m.wristDistL <= 1.2;
        return { peak: full6, score: Math.round(s6 * 100) / 100, detail: 'نزول ' + dy.toFixed(2) + '، إزاحة ' + sx2.toFixed(2) };
      }
      case 'BLOCK': {
        // بلوك = قبضتان عند الوجه ومرفقان مضمومان، مع ثبات.
        var near = m.wristDistR <= 1.0 && m.wristDistL <= 1.0;
        var tuck = m.elbowAngleR <= 85 && m.elbowAngleL <= 85;
        var s7 = (near && tuck) ? 1 : 0.3;
        return { peak: near && tuck, score: s7, detail: near ? 'حارس مرفوع' : 'القبضتان بعيدتان عن الوجه' };
      }
      default: return { peak: false, score: 0, detail: 'حركة غير معروفة' };
    }
  }

  /**
   * آلة حالات لحركة واحدة.
   * feed(lm, nowMs) -> {status, reason, peakScore}
   * status: 'arming' | 'armed' | 'peak' | 'valid' | 'rejected'
   * 'valid' تعني: حارس → ذروة كاملة → عودة للحارس. غير ذلك مرفوض.
   */
  function MoveValidator(moveId, opts) {
    this.moveId = moveId;
    this.opts = Object.assign({ guardFrames: 3, peakTimeoutMs: 3500, returnTimeoutMs: 1200, blockHoldMs: 500 }, opts || {});
    this.reset();
  }
  MoveValidator.prototype.reset = function () {
    this.phase = 'arming'; this.guardCount = 0; this.guard = null; this.returnStreak = 0;
    this.peakAt = 0; this.startAt = 0; this.bestScore = 0; this.blockSince = 0;
    this.lastResult = null;
  };
  MoveValidator.prototype.feed = function (lm, nowMs) {
    nowMs = nowMs || Date.now();
    var m = computeMetrics(lm);
    if (!m) return { status: this.phase, reason: 'لا توجد نقاط جسم', peakScore: 0 };
    if (this.phase === 'arming') {
      if (isGuard(m)) {
        this.guardCount++;
        this.guard = { noseX: m.noseX, noseY: m.noseY, wristXR: m.wristXR, wristXL: m.wristXL, wristYR: m.wristYR, wristYL: m.wristYL, wristZR: m.wristZR, wristZL: m.wristZL };
        if (this.guardCount >= this.opts.guardFrames) { this.phase = 'armed'; this.startAt = nowMs; }
        return { status: 'arming', reason: 'ثبّت وضع الحارس…', peakScore: 0 };
      }
      this.guardCount = 0;
      return { status: 'arming', reason: 'ابدأ من وضع الحارس: قبضتان عند الذقن', peakScore: 0 };
    }
    if (this.phase === 'armed') {
      if (nowMs - this.startAt > this.opts.peakTimeoutMs) {
        this.phase = 'rejected';
        this.lastResult = { valid: false, reason: 'انتهت المهلة قبل الوصول للمدى الكامل' };
        return { status: 'rejected', reason: this.lastResult.reason, peakScore: this.bestScore };
      }
      var ps = peakScore(lm, this.moveId, this.guard);
      this.bestScore = Math.max(this.bestScore, ps.score);
      if (this.moveId === 'BLOCK') {
        if (ps.peak) {
          if (!this.blockSince) this.blockSince = nowMs;
          if (nowMs - this.blockSince >= this.opts.blockHoldMs) {
            this.phase = 'valid'; this.lastResult = { valid: true, reason: 'بلوك صحيح — حارس مرفوع وثابت' };
            return { status: 'valid', reason: this.lastResult.reason, peakScore: 1 };
          }
          return { status: 'peak', reason: 'اثبت في البلوك…', peakScore: 1 };
        }
        this.blockSince = 0;
        return { status: 'armed', reason: 'ارفع قبضتيك للوجه', peakScore: ps.score };
      }
      if (ps.peak) { this.phase = 'peak'; this.peakAt = nowMs; return { status: 'peak', reason: 'وصلت الذروة — عُد للحارس', peakScore: ps.score }; }
      // عاد للحارس قبل الذروة = حركة نصفية — لكن إطار حارس واحد لا يكفي،
      // لأن الإطارات الوسطية في طريقها للذروة قد تبدو قريبة من الحارس.
      // نرفض فقط بعد إطارَي حارس متتاليين.
      if (isGuard(m) && this.bestScore > 0.05) {
        this.returnStreak++;
        if (this.returnStreak >= 2) {
          this.phase = 'rejected';
          this.lastResult = { valid: false, reason: 'حركة نصفية: المدى غير كامل (' + Math.round(this.bestScore * 100) + '%) — مدّ أكثر', half: true, peakScore: this.bestScore };
          return { status: 'rejected', reason: this.lastResult.reason, peakScore: this.bestScore, half: true };
        }
        return { status: 'armed', reason: 'نفّذ الحركة كاملة…', peakScore: ps.score };
      }
      this.returnStreak = 0;
      return { status: 'armed', reason: 'نفّذ الحركة كاملة…', peakScore: ps.score };
    }
    if (this.phase === 'peak') {
      if (isGuard(m)) {
        this.phase = 'valid';
        this.lastResult = { valid: true, reason: 'حركة كاملة صحيحة', peakScore: this.bestScore };
        return { status: 'valid', reason: this.lastResult.reason, peakScore: this.bestScore };
      }
      if (nowMs - this.peakAt > this.opts.returnTimeoutMs) {
        this.phase = 'rejected';
        this.lastResult = { valid: false, reason: 'وصلت الذروة لكن لم تعد للحارس في الوقت' };
        return { status: 'rejected', reason: this.lastResult.reason, peakScore: this.bestScore };
      }
      return { status: 'peak', reason: 'عُد للحارس…', peakScore: this.bestScore };
    }
    return { status: this.phase, reason: (this.lastResult && this.lastResult.reason) || '', peakScore: this.bestScore };
  };

  /** تحقق من تسلسل إطارات كامل (يُستخدم في الاختبار والمحاكاة). */
  function validateSequence(frames, moveId, opts) {
    var v = new MoveValidator(moveId, opts);
    var last = null;
    for (var i = 0; i < frames.length; i++) {
      last = v.feed(frames[i].lm, frames[i].t);
      if (last.status === 'valid' || last.status === 'rejected') break;
    }
    if (last && last.status === 'valid') return { valid: true, reason: last.reason, peakScore: last.peakScore || 0 };
    if (last && last.status === 'rejected') return { valid: false, reason: last.reason, peakScore: last.peakScore || 0, half: !!last.half };
    return { valid: false, reason: 'لم تكتمل الحركة: ' + (last ? last.reason : ''), peakScore: (last && last.peakScore) || 0 };
  }

  // ---- توليد نقاط اصطناعية للاختبار (نفس الهندسة، بلا كاميرا) ----
  function baseLandmarks() {
    var lm = [];
    for (var i = 0; i < 33; i++) lm.push({ x: 0.5, y: 0.5, z: 0 });
    lm[0] = { x: 0.5, y: 0.22, z: 0 };
    lm[11] = { x: 0.42, y: 0.35, z: 0 }; lm[12] = { x: 0.58, y: 0.35, z: 0 };
    lm[13] = { x: 0.38, y: 0.48, z: -0.05 }; lm[14] = { x: 0.62, y: 0.48, z: -0.05 };
    lm[15] = { x: 0.46, y: 0.36, z: -0.16 }; lm[16] = { x: 0.54, y: 0.36, z: -0.16 };
    lm[23] = { x: 0.44, y: 0.65, z: 0 }; lm[24] = { x: 0.56, y: 0.65, z: 0 };
    lm[25] = { x: 0.44, y: 0.82, z: 0 }; lm[26] = { x: 0.56, y: 0.82, z: 0 };
    return lm;
  }
  function guardLandmarks() { return baseLandmarks(); }
  function peakLandmarks(moveId) {
    var lm = baseLandmarks();
    if (moveId === 'JAB') { lm[16] = { x: 0.60, y: 0.34, z: -0.30 }; lm[14] = { x: 0.60, y: 0.35, z: -0.15 }; }
    if (moveId === 'CROSS') { lm[15] = { x: 0.40, y: 0.34, z: -0.30 }; lm[13] = { x: 0.40, y: 0.35, z: -0.15 }; lm[11] = { x: 0.44, y: 0.35, z: 0 }; }
    if (moveId === 'HOOK') { lm[16] = { x: 0.74, y: 0.34, z: -0.02 }; lm[14] = { x: 0.66, y: 0.42, z: -0.02 }; }
    if (moveId === 'UPPERCUT') { lm[16] = { x: 0.52, y: 0.16, z: -0.12 }; lm[14] = { x: 0.58, y: 0.32, z: -0.08 }; }
    if (moveId === 'SLIP') { lm[0] = { x: 0.60, y: 0.22, z: 0 }; }
    if (moveId === 'DODGE') { lm[0] = { x: 0.5, y: 0.30, z: 0 }; lm[11] = { x: 0.42, y: 0.42, z: 0 }; lm[12] = { x: 0.58, y: 0.42, z: 0 }; }
    if (moveId === 'BODY') { lm[16] = { x: 0.58, y: 0.52, z: -0.28 }; lm[14] = { x: 0.60, y: 0.42, z: -0.12 }; }
    if (moveId === 'BLOCK') { lm[15] = { x: 0.47, y: 0.28, z: -0.06 }; lm[16] = { x: 0.53, y: 0.28, z: -0.06 }; lm[13] = { x: 0.40, y: 0.42, z: -0.02 }; lm[14] = { x: 0.60, y: 0.42, z: -0.02 }; }
    return lm;
  }
  /**
   * رفع جانبي للذراع (اختبار مانع الغش): ذراع ممدودة تماماً جانباً —
   * الامتداد ≥ 1.35 والمرفق ~180° (كان يُحسب جاباً/كروساً قبل إصلاح
   * الاتجاه الأمامي)، لكن z لا يتقدم إطلاقاً عن الحارس، فيجب أن يُرفض.
   */
  function sidewaysRaiseLandmarks(moveId) {
    var lm = baseLandmarks();
    if (moveId === 'CROSS') {
      lm[15] = { x: 0.18, y: 0.35, z: -0.16 }; lm[13] = { x: 0.30, y: 0.35, z: -0.08 };
    } else { // JAB (الافتراضي) — اليد اليمنى جانباً
      lm[16] = { x: 0.82, y: 0.35, z: -0.16 }; lm[14] = { x: 0.70, y: 0.35, z: -0.08 };
    }
    return lm;
  }
  function generateSidewaysFrames(moveId) {
    var g = guardLandmarks(), p = sidewaysRaiseLandmarks(moveId);
    var frames = [], t = 0;
    function push(lm) { frames.push({ lm: cloneLm(lm), t: t }); t += 100; }
    push(g); push(g); push(g);
    push(lerpLandmarks(g, p, 0.5)); push(p); push(p);
    push(g); push(g); push(g);
    return frames;
  }
  function lerpLandmarks(a, b, t) {
    var out = [];
    for (var i = 0; i < 33; i++) {
      var pa = a[i] || { x: 0.5, y: 0.5, z: 0 }, pb = b[i] || pa;
      out.push({ x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t, z: pa.z + (pb.z - pa.z) * t });
    }
    return out;
  }
  /** إطارات: حارس ×3 → ذروة (كاملة أو نصفية) → حارس. */
  function generateMoveFrames(moveId, full) {
    var g = guardLandmarks(), p = peakLandmarks(moveId);
    var frac = full ? 1 : 0.45;
    var mid = lerpLandmarks(g, p, frac);
    var frames = [], t = 0;
    function push(lm) { frames.push({ lm: cloneLm(lm), t: t }); t += 100; }
    push(g); push(g); push(g);
    push(lerpLandmarks(g, p, frac * 0.5)); push(mid); push(mid);
    push(g); push(g); push(g);
    if (moveId === 'BLOCK' && full) { // البلوك يحتاج ثباتاً أطول (≥500ms)
      for (var i = 0; i < 7; i++) push(mid);
      push(g); push(g);
    }
    return frames;
  }

  var api = {
    LM: LM, MOVE_NAMES_AR: MOVE_NAMES_AR, MOVE_DIGITS: MOVE_DIGITS, DIGIT_TO_MOVE: DIGIT_TO_MOVE,
    computeMetrics: computeMetrics, isGuard: isGuard, peakScore: peakScore,
    MoveValidator: MoveValidator, validateSequence: validateSequence,
    guardLandmarks: guardLandmarks, peakLandmarks: peakLandmarks,
    sidewaysRaiseLandmarks: sidewaysRaiseLandmarks, generateSidewaysFrames: generateSidewaysFrames,
    lerpLandmarks: lerpLandmarks, generateMoveFrames: generateMoveFrames
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingMoves = api;
})(typeof window !== 'undefined' ? window : globalThis);
