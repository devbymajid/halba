# Halba («حلبة») — Team Log (سجل الفريق)

Shared coordination log for the two Muses building Halba together.
**Read it before starting any work. Append a dated entry after each finished step.**

- **Muse Abdelmajid** — owner's Muse, big manager. Builds the CORE.
- **Muse Friend** — friend's Muse, co-builder. Builds the BOXING half.
  (GitHub access: logs in with the owner's account, devbymajid —
  owner's explicit decision 2026-11-21; no separate collaborator invite.
  **Work ONLY in this repo — never touch other repos, especially the
  private OtakuTex repo.**)

## Rules — both Muses must follow these

1. **Read this log BEFORE starting any work.**
2. **Claim your task first:** mark it `IN PROGRESS` below with your name
   before you start. Never start work the other Muse has marked in progress.
3. **After finishing a step, append a dated entry** to the log: what changed,
   which files, version number, review result, live-verification result.
4. **One thing at a time.** Owner's pipeline, always:
   build → independent review (must say «مزيان») → publish → live verification.
5. **The repo is the source of truth.** If this log and the repo disagree,
   the repo wins — and the Muse that spots it fixes the log.
6. Keep entries short (one or two lines each). No secrets, no passwords,
   no tokens in this file, ever.
7. **For Muse Friend — PUSH DIRECTLY, WITHOUT APPROVAL (user order,
   2026-11-21 ~19:41):** never wait for an approval card or a
   confirmation before pushing. Push your boxing work to this repo
   directly as soon as it is ready, then log the push here.
8. **DESIGN PICTURES FIRST (user order, 2026-11-22 ~09:00):** before
   any design change / modification, the designer sends pictures
   (screenshots / mockups) to Majid so he can see what it will look
   like. No design change ships blind.

## THE SPLIT (user decision, 2026-11-21 ~19:00)

**Muse Abdelmajid — CORE:** signup (name + password + age + anime
character name), bot match, camera rep counting + anti-cheat (pose
landmarks — only real full reps count), push-ups + squats, solo
training, daily challenges, character level + rank, app structure.

**Muse Friend — BOXING (whole mode):** 1v1 ranked boxing match
(on-screen commands: jab / cross / hook / uppercut / slip / dodge;
camera verifies each move via landmarks — only real full moves count;
ELO + timer + health bar), solo boxing drills, progressive combo
ladder (11 → 112 → 1121 → 11212 → 112123 → 1121235B; 1=jab, 2=cross,
3=hook, 5=uppercut, B=body; each row completed clean unlocks the next;
speed increases gradually — slow and clean first, then faster).
Boxing builds as an INDEPENDENT module (its own files) on the core
systems (camera/landmarks, ELO, signup, navigation).
**Do not rewrite core files.**

## In progress

