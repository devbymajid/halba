// حلبة v1 — التخزين المحلي + الحسابات + التقييم + المستويات + التحدي اليومي.
// كل شيء محلي (localStorage) — بلا سيرفر. كلمة السر مهشّمة (SHA-256 + ملح)،
// لا نص عادي أبداً.
(function (root) {
  'use strict';

  // بلا بوابة 18+ في v1 (قرار المدير: لا محادثة ولا محتوى للبالغين ولا خصوم
  // حقيقيين في v1). ثابت واحد — ضع 18 هنا لتفعيل البوابة لاحقاً إن طلبها المستخدم.
  var MIN_AGE = 0;

  var K_ACCOUNT = 'fitbattle-account';
  var K_PROFILE = 'fitbattle-profile';
  var K_SESSION = 'fitbattle-session';

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ممتلىء/محظور */ }
  }

  // ---------- كلمة السر ----------
  function hex(buf) {
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  // SHA-256 عبر SubtleCrypto (يتطلب سياقاً آمناً: https أو localhost).
  // بديل متزامن بسيط إن غاب crypto.subtle (لا يُستعمل إلا كملاذ أخير،
  // وما زال أفضل من النص العادي).
  function hashPassword(pass, salt) {
    var text = salt + '::' + pass;
    if (window.crypto && window.crypto.subtle) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(hex);
    }
    return Promise.resolve(fallbackHash(text));
  }
  function fallbackHash(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }
  function makeSalt() {
    var s = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // ---------- الحساب ----------
  function defaultProfile() {
    return {
      elo: 1000, xp: 0,
      wins: 0, losses: 0, draws: 0,
      best: { pushup: 0, squat: 0 },
      history: [], // آخر 20 مباراة
      daily: { date: '', target: 0, done: 0, streak: 0, lastDone: '' }
    };
  }

  var Store = {
    MIN_AGE: MIN_AGE,
    getAccount: function () { return read(K_ACCOUNT, null); },
    getProfile: function () {
      var p = read(K_PROFILE, null);
      if (!p) { p = defaultProfile(); write(K_PROFILE, p); }
      // دمج آمن مع الافتراضيات (ترقية من إصدارات أقدم).
      var d = defaultProfile();
      for (var k in d) if (p[k] === undefined) p[k] = d[k];
      if (!p.best) p.best = d.best;
      if (!p.daily) p.daily = d.daily;
      if (!Array.isArray(p.history)) p.history = [];
      return p;
    },
    saveProfile: function (p) { write(K_PROFILE, p); },
    isLoggedIn: function () {
      return !!read(K_SESSION, null) && !!read(K_ACCOUNT, null);
    },
    createAccount: function (data) {
      // data: { name, pass, age, character }
      var salt = makeSalt();
      return hashPassword(data.pass, salt).then(function (hash) {
        var acc = {
          name: data.name.trim(),
          character: data.character.trim(),
          age: data.age,
          salt: salt, passHash: hash,
          createdAt: Date.now()
        };
        write(K_ACCOUNT, acc);
        write(K_PROFILE, defaultProfile());
        write(K_SESSION, { at: Date.now() });
        return acc;
      });
    },
    verifyLogin: function (name, pass) {
      var acc = read(K_ACCOUNT, null);
      if (!acc || acc.name !== name.trim()) return Promise.resolve(false);
      return hashPassword(pass, acc.salt).then(function (hash) {
        if (hash !== acc.passHash) return false;
        write(K_SESSION, { at: Date.now() });
        return true;
      });
    },
    logout: function () { try { localStorage.removeItem(K_SESSION); } catch (e) {} },
    wipeAll: function () {
      try {
        localStorage.removeItem(K_ACCOUNT);
        localStorage.removeItem(K_PROFILE);
        localStorage.removeItem(K_SESSION);
      } catch (e) {}
    }
  };

  // ---------- ELO ----------
  var Elo = {
    K: 32,
    expected: function (you, opp) {
      return 1 / (1 + Math.pow(10, (opp - you) / 400));
    },
    // score: 1 فوز، 0.5 تعادل، 0 خسارة.
    update: function (you, opp, score) {
      return Math.round(you + Elo.K * (score - Elo.expected(you, opp)));
    }
  };

  // ---------- المستويات والرتب ----------
  // المستوى L يحتاج مجموع XP = ‏100 * L*(L-1)/2 (1←2: ‏100، ‏2←3: ‏200...).
  var Levels = {
    xpForLevel: function (level) { return 100 * level * (level - 1) / 2; },
    levelFromXp: function (xp) {
      var level = 1;
      while (xp >= Levels.xpForLevel(level + 1)) level++;
      return level;
    },
    // التقدّم داخل المستوى الحالي (0..1).
    progressInLevel: function (xp) {
      var level = Levels.levelFromXp(xp);
      var base = Levels.xpForLevel(level);
      var next = Levels.xpForLevel(level + 1);
      return { level: level, progress: (xp - base) / (next - base), into: xp - base, need: next - base };
    },
    rankForLevel: function (level) {
      if (level >= 11) return 'أسطورة';
      if (level >= 8) return 'بطل';
      if (level >= 5) return 'محارب';
      if (level >= 3) return 'مقاتل';
      return 'مبتدئ';
    },
    // إطار رمزي يتغير مع المستوى (لون التوهج حول الصورة الرمزية).
    frameForLevel: function (level) {
      if (level >= 8) return 'gold';
      if (level >= 5) return 'cyan';
      if (level >= 3) return 'purple';
      return 'pink';
    }
  };

  // ---------- التحدي اليومي ----------
  var Daily = {
    todayKey: function (d) {
      d = d || new Date();
      var m = '' + (d.getMonth() + 1), day = '' + d.getDate();
      return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
    },
    dayOfYear: function (d) {
      var start = new Date(d.getFullYear(), 0, 0);
      return Math.floor((d - start) / 86400000);
    },
    targetFor: function (d) {
      return 30 + (Daily.dayOfYear(d || new Date()) % 5) * 10; // 30..70
    },
    // يهيّئ يوماً جديداً إن تغيّر التاريخ (ويصفّر السلسلة إن فات يوم بلا إكمال).
    ensureToday: function (profile) {
      var today = Daily.todayKey();
      var dl = profile.daily;
      if (dl.date === today) return dl;
      var yesterday = new Date(Date.now() - 86400000);
      var yKey = Daily.todayKey(yesterday);
      if (dl.lastDone !== yKey && dl.date !== '') {
        // فات يوم بلا إكمال — السلسلة تنقطع (إلا إن كان اليوم السابق مكتملاً).
        if (!(dl.date === yKey && dl.done >= dl.target)) dl.streak = 0;
      }
      dl.date = today;
      dl.target = Daily.targetFor(new Date());
      dl.done = 0;
      return dl;
    },
    // يضيف تكرارات لتحدي اليوم؛ يعيد { done, target, justCompleted }.
    addReps: function (profile, n) {
      var dl = Daily.ensureToday(profile);
      var wasDone = dl.done >= dl.target;
      dl.done += n;
      var justCompleted = !wasDone && dl.done >= dl.target;
      if (justCompleted) {
        var yesterday = Daily.todayKey(new Date(Date.now() - 86400000));
        dl.streak = (dl.lastDone === yesterday) ? dl.streak + 1 : 1;
        dl.lastDone = dl.date;
      }
      return { done: dl.done, target: dl.target, justCompleted: justCompleted, streak: dl.streak };
    }
  };

  root.FitStore = { Store: Store, Elo: Elo, Levels: Levels, Daily: Daily, MIN_AGE: MIN_AGE };
})(typeof self !== 'undefined' ? self : this);
