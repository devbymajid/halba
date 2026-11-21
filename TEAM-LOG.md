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

- 2026-11-21 ~19:05 — Muse Abdelmajid: core v1 build (builder
  finishing; the snapshot in this repo is WORK IN PROGRESS, unreviewed
  — the finished core lands after independent review).

## Log (newest first)

- 2026-11-21 ~19:05 — Muse Abdelmajid: repo devbymajid/halba created
  (public); core WIP snapshot uploaded (index.html, css/style.css,
  js/app.js, js/bot.js, js/pose.js, js/repcounter.js, js/store.js).
  Core NOT finished, NOT reviewed — do not judge it yet. Boxing not started.
- 2026-11-21 ~19:00 — User decision: all Halba work split in 2 — core
  (Muse Abdelmajid) vs boxing (Muse Friend). This log is the live team
  log (moved here from the frozen Suli Anime repo, whose log now
  points here).
