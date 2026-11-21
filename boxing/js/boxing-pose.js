/**
 * Halba — Boxing Pose Tracker / تتبّع الكاميرا
 * MediaPipe Pose عبر CDN، مجاني، في المتصفح فقط.
 * خصوصية: الفيديو لا يُسجَّل ولا يُرفَع أبداً. الصورة تُمرَّر إلى MediaPipe
 * محلياً وتُرمى فوراً؛ لا نرسل أي إطار لأي خادم. إيقاف الكاميرا يوقف البث نهائياً.
 *
 * التكامل مع القلب (js/pose.js) — مثيل واحد مشترك، ولا كاميرتين.
 * العقد الموثَّق من القلب الحقيقي (قُرئ مباشرة من devbymajid/halba،
 * js/pose.js، 2026-11-21):
 *   FitPose.PoseTracker(videoEl, canvasEl, callbacks) — دالة مُنشئ تعيد
 *   { start, stop, pause, resume, inject, running }؛ والـ callbacks
 *   { onLandmarks(landmarks|null, ts), onStatus(status, detail) } تُمرَّر
 *   في المُنشئ وتُثبَّت في الإغلاق — لا توجد setCallbacks ولا subscribe
 *   في القلب. Tasks Vision 0.10.14، pose_landmarker_lite، GPU مع
 *   fallback CPU، runningMode VIDEO، numPoses 1، ثقة 0.5.
 *
 * لذلك الدمج الصحيح هو fan-out عند الإنشاء (لا حقن لاحق):
 *   1) أنشئ متعقب الملاكمة أولاً (بلا كاميرا):
 *        var boxing = HalbaBoxingPose.createPoseTracker({ onLandmarks, onStatus });
 *   2) أنشئ مثيل القلب الواحد بـ callbacks موحدة تشمل الطرفين:
 *        var core = new FitPose.PoseTracker(videoEl, canvasEl,
 *          HalbaBoxingPose.PoseTracker.createSharedCallbacks(coreCallbacks, boxing.getCallbacks()));
 *   3) أعلِم الملاكمة أن المثيل موصول أصلاً:
 *        HalbaBoxingPose.PoseTracker.setSharedTracker(core, { wired: true });
 *   4) await boxing.initCamera(videoEl) — يعيد true بوضع 'core-shared'،
 *      بلا كاميرا ثانية؛ وawait core.start() يشغّل الكاميرا والكشف.
 *   كل طرف يتلقى كل إطار؛ وخطأ معالِج أحد الطرفين لا يُسكت الطرف الآخر
 *   (كل استدعاء محمي بـ try/catch داخل createSharedCallbacks).
 *
 * إن حُقن مثيل مشترك بلا {wired:true} يحاول initCamera الاشتراك عبر
 * setCallbacks ثم subscribe ثم on/addListener — وإن لم يوجد أي مسار
 * اشتراك يرفض بصوت عالٍ (false + وضع 'core-pending' + رسالة صريحة)،
 * ولا يدّعي أبداً أن الكاميرا مشتركة وهي لا تصلها نقاط.
 * MediaPipe 0.5 باقٍ كبديل مستقل فقط حين لا يوجد قلب إطلاقاً.
 * حتى ذلك الحين (ملاكمة مستقلة وحدها) يعمل هذا الملف وحده.
 * إن لم تتوفر الكاميرا / MediaPipe: وضع المحاكاة ولوحة المفاتيح يمرّان
 * بنفس مسار التحقق (نفس MoveValidator) حتى يعمل كل شيء بلا كاميرا.
 */
