# 0010. The Daily Exam: a scheduled, competitive, browser-monitored daily examination

Date: 2026-11-06
Status: Accepted (Umair, 2026-11-06; teammate sign-off outstanding). **Amended by 0011** (fully
automated operation, fixed schedule, automatic selection, AI evidence). Supersedes 0008; reuses and
amends 0007.

## Context

ADR-0008 (accepted 2026-11-05) made the daily challenge a personal learning exercise: a
soft 30-minute target with unlimited overtime, one final Submit graded in a Vercel Sandbox
(ADR-0007), test counts only, no scores, no ranks, and `specs/00-product.md` listed
competition, anti-cheat and proctoring as out of scope. That design shipped and was verified
in production on 2026-11-06 (13/13 and 5/13 graded in real sandboxes in ~6.7 s, AI
assessments cached, exactly-once streak and review credit).

The product direction is now **Learn → Practice → Compete → Reflect → Retain**: one
globally synchronised exam per UTC day, a common secret problem, a hard 30-minute window, a
deterministic score, browser-observable integrity monitoring, a public ranked leaderboard,
results within an hour of closing, and the problem published for practice the next day.

Four facts constrain the design:

1. **The source repository is public.** `Asadatf/tracecode` is public on GitHub, and
   agent session transcripts (`.claude-logs/`) are committed to it. Anything in source code
   or in a logged agent session is public. The current hidden suites
   (`src/server/challenge/hidden-suites.data.ts`) are therefore already publicly readable,
   and so are the six eligible problems, which are ordinary Practice problems.
2. **Vercel Hobby.** Cron jobs run at most once a day and fire anywhere within the
   scheduled hour. A 15:30 closeout and a 16:30 results target cannot be driven by Vercel
   cron alone. Functions run for at most 300 s (Fluid compute) with ~4.5 MB request bodies.
3. **Browsers observe, they do not guarantee.** Page Visibility, focus, Fullscreen, media
   track events, `getDisplayMedia` `displaySurface`, and the Window Management API
   (`getScreenDetails`, Chromium only, permission-gated) are real signals. Screenshots,
   second devices, other people, other applications and DevTools cannot be detected or
   prevented by a web page.
4. **No object storage exists**, and recording camera, microphone or screen would add
   storage infrastructure, retention and deletion duties and legal consent obligations.

## Decision

1. **The Daily Exam replaces the Daily Learning Challenge**, built behind the disabled
   `daily_exam` flag. It takes over only from a `launchDate`, set after a successful isolated
   end-to-end verification on a separate non-production database and the owner's go-ahead (no
   date yet). Earlier `daily_challenges` / `challenge_attempts` rows are kept, read-only, and keep
   rendering and crediting as they do today. Nothing historical is deleted or rescored.
2. **One exam per UTC date, scheduled durably.** Each exam is a row with its own
   `opensAt`, `closesAt` (= `opensAt` + 30 min), `lateEntryUntil`, `resultsDueAt`
   (= `closesAt` + 60 min) and `publishAt` (next 00:00 UTC), snapshotted from the schedule
   configuration when the exam is created. Changing the configuration never moves an exam
   that already exists. The configuration lives in a typed `daily_exam` feature-flag payload,
   the existing admin-editable configuration mechanism (default 15:00 UTC, 30 min, late
   entry 10 min, results 60 min).
3. **Time is decided on the server, per request.** Every admission, Run authorisation,
   autosave, Submit and result read compares the database server's `now()` with the exam's
   timestamps inside the same conditional write. Correctness never depends on a cron, a
   worker or a browser timer: a request after `closesAt` is rejected even if nothing has
   "closed" the exam yet. There is no overtime.
