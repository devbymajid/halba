# تكامل الملاكمة مع القلب — ملاحظات (2026-11-21 ~19:07 CET)

قريتها من القلب لي تخلق فالريبو devbymajid/halba، بلا ما نبدل والو فيه.
القلب IN PROGRESS عند موسى عبد المجيد — ما نلمسوش ملفاتو.

## واجهات القلب لي خاص الملاكمة تستعملها، بلا ما تعاود تكتبها
- `js/repcounter.js` — `window.FitRep`: `LM` (فهارس نقاط MediaPipe، 33 نقطة)، `angleDeg(a,b,c)`، `jointAngle`. نقطة توصيل v1.1 مذكورة فالملف نفسه: كاشف حركات الملاكمة (`js/moves.js` لاحقا) يعيد استعمال نفس المصدّرات ونفس أنماط التأكيد (إطارات متتالية + حد أدنى زمني + مزلاج العودة للأعلى)، ولا ينسخها.
- `js/pose.js` — `FitPose.PoseTracker(videoEl, canvasEl, callbacks)`: `onLandmarks(landmarks|null, ts)` كل إطار، `onStatus('loading'|'camera'|'tracking'|'lost'|'error', detail)`. MediaPipe PoseLandmarker عبر CDN، Tasks Vision 0.10.14، نموذج pose_landmarker_lite، GPU مع fallback CPU. الفيديو لا يسجل ولا يرفع أبدا.
- `js/app.js` — `GAME_NAME='حلبة'`، `ARENA_NAME='نزال'`، `VERSION='1.0.0'`، `MATCH_SECONDS=60`، `XP_PER_REP=10`، `XP_WIN_BONUS=50`. `Store = window.FitStore.Store`، `Elo`، `Levels`، `Daily`، `MIN_AGE`.
- ملفات القلب: `index.html`، `css/style.css`، `js/app.js`، `js/bot.js`، `js/pose.js`، `js/repcounter.js`، `js/store.js`.

## ما صُلّح في الملاكمة بعد المراجعة المستقلة 2026-11-21 ~19:14 (بلا دفع، بلا TEAM-LOG)
- `boxing-profile.js` صار يستعمل صيغة القلب للمستوى (`100*L*(L-1)/2`)، ويستعمل `FitStore.Levels.levelForXp` / `xpForLevel` إن وُجدا عند الدمج. الكود صار هاش SHA-256 + ملح فقط (`codeHash`)، لا نص عادي — وعند الدمج يُستبدل بملف القلب كاملاً.
- `boxing-pose.js` صار جاهزاً للمثيل الواحد: `PoseTracker.setSharedTracker(مثيل_القلب)` + `createPoseTracker()`؛ إن وُجد `FitPose` بلا مثيل محقون يرفض `initCamera` فتح كاميرا ثانية. MediaPipe 0.5 باقٍ كبديل مستقل فقط حين لا يوجد قلب.
- **العيب 5 أُغلق بعد المراجعة الثانية (~19:24):** العقد الحقيقي موثَّق — `FitPose.PoseTracker(videoEl, canvasEl, callbacks)`، والـ callbacks تُمرَّر في المُنشئ وتُثبَّت في الإغلاق، بلا `setCallbacks` ولا `subscribe`. الدمج الصحيح fan-out عند الإنشاء: `PoseTracker.createSharedCallbacks(coreCallbacks, boxing.getCallbacks())` تُمرَّر إلى مُنشئ القلب، فيغذي مثيل واحد الطرفين؛ ثم `setSharedTracker(core, { wired: true })` و`initCamera` تعيد `true` بوضع `core-shared`. وإن حُقن مثيل بلا أي مسار اشتراك يرفض `initCamera` بصوت عالٍ (`false` + وضع `core-pending` + رسالة صريحة)، ولا يدّعي أبداً أن الكاميرا مشتركة وهي لا تصلها نقاط. اختبارات جديدة تحاكي متعقب القلب الحقيقي بأمانة (مُنشئ + callbacks، بلا `setCallbacks`) — انظر `test/boxing-moves.test.js` (صارت 41 فحصاً، كلها ناجحة).
- `boxing-match.js`: تفادٍ دفاعي مستقل عن الأمر الحالي؛ الانسحاب = خسارة؛ المباراة المصنفة تتطلب ملفاً.
- `boxing-moves.js`: الجاب/الكروس يتطلبان تقدماً أمامياً z ≥ 0.08.

