// حلبة v1 — تتبّع الجسم بالكاميرا (MediaPipe PoseLandmarker عبر CDN).
// المسار: Tasks Vision ‏0.10.14 + نموذج pose_landmarker_lite — يعمل كله
// على الجهاز. الفيديو لا يُسجَّل ولا يُرفع أبداً.
// إن فشل تحميل النموذج (بلا إنترنت) أو رُفضت الكاميرا، يُبلَّغ الخطأ
// للواجهة لتقديم وضع المحاكاة (تدريب فقط).
(function (root) {
  'use strict';

  var VISION_VERSION = '0.10.14';
  var VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VISION_VERSION + '/vision_bundle.mjs';
  var WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VISION_VERSION + '/wasm';
  var MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  // وصلات الهيكل العظمي (MediaPipe Pose — ‏35 وصلة).
  var CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
    [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
    [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
  ];
  var UPPER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

  var landmarkerPromise = null;
  var landmarker = null;

  function loadLandmarker() {
    if (landmarker) return Promise.resolve(landmarker);
    if (landmarkerPromise) return landmarkerPromise;
    landmarkerPromise = (async function () {
      var vision = await import(/* webpackIgnore: true */ VISION_URL);
      var fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      var opts = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      };
      try {
        landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts);
      } catch (e) {
        // معالج GPU غير متاح على بعض الأجهزة — أعد المحاولة بالمعالج العادي.
        opts.baseOptions.delegate = 'CPU';
        landmarker = await vision.PoseLandmarker.createFromOptions(fileset, opts);
      }
      return landmarker;
    })();
    landmarkerPromise.catch(function () { landmarkerPromise = null; });
    return landmarkerPromise;
  }

  // PoseTracker: يدير الكاميرا + الكشف + رسم الهيكل على canvas.
  // callbacks: onLandmarks(landmarks|null, ts) — كل إطار؛
  // onStatus('loading'|'camera'|'tracking'|'lost'|'error', detail).
  function PoseTracker(videoEl, canvasEl, callbacks) {
    var ctx = canvasEl.getContext('2d');
    var stream = null;
    var rafId = null;
    var lastVideoTime = -1;
    var running = false;
    var paused = false; // إيقاف مؤقت للكشف (للاختبار: لقطات بلا تشبع الخيط)
    var lastLandmarks = null;

    function drawFrame(landmarks) {
      var w = canvasEl.width, h = canvasEl.height;
      ctx.clearRect(0, 0, w, h);
      // خلفية داكنة + شبكة خفيفة (تظهر قبل تشغيل الفيديو أو مع الحقن).
      ctx.fillStyle = '#150829';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (var gx = 0; gx < w; gx += 28) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
      for (var gy = 0; gy < h; gy += 28) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
      if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
        // مرآة: الفيديو معكوس أفقياً حتى يبدو طبيعياً للمستخدم.
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.restore();
      }
      if (!landmarks) return;
      // النقاط معكوسة أفقياً لتطابق الفيديو المعكوس.
      function px(p) { return { x: (1 - p.x) * w, y: p.y * h, v: (p.visibility == null ? 1 : p.visibility) }; }
      for (var i = 0; i < CONNECTIONS.length; i++) {
        var a = landmarks[CONNECTIONS[i][0]], b = landmarks[CONNECTIONS[i][1]];
        if (!a || !b) continue;
        if ((a.visibility == null ? 1 : a.visibility) < 0.4) continue;
        if ((b.visibility == null ? 1 : b.visibility) < 0.4) continue;
        var pa = px(a), pb = px(b);
        var upper = UPPER.indexOf(CONNECTIONS[i][0]) >= 0 && UPPER.indexOf(CONNECTIONS[i][1]) >= 0;
        ctx.strokeStyle = upper ? '#FF2E88' : '#00E5FF';
        ctx.lineWidth = 3;
        ctx.shadowColor = upper ? '#FF2E88' : '#00E5FF';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (var j = 0; j < landmarks.length; j++) {
        var p = landmarks[j];
        if ((p.visibility == null ? 1 : p.visibility) < 0.4) continue;
        var pp = px(p);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = UPPER.indexOf(j) >= 0 ? '#FF2E88' : '#00E5FF';
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    function loop() {
      if (!running) return;
      rafId = requestAnimationFrame(loop);
      if (paused) return; // الهيكل الأخير يبقى مرسوماً على canvas
      if (videoEl.readyState < 2 || !landmarker) { drawFrame(lastLandmarks); return; }
      if (videoEl.currentTime === lastVideoTime) { drawFrame(lastLandmarks); return; }
      lastVideoTime = videoEl.currentTime;
      var res = null;
      try {
        res = landmarker.detectForVideo(videoEl, performance.now());
      } catch (e) { /* إطار تالف — تجاهله */ }
      var lm = (res && res.landmarks && res.landmarks.length) ? res.landmarks[0] : null;
      lastLandmarks = lm;
      drawFrame(lm);
      if (callbacks.onLandmarks) callbacks.onLandmarks(lm, performance.now());
    }

    function status(s, detail) {
      if (callbacks.onStatus) callbacks.onStatus(s, detail);
    }

    return {
      // يبدأ الكاميرا + النموذج. يعيد Promise يُرفض برسالة خطأ عربية.
      start: async function () {
        status('loading');
        var lm;
        try {
          lm = await loadLandmarker();
        } catch (e) {
          status('error', 'تعذّر تحميل نموذج التتبّع — تحقق من الإنترنت ثم أعد المحاولة.');
          throw new Error('model-load-failed');
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          status('error', 'هذا المتصفح لا يدعم الكاميرا.');
          throw new Error('no-getusermedia');
        }
        status('camera');
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
          });
        } catch (e) {
          status('error', 'رُفض الوصول إلى الكاميرا — اسمح بالكاميرا من إعدادات المتصفح ثم أعد المحاولة.');
          throw new Error('camera-denied');
        }
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        await videoEl.play().catch(function () {});
        canvasEl.width = videoEl.videoWidth || 640;
        canvasEl.height = videoEl.videoHeight || 480;
        running = true;
        status('tracking');
        loop();
      },
      stop: function () {
        running = false;
        paused = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        if (stream) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          stream = null;
        }
        videoEl.srcObject = null;
        lastLandmarks = null;
      },
      // إيقاف/استئناف الكشف فقط (الكاميرا تبقى مشغّلة) — للاختبار.
      pause: function () { paused = true; },
      resume: function () { paused = false; },
      // حقن نقاط محاكاة (للاختبار): يرسم الهيكل ويمررها لمسار العدّ نفسه.
      inject: function (landmarks) {
        lastLandmarks = landmarks;
        drawFrame(landmarks);
        if (callbacks.onLandmarks) callbacks.onLandmarks(landmarks, performance.now());
      },
      get running() { return running; }
    };
  }

  root.FitPose = {
    PoseTracker: PoseTracker,
    loadLandmarker: loadLandmarker,
    CONNECTIONS: CONNECTIONS,
    MODEL_URL: MODEL_URL,
    VISION_URL: VISION_URL
  };
})(typeof self !== 'undefined' ? self : this);
