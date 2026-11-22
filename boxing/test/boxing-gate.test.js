// Boxing gate test — CLEAN PUSH VERSION (live structure + step-1 auth)
// run: node test/boxing-gate.test.js
// Loads the real boxing JS files + the inline script from boxing.html,
// then asserts: pre-login only the register screen shows (live nav.tabs hidden,
// no profile bar, no notice, header/footer hidden); after register/login,
// the home panel (avatar) opens first and the live tab bar shows; tapping a
// tab opens its panel; logout returns to the register screen.
// The rejected rebuild (appBar / bottomBar / playSheet / match-card) must NOT
// be present in this version.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const DIR = require('path').join(__dirname, '..');

function makeEl(id) {
  const classes = new Set();
  return {
    id,
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    type: '',
    checked: false,
    classList: {
      toggle: (c, force) => { if (force === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else if (force) classes.add(c); else classes.delete(c); },
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    _handlers: {},
    getAttribute: function (name) { return name === 'data-tab' ? this._tab || null : null; },
    setAttribute: function () {},
    addEventListener: function (ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    click: function () { (this._handlers.click || []).forEach((f) => f.call(this)); },
    appendChild: function () {},
  };
}

const IDS = ['profileBar', 'fName', 'fCode', 'btnSaveProfile', 'profileSaved',
  'rDay', 'rMonth', 'rYear', 'rTerms', 'rTermsRow', 'rPassEye', 'regTitle',
  'pageHeader', 'pageFooter', 'authBrand', 'authScreen', 'authLang',
  'lName', 'lCode', 'btnLogin', 'loginMsg', 'cloudStatus',
  'loginCard', 'registerCard', 'linkShowRegister', 'linkShowLogin', 'showRegisterWrap', 'showLoginWrap',
  'noticeCard', 'logoutWrap', 'btnLogout', 'mainTabs',
  'homeTitle', 'homeSub', 'avatarStage', 'avatarStatus', 'btnAvatarPushup', 'btnAvatarHoodie',
  'heroSub', 'matchTimer', 'hpPlayer', 'hpBot', 'hpPlayerText', 'hpBotText', 'botName',
  'matchHits', 'matchHalf', 'matchDodges', 'matchCommand', 'matchFeedback', 'matchVideo', 'matchCanvas',
  'btnStartMatch', 'btnStopMatch', 'btnSimFullMatch', 'btnSimHalfMatch', 'lvl-easy', 'lvl-medium', 'lvl-hard',
  'trainMove', 'trainTarget', 'trainCommand', 'trainFeedback', 'trainCount', 'trainHalf', 'trainAcc', 'trainStreak',
  'btnStartTraining', 'btnStopTraining', 'btnSimFullTrain', 'btnSimHalfTrain',
  'comboList', 'comboSteps', 'comboCommand', 'comboFeedback', 'btnStartCombo', 'btnSimFullCombo', 'btnSimHalfCombo',
  'cameraConsentCard', 'btnConsentCamera', 'btnConsentLater', 'cameraStatus',
  'btnStartCamera', 'btnStopCamera',
  'botLevelSeg', 'leaderboardBody', 'btnRefreshLeaderboard', 'leaderboardMsg'];
const els = {};
IDS.forEach((id) => { els[id] = makeEl(id); });

const PANEL_TABS = ['home', 'profile', 'match', 'training', 'combos', 'camera', 'leaderboard'];
const panels = PANEL_TABS.map((t) => {
  const p = makeEl('panel-' + t);
  p.id = 'panel-' + t;
  if (t === 'profile') p.classList.add('active'); // matches the real markup
  return p;
});
const tabButtons = PANEL_TABS.map((t) => {
  const b = makeEl('tab-' + t);
  b._tab = t;
  if (t === 'profile') b.classList.add('active');
  return b;
});
const store = {};
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  navigator: {},
  document: {
    getElementById: (id) => els[id] || null,
    querySelectorAll: (sel) => {
      if (sel === 'section.panel') return panels;
      if (sel === 'nav.tabs button') return tabButtons;
      return [];
    },
    addEventListener: () => {},
    createElement: (tag) => makeEl('created-' + tag),
    head: { appendChild: () => {} },
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
// محاكي عارض الأفاتار: السكربت المضمّن يستدعيه، والوحدة الحقيقية (ESM + three) لا تُحمَّل في Node.
const avatarCalls = { init: 0, setLevel: [], setVisible: [], reset: 0 };
sandbox.HalbaBoxingAvatar = {
  init: function () { avatarCalls.init++; },
  setLevel: function (lv) { avatarCalls.setLevel.push(lv); },
  setVisible: function (v) { avatarCalls.setVisible.push(v); },
  reset: function () { avatarCalls.reset++; },
  isReady: function () { return true; },
};
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), sandbox, { filename: file });
}
['js/boxing-moves.js', 'js/boxing-profile.js', 'js/firebase-config.js', 'js/boxing-firebase.js', 'js/boxing-pose.js', 'js/boxing-match.js', 'js/boxing-training.js', 'js/boxing-combos.js'].forEach(load);

const html = fs.readFileSync(path.join(DIR, 'boxing.html'), 'utf8');
const inline = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
vm.runInContext(inline, sandbox, { filename: 'boxing-inline.js' });

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name); }
}
function tab(t) { return tabButtons[PANEL_TABS.indexOf(t)]; }
function panel(t) { return panels[PANEL_TABS.indexOf(t)]; }

