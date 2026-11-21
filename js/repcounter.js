// حلبة v1 — عدّاد التكرارات (منطق نقي، بلا DOM).
// يعمل في المتصفح (window.FitRep) وفي Node (module.exports) للاختبار.
// القاعدة: التكرار الكامل فقط يُحتسب — نزول كامل ثم صعود حتى الاستقامة.
// آلة حالات مع تأكيد بعدّة إطارات متتالية + حدّ أدنى زمني بين التكرارات
// لمنع العدّ المزدوج من اهتزاز الكشف.
// مانع الغش (مواصفة أساسية، قرار المستخدم 2026-11-21): العدّ يعتمد كلياً
// على زوايا نقاط الجسم (landmarks) — والزوايا لا تتغير بتحريك الهاتف،
// فحركة الهاتف وحدها لا تُحسب أبداً. للضغط يُشترط أيضاً استقامة الجسم
// (زاوية الكتف-الورك-الكاحل ≥ 150°): انكسار الاستقامة أثناء التكرار
// يُبطل التكرار الجاري. وإذا خرج الجسم من الإطار (10 إطارات متتالية
// بلا نقاط) يُلغى التكرار الجاري ويتوقف العدّ حتى يعود الجسم.
// نقطة توصيل v1.1 (الملاكمة): هذا الملف هو وحدة النقاط/مانع الغش
// المشتركة — كاشف حركات الملاكمة (js/moves.js لاحقاً) يعيد استعمال
// المصدَّرات نفسها (LM + angleDeg + jointAngle) ونفس أنماط التأكيد
// (إطارات متتالية + حدّ أدنى زمني + مزلاج العودة للأعلى)، ولا ينسخها.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FitRep = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // فهارس نقاط MediaPipe Pose (33 نقطة).
  var LM = {
    L_SHOULDER: 11, R_SHOULDER: 12,
    L_ELBOW: 13, R_ELBOW: 14,
    L_WRIST: 15, R_WRIST: 16,
    L_HIP: 23, R_HIP: 24,
    L_KNEE: 25, R_KNEE: 26,
    L_ANKLE: 27, R_ANKLE: 28
  };

  // الزاوية (بالدرجات) عند النقطة b بين a-b-c.
  function angleDeg(a, b, c) {
    var v1x = a.x - b.x, v1y = a.y - b.y;
    var v2x = c.x - b.x, v2y = c.y - b.y;
    var d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (!d) return null;
    var cos = (v1x * v2x + v1y * v2y) / d;
    if (cos > 1) cos = 1;
    if (cos < -1) cos = -1;
    return Math.acos(cos) * 180 / Math.PI;
  }

  // تعريف التمارين: المفاصل المقاسة + عتبتا الأعلى/الأسفل.
  // ضغط: زاوية المرفق — مستقيم ~170-180° في الأعلى، ~70-90° في الأسفل.
  //   + فحص استقامة الجسم (plank): زاوية الكتف-الورك-الكاحل — الجسم
  //   المستقيم ~170-180°؛ ترهّل الورك أو تقوّسه ينزلها بوضوح.
  //   plankMin=150° يسمح بهامش اهتزاز الكشف ويمنع الوضعيات المكسورة.
  //   إذا لم تُقَس الاستقامة (نقاط غير مرئية) لا يُحظر العدّ — المرفق
  //   وحده يبقى البوابة؛ الفحص يُبطل فقط ما يُقاس مكسوراً.
  // سكوات: زاوية الركبة — مستقيم ~170-180° في الأعلى، ~70-100° في الأسفل.
  var EXERCISES = {
    pushup: {
      label: 'ضغط',
      joints: [
        ['L_SHOULDER', 'L_ELBOW', 'L_WRIST'],
        ['R_SHOULDER', 'R_ELBOW', 'R_WRIST']
      ],
      up: 160, down: 100,
      plank: [
        ['L_SHOULDER', 'L_HIP', 'L_ANKLE'],
        ['R_SHOULDER', 'R_HIP', 'R_ANKLE']
      ],
      plankMin: 150
    },
    squat: {
      label: 'سكوات',
      joints: [
        ['L_HIP', 'L_KNEE', 'L_ANKLE'],
        ['R_HIP', 'R_KNEE', 'R_ANKLE']
      ],
      up: 160, down: 110
    }
  };

  // متوسّط زاوية المفصل من الجانبين المتاحين (وضوح >= 0.5).
  // يعيد { angle: number|null, visible: boolean }.
  function jointAngle(lm, cfg) {
    var sum = 0, n = 0;
    for (var i = 0; i < cfg.joints.length; i++) {
      var j = cfg.joints[i];
      var a = lm[LM[j[0]]], b = lm[LM[j[1]]], c = lm[LM[j[2]]];
      if (!a || !b || !c) continue;
      if ((a.visibility == null ? 1 : a.visibility) < 0.5) continue;
      if ((b.visibility == null ? 1 : b.visibility) < 0.5) continue;
      if ((c.visibility == null ? 1 : c.visibility) < 0.5) continue;
      var ang = angleDeg(a, b, c);
      if (ang == null) continue;
      sum += ang; n++;
    }
    if (!n) return { angle: null, visible: false };
    return { angle: sum / n, visible: true };
  }

  // opts: confirmFrames (افتراضي 3 — إطارات متتالية لتأكيد الانتقال)،
  // minRepMs (افتراضي 500 — أقل زمن بين تكرارين محسوبين).
  function createRepCounter(exercise, opts) {
    opts = opts || {};
    var confirmFrames = opts.confirmFrames || 3;
    var minRepMs = opts.minRepMs || 500;
    var cfg = EXERCISES[exercise] || EXERCISES.pushup;

    var state = 'up'; // 'up' | 'down' — 'mid' منطقة وسطى لا تؤكد انتقالاً
    var pending = null, pendingCount = 0;
    var reps = 0, lastRepAt = 0, lostFrames = 0, lastAngle = null;
    var plankBreakCount = 0, lastPlank = null, lastPlankOk = true;
    var needsUp = false; // مزلاج بعد إبطال تكرار: لا يبدأ نزول جديد حتى يعود اللاعب للأعلى
    var LOST_LIMIT = 10; // إطارات متتالية بلا نقاط = الجسم خارج الإطار

    function feed(lm, nowMs) {
      nowMs = (nowMs == null ? Date.now() : nowMs);
      var res = jointAngle(lm, cfg);
      if (res.angle === null) {
        lostFrames++;
        if (lostFrames >= LOST_LIMIT) {
          // الجسم خارج الإطار: يُلغى التكرار الجاري — لا يُحتسب صعود
          // بعده إلا بعد نزول كامل جديد (والمزلاج يمنع تسليح نزول
          // واللاعب ما زال في الأسفل لحظة عودته).
          state = 'up'; pending = null; pendingCount = 0; plankBreakCount = 0;
          needsUp = true;
        }
        return { reps: reps, state: state, angle: lastAngle, tracking: lostFrames < LOST_LIMIT, counted: false, plank: lastPlank, plankOk: lastPlankOk };
      }
      lostFrames = 0;
      lastAngle = res.angle;
      // فحص استقامة الجسم (ضغط فقط): يُقاس إن أمكن، ويُحظر العدّ فقط
      // إذا قيس مكسوراً بوضوح.
      var plankOk = true;
      if (cfg.plank) {
        var pr = jointAngle(lm, { joints: cfg.plank });
        if (pr.visible) {
          lastPlank = pr.angle;
          plankOk = pr.angle >= cfg.plankMin;
        }
      }
      lastPlankOk = plankOk;
      // انكسار الاستقامة أثناء النزول يُبطل التكرار الجاري (بعد تأكيد
      // بعدّة إطارات متتالية حتى لا يقتله اهتزاز إطار واحد).
      if (state === 'down') {
        if (!plankOk) {
          plankBreakCount++;
          if (plankBreakCount >= confirmFrames) {
            state = 'up'; pending = null; pendingCount = 0; plankBreakCount = 0;
            needsUp = true; // لا نزول جديد حتى عودة كاملة للأعلى
          }
        } else {
          plankBreakCount = 0;
        }
      } else {
        plankBreakCount = 0;
      }
      var zone = res.angle >= cfg.up ? 'up' : (res.angle <= cfg.down ? 'down' : 'mid');
      var counted = false;
      if (needsUp) {
        // بعد إبطال (الحالة 'up'): لا انتقال حتى عودة كاملة للأعلى —
        // وإلا فإن اللاعب الذي بقي في الأسفل بعد الإبطال يسلّح نزولاً
        // جديداً ويُحتسب صعوده كتكرار من نفس الحركة المبطلة.
        if (zone === 'up') needsUp = false;
        pending = null; pendingCount = 0;
      } else if (zone === state || zone === 'mid') {
        // نفس الحالة أو المنطقة الوسطى: لا انتقال، ويُصفَّر الانتظار
        // (إطارات متتالية فقط تؤكد — هذا ما يمنع عدّ أنصاف التكرارات
        // التي تحوم قرب العتبة).
        pending = null; pendingCount = 0;
      } else {
        if (pending === zone) pendingCount++;
        else { pending = zone; pendingCount = 1; }
        if (pendingCount >= confirmFrames) {
          if (state === 'down' && zone === 'up' && plankOk && nowMs - lastRepAt >= minRepMs) {
            reps++;
            lastRepAt = nowMs;
            counted = true;
          }
          state = zone;
          pending = null; pendingCount = 0;
        }
      }
      return { reps: reps, state: state, angle: res.angle, tracking: true, counted: counted, plank: lastPlank, plankOk: plankOk };
    }

    return {
      feed: feed,
      get reps() { return reps; },
      get state() { return state; },
      get angle() { return lastAngle; },
      get plank() { return lastPlank; },
      get plankOk() { return lastPlankOk; },
      get exercise() { return cfg.label; },
      setExercise: function (ex) {
        cfg = EXERCISES[ex] || EXERCISES.pushup;
        state = 'up'; pending = null; pendingCount = 0; lastAngle = null;
        plankBreakCount = 0; lastPlank = null; lastPlankOk = true;
        needsUp = false;
      },
      // محاكاة (وضع التدريب بلا كاميرا فقط): تكرار مباشر بنيّة المستخدم.
      simulateRep: function (nowMs) {
        nowMs = (nowMs == null ? Date.now() : nowMs);
        if (nowMs - lastRepAt < minRepMs) return { reps: reps, counted: false };
        reps++;
        lastRepAt = nowMs;
        return { reps: reps, counted: true };
      },
      reset: function () {
        reps = 0; lastRepAt = 0; state = 'up';
        pending = null; pendingCount = 0; lostFrames = 0; lastAngle = null;
        plankBreakCount = 0; lastPlank = null; lastPlankOk = true;
        needsUp = false;
      }
    };
  }

  return {
    LM: LM,
    EXERCISES: EXERCISES,
    angleDeg: angleDeg,
    jointAngle: jointAngle,
    createRepCounter: createRepCounter
  };
});
