# TraceCode — architecture spec

Status: **DRAFT.** Follows the template's rules in `AGENTS.md` and
`docs/rules/`; this file only records what is specific to TraceCode.
Decisions with real trade-offs get an ADR in `decisions/`.

## Stack

| Layer          | Choice                                                                              | Why / ADR                                    |
| -------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| App            | Next.js 16 App Router + React 19 (template)                                         | —                                            |
| Data           | Postgres (Supabase) via Prisma only                                                 | `docs/rules/database.md`                     |
| Auth           | Supabase Auth                                                                       | `docs/rules/auth.md`                         |
| Server state   | TanStack Query                                                                      | `docs/rules/state-management.md`             |
| Editor         | CodeMirror 6, lazy-loaded on the problem page only _(proposed)_                     | Smaller than Monaco; no heavy initial bundle |
| Code execution | Python via Pyodide in a Web Worker, in the browser _(proposed)_                     | ADR-0001                                     |
| Tracing        | `sys.settrace` inside the worker, emits a step list                                 | ADR-0001                                     |
| Hints          | Hand-authored ladders in the catalog; Tracy (AI tutor) streams via `src/server/ai/` | ADR-0005, `docs/rules/ai-usage.md`           |
| Analytics      | PostHog typed taxonomy                                                              | `docs/rules/analytics.md`                    |

## Execution and trace pipeline

The exact `RunRequest`/`RunResult`/`Step` shapes and the worker protocol
are in [`02-trace-contract.md`](02-trace-contract.md).

```
editor ──code──▶ Web Worker (Pyodide)
                  ├─ run each test with sys.settrace
                  ├─ per step: line, event, locals snapshot, loop counters
                  └─ cap: MAX_TRACE_STEPS, wall-clock timeout (worker terminated)
               ◀──RunResult { tests[], trace for each failing test }
client ──POST /api/attempts (results summary, no trace)──▶ server ──Prisma──▶ attempts
```

- The trace lives client-side only; it is not persisted (size, privacy).
- Pointers = locals whose int value indexes a list in the same frame; the
  problem's metadata can name them explicitly (`pointerVars`).
- Infinite loops: the worker is terminated after the timeout; the partial
  trace up to the step cap is still shown.

## Data model (Prisma, draft)

```prisma
model Problem {
  id          String   @id @default(uuid()) @db.Uuid
  slug        String   @unique
  title       String
  statement   String          // markdown
  starterCode String
  conceptTags String[]        // "loops", "arrays", "pointers"
  difficulty  Int             // 1..3
  pointerVars String[]        // optional trace hints for the visualiser
  tests       ProblemTest[]
  hints       Hint[]
}

model ProblemTest {
  id        String  @id @default(uuid()) @db.Uuid
  problemId String  @db.Uuid
  input     Json
  expected  Json
  isHidden  Boolean @default(false)
  order     Int
}

model Hint {            // only if hints are hand-authored
  id        String @id @default(uuid()) @db.Uuid
  problemId String @db.Uuid
  level     Int           // 1..3
  body      String
}

model Attempt {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  problemId   String   @db.Uuid
  code        String
  passed      Boolean
  testsPassed Int
  testsTotal  Int
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  codeFeatures Json?     // M7.1: bounded structural fingerprint of the source (see below)
}

model ProblemProgress {   // one row per user × problem
  userId          String    @db.Uuid
  problemId       String    @db.Uuid
  status          ProgressStatus @default(ATTEMPTED)
  attempts        Int       @default(0)
  maxHintLevel    Int       @default(0)
  solvedAt        DateTime? @db.Timestamptz(6)
  rebuiltAt       DateTime? @db.Timestamptz(6)
  @@id([userId, problemId])
}

enum ProgressStatus { ATTEMPTED SOLVED MASTERED }

model ProblemNote {       // specs/features/problem-notes.md; table problem_notes
  userId      String   @db.Uuid
  problemSlug String
  body        String          // plain text, max 2 000 characters; empty = deleted
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)
  @@id([userId, problemSlug])
}
```