4. **An explicit, durable lifecycle:** stored statuses `scheduled → open → grading →
finalizing → published → archived`, plus `cancelled` (before opening only). "Closed" is the
   time condition `now ≥ closesAt`, not a stored status, so closing never waits for a job. An exam
   row first created or accessed at or after `closesAt` never opens: nobody is admitted, no problem
   is assigned or read, and closeout publishes it empty. Closeout is idempotent. Each
   transition is one conditional update on the expected prior state, made by the job that owns it.
   **Scheduler (owner decision):** a GitHub Actions scheduled workflow, which is existing
   infrastructure, calls a `CRON_SECRET`-protected tick endpoint every 5 minutes (14:30–16:55 and
   00:00–00:15 UTC). The daily Vercel cron is a backstop, and participant pages may nudge their own
   jobs. This is best effort, not a timing guarantee, and it is a replaceable caller: Vercel Pro
   per-minute cron later is a configuration change, not a redesign. The 60-minute results target
   is measured per exam; an exam past `resultsDueAt` shows "Results are still processing" and is
   flagged to admins.
5. **Secret problems live in the database, never in source.** A private `exam_problems`
   pool (statement, public examples, a public practice set, starter, entry signature, hidden
   cases, reference solutions, review status) is seeded by a script from git-ignored files
   (`private/exam-pool/`), verified against its reference solutions, and approved by the owner in
   the admin console before it can be assigned. Agent session logs capture only prompts and
   replies, so problems may be drafted by tools into those files but are never quoted in a prompt
   or reply. The six M9 hidden suites are public and are never used for an exam. Before `opensAt`
   nothing about the assigned problem leaves the server. The assignment is made at opening (or
   pre-selected by an admin and stored server-side). Between `opensAt` and `publishAt` the statement and examples are
   served only to an admitted participant of that exam. From `publishAt`, a read-time check
   independent of any job, the statement and public examples are public (archive and Practice);
   hidden cases and reference solutions never are.
   Only admin-approved pool problems can be assigned.
6. **Proctoring is live browser monitoring, never recording.** Admission requires the learner to
   grant camera, microphone and screen sharing (entire screen requested; the reported
   `displaySurface` is shown and recorded honestly) and to enter fullscreen. Media tracks are used
   only to observe availability (live, ended, muted) and are stopped when the exam ends or the
   learner leaves. **No audio, video, image or screen content is recorded, uploaded, stored,
   analysed or viewable by anyone.** The page says so. No face, voice, emotion or attention
   analysis. Declining is allowed and leads to Practice instead. Preflight flags and media
   availability events are **client-reported observations, not tamper-proof attestations**: a
   modified browser can report anything. They gate admission only as "a passing preflight record
   exists", are never treated as proof of continuous monitoring, and an unsupported, missing or
   failed signal is never penalised automatically.
7. **Integrity events are observations with a confidence level, not proof.** A structured,
   idempotent, rate-limited, attempt-scoped event log, timestamped by the server. A versioned,
   pure, deterministic policy turns the log into warnings, capped automatic deductions (only for
   reliable, disclosed rules: repeated tab hiding, blocked paste attempts, fullscreen exits beyond
   grace) and review flags (screenshot-shortcut observations, multiple screens reported, media
   interruptions, delivery gaps). Weak or unsupported signals never deduct automatically. Admins
   can correct a decision; a correction is a new audited record, never an overwrite.
8. **Deterministic score, stored as integers.** Correctness 0–8000 (hundredths of a point) =
   `floor(8000 × passed / total)`. Speed 0–2000 only on a full pass = `floor(2000 × max(0,
1800 − elapsedSeconds) / 1800)`, where `elapsedSeconds` = server submit time − `opensAt`
   (auto-finalised attempts use `closesAt`). `finalScore = max(0, coding − deductions)`. Ranking:
   full pass first, final score, hidden tests passed, earlier submission, then a stable hash of
   (exam id, user id). No LLM ever affects a score.
9. **Exactly one final submission per learner per exam**, either manual (confirmed) or
   automatic at closing from the last durably autosaved snapshot (the published rules say so). No
   snapshot means "no submission", never invented code. Reuse the existing Sandbox grader with
   bounded grading concurrency. A manual submission is graded as soon as it is made (results stay
   hidden until publication), so the backlog at closing is mostly auto-finalised attempts.
