# Feature: Personalised learning recommendations (M7)

Status: In progress — **M7.1 implemented**; M7.2–M7.5 are still Draft (not built).
Owner: Umair
Sign-off: M7.1 was implemented on Umair's decision. **Teammate (Asad / Track A + B)
sign-off on the `ast` worker-protocol addition was not separately obtained** — see
`specs/02-trace-contract.md` § "Amendment: `ast` worker message".
Related: `specs/00-product.md` § "How users see progress" / open decision #2
(AI provider) and the "learning that sticks" revisit signal; `specs/01-architecture.md`
(data model, API contracts); `specs/02-trace-contract.md` § "Amendment:
`ast` worker message" (additive; implemented, other track owner's sign-off not obtained);
`specs/features/learning-statistics.md` (M6, consumed here); `docs/rules/ai-usage.md`,
`docs/rules/database.md`, `docs/rules/auth.md`, `docs/rules/error-handling.md`.
Decision record: ADR-0003 (browser-side AST analysis + cached recommendations).

## Why

Learners who fail a problem guess-and-resubmit; M6 already turns their recorded
activity into a deterministic, evidence-tagged picture (`getLearningAnalytics()`),
but nothing tells the learner **what to do next**. M7 combines that picture with
a bounded structural read of the Python they actually wrote (via AST, never
executed on the server) to recommend which problem and which concept to practise
next, and — for learners who opt in — nudges them back with a daily email. It
serves "learning that sticks" by pointing at the specific gap the records show,
not a generic "try again".

## Scope and non-goals

### In scope (hackathon slice)

- A **deterministic recommendation engine** ranking the existing static catalog
  (`two-sum`, `contains-duplicate` only) and choosing focus concepts.
- **AST code-features** extracted in the browser Pyodide worker (`ast.parse`,
  no execution), persisted per attempt; **lazy, browser-driven backfill** of up to
  **10 historical (M4) attempts per browser session** — no resubmission required.
- A **bounded per-problem attempt sequence of the latest 5 attempts** (not just
  the latest) so M7 can tell a recurring mistake from a corrected one.
- **Optional AI diagnosis** via OpenRouter (`qwen/qwen3-coder-30b-a3b-instruct`),
  validated against the evidence, cached, with a deterministic fallback.
- A recommendations **card on the existing `/progress` page**.
- **Opt-in daily email reminders** via Resend, with a durable, concurrency-safe
  delivery ledger and inactivity-aware copy.

### Non-goals (v1)

- No new problems invented; the catalog stays the two static `PROBLEMS`.
- No server-side Python execution, ever (ADR-0001 holds).
- No raw learner source sent to OpenRouter (bounded AST + M6 evidence only).
- No cross-learner / instructor / cohort recommendations.
- No AI call on submit, replay, page load, or in the email cron.
- No webhook-confirmed email delivery tracking — we record **accepted by the
  provider**, not **delivered** (see Email).
- No per-user local send-time targeting; a single daily Vercel Hobby cron cannot
  honour per-user hours (see Email).