## ما بقي يحتاج قراراً من عبد المجيد / موسى القلب قبل الدمج
1. **واجهة `FitPose.PoseTracker` — أُغلقت من جهة الملاكمة (لا قرار قلب مطلوب):** قُرئ `js/pose.js` الحقيقي من الريبو: `PoseTracker(videoEl, canvasEl, callbacks)` — مُنشئ يعيد `{ start, stop, pause, resume, inject, running }`؛ `callbacks = { onLandmarks(landmarks|null, ts), onStatus(status, detail) }`؛ Tasks Vision 0.10.14، `pose_landmarker_lite`، GPU مع fallback CPU، `runningMode: 'VIDEO'`، `numPoses: 1`، ثقة 0.5. الدمج يتم في كود الدمج (لا تغيير في ملفات القلب):
   ```js
   var boxing = HalbaBoxingPose.createPoseTracker({ onLandmarks, onStatus }); // بلا كاميرا
   var core = new FitPose.PoseTracker(videoEl, canvasEl,
     HalbaBoxingPose.PoseTracker.createSharedCallbacks(coreCallbacks, boxing.getCallbacks()));
   HalbaBoxingPose.PoseTracker.setSharedTracker(core, { wired: true });
   await boxing.initCamera(videoEl); // true — 'core-shared'، بلا كاميرا ثانية
   await core.start();               // يشغّل الكاميرا والكشف للطرفين
   ```
   البديل الوحيد إن أراد القلب `setCallbacks` لاحقاً: الملاكمة تدعمه أصلاً (`_attachShared` يجرب `setCallbacks` ثم `subscribe` ثم `on`/`addListener`) — لكنه غير مطلوب للدمج.
2. **ملف اللاعب عند الدمج**: هل يُستبدل `halba_boxing_profile_v1` كاملاً بملف القلب (بما فيه هاش الكود والملح)، أم يُهاجَر `codeHash` الحالي؟ لا يوجد لاعبون بعد، فالاستبدال الكامل هو الأبسط.
3. **معايرة ميدانية** بالكاميرا الحقيقية للعتبات (خاصة التقدم الأمامي 0.08) قبل النشر — الاختبار يثبت المنطق على نقاط اصطناعية، لا العتبة النهائية لكل جسم.
4. **التمهيد بين مساري الكاميرا والمحاكاة**: كلا المسارين يستعمل نفس `MoveValidator`، لكن المحاكاة متزامنة (تسلسل كامل دفعة واحدة) والكاميرا غير متزامنة (إطار بإطار). هذا مقصود للاختبار، لكن عند الدمج يجب التأكد أن مسار الكاميرا الحقيقي لا يفقد إطارات أثناء نافذة الهجوم (1400ms) — اختبار ميداني قصير.

## شنو خاص يتصلح فملفات الملاكمة بعد ما يسالي البناء
- `boxing-moves.js` خاصو يستعمل `FitRep.LM` و `FitRep.angleDeg`، ماشي نسخة مكررة منهم.
- `boxing-pose.js` خاصو يستعمل `FitPose.PoseTracker`، ماشي tracker جديد.
- `boxing-profile.js` / `boxing-match.js` خاصهم يستعملو `FitStore` (ELO، المستوى، XP) ونفس `MATCH_SECONDS=60`.
- إلا كان منطق مكرر، يتبدل بالاستعمال المشترك قبل الدفع.

## مساعدة أخرى ممكنة بلا ما نلمس القلب
- مراجعة مستقلة للقلب مني يسالي (باش يقول «مزيان») — قراءة فقط.
- تحقق حي واختبار بعد النشر: الضغط والسكوات الكاملين يتحسبو، والنصفية/المزورة ما تتحسبش، والكاميرا المرفوضة كتعطي وضع محاكاة.
- هاد المساعدات خاصها موافقة عبد المجيد قبل ما نبدا فيها.
