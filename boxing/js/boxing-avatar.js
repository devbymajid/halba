// Halba Boxing — عارض الأفاتار ثلاثي الأبعاد (Dero) للصفحة الرئيسية.
// مقتبس من النموذج الأولي test/avatar-prototype.html (نفس المكتبات والإصدارات
// ونفس منطق الجلد والضغط — راجع التعليقات).
// VRM 0.0 (specVersion 0.0) → three 0.149.0 + @pixiv/three-vrm 0.6.11، وواجهة VRM.from(gltf).
// يُحمَّل ببطء (lazy): لا يبدأ إلا عند فتح الرئيسية لأول مرة، حتى لا يثقل شاشة الدخول.
// الهودي مخفي افتراضياً: جسم النموذج تحت الهودي كان يظهر أسود لأن نسيج VRoid للجسم
// داكن في منطقة الصدر — الحل من النموذج الأولي: عند إخفاء الهودي تُزال خريطة مادة
// الجسم ويُستبدل لونها بلون جلد مسطح (0xebb092 من النسيج نفسه) مع shouldApplyUniforms.
// العضلات: مقياس العظام حسب المستوى (الصدر +3%، الذراعان +4% بحد 1.24 حتى لا تتباعد
// عند المستوى 10، الرجلان +2.5% لكل مستوى، بحد بصري يعادل المستوى 10)، والرأس يبقى
// بحجمه الطبيعي بمعاكسة مقياس الرقبة.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';

const VRM_URL = 'assets/dero.vrm';
const MAX_VISUAL_LEVEL = 10;
const SKIN_FLAT = 0xebb092; // لون الجلد من نسيج VRoid نفسه (235,176,146)
const CAM_HOME = { pos: [0, 1.1, 3.0], look: [0, 0.9, 0] };
const CAM_PUSHUP = { pos: [0, 0.8, 3.6], look: [0, 0.25, 0] };

const stage = document.getElementById('avatarStage');
const statusEl = document.getElementById('avatarStatus');
const pushupBtn = document.getElementById('btnAvatarPushup');
const hoodieBtn = document.getElementById('btnAvatarHoodie');

let state = 'idle'; // idle | loading | ready | error
let vrm = null;
let renderer = null, scene = null, camera = null, clock = null, rafId = null;
let avatarRoot = null, proneGroup = null;
let hoodieMeshes = [];
let bodyBaseMat = null; // المادة الأساسية للجسم (جلد)
let bodyBaseMap = null;
let hoodieOn = false;
let pushupOn = false, pushupTime = 0;
let level = 1;
let visible = true;
let HIPS_Y0 = 1.008; // ارتفاع عظمة الوركين الأصلي — يُقرأ من العظمة بعد التحميل

const MUSCLE_BONES = ['chest', 'upperChest', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'neck'];

// وقفة هادئة بدل T-pose: الذراعان لتحت على الجناب، مع ثنية خفيفة في المرفقين.
// (بعد التدوير y=π: الكتف الأيسر يحتاج z موجب لينزّل الذراع، والأيمن z سالب — تم التحقق بصرياً.)
const IDLE_POSE = [
  ['leftShoulder', 0, 0, 1.25],
  ['rightShoulder', 0, 0, -1.25],
  ['leftLowerArm', -0.12, 0, 0],
  ['rightLowerArm', -0.12, 0, 0],
];

function setStatus(msg, ok) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.toggle('ok', ok === true);
  statusEl.classList.toggle('err', ok === false);
}

function refreshStatus() {
  if (state === 'ready') setStatus('ديرو — المستوى ' + level + ' — درّب باش تكبر عضلاتو!', true);
}

function getBone(name) {
  if (!vrm) return null;
  try { return vrm.humanoid.getBoneNode(name); } catch (e) { return null; }
}

function applyIdlePose() {
  IDLE_POSE.forEach((row) => {
    const b = getBone(row[0]);
    if (b) b.rotation.set(row[1], row[2], row[3]);
  });
}

function applyLevel(lv) {
  level = Math.min(Math.max(parseInt(lv, 10) || 1, 1), MAX_VISUAL_LEVEL);
  if (!vrm) return;
  const chestS = 1 + (level - 1) * 0.03;
  // الذراعان: +4% لكل مستوى بحد 1.24 — فوقه تتباعد الذراعان وتظهر بقع داكنة عند الكتفين.
  const armS = Math.min(1 + (level - 1) * 0.04, 1.24);
  const legS = 1 + (level - 1) * 0.025;
  const set = (name, x, y, z) => { const b = getBone(name); if (b) b.scale.set(x, y, z); };
  set('chest', chestS, 1, chestS);
  set('upperChest', chestS, 1, chestS);
  set('leftUpperArm', armS, 1, armS);
  set('rightUpperArm', armS, 1, armS);
  set('leftLowerArm', armS, 1, armS);
  set('rightLowerArm', armS, 1, armS);
  set('leftUpperLeg', legS, 1, legS);
  set('rightUpperLeg', legS, 1, legS);
  set('leftLowerLeg', legS, 1, legS);
  set('rightLowerLeg', legS, 1, legS);
  set('neck', 1 / (chestS * chestS), 1, 1 / (chestS * chestS));
}

