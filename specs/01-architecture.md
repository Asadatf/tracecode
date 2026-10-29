# TraceCode — architecture spec

Status: **DRAFT.** Follows the template's rules in `AGENTS.md` and
`docs/rules/`; this file only records what is specific to TraceCode.
Decisions with real trade-offs get an ADR in `decisions/`.

## Stack

| Layer          | Choice                                                          | Why / ADR                                    |
| -------------- | --------------------------------------------------------------- | -------------------------------------------- |
| App            | Next.js 16 App Router + React 19 (template)                     | —                                            |
| Data           | Postgres (Supabase) via Prisma only                             | `docs/rules/database.md`                     |
| Auth           | Supabase Auth                                                   | `docs/rules/auth.md`                         |
| Server state   | TanStack Query                                                  | `docs/rules/state-management.md`             |
| Editor         | CodeMirror 6, lazy-loaded on the problem page only _(proposed)_ | Smaller than Monaco; no heavy initial bundle |
| Code execution | Python via Pyodide in a Web Worker, in the browser _(proposed)_ | ADR-0001                                     |
| Tracing        | `sys.settrace` inside the worker, emits a step list             | ADR-0001                                     |
| Hints          | _(open)_ hand-authored in seed data, or AI via `src/server/ai/` | `docs/rules/ai-usage.md` if AI               |
| Analytics      | PostHog typed taxonomy                                          | `docs/rules/analytics.md`                    |

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
```

All tables get RLS enabled with no policies (`docs/rules/auth.md`).

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