// --- 0. Static: live structure kept, rebuild absent ---
check('static: live tab bar present', html.indexOf('id="mainTabs"') !== -1 && html.indexOf('nav class="tabs"') !== -1);
check('static: live camera panel kept', html.indexOf('id="panel-camera"') !== -1 && html.indexOf('id="btnStartCamera"') !== -1);
check('static: live match card kept (60s, HP bars)', html.indexOf('مباراة ملاكمة مصنّفة — 60 ثانية') !== -1 && html.indexOf('hpPlayer') !== -1);
check('static: NO rebuild appBar', html.indexOf('id="appBar"') === -1 && html.indexOf('appbar') === -1);
check('static: NO rebuild bottomBar / playSheet', html.indexOf('bottomBar') === -1 && html.indexOf('playSheet') === -1 && html.indexOf('btnNavPlay') === -1);
check('static: NO rebuild match-card / flame-bar', html.indexOf('match-card') === -1 && html.indexOf('flame-bar') === -1 && html.indexOf('score-bar') === -1);
check('static: NO challenge script in html', html.indexOf('boxing-challenge.js') === -1);
check('static: auth screen brand + title + tagline', html.indexOf('id="authBrand"') !== -1 && html.indexOf('تحدي') !== -1 && html.indexOf('أنشئ حسابك') !== -1 && html.indexOf('أنت التحدي — أثبت أنك الأقوى') !== -1);
check('static: auth DOB + password eye + terms', html.indexOf('id="rDay"') !== -1 && html.indexOf('id="rMonth"') !== -1 && html.indexOf('id="rYear"') !== -1 && html.indexOf('id="rPassEye"') !== -1 && html.indexOf('id="rTerms"') !== -1 && html.indexOf('أوافق على') !== -1);
check('static: no +18 anywhere (no adult content)', html.indexOf('+18') === -1 && html.indexOf('18+') === -1 && html.indexOf('للكبار') === -1);
check('static: auth gradient button + login link', html.indexOf('btn-auth') !== -1 && html.indexOf('عندي حساب') !== -1 && html.indexOf('إنشاء حساب') !== -1);
(function () {
  var css = fs.readFileSync(path.join(DIR, 'css/boxing.css'), 'utf8');
  check('static: css has auth screen + register background', css.indexOf('.auth-screen') !== -1 && css.indexOf('register-bg.jpg') !== -1);
  check('static: css keeps live nav.tabs + neon palette', css.indexOf('nav.tabs') !== -1 && css.indexOf('#ff2e88') !== -1 && css.indexOf('#00e5ff') !== -1);
  check('static: css has NO rebuild styles', css.indexOf('.appbar') === -1 && css.indexOf('.bottombar') === -1 && css.indexOf('.sheet') === -1 && css.indexOf('match-card') === -1);
  check('static: avatar stage size unchanged (420px / 360px)', css.indexOf('height: 420px') !== -1 && css.indexOf('height: 360px') !== -1);
  var poseJs = fs.readFileSync(path.join(DIR, 'js/boxing-pose.js'), 'utf8');
  check('static: skeleton orange + white dots', poseJs.indexOf('#ff7a00') !== -1 && poseJs.indexOf('#ffffff') !== -1 && poseJs.indexOf('#00e5ff') === -1);
})();