- No reminder cadence other than **daily** in v1.
- No M8 / M9 implementation; their contracts are reused, not their code (below).
- No change to `RunResult` / `TraceResult` (decision #1).

### Forward compatibility (M8, M9)

`CodeFeatures` and `RecommendationEvidence` are the stable, provider-agnostic
evidence layer that M8 (problem-specific tutor) and M9 (adaptive learning) will
read later. To keep them reusable without building those modules now: the
evidence assembler (M7.2) stays pure and carries no recommendation-only
assumptions, `CodeFeatures` is versioned (`v`) so a later module can widen it
additively, and nothing in the evidence shape encodes a ranking decision. No
M8/M9 code, tables, prompts, or endpoints ship in M7.

## Module boundaries (M7.1–M7.5)

```
SUBMIT (browser)                                                   [no AI]
  Pyodide worker: run tests  ──then──▶ ast message → CodeFeatures
       practice-workspace ──saveAttempt({..., codeFeatures})──▶ attempts.codeFeatures

BACKFILL (browser, lazy, ≤10/session)              [no AI, no server Python]
  practice page opens (signed in) → listBackfillCandidates(limit) → worker ast per source
       → saveCodeFeatures(attemptId, features)   (idempotent, only where null)

GENERATE / REFRESH (server)                          explicit refresh OR dashboard-if-stale
  getLearningAnalytics() ─┐
  attempt sequences    ───┼─▶ M7.2 buildEvidence ─▶ M7.3 rank (deterministic, always)
                          │                           │ evidence changed & refresh-claim won?
                          │                           └─▶ M7.4 OpenRouter → Zod + evidence-check
                          └──────────────────────────────▶ upsert recommendation_cache

READ
  /progress card ──reads──▶ recommendation_cache (deterministic always; diagnosis only if fresh)
  daily cron     ──reads/computes──▶ recommendation_cache ──▶ Resend  (NO OpenRouter call)
```

- **M7.1 — Code evidence.** `src/lib/trace/code-features.ts` (pure projection of
  a Python-emitted structural summary) + an additive `ast` worker message
  (`buildWorkerSource`), returning `CodeFeatures`. Client calls it after a
  successful run and on backfill; `saveAttempt` / `saveCodeFeatures` persist it.
  **Structural facts only** — counts, booleans, a builtin allowlist. No claim of
  correctness, complexity, or mastery (adjustment B).
- **M7.2 — Evidence assembler.** `src/lib/learning/recommendation-evidence.ts`,
  pure: `buildRecommendationEvidence(analytics, sequences, catalog)`. Joins M6
  output + attempt sequences + catalog metadata into `RecommendationEvidence`,
  keeping `observedStructure` and `inferredGaps` in separate fields (adjustment B).
- **M7.3 — Deterministic engine.** `src/lib/learning/recommend.ts`, pure:
  `rankRecommendations(evidence)` → `Recommendation` with `diagnosis.source:
'fallback'`, and `evidenceHash(evidence)`. **Always** produces a complete
  result; this is the source of truth and runs server-side with no browser and no
  Python, so the cron can call it too.
- **M7.4 — AI diagnosis.** `src/server/ai/openrouter.ts` (the only file importing
  the provider SDK / calling `trackAiCall`, per `docs/rules/ai-usage.md`) +
  `src/server/learning/recommend-ai.ts`. Takes M7.3 output + evidence, asks for a
  short diagnosis, validates with Zod **and** against the evidence, attaches on
  success, drops to fallback on any failure.
- **M7.5 — Delivery.** `src/server/learning/recommendations.ts`
  (`getRecommendation()`, degradation contract mirroring `getLearningAnalytics`),
  a `/progress` card, `src/server/email/resend.ts` (the Resend wrapper), and the
  cron route `GET /api/cron/recommendation-emails` guarded by `isCronAuthorized`.

## Typed data contracts

Design sketches (Zod schemas live in `src/lib/learning/` at build time). All are
**bounded**: counts/enums/booleans and short, capped, allow-listed string arrays —
never raw identifiers, so nothing here is PII.

```ts
// M7.1 — persisted on each attempt (attempts.codeFeatures). Versioned, normalized.
type CodeFeatures = {
	v: 1
	loops: { for: number; while: number; maxDepth: number }
	comprehensions: number
	branches: number // if / elif nodes
	returns: number
	defs: number
	recursion: boolean // a def references its own name
	usesDict: boolean
	usesSet: boolean
	usesSorted: boolean
	builtinCalls: string[] // from a fixed allowlist (len/range/enumerate/…), sorted, ≤16
	nodeCount: number // AST node count (size proxy, NOT a complexity claim)
	lineCount: number
}
// What the worker's `ast` message returns. A source that doesn't parse, or can't
// be analysed, is a VALIDATED outcome (never a throw); no features are stored for it.
type AstResult =
	| { status: 'ok'; features: CodeFeatures }
	| { status: 'syntax_error'; syntaxError: { message: string; line: number; column: number } }
	| { status: 'analysis_error'; message: string; permanent: boolean }
// permanent: too large / parser limit (the same source always fails);
// not permanent: timeout or dead worker (worth retrying later).

// What the column holds instead for a source that can never be analysed.
type UnanalyzableMarker = { v: 1; unanalyzable: 'syntax_error' | 'not_analyzable' }

// A pre-M7 or not-yet-backfilled attempt stores null. Readers use
// parseStoredCodeFeatures(value): null / corrupt / other-version → null, never an error. "Normalized" = canonical
// field order and sorted arrays, so equal content serialises identically (feeds
// the evidence hash below).

// Bounded per-problem evolution (adjustment B). Window = latest 5 attempts.
type AttemptSeqItem = {
	order: number // 1-based within the kept window, oldest→newest
	attemptId: string
	createdAt: string
	testsPassed: number
	testsTotal: number
	allPassed: boolean
	failedTestIds: string[]
	code: CodeFeatures | null // null tolerated throughout
}
type StructuralChange =
	// OBSERVED delta between consecutive feature-bearing items
	| 'nested_loops_removed'
	| 'nested_loops_added'
	| 'dict_introduced'
	| 'set_introduced'
	| 'sorted_introduced'
	| 'loop_depth_decreased'
	| 'loop_depth_increased'
	| 'recursion_introduced'
type AttemptSequence = {
	problemSlug: string
	total: number // may exceed items.length
	items: AttemptSeqItem[] // at most 5
	structuralChanges: StructuralChange[] // facts, not judgements
}

// M7.2 — exactly what M7.3 and (a redacted subset of) M7.4 see.
type InferredGap = {
	// reused from M6 behaviour/insights, kept separate
	code: InferredSignalCode | InsightType
	problemSlug: string | null
	basis: 'inferred'
}
type RecommendationEvidence = {
	generatedAt: string // volatile — EXCLUDED from evidenceHash
	perProblem: {
		slug: string
		conceptTags: string[]
		difficulty: 'easy' | 'medium' | 'hard'
		mastery: 'none' | 'attempted' | 'solved'
		sequence: AttemptSequence
		observedStructure: StructuralChange[] // from the sequence (observed)
		inferredGaps: InferredGap[] // from M6 (inferred) — never mixed
	}[]
	concepts: Record<string, { attempted: number; solved: number; struggling: boolean }>
	insights: { type: InsightType; problemSlug: string | null }[] // top-k from M6
}

// M7.3 (+ M7.4) — one cached object, reused by dashboard and email.
type Recommendation = {
	v: 1
	generatedAt: string // volatile — EXCLUDED from evidenceHash
	evidenceHash: string // see "cache invalidation" below
	focusConcepts: string[]
	rankedProblems: { slug: string; score: number; reasonCode: string; reasonText: string }[]
	diagnosis: {
		source: 'ai' | 'fallback'
		stale: boolean // true if this diagnosis was produced for an older evidenceHash
		summary: string // ≤ 280 chars
		nextStep: string // ≤ 160 chars
		claims: { problemSlug: string | null; metric: string }[] // each must exist in evidence
	}
}
```

## Historical attempt handling (adjustment A)

M4 already holds `source` for past attempts with no `codeFeatures`. The server
must never run Python, so backfill is **browser-driven, lazy, and bounded**:

- On practice-page open, once Pyodide is warm, a client task calls `listBackfillCandidates({ limit })` — a session-scoped action
  returning up to `limit` (default and hard cap **10**) of the learner's **own**
  recent attempts whose `codeFeatures` is null, each with its `source`. Attempts
  recorded with status `syntax_error` are never candidates (they can never
  parse, so they would otherwise be re-listed every session).
- **Practice page only.** ADR-0001 keeps Pyodide off every page but the problem
  page, and loading ~14 MB of Python to backfill from `/progress` would break
  that, so the earlier "also on dashboard open" trigger was dropped.
- **The 10-per-session budget** is kept in `sessionStorage` (per tab, survives a
  reload) with an in-memory mirror, so blocked storage degrades to a per-page-load
  bound, never an unbounded one. Each attempt is counted when it is analysed, so
  a source that always fails still uses its slot. The pass waits for the engine to
  be idle (a learner's own Run/Replay is never delayed by more than one parse),
  stops if the page unmounts, and swallows every failure.
- **Source is only ever returned to its owner.** The action is scoped by the
  session user id (never the body), returns at most 10 rows, only for attempts
  that actually need features, and does not page through the whole history. RLS
  backstops it. No endpoint returns another learner's source, and no bulk source
  export exists.
- For each candidate, the client runs the `ast` worker message and posts the
  result via `saveCodeFeatures(attemptId, features)` — ownership-checked,
  idempotent, sets only where currently null.
- **Final failures are recorded, so they are processed once.** A source that
  can never be analysed (it does not parse, or exceeds the limits —
  `analysis_error` with `permanent: true`) gets a small marker stored in the same
  `codeFeatures` column (`{ v: 1, unanalyzable: 'syntax_error' | 'not_analyzable' }`).
  It is no longer null, so it is never listed, downloaded or parsed again, and a
  pile of such attempts cannot hold the newest-first queue hostage (a regression
  test replays four sessions against twelve of them). Readers treat the marker as
  "no features" (`parseStoredCodeFeatures` → null). Retryable failures (timeout,
  dead worker) store nothing and **end the pass** rather than burning the budget.
- **The backfill never boots Pyodide.** It starts only when the worker is already
  booted (after the practice page's warm-up), re-checks before every item, and
  stops if the worker was recycled, so a background pass can never make a
  learner's Run wait behind a runtime reload.
- **The features describe exactly the saved source.** New attempts are analysed
  from the very `source` string that is saved (`withCodeFeatures`); backfilled
  features are keyed by the attempt id the server returned that source for. The
  server cannot re-parse to check (it never runs Python), so a client could store
  features that don't match its own source; that only affects that learner's own
  recommendations, which is the same trust model as client-reported pass/fail
  (ADR-0001).
- **Every layer tolerates `code === null`**: sequences, evidence, ranking and the
  AI prompt all degrade to M6 test-outcome signals when features are absent. No
  learner is ever asked to resubmit.

## Recommendation generation and cache invalidation

- `recommendation_cache` holds one row per user: the full `Recommendation`, plus
  `evidenceHash`, `model`, `diagnosisSource`, `generatedAt`, and the refresh-claim
  fields below.
- **`evidenceHash` is content-addressed** (adjustment 1). It is a stable,
  deterministic hash over the **canonically serialised evidence content**:
  - each in-scope attempt's outcome (`testsPassed`/`testsTotal`/`allPassed`/
    `failedTestIds`) **and its full normalised `CodeFeatures` content** (all
    values, or an explicit `"null"` marker when absent) — **not** merely
    `codeFeatures.v`;
  - the derived `structuralChanges` per problem;
  - the M6 inferred-gap / insight codes in scope.
    It **excludes every volatile field**, including `RecommendationEvidence.generatedAt`
    and `Recommendation.generatedAt`, so re-reading unchanged data yields the same
    hash.
  - **Consequence that adjustment 1 requires:** a backfill that fills a
    previously-`null` feature set changes the hashed content **even though the
    attempt ids and the AST schema version are unchanged**, so the old evidence
    is invalidated and the recommendation (and any AI diagnosis) is refreshed.
- **Dashboard read:** if the cache is missing or its stored `evidenceHash` ≠ the
  freshly computed hash, M7.2+M7.3 run synchronously (pure, cheap) and the fresh
  deterministic result is shown and cached. The AI diagnosis is **not** computed
  on a plain page load.
- **Stale AI diagnosis is never shown as current** (adjustment 3). A diagnosis is
  stored bound to the `evidenceHash` it was produced for. On read, if that hash ≠
  the current evidence hash, `getRecommendation` returns the fresh deterministic
  ranking with `diagnosis.source: 'fallback'` and does **not** surface the old AI
  text as the latest analysis. The stale AI text is either dropped or, if shown at
  all, explicitly labelled stale (`diagnosis.stale: true`) and visually separated
  from the current result — never presented as describing the latest attempts.
- **Refresh (explicit):** the learner's "Refresh" action recomputes evidence +
  deterministic ranking and, if the evidence changed and the refresh claim is won
  (below) and AI is enabled, calls M7.4 and caches the validated diagnosis bound
  to the new hash. If AI is skipped or fails, the result stays deterministic.

## OpenRouter call triggers and cost limits (adjustments 4, C)

- **Model:** `qwen/qwen3-coder-30b-a3b-instruct`, registered in `OPENROUTER_SLUGS`
  (`src/server/lib/ai-usage/models.ts`) and configurable there. The public id has
  been independently verified; **still run `pnpm check:ai-models` + `pnpm
typecheck` at integration** to confirm it prices. Calls go only through
  `src/server/ai/openrouter.ts`, tracked with `feature: 'learning_recommendation'`
  (`_retry` for a retry), `meta` = ids/enums only.
- **The only triggers:** (1) explicit learner refresh; (2) — reserved — a future
  scheduled refresh. **v1 cron never calls OpenRouter** (adjustment C).
- **Concurrency-safe refresh claim** (adjustment 4) — not just a timer. To call
  the model for `evidenceHash = H`, a refresh must first **win a durable claim**:
  an atomic conditional write on `recommendation_cache`
  `SET refresh_state='running', refresh_claim_hash=H, refresh_claimed_at=now()
WHERE user_id=? AND (refresh_state IS DISTINCT FROM 'running' OR
refresh_claimed_at < now() - CLAIM_TTL)`. Only the writer whose statement
  affected the row makes the single OpenRouter call; a concurrent refresh for the
  same learner and the same `H` sees the live claim and makes **no** model call
  (it returns the current deterministic result). `CLAIM_TTL` (≈60 s) lets a
  crashed refresh self-heal. On completion the claim is released
  (`refresh_state='idle'`).
- **Other cost guards:** fire only when `evidenceHash` changed since the last
  diagnosis; a per-user minimum interval (≈10 min) as a secondary rate cap even
  across evidence changes; `max_tokens` bounded (≤600). **Never** on submit,
  replay, page load, or per-email.

## Email: preferences, scheduling, deduplication (adjustments 2, 5, D, 6)

- **Preferences** (`reminder_preferences`, one row per user, **opt-in default
  off**): `optIn`, `cadence` (`daily` only in v1), `unsubscribeToken`. All
  reads/writes scoped by session user id. **No per-user send hour** (adjustment 2):
  a single daily cron cannot honour it.
- **Scheduling under Vercel Hobby** (adjustment 2): Hobby triggers a cron about
  **once per day** within an approximate window (max two jobs). So M7 runs **one
  daily cron at a fixed UTC hour** and dedupes on the **UTC calendar date**; it
  does not attempt local-time delivery and keeps no per-user timezone. This
  coarseness is a known, accepted limitation, documented here and in ADR-0003.
- **Durable delivery ledger** (`email_deliveries`, adjustment 5 / D) — composite
  PK `(userId, deliveryDate, channel)` is the uniqueness constraint and the atomic
  claim:
  - **Claim:** the cron claims a slot with an atomic insert (`ON CONFLICT DO
NOTHING`) at `status: 'claimed'`. Inserted → this run owns the send; conflict
    → another run already owns it → skip.
  - **States:** `claimed → accepted | failed | skipped`. **`accepted`** means
    Resend returned success and we stored its `providerMessageId`; it is **not**
    `delivered` — we make no delivery claim without a webhook (out of v1 scope).
  - **Retry limits:** each send attempt increments `attempts`; a transient failure
    leaves the row claimable for the next daily run until `attempts` reaches
    `MAX_ATTEMPTS` (3), then `failed`. An `accepted` row is never re-sent.
  - **Provider idempotency + crash window** (adjustment 5): the send passes Resend
    a stable **idempotency key** `reminder:{userId}:{deliveryDate}`. Resend
    documents an `Idempotency-Key` on sends; **confirm the exact header and
    semantics at integration** (no API call is made now). If the process crashes
    **after** Resend accepts but **before** we persist `accepted`, the row stays
    `claimed`; the next run retries with the same key and Resend de-duplicates, so
    the learner is not emailed twice. This gives **effective at-most-once** from
    the provider side. Exact-once end-to-end cannot be guaranteed across an
    arbitrary crash without that provider idempotency; this residual crash-window
    limitation is documented and accepted.
- **Cron fallback without OpenRouter** (adjustment 6): for each opted-in user the
  cron **reads or computes** a recommendation with no model call — if a
  `recommendation_cache` row exists and its `evidenceHash` matches freshly
  computed evidence it is reused; otherwise the cron runs M7.2 + M7.3
  **server-side** (pure, no browser, no Python, no AI, tolerant of null features)
  to produce a deterministic recommendation, upserts it, and sends from it. So an
  opted-in learner who never opened the dashboard still gets a correct
  deterministic reminder.
- **Inactivity-aware, no activity gate** (adjustment D): opted-in inactive users
  still get reminders (no "new activity since last email" gate); copy varies
  ("pick up where you left off" vs. "you've been away — here's one problem to
  restart with"). Daily cadence bounds frequency.
- Every email carries an unsubscribe link (sets `optIn=false` via the token).

## Data / API

### Prisma models (added/changed — update `01-architecture.md` in the impl PR)

- **`Attempt.codeFeatures Json?`** added (camelCase column, like every other `learning.prisma` field), nullable,
  versioned payload (`CodeFeatures`, `v:1`). Bounded by the Zod schema on write.
- New file `prisma/schema/recommendations.prisma`:
  - **`RecommendationCache`** — `userId @id @db.Uuid`, `v Int`, `evidenceHash
String`, `payload Json`, `model String?`, `diagnosisSource String`,
    `generatedAt @db.Timestamptz(6)`, `updatedAt @updatedAt`, plus refresh-claim
    fields `refreshState String @default("idle")`, `refreshClaimHash String?`,
    `refreshClaimedAt DateTime? @db.Timestamptz(6)`; FK → `users`
    `onDelete: Cascade`, `@@map("recommendation_cache")`.
  - **`ReminderPreference`** — `userId @id @db.Uuid`, `optIn Boolean
@default(false)`, `cadence String @default("daily")`, `unsubscribeToken String
@unique`, `updatedAt @updatedAt`; FK → `users` `onDelete: Cascade`,
    `@@map("reminder_preferences")`.
  - **`EmailDelivery`** — `userId @db.Uuid`, `deliveryDate @db.Date` (UTC),
    `channel String`, `status String`, `providerMessageId String?`, `attempts Int
@default(0)`, `error String?`, `createdAt`, `updatedAt @updatedAt`,
    `@@id([userId, deliveryDate, channel])`, FK → `users` `onDelete: Cascade`,
    `@@map("email_deliveries")`.
- `User` gains back-relations (`recommendationCache`, `reminderPreference`,
  `emailDeliveries`) in `example.prisma`.
- **RLS:** all new tables stay user-scoped and get RLS **enabled, no policy, not
  forced**, following the existing `20261101170000_enable_rls_on_learning_tables`
  pattern; `pnpm check:rls` proves it in CI. (`attempts` already has RLS.)

### Routes / actions (Zod in, Zod out; session user id only, never from the body)

| Method + path / action                 | Request                                  | Response                                                                           |
| -------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `saveAttempt` (extended)               | existing + `codeFeatures?: CodeFeatures` | `{ persisted }`                                                                    |
| `saveCodeFeatures` (action)            | `{ attemptId, codeFeatures }`            | `{ saved: boolean }` (own attempt, set-if-null)                                    |
| `listBackfillCandidates` (action)      | `{ limit?: number ≤ 10 }`                | `{ items: { attemptId, source }[] }` (own, `codeFeatures` null, ≤10)               |
| `getRecommendation` (server fn)        | —                                        | `{ authenticated, available, recommendation \| null }`                             |
| `refreshRecommendation` (action)       | —                                        | `{ recommendation }` (recompute; AI only if evidence changed + claim won + budget) |
| `updateReminderPreference` (action)    | `{ optIn, cadence? }`                    | `{ preference }`                                                                   |
| `GET /api/cron/recommendation-emails`  | `Authorization: Bearer CRON_SECRET`      | `{ claimed, accepted, failed, skipped }`                                           |
| `GET /unsubscribe?token=…` (or action) | `{ token }`                              | sets `optIn=false`                                                                 |

### Env (add to `src/lib/env.ts` + `.env.example`, all optional-with-graceful-noop)

- `OPENROUTER_API_KEY` — unset → AI disabled, deterministic fallback only.
- `RESEND_API_KEY` — unset → email disabled, cron no-ops.
- `REMINDER_FROM_EMAIL` — must be an address on a **verified Resend domain** for
  real sends; unset → email disabled.
- `CRON_SECRET` already exists.

### Analytics (PostHog typed taxonomy, `docs/rules/analytics.md`)

- `recommendation_viewed`, `recommendation_refreshed` (`{ source: 'ai'|'fallback' }`),
  `reminder_opt_in_changed` (`{ opt_in: boolean }`), `reminder_email_sent`
  (server, `{ inactive: boolean }`). Ids/enums/booleans only.

## Edge cases

- **Empty / first-time:** no attempts → `getRecommendation` returns a
  deterministic "start with the easier problem" result; no AI call; no email slot.
- **No `codeFeatures` yet:** ranking + diagnosis run from M6 outcomes alone; the
  card and email render normally; backfill fills features over a few visits.
- **Backfill fills a null feature set:** the evidence content changes → hash
  changes → recommendation refreshes (adjustment 1), even with the same attempt
  ids and AST `v`.
- **AI off / down / invalid / unverified claim:** `diagnosis.source: 'fallback'`;
  `captureError`; dashboard and email unaffected.
- **Stale diagnosis:** an AI diagnosis whose `evidenceHash` no longer matches is
  never shown as the current analysis (adjustment 3).
- **Concurrent refresh:** two refreshes for the same learner and evidence → one
  wins the claim and calls the model, the other makes no model call (adjustment 4).
- **Unauthenticated / another user's data:** every action and server fn is scoped
  by the session user id; `saveCodeFeatures`/`listBackfillCandidates` only touch
  the caller's own attempts and return only the caller's own source; RLS backstops.
  `getRecommendation` returns `authenticated:false`.
- **DB unavailable:** `getRecommendation` returns `available:false` (mirrors
  `getLearningAnalytics`); never throws.
- **Concurrent cron runs / retries:** the `(userId, deliveryDate, channel)` unique
  slot + Resend idempotency key give at-most-once per user per UTC date; `accepted`
  ≠ delivered; crash window documented (adjustment 5).
- **Resend rejects / throws:** delivery row stays `claimed` with `attempts`
  incremented, retried next run up to `MAX_ATTEMPTS`, then `failed`.
- **Limits:** source analysed ≤ 20 000 characters; every count ≤ 100 000; ast
  timeout 2 s; attempt-sequence window 5; backfill ≤10/session; `builtinCalls` ≤16;
  `max_tokens` ≤600; refresh min-interval ≈10 min; claim TTL ≈60 s;
  `MAX_ATTEMPTS` 3.

## Acceptance criteria

- **AC1** — GIVEN a submitted solution WHEN it runs in the worker THEN an `ast`
  message returns a versioned `CodeFeatures` built by `ast.parse` (never executed),
  containing only counts/booleans and allow-listed builtin names, and
  `saveAttempt` persists it to `attempts.codeFeatures`. If the value fails the
  strict server-side schema it is dropped (and reported) and the attempt is saved
  without features: an AST problem can never cost a learner a submission.
- **AC2** — GIVEN the same source WHEN features are extracted twice THEN the output
  is byte-identical (deterministic, no clock/random), and arrays are sorted so
  equal content serialises identically.
- **AC3** — GIVEN a pre-M7 attempt with `codeFeatures = null` WHEN the learner
  opens a practice page while signed in THEN a client backfill of at most 10 of the
  learner's own attempts per session extracts and saves features, without
  resubmission and with no server-side Python. `saveCodeFeatures` writes only where
  null and only on the caller's own attempts.
- **AC4** — GIVEN several attempts on a problem WHEN evidence is built THEN an
  `AttemptSequence` of at most the latest 5 attempts (oldest→newest) is produced
  with order, timestamps, outcomes, failed test ids, nullable features, and
  observed `structuralChanges` between consecutive feature-bearing items.
- **AC5** — GIVEN a learner who moved from nested loops to a dict/set across
  attempts THEN `structuralChanges` records it as an observed fact
  (`nested_loops_removed` / `dict_introduced`), and no field asserts correctness,
  complexity, or mastery from AST alone; `observedStructure` and `inferredGaps` are
  separate fields.
- **AC6** — GIVEN any evidence (including empty, or all-null features) WHEN the
  deterministic engine runs THEN it returns a complete `Recommendation` with
  `focusConcepts`, a ranked list over the two static problems only, and
  `diagnosis.source: 'fallback'` — no new problems invented, no AI required.
- **AC7** — GIVEN AI enabled, evidence changed, and the refresh claim won WHEN
  `refreshRecommendation` runs THEN OpenRouter is called once through
  `src/server/ai/openrouter.ts`, costed in `ai_usage` with
  `feature:'learning_recommendation'`, and the result is Zod-validated.
- **AC8** — GIVEN an AI diagnosis WHEN any claim references a `problemSlug`/metric
  not present in the evidence THEN the diagnosis is rejected and the engine falls
  back; a validated diagnosis's `claims` all exist in the evidence.
- **AC9** — GIVEN OpenRouter unset, erroring, timing out, or returning invalid JSON
  THEN `getRecommendation` still returns a deterministic result and the
  dashboard/email are unaffected; the failure is `captureError`-reported, not
  thrown.
- **AC10** — GIVEN `evidenceHash` is computed WHEN two reads see the same
  normalised feature content and outcomes THEN the hash is equal; WHEN a null
  feature set is later backfilled (same attempt ids, same AST `v`) THEN the hash
  changes and the cached recommendation is invalidated. Volatile `generatedAt`
  fields never affect the hash. A plain page load never calls AI.
- **AC11** — GIVEN raw learner source WHEN any OpenRouter request is built THEN the
  payload contains bounded `CodeFeatures` + M6 evidence only and never the source
  text or personal details; `ai_usage.meta` carries ids/enums only.
- **AC12** — GIVEN a stored AI diagnosis WHEN the current evidence hash differs
  from the diagnosis's hash THEN `getRecommendation` returns the fresh
  deterministic ranking and does not present the old AI text as the current
  analysis (dropped, or shown only with `stale: true` and separated).
- **AC13** — GIVEN two concurrent refreshes for the same learner and the same
  evidence THEN exactly one wins the durable claim and calls the model; the other
  makes no model call; a crashed claim expires after the TTL.
- **AC14** — GIVEN reminders default off WHEN a learner opts in THEN
  `reminder_preferences` is created/updated for that user only; the unsubscribe
  token sets `optIn=false`. No per-user send hour or timezone is stored.
- **AC15** — GIVEN two concurrent cron runs for the same user and UTC date THEN
  exactly one claims the `(userId, deliveryDate, channel)` slot and sends; the
  other skips. An `accepted` row is never re-sent; a failed send is retried up to
  `MAX_ATTEMPTS`, then `failed`.
- **AC16** — GIVEN a send WHEN it is issued THEN it carries the idempotency key
  `reminder:{userId}:{deliveryDate}`; GIVEN a crash between Resend acceptance and
  persisting `accepted` THEN the next run's retry does not double-send (provider
  de-dupes). `accepted` is recorded, never `delivered`.
- **AC17** — GIVEN the daily cron runs THEN it calls no OpenRouter; for an opted-in
  user without a fresh cached recommendation it computes a deterministic one
  server-side (no browser, no Python) and sends from it.
- **AC18** — GIVEN an opted-in but inactive learner THEN a reminder is still sent
  (no new-activity gate) with inactivity-aware copy; daily cadence bounds
  frequency.
- **AC19** — GIVEN `REMINDER_FROM_EMAIL` not on a verified domain, or
  `RESEND_API_KEY` unset THEN no real send occurs and the cron no-ops cleanly.
- **AC20** — Every M7 read/write (preferences, recommendation, deliveries,
  features, backfill sources) is scoped by the session user id and can't be
  redirected by the body; new tables have RLS enabled with no policy
  (`pnpm check:rls`).

## Test plan

- **Unit (pure, `*.test.mts`):** feature projection from a known Python AST
  (AC1–AC2, incl. a null/absent case); sequence + `structuralChanges` incl.
  nested-loops→dict (AC4–AC5); deterministic ranking over the two-problem catalog
  incl. empty and all-null evidence (AC6); **`evidenceHash` content-addressing**:
  equal content ⇒ equal hash, null→backfilled ⇒ changed hash, `generatedAt`
  ignored (AC10); AI-response Zod + evidence-claim validation and fallback
  (AC8–AC9); stale-diagnosis suppression (AC12); inactivity copy selection (AC18).
- **Python extraction test:** `ast.parse` path in the worker program over fixture
  sources (no execution), asserting bounded output and the builtin allowlist.
- **Action/ownership tests:** `saveCodeFeatures` set-if-null + own-attempt-only;
  `listBackfillCandidates` scoping + ≤10 + own-source-only; `updateReminderPreference`
  scoping (AC3, AC14, AC20).
- **Concurrency tests:** refresh claim — two concurrent refreshes ⇒ one model call
  (AC13); delivery slot — two concurrent claims ⇒ one insert wins (AC15);
  failed→retry/sent→no-resend; idempotency-key present + crash-window retry no
  double-send (AC16).
- **Cron test (fake Resend):** no OpenRouter; deterministic compute for an
  uncached opted-in user (AC17); verified-domain / unset-key no-op (AC19).
- **`ai-usage-check`:** run on this branch — model map vs. live OpenRouter,
  pricing/failure-isolation, a real tracked priced row (`docs/rules/ai-usage.md`).
- **e2e (`e2e-review`):** opt-in → card shows a recommendation → refresh.

## Database changes and migration plan (not executed now)

1. Edit schemas only (no migrate run here): add `codeFeatures Json?` to `Attempt`
   in `learning.prisma`; add `recommendations.prisma` with the three new models
   (incl. the refresh-claim fields on `RecommendationCache`); add `User`
   back-relations in `example.prisma`.
2. Let **CI generate and commit** the schema-diff migration from that diff
   (`docs/rules/migrations.md` — never hand-write a schema migration).
3. Add the **RLS-enable** step for the three new tables following the existing
   `enable_rls_on_learning_tables` migration pattern; `pnpm check:rls` must pass.
   (`attempts` already has RLS.)
4. **Rollout order.** The migration is one nullable column (`ALTER TABLE "attempts"
ADD COLUMN "codeFeatures" JSONB`), which changes no existing row. Apply it
   _before_ running or deploying this code where possible. If the code lands
   first, nothing breaks: `/progress` reads only the five columns it shows (an
   explicit `select`), and `saveAttempt` falls back to the pre-M7 write when the
   database reports the column missing (Prisma `P2022`), so no submission is lost;
   only the backfill reads/writes are unavailable until the migration runs.
5. **No data migration:** `codeFeatures` is nullable with no default; historical
   backfill is the client-driven, bounded path above, not a SQL step.
6. `qwen/qwen3-coder-30b-a3b-instruct` added to `OPENROUTER_SLUGS` only after
   `pnpm check:ai-models` + `pnpm typecheck` confirm it prices.

This is a new behaviour and a new provider, so per `specs/README.md` it needs
**Agreed** status before any code, **and Track A + B sign-off on the additive
`ast` worker-message amendment** in `02-trace-contract.md`; `00-product.md` open
decision #2 and the data model in `01-architecture.md` get updated in the
implementation PR.

## Tasks

- [ ] Teammate sign-off: Asad on the `ast` worker-message amendment, and both
      teammates on this spec (**not obtained** — M7.1 was built on Umair's decision).
- [x] ADR-0003: browser-side AST analysis + cached recommendations (Accepted by
      Umair; teammate sign-off not obtained).
- [x] M7.1 features: worker `ast` message, `code-features.ts`, `saveAttempt`
      extension, `saveCodeFeatures` + `listBackfillCandidates`, client backfill.
      Schema edited (`Attempt.codeFeatures`); migration is generated by CI, not yet
      generated or applied.
- [ ] M7.2 evidence assembler + sequences (+ unit tests).
- [ ] M7.3 deterministic engine + content-addressed `evidenceHash` (+ unit tests).
- [ ] M7.4 `openrouter.ts` wrapper, model map entry, `recommend-ai.ts` with Zod +
      evidence-claim validation, stale handling, and refresh claim (+ tests,
      `ai-usage-check`).
- [ ] M7.5 `/progress` card, `resend.ts` with idempotency key, cron route +
      delivery ledger, preferences + unsubscribe, env + `.env.example` (+ dedup/
      concurrency/cron tests).
- [ ] Update `00-product.md`, `01-architecture.md`, status board.

## Changelog

- 2026-11-02 — created (Draft).
- 2026-11-02 — M7.1 implemented (status → In progress): `ast` worker message and
  `code-features` contract, `Attempt.codeFeatures` (camelCase column), extended
  `saveAttempt`, `saveCodeFeatures` / `listBackfillCandidates`, browser backfill on
  the practice page only (dropped the dashboard trigger — ADR-0001), validated
  `AstResult` failure shape (the draft returned a bare `CodeFeatures`). Teammate
  sign-off on the worker-protocol change not obtained.
- 2026-11-02 — corrections: content-addressed `evidenceHash` (backfill
  invalidates); dropped per-user send hour / timezone (UTC-date dedup, documented
  Hobby-cron limit); stale-diagnosis suppression; concurrency-safe refresh claim;
  durable delivery ledger with retry caps, accepted≠delivered, Resend idempotency
  key + crash-window note; cron deterministic fallback compute; backfill
  source-exposure safeguards; M8/M9 forward-compat note.