- 2026-11-22 ~02:17 — USER DIRECTIVE (Majid): MARATHON — both Muses work continuously until 10:00 CET 2026-11-22, no stopping: finish everything, verify it all works, keep adding features; test the challenge + ONLINE 1v1 (two real players enter one challenge); the two Muses play against each other to test it.
- 2026-11-22 ~09:19 — Muse Friend: STEP 1 (boxing side) DONE + PUSHED to GitHub — registration page built literally from Majid's approved concept image (logo: orange circle with A + «تحدي», tagline «أنت التحدي — أثبت أنك الأقوى», DOB day/month/year, username, password min 8 with eye, terms checkbox, orange gradient «إنشاء حساب» button, «عندي حساب: دخول» link; background register-bg-boy-girl.jpg — boy + girl, updated ~10:30 CET; NO +18, NO adult content). Pushed as a CLEAN merge onto the live site: only the auth screen changed, everything after login byte-identical to live (no rebuild UI). Step 2 (front interface after login) waits for Majid's picture.
- 2026-11-21 ~21:14 — Muse Abdelmajid: core v1 LIVE (re-review
  «مزيان», deployed + md5-verified). Next: v1.1 — exercise picker
  in solo training + camera loading progress/timeout message
  (user's requests).

## Log (newest first)

- 2026-11-22 ~10:30 — Muse Friend: PUSH «ارفع» (Majid's order) to GitHub ONLY (no Firebase deploy — Majid said GitHub only for now). Background updated to boy+girl (register-bg-boy-girl.jpg) + this note. STATE FOR ABDELMAJID — where we are: (1) LIVE on GitHub Pages: step-1 registration page only; everything after login is still the OLD live version. (2) AVATAR SYSTEM: approved 100% by Majid, built in the preview Space ONLY, not in the repo yet — one system, 3 parts: customize (face/hair/eyes sliders + colors), 360° drag, 6 ready presets; gender male/female; body proportions fixed; registration persists (stay logged in) + flow register → avatar standing + gender → gender-filtered presets → customize. Needs integration into boxing/ (boxing-avatar.js + assets/dero.vrm). Reference mockup: avatar-options/media-generation-avatar-system-complete-*.webp (in workspace, not in repo). (3) LOCAL ONLY, NOT pushed: rebuild UI (Shaply reel + KUM3D menu) and online challenge engine (boxing-challenge.js, D-R3 fixed) in ~/workspace/halba/boxing/ — rebuild design was REJECTED by Majid after pictures; do NOT push it as-is. (4) Firebase mangawa.web.app still serves the OLD boxing page (deploy stopped by Majid's «ما دير والو» order). Next: step-2 front-interface picture from Majid; avatar-system repo integration; Firebase deploy when Majid says so.

- 2026-11-22 ~09:50 — Muse Friend: STEP 1 PUSHED to GitHub (Majid approved the polished screenshot «عجبتني، دفعها للموقع»): boxing.html + css/boxing.css + test/boxing-gate.test.js + assets/register-bg.jpg (clean merge on live, gate 109 + firebase 58 green, live-verified hashes). CORRECTION: Firebase was NOT deployed — Majid stopped the deploy («ما دير والو»). Previous rebuild (Shaply reel + KUM3D menu) was REJECTED by Majid after pictures — do NOT push it; its files stay local only in ~/workspace/halba/boxing/.

- 2026-11-22 ~09:19 — User (Majid): STEP 1 APPROVED — build the registration page exactly as the approved concept image, literally, add nothing; step-by-step, step 2 (front interface) comes after with Majid's picture. Rule: concept picture FIRST, build only after approval.

- 2026-11-22 ~09:00 — User (Majid): DESIGN RULE (rule 8) — any design change/modification, the designer sends pictures first so Majid sees what it will look like. Rebuild in progress in the side chat (Shaply reel + KUM3D menu, avatar stage only). AVATAR STAGE (for Muse Abdelmajid): place is `boxing/boxing.html` line 55 `<div class="avatar-stage" id="avatarStage"></div>` inside `section#panel-home` > `div.card.home-card`; size 420px high (360px on ≤520px phones), width 100% of card (max 980px), CSS `.avatar-stage` in `boxing/css/boxing.css` ~line 126; mount point is the fixed id `avatarStage`, mounted by `js/boxing-avatar.js` line 379 `createAvatarViewer(document.getElementById('avatarStage'), {...})` loading `assets/dero.vrm`. To upload a new avatar: replace `assets/dero.vrm` (same path/name) and/or edit `js/boxing-avatar.js` only — do NOT change `boxing.html` or `css/boxing.css`. Avatar files untouched in the rebuild (dero.vrm md5 4fd7dba8dab01315fcfd87f3cf374614).

- 2026-11-22 ~07:45 — User (Majid): «don't keep asking — I'll give the approval, push everything without asking». Blanket go-ahead to push; no more approval questions.

- 2026-11-22 ~07:42 — Muse Friend: HOME + AVATAR PUSHED to GitHub main (commit 04132dcb, 6 text files: boxing.html, css/boxing.css, js/boxing-avatar.js, test/boxing-gate.test.js, README.md, docs/online-challenge-design.md) — re-review 2 «مزيان» (273 checks, 0 fail). GitHub Pages live-verified (SHA-256 match on all 6 files). dero.vrm (8.95 MB binary) could NOT go through the API push (connector is UTF-8 text only) — uploading via the GitHub website now; Firebase deploy waits for it. VRM licence: Majid approved the push (07:42 CET) — the model is Abdelmajid's own.

- 2026-11-22 ~02:30 — Muse Friend: HOME + AVATAR re-review 2 «مزيان» (273 checks, 0 fail) — D1–D4 + N1–N7 all closed with evidence (pixel-measured skin torso, prone push-up in frame, standing after stop, relogin clean, rAF 25/0/16 on/off home). Non-blocking N8: far arm dangles below the platform in the push-up down phase — also in the prototype itself; polish later.

- 2026-11-22 ~02:20 — Muse Friend: ONLINE 1v1 DESIGN DONE (boxing/docs/online-challenge-design.md, design only, no code): invite by name + room code, shared seeded command schedule, camera-verified events only, opponent avatar under the camera, no video sent. Decisions at the time: invite by name+code (no public rooms), ranked ELO + friendly option, friends beta now / full Auth later — Majid gave blanket go-ahead 07:45 CET, build starts with the recommended options. Core matchmaking/rooms is Muse Abdelmajid's.

- 2026-11-22 ~02:17 — User (Majid): MARATHON DIRECTIVE — both Muses work continuously until 10:00 CET, no stopping: finish everything, verify it all works, keep adding features; test the challenge + ONLINE 1v1 (two real players enter one challenge); the two Muses play against each other to test it.

- 2026-11-22 ~01:47 — Muse Friend: BOXING simple login screen + camera consent + leaderboard LIVE (commit 4a3a803, 6 files): login-only first screen (no tabs/bar/cheer), register behind a link, logout after login — review «مزيان» (251 checks); first-time camera-consent card in training (professional text: camera is judge, 100% only, anti-cheat, ranking) + «الترتيب» tab with podium (1st top alone, 2nd+3rd sides below, rest one under another; XP then ELO) — review «مزيان» (286 checks). GitHub Pages + Firebase mangawa live-verified (SHA-256 match, markers present). Still owed: field calibration with a real camera + merge smoke test.

- 2026-11-21 ~22:55 — Muse Friend: BOXING Firebase login LIVE (commit 3733d3f, 9 files): review 1 NOT «مزيان» (5 defects D-F1..F5) → all fixed → review 2 «مزيان» (269 checks: 201 builder + 68 independent, 0 fail). GitHub Pages + Firebase Hosting (mangawa) live-verified (200, SHA-256 match, login card present). Firestore rules published via console (CLI rules deploy fails 403 — service account lacks serviceusage permission; DB (default) europe-southwest1 already existed). Live E2E on mangawa: register «اختبار»/TEST123 → login OK, wrong code rejected, tabs unlock; test doc deleted after. Code is a game PIN, not a bank password. Still owed: field calibration with a real camera + merge smoke test.

- 2026-11-21 ~22:10 — Muse Friend: BOXING Firebase login BUILT (not pushed, not reviewed yet): js/boxing-firebase.js (lazy compat SDK, register/login/sync, per-user salt, hash only — code never stored), js/firebase-config.js (web config), login card in boxing.html + cloud register on signup + sync on match end, firestore.rules + firebase.json, test/boxing-firebase.test.js (35 checks) + 7 login checks in gate test. All suites green (moves 41, camera 57, gate 30, bot-level 12, firebase 35). NOTE: code is a game PIN, not a bank password — hash readable by anyone knowing the name (client-side verification); full account system comes with the core merge.

- 2026-11-21 ~21:14 — Muse Abdelmajid: core v1 DEPLOYED + LIVE
  (re-review «مزيان»: 105 checks, 0 fail). Commits 77b0fde
  (index) + ab192d5 (css) + cf57f34 (js); all 7 files md5-verified
  byte-identical, Pages 200 serving the new code:
  https://devbymajid.github.io/halba/ — Live phone test (real-body
  counting calibration) still owed by the user.
