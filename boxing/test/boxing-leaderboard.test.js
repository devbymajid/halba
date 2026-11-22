// Boxing leaderboard + camera-consent test — run: node test/boxing-leaderboard.test.js
// Loads the real boxing JS files + the inline script from boxing.html,
// then asserts: the camera-consent card shows on first training open (and only
// then), and the leaderboard renders a podium (1st on top alone, 2nd + 3rd
// below on the sides) then the rest one under another, sorted by XP then ELO.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const DIR = path.join(__dirname, '..');

function makeEl(id) {
  const classes = new Set();
  const listeners = {};
  return {
    id, style: {}, value: '', textContent: '', innerHTML: '', disabled: false,
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      toggle: (c, f) => { if (f === undefined) { if (classes.has(c)) classes.delete(c); else classes.add(c); } else if (f) classes.add(c); else classes.delete(c); },
      contains: (c) => classes.has(c),
    },
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    click: function () { (listeners.click || []).forEach((fn) => fn.call(this)); },
    appendChild: function () {},
    getAttribute: () => null,
  };
}

const IDS = ['profileBar', 'fName', 'fCode', 'fAge', 'fAnime', 'btnSaveProfile', 'profileSaved',
  'lName', 'lCode', 'btnLogin', 'loginMsg', 'cloudStatus',
  'loginCard', 'registerCard', 'linkShowRegister', 'linkShowLogin', 'showRegisterWrap', 'showLoginWrap',
  'mainTabs', 'noticeCard', 'logoutWrap', 'btnLogout',
  'heroSub', 'matchTimer', 'hpPlayer', 'hpBot', 'hpPlayerText', 'hpBotText', 'botName',
  'matchHits', 'matchHalf', 'matchDodges', 'matchCommand', 'matchFeedback', 'matchVideo', 'matchCanvas',
  'btnStartMatch', 'btnStopMatch', 'btnSimFullMatch', 'btnSimHalfMatch', 'lvl-easy', 'lvl-medium', 'lvl-hard',
  'trainMove', 'trainTarget', 'trainCommand', 'trainFeedback', 'trainCount', 'trainHalf', 'trainAcc', 'trainStreak',
  'btnStartTraining', 'btnStopTraining', 'btnSimFullTrain', 'btnSimHalfTrain',
  'comboList', 'comboSteps', 'comboCommand', 'comboFeedback', 'btnStartCombo', 'btnSimFullCombo', 'btnSimHalfCombo',
  'cameraStatus', 'btnStartCamera', 'btnStopCamera',
  'cameraConsentCard', 'btnConsentCamera', 'btnConsentLater',
  'leaderboardBody', 'btnRefreshLeaderboard', 'leaderboardMsg'];

function buildContext(store) {
  const els = {};
  IDS.forEach((id) => { els[id] = makeEl(id); });
  const tabNames = ['profile', 'match', 'training', 'combos', 'camera', 'leaderboard'];
  const tabBtns = tabNames.map((t) => {
    const b = makeEl('tab-' + t);
    b.getAttribute = (a) => (a === 'data-tab' ? t : null);
    return b;
  });
  const panels = tabNames.map((t) => {
    const p = makeEl('panel-' + t);
    p.id = 'panel-' + t;
    if (t === 'profile') p.classList.add('active');
    return p;
  });
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
  vm.createContext(sandbox);
  function load(file) {
    vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), sandbox, { filename: file });
  }
  ['js/boxing-moves.js', 'js/boxing-profile.js', 'js/firebase-config.js', 'js/boxing-firebase.js', 'js/boxing-pose.js', 'js/boxing-match.js', 'js/boxing-training.js', 'js/boxing-combos.js'].forEach(load);
  const html = fs.readFileSync(path.join(DIR, 'boxing.html'), 'utf8');
  const inline = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  vm.runInContext(inline, sandbox, { filename: 'boxing-inline.js' });
  return { els, tabBtns, panels, sandbox };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name); }
}