10. **Leaderboard after the finalisation barrier only**, per exam, persisted, with no live
    standings. It is published only when every attempt is graded, finalised as a no-submission,
    or explicitly marked as a grading failure (listed as "not ranked", never scored 0 in the
    ranking). It shows a username only for learners with a public username who explicitly opted in
    to a public leaderboard identity; everyone else is "Anonymous participant" (counted and ranked,
    never identified). Before `publishAt` it never names the problem. Corrections re-publish with a
    visible, dated marker. Learners can challenge a deduction within 30 days.
11. **Learning credit is unchanged in meaning and moves to publication.** A full pass records one
    Attempt, progress, streak activity and the M9C review, dated at the submission, exactly once. A
    fail records none. Credit is written by `EXAM_PROBLEM_PUBLICATION` at `publishAt`, not at
    grading, because progress, profile, activity and recommendation views name the problem, and it
    must stay private until the next UTC day. M9A and M9C semantics are unchanged; the exam day
    simply appears from the next day. Practice after publication is ordinary Practice (served from
    the server) and never changes an exam result.
    Publication waits for that credit (the problem is public at the later of `publishAt` and credit
    completion), so no Practice attempt on the problem can precede its exam credit. Verified against
    the code: streak, activity and profile statistics are computed on read from `attempts.createdAt`
    (nothing derived is stored), so a backdated Attempt counts its original day exactly as an on-time
    write would; M9C enrols with review 1 due D+1 and treats replays as no-ops. The only visible
    effect is a delay before the exam day appears.
12. **All post-exam work runs through one durable, PostgreSQL-backed job queue** (`exam_jobs`),
    worked by bounded, scheduled invocations. There is no long-running worker. The repository has no
    generic queue, but it has the same claim pattern four times (challenge grading, notification
    deliveries, recommendation refresh, assessment claims: a conditional claim, a claim TTL, bounded
    attempts and an error code). The queue generalises exactly that pattern for exam work; the
    existing per-table claims stay as they are. The mechanics:
    - **Jobs and idempotency.** Each job is a row with a unique idempotency key
      (`type:examDate[:attemptId]`), created with `createMany … skipDuplicates`. A job is created
      in the same transaction as the state change that causes it (a transactional outbox).
      Time-driven jobs (closeout, publication, retention) are enqueued when the exam row is created,
      with `runAfter` set to their boundary.
    - **Claiming.** An optimistic conditional `updateMany` on (`id`, `status = pending`,
      `runAfter ≤ now()`) sets `running`, a fresh lease token and `leaseExpiresAt`, and increments
      `attempts`. Two workers cannot both win. `FOR UPDATE SKIP LOCKED` via `$queryRaw` is a
      permitted later optimisation, not needed at this scale.
    - **Leases and fencing.** An expired lease returns the job to claimable, which recovers crashed
      workers and redeploys. Every completion and every effect write is fenced on the lease token and
      on the domain row's own conditional state transition, so a stale worker can neither overwrite a
      newer result nor apply an effect twice. Every lease is 6 minutes, longer than a sandbox run and
      the 300 s function lifetime, so a live worker is never overlapped.
    - **Retry and dead letter.** Bounded exponential backoff (`runAfter` = now + base × 2^attempt,
      capped). Exhausted jobs go to `dead`, which is manual review. A dead grade makes the attempt
      `grading_failed` (counted, never silently dropped). Admins with `exams.manage` can retry a
      dead job, with an audit row.
    - **Dependencies.** A job becomes claimable only when its prerequisites are terminal, checked at
      claim time: closeout, then per-attempt grade and per-attempt integrity score, then result
      finalisation, then leaderboard finalisation, then notifications. AI evaluation runs per attempt
      after its grade and is never a prerequisite: results publish with the assessment marked
      `pending`, `ready` or `unavailable`.
    - **Bounded Sandbox concurrency.** A fixed set of slot rows (`exam_job_slots`, default 4) is
      leased conditionally, giving an exact global bound across concurrent invocations.
    - **Time budgets.** Each invocation stops claiming at 240 s of its 300 s limit.
    - **Observability.** Per-exam backlog by type and status, failure and dead counts, enqueue→done
      latency, and close→publish duration are recorded and shown to admins and in the tick
      response. When capacity is short the backlog and delay are reported honestly; nothing is
      promised regardless of volume.
