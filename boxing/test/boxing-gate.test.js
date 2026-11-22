// Boxing gate test — run: node test/boxing-gate.test.js
// Loads the real boxing JS files + the inline script from boxing.html,
// then asserts: pre-login only the login screen shows (no nav, no profile bar, no notice);
// after login/register, the home panel (avatar) opens first and the fixed bottom bar
// shows all tabs; tapping a bottom-bar button opens its panel; logout returns to the login screen.
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
    classList: {
      toggle: (c, force) => { if (force === undefined) { classes.has(c) ? classes.delete(c) : classes.add(c); } else if (force) classes.add(c); else classes.delete(c); },
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    _handlers: {},
    addEventListener: function (ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    click: function () { (this._handlers.click || []).forEach((f) => f.call(this)); },
    appendChild: function () {},
  };
}

const IDS = ['profileBar', 'fName', 'fCode', 'fAge', 'fAnime', 'btnSaveProfile', 'profileSaved',
  'lName', 'lCode', 'btnLogin', 'loginMsg', 'cloudStatus',
  'loginCard', 'registerCard', 'linkShowRegister', 'linkShowLogin', 'showRegisterWrap', 'showLoginWrap',
  'mainTabs', 'noticeCard', 'logoutWrap', 'btnLogout',
  'homeTitle', 'homeSub', 'avatarStage', 'avatarStatus', 'btnAvatarPushup', 'btnAvatarHoodie',
  'heroSub', 'matchTimer', 'hpPlayer', 'hpBot', 'hpPlayerText', 'hpBotText', 'botName',
  'matchHits', 'matchHalf', 'matchDodges', 'matchCommand', 'matchFeedback', 'matchVideo', 'matchCanvas',
  'btnStartMatch', 'btnStopMatch', 'btnSimFullMatch', 'btnSimHalfMatch', 'lvl-easy', 'lvl-medium', 'lvl-hard',
  'trainMove', 'trainTarget', 'trainCommand', 'trainFeedback', 'trainCount', 'trainHalf', 'trainAcc', 'trainStreak',
  'btnStartTraining', 'btnStopTraining', 'btnSimFullTrain', 'btnSimHalfTrain',
  'comboList', 'comboSteps', 'comboCommand', 'comboFeedback', 'btnStartCombo', 'btnSimFullCombo', 'btnSimHalfCombo',
  'cameraStatus', 'btnStartCamera', 'btnStopCamera'];
const els = {};
IDS.forEach((id) => { els[id] = makeEl(id); });

