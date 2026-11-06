# Feature: Daily Exam (M10)

Status: Agreed (Umair, 2026-11-06; teammate sign-off outstanding, as `specs/README.md` requires
both teammates)
Owner: Umair
Related: `decisions/0010-competitive-daily-exam.md` (proposed),
`decisions/0011-fully-automated-daily-exam.md` (fully automated operation; amends 0010),
`decisions/0012-reusable-weighted-problem-pool.md` (reusable weighted pool; amends 0011),
`decisions/0007-server-side-competitive-grading.md` (the Sandbox grader, reused),
`decisions/0008-daily-challenge-is-a-learning-exercise.md` (superseded by 0010 on acceptance),
`specs/features/daily-challenge.md` (the flow this replaces after cutover), `specs/features/streak.md`,
`specs/features/spaced-review.md`, `specs/features/public-profile-settings.md`,
`docs/rules/authorization.md`

## Why

Learning sticks when it is tested under fair, honest conditions and then reflected on. The Daily
Exam closes the loop **Learn → Practice → Compete → Reflect → Retain**. One secret problem a day, the
same for everyone, a hard 30 minutes, a server-graded result and a deterministic score give learners
an honest measure of what they can do unaided. AI feedback and next-day publication turn the result
into practice, and a full pass feeds the existing streak and spaced review. Integrity monitoring makes
the ranking credible without claiming more than a browser can know.

## User stories

- As a learner, I want to know when today's exam opens, how long it lasts, how it is scored and what
  is monitored, so I can decide to take part.
- As a participant, I want the same problem and the same deadline as everyone else, so the ranking is
  fair.
- As a participant, I want my code autosaved and finalised at the deadline if I don't submit, so a
  dropped connection doesn't cost me my work.
- As a participant, I want my score, rank, deductions with reasons, and AI feedback soon after
  closing, so I can reflect while it is fresh.
- As a participant, I want to challenge an integrity deduction I think is wrong.
- As a learner, I want yesterday's exam problem open for practice today, so a miss becomes a review.
- As a privacy-conscious learner, I want to know exactly what is monitored, and that my camera,
  microphone and screen are never recorded, so I can consent knowingly or decline and practise
  instead.
- As the product owner, I want the exam to run every day with no one touching it, and to be told
  only when something genuinely needs a person.
- As a maintainer, I want audited, protected tools for the rare exception (a dead job, a leaked
  problem, a security incident, an appeal, a new problem pack), and nothing else to do.

## Decisions this spec is built on (2026-11-06)

1. **Fully automated operation (ADR-0011).** No routine administration. A fixed schedule in code;
   automatic random problem selection; the durable queue runs closeout, grading, scoring, integrity,
   AI assessment, leaderboard, notifications, publication and learning credit. Protected maintenance
   scripts handle exceptions only.
2. **Scheduler.** A GitHub Actions scheduled workflow calls the secured tick endpoint every 5 minutes
   in the processing windows. This is best effort, not a timing guarantee. Opening, closing and
   publication are enforced by database timestamps on every request, independent of any tick. The
   scheduler is a replaceable caller (Vercel Pro cron later).
3. **Reusable private pool (ADR-0012).** Problems repeat. Each day one is drawn by weighted,
   recency-aware secure randomness (AC7). There is no duty to author a new problem a day. An initial
   pack of seven original problems is drafted in an isolated workflow, reviewed by the owner once,
   and validated by the loader (AC42). A larger pool only means fewer repeats. Unreleased content
   never enters the public repository, agent logs, client bundles or public APIs.
4. **The six M9 hidden suites are never used for exams.** Every exam problem has its own validated
   private suite.
5. **Leaderboard identity.** A username is shown only for learners who explicitly opted in to a public
   leaderboard identity; everyone else is anonymous.
6. **Integrity policy.** `integrity-policy@1`, versioned in code. Automatic deductions are capped at
   2,000 of 10,000 units and apply only to reliable observed violations beyond a grace. Unsupported
   screen checks, possible screenshot shortcuts and uncorroborated media interruptions are review
   signals only. Late entry closes 10 minutes after opening, with no deadline extension. Four
   concurrent Sandbox grades to start, subject to quota verification.
7. **Launch.** No date. Built behind the disabled `daily_exam` flag. It replaces the Daily Learning
   Challenge only after the complete scheduled lifecycle is verified (AC34). All M9 history and
   progress are preserved.
8. **Database.** The existing Supabase project, with additive, reviewed migrations applied only after
   identity verification and a confirmed recoverable backup. No existing table is altered and nothing
   destructive is done. Verification uses marked test exam dates and test accounts, never real
   learners' data.

## Acceptance criteria

### A. Schedule and lifecycle

- **AC1** — GIVEN `daily_exam` is enabled THEN every UTC date has exactly one exam, created
  idempotently by the first tick or request that needs it. Its timestamps come from the fixed schedule
  in code (`src/lib/exam/schedule.ts`, `schedule@1`): opens 15:00, admits until 15:10, closes 15:30
  (no overtime), results due 16:30, problem public at the next 00:00 UTC, event retention 90 days after
  publication. They are stored with the schedule and policy versions, and the time-driven jobs are
  created in the same transaction. A later schedule change is a reviewed code change with a new version
  and never moves an existing exam. There is no schedule UI or payload. With the flag disabled nothing
  is created and the Daily Learning Challenge is unchanged.
- **AC2** — GIVEN an exam THEN `status` moves only forward:
  - `scheduled → open`: on the first request or tick with `opensAt ≤ now() < closesAt`, with the
    problem assigned (AC7). It never happens at or after `closesAt` (AC47);
  - `open → grading` or `scheduled → grading`: by `EXAM_CLOSEOUT` (the second only for an exam that
    never opened, AC47);
  - `grading → finalizing`: by `EXAM_RESULT_FINALIZATION`;
  - `finalizing → published`: by `EXAM_LEADERBOARD_FINALIZATION`;
  - `published → archived`: by `EXAM_PROBLEM_PUBLICATION`;
  - `scheduled → cancelled`: only before `opensAt`.
    Each move is one conditional update on the prior status, stamped with server time. Replays and
    concurrent movers change nothing. `closed` is not a stored status: "closed" is the time condition
    `now ≥ closesAt`, so it never depends on a job having run.
- **AC3** — GIVEN any exam request THEN eligibility (enter, problem read, autosave, submit, event
  report, result read, problem publication) is decided by the database server's `now()` against the
  exam's timestamps inside the same statement. It never depends on the browser clock, on whether a job
  has run, or on a tick arriving on time. Everything is UTC, so daylight saving has no effect.
- **AC4** — GIVEN a due job THEN it is worked by whichever bounded invocation comes first: the GitHub
  Actions tick (every 5 min, 14:30–16:55 UTC and 00:00–00:15 UTC, best effort), the daily Vercel cron
  (backstop), or a participant nudge (AC43). All claim atomically, are idempotent and are bounded.