13. **Integrity events are ingested directly, scored by a job.** Browser events are written during
    the exam by a cheap, validated, deduplicated, rate-limited Server Action (never one job per
    event), accepted up to 60 s after `closesAt`. From `closesAt` + 90 s, one
    `EXAM_INTEGRITY_SCORE` job per attempt runs the versioned policy over that attempt's events and
    appends the automatic decision. Automatic deductions are capped at 2,000 of 10,000 units, apply
    only to reliable observed violations beyond grace periods, and never to unsupported checks,
    possible screenshot shortcuts or uncorroborated media interruptions, which are review signals. It must finish before result and
    leaderboard finalisation. Event metadata older than the retention period (default 90 days after
    publication, longer than the 30-day window for challenging a decision) is removed by
    `EXAM_RETENTION_CLEANUP`; decisions and scores are kept.

## Alternatives considered

- **Keep both the learning challenge and the exam.** Rejected by the product owner: the exam
  replaces it.
- **Keep the six public Practice problems as the exam pool.** No secrecy, because they are public.
- **Keep secret problems in source (server-only module).** The repository is public.
- **Record camera, microphone and screen** to Vercel Blob or Supabase Storage. Deferred: new
  infrastructure, upload limits, retention and deletion, access auditing and legal consent duties,
  for evidence a reviewer would still have to interpret. Live monitoring gives the observable
  signals without holding anyone's media.
- **Drive the pipeline with Vercel cron.** Hobby crons are daily and imprecise. Vercel Pro
  (per-minute crons) is the documented future replacement for the GitHub Actions caller.
- **Credit learning at grading time.** It would put the secret problem on progress, profile and
  recommendation views before the next-day publication.
- **Redis / BullMQ, or Vercel Queues.** New infrastructure or a new provider. PostgreSQL already
  gives durable rows, conditional updates and transactions, and nothing at exam scale needs more.
- **One job per integrity event.** Heavy and pointless. Events are small writes; only the per-attempt
  computation needs durability and ordering.
- **A long-running worker.** Not possible on Vercel functions. Bounded invocations with leases
  replace it.
- **Floating-point scores.** Ties and ordering would depend on rounding. Integers in hundredths
  are exact.
- **LLM-assigned quality points.** Not deterministic or auditable. AI feedback is learning
  feedback only.

## Consequences

- `specs/00-product.md` drops "competitive features" and "anti-cheat or proctoring" from Out of
  scope for the Daily Exam only. Practice stays browser-side and unmonitored (ADR-0001).
- ADR-0008 becomes `Superseded by 0010` on acceptance. ADR-0007's dormant scoring is replaced by
  §8 here, and its weekly leaderboard by the per-exam leaderboard.
- Problem secrecy now depends on operational discipline outside the codebase: pool content is
  authored and seeded outside logged sessions and the public repository. The existing six hidden
  suites must be treated as public; they stay valid for historical learning-challenge records only.
- New tables: exams, exam problems, exam attempts, autosave snapshots, integrity events, integrity
  decisions, challenges, standings, jobs, job slots, audit. All get RLS with no policies.
- Practice learns to serve a published exam problem from the server (`/practice/<slug>`), without
  changing Practice behaviour for catalogue problems. Views that name problems resolve published
  exam problems too.
- Capacity on Hobby is bounded by function invocations (about 100 daily participants comfortably)
  and GitHub Actions schedule jitter (5–15 minutes). Both are measured by the integration run, and
  both are lifted by Vercel Pro.
- All M10 migrations, queue integration runs, test exams and failure simulations run on a separate
  non-production database. Production credentials and user data are never copied into it.
- Admins gain exam permissions in the RBAC catalog (`exams.read`, `exams.manage`, `integrity.review`).
- The one-hour target is measured and reported per exam (`closesAt` → `publishedAt`).
- Browser support is uneven. Window Management is Chromium-only, `displaySurface` constraints and
  reporting vary by browser, Safari restricts element fullscreen, and mobile cannot screen-share.
  The preflight states what this browser supports; a browser that cannot meet a required check
  cannot be admitted and is told why.