(async function () {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const store = {};
  const ctx = buildContext(store);
  const { els } = ctx;
  const tabByName = (t) => ctx.tabBtns.find((b) => b.getAttribute('data-tab') === t);

  // --- 1. Gating: leaderboard tab hidden before registration ---
  check('gate: leaderboard tab hidden pre-reg', tabByName('leaderboard').style.display === 'none');
  check('gate: training tab hidden pre-reg', tabByName('training').style.display === 'none');

  // --- 2. Register (local player مجيد) ---
  els.linkShowRegister.click();
  els.fName.value = 'مجيد';
  els.fCode.value = 'secret123';
  els.fAge.value = '25';
  els.fAnime.value = 'كايتو';
  els.btnSaveProfile.click();
  check('gate: leaderboard tab visible post-reg', tabByName('leaderboard').style.display === '');

  // --- 3. Camera consent: first training open shows it ---
  tabByName('training').click();
  check('consent: shown on first training open', els.cameraConsentCard.style.display === '');
  const realHtml = fs.readFileSync(path.join(DIR, 'boxing.html'), 'utf8');
  check('consent: message mentions 100% + cheating + ranking', realHtml.indexOf('100%') !== -1 && realHtml.indexOf('الغش') !== -1 && realHtml.indexOf('الترتيب العام') !== -1 && realHtml.indexOf('لا يُسجَّل') !== -1);
  els.btnConsentLater.click();
  check('consent: later hides it for now', els.cameraConsentCard.style.display === 'none');
  check('consent: later does not set the flag', !store.halba_boxing_camera_consent_v1);
  tabByName('profile').click();
  tabByName('training').click();
  check('consent: shown again after later', els.cameraConsentCard.style.display === '');
  els.btnConsentCamera.click();
  check('consent: accept hides it', els.cameraConsentCard.style.display === 'none');
  check('consent: accept sets the flag', store.halba_boxing_camera_consent_v1 === '1');
  tabByName('profile').click();
  tabByName('training').click();
  check('consent: stays hidden after accept', els.cameraConsentCard.style.display === 'none');

  // --- 4. Fresh load (same store): consent still remembered ---
  const ctx2 = buildContext(store);
  const tab2 = (t) => ctx2.tabBtns.find((b) => b.getAttribute('data-tab') === t);
  tab2('training').click();
  check('consent: hidden on fresh load after accept', ctx2.els.cameraConsentCard.style.display === 'none');

  // --- 5. Leaderboard: 5 players, XP tie broken by ELO ---
  vm.runInContext(`
    (function () {
      var store2 = new Map();
      function docOf(p, code) { return HalbaBoxingCloud.toCloudDoc(p, code); }
      store2.set('boxing_profiles/أمينة', docOf({ name: 'أمينة', age: 22, anime: 'سارة', elo: 1400, xp: 500, level: 6, wins: 8, losses: 1, draws: 0, matches: 9 }, 'CODE111'));
      store2.set('boxing_profiles/سليم', docOf({ name: 'سليم', age: 20, anime: 'كايتو', elo: 1300, xp: 300, level: 4, wins: 5, losses: 2, draws: 0, matches: 7 }, 'CODE222'));
      store2.set('boxing_profiles/يوسف', docOf({ name: 'يوسف', age: 19, anime: 'ليان', elo: 1100, xp: 300, level: 4, wins: 4, losses: 3, draws: 0, matches: 7 }, 'CODE333'));
      store2.set('boxing_profiles/مجيد', docOf({ name: 'مجيد', age: 25, anime: 'كايتو', elo: 1050, xp: 150, level: 2, wins: 2, losses: 2, draws: 0, matches: 4 }, 'secret123'));
      store2.set('boxing_profiles/ليان', docOf({ name: 'ليان', age: 18, anime: 'سارة', elo: 1000, xp: 50, level: 1, wins: 0, losses: 1, draws: 0, matches: 1 }, 'CODE555'));
      var db = { collection: function (name) { return {
        doc: function (id) { var key = name + '/' + id; return {
          get: async function () { return { exists: store2.has(key), data: function () { return store2.get(key) || null; } }; },
          create: async function (data) { if (store2.has(key)) { var e = new Error('already exists'); e.code = 'already-exists'; throw e; } store2.set(key, Object.assign({}, data)); },
          set: async function (data, opts) { if (opts && opts.merge) store2.set(key, Object.assign({}, store2.get(key) || {}, data)); else store2.set(key, Object.assign({}, data)); }
        }; },
        get: async function () { return { forEach: function (cb) { store2.forEach(function (v, k) { cb({ id: k.split('/')[1], data: function () { return v; } }); }); } }; }
      }; } };
      HalbaBoxingCloud.setFirestore(db);
    })();
  `, ctx.sandbox, { filename: 'leaderboard-cloud-setup.js' });

  tabByName('leaderboard').click();
  await tick(); await tick(); await tick();
  const html1 = els.leaderboardBody.innerHTML || '';
  check('board: 1st is highest XP (أمينة)', html1.indexOf('أمينة') !== -1 && html1.indexOf('أمينة') < html1.indexOf('سليم'));
  check('board: podium first holds أمينة', html1.indexOf('podium-first') !== -1 && html1.indexOf('أمينة') < html1.indexOf('podium-row'));
  check('board: 2nd beats 3rd on ELO tie (سليم before يوسف)', html1.indexOf('سليم') < html1.indexOf('يوسف'));
  check('board: 2nd + 3rd on the sides row', html1.indexOf('podium-row') !== -1 && html1.indexOf('podium-side second') !== -1 && html1.indexOf('podium-side third') !== -1);
  check('board: rest one under another (مجيد 4th before ليان 5th)', html1.indexOf('مجيد') !== -1 && html1.indexOf('مجيد') < html1.indexOf('ليان') && html1.indexOf('rank-list') !== -1);
  check('board: current player highlighted', html1.indexOf('rank-row me') !== -1);
  check('board: medals present', html1.indexOf('🥇') !== -1 && html1.indexOf('🥈') !== -1 && html1.indexOf('🥉') !== -1);

  // Refresh button reloads the same order
  els.btnRefreshLeaderboard.click();
  await tick(); await tick(); await tick();
  const html2 = els.leaderboardBody.innerHTML || '';
  check('board: refresh keeps order', html2.indexOf('أمينة') < html2.indexOf('سليم') && html2.indexOf('سليم') < html2.indexOf('يوسف'));

  // --- 6. Empty leaderboard ---
  vm.runInContext(`
    HalbaBoxingCloud.setFirestore({ collection: function () { return {
      doc: function () { return { get: async function () { return { exists: false, data: function () { return null; } }; } }; },
      get: async function () { return { forEach: function () {} }; }
    }; } });
  `, ctx.sandbox, { filename: 'leaderboard-empty-setup.js' });
  els.btnRefreshLeaderboard.click();
  await tick(); await tick(); await tick();
  check('board: empty state', (els.leaderboardBody.innerHTML || '').indexOf('لا يوجد لاعبون بعد') !== -1);

  console.log(fail === 0 ? 'ALL LEADERBOARD TESTS PASS' : 'LEADERBOARD TESTS FAILED: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
