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
    this.pose = null; this.stream = null;
    this._gen = 0; // جيل التشغيل: stop() يزيده، فيلغي أي تشغيل قيد التنفيذ
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
  PoseTracker.prototype._initCameraInner = async function (videoEl) {
    this.video = videoEl;
    // D3 + D5: إيقاف أثناء تشغيل قيد التنفيذ كان يترك الكاميرا مشغّلة،
    // ثم تبيّن أن تنظيف البدء البالي يدمّر البث الحي: كان يعمل على
    // this.stream وthis.mode المشتركين، لا على بث ذلك البدء. فبدء
    // ملغى يتسوى متأخراً (بعد أن صار بدء جديد حياً) كان يعيد كتابة
    // this.stream ببثه ثم يصفّره، أو يوقف بث البدء الحي من catch.
    // القاعدة الآن: البث المُكتسب يبقى متغيراً محلياً (acquired)،
    // وفحص الجيل يأتي قبل إسناده إلى this.stream، والتنظيف يوقف
    // البث المحلي فقط، ولا يمسّ this.stream/mode إلا إن كانا ما
    // زالا يخصّان هذا البدء (الجيل لم يتغيّر).
    var gen = this._gen;
    var self = this;
    function stoppedMidStart(localStream) {
      if (self._gen === gen) return false;
      if (localStream) { try { localStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {} }
      return true;
    }
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
    // متصفحات داخل التطبيقات (متصفح داخل تطبيق، WebView) غالباً
    // ما كتوفرش الكاميرا إطلاقاً — نكشفها قبل ما نطلب أي إذن،
    // والرسالة كتوضّح الحل: فتح الصفحة في Safari/Chrome.
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this.mode = 'simulated';
      this.onStatus('هاد المتصفح ما كيدعمش الكاميرا — حل الصفحة في Safari (ولا Chrome) وعاود؛ انتقلنا لوضع المحاكاة بلا كاميرا');
      return false;
    }
    var acquired = null; // البث الذي حصل عليه هذا البدء وحده (D5)
    try {
      await loadScript(POSE_CDN);
      if (stoppedMidStart(null)) return false;
      if (!window.Pose) throw new Error('MediaPipe Pose غير متاح');
      this.pose = new window.Pose({ locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/' + f; } });
      this.pose.setOptions({ modelComplexity: 0, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      this.pose.onResults(function (res) {
        if (res.poseLandmarks && res.poseLandmarks.length >= 33) {
          self.onLandmarks(self._smooth(res.poseLandmarks), Date.now());
        }
      });
      // طلب إذن واحد فقط، بكاميرا أمامية، وحلقة requestAnimationFrame
      // بدل Camera من camera_utils (لي كان كيطلب إذناً ثانياً وكيسبب
      // الفشل في iOS). الفيديو muted + playsInline باش iOS يقبل التشغيل.
      acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      // فحص الجيل قبل الإسناد: بدء ملغى يتسوى متأخراً لا يعيد كتابة
      // this.stream (قد يكون بث بدء جديد حي) ولا يصفّره.
      if (stoppedMidStart(acquired)) return false;
      this.stream = acquired;
      videoEl.srcObject = this.stream;
      try { videoEl.muted = true; videoEl.playsInline = true; } catch (e) {}
      await videoEl.play();
      if (stoppedMidStart(acquired)) return false;
      var loop = async function () {
        if (!self.stream) return;
        try { await self.pose.send({ image: videoEl }); } catch (e) {}
        if (self.stream) self._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
      this.mode = 'camera';
      this.onStatus('الكاميرا شغالة — قف في وضع الحارس');
      return true;
    } catch (e) {
      // نظّف بث هذا البدء وحده. وإن كان الجيل تغيّر (بدء جديد صار
      // حياً)، لا تمسّ this.stream/mode إطلاقاً: فشل play() المتأخر
      // لبدء بالٍ كان يقتل الكاميرا الحية ويقلب الوضع إلى محاكاة.
      if (acquired) { try { acquired.getTracks().forEach(function (t) { t.stop(); }); } catch (e2) {} }
      if (self._gen === gen) {
        if (self.stream === acquired) self.stream = null;
        self.mode = 'simulated';
        self.onStatus(cameraErrorMessage(e) + ' — انتقلنا لوضع المحاكاة بلا كاميرا');
      }
      return false;
    }
  };
  /**
   * حارس إعادة الدخول: نقرة مزدوجة على زر التشغيل (واردة على الهاتف)
   * أو استدعاءان متزامنان كانا يفتحان بثين — الأول يُعاد كتابته في
   * this.stream بلا إيقاف. إن كانت الكاميرا شغالة نعيد true فوراً،
   * وإن كان تشغيل قيد التنفيذ نعيد نفس الوعد، فلا يُطلب الإذن مرتين.
   */
  PoseTracker.prototype.initCamera = function (videoEl) {
    var self = this;
    if (self.mode === 'camera' && self.stream) {
      self.onStatus('الكاميرا شغالة — قف في وضع الحارس');
      return Promise.resolve(true);
    }
    if (self._starting) return self._starting;
    // D4: الـ .then كان يصفّر _starting بلا شرط، فيمحو وعد بدء أحدث
    // (بدء A ← إيقاف ← بدء B ← تسوية A تمحو وعد B ← بدء C يفتح بثاً
    // ثالثاً ويترك بث B يتيماً). نصفّره فقط إن كان ما زال وعد هذا البدء.
    // ونعيد الوعد الخام نفسه لكل المتصلين (لا مشتقاً جديداً في كل
    // استدعاء)، مع ربط التنظيف عليه منفصلاً.
    var p = self._starting = self._initCameraInner(videoEl);
    p.then(function () { if (self._starting === p) self._starting = null; }, function () { if (self._starting === p) self._starting = null; });
    return p;
  };
  /** رسالة واضحة حسب سبب فشل الكاميرا، بدل رسالة تقنية مبهمة. */
  function cameraErrorMessage(e) {
    var name = (e && e.name) || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'ما تعطاتش الإذن للكاميرا — عطي الإذن من إعدادات المتصفح وعاود';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'ما لقيناش كاميرا فهاد الجهاز';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'الكاميرا مستعملة من تطبيق آخر — سكّر التطبيقات لي مستعملة الكاميرا وعاود';
    if (name === 'OverconstrainedError') return 'الكاميرا ما كتدعمش هاد الإعدادات';
    return 'تعذّرت الكاميرا (' + (e && e.message ? e.message : 'خطأ غير معروف') + ')';
  }
  PoseTracker.prototype.stop = function () {
    // يلغي أي تشغيل قيد التنفيذ: _initCameraInner يتحقق من الجيل بعد
    // كل await ويوقف أي بث حصل عليه بعد الضغطة.
    this._gen = (this._gen || 0) + 1;
    this._starting = null;
    // المثيل المشترك يملكه القلب — لا نوقفه من هنا، فقط نلغي اشتراكنا.
    if (this.mode === 'core-shared') {
      if (typeof this._sharedUnsubscribe === 'function') { try { this._sharedUnsubscribe(); } catch (e) {} }
      this._sharedUnsubscribe = null;
      this.mode = 'idle'; this.smoothed = null; this.onStatus('توقفت عن الاستماع للمثيل المشترك (الكاميرا بيد القلب)'); return; }
    try { if (this._raf) cancelAnimationFrame(this._raf); } catch (e) {}
    this._raf = null;
    try { if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    this.stream = null;
    if (this.video) { try { this.video.srcObject = null; } catch (e) {} }
    this.mode = 'idle'; this.smoothed = null;
    this.onStatus('الكاميرا متوقفة');
  };
  /** محاكاة حركة كاملة/نصفية عبر نفس إطارات النقاط التي يستخدمها الاختبار. */
  PoseTracker.prototype.simulateMove = function (moveId, full) {
    var self = this;
    // المحاكاة أثناء تشغيل الكاميرا كانت تتداخل نقاطها مع نقاط الكاميرا
    // الحقيقية بلا إيقاف البث — ممنوعة الآن حتى يوقف المستخدم الكاميرا.
    // وتشمل بدءاً قيد التنفيذ (الوضع ما زال idle) حتى لا تبدأ المحاكاة
    // في ثانية البدء ثم تختلط بنقاط الكاميرا بعد اكتمالها.
    if (this.mode === 'camera' || this.mode === 'core-shared' || this._starting) {
      this.onStatus('المحاكاة معطلة أثناء تشغيل الكاميرا — أوقف الكاميرا أولاً');
      return Promise.resolve(false);
    }
    var Moves = global.HalbaBoxingMoves;
    if (!Moves) return Promise.resolve(false);
    this.mode = 'simulated';
    this.smoothed = null; // تمهيد واحد: المحاكاة تبدأ بلا تنعيم متبقٍ من الكاميرا
    var frames = Moves.generateMoveFrames(moveId, full !== false);
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        // P8: محاكاة بدأت قبل تشغيل الكاميرا كانت تستمر في إرسال
        // إطاراتها بعد أن تصبح الكاميرا حية، فتختلط بنقاطها. نتحقق
        // في كل خطوة: إن تغيّر الوضع (الكاميرا شغالة) نتوقف فوراً.
        if (self.mode !== 'simulated') { self.onStatus('توقفت المحاكاة — الكاميرا شغالة'); return resolve(false); }
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

  var api = { PoseTracker: PoseTracker, createPoseTracker: createPoseTracker, createSharedCallbacks: PoseTracker.createSharedCallbacks, POSE_CDN: POSE_CDN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.HalbaBoxingPose = api;
})(typeof window !== 'undefined' ? window : globalThis);