// لون مادة MToon: `color` فيها Vector4 (وليست THREE.Color)،
// فالضبط يكون بأرقام 0..1 — و`.set(hex)` يعطي أبيضاً.
function setMatColor(mat, hex) {
  if (!mat || !mat.color) return;
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  if (typeof mat.color.setRGB === 'function') mat.color.setRGB(r, g, b);
  else if (typeof mat.color.set === 'function') mat.color.set(r, g, b, 1);
  else if (mat.uniforms && mat.uniforms.color) mat.uniforms.color.value.setRGB(r, g, b);
}

function setHoodie(on) {
  hoodieOn = on;
  hoodieMeshes.forEach((m) => { m.visible = on; });
  if (bodyBaseMat) {
    if (on) {
      bodyBaseMat.map = bodyBaseMap;
      setMatColor(bodyBaseMat, 0xffffff);
    } else {
      bodyBaseMap = bodyBaseMat.map || bodyBaseMap;
      bodyBaseMat.map = null;
      setMatColor(bodyBaseMat, SKIN_FLAT);
    }
    bodyBaseMat.needsUpdate = true;
    // MToon لا يطبّق اللون/النسيج إلا إذا رُفعت هذه الراية.
    bodyBaseMat.shouldApplyUniforms = true;
  }
  if (hoodieBtn) hoodieBtn.textContent = on ? 'إخفاء الهودي' : 'إظهار الهودي';
}

function resetPushupPose() {
  if (!proneGroup || !avatarRoot) return;
  proneGroup.rotation.x = 0;
  proneGroup.position.y = 0;
  proneGroup.position.z = 0;
  avatarRoot.rotation.y = 0;
  ['hips', 'spine', 'chest', 'neck'].forEach((name) => {
    const b = getBone(name);
    if (!b) return;
    b.rotation.set(0, 0, 0);
    // عظمة الوركين: موقعها الأصلي y ≈ 1.008 — لا تصفّره أبداً
    // (تصفيره يغرق الجسم كله متراً كاملاً تحت الأرض).
    if (name === 'hips') b.position.y = HIPS_Y0;
  });
  applyIdlePose(); // الوقفة الهادئة ترجع بعد التمرين
}

// دورة ضغط واحدة (~2.4 ثانية): نزول ثم صعود — الجسم مائل كلوح، مستلقٍ على بطنه.
// (المحور الصحيح لأرجحة الذراع نحو الأرض هو rotation.y؛ وrotation.z يأرجحها على طول الجسم.)
function updatePushup(dt) {
  if (!pushupOn || !vrm) return;
  pushupTime += dt;
  const cycle = 2.4;
  const p = (pushupTime % cycle) / cycle;
  const down = 0.5 - 0.5 * Math.cos(2 * Math.PI * p); // 0 فوق، 1 تحت
  const tilt = 0.38 - down * 0.17;
  proneGroup.rotation.x = Math.PI / 2 - tilt;
  proneGroup.position.y = 0.02;
  const hips = getBone('hips');
  const spine = getBone('spine');
  const chest = getBone('chest');
  const neck = getBone('neck');
  if (hips) hips.position.y = HIPS_Y0 - down * 0.02;
  if (spine) spine.rotation.x = down * 0.12;
  if (chest) chest.rotation.x = down * 0.10;
  if (neck) neck.rotation.x = -down * 0.15;
  const shoulderZ = down * 0.9;
  const rSh = getBone('rightShoulder'); if (rSh) rSh.rotation.set(0, 1.57, -shoulderZ);
  const lSh = getBone('leftShoulder'); if (lSh) lSh.rotation.set(0, -1.57, shoulderZ);
  const elbowZ = down * 2.15;
  const rEl = getBone('rightLowerArm'); if (rEl) rEl.rotation.set(0, 0, elbowZ);
  const lEl = getBone('leftLowerArm'); if (lEl) lEl.rotation.set(0, 0, -elbowZ);
}

function setCamera(preset) {
  if (!camera) return;
  camera.position.set(preset.pos[0], preset.pos[1], preset.pos[2]);
  camera.lookAt(preset.look[0], preset.look[1], preset.look[2]);
}

