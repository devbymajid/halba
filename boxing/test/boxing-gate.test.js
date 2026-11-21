// Boxing gate test — run: node test/boxing-gate.test.js
// Loads the real boxing JS files + the inline script from boxing.html,
// then asserts: pre-registration only cheer shows, tabs hidden;
// after saving a profile, all tabs show and cheer hides.
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

const IDS = ['profileBar', 'fName', 'fCode', 'fAge', 'fAnime', 'btnSaveProfile', 'profileSaved', 'profileStats',
  'welcomeCheer', 'heroSub', 'matchTimer', 'hpPlayer', 'hpBot', 'hpPlayerText', 'hpBotText', 'botName',
  'matchHits', 'matchHalf', 'matchDodges', 'matchCommand', 'matchFeedback', 'matchVideo', 'matchCanvas',
  'btnStartMatch', 'btnStopMatch', 'btnSimFullMatch', 'btnSimHalfMatch',
  'trainMove', 'trainTarget', 'trainCommand', 'trainFeedback', 'trainCount', 'trainHalf', 'trainAcc', 'trainStreak',
  'btnStartTraining', 'btnStopTraining', 'btnSimFullTrain', 'btnSimHalfTrain',
  'comboList', 'comboSteps', 'comboCommand', 'comboFeedback', 'btnStartCombo', 'btnSimFullCombo', 'btnSimHalfCombo',
  'cameraStatus', 'btnStartCamera', 'btnStopCamera'];
const els = {};
IDS.forEach((id) => { els[id] = makeEl(id); });

const tabNames = ['profile', 'match', 'training', 'combos', 'camera'];
const tabBtns = tabNames.map((t) => {
  const b = makeEl('tab-' + t);
  b.getAttribute = (a) => (a === 'data-tab' ? t : null);
  return b;
});
const panels = ['profile', 'match', 'training', 'combos', 'camera'].map((t) => {
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
  },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(DIR, file), 'utf8'), sandbox, { filename: file });
}
['js/boxing-moves.js', 'js/boxing-profile.js', 'js/boxing-pose.js', 'js/boxing-match.js', 'js/boxing-training.js', 'js/boxing-combos.js'].forEach(load);

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
check('pre-reg: match tab hidden', tabByName('match').style.display === 'none');
check('pre-reg: training tab hidden', tabByName('training').style.display === 'none');
check('pre-reg: combos tab hidden', tabByName('combos').style.display === 'none');
check('pre-reg: camera tab hidden', tabByName('camera').style.display === 'none');
check('pre-reg: profile tab visible', tabByName('profile').style.display !== 'none');
check('pre-reg: cheer visible', els.welcomeCheer.style.display === '');
check('pre-reg: hero subtitle hidden', els.heroSub.style.display === 'none');
check('pre-reg: profile panel active', panels[0].classList.contains('active'));

// Clicking a hidden tab does nothing (guard)
tabByName('match').click();
check('pre-reg: clicking match tab does not switch panel', panels[0].classList.contains('active') && !panels[1].classList.contains('active'));

// --- 2. Register ---
els.fName.value = 'مجيد';
els.fCode.value = 'secret123';
els.fAge.value = '25';
els.fAnime.value = 'كايتو';
els.btnSaveProfile.click();
check('post-reg: match tab visible', tabByName('match').style.display === '');
check('post-reg: training tab visible', tabByName('training').style.display === '');
check('post-reg: combos tab visible', tabByName('combos').style.display === '');
check('post-reg: camera tab visible', tabByName('camera').style.display === '');
check('post-reg: cheer hidden', els.welcomeCheer.style.display === 'none');
check('post-reg: hero subtitle visible', els.heroSub.style.display === '');
check('post-reg: code stored as hash only', (store.halba_boxing_profile_v1 || '').indexOf('secret123') === -1);

// --- 3. Tabs work after registration ---
tabByName('training').click();
check('post-reg: training panel opens', panels[2].classList.contains('active'));
tabByName('match').click();
check('post-reg: match panel opens', panels[1].classList.contains('active'));

console.log(fail === 0 ? 'ALL GATE TESTS PASS' : 'GATE TESTS FAILED: ' + fail);
process.exit(fail === 0 ? 0 : 1);