(function (global) {
  'use strict';
  var POSE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js';
  var CAMERA_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('تعذّر تحميل ' + src)); };
      document.head.appendChild(s);
    });
  }

  function PoseTracker(opts) {
    opts = opts || {};
    this.onLandmarks = opts.onLandmarks || function () {};
    this.onStatus = opts.onStatus || function () {};
    this.mode = 'idle'; // idle | camera | simulated | core-shared | core-pending
    this.pose = null; this.camera = null; this.stream = null;
    this.smoothed = null; this.video = null;
    this.sharedTracker = null;
    this._sharedUnsubscribe = null;
  }
  // مثيل القلب المشترك الواحد — يُحقن مرة واحدة عند الدمج.
  PoseTracker._shared = null;
  // true إن أُنشئ المثيل المشترك أصلاً بـ createSharedCallbacks التي
  // تشمل الملاكمة — أي أن النقاط تصلها أصلاً ولا حاجة لاشتراك جديد.
  PoseTracker._sharedWired = false;
  /**
   * حقن مثيل القلب المشترك. opts.wired=true تعني: المثيل أُنشئ بـ
   * createSharedCallbacks(coreCallbacks, boxing.getCallbacks())، فالنقاط
   * تصل الملاكمة أصلاً عبر الـ callbacks الموحدة — لا اشتراك لاحق.
   * بلا wired يحاول initCamera الاشتراك (setCallbacks/subscribe/on)،
   * ويرفض بصوت عالٍ إن لم يوجد أي مسار اشتراك.
   */
  PoseTracker.setSharedTracker = function (tracker, opts) {
    PoseTracker._shared = tracker || null;
    PoseTracker._sharedWired = !!(opts && opts.wired);
  };
  PoseTracker.clearSharedTracker = function () { PoseTracker._shared = null; PoseTracker._sharedWired = false; };
  PoseTracker.getSharedTracker = function () { return PoseTracker._shared; };
  /**
   * Fan-out للدمج: تعيد callbacks موحدة تمرر كل إطار وكل حالة إلى
   * الطرفين (القلب + الملاكمة). كل استدعاء محمي بـ try/catch حتى لا
   * يُسكت خطأ معالِج أحد الطرفين الطرف الآخر. تُستعمل هكذا:
   *   new FitPose.PoseTracker(videoEl, canvasEl,
   *     PoseTracker.createSharedCallbacks(coreCallbacks, boxing.getCallbacks()))
   * فمثيل القلب الواحد يغذي الطرفين معاً، بلا كاميرا ثانية وبلا
   * حاجة إلى setCallbacks (غير موجودة في القلب الحقيقي).
   */
  PoseTracker.createSharedCallbacks = function (coreCallbacks, boxingCallbacks) {
    function call(fn, args) { try { if (typeof fn === 'function') fn.apply(null, args); } catch (e) {} }
    return {
      onLandmarks: function (lm, ts) {
        call(coreCallbacks && coreCallbacks.onLandmarks, [lm, ts]);
        call(boxingCallbacks && boxingCallbacks.onLandmarks, [lm, ts]);
      },
      onStatus: function (s, detail) {
        call(coreCallbacks && coreCallbacks.onStatus, [s, detail]);
        call(boxingCallbacks && boxingCallbacks.onStatus, [s, detail]);
      }
    };
  };
  PoseTracker.hasCoreTracker = function () {
    return !!(PoseTracker._shared || (typeof global !== 'undefined' && global.FitPose && global.FitPose.PoseTracker));
  };
  /** مصنع: يرجع متعقباً يستعمل المثيل المشترك إن وُجد، وإلا متعقباً محلياً. */
  function createPoseTracker(opts) {
    var t = new PoseTracker(opts);
    if (PoseTracker._shared) t.sharedTracker = PoseTracker._shared;
    return t;
  }
  /**
   * callbacks الملاكمة كما يجب أن تُمرَّر إلى مثيل القلب عند إنشائه
   * (عبر createSharedCallbacks): تنعيم الإطارات ثم تمريرها إلى
   * onLandmarks الخاص بهذا المتعقب. الإطارات الفارغة (null = لا جسم
   * في الإطار) تُمرَّر كما هي بلا تنعيم.
   */
  PoseTracker.prototype.getCallbacks = function () {
    var self = this;
    return {
      onLandmarks: function (lm, ts) {
        if (!lm || lm.length < 33) { self.onLandmarks(lm, ts); return; }
        self.onLandmarks(self._smooth(lm), ts);
      },
      onStatus: function (s, detail) { self.onStatus(s, detail); }
    };
  };
  /**
   * محاولة الاشتراك في مثيل مشترك حُقن بلا wired: setCallbacks ثم
   * subscribe ثم on/addListener. تعيد اسم المسار الناجح، أو null إن
   * لم يوجد أي مسار — وعندها يجب أن يرفض initCamera بصوت عالٍ.
   * (القلب الحقيقي بلا أيٍّ منها: callbacks تُمرَّر في مُنشئه فقط.)
   */
  PoseTracker.prototype._attachShared = function (shared) {
    var self = this;
    function lmFn(lm, ts) {
      if (!lm || lm.length < 33) { self.onLandmarks(lm, ts); return; }
      self.onLandmarks(self._smooth(lm), ts);
    }
    function stFn(s, detail) { self.onStatus(s, detail); }
    var cbs = { onLandmarks: lmFn, onStatus: stFn };
    if (shared && typeof shared.setCallbacks === 'function') {
      try { shared.setCallbacks(cbs); return 'setCallbacks'; } catch (e) {}
    }
    if (shared && typeof shared.subscribe === 'function') {
      try {
        var unsub = shared.subscribe(cbs);
        if (typeof unsub === 'function') this._sharedUnsubscribe = unsub;
        return 'subscribe';
      } catch (e) {}
    }
    if (shared && typeof shared.on === 'function') {
      try { shared.on('landmarks', lmFn); shared.on('status', stFn); return 'on'; } catch (e) {}
    }
    if (shared && typeof shared.addListener === 'function') {
      try { shared.addListener('landmarks', lmFn); shared.addListener('status', stFn); return 'addListener'; } catch (e) {}
    }
    return null;
  };
  PoseTracker.prototype._smooth = function (lm) {
    if (!this.smoothed) { this.smoothed = lm.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0 }; }); return this.smoothed; }
    for (var i = 0; i < lm.length; i++) {
      this.smoothed[i].x = this.smoothed[i].x * 0.5 + lm[i].x * 0.5;
      this.smoothed[i].y = this.smoothed[i].y * 0.5 + lm[i].y * 0.5;
      this.smoothed[i].z = (this.smoothed[i].z || 0) * 0.5 + (lm[i].z || 0) * 0.5;
    }
    return this.smoothed;
  };
  PoseTracker.prototype.initCamera = async function (videoEl) {
    this.video = videoEl;
    // مثيل مشترك محقون من القلب: لا كاميرا ثانية — نستعمله هو.
    var shared = this.sharedTracker || PoseTracker._shared;
    if (shared) {
      // موصول أصلاً عبر createSharedCallbacks: النقاط تصل الملاكمة
      // عبر الـ callbacks الموحدة — لا اشتراك جديد ولا كاميرا ثانية.
      if (PoseTracker._sharedWired) {
        this.mode = 'core-shared';
        this.onStatus('الكاميرا مشتركة مع القلب — مثيل واحد (FitPose) أُنشئ بـ createSharedCallbacks، بلا كاميرا ثانية');
        return true;
      }
      // وإلا حاول الاشتراك؛ وإن لم يوجد أي مسار اشتراك فارفض بصوت
      // عالٍ — لا تدّعِ أبداً أن الكاميرا مشتركة وهي لا تصلها نقاط.
      var method = this._attachShared(shared);
      if (method) {
        this.mode = 'core-shared';
        this.onStatus('الكاميرا مشتركة مع القلب — مثيل واحد (FitPose)، اشتراك عبر ' + method + '، بلا كاميرا ثانية');
        return true;
      }
      this.mode = 'core-pending';
      this.onStatus('خطأ: المتعقب المشترك لا يقبل الاشتراك (بلا setCallbacks/subscribe/on) — أنشئ مثيل القلب بـ PoseTracker.createSharedCallbacks أو أضف setCallbacks إلى FitPose؛ الكاميرا لم تُفتح');
      return false;
    }
    // تتبع القلب موجود لكن بلا مثيل محقون: لا نفتح كاميرا ثانية أبداً.
    if (typeof global !== 'undefined' && global.FitPose && global.FitPose.PoseTracker) {
      this.mode = 'core-pending';
      this.onStatus('تتبع القلب (FitPose) موجود — احقن مثيله المشترك عبر PoseTracker.setSharedTracker قبل تشغيل الكاميرا');
      return false;
    }
    try {
      await loadScript(POSE_CDN);
      await loadScript(CAMERA_CDN);
      if (!window.Pose) throw new Error('MediaPipe Pose غير متاح');
      var self = this;
      this.pose = new window.Pose({ locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/' + f; } });
      this.pose.setOptions({ modelComplexity: 0, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      this.pose.onResults(function (res) {
        if (res.poseLandmarks && res.poseLandmarks.length >= 33) {
          self.onLandmarks(self._smooth(res.poseLandmarks), Date.now());
        }
      });
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      videoEl.srcObject = this.stream;
      await videoEl.play();
      this.camera = new window.Camera(videoEl, {
        onFrame: async function () { try { await self.pose.send({ image: videoEl }); } catch (e) {} },
        width: 640, height: 480
      });
      this.camera.start();
      this.mode = 'camera';
      this.onStatus('الكاميرا شغالة — قف في وضع الحارس');
      return true;
    } catch (e) {
      this.mode = 'simulated';
      this.onStatus('تعذّرت الكاميرا (' + e.message + ') — انتقلنا لوضع المحاكاة بلا كاميرا');
      return false;
    }
  };
  PoseTracker.prototype.stop = function () {
    // المثيل المشترك يملكه القلب — لا نوقفه من هنا، فقط نلغي اشتراكنا.
    if (this.mode === 'core-shared') {
      if (typeof this._sharedUnsubscribe === 'function') { try { this._sharedUnsubscribe(); } catch (e) {} }
      this._sharedUnsubscribe = null;
      this.mode = 'idle'; this.smoothed = null; this.onStatus('توقفت عن الاستماع للمثيل المشترك (الكاميرا بيد القلب)'); return; }
    try { if (this.camera) this.camera.stop(); } catch (e) {}
    try { if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    if (this.video) { try { this.video.srcObject = null; } catch (e) {} }
    this.mode = 'idle'; this.smoothed = null;
    this.onStatus('الكاميرا متوقفة');
  };
  /** محاكاة حركة كاملة/نصفية عبر نفس إطارات النقاط التي يستخدمها الاختبار. */
  PoseTracker.prototype.simulateMove = function (moveId, full) {
    var self = this;
    var Moves = global.HalbaBoxingMoves;
    if (!Moves) return Promise.resolve(false);
    this.mode = 'simulated';
    this.smoothed = null; // تمهيد واحد: المحاكاة تبدأ بلا تنعيم متبقٍ من الكاميرا
    var frames = Moves.generateMoveFrames(moveId, full !== false);
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        if (i >= frames.length) { self.onStatus('انتهت محاكاة ' + (Moves.MOVE_NAMES_AR[moveId] || moveId)); return resolve(true); }
        self.onLandmarks(frames[i].lm, Date.now());
        i++;
        setTimeout(step, 100);
      })();
    });
  };
  /** رسم الهيكل على canvas فوق الفيديو (اختياري، للعرض فقط). */
  PoseTracker.prototype.drawSkeleton = function (canvas, lm) {
    if (!canvas || !lm) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var pairs = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [0, 11], [0, 12]];
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3;
    ctx.beginPath();
    pairs.forEach(function (pr) {
      var a = lm[pr[0]], b = lm[pr[1]];
      if (a && b) { ctx.moveTo(a.x * canvas.width, a.y * canvas.height); ctx.lineTo(b.x * canvas.width, b.y * canvas.height); }
    });
    ctx.stroke();
    ctx.fillStyle = '#ff2e88';
    lm.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2); ctx.fill(); });
  };

  var api = { PoseTracker: PoseTracker, createPoseTracker: createPoseTracker, createSharedCallbacks: PoseTracker.createSharedCallbacks, POSE_CDN: POSE_CDN, CAMERA_CDN: CAMERA_CDN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingPose = api;
})(typeof window !== 'undefined' ? window : globalThis);