All tables get RLS enabled with no policies (`docs/rules/auth.md`).

### M9A — streak qualification, activity and public-profile settings

`Attempt.meaningful` (`Boolean?`, no default) is the server's verdict that a run is
real work for the streak (`streak.md` AC4a/AC4b); null means saved before it existed.
`Attempt @@index([userId, createdAt])` serves the activity read
(`activity-heatmap.md`). `User.username` (`String?`, unique, stored normalised) and
`User.profileVisibility` (`ProfileVisibility`, default `PRIVATE`) hold the
public-profile settings (`public-profile-settings.md`). No new tables.

### M9C — spaced review

`ProblemReview` (table `problem_reviews`, one row per user × problem) tracks the
fixed 1 / 3 / 7 day review cycle (`spaced-review.md`, ADR-0006): successful reviews so
far (0–3), the UTC due date and timestamps; no score or text. Due-review reminders reuse
`learning_notifications` and `notification_deliveries` under their own kind and channel.

### M9B — daily challenge and weekly leaderboard

`daily_challenges` pins one problem per UTC date; `challenge_attempts` holds one competitive
attempt per learner per challenge (unique key), with a server-set deadline, a private
source and server-verified results; `weekly_standings` archives closed weeks;
`User.leaderboardOptIn` is the separate leaderboard consent (`daily-challenge.md`,
ADR-0007). A score is written only by the server-side sandbox grader, never from a browser.

### M7.1 — code features on attempts

`Attempt.codeFeatures` (`Json?`, nullable, no default) holds a versioned,
bounded `CodeFeatures` value (`specs/features/learning-recommendations.md`,
`src/lib/trace/code-features.ts`): loop/branch/return/def counts, comprehension
and recursion indicators, dict/set/sorted use, an allow-listed set of builtin
call names, and node/line counts — no identifiers or source text. It is computed
in the browser by the Pyodide worker's `ast` message (`ast.parse` only; the
server never runs learner code) and is null for attempts made before M7 until a
bounded browser backfill (≤ 10 per session, practice page only) reaches them.
The column is validated by a strict Zod schema on every write, and readers use
`parseStoredCodeFeatures`, which treats null/corrupt/other-version as "no
features". For a source that can never be analysed (it does not parse, or exceeds
the limits) the column holds a small marker (`{ v: 1, unanalyzable: … }`) instead,
so the backfill never re-processes it; readers see that as "no features" too.
`saveAttempt` drops an invalid `codeFeatures` value rather than rejecting the
attempt.

Server actions (`src/server/actions/learning.ts`, user id from the session only):
`saveAttempt` takes an optional `codeFeatures`; `listBackfillCandidates({ limit ≤ 10 })`
returns the signed-in learner's own newest attempts still missing features;
`saveCodeFeatures({ attemptId, codeFeatures })` sets them only while missing, in a
single conditional `UPDATE`. No new table, so no new RLS statement.

### M7.5 — recommendation cache and learning notifications

Schema only so far: the create-table migration is generated by CI, and each new
table needs the hand-written `ENABLE ROW LEVEL SECURITY` migration after it
(ADR-0004 § RLS ordering). **Neither migration has been generated or applied
yet**, so everything below that reads or writes these tables is unit-tested
against in-memory fakes but not yet against Postgres.

- `recommendation_cache` (M7.5A, `prisma/schema/recommendations.prisma`) — one row
  per learner: the versioned `Recommendation` payload, its `evidenceHash`, the AI
  `model` and `diagnosisSource`, the refresh claim (`refreshState`,
  `refreshClaimHash`, `refreshClaimedAt`) and `lastRefreshAt` for the cooldown.
- `notification_preferences` (M7.5B, `prisma/schema/notifications.prisma`) — one
  row per learner: `inAppEnabled` (default true), `emailOptIn` (default false),
  `cadence` ('daily'), `unsubscribeToken` (unique, 256-bit random).
