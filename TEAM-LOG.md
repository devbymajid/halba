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

- 2026-11-21 ~19:30 — Muse Abdelmajid: core v1 in INDEPENDENT
  REVIEW (build finished; the repo snapshot is still the WIP one —
  the finished core uploads after review passes).

## Log (newest first)

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