const tabNames = ['home', 'profile', 'match', 'training', 'combos', 'camera', 'leaderboard'];
const tabBtns = tabNames.map((t) => {
  const b = makeEl('tab-' + t);
  b.getAttribute = (a) => (a === 'data-tab' ? t : null);
  return b;
});
const panels = ['home', 'profile', 'match', 'training', 'combos', 'camera', 'leaderboard'].map((t) => {
  const p = makeEl('panel-' + t);
  p.id = 'panel-' + t;
  if (t === 'profile') p.classList.add('active'); // matches the real markup
  return p;
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
      if (sel === 'nav.tabs button') return tabBtns;
      if (sel === 'section.panel') return panels;
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
const tabByName = (t) => tabBtns.find((b) => b.getAttribute('data-tab') === t);

// --- 1. Fresh visitor: no profile ---
check('pre-reg: home tab hidden', tabByName('home').style.display === 'none');
check('pre-reg: match tab hidden', tabByName('match').style.display === 'none');
check('pre-reg: training tab hidden', tabByName('training').style.display === 'none');
check('pre-reg: combos tab hidden', tabByName('combos').style.display === 'none');
check('pre-reg: camera tab hidden', tabByName('camera').style.display === 'none');
check('pre-reg: leaderboard tab hidden', tabByName('leaderboard').style.display === 'none');
check('pre-reg: profile tab visible', tabByName('profile').style.display !== 'none');
check('pre-reg: nav hidden (login screen only)', els.mainTabs.style.display === 'none');
check('pre-reg: profile bar hidden', els.profileBar.style.display === 'none');
check('pre-reg: notice hidden', els.noticeCard.style.display === 'none');
check('pre-reg: logout hidden', els.logoutWrap.style.display === 'none');
check('pre-reg: login card visible', els.loginCard.style.display === '');
check('pre-reg: hero subtitle hidden', els.heroSub.style.display === 'none');
check('pre-reg: profile panel active', panels[1].classList.contains('active'));

// Clicking a hidden tab does nothing (guard)
tabByName('match').click();
check('pre-reg: clicking match tab does not switch panel', panels[1].classList.contains('active') && !panels[2].classList.contains('active'));
tabByName('home').click();
check('pre-reg: clicking home tab does not switch panel', panels[1].classList.contains('active') && !panels[0].classList.contains('active'));

// --- 1b. Login first: register hidden behind a link ---
check('toggle: register hidden by default', els.registerCard.style.display === 'none');
check('toggle: register link visible by default', els.showRegisterWrap.style.display !== 'none');
els.linkShowRegister.click();
check('toggle: click register link shows form', els.registerCard.style.display === '' && els.showRegisterWrap.style.display === 'none');
check('toggle: click register link hides login card', els.loginCard.style.display === 'none');
els.linkShowLogin.click();
check('toggle: back to login hides form again', els.registerCard.style.display === 'none' && els.showRegisterWrap.style.display === '');
check('toggle: back to login shows login card again', els.loginCard.style.display === '');

// --- 2. Register ---
els.linkShowRegister.click(); // التسجيل وراء رابط — نظهره أولاً
els.fName.value = 'مجيد';
els.fCode.value = 'secret123';
els.fAge.value = '25';
els.fAnime.value = 'كايتو';
els.btnSaveProfile.click();
check('post-reg: home tab visible', tabByName('home').style.display === '');
check('post-reg: leaderboard tab visible', tabByName('leaderboard').style.display === '');
check('post-reg: home panel opens (avatar first)', panels[0].classList.contains('active'));
check('post-reg: home button active', tabByName('home').classList.contains('active'));
check('post-reg: home title greets the player', (els.homeTitle.textContent || '').indexOf('مجيد') !== -1);
check('post-reg: avatar init called', avatarCalls.init >= 1);
check('post-reg: avatar level set from profile', avatarCalls.setLevel.indexOf(1) !== -1);
check('post-reg: avatar visible on home', avatarCalls.setVisible[avatarCalls.setVisible.length - 1] === true);
check('post-reg: match tab visible', tabByName('match').style.display === '');
check('post-reg: training tab visible', tabByName('training').style.display === '');
check('post-reg: combos tab visible', tabByName('combos').style.display === '');
check('post-reg: camera tab visible', tabByName('camera').style.display === '');
check('post-reg: nav visible', els.mainTabs.style.display === '');
check('post-reg: profile bar visible', els.profileBar.style.display === '');
check('post-reg: notice visible', els.noticeCard.style.display === '');
check('post-reg: logout visible', els.logoutWrap.style.display === '');
check('post-reg: profile form visible (editor)', els.registerCard.style.display === '');
check('post-reg: login card hidden', els.loginCard.style.display === 'none');
check('post-reg: register link hidden', els.showRegisterWrap.style.display === 'none');
check('post-reg: back-to-login link hidden', els.showLoginWrap.style.display === 'none');
check('post-reg: hero subtitle visible', els.heroSub.style.display === '');
check('post-reg: code stored as hash only', (store.halba_boxing_profile_v1 || '').indexOf('secret123') === -1);

// --- 2b. Bot level picker (match tab) ---
check('bot level: medium selected by default', els['lvl-medium'].classList.contains('sel') && !els['lvl-easy'].classList.contains('sel') && !els['lvl-hard'].classList.contains('sel'));
els['lvl-easy'].click();
check('bot level: click easy selects it', els['lvl-easy'].classList.contains('sel') && !els['lvl-medium'].classList.contains('sel'));
check('bot level: easy shows bot ELO 800', (els.botName.textContent || '').indexOf('ELO 800') !== -1);
els['lvl-hard'].click();
check('bot level: click hard selects it + ELO 1600', els['lvl-hard'].classList.contains('sel') && (els.botName.textContent || '').indexOf('ELO 1600') !== -1);
els['lvl-medium'].click();
check('bot level: back to medium ELO 1200', els['lvl-medium'].classList.contains('sel') && (els.botName.textContent || '').indexOf('ELO 1200') !== -1);

// --- 2c. Cloud login (Firestore وهمي محقون) — غير متزامن ---
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
  check('login: match tab visible after login', tabByName('match').style.display === '');
  check('login: code stored as hash only', (store.halba_boxing_profile_v1 || '').indexOf('PIN7777') === -1);

  // --- 3. Tabs work after registration ---
  tabByName('training').click();
  check('post-reg: training panel opens', panels[3].classList.contains('active'));
  tabByName('match').click();
  check('post-reg: match panel opens', panels[2].classList.contains('active'));
  tabByName('home').click();
  check('post-reg: home panel opens from bottom bar', panels[0].classList.contains('active'));
  check('post-reg: avatar visible again on home', avatarCalls.setVisible[avatarCalls.setVisible.length - 1] === true);
  tabByName('match').click();
  check('post-reg: avatar hidden when leaving home', avatarCalls.setVisible[avatarCalls.setVisible.length - 1] === false);
  tabByName('profile').click();
  check('post-reg: profile panel opens from bottom bar', panels[1].classList.contains('active'));
  tabByName('home').click();
  check('post-reg: back home from bottom bar', panels[0].classList.contains('active'));

  // حفظ بكود قصير: يُحفظ محلياً لكن السحابة ترفض — رسالة واضحة.
  els.fCode.value = '123';
  els.btnSaveProfile.click();
  check('save: short code warns (6 chars min)', (els.profileSaved.textContent || '').indexOf('6 أحرف') !== -1);

  // --- 4. Logout: back to the clean login screen ---
  els.btnLogout.click();
  check('logout: nav hidden', els.mainTabs.style.display === 'none');
  check('logout: profile bar hidden', els.profileBar.style.display === 'none');
  check('logout: notice hidden', els.noticeCard.style.display === 'none');
  check('logout: logout hidden', els.logoutWrap.style.display === 'none');
  check('logout: login card visible', els.loginCard.style.display === '');
  check('logout: register hidden', els.registerCard.style.display === 'none');
  check('logout: register link visible', els.showRegisterWrap.style.display === '');
  check('logout: match tab hidden', tabByName('match').style.display === 'none');
  check('logout: home tab hidden', tabByName('home').style.display === 'none');
  check('logout: profile panel active again', panels[1].classList.contains('active'));
  check('logout: home panel not active', !panels[0].classList.contains('active'));
  check('logout: avatar hidden on logout', avatarCalls.setVisible[avatarCalls.setVisible.length - 1] === false);
  check('logout: profile cleared', (store.halba_boxing_profile_v1 || '').indexOf('سليم') === -1);
  check('logout: cloud link cleared', !store.halba_boxing_cloud_link_v1);

  console.log(fail === 0 ? 'ALL GATE TESTS PASS' : 'GATE TESTS FAILED: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('GATE TEST CRASH', e); process.exit(1); });