- `learning_notifications` — the in-app inbox: `(userId, logicalKey)` unique
  (`daily:<UTC date>`), `kind`, an enum-only `payload` (the `ReminderPlan`),
  `readAt`.
- `notification_deliveries` — the external-channel ledger, PK
  `(userId, deliveryDate, channel)`: `status` (`claimed` → `accepted` | `retry` |
  `failed`), `attempts` (≤ 3), `claimedAt`, `providerMessageId`, `lastError` (a
  code, never a message or address).

Entry points (user id from the session only, except the cron, which iterates
learners itself):

| Entry point                                                                                 | Purpose                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `getRecommendation()` (server fn)                                                           | Deterministic recommendation + cached AI diagnosis; never calls AI |
| `refreshRecommendationAction` (action)                                                      | Explicit AI refresh behind cooldown + durable claim                |
| `listNotificationsAction` / `markNotificationReadAction` / `markAllNotificationsReadAction` | The bell: latest 20, unread count, mark read (own rows only)       |
| `getNotificationPreferencesAction` / `updateNotificationPreferencesAction`                  | Per-channel switches                                               |
| `unsubscribeEmailAction({ token })`                                                         | Confirm-first unsubscribe page; token turns email off only         |
| `POST /api/notifications/unsubscribe?token=`                                                | RFC 8058 one-click (List-Unsubscribe-Post); always 200             |
| `GET /api/cron/learning-reminders`                                                          | Daily scheduler, `CRON_SECRET`; counts only in the response        |

### M8 — Tracy, the AI Tutor

A streaming, authenticated tutor endpoint. No new tables: chats live only in the
browser's `sessionStorage`, and spend is recorded in the existing `ai_usage`
table (`feature: 'tutor_chat'`). Behaviour is in `features/contextual-ai-tutor.md`;
the trade-offs are in ADR-0005.

| Entry point                       | Purpose                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/tutor`                 | Authenticated, validated, rate-limited. Streams the reply as NDJSON (`start`, `delta`*, then one of `done`, `aborted`, `error`). Precondition failures return JSON with a status. |
| `src/server/ai/tutor-provider.ts` | Provider-independent contract (`TutorPrompt`, a streaming handle with deltas, one completion, abort) and the provider switch                                                      |
| `src/server/ai/openai.ts`         | The only OpenAI call; one `trackAiCall` per stream (real usage only, error rows for cut-off or stopped streams)                                                                   |
| `src/server/tutor/handler.ts`     | Context assembly: curated knowledge, bounded evidence, system prompt                                                                                                              |

Environment: `OPENAI_API_KEY` (server only), `AI_TUTOR_PROVIDER` (default
`openai`), `AI_TUTOR_MODEL` (default `gpt-4o-mini`; must be mapped in
`OPENROUTER_SLUGS`).

## API contracts (draft)

All bodies validated with Zod; every route requires a session and scopes
by `userId` from it, never from the body.

| Method + path                       | Request                                     | Response                                                           |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/problems`                 | —                                           | `{ problems: { slug, title, conceptTags, difficulty, status }[] }` |
| `GET /api/problems/:slug`           | —                                           | `{ problem, tests: visible only, hintLevelsAvailable }`            |
| `POST /api/problems/:slug/attempts` | `{ code, testsPassed, testsTotal, passed }` | `{ attemptId, progress }`                                          |
| `POST /api/problems/:slug/hints`    | `{ level, failingTestId?, traceSummary? }`  | `{ level, body }` — level must be ≤ current max + 1                |
| `POST /api/problems/:slug/rebuild`  | `{ completed: true }`                       | `{ progress }` (requires a passed attempt)                         |
| `GET /api/progress`                 | —                                           | `{ totals, byTag[], trend[] }`                                     |

Hidden tests: v1 runs tests client-side, so "hidden" tests are only hidden
from the UI, not secure (ADR-0001).
