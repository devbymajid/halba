// حلبة v1 — المتحكم الرئيسي: الشاشات + المباراة + التدريب + الحساب.
(function () {
  'use strict';

  // اسم اللعبة — ثابت واحد. الاسم النهائي «حلبة» (قرار المستخدم 2026-11-21).
  // «نزال» ليس اسم اللعبة — هو اسم الحلبة/الساحة التي تقع فيها مباريات 1 ضد 1.
  var GAME_NAME = 'حلبة';
  var ARENA_NAME = 'نزال';
  var VERSION = '1.0.0';

  var MATCH_SECONDS = 60;
  var XP_PER_REP = 10;
  var XP_WIN_BONUS = 50;

  var Store = window.FitStore.Store;
  var Elo = window.FitStore.Elo;
  var Levels = window.FitStore.Levels;
  var Daily = window.FitStore.Daily;
  var MIN_AGE = window.FitStore.MIN_AGE;

  // ---------- أدوات ----------
  function $(id) { return document.getElementById(id); }
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
  }
  function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  // ---------- الحالة ----------
  var account = null;
  var profile = null;
  var currentScreen = null;
  var tracker = null;      // FitPose.PoseTracker الحالي
  var counter = null;      // FitRep.createRepCounter الحالي
  var match = null;        // { exercise, bot, youReps, botReps, deadline, raf, phase }
  var training = null;     // { exercise, reps, startedAt, raf, simMode }
  var setupChoice = { exercise: 'pushup', bot: 'medium' };

  // نقاط توصيل الأوضاع الخارجية (الملاكمة): سجلات تملؤها وحدات مستقلة
  // عبر window.FitApp بلا تعديل هذا الملف.
  var rematchHandlers = {}; // وضع -> دالة «مباراة أخرى»
  var exerciseLabels = {};  // رمز تمرين خارجي -> تسمية عربية (للسجل)
  var historyHooks = [];    // دوال تُستدعى بعد رسم السجل (أرقام أوضاع خارجية)

  function showScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('on');
    $(id).classList.add('on');
    currentScreen = id;
    window.scrollTo(0, 0);
  }

  function stopSession() {
    if (match && match.bot) match.bot.stop();
    if (match && match.raf) cancelAnimationFrame(match.raf);
    if (training && training.raf) cancelAnimationFrame(training.raf);
    if (tracker) { tracker.stop(); tracker = null; }
    match = null;
    training = null;
  }

  // ---------- الرئيسية ----------
  function renderHome() {
    account = Store.getAccount();
    profile = Store.getProfile();
    var lv = Levels.progressInLevel(profile.xp);
    var frame = Levels.frameForLevel(lv.level);
    $('brand-name').textContent = GAME_NAME;
    $('home-char').textContent = account.character;
    $('home-name').textContent = account.name;
    $('home-rank').textContent = Levels.rankForLevel(lv.level);
    $('home-level').textContent = 'المستوى ' + lv.level;
    $('home-elo').textContent = profile.elo;
    $('home-xpbar').style.width = Math.round(lv.progress * 100) + '%';
    $('home-xptext').textContent = lv.into + ' / ' + lv.need + ' XP';
    $('home-avatar').setAttribute('data-frame', frame);
    $('home-avatar').textContent = account.character.charAt(0);
    $('home-wins').textContent = profile.wins;
    $('home-losses').textContent = profile.losses;
    var dl = Daily.ensureToday(profile);
    Store.saveProfile(profile);
    $('daily-target').textContent = dl.target + ' تكرار';
    $('daily-done').textContent = Math.min(dl.done, dl.target) + ' / ' + dl.target;
    $('daily-bar').style.width = Math.min(100, Math.round(dl.done / dl.target * 100)) + '%';
    $('daily-streak').textContent = dl.streak > 0 ? '🔥 ' + dl.streak + ' أيام متتالية' : 'ابدأ سلسلتك اليوم';
    $('daily-state').textContent = dl.done >= dl.target ? 'أُنجز اليوم ✓' : 'تحدّي اليوم';
  }

  // ---------- المصادقة ----------
  function showAuth(mode) {
    showScreen('screen-auth');
    $('brand-auth').textContent = GAME_NAME;
    var hasAccount = !!Store.getAccount();
    if (mode === 'login' || (mode !== 'signup' && hasAccount)) {
      $('form-signup').classList.add('hidden');
      $('form-login').classList.remove('hidden');
      $('auth-title').textContent = 'أهلاً بعودتك';
      $('auth-sub').textContent = 'سجّل دخولك وادخل الحلبة';
    } else {
      $('form-login').classList.add('hidden');
      $('form-signup').classList.remove('hidden');
      $('auth-title').textContent = 'جاهز للمعركة؟';
      $('auth-sub').textContent = 'أنشئ حسابك وادخل الحلبة';
    }
    $('auth-error').textContent = '';
  }

  function authError(msg) {
    // عنصرا خطأ منفصلان (نموذجا التسجيل والدخول) — اكتب في الظاهر منهما.
    $('auth-error').textContent = msg;
    $('auth-error-login').textContent = msg;
  }

  function doSignup() {
    var name = $('su-name').value.trim();
    var pass = $('su-pass').value;
    var age = parseInt($('su-age').value, 10);
    var character = $('su-char').value.trim();
    if (name.length < 2) return authError('اكتب اسماً من حرفين على الأقل.');
    if (pass.length < 6) return authError('كلمة السر 6 أحرف على الأقل.');
    if (isNaN(age) || age < 5 || age > 120) return authError('اكتب عمراً صحيحاً.');
    if (MIN_AGE > 0 && age < MIN_AGE) return authError('هذه اللعبة لمن هم فوق ' + MIN_AGE + ' سنة.');
    if (character.length < 2) return authError('اكتب اسم شخصية الأنمي التي ستلعب بها.');
    var data = { name: name, pass: pass, age: age, character: character };
    // إصلاح M2: حساب موجود على الجهاز — لا تكتب فوقه بصمت؛ اطلب تأكيداً
    // لأن إنشاء حساب جديد يمسح التقييم والسجل والتحديات نهائياً.
    if (Store.getAccount()) {
      pendingSignup = data;
      $('overwrite-confirm').classList.remove('hidden');
      return;
    }
    createSignupAccount(data);
  }

  var pendingSignup = null; // بيانات تسجيل بانتظار تأكيد الكتابة فوق حساب موجود

  function createSignupAccount(data) {
    $('su-submit').disabled = true;
    Store.createAccount(data).then(function () {
      $('su-submit').disabled = false;
      pendingSignup = null;
      renderHome();
      showScreen('screen-home');
      toast('أهلاً بك في الحلبة، ' + data.character + '!');
    }).catch(function () {
      $('su-submit').disabled = false;
      authError('حدث خطأ — أعد المحاولة.');
    });
  }

  function doLogin() {
    var name = $('li-name').value.trim();
    var pass = $('li-pass').value;
    if (!name || !pass) return authError('اكتب الاسم وكلمة السر.');
    $('li-submit').disabled = true;
    Store.verifyLogin(name, pass).then(function (ok) {
      $('li-submit').disabled = false;
      if (!ok) return authError('الاسم أو كلمة السر غير صحيحين.');
      renderHome();
      showScreen('screen-home');
    }).catch(function () {
      $('li-submit').disabled = false;
      authError('حدث خطأ — أعد المحاولة.');
    });
  }

  // ---------- الإعداد (النزال) ----------
  function renderSetup() {
    showScreen('screen-setup');
    document.querySelectorAll('#ex-seg .seg-opt').forEach(function (el) {
      el.classList.toggle('sel', el.dataset.ex === setupChoice.exercise);
    });
    document.querySelectorAll('#bot-seg .seg-opt').forEach(function (el) {
      el.classList.toggle('sel', el.dataset.bot === setupChoice.bot);
      el.querySelector('.seg-sub').textContent = 'تقييم ' + window.FitBot.LEVELS[el.dataset.bot].rating;
    });
  }

  // ---------- عدّاد مشترك: الكاميرا + العدّ ----------
  function makeCounter(exercise) {
    counter = window.FitRep.createRepCounter(exercise);
    return counter;
  }

  function flashRep(el) {
    el.classList.remove('pop');
    void el.offsetWidth; // إعادة تشغيل الحركة
    el.classList.add('pop');
  }

  // ---------- المباراة (النزال) ----------
  function startMatch() {
    stopSession();
    var ex = setupChoice.exercise;
    makeCounter(ex);
    var bot = window.FitBot.createBot(setupChoice.bot);
    match = {
      exercise: ex, bot: bot, youReps: 0, botReps: 0,
      phase: 'loading', deadline: 0, raf: null, ended: false
    };
    // واجهة المعركة
    $('battle-title').textContent = ARENA_NAME + ' — معركة مصنّفة';
    $('battle-ex').textContent = window.FitRep.EXERCISES[ex].label;
    $('you-name').textContent = account.character;
    $('you-avatar').textContent = account.character.charAt(0);
    $('you-rating').textContent = profile.elo;
    $('you-level').textContent = 'المستوى ' + Levels.levelFromXp(profile.xp);
    var lv = Levels.progressInLevel(profile.xp);
    $('you-xpbar').style.width = Math.round(lv.progress * 100) + '%';
    $('bot-name').textContent = 'الخصم (بوت)';
    $('bot-rating').textContent = bot.rating;
    $('bot-note').textContent = 'مستوى ' + bot.label;
    $('you-reps').textContent = '0';
    $('bot-reps').textContent = '0';
    updateTug();
    $('battle-timer').textContent = fmtTime(MATCH_SECONDS);
    $('battle-timebar').style.width = '100%';
    $('battle-cam-error').classList.add('hidden');
    setFormHint(false);
    $('btn-forfeit').classList.remove('hidden');
    showScreen('screen-battle');

    bot.onRep(function (n) {
      if (!match || match.phase !== 'live') return;
      match.botReps = n;
      $('bot-reps').textContent = String(n);
      flashRep($('bot-reps'));
      updateTug();
    });

    tracker = new window.FitPose.PoseTracker(
      $('battle-video'), $('battle-canvas'),
      {
        onLandmarks: function (lm) {
          if (!match || match.phase !== 'live' || !counter) return;
          // إصلاح B1: مرّر null للعدّاد أيضاً — وإلا ظلّ التكرار الجاري
          // حياً أثناء خروج الجسم من الإطار واحتُسب عند عودته.
          if (!lm) { setTracking(false); setFormHint(false); counter.feed(null); return; }
          setTracking(true);
          var r = counter.feed(lm);
          setFormHint(r.plankOk === false);
          if (r.counted) onYouRep();
        },
        onStatus: function (s, detail) {
          if (s === 'error') {
            match.phase = 'error';
            $('battle-cam-error').classList.remove('hidden');
            $('battle-cam-error-text').textContent = detail || 'تعذّر تشغيل الكاميرا.';
            $('btn-forfeit').classList.add('hidden');
          } else if (s === 'tracking') {
            if (match.phase === 'loading') runCountdown();
          }
        }
      }
    );
    tracker.start().catch(function () { /* الخطأ يُعرض عبر onStatus */ });
  }

  function setTracking(ok) {
    var pill = $('battle-tracking');
    if (!pill) return;
    pill.classList.toggle('ok', !!ok);
    pill.classList.toggle('bad', !ok);
    pill.querySelector('span:last-child').textContent = ok ? 'يتعقّب ✓' : 'لا أراك — عد داخل الإطار';
  }

  // تلميح استقامة الجسم (مانع الغش): يظهر فقط عندما تُقاس وضعية مكسورة.
  function setFormHint(show) {
    var h = $('battle-form-hint');
    if (h) h.classList.toggle('hidden', !show);
  }

  function runCountdown() {
    match.phase = 'countdown';
    var cd = $('countdown');
    var n = 3;
    cd.classList.remove('hidden');
    cd.textContent = String(n);
    var step = setInterval(function () {
      n--;
      if (n <= 0) {
        clearInterval(step);
        cd.classList.add('hidden');
        beginLive();
      } else {
        cd.textContent = String(n);
      }
    }, 700);
    match.countdownTimer = step;
  }

  function beginLive() {
    if (!match || match.phase !== 'countdown') return;
    match.phase = 'live';
    match.deadline = performance.now() + MATCH_SECONDS * 1000;
    counter.reset();
    match.bot.start();
    var tick = function () {
      if (!match || match.phase !== 'live') return;
      var remain = (match.deadline - performance.now()) / 1000;
      if (remain <= 0) {
        $('battle-timer').textContent = '00:00';
        $('battle-timebar').style.width = '0%';
        finishMatch('time');
        return;
      }
      $('battle-timer').textContent = fmtTime(remain);
      $('battle-timebar').style.width = (remain / MATCH_SECONDS * 100) + '%';
      match.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function onYouRep() {
    if (!match || match.phase !== 'live') return;
    match.youReps++;
    $('you-reps').textContent = String(match.youReps);
    flashRep($('you-reps'));
    vibrate(25);
    updateTug();
  }

  function updateTug() {
    if (!match) return;
    var diff = match.youReps - match.botReps;
    // العلامة تتحرك نحو جهة المتقدّم: جهتك (الوردي) على اليمين وجهة
    // الخصم (السماوي) على اليسار، وright% صغيرة تعني قرب اليمين —
    // لذا الإشارة سالبة: تقدّمك يقلّص right% (نحو جهتك)، وتقدّم
    // الخصم يزيدها (نحو جهته). (أُصلح اتجاه معكوس اكتُشف في مراجعة
    // لقطة المعركة: كانت العلامة تذهب لجهة المتأخر.)
    var pct = 50 - Math.max(-40, Math.min(40, diff * 4));
    $('tug-marker').style.right = pct + '%';
    var label = $('tug-you-label');
    if (diff > 0) label.textContent = 'أنت متقدّم ◆';
    else if (diff < 0) label.textContent = 'الخصم متقدّم ◆';
    else label.textContent = 'متعادلان ◆';
  }

  function finishMatch(reason) {
    if (!match || match.ended) return;
    match.ended = true;
    match.phase = 'done';
    if (match.countdownTimer) clearInterval(match.countdownTimer);
    if (match.raf) cancelAnimationFrame(match.raf);
    match.bot.stop();
    if (tracker) { tracker.stop(); tracker = null; }
    var you = match.youReps, bot = match.botReps;
    var result, score;
    if (reason === 'forfeit') { result = 'forfeit'; score = 0; }
    else if (you > bot) { result = 'win'; score = 1; }
    else if (you < bot) { result = 'loss'; score = 0; }
    else { result = 'draw'; score = 0.5; }

    var oldElo = profile.elo;
    var oldLevel = Levels.levelFromXp(profile.xp);
    profile.elo = Elo.update(profile.elo, match.bot.rating, score);
    var xpGain = you * XP_PER_REP + (result === 'win' ? XP_WIN_BONUS : 0);
    profile.xp += xpGain;
    if (result === 'win') profile.wins++;
    else if (result === 'loss' || result === 'forfeit') profile.losses++;
    else profile.draws++;
    if (you > (profile.best[match.exercise] || 0)) profile.best[match.exercise] = you;
    profile.history.unshift({
      d: new Date().toISOString(), ex: match.exercise,
      bot: match.bot.level, you: you, botReps: bot,
      res: result, elo: profile.elo
    });
    profile.history = profile.history.slice(0, 20);
    var daily = Daily.addReps(profile, you);
    Store.saveProfile(profile);

    var newLevel = Levels.levelFromXp(profile.xp);
    showResult({
      mode: 'match', result: result, you: you, bot: bot,
      eloDelta: profile.elo - oldElo, xpGain: xpGain,
      leveledUp: newLevel > oldLevel, newLevel: newLevel,
      dailyDone: daily.justCompleted
    });
    match = null;
  }

  // ---------- التدريب الفردي ----------
  function startTraining() {
    stopSession();
    var ex = setupChoice.exercise;
    makeCounter(ex);
    training = { exercise: ex, reps: 0, startedAt: 0, raf: null, simMode: false };
    $('train-ex').textContent = window.FitRep.EXERCISES[ex].label;
    $('train-reps').textContent = '0';
    $('train-time').textContent = '00:00';
    $('train-state').textContent = 'جهّز وضعيتك داخل الإطار';
    $('train-cam-error').classList.add('hidden');
    $('btn-sim').classList.add('hidden');
    $('train-sim-note').classList.add('hidden');
    showScreen('screen-training');

    tracker = new window.FitPose.PoseTracker(
      $('train-video'), $('train-canvas'),
      {
        onLandmarks: function (lm) {
          if (!training || !counter) return;
          // إصلاح B1: مرّر null للعدّاد أيضاً (كالمعركة أعلاه).
          if (!lm) { setTrainTracking(false); counter.feed(null); return; }
          setTrainTracking(true);
          var r = counter.feed(lm);
          $('train-state').textContent = r.plankOk === false ? 'جسمك غير مستقيم — استقم، فالتكرار لا يُحتسب' : (r.state === 'down' ? 'أسفل ✓ — اصعد الآن' : (r.state === 'up' ? 'في الأعلى — انزل بالكامل' : 'واصل النزول...'));
          if (r.counted) onTrainRep();
        },
        onStatus: function (s, detail) {
          if (s === 'error') {
            training.simMode = true;
            $('train-cam-error').classList.remove('hidden');
            $('train-cam-error-text').textContent = detail || 'تعذّر تشغيل الكاميرا.';
            $('btn-sim').classList.remove('hidden');
            $('train-sim-note').classList.remove('hidden');
            if (!training.startedAt) training.startedAt = performance.now();
          } else if (s === 'tracking') {
            if (!training.startedAt) training.startedAt = performance.now();
          }
        }
      }
    );
    training.startedAt = 0;
    var tick = function () {
      if (!training) return;
      if (training.startedAt) {
        var el = (performance.now() - training.startedAt) / 1000;
        $('train-time').textContent = fmtTime(el);
      }
      training.raf = requestAnimationFrame(tick);
    };
    tick();
    tracker.start().catch(function () { /* الخطأ يُعرض عبر onStatus */ });
  }

  function setTrainTracking(ok) {
    var pill = $('train-tracking');
    if (!pill) return;
    pill.classList.toggle('ok', !!ok);
    pill.classList.toggle('bad', !ok);
    pill.querySelector('span:last-child').textContent = ok ? 'يتعقّب ✓' : 'لا أراك — عد داخل الإطار';
  }

  function onTrainRep() {
    if (!training) return;
    training.reps++;
    $('train-reps').textContent = String(training.reps);
    flashRep($('train-reps'));
    vibrate(25);
  }

  function endTraining() {
    if (!training) return;
    if (training.raf) cancelAnimationFrame(training.raf);
    if (tracker) { tracker.stop(); tracker = null; }
    var reps = training.reps;
    var secs = training.startedAt ? Math.round((performance.now() - training.startedAt) / 1000) : 0;
    var oldLevel = Levels.levelFromXp(profile.xp);
    var xpGain = reps * XP_PER_REP;
    profile.xp += xpGain;
    var daily = Daily.addReps(profile, reps);
    Store.saveProfile(profile);
    var newLevel = Levels.levelFromXp(profile.xp);
    training = null;
    showResult({
      mode: 'training', result: 'done', you: reps, bot: 0,
      eloDelta: 0, xpGain: xpGain, secs: secs,
      leveledUp: newLevel > oldLevel, newLevel: newLevel,
      dailyDone: daily.justCompleted
    });
  }

  // ---------- النتيجة ----------
  function showResult(r) {
    var title = $('result-title');
    var sub = $('result-sub');
    if (r.mode === 'training') {
      title.textContent = 'أحسنت! 💪';
      sub.textContent = 'حصة تدريب مكتملة';
      $('result-elo-row').classList.add('hidden');
      $('result-score').textContent = r.you + ' تكرار في ' + fmtTime(r.secs || 0);
    } else {
      $('result-elo-row').classList.remove('hidden');
      $('result-score').textContent = r.you + ' — ' + r.bot;
      if (r.result === 'win') { title.textContent = 'فزت! 🏆'; sub.textContent = 'انتصار في ' + ARENA_NAME; }
      else if (r.result === 'draw') { title.textContent = 'تعادل!'; sub.textContent = 'لا غالب ولا مغلوب'; }
      else if (r.result === 'forfeit') { title.textContent = 'استسلمت'; sub.textContent = 'خسارة محسوبة — عُد أقوى'; }
      else { title.textContent = 'خسرت هذه المرة'; sub.textContent = 'البوت كان أسرع — حاول مجدداً'; }
      var d = r.eloDelta;
      // إصلاح M4: علامة السالب U+2212 (لا الواصلة) + dir=ltr على العنصر،
      // حتى لا تظهر "-8" كـ "8-" في السياق العربي.
      $('result-elo').textContent = (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + ' (الآن ' + profile.elo + ')';
      // إصلاح M3: classList بدل تعيين className — حتى لا يُمسح صنف val
      // (خط Kufi ‏900) من قيمة التقييم.
      var eloEl = $('result-elo');
      eloEl.classList.remove('good', 'bad');
      eloEl.classList.add(d >= 0 ? 'good' : 'bad');
    }
    $('result-xp').textContent = '+' + r.xpGain + ' XP';
    var lv = $('result-levelup');
    if (r.leveledUp) {
      lv.classList.remove('hidden');
      lv.textContent = '🎉 مستوى جديد! المستوى ' + r.newLevel + ' — رتبة ' + Levels.rankForLevel(r.newLevel);
    } else lv.classList.add('hidden');
    var dd = $('result-daily');
    if (r.dailyDone) {
      dd.classList.remove('hidden');
      dd.textContent = '✓ أكملت تحدّي اليوم! سلسلتك: ' + profile.daily.streak + ' أيام';
    } else dd.classList.add('hidden');
    $('btn-result-rematch').textContent = r.mode === 'training' ? 'تدريب آخر' : 'مباراة أخرى';
    $('btn-result-rematch').dataset.mode = r.mode;
    showScreen('screen-result');
  }

  // ---------- السجل والحساب ----------
  function renderHistory() {
    profile = Store.getProfile();
    $('history-best-pushup').textContent = profile.best.pushup || 0;
    $('history-best-squat').textContent = profile.best.squat || 0;
    $('history-wins').textContent = profile.wins + ' فوز / ' + profile.losses + ' خسارة / ' + profile.draws + ' تعادل';
    var list = $('history-list');
    list.innerHTML = '';
    if (!profile.history.length) {
      list.innerHTML = '<div class="empty">لا مباريات بعد — ادخل النزال وابدأ قصتك.</div>';
    } else {
      profile.history.forEach(function (h) {
        var row = document.createElement('div');
        row.className = 'hist-row';
        var resTxt = h.res === 'win' ? 'فوز' : (h.res === 'draw' ? 'تعادل' : (h.res === 'forfeit' ? 'استسلام' : 'خسارة'));
        var resCls = h.res === 'win' ? 'good' : (h.res === 'draw' ? '' : 'bad');
        var d = new Date(h.d);
        var dateTxt = d.getDate() + '/' + (d.getMonth() + 1);
        // تسمية التمرين: تمارين القلب من EXERCISES، والأوضاع الخارجية
        // من سجل التسميات (registerExerciseLabel)، وإلا الرمز نفسه.
        var exLabel = window.FitRep.EXERCISES[h.ex] ? window.FitRep.EXERCISES[h.ex].label : (exerciseLabels[h.ex] || h.ex);
        // إصلاح M5: سقوط احتياطي لمستوى بوت غير معروف — إدخال فاسد واحد
        // لا يعطّل شاشة السجل كلها.
        var botLabel = (window.FitBot.LEVELS[h.bot] || {}).label || 'بوت';
        row.innerHTML = '<span class="hist-res ' + resCls + '">' + resTxt + '</span>' +
          '<span class="hist-mid">' + exLabel + ' ضد بوت ' +
          botLabel + '</span>' +
          '<span class="hist-score">' + h.you + ' — ' + h.botReps + '</span>' +
          '<span class="hist-date">' + dateTxt + '</span>';
        list.appendChild(row);
      });
    }
    historyHooks.forEach(function (fn) { try { fn(profile); } catch (e) {} });
    showScreen('screen-history');
  }

  function renderAccount() {
    account = Store.getAccount();
    profile = Store.getProfile();
    $('acc-name').textContent = account.name;
    $('acc-char').textContent = account.character;
    $('acc-age').textContent = account.age + ' سنة';
    $('acc-elo').textContent = profile.elo;
    $('acc-level').textContent = 'المستوى ' + Levels.levelFromXp(profile.xp) + ' — ' + Levels.rankForLevel(Levels.levelFromXp(profile.xp));
    $('acc-xp').textContent = profile.xp + ' XP';
    showScreen('screen-account');
  }

  // ---------- الربط ----------
  function bind() {
    document.title = GAME_NAME + ' — معركة لياقة 1 ضد 1';
    $('brand-auth').textContent = GAME_NAME;
    $('brand-name').textContent = GAME_NAME;

    $('su-submit').addEventListener('click', doSignup);
    $('overwrite-yes').addEventListener('click', function () {
      $('overwrite-confirm').classList.add('hidden');
      if (pendingSignup) createSignupAccount(pendingSignup);
    });
    $('overwrite-no').addEventListener('click', function () {
      $('overwrite-confirm').classList.add('hidden');
      pendingSignup = null;
    });
    $('li-submit').addEventListener('click', doLogin);
    $('to-login').addEventListener('click', function () { showAuth('login'); });
    $('to-signup').addEventListener('click', function () { showAuth('signup'); });
    document.querySelectorAll('.eye').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = document.getElementById(btn.dataset.for);
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      });
    });

    $('btn-to-setup').addEventListener('click', renderSetup);
    $('btn-to-training').addEventListener('click', startTraining);
    $('btn-to-history').addEventListener('click', renderHistory);
    $('btn-to-account').addEventListener('click', renderAccount);

    $('btn-setup-back').addEventListener('click', function () { renderHome(); showScreen('screen-home'); });
    document.querySelectorAll('#ex-seg .seg-opt').forEach(function (el) {
      el.addEventListener('click', function () {
        setupChoice.exercise = el.dataset.ex;
        renderSetup();
      });
    });
    document.querySelectorAll('#bot-seg .seg-opt').forEach(function (el) {
      el.addEventListener('click', function () {
        setupChoice.bot = el.dataset.bot;
        renderSetup();
      });
    });
    $('btn-start-match').addEventListener('click', startMatch);

    $('btn-forfeit').addEventListener('click', function () {
      $('forfeit-confirm').classList.remove('hidden');
    });
    $('forfeit-yes').addEventListener('click', function () {
      $('forfeit-confirm').classList.add('hidden');
      finishMatch('forfeit');
    });
    $('forfeit-no').addEventListener('click', function () {
      $('forfeit-confirm').classList.add('hidden');
    });
    $('btn-battle-back').addEventListener('click', function () {
      stopSession();
      renderHome();
      showScreen('screen-home');
    });
    $('btn-battle-retry').addEventListener('click', startMatch);

    $('btn-train-end').addEventListener('click', endTraining);
    $('btn-train-back').addEventListener('click', function () {
      stopSession();
      renderHome();
      showScreen('screen-home');
    });
    $('btn-sim').addEventListener('click', function () {
      if (!training || !counter) return;
      var r = counter.simulateRep();
      if (r.counted) onTrainRep();
    });

    $('btn-result-rematch').addEventListener('click', function () {
      var mode = this.dataset.mode;
      if (rematchHandlers[mode]) { rematchHandlers[mode](); return; }
      if (mode === 'training') startTraining();
      else renderSetup();
    });
    $('btn-result-home').addEventListener('click', function () {
      renderHome();
      showScreen('screen-home');
    });

    $('btn-history-back').addEventListener('click', function () {
      renderHome();
      showScreen('screen-home');
    });
    $('btn-account-back').addEventListener('click', function () {
      renderHome();
      showScreen('screen-home');
    });
    $('btn-logout').addEventListener('click', function () {
      Store.logout();
      showAuth('login');
    });
    $('btn-delete').addEventListener('click', function () {
      $('delete-confirm').classList.remove('hidden');
    });
    $('delete-yes').addEventListener('click', function () {
      $('delete-confirm').classList.add('hidden');
      Store.wipeAll();
      showAuth('signup');
      toast('تم حذف الحساب وكل بياناته.');
    });
    $('delete-no').addEventListener('click', function () {
      $('delete-confirm').classList.add('hidden');
    });
  }

  // ---------- خطافات الاختبار ----------
  // تُفعَّل فقط مع ?test=1 — حتى لا تبقى أدوات الحقن وتمديد المؤقّت
  // متاحة في بناء الإنتاج (مراجعة مستقلة M1). الفحص الحي والاختبارات
  // تفتح التطبيق بـ ?test=1.
  if (/[?&]test=1(?:&|$)/.test(location.search)) {
  window.__fit = {
    version: VERSION,
    gameName: GAME_NAME,
    arenaName: ARENA_NAME,
    state: function () {
      return {
        screen: currentScreen,
        loggedIn: Store.isLoggedIn(),
        account: account ? { name: account.name, character: account.character, age: account.age } : null,
        profile: profile ? { elo: profile.elo, xp: profile.xp, wins: profile.wins, losses: profile.losses, best: profile.best, daily: profile.daily } : null,
        match: match ? { phase: match.phase, exercise: match.exercise, youReps: match.youReps, botReps: match.botReps, botLevel: match.bot.level } : null,
        training: training ? { exercise: training.exercise, reps: training.reps, simMode: training.simMode } : null,
        counter: counter ? { reps: counter.reps, state: counter.state, angle: counter.angle, plank: counter.plank, plankOk: counter.plankOk } : null,
        trackerRunning: !!(tracker && tracker.running)
      };
    },
    // حقن نقاط وضعية محاكاة عبر مسار العدّ الحقيقي (يرسم الهيكل أيضاً).
    injectLandmarks: function (lm) {
      if (tracker) tracker.inject(lm);
      else if (counter) {
        var r = counter.feed(lm);
        if (r.counted) {
          if (match && match.phase === 'live') onYouRep();
          else if (training) onTrainRep();
        }
      }
    },
    // إيقاف/استئناف كشف الكاميرا مؤقتاً (للاختبار: لقطات بلا تشبع الخيط).
    pauseTracking: function () { if (tracker) tracker.pause(); },
    resumeTracking: function () { if (tracker) tracker.resume(); },
    setTimeLeft: function (s) {
      if (match && match.phase === 'live') match.deadline = performance.now() + s * 1000;
    },
    startMatchDirect: function (ex, botLevel) {
      setupChoice.exercise = ex || 'pushup';
      setupChoice.bot = botLevel || 'medium';
      startMatch();
    }
  };
  }

  // ---------- واجهة عامة للأوضاع الإضافية (الملاكمة وغيرها) ----------
  // وحدة مستقلة (ملف JS منفصل يُحمَّل بعد app.js) توصّل نفسها بالقلب
  // عبر window.FitApp + الوحدات العامة (FitStore / FitPose / FitRep / FitBot)
  // بلا تعديل ملفات القلب. البروتوكول الكامل في NOTES.md («كيف يوصّل
  // وضع جديد نفسه بالقلب»). ملاحظة مهمة: showResult يقرأ ELO والسلسلة
  // من نسخة الملف الشخصي الداخلية — بعد حفظ ملف محدَّث استدعِ
  // refreshProfile() أولاً حتى تعرض النتيجة الأرقام الجديدة.
  window.FitApp = {
    version: VERSION,
    gameName: GAME_NAME,
    arenaName: ARENA_NAME,
    xpPerRep: XP_PER_REP, // اقتصاد موحّد: 10 XP لكل حركة/تكرار محسوب
    showScreen: showScreen,
    renderHome: renderHome,
    refreshProfile: function () { profile = Store.getProfile(); },
    toast: toast,
    vibrate: vibrate,
    flashRep: flashRep,
    fmtTime: fmtTime,
    stopSession: stopSession,
    showResult: showResult,
    // تسجيل دالة «مباراة أخرى» لوضع خارجي (مثلاً 'boxing').
    registerRematch: function (mode, fn) { rematchHandlers[mode] = fn; },
    // تسجيل التسمية العربية لرمز تمرين خارجي في السجل (مثلاً 'boxing' -> 'ملاكمة').
    registerExerciseLabel: function (ex, label) { exerciseLabels[ex] = label; },
    // تسجيل دالة تُستدعى بعد رسم السجل (لتحديث أرقام الوضع الخارجي فيه).
    registerHistoryHook: function (fn) { historyHooks.push(fn); }
  };

  // ---------- الإقلاع ----------
  bind();
  if (Store.isLoggedIn()) {
    renderHome();
    showScreen('screen-home');
  } else {
    showAuth(Store.getAccount() ? 'login' : 'signup');
  }
})();