// --- 1. Fresh visitor: no profile ---
check('pre-reg: tab bar hidden (login screen only)', els.mainTabs.style.display === 'none');
check('pre-reg: tab buttons hidden (except profile tab)', tabButtons.filter((b) => b._tab !== 'profile').every((b) => b.style.display === 'none'));
check('pre-reg: profile bar hidden', els.profileBar.style.display === 'none');
check('pre-reg: notice hidden', els.noticeCard.style.display === 'none');
check('pre-reg: logout hidden', els.logoutWrap.style.display === 'none');
check('pre-reg: login card hidden (register is first)', els.loginCard.style.display === 'none');
check('pre-reg: register card visible (first entry)', els.registerCard.style.display === '');
check('pre-reg: header hidden (auth has its own brand)', els.pageHeader.style.display === 'none');
check('pre-reg: footer hidden', els.pageFooter.style.display === 'none');
check('pre-reg: auth brand visible', els.authBrand.style.display === '');
check('pre-reg: register title is create-account', (els.regTitle.textContent || '').indexOf('أنشئ حسابك') !== -1);
check('pre-reg: hero subtitle hidden', els.heroSub.style.display === 'none');
check('pre-reg: profile panel active', panel('profile').classList.contains('active'));

// Clicking a tab does nothing before registration (guard)
tab('match').click();
check('pre-reg: clicking match tab does not switch panel', panel('profile').classList.contains('active') && !panel('match').classList.contains('active'));
tab('training').click();
check('pre-reg: clicking training tab does not switch panel', panel('profile').classList.contains('active') && !panel('training').classList.contains('active'));

// --- 1b. Register first: login behind a link ---
check('toggle: login hidden by default', els.loginCard.style.display === 'none');
check('toggle: login link visible by default', els.showLoginWrap.style.display !== 'none');
els.linkShowLogin.click();
check('toggle: click login link shows login', els.loginCard.style.display === '' && els.showLoginWrap.style.display === 'none');
check('toggle: click login link hides register', els.registerCard.style.display === 'none');
els.linkShowRegister.click();
check('toggle: back to register hides login again', els.loginCard.style.display === 'none' && els.showLoginWrap.style.display === '');
check('toggle: back to register shows register again', els.registerCard.style.display === '');

// --- 1c. Register validation (DOB + terms + password 8+) ---
els.fName.value = 'مجيد';
els.fCode.value = 'secret123';
els.rDay.value = '15'; els.rMonth.value = '6'; els.rYear.value = '2000';
els.btnSaveProfile.click();
check('register: without terms it refuses', (els.profileSaved.textContent || '').indexOf('الشروط') !== -1);
check('register: without terms still not registered', els.mainTabs.style.display === 'none');
els.rTerms.checked = true;
els.rDay.value = '32';
els.btnSaveProfile.click();
check('register: bad day of birth refuses', (els.profileSaved.textContent || '').indexOf('تاريخ ميلاد') !== -1);
check('register: bad day of birth still not registered', els.mainTabs.style.display === 'none');
els.rDay.value = '15';
els.fCode.value = '123';
els.btnSaveProfile.click();
check('register: short password refuses (8 chars min)', (els.profileSaved.textContent || '').indexOf('8 أحرف') !== -1);
els.fCode.value = 'secret123';
// زر العين يبدّل نوع حقل كلمة السر
check('register: eye toggles password visibility', (function () {
  els.rPassEye.click();
  var shown = els.fCode.type === 'text';
  els.rPassEye.click();
  return shown && els.fCode.type === 'password';
})());

