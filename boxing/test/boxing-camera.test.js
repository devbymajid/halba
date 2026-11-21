// Boxing camera test — run: node test/boxing-camera.test.js
// Stubs navigator/mediaDevices + MediaPipe Pose to prove initCamera:
// (1) no getUserMedia at all -> clear "open in Safari" message, simulation mode
// (2) permission denied -> permission message, simulation mode
// (3) no camera device -> no-device message, simulation mode
// (4) working camera -> single getUserMedia call, mode camera, landmarks flow
// (5) double start -> one stream only (D1)
// (6) play() rejects -> stream stopped, no leak (D2)
// (7) stop during start / during script load -> no camera starts (D3)
// (8) simulation refused while camera runs or starts (P8 guard)
// (9) D4: start A -> stop -> start B -> A settles -> start C reuses B, no 3rd call
// (10) P8: simulation already running stops when the camera goes live
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const DIR = path.join(__dirname, '..');

function fakeLandmarks() {
  const lm = [];
  for (let i = 0; i < 33; i++) lm.push({ x: 0.5, y: 0.5, z: 0 });
  return lm;
}

function makeContext(getUserMediaImpl) {
  const scripts = [];
  const store = {};
  let rafId = 0;
  const rafQueue = [];
  const video = {
    srcObject: null, muted: false, playsInline: false,
    play: () => Promise.resolve(),
  };
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => { rafId++; rafQueue.push(fn); return rafId; },
    cancelAnimationFrame: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    navigator: getUserMediaImpl === null ? {} : { mediaDevices: { getUserMedia: getUserMediaImpl } },
    document: {
      querySelector: () => null,
      head: { appendChild: (s) => { scripts.push(s); setTimeout(() => { if (typeof s.onload === 'function') s.onload(); }, 0); } },
      createElement: (tag) => ({ tagName: tag, src: '', async: false, onload: null, onerror: null }),
    },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  // Fake MediaPipe Pose: send() delivers 33 landmarks via onResults.
  sandbox.window.Pose = function () {
    this.setOptions = () => {};
    this.onResults = (cb) => { this._cb = cb; };
    this.send = async () => { if (this._cb) this._cb({ poseLandmarks: fakeLandmarks() }); };
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'js/boxing-pose.js'), 'utf8'), sandbox, { filename: 'boxing-pose.js' });
  vm.runInContext(fs.readFileSync(path.join(DIR, 'js/boxing-moves.js'), 'utf8'), sandbox, { filename: 'boxing-moves.js' });
  return { sandbox, video, rafQueue };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name); }
}
function err(name, msg) { const e = new Error(msg); e.name = name; return e; }