function setPushup(on) {
  if (!vrm && on) return;
  pushupOn = on;
  if (pushupBtn) pushupBtn.textContent = on ? '⏸ إيقاف تمرين الضغط' : '▶ شوفو كيدير الضغط';
  if (on) {
    // إرقد الجسم وواجهه من الجنب: الوجه نحو الأرض، والرأس نحو اليمين —
    // الكاميرا ترى الحركة جانبياً، وتنزل لتنظر إلى الجسم الممدد.
    proneGroup.rotation.x = Math.PI / 2 - 0.38;
    proneGroup.position.y = 0.02;
    proneGroup.position.z = -0.75; // وسّط الجسم أفقياً في فضاء avatarRoot
    avatarRoot.rotation.y = Math.PI / 2;
    setCamera(CAM_PUSHUP);
    pushupTime = 0;
  } else {
    resetPushupPose();
    setCamera(CAM_HOME);
  }
}

// إيقاف كامل (عند الخروج أو مغادرة الرئيسية): لا يبقى مستلقياً أبداً.
function reset() {
  if (pushupOn) setPushup(false);
  else resetPushupPose();
  if (pushupBtn) pushupBtn.textContent = '▶ شوفو كيدير الضغط';
}

function resize() {
  if (!renderer || !stage || !camera) return;
  const w = stage.clientWidth || 300, h = stage.clientHeight || 400;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function startLoop() {
  if (rafId !== null || !renderer) return;
  if (!clock) clock = new THREE.Clock();
  const tick = () => {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible) return;
    if (vrm) vrm.update(dt);
    updatePushup(dt);
    renderer.render(scene, camera);
  };
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

async function init() {
  if (state === 'loading' || state === 'ready') return;
  if (!stage) { state = 'error'; return; }
  // إعادة محاولة بعد فشل سابق: أزل أي canvas قديم حتى لا يتراكم فوق الجديد.
  if (renderer && renderer.domElement && renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
    renderer = null;
  }
  state = 'loading';
  setStatus('جارٍ تحميل الأفاتار…');
  // مستوى اللاعب الحقيقي (قد تكون الوحدة حمّلت بعد renderProfile — لا نبدأ بالمستوى 1).
  try {
    const P = window.HalbaBoxingProfile;
    if (P && P.loadProfile) { const p = P.loadProfile(); if (p && p.level) level = p.level; }
  } catch (e) { /* يبقى المستوى الافتراضي */ }
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth || 300, stage.clientHeight || 400);
    renderer.outputEncoding = THREE.sRGBEncoding;
    stage.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, (stage.clientWidth || 300) / (stage.clientHeight || 400), 0.1, 100);
    setCamera(CAM_HOME);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x331155, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(2, 4, 3);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0x00e5ff, 0.5);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.95, 0.08, 48),
      new THREE.MeshStandardMaterial({ color: 0x200040, roughness: 0.4, metalness: 0.3 })
    );
    platform.position.y = -0.04;
    scene.add(platform);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.015, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff2e88 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ring);

    avatarRoot = new THREE.Group();
    proneGroup = new THREE.Group();
    avatarRoot.add(proneGroup);
    scene.add(avatarRoot);

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(VRM_URL);
    vrm = await VRM.from(gltf);
    vrm.scene.rotation.y = Math.PI;
    proneGroup.add(vrm.scene);
    vrm.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const names = mats.map((m) => (m && m.name) || '').join(',');
      if (names.includes('Tops')) hoodieMeshes.push(o);
      if (o.name === 'Body' && !bodyBaseMat) bodyBaseMat = mats[0];
    });
    const hipsBone = getBone('hips');
    if (hipsBone) HIPS_Y0 = hipsBone.position.y; // ≈1.008
    setHoodie(false); // افتراضياً بلا هودي — بالشورت فقط، الجسم يبان
    applyLevel(level);
    applyIdlePose();
    state = 'ready';
    refreshStatus();
    startLoop();
  } catch (e) {
    state = 'error';
    setStatus('تعذّر تحميل الأفاتار — تحقق من الاتصال ثم افتح الرئيسية من جديد.', false);
    if (window.console) console.error(e);
  }
}

if (pushupBtn) pushupBtn.addEventListener('click', () => { if (state === 'ready') setPushup(!pushupOn); });
if (hoodieBtn) hoodieBtn.addEventListener('click', () => { if (state === 'ready') setHoodie(!hoodieOn); });
window.addEventListener('resize', resize);

const Avatar = {
  init,
  setLevel: (lv) => { level = lv; applyLevel(lv); refreshStatus(); },
  togglePushup: () => setPushup(!pushupOn),
  toggleHoodie: () => setHoodie(!hoodieOn),
  setVisible: (v) => {
    visible = !!v;
    if (v) { resize(); startLoop(); }
    else { reset(); stopLoop(); }
  },
  reset,
  isReady: () => state === 'ready',
};
window.HalbaBoxingAvatar = Avatar;

// إن حُمّلت الوحدة والرئيسية ظاهرة أصلاً (عودة بعد الدخول)، ابدأ فوراً.
if (document.getElementById('panel-home') && document.getElementById('panel-home').classList.contains('active')) init();