// --- 2. Register ---
els.fName.value = 'مجيد';
els.fCode.value = 'secret123';
els.rDay.value = '15'; els.rMonth.value = '6'; els.rYear.value = '2000';
els.rTerms.checked = true;
els.btnSaveProfile.click();
check('post-reg: home panel opens (avatar first)', panel('home').classList.contains('active'));
check('post-reg: home title greets the player', (els.homeTitle.textContent || '').indexOf('مجيد') !== -1);
check('post-reg: avatar init called', avatarCalls.init >= 1);
check('post-reg: avatar level set from profile', avatarCalls.setLevel.indexOf(1) !== -1);
check('post-reg: avatar visible on home', avatarCalls.setVisible[avatarCalls.setVisible.length - 1] === true);
check('post-reg: tab bar visible', els.mainTabs.style.display === '');
check('post-reg: tab buttons visible', tabButtons.filter((b) => b._tab !== 'profile').every((b) => b.style.display === ''));
check('post-reg: profile bar visible', els.profileBar.style.display === '');
check('post-reg: notice visible', els.noticeCard.style.display === '');
check('post-reg: logout visible', els.logoutWrap.style.display === '');
check('post-reg: profile form visible (editor)', els.registerCard.style.display === '');
check('post-reg: login card hidden', els.loginCard.style.display === 'none');
check('post-reg: register link hidden', els.showRegisterWrap.style.display === 'none');
check('post-reg: back-to-login link hidden', els.showLoginWrap.style.display === 'none');
check('post-reg: hero subtitle visible', els.heroSub.style.display === '');
check('post-reg: header visible', els.pageHeader.style.display === '');
check('post-reg: auth brand hidden (registered)', els.authBrand.style.display === 'none');
check('post-reg: register title becomes profile editor', (els.regTitle.textContent || '').indexOf('ملف اللاعب') !== -1);
check('post-reg: code stored as hash only', (store.halba_boxing_profile_v1 || '').indexOf('secret123') === -1);

// --- 2a. Camera consent (live: training panel) ---
tab('training').click();
check('consent: shown when opening training', els.cameraConsentCard.style.display === '');
els.btnConsentLater.click();
check('consent: later hides it for now', els.cameraConsentCard.style.display === 'none');
tab('home').click();
tab('training').click();
check('consent: returns on next training open (no flag)', els.cameraConsentCard.style.display === '');
els.btnConsentCamera.click();
check('consent: accept hides it + saves flag', els.cameraConsentCard.style.display === 'none' && store.halba_boxing_camera_consent_v1 === '1');
tab('home').click();
tab('training').click();
check('consent: stays hidden after accept', els.cameraConsentCard.style.display === 'none');

// --- 2b. Bot level picker (match tab) ---
check('bot level: medium selected by default', els['lvl-medium'].classList.contains('sel') && !els['lvl-easy'].classList.contains('sel') && !els['lvl-hard'].classList.contains('sel'));
els['lvl-easy'].click();
check('bot level: click easy selects it', els['lvl-easy'].classList.contains('sel') && !els['lvl-medium'].classList.contains('sel'));
check('bot level: easy shows bot ELO 800', (els.botName.textContent || '').indexOf('ELO 800') !== -1);
els['lvl-hard'].click();
check('bot level: click hard selects it + ELO 1600', els['lvl-hard'].classList.contains('sel') && (els.botName.textContent || '').indexOf('ELO 1600') !== -1);
els['lvl-medium'].click();
check('bot level: back to medium ELO 1200', els['lvl-medium'].classList.contains('sel') && (els.botName.textContent || '').indexOf('ELO 1200') !== -1);

// --- 2c. Navigation via live tab bar ---
tab('match').click();
check('nav: match panel opens from tab', panel('match').classList.contains('active'));
tab('training').click();
check('nav: training panel opens from tab', panel('training').classList.contains('active'));
tab('combos').click();
check('nav: combos panel opens from tab', panel('combos').classList.contains('active'));
tab('camera').click();
check('nav: camera panel opens from tab', panel('camera').classList.contains('active'));
tab('leaderboard').click();
check('nav: leaderboard panel opens from tab', panel('leaderboard').classList.contains('active'));
tab('home').click();
check('nav: home panel opens from tab', panel('home').classList.contains('active'));
check('nav: avatar visible again on home', avatarCalls.setVisible[avatarCalls.setVisible.length - 1] === true);
tab('profile').click();
check('nav: profile panel opens from tab', panel('profile').classList.contains('active'));