(async () => {
  // 1. No getUserMedia at all (in-app browser without camera support)
  {
    const { sandbox, video } = makeContext(null);
    let status = '';
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: (m) => { status = m; }, onLandmarks: () => {} });
    const ok = await t.initCamera(video);
    check('no getUserMedia -> initCamera returns false', ok === false);
    check('no getUserMedia -> mode simulated', t.mode === 'simulated');
    check('no getUserMedia -> message says open in Safari', status.indexOf('Safari') !== -1);
  }
  // 2. Permission denied
  {
    const { sandbox, video } = makeContext(() => Promise.reject(err('NotAllowedError', 'Permission denied')));
    let status = '';
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: (m) => { status = m; }, onLandmarks: () => {} });
    const ok = await t.initCamera(video);
    check('denied -> returns false', ok === false);
    check('denied -> message asks for permission', status.indexOf('الإذن') !== -1);
  }
  // 3. No camera device
  {
    const { sandbox, video } = makeContext(() => Promise.reject(err('NotFoundError', 'Requested device not found')));
    let status = '';
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: (m) => { status = m; }, onLandmarks: () => {} });
    const ok = await t.initCamera(video);
    check('no device -> returns false', ok === false);
    check('no device -> message says no camera found', status.indexOf('ما لقيناش كاميرا') !== -1);
  }
  // 4. Working camera: exactly one getUserMedia call, landmarks flow via rAF loop
  {
    let calls = 0;
    const fakeStream = { getTracks: () => [{ stop: () => {} }] };
    const { sandbox, video, rafQueue } = makeContext(() => { calls++; return Promise.resolve(fakeStream); });
    let status = '', frames = 0;
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({
      onStatus: (m) => { status = m; },
      onLandmarks: () => { frames++; },
    });
    const ok = await t.initCamera(video);
    check('working camera -> returns true', ok === true);
    check('working camera -> mode camera', t.mode === 'camera');
    check('working camera -> single getUserMedia call (no second request)', calls === 1);
    check('working camera -> status says running', status.indexOf('شغالة') !== -1);
    // Drive the rAF loop twice; each tick sends one frame to Pose.
    const tick = rafQueue.shift(); if (tick) await tick();
    const tick2 = rafQueue.shift(); if (tick2) await tick2();
    check('working camera -> landmarks reach the tracker', frames >= 1);
    t.stop();
    check('stop -> mode idle', t.mode === 'idle');
  }
  // 5. Double start (double tap on the button): only one stream is opened
  {
    let calls = 0;
    const fakeStream = { getTracks: () => [{ stop: () => {} }] };
    const { sandbox, video, rafQueue } = makeContext(() => { calls++; return Promise.resolve(fakeStream); });
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: () => {}, onLandmarks: () => {} });
    const p1 = t.initCamera(video);
    const p2 = t.initCamera(video);
    const ok1 = await p1, ok2 = await p2;
    check('double start -> both calls succeed', ok1 === true && ok2 === true);
    check('double start -> single getUserMedia call (no leaked stream)', calls === 1);
    const p3 = await t.initCamera(video);
    check('start while running -> returns true without a new stream', p3 === true && calls === 1);
    t.stop();
    check('double start -> stop -> mode idle', t.mode === 'idle');
    void rafQueue;
  }
  // 6. getUserMedia succeeds but video.play() rejects: the stream must be stopped
  {
    let stopped = 0;
    const fakeStream = { getTracks: () => [{ stop: () => { stopped++; } }] };
    const { sandbox, video } = makeContext(() => Promise.resolve(fakeStream));
    video.play = () => Promise.reject(new Error('play failed'));
    let status = '';
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: (m) => { status = m; }, onLandmarks: () => {} });
    const ok = await t.initCamera(video);
    check('play() fails -> returns false', ok === false);
    check('play() fails -> mode simulated', t.mode === 'simulated');
    check('play() fails -> stream tracks stopped (no leaked camera)', stopped === 1);
    check('play() fails -> stream cleared', t.stream === null || t.stream === undefined);
    check('play() fails -> message still explains simulation', status.indexOf('المحاكاة') !== -1);
  }
  // 7. Stop pressed while getUserMedia is pending: the camera must not start afterwards
  {
    let resolveGum, calls = 0, stopped = 0;
    const fakeStream = { getTracks: () => [{ stop: () => { stopped++; } }] };
    const { sandbox, video } = makeContext(() => { calls++; return new Promise((r) => { resolveGum = r; }); });
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: () => {}, onLandmarks: () => {} });
    const p = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 10)); // let the script load and getUserMedia be called
    check('stop during start -> getUserMedia was called', calls === 1);
    t.stop();
    resolveGum(fakeStream);
    const ok = await p;
    check('stop during start -> returns false', ok === false);
    check('stop during start -> mode stays idle (not camera)', t.mode === 'idle');
    check('stop during start -> stream tracks stopped', stopped === 1);
    check('stop during start -> no stream kept', t.stream === null || t.stream === undefined);
  }
  // 8. Stop pressed while the MediaPipe script is still loading: getUserMedia never runs
  {
    let calls = 0;
    const { sandbox, video } = makeContext(() => { calls++; return Promise.resolve({ getTracks: () => [] }); });
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: () => {}, onLandmarks: () => {} });
    const p = t.initCamera(video);
    t.stop(); // immediately, before the script onload fires
    const ok = await p;
    check('stop during script load -> returns false', ok === false);
    check('stop during script load -> getUserMedia never called', calls === 0);
    check('stop during script load -> mode idle', t.mode === 'idle');
  }
  // 9. Simulation is refused while the camera is running, and works after stop
  {
    const fakeStream = { getTracks: () => [{ stop: () => {} }] };
    const { sandbox, video } = makeContext(() => Promise.resolve(fakeStream));
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: () => {}, onLandmarks: () => {} });
    const ok = await t.initCamera(video);
    check('sim blocked -> camera started', ok === true && t.mode === 'camera');
    const simOk = await t.simulateMove('JAB', true);
    check('sim while camera running -> refused', simOk === false);
    check('sim while camera running -> mode stays camera', t.mode === 'camera');
    t.stop();
    const simOk2 = await t.simulateMove('JAB', true);
    check('sim after stop -> works', simOk2 === true);
  }
  // 10. D4: start A -> stop -> start B -> A settles -> start C while B runs:
  // C must share B's in-flight promise, no third getUserMedia call, no orphan stream
  {
    let resolveA, resolveB, calls = 0;
    const streamA = { getTracks: () => [{ stop: () => {} }] };
    const streamB = { getTracks: () => [{ stop: () => {} }] };
    const { sandbox, video } = makeContext(() => { calls++; return calls === 1 ? new Promise((r) => { resolveA = r; }) : new Promise((r) => { resolveB = r; }); });
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: () => {}, onLandmarks: () => {} });
    const pA = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 10)); // A: script loaded, getUserMedia called
    t.stop();
    const pB = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 10)); // B: script loaded, getUserMedia called
    resolveA(streamA); // A settles as refused (generation changed)
    await pA;
    const pC = t.initCamera(video); // while B is still in flight
    check('D4 -> third start while B runs returns B promise', pC === pB);
    check('D4 -> no third getUserMedia call', calls === 2);
    resolveB(streamB);
    const okB = await pB;
    check('D4 -> B completes true', okB === true);
    check('D4 -> mode camera with B stream (no orphan)', t.mode === 'camera' && t.stream === streamB);
    t.stop();
    check('D4 -> stop after B -> mode idle', t.mode === 'idle');
  }
  // 11. P8: simulation refused while a camera start is still in flight
  {
    let resolveGum;
    const fakeStream = { getTracks: () => [{ stop: () => {} }] };
    const { sandbox, video } = makeContext(() => new Promise((r) => { resolveGum = r; }));
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: () => {}, onLandmarks: () => {} });
    const p = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 10)); // getUserMedia called, still pending
    const simOk = await t.simulateMove('JAB', true);
    check('sim during start -> refused', simOk === false);
    resolveGum(fakeStream);
    const ok = await p;
    check('sim during start -> camera still starts', ok === true && t.mode === 'camera');
    t.stop();
  }
  // 12. P8: simulation already in progress stops when the camera goes live
  {
    let resolveGum, frames = 0;
    const fakeStream = { getTracks: () => [{ stop: () => {} }] };
    const { sandbox, video } = makeContext(() => new Promise((r) => { resolveGum = r; }));
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({
      onStatus: () => {},
      onLandmarks: (lm) => { if (lm) frames++; },
    });
    const simP = t.simulateMove('JAB', true); // starts in simulated mode
    await new Promise((r) => setTimeout(r, 250)); // a couple of sim frames arrive
    check('P8 -> sim frames arrive first', frames >= 1);
    const camP = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 10));
    resolveGum(fakeStream);
    const ok = await camP;
    check('P8 -> camera starts', ok === true && t.mode === 'camera');
    const framesAtLive = frames;
    await new Promise((r) => setTimeout(r, 350)); // sim would have delivered ~3 more frames
    check('P8 -> no sim frames after camera live', frames === framesAtLive);
    const simOk = await simP;
    check('P8 -> sim promise resolves false (stopped)', simOk === false);
    t.stop();
  }
  // 13. D5 appearance 1: cancelled start A settles LATE, after B went live —
  // the live stream must survive, the loop must keep running, stop() must work
  {
    let resolveA, resolveB, calls = 0, stoppedA = 0, stoppedB = 0, frames = 0;
    const streamA = { getTracks: () => [{ stop: () => { stoppedA++; } }] };
    const streamB = { getTracks: () => [{ stop: () => { stoppedB++; } }] };
    const { sandbox, video, rafQueue } = makeContext(() => { calls++; return calls === 1 ? new Promise((r) => { resolveA = r; }) : new Promise((r) => { resolveB = r; }); });
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({
      onStatus: () => {},
      onLandmarks: (lm) => { if (lm) frames++; },
    });
    const pA = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 10)); // A: script loaded, getUserMedia called
    t.stop();
    const pB = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 10)); // B: script loaded, getUserMedia called
    resolveB(streamB);
    const okB = await pB;
    check('D5 late -> B goes live', okB === true && t.mode === 'camera' && t.stream === streamB);
    resolveA(streamA); // A settles late, after B is live
    const okA = await pA;
    check('D5 late -> cancelled A resolves false', okA === false);
    check('D5 late -> live stream intact, mode still camera', t.stream === streamB && t.mode === 'camera');
    check('D5 late -> live stream tracks not stopped', stoppedB === 0);
    check('D5 late -> late A stream stopped', stoppedA === 1);
    const tickFn = rafQueue.shift();
    if (tickFn) await tickFn(); // drive the rAF loop once
    check('D5 late -> loop still delivers landmarks', frames >= 1);
    t.stop();
    check('D5 late -> stop() stops the live stream', stoppedB === 1);
  }
  // 14. D5 appearance 2: cancelled start A stuck in play() rejects late, after B went live
  {
    let playCalls = 0, rejectPlayA, stoppedB = 0;
    const streamA = { getTracks: () => [{ stop: () => {} }] };
    const streamB = { getTracks: () => [{ stop: () => { stoppedB++; } }] };
    const { sandbox, video } = makeContext(() => Promise.resolve(streamA));
    video.play = () => { playCalls++; return playCalls === 1 ? new Promise((_, rej) => { rejectPlayA = rej; }) : Promise.resolve(); };
    const t = new sandbox.window.HalbaBoxingPose.PoseTracker({ onStatus: () => {}, onLandmarks: () => {} });
    const pA = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 15)); // A: script loaded, gum resolved, play pending
    check('D5 catch -> A waiting in play()', playCalls === 1);
    t.stop();
    // B's getUserMedia returns streamB (patched stub for the second call).
    sandbox.navigator.mediaDevices.getUserMedia = () => Promise.resolve(streamB);
    const pB = t.initCamera(video);
    await new Promise((r) => setTimeout(r, 15)); // B: script loaded, gum resolved, play resolves
    const okB = await pB;
    check('D5 catch -> B goes live', okB === true && t.mode === 'camera' && t.stream === streamB);
    rejectPlayA(new Error('play failed')); // A's play() rejects late
    const okA = await pA;
    check('D5 catch -> late A resolves false', okA === false);
    check('D5 catch -> live stream intact, mode still camera', t.stream === streamB && t.mode === 'camera');
    check('D5 catch -> live stream tracks not stopped', stoppedB === 0);
    t.stop();
  }
  console.log(fail === 0 ? 'ALL CAMERA TESTS PASS' : 'CAMERA TESTS FAILED: ' + fail);
  process.exit(fail === 0 ? 0 : 1);
})();