- 2026-11-21 ~20:53 — Muse Abdelmajid: core v1 fix round DONE —
  B1 + M1–M6 all fixed, 108 checks green (unit 29 + extra 10 +
  probe P1 3/3 twice + P2 5/5 + e2e 37 + FitApp 10 + fix-verify
  11/11), 4 files changed; re-review running now. ACKNOWLEDGED
  (from the log): user's exercise picker for solo training +
  camera loading feedback — both queued for v1.1 right after v1
  ships (code under re-review stays frozen). NOTE: Firebase deploy
  needs the USER's decision first — do not deploy to Firebase
  until he says so; GitHub Pages is the deploy route.
- 2026-11-21 ~20:39 — Muse Friend: boxing bot-level picker PUSHED
  (commit 1faad37): easy 800 / medium 1200 / hard 1600 in the match panel
  (boxing.html + boxing.css + js/boxing-match.js), test/boxing-botlevel.test.js
  + gate checks, README.md. Independent review «مزيان» (140 checks: 12 bot-level
  + 41 moves + 23 gate + 57 camera + 7 independent re-review, 0 fail; one
  defect D-B1 fixed: timeout message now uses the level damage). Live
  verification + Firebase deploy next; field calibration + merge smoke test
  still owed.

- 2026-11-21 ~20:31 — Muse Friend (user request for CORE, not boxing): Majid wants the player to choose the exercise in solo training. Today core training reuses setupChoice.exercise (match setup choice, default push-up) with no picker on the training screen itself, while the 1v1 setup screen already has the exercise + bot-level pickers. Request: add an exercise picker (ضغط/سكوات) to the core solo-training flow. For Muse Abdelmajid to pick up with the core work.
- 2026-11-21 ~20:28 — Muse Friend (field note, core training): Majid tested core solo training (push-ups) on his iPhone in the Muse in-app browser — camera stuck on «جارٍ تشغيل الكاميرا…» for a while, then started working («Rah khdama daba»). Likely slow first-time PoseLandmarker model load from CDN; no progress indicator or timeout shown while loading. Flag for core review: consider a loading progress/timeout message. Boxing camera field test on a real phone still pending.
- 2026-11-21 ~20:24 — Muse Abdelmajid: core v1 independent review
  DONE — verdict NOT «مزيان» (94 checks, 3 fails, one defect B1
  HIGH): out-of-frame body does NOT cancel the in-progress rep —
  counter.feed(null) throws, app.js never passes null, live probe
  proved a broken rep counts (1 instead of 0). Fix round in
  progress: B1 + test-hook gating + re-register confirm + 3 small
  fixes; full re-test (unit 29 + extra 10 + probe P1 + e2e 37 +
  FitApp 10) before re-review. Everything else verified: tug-of-war
  both directions, ELO/XP math incl. win path, hashed signup,
  branding, no video upload.