### B. Before opening (secrecy)

- **AC5** — GIVEN `now < opensAt` THEN the exam page shows the date, UTC and local opening time,
  duration, late-entry cutoff, rules, scoring and ranking rules, the integrity policy, the monitoring
  disclosure (AC20), a countdown and the preflight (AC21). The HTML, RSC payload, Server Action
  responses, metadata, notifications, server logs and every API contain no problem title, slug,
  statement, examples, starter, entry name, reference or hidden data, and no assignment exists to
  leak. Nothing reveals before opening which problem today's is or whether it is a repeat, and
  Practice behaves normally for every problem until `opensAt` (AC49).
- **AC6** — GIVEN the repository and build THEN no exam pool content exists in the source tree, in
  any client or server bundle, or in any committed file:
  - pool content lives only in the database (`exam_problems`), seeded by a script from a git-ignored
    local file (`private/exam-pool/*.json`, in `.gitignore`);
  - tests use synthetic fixture problems that are never in the pool;
  - a test fails if `src/` imports anything under `private/`;
  - an e2e check searches the served HTML/RSC before opening for the test exam's statement.

### C. Admission and the open window

- **AC7** — GIVEN the move to `open` THEN one conditional write (`status = scheduled AND problemId
IS NULL AND opensAt ≤ now() < closesAt`) both opens the exam and stores its problem, chosen by
  `selection@1`:
  1. **Candidates:** `eligible` pool problems (never `retired`). For each, `priorUses` and `lastUsed`
     come from the history in `daily_exams`, the one source of truth, and `daysSince` = the exam date
     minus `lastUsed` in days (∞ if never used).
  2. **Cooldown, relaxed progressively:** keep candidates with `daysSince > k` for the largest `k`
     from 7 down to 1 that leaves at least one. With two or more eligible problems the floor `k = 1`
     always leaves one, so yesterday's problem is never repeated. With exactly one, it is used (`k = 0`).
  3. **Weight:** `weight = (1 + min(daysSince, 30)) / (1 + 3 × priorUses)` (31 for a never-used
     problem), scaled to integer micro-weights over candidates ordered by id.
  4. **Draw:** proportional to weight, using `crypto.randomInt` on the server, never `Math.random` and
     never the browser.
     The cooldown used, candidate count, weights and draw are stored with the exam (AC51). The choice is
     never recomputed: a retry, a concurrent opener (who loses the write and reads the winner's
     choice), a pool change or a retired problem can never alter an exam's problem or any past exam's
     association. Every participant gets the same problem. The exam is `cancelled` (`no_problem`: "Today's
     exam cannot run", alerted) **only** when no eligible problem exists at all.
- **AC8** — GIVEN a signed-in learner who passed preflight (AC21) and accepted the rules WHEN
  `opensAt ≤ now < lateEntryUntil` THEN Start creates their one attempt (unique `(examDate, userId)`,
  status `admitted`). Before `opensAt`, after `lateEntryUntil`, or without preflight, Start is refused
  with the reason. Late entry never extends `closesAt`.
- **AC9** — GIVEN an admitted participant WHILE `now < closesAt` THEN the workspace shows:
  - the statement and public examples, served only to that admitted participant;
  - the Python editor in exam mode;
  - a countdown to the absolute `closesAt` (server time at load, display only);
  - Run, Submit, autosave status, exam status and the monitoring indicator.
    Tracy, hints, replay, reference solutions, solution history, topic labels, other learners' code and
    hidden tests are not rendered or sent.
- **AC10** — GIVEN Run WHILE open THEN it runs only the public examples in the existing in-browser
  runner, unlimited, and never consumes the submission. The server refuses the exam-session check that
  unlocks Run once `now ≥ closesAt`. Run happens in the browser, so the server cannot stop an
  already-loaded runner, but nothing it produces is ever accepted.
- **AC11** — GIVEN editing WHILE open THEN the code is autosaved only when changed, at most every
  15 s, and also on tab hide and before Submit. Each save is a conditional upsert accepted only while
  `now < closesAt` and the attempt is `admitted`. It is versioned by a monotonic client sequence (older
  or duplicate saves are ignored) and capped at 20,000 bytes. The page shows "Saved", "Saving…" or "Not
  saved — retrying", and a refresh restores the last saved code.

### D. Paste and input restrictions (exam mode only)

- **AC12** — GIVEN the exam editor THEN pasting and text drag-and-drop insertion are blocked:
  - paste: Ctrl/Cmd+V, the context-menu Paste, `paste` events and `beforeinput` with `insertFromPaste`
    / `insertFromPasteAsQuotation`;
  - drag insertion: `dragover` / `drop` and `beforeinput` `insertFromDrop`.
    Each blocked action shows "Pasting is disabled during the exam." and records `paste_blocked` /
    `drag_insert_blocked` with no clipboard content. Typing, Tab indentation, selection, undo/redo, IME
    composition, autocorrect replacement and screen-reader editing keep working. Copy and cut from the
    editor are disabled as a deterrent, and the page never claims copying is prevented.
- **AC13** — GIVEN Practice THEN its editor, runner and behaviour are unchanged. The restrictions are an
  `examMode` option on the shared editor, off by default.

### E. Deadline and the one final submission

- **AC14** — GIVEN Submit WHILE open THEN, after a confirming second click, one conditional transition
  (`admitted → submitted` where `now() < closesAt`) stores the source immutably with `submittedAt` =
  server time and `submissionKind = manual`, and enqueues its `EXAM_GRADE` job in the same transaction.
  Duplicates and concurrent requests find it moved on and change nothing. A request reaching the
  database at or after `closesAt` is refused ("The exam has closed") even if it was sent earlier.
- **AC15** — GIVEN `now ≥ closesAt` THEN `EXAM_CLOSEOUT` finalises every `admitted` attempt once:
  - the last autosaved snapshot becomes the submission (`submissionKind = auto`, `submittedAt =
closesAt`), with its grade job enqueued in the same transaction;
  - with no snapshot, or only the untouched starter, the attempt becomes `no_submission` (no code
    invented, scored 0, listed).
    It runs server-side for disconnected learners. A racing manual Submit or autosave loses at the
    database (`now() < closesAt` fails).
- **AC16** — GIVEN the deadline passes in an open workspace THEN the editor locks, Run and Submit
  disappear, media tracks stop and the page shows "The exam has closed", whatever the browser timer
  says.

### F. Grading, scoring and results

- **AC17** — GIVEN a submitted attempt (manual during the exam, or auto at closeout) THEN its
  `EXAM_GRADE` job grades it in a Vercel Sandbox through the existing grader (no network, one process
  per case, CPU and time limits) against the problem's private hidden cases, read from the database on
  the server. It holds one of N global Sandbox slots (default 4, AC37). Grading during the exam is
  allowed because results stay hidden until publication (AC19). Hidden inputs, expected outputs and
  reference solutions never leave the server.
- **AC18** — GIVEN a graded attempt THEN its coding score is computed in integer units (10,000 max):
  - correctness = `floor(8000 × passed / total)`;
  - speed, on a full pass only, = `floor(2000 × max(0, 1800 − elapsedSeconds) / 1800)`, where
    `elapsedSeconds` = `floor((submittedAt − opensAt) / 1 s)` (auto submissions use `closesAt`, so 0
    speed points);
  - coding = correctness + speed.
    Partial passes get no speed points, and no LLM output affects any score.
- **AC19** — GIVEN every attempt is resolved (graded, `no_submission`, or `grading_failed` once its
  grade job is `dead`) AND every integrity job is terminal THEN:
  1. `EXAM_RESULT_FINALIZATION` persists each `finalScore = max(0, coding − deductions)`;
  2. `EXAM_LEADERBOARD_FINALIZATION` ranks ranked attempts (full pass first, final score, passed
     count, earlier `submittedAt`, then a stable hash of exam and user; equal keys up to the hash
     share a rank) and persists the standings once;
  3. the exam becomes `published` and `EXAM_NOTIFICATIONS` follows.
     `grading_failed` attempts are listed as "Grading failed — not ranked", never scored 0 in the
     ranking. No score or rank is readable by anyone before `published`. AI assessments never gate this
     (AC28).

### G. Proctoring preflight and live monitoring (no recording)

- **AC20** — GIVEN the exam page before admission THEN, before any permission prompt, it shows: "Your
  exam session is monitored for browser activity and device interruptions. Confirmed rule violations
  may affect your final score. Camera, microphone and screen content are not recorded or stored." It
  also lists what is observed, why, the deduction policy, that nobody can watch live media, how to
  challenge a decision (AC44), and that declining leads to Practice.
- **AC21** — GIVEN preflight THEN, only after the learner presses "Start checks", it requests camera
  and microphone (`getUserMedia`) and screen sharing (`getDisplayMedia`, entire screen requested). It
  shows live status for camera, microphone, screen (the reported `displaySurface`: "Entire screen",
  "Window", "Browser tab" or "Not reported") and fullscreen, plus per-check browser support.
  - Admission requires live camera and microphone tracks, a screen share reported as `monitor`, and
    fullscreen.
  - A browser that cannot screen-share or does not report the surface is told the exam needs a
    supported desktop browser (Chromium-based or Firefox), and Practice is offered.
  - Denied, unavailable and revoked permissions each have their own message.
  - The outcome is stored as support and pass flags only, never media.
  - **These flags are client-reported observations, not tamper-proof attestations.** A modified
    browser can report anything. The server checks only that a preflight record with passing
    flags exists before admission. Neither the flags nor the absence of interruption events is ever
    treated as proof that monitoring was continuous, and an unsupported, missing or failed check is
    never penalised automatically (AC25). Results, the maintenance timeline and the AI assessment label these facts
    "reported by the browser".
- **AC22** — GIVEN an admitted participant THEN media tracks stay live only for the exam session and
  are observed for `ended`, `mute` / `unmute` and device changes.
  - An interruption shows a warning (e.g. "Screen sharing has stopped. Restore it to continue the
    proctored exam.") with a restore button that uses the same permission flow, and records
    `camera_interrupted` / `microphone_interrupted` / `screen_capture_interrupted` and `*_restored`.
  - A page refresh ends the browser's tracks; it is recorded as an interruption and restoring needs a
    click.
  - Editing continues during an interruption.
  - All tracks are stopped on submit, at `closesAt`, on leaving the page and on sign-out.
  - No frame, sample or image is ever read, stored or sent.
  - Media availability events are client-reported (see AC21). They are review signals only.
- **AC23** — GIVEN the exam workspace THEN it records and warns:
  - `tab_hidden` / `tab_visible` (Page Visibility): "You left the exam tab. This event has been
    recorded." on return;
  - `window_blurred` / `window_focused`, recorded separately and never treated as visibility;
  - `fullscreen_exited` / `fullscreen_entered`, with a warning and a re-enter button (never trapping
    the user);
  - `network_offline` / `network_online`;
  - `screenshot_shortcut_observed` when PrintScreen or a known capture shortcut reaches the page,
    labelled "Possible screenshot shortcut", never "Screenshot captured";
  - `screens_reported` (count) and `screens_changed` where `getScreenDetails` is available and the
    learner permits it; otherwise `screens_unsupported` or `screens_denied`. A count is never invented.
    A visible monitoring indicator is shown throughout.

### H. Integrity events and policy

- **AC24** — GIVEN an event batch THEN one validated Server Action ingests it during the exam (never a
  job per event), durably on acceptance, and only for the caller's own attempt in `[admittedAt,
closesAt + 60 s)`. It stores type (allow-listed), server `receivedAt`, client `occurredAt`
  (informational only), client sequence, minimal metadata (allow-listed per type, no free text), source
  and confidence (`observed` | `indicator` | `unsupported`). It deduplicates on `(attemptId,
clientEventId)`, accepts at most 50 events per batch and 120 per minute per attempt (excess counted as
  `rate_limited`). Sequence gaps are recorded as `delivery_gap`. Another learner's attempt is refused.
  Batches are sent at most every 15 s. Transition events (tab hidden/visible, fullscreen
  exited/entered, blocked paste/drag) are sent immediately, with `keepalive`, so their server
  `receivedAt` is close to when they happened. Durations are computed only from `receivedAt`.
- **AC25** — GIVEN `now ≥ closesAt + 90 s` (after the late-event window) THEN one
  `EXAM_INTEGRITY_SCORE` job per attempt applies the exam's policy version to that attempt's events
  and appends one automatic decision (a replay appends nothing). `integrity-policy@1`:
  - tab hidden: the first hide is a warning; each later hide costs 200 once total hidden time exceeds a
    30 s grace (max 1,000);
  - blocked paste or drag: the first 2 are warnings; each later one costs 100 (max 600);
  - fullscreen exit: the first is a warning; each later exit, or each further 15 s outside fullscreen,
    costs 150 (max 600);
  - total automatic deductions are capped at 2,000.
    Window blur, possible screenshot shortcuts, multiple screens reported, unsupported or denied screen
    checks, media interruptions, network loss, rate-limited events and delivery gaps never deduct
    automatically; they are review flags. The decision stores the policy version, an input summary
    (counts and durations) and its outputs. Policy parameters are code-versioned, and the schedule (in code)
    picks the version for new exams.
- **AC26** — GIVEN an exceptional integrity correction (an upheld appeal, AC44) THEN a maintainer
  runs the protected appeal script, which appends a decision (`uphold`, `reduce`, `remove`) with a
  required reason to `exam_integrity_decisions` and an `exam_audit` row. The original coding score
  and the automatic decision are kept. Results and standings are recomputed by re-running the
  finalisation jobs under a new correction key, and the leaderboard shows "Corrected" with a dated
  entry. Nothing is silently reordered, and no UI or routine review step exists.

### I. Results, AI feedback and the leaderboard

- **AC27** — GIVEN a published exam THEN each participant sees their final and coding score, each
  deduction with its rule in plain words and the counts behind it, their review flags (as "flagged for
  review", with no penalty), rank (or "not ranked" with the reason), tests passed of total, submission
  kind and time, whether results are final or corrected, and how to challenge a decision. They never see
  which tests failed or anyone else's events.
- **AC28** — GIVEN an attempt's result is finalised (AC19) THEN one `EXAM_AI_EVALUATION` job
  produces one individualised assessment through the existing Tracy integration (usage tracked as
  `exam_assessment`, the shared rate limit, a 900-token output cap, 20 s timeout). The model is given
  all four evidence categories:
  1. **Solution:** the submitted source, read on the server (capped at 8,000 characters).
  2. **Tests:** the Sandbox pass count and total, the correctness outcome, and aggregate failure
     categories (wrong answer, exception, timeout, memory, recursion, missing entry: counts only).
     Never which case, inputs or expected outputs.
  3. **Time:** `opensAt`, `admittedAt` and `submittedAt` (server), elapsed and remaining at
     submission, and the submission kind.
  4. **Integrity:** the `integrity-policy@1` summary (tab hides and time away, window blurs,
     fullscreen exits and time outside, blocked paste/drag, possible screenshot shortcuts, the screen
     check and its result, camera/microphone/screen-share interruptions, network and reporting gaps),
     each with its confidence level and "reported by the browser", plus the deductions applied and the
     rules behind them.

  It returns a structured assessment:
  - overall solution assessment;
  - correctness gaps;
  - algorithm efficiency (estimated time and space complexity; incomplete, brute force, efficient or
    optimal);
  - time-management observations;
  - integrity observations, with uncertainty;
  - an explanation of the deterministic deductions;
  - concrete learning recommendations;
  - a concise summary.

  Every statement is tagged `fact` (restating supplied evidence), `estimate` (the model's judgement)
  or `unverified` (a browser observation that cannot establish what happened).

- **AC28a** — GIVEN the model's output THEN it is validated before storage, and a failing output is
  retried, never stored:
  - it matches the schema;
  - integrity statements reference only event categories present in the supplied summary;
  - wording asserting misconduct, cheating or a captured screenshot (rather than "a possible screenshot
    shortcut was observed") is rejected;
  - no replacement code;
  - before `publishAt`, no reference solution.

  Code that ignores its inputs (e.g. a constant return) is pre-classified deterministically as
  incomplete, and that classification is given to the model. The factual panel (scores, tests,
  categories, times, the integrity summary, deductions) is rendered by the application from stored
  data, never from model text. The AI never changes a score, rank, decision or event.

- **AC28b** — GIVEN AI evaluation is pending, slow or failing THEN publication of scores, ranks and the
  leaderboard is never delayed. The result page shows "AI feedback is being prepared", then the
  assessment when ready (cached once, never regenerated on refresh), or "AI feedback is unavailable"
  once its job is dead.
- **AC29** — GIVEN a published exam THEN its public leaderboard lists every participant exactly once:
  - rank (shared on ties), display name, coding score, deductions, final score, tests passed/total,
    elapsed time and status (full pass, partial, no submission, grading failed);
  - the display name is the username only when the learner has a public username AND has opted in to
    a public leaderboard identity; otherwise "Anonymous participant", with nothing derived from the
    account;
  - the signed-in viewer sees "You" on their own row, and only they see it;
  - no email, source, events, flags, media facts, or (before `publishAt`) problem identity; the exam is
    named by its date;
  - it is persisted, stays as published, and changes only through AC26.
    There are no standings at all before `published`.

### J. Publication, notifications and the learning loop

- **AC30** — GIVEN an exam's problem appears in an exam for the FIRST time THEN its title,
  statement and public examples become public on the archive page, and in Practice as an ordinary
  unrestricted problem served from the server, once `now() ≥ publishAt` (a read-time check) AND the
  exam is `archived` (its credit is written, AC31). Practice runs use the public examples plus the
  separate public practice set, never the hidden cases. Hidden cases and reference solutions are never
  published. Before that, the archive, search, Practice, sitemap, `llms.txt`, recommendations, AI
  context, public profiles, activity, progress and notifications contain nothing of it. GIVEN a REPEAT
  (the problem was already published by an earlier exam) THEN it is already public; nothing new is
  published, and only AC49's lock and AC31's credit apply.
  `EXAM_PROBLEM_PUBLICATION` is claimable, for a first use, when `now ≥ publishAt` and the exam is
  `published`; for a repeat, when the exam is `published`. It writes the credit (AC31) and then archives
  the exam, which lifts AC49's lock.
- **AC31** — GIVEN a full-pass exam result THEN `EXAM_PROBLEM_PUBLICATION` records, exactly once
  (fenced on `exam_attempts.attemptId`), one Attempt, progress, streak activity and the M9C review, all
  dated at `submittedAt`:
  - **first-use problem:** credited at next-day publication, so a still-secret problem cannot surface on
    progress, profile or recommendation views before `publishAt`;
  - **repeat problem:** credited as soon as results publish (about 16:30), since nothing about it is
    secret.

  How the timing interacts with M9A and M9C (verified against `src/lib/streak/streak.ts`,
  `src/lib/activity/daily-activity.ts` and `src/lib/reviews/review-schedule.ts`):
  - **Streak and activity** are computed on read from `attempts.createdAt`, and no derived streak,
    activity or profile statistic is stored. An Attempt dated D and written later makes D an active day,
    exactly as an on-time write would. Until then D shows as not yet credited, a display delay only; the
    recommendation cache is content-addressed and refreshes.
  - **Spaced review:** `recordReviewPass(…, at = submittedAt)` follows M9C's own rules: it enrols (review
    1 due D+1) or, for a repeat the learner already has a review for, advances it only if due by D.
    Replays are no-ops.
  - **Ordering:** any earlier Practice pass on the problem is earlier in time (before `opensAt`, or on an
    earlier day), and AC49 locks Practice of the problem from `opensAt` until this credit is written. So
    no Practice pass can be written between the submission and its credit, and M9C sees passes in time
    order.
  - **Exactly once:** the Attempt and progress are written in one transaction, fenced on
    `exam_attempts.attemptId`. The review follows and is idempotent by its own rules. The job is
    `succeeded` only after both, and retries otherwise; it is never best-effort.
  - Day-D streak reminders already sent are not backfilled.

  A partial pass or no submission records no credit and gets a written next-step recommendation. Later
  Practice of the problem never changes an exam result or ranking.

- **AC32** — GIVEN the existing in-app notifications (no email) THEN learners get, idempotently per
  (user, exam, kind):
  - "Today's exam opens at HH:MM UTC": created lazily when a signed-in learner loads the app on exam
    day before `opensAt`, so there is no fan-out;
  - "Your exam result is ready", with score and rank, from `EXAM_NOTIFICATIONS`;
  - the existing review notifications.
    None names the problem before `publishAt`.

### K. No routine administration

- **AC33** — GIVEN normal operation THEN no person is involved: there is no schedule screen, no
  problem selection or approval, no publication control, no exam dashboard and no exam RBAC
  permission. Exceptions use **protected maintenance scripts** (`scripts/exam-maintenance.mts`), run
  by a maintainer with database access. Each verifies the database's project identity first, runs in
  one transaction and writes an `exam_audit` row with a reason:
  - re-queue a dead job (re-running finalisation under a correction key when results change);
  - void an exam after a security incident (results hidden with a notice; nothing deleted);
  - retire a leaked problem (never assigned again);
  - resolve an integrity appeal (AC26);
  - print an attempt's event timeline (the read is audited).
    Pool packs are loaded by `scripts/load-exam-pool.mts` (AC42).

### L. Cutover from the learning challenge

- **AC34** — GIVEN the complete scheduled lifecycle has been verified on marked test exam dates with
  test accounts (preflight, admission, exam, autosave and auto-finalisation, grading, scoring,
  integrity, AI assessment, leaderboard, notifications, publication, Practice and learning credit) AND
  the owner's go-ahead THEN enabling `daily_exam` makes the next UTC date an exam, and the Daily
  Learning Challenge stops offering new dates. Earlier `daily_challenges` / `challenge_attempts` keep
  their pages, results and learning credit unchanged, and the Problems calendar shows exam dates from
  then on.

### M. Durable processing queue

- **AC35** — GIVEN exam work THEN it runs as rows in `exam_jobs` of exactly these types:

  | Type                            | Scope   | Claimable when                                                       | Effect                                                                                        |
  | ------------------------------- | ------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
  | `EXAM_CLOSEOUT`                 | exam    | `now ≥ closesAt`                                                     | `open → grading`; auto-finalise or `no_submission` each `admitted` attempt; enqueue its grade |
  | `EXAM_GRADE`                    | attempt | attempt `submitted`, a Sandbox slot free                             | grade, failure categories, coding score                                                       |
  | `EXAM_INTEGRITY_SCORE`          | attempt | `now ≥ closesAt + 90 s`                                              | append the automatic integrity decision                                                       |
  | `EXAM_AI_EVALUATION`            | attempt | result finalisation done (AC28)                                      | store the validated assessment (never a prerequisite)                                         |
  | `EXAM_RESULT_FINALIZATION`      | exam    | closeout done, every grade and integrity job terminal                | final scores; `grading → finalizing`; enqueue each attempt's AI evaluation                    |
  | `EXAM_LEADERBOARD_FINALIZATION` | exam    | result finalisation done                                             | standings; `finalizing → published`                                                           |
  | `EXAM_NOTIFICATIONS`            | exam    | leaderboard done                                                     | one result notification per participant                                                       |
  | `EXAM_PROBLEM_PUBLICATION`      | exam    | `now ≥ publishAt` and exam `published`                               | learning credit (AC31); `published → archived`                                                |
  | `EXAM_RETENTION_CLEANUP`        | exam    | `now ≥ publishAt + retentionDays` and no open appeal for the attempt | delete event rows; keep decisions, summaries and scores                                       |

  Per-attempt integrity jobs are created at admission. Exam-level jobs are created with the exam row.

- **AC36** — GIVEN a job THEN its idempotency key (`type:examDate[:attemptId][:correction]`) is unique.
  A duplicate enqueue inserts nothing. Jobs are created in the same transaction as the state change that
  causes them (a transactional outbox).
- **AC37** — GIVEN concurrent workers THEN a job is claimed by exactly one, through an optimistic
  conditional update (`status = pending AND runAfter ≤ now()` plus its claim condition) that sets
  `running`, a fresh lease token and `leaseExpiresAt`. `EXAM_GRADE` also leases one of the
  `exam_job_slots` rows (default 4) the same way, so at most N sandboxes run at once across all
  invocations.
- **AC38** — GIVEN a worker crashes, times out or is redeployed after claiming THEN its lease (6 min for
  every type, longer than the 300 s function limit) expires, and the job and its slot become claimable
  again. Completion and every effect write are fenced on the lease token and on the domain row's own
  conditional transition, so a stale worker finishing late changes nothing. Credit, scores,
  notifications and standings are each applied at most once.
- **AC39** — GIVEN a job fails THEN it returns to `pending` with `runAfter = now + min(10 min, 30 s ×
2^attempts)` and records an error code only. Each type has its own maximum: grade 5 (about 15 min of
  retries), AI 4, others 8. Exhausted jobs become `dead` and raise an alert. A dead grade makes the
  attempt `grading_failed`, which still releases finalisation; a dead AI job makes the assessment
  `unavailable`. Re-queueing a dead job is an exceptional maintenance action (AC33).
- **AC40** — GIVEN a tick invocation (`maxDuration = 300`) THEN it stops claiming at 240 s, runs grade
  jobs in parallel up to its leased slots and other jobs serially, and returns counts by type and
  status only.
- **AC41** — GIVEN an exam THEN it is observable without a dashboard:
  - every tick response and a `CRON_SECRET`-protected `GET /api/cron/exam-status` return counts only:
    backlog by type and status, retries, dead jobs, enqueue→start and enqueue→done latency,
    `closesAt → publishedAt`, eligible problems remaining and the last tick time;
  - alerts go through `captureError` (Sentry) when an exam is not published by `resultsDueAt`, a job
    goes dead, an exam cannot run (`no_problem`), the cooldown had to relax (AC51), or no tick
    has arrived for 30 minutes inside a processing window;
  - learners see "Results are still processing" past `resultsDueAt`.
    The 60-minute target is measured, never promised.

### N. Pool, nudges, appeals, hygiene, edge timing

- **AC42** — GIVEN a problem pack THEN it is authored only into git-ignored files under
  `private/exam-pool/`, never into a committed file or into a prompt or reply (session logs capture
  prompts and replies only). The owner reviews a pack once before loading.
  `scripts/load-exam-pool.mts` checks the project identity and then validates every problem:
  - schema and unique slug;
  - statement, public examples, a public practice set, a starter and an entry;
  - the private hidden suite passes every reference solution in the real Sandbox;
  - each deliberately wrong solution fails it;
  - the practice set shares no case with the hidden suite.
    Only fully valid problems are inserted, as `eligible`, with `validatedAt` and a content hash; any
    failure loads nothing. Once loaded, problems are drawn and reused automatically (AC7). There is no
    per-exam approval and no need to add problems for the exam to keep running; a bigger pool only
    reduces repeats.
- **AC43** — GIVEN a participant's page after `closesAt` THEN it may nudge the queue at most once per
  30 s per attempt, working only that attempt's own claimable jobs within a 60 s budget. Nudges are
  never required for correctness or completion.
- **AC44** — GIVEN a published result with a deduction or flag THEN the participant can file one
  appeal per attempt within 30 days: an allow-listed reason plus up to 500 characters of text. Filing
  raises an alert to the maintainer, who resolves it with the appeal script (AC26). The answer is shown
  on the result page. Events for an attempt with an open appeal are kept until it is resolved. This is
  the one recurring human task, and it is only triggered by a learner.
- **AC45** — GIVEN server logs, Sentry events, `ai_usage` rows and job error codes THEN none contains
  problem content, source code, clipboard content or media facts beyond allow-listed event types.
- **AC47** — GIVEN an exam row first created, or first accessed, at or after its `closesAt` THEN it
  never opens. No participant is admitted, no problem is assigned or read, and the pool problem stays
  unused. `EXAM_CLOSEOUT` moves it `scheduled → grading` with zero attempts, and the result and
  leaderboard jobs publish an empty exam. Its page says "No exam was held on this date" and shows no
  problem content, before or after `publishAt`. Closeout is idempotent: its status move, each
  attempt's finalisation (`admitted` only) and each job's idempotency key make any repeat or
  concurrent run change nothing. An exam that opened but whose closeout runs late is finalised from
  `closesAt`, never from the job's run time.
- **AC48** — GIVEN a published exam problem THEN every learning view that today filters to the
  static catalogue (due reviews and the review callout, progress, recommendations, the activity
  breakdown and the public profile) resolves it through a server-side published-exam-problem lookup.
  Its review and progress are shown, not silently dropped. Before publication it is not resolved
  anywhere.
- **AC49** — GIVEN an exam is open or its credit is not yet written (from `opensAt` until the exam is
  `archived`) THEN Practice of that exam's problem is locked, checked on the server: `/practice/<slug>`,
  Tracy, hints and solution history for it show "This problem is in today's exam". The lock never starts
  before `opensAt`. A Practice page loaded before 15:00 can still run code in the browser; that is
  disclosed in the rules, and nothing it produces counts.
- **AC50** — GIVEN a repeat exam (its problem appeared in an earlier exam) THEN, from opening, the
  workspace and result say "This problem has appeared in a previous exam and is available in Practice",
  the leaderboard is marked "Repeat problem", and nothing calls it unseen. A first-use exam may say the
  problem is new.
- **AC51** — GIVEN an opened exam THEN its stored selection record holds `selection@1`, the cooldown
  `k` used, the candidate count, each candidate's weight, the total and the draw. An informational alert
  fires when `k < 7` (the pool is small) and an error alert when the exam is cancelled for an empty pool.
- **AC46** — GIVEN account deletion THEN the learner's attempts, autosaves, events, decisions and
  challenges cascade, their standing row is shown as "Removed participant" without re-ranking others,
  and the leaderboard records the correction.

## Testing

Unit tests run against injected stores that behave like the database. Rolled-back database checks and
the queue integration run use the **test database only** (decision 7). The phases from the M10 brief
(A scheduling, B secrecy, C editor and execution, D proctoring, E integrity evidence, F grading, G
evaluation, H leaderboard, I learning integration, J browser E2E) are all required, plus:

- **Queue:** duplicate enqueue; two workers claiming one job; worker crash after claim; lease expiry
  during a slow Sandbox grade; a stale worker completing after takeover; retry exhaustion to `dead` and
  maintenance re-queue; dependency ordering (finalisation blocked while a grade or integrity job is pending,
  released when it goes dead); duplicate completion; recovery after a redeploy.
- **Deadline:** submit vs closeout at the boundary; concurrent autosave and auto-finalisation; late
  events inside and outside the 60 s window.
- **Results:** AI provider errors (results still publish; `unavailable`, then retried); notification
  idempotency; leaderboard finalisation with grading still pending; corrections.
- **Selection (`selection@1`):** pool sizes 1, 2, 3, 7 and 20 over long simulated runs (yesterday's
  problem never repeats when 2 or more are eligible; the 7-day cooldown holds when 8 or more are; relaxation
  takes the largest feasible `k`); repeated selection on the same exam never changes the choice;
  observed frequencies match the weights within tolerance under a seeded draw; concurrent openers yield
  one stored problem; recovery after a failure between choosing and writing; retired problems never
  drawn; an empty pool cancels; draws use `crypto.randomInt` only.
- **Practice lock and repeats:** Practice of the exam's problem is refused from `opensAt` until
  archive, and never before; repeat labels appear only after opening.
- **AI assessment:** the prompt carries all four evidence categories and no hidden case or expected
  output; outputs that reference absent event types, assert cheating or a captured screenshot, include
  code, or fail the schema are rejected and retried; every statement carries a `fact`, `estimate` or
  `unverified` tag; a constant-return solution is described as incomplete; a cached assessment is never
  regenerated; AI failure never delays scores.
- **Pool loader:** a pack with any invalid problem loads nothing; a wrong reference solution or a
  passing wrong solution is caught; practice and hidden cases never overlap.
- **Publication:** UTC next-day publication at `publishAt` with and without the job having run;
  learning credit exactly once at publication.
- **Integrity:** own-attempt scoping; dedupe; rate limit; sequence gaps; policy determinism, grace
  periods and caps; weak signals never deducting; append-only corrections; challenges.
- **Secrecy:** no pool content in HTML, RSC, action responses, bundles, archive, practice, sitemaps,
  recommendations, notifications, logs or `ai_usage` before the right boundary.
- **Proctoring:** preflight paths for granted, denied, revoked, unavailable and interrupted permissions
  (unit tests with mocked media APIs, plus a real Chromium run with fake media devices); unsupported
  Window Management; `displaySurface` other than `monitor` refused.
- **Integration:** a controlled small-scale run of the real queue on the test database: about 20
  synthetic attempts, 2 concurrent tick invocations, injected Sandbox and AI failures, real Sandbox
  grading of the synthetic problem, with measured latency and throughput.
- **Browser E2E:** the full lifecycle on an isolated test exam schedule (minutes, not hours) with test
  accounts: preflight → admission → code → Run → events → Submit / auto-finalise → grading → scoring →
  AI → leaderboard → publication → Practice → review.

## Data / API

Models: `prisma/schema/exams.prisma` (all tables get RLS enabled with no policies; user-scoped rows
cascade on account deletion; migrations are additive, ADR-0011 §7):

- `exam_problems` — slug, title, statement, examples, practiceTests (public after publication),
  starter, entry, hiddenCases and referenceSolutions (server-only, never selected by a public query),
  `status` (`eligible` | `retired`), `validatedAt`, `contentHash`.
- `daily_exams` — `examDate` (PK), `status`, the stored schedule timestamps, `retentionDays`,
  `scheduleVersion`, `policyVersion`, `problemId` (null until open; NOT unique, since problems repeat;
  indexed with `examDate` for the history query), `isRepeat`, `selection` (AC51), per-status
  timestamps, `cancelReason`, `correctionCount`.
- `exam_attempts` — one per (`examDate`, `userId`): status, `admittedAt`, client-reported
  `preflight`, source, `submittedAt`, `submissionKind`, grading counts, `failureCounts` (aggregate
  categories), integer scores, rank, `ranked`, assessment and `assessmentStatus`, `attemptId` (the
  learning-credit link, unique).
- `exam_autosaves`, `exam_integrity_events`, `exam_integrity_decisions` (append-only),
  `exam_challenges` (appeals), `exam_standings` (versioned; the leaderboard reads only this),
  `exam_jobs`, `exam_job_slots`, `exam_audit` (maintenance actions only).
- `User.leaderboardOptIn` (exists) is the explicit public-identity consent; its settings toggle
  comes back with the exam.

Configuration: `src/lib/exam/schedule.ts` (`schedule@1`) and `src/lib/exam/integrity-policy.ts`
(`integrity-policy@1`), both in code. The flag `daily_exam` (ops, default **off**) is a plain on/off
switch with no payload.

Server Actions (Zod; the session user only; no user ids in input):

- `examStatusAction({ date })` → public schedule and state, plus the caller's attempt view.
- `recordPreflightAction({ date, checks })` → client-reported support and pass flags.
- `startExamAction({ date })` → `{ ok, attempt } | { ok: false, error: 'not_open' | 'late' |
'preflight' | 'closed' | 'cancelled' | 'unauthenticated' }`.
- `autosaveExamAction({ date, source, clientSeq })` → `{ ok, savedSeq } | { ok: false, error: 'closed' |
'submitted' | 'too_large' | 'stale' }`.
- `submitExamAction({ date, source })` → one manual submission.
- `reportIntegrityEventsAction({ date, events[≤50] })` → `{ accepted, duplicates, rejected }`.
- `examResultAction({ date })` → the caller's result after `published`.
- `appealIntegrityAction({ date, reasonCode, text })` → AC44.

There are no admin actions.

Routes:

- `GET /api/cron/exam-tick` — `CRON_SECRET`, `maxDuration = 300`, AC40. Called by
  `.github/workflows/exam-tick.yml` (`*/5 14-16 * * *` and `*/5 0 * * *`), which runs only where its
  secrets are configured, and once a day by the existing Vercel cron as a backstop.
- `GET /api/cron/exam-status` — `CRON_SECRET`, counts only (AC41).
- Pages: `/exam/[date]` (preflight, workspace, result), `/exam/[date]/leaderboard`, `/exam/archive`.
  All are `noindex` except archive entries after publication.

Scripts (maintainer-run, identity-checked, audited): `scripts/load-exam-pool.mts`,
`scripts/exam-maintenance.mts`.

Analytics: no new events.

## Feasibility and limits (measured before cutover)

- **Invocations on Hobby.** Per participant per exam: about 2 page loads, at most about 120 autosaves
  (≤ 1 per 15 s, only on change) and about 120 event batches. That is roughly 250 function
  invocations at worst, typically far fewer. Vercel Hobby includes about 1 M invocations a month, so
  roughly 100 daily participants is the comfortable ceiling. Beyond that needs Pro. The integration run
  measures the real numbers.
- **Grading throughput.** About 7 s per grade with 4 slots is about 34 grades a minute. Manual
  submissions are graded during the exam, so the backlog at close is mostly auto-finalised attempts.
  The Sandbox quota (concurrency and monthly CPU) is checked before raising the slot count.
- **AI throughput.** One call per finalised attempt (about 5–8 s and about 400 micro-USD at the
  900-token cap). It runs off the critical path and is bounded by the shared rate limit and the
  provider's quota.
- **Ticks.** GitHub Actions schedules can run 5–15 minutes late under load, and scheduled workflows on
  inactive public repositories are disabled after 60 days. An alert fires when ticks stop;
  Vercel Pro cron is the documented replacement.

## Operational dependencies (genuine, not routine administration)

1. **Pool size (optional growth, not a duty).** Problems are reused automatically (AC7), so the exam
   never stops for lack of new problems. With fewer than 8 eligible problems the 7-day cooldown has to
   relax and repeats are frequent (with 1, the same problem every day, labelled a repeat). Growing the
   pool reduces repeats and is worth doing over time, but nothing requires it. Only an empty pool (every
   problem retired) cancels an exam.
2. **Appeals.** A learner's appeal needs a maintainer to resolve it (AC44).
3. **The scheduler.** The GitHub Actions workflow needs `CRON_SECRET` and the app URL as repository
   secrets, runs late under load, and is disabled by GitHub after 60 days without repository activity.
   An alert fires when ticks stop.
4. **Provider quotas and keys.** Vercel Sandbox (concurrency, monthly CPU), the AI provider's key,
   billing and rate limits, and the Vercel Hobby limits (invocations, 300 s functions).
5. **Database changes.** The migration reaches the database only through the pull request → CI →
   merge → `deploy-migrations.yml` path, which needs a push and merge approval, a verified project
   identity and a confirmed recoverable backup.
6. **Teammate sign-off** on ADR-0010, ADR-0011 and this spec (`specs/README.md`).

## Known limitations (stated in the rules shown to learners)

- A browser cannot prevent or detect a second device, another person, screenshots taken by the OS or
  other apps, or DevTools. Signals are observations, not proof.
- A repeat problem has been public in Practice, so a participant may have practised or memorised it.
  Repeat exams say so (AC50). The Practice lock (AC49) cannot stop a page loaded earlier, saved
  solutions or other devices.
- An admitted participant can see the problem and could share it during the exam, including with a
  late entrant within the 10-minute late window. Same-problem-for-all fairness cannot stop that.
- Run happens in the browser, so a participant can still execute code locally; only the final
  submission counts.
- Screen-share surface reporting and Window Management support vary by browser, so some browsers
  cannot be admitted.

## Edge cases

- No eligible problem at all (empty pool or all retired): cancelled visibly (AC7). Any smaller pool runs, relaxing the cooldown (AC51).
- Pool of one: the same problem daily, each a labelled repeat (AC50).
- A problem retired after use: past exams keep their association; it is never drawn again.
- Start at `lateEntryUntil − 1 s`: admitted, deadline unchanged.
- Submit sent at 15:29:59.9, received at 15:30:00.1: refused; the latest autosave is finalised (AC14,
  AC15).
- Autosave lost in flight at the deadline: the last acknowledged snapshot counts, and the page showed its
  save status.
- Learner never types (starter only): `no_submission`, not a graded fail.
- Browser closes mid-exam: closeout finalises the last autosave; the event gap is recorded and never
  penalised.
- Sandbox outage: bounded retries (about 15 min). If still failing, the attempt is `grading_failed`
  ("not ranked"), the exam still publishes, and a maintenance re-queue re-publishes as a correction.
- No participants: closeout, empty standings, published.
- Results past `resultsDueAt`: honest processing state (AC41).
- Event flood: rate-limited and counted, never penalised.
- A second tab: the same attempt; autosave sequence wins; events from both tabs.
- Permission revoked mid-exam: an interruption, a warning and restore; a review flag, not a deduction.
- Mobile or unsupported browser: preflight explains; Practice is offered.
- Exam created between `opensAt` and `closesAt` (first request comes late): it opens at once; the
  timestamps are the configured ones, not the creation time.
- Exam created or first accessed at or after `closesAt`: never opens (AC47).
- Credit job delayed past `publishAt`: the problem stays private until the credit lands (AC30); the
  streak catches up on read (AC31).
- Account deletion: AC46.
- Historical learning-challenge rows: untouched (AC34).

## Tasks

Staged. Each stage updates this spec, runs targeted tests and preserves M9 behaviour.

- [x] 1. Sign-off (Umair) on ADR-0010, ADR-0011 and this spec; teammate sign-off outstanding.
- [~] 2. Schema written and validated (`prisma/schema/exams.prisma`) and the client generated;
  `daily_exam` flag (default off, no payload); `private/` git-ignored. Next: the reviewed additive
  SQL preview, the backup confirmation, then the PR → CI migration path (needs approval).
- [~] 3. Pure cores done and tested: queue (`queue.ts`), fixed schedule (`schedule.ts`), scoring and
  ranking (`scoring.ts`), `integrity-policy@1` (`integrity-policy.ts`). Next: the Prisma job
  store, the tick and status endpoints, and the workflow.
- [~] 4a. `selection@1` (pure, with secure randomness injected) and its tests.
- [ ] 4. Lifecycle and deadline semantics (opening with the stored selection, closeout,
      auto-finalisation), with boundary and race tests.
- [~] 5. Pool pack format and checks (`src/lib/exam/pool-pack.ts`) and the loader
  (`scripts/load-exam-pool.mts`; `--validate` done, `--load` written but not yet run: it needs
  the migration and the real Sandbox). Maintenance script (AC33): not started.
- [ ] 6. Exam editor mode (paste and drag blocking, `examMode` off by default) and autosave.
- [ ] 7. Integrity event collector and ingestion.
- [ ] 8. Proctoring preflight and live media monitoring (no recording).
- [ ] 9. Grading through the existing grader with database-sourced hidden cases, slots and failure
      categories.
- [ ] 10. Result and leaderboard finalisation, corrections and appeals.
- [~] 11. AI evaluation: the evidence, prompt and output guard (`assessment-guard.ts`, AC28a) and
  failure categories (`failures.ts`) are done and tested; the job wiring is not.
- [ ] 12. Results page, leaderboard (repeat marker), archive, Practice for published exam problems,
      the Practice lock (AC49), and the
      published-exam-problem lookup for learning views (AC48).
- [ ] 13. Notifications and learning credit at publication.
- [ ] 14. Observability: alerts and the status endpoint (AC41).
- [ ] 15. Full regression, the queue integration run and real-browser E2E on marked test exam dates
      with test accounts.
- [x] 16. Seven pool problems drafted into the git-ignored `private/exam-pool/` (generator in
      `private/exam-pool-src/`), all valid under the loader's checks with the local runner. They are
      awaiting owner review and Sandbox validation at load.
- [ ] 17. Cutover proposal (AC34), for separate approval.

## Changelog

- 2026-11-06 — created (Draft) from the M10 brief: live monitoring only, no media recording; replaces the
  Daily Learning Challenge.
- 2026-11-06 — added the durable PostgreSQL job queue (AC35–AC41) and integrity scoring as a job.
- 2026-11-06 — final review revision. The owner's seven decisions are recorded. Corrected:
  - lifecycle ownership (AC2): `closed` is a time condition;
  - grading starts at submission (AC14, AC17);
  - the late-event window before integrity scoring (AC24, AC25);
  - one 6-minute lease for every job type (AC38);
  - `grading_failed` is not ranked (AC19);
  - publication is a read-time gate (AC30);
  - learning credit moves to publication to protect secrecy (AC31);
  - lazy exam reminders (AC32);
  - autosave at most every 15 s (AC11).
    Added AC42–AC46 (private authoring, participant nudges, challenges, log hygiene, account deletion),
    the feasibility and limits sections, and the test database.
- 2026-11-06 — sign-off clarifications:
  - proctoring flags and media events are client-reported observations (AC21, AC22);
  - an exam created or accessed after closing never opens (AC47);
  - the delayed-credit interaction with M9A and M9C is verified (AC31);
  - publication waits for credit so Practice cannot pre-empt the M9C ordering (AC30);
  - learning views resolve published exam problems (AC48).
    Status set to Agreed (Umair); teammate sign-off outstanding.
- 2026-11-06 — implementation note, **pending owner OK**: pool content (view, approve, pre-select)
  goes behind a separate `exams.pool` permission of kind `dangerous`. Otherwise the derived `admin`
  tier, which holds every non-dangerous permission, could read unreleased exam problems. AC33's
  `exams.manage` keeps the operational actions.
- 2026-11-06 — fully automated operation (ADR-0011):
  - a fixed schedule in code (AC1) and automatic random problem selection (AC7);
  - the pool is validated when it is loaded, with no approval step (AC42);
  - the admin console, permissions and routine admin actions are removed; exceptions are handled by
    protected, audited maintenance scripts (AC33), corrections by the appeal script (AC26, AC44);
  - automatic alerts and a status endpoint (AC41);
  - the AI assessment uses all four evidence categories, with fact/estimate/unverified tags and
    validation, after result finalisation and never blocking scores (AC28–AC28b);
  - the existing Supabase project is used with additive migrations;
  - operational dependencies are listed.
    The `exams.pool` note above is withdrawn, since there is no admin UI.
- 2026-11-06 — reusable weighted pool (ADR-0012):
  - AC7 rewritten as `selection@1`: progressive cooldown (7 → 1, never yesterday's when 2 or more are
    eligible), weights `(1 + min(daysSince, 30)) / (1 + 3 × priorUses)`, `crypto.randomInt`, stored
    once and never recomputed;
  - cancellation only for an empty pool;
  - AC42 no longer implies replenishment;
  - AC30 and AC31 handle repeats (repeat credit at results publication, re-verified against M9C);
  - AC5 secrecy now also covers repeats;
  - added AC49 (Practice lock while examined), AC50 (repeat labels) and AC51 (selection audit and
    alerts).
- 2026-11-06 — implementation progress: the selection, pool format and loader validation, failure
  categories and the AI assessment guard are built; the seven-problem private pack is validated
  locally. The migration is not applied: no recoverable backup could be verified from this
  environment.