// --- 2d. Cloud login (Firestore وهمي محقون) — غير متزامن ---
(async function () {
  vm.runInContext(`
    (function () {
      var store2 = new Map();
      var db = { collection: function (name) { return { doc: function (id) { var key = name + '/' + id; return {
        get: async function () { return { exists: store2.has(key), data: function () { return store2.get(key) || null; } }; },
        create: async function (data) { if (store2.has(key)) { var e = new Error('already exists'); e.code = 'already-exists'; throw e; } store2.set(key, Object.assign({}, data)); },
        set: async function (data, opts) { if (opts && opts.merge) store2.set(key, Object.assign({}, store2.get(key) || {}, data)); else store2.set(key, Object.assign({}, data)); }
      }; } }; } };
      var doc = HalbaBoxingCloud.toCloudDoc({ name: 'سليم', age: 20, anime: 'كايتو', elo: 1100, xp: 50, level: 1, wins: 1, losses: 0, draws: 0, matches: 1 }, 'PIN7777');
      store2.set('boxing_profiles/سليم', doc);
      HalbaBoxingCloud.setFirestore(db);
    })();
  `, sandbox, { filename: 'gate-cloud-setup.js' });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // كود خاطئ: يبقى الملف الحالي، وتظهر رسالة خطأ
  els.lName.value = 'سليم';
  els.lCode.value = 'غلط';
  els.btnLogin.click();
  check('login: button disabled during attempt', els.btnLogin.disabled === true);
  await tick(); await tick();
  check('login: button re-enabled after failure', els.btnLogin.disabled === false);
  check('login: wrong code shows error', (els.loginMsg.textContent || '').indexOf('غير صحيح') !== -1);
  check('login: wrong code keeps current profile', (els.profileBar.innerHTML || '').indexOf('مجيد') !== -1);

  // دخول صحيح: يبدّل الملف ويفتح الألسنة (ونموذج التسجيل مفتوح — يجب أن ينغلق)
  els.linkShowRegister.click();
  check('login: register form open before login', els.registerCard.style.display === '');
  els.lCode.value = 'PIN7777';
  els.btnLogin.click();
  await tick(); await tick();
  check('login: login card hidden after login', els.loginCard.style.display === 'none');
  check('login: back-to-login link hidden after login', els.showLoginWrap.style.display === 'none');
  check('login: profile form visible after login', els.registerCard.style.display === '');
  check('login: success message', (els.loginMsg.textContent || '').indexOf('أهلاً بعودتك') !== -1);
  check('login: profile bar shows cloud name', (els.profileBar.innerHTML || '').indexOf('سليم') !== -1);
  check('login: profile bar shows cloud ELO', (els.profileBar.innerHTML || '').indexOf('1100') !== -1);
  check('login: tab bar visible after login', els.mainTabs.style.display === '');
  check('login: code stored as hash only', (store.halba_boxing_profile_v1 || '').indexOf('PIN7777') === -1);

  // حفظ بكلمة سر قصيرة: يرفض قبل الحفظ — رسالة واضحة (8 أحرف).
  els.fCode.value = '123';
  els.btnSaveProfile.click();
  check('save: short password warns (8 chars min)', (els.profileSaved.textContent || '').indexOf('8 أحرف') !== -1);

  // --- 3. Logout: back to the clean register screen ---
  els.btnLogout.click();
  check('logout: tab bar hidden', els.mainTabs.style.display === 'none');
  check('logout: profile bar hidden', els.profileBar.style.display === 'none');
  check('logout: notice hidden', els.noticeCard.style.display === 'none');
  check('logout: logout hidden', els.logoutWrap.style.display === 'none');
  check('logout: register card visible (first entry again)', els.registerCard.style.display === '');
  check('logout: login card hidden', els.loginCard.style.display === 'none');
  check('logout: login link visible', els.showLoginWrap.style.display === '');
  check('logout: header hidden again', els.pageHeader.style.display === 'none');
  check('logout: auth brand visible again', els.authBrand.style.display === '');
  tab('match').click();
  check('logout: match tab does nothing', panel('profile').classList.contains('active') && !panel('match').classList.contains('active'));
  check('logout: profile panel active again', panel('profile').classList.contains('active'));
  check('logout: home panel not active', !panel('home').classList.contains('active'));
  check('logout: avatar hidden on logout', avatarCalls.setVisible[avatarCalls.setVisible.length - 1] === false);
  check('logout: profile cleared', (store.halba_boxing_profile_v1 || '').indexOf('سليم') === -1);
  check('logout: cloud link cleared', !store.halba_boxing_cloud_link_v1);

  console.log(fail === 0 ? 'ALL GATE TESTS PASS' : 'GATE TESTS FAILED: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('GATE TEST CRASH', e); process.exit(1); });