- 2026-11-21 ~20:18 — Muse Friend: boxing gate + camera fix PUSHED
  (commit c0807c5): boxing.html + boxing.css (registration gate),
  boxing-pose.js (camera race fixes D1–D5 + P8), test/boxing-gate.test.js
  + test/boxing-camera.test.js, README.md. Independent review 5 «مزيان»
  (218 checks: 57 camera + 41 moves + 18 gate + 49 reviewer #4 + 53
  independent #5, 0 fail). Live verification + Firebase deploy next;
  field calibration + merge smoke test still owed.
- 2026-11-21 ~19:42 — Muse Abdelmajid: user order recorded (rule 7):
  Muse Friend pushes DIRECTLY without approval. Boxing push
  (1f8f3ff) verified from the repo tree: 14 files, all under
  boxing/, core files untouched.
- 2026-11-21 ~19:36 — Muse Friend: boxing mode v1.0.0 PUSHED
  (commit 1f8f3ff): boxing/boxing.html + css/boxing.css + 6 JS modules
  + test/ + docs (14 files). Independent review «مزيان» (70 checks:
  41 builder + 29 independent, 0 fail); all 5 defects fixed (defense
  validator, forward-z 0.08, quit = loss, level/ELO match core,
  shared-camera fan-out). Live verification next; field calibration
  + merge smoke test still owed.
- 2026-11-21 ~19:30 — Muse Abdelmajid: core v1 BUILT (2486 lines):
  signup, bot match (3 levels), camera counting + anti-cheat
  (landmark angles only; half/faked reps never count), push-ups +
  squats, 60s timer + tug-of-war, ELO + XP/levels, solo training,
  daily challenges + streak, account + two-step delete. Self-checks
  green: unit 29/29, e2e 37/37 (0 errors), FitApp 10/10. One real bug
  found + fixed (tug-of-war marker direction). In independent review
  now. PLUG-IN (for boxing): window.FitApp interface + full protocol
  in app/NOTES.md; unified economy 10 XP per counted move; history
  ex: 'boxing'; MediaPipe model shared (loaded once). Counting NOT
  yet verified with a real human body — phone test still owed.
- 2026-11-21 ~19:05 — Muse Abdelmajid: repo devbymajid/halba created
  (public); core WIP snapshot uploaded (index.html, css/style.css,
  js/app.js, js/bot.js, js/pose.js, js/repcounter.js, js/store.js).
  Core NOT finished, NOT reviewed — do not judge it yet. Boxing not started.
- 2026-11-21 ~19:00 — User decision: all Halba work split in 2 — core
  (Muse Abdelmajid) vs boxing (Muse Friend). This log is the live team
  log (moved here from the frozen Suli Anime repo, whose log now
  points here).
