# TraceCode

**Python practice where a failed solution replays step by step, so you can
see why it failed.**

Built by Team D for 8x Playmakers, Coding track, on the theme "Learning that
sticks".

[![CI](https://github.com/Asadatf/tracecode/actions/workflows/ci.yml/badge.svg)](https://github.com/Asadatf/tracecode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## The problem

Practice sites tell you _that_ your code failed ("expected `[1, 2]`, got
`[0, 0]`") but not _why_. So learners guess and resubmit until something
passes. The wrong mental model that caused the bug is still there, and the
next problem trips over it again. A pass reached that way doesn't stick.

## What TraceCode does

When a test fails, you can step through exactly what your code did on that
test: which line ran, the value of every variable, the loop counters, and
the indices drawn against the array. You find the step where your idea of
the program and the real program part ways, fix it yourself, and keep what
you learned.

## Features

- **Fail-and-replay debugger.** Forward, back and scrub through the
  failing test's execution, with variables, loop iterations and array
  pointers at each step.
- **Real Python in the browser.** Code runs in Pyodide inside a Web
  Worker, so there's nothing to install and no server sandbox. Each test
  shows pass or fail, with a step cap and timeout for infinite loops.
- **Curated problem set.** Two Sum, Contains Duplicate, Valid Anagram,
  Move Zeroes, Binary Search and Valid Parentheses. Each has edge-case
  tests, large inputs and measured reference solutions.
- **Progressive hints.** Three levels, from where to look, to what's
  wrong, to a concrete nudge, without giving away the answer.
- **Tracy, the AI tutor.** Ask a question and Tracy answers from your
  problem, code, test results and the selected replay step. She teaches
  Socratically and only writes a full solution when you ask for one.
  Replies stream in.
- **Practice workspace.** Resizable panes, a stopwatch, a first-visit
  tour, Format code, and a phone layout.
- **Progress that brings you back.** An Overview dashboard with progress
  by topic, a Problems page with a calendar, a daily streak flame,
  recommendations based on how you actually work, and an in-app inbox.
  Email reminders are opt-in.
- **Accounts.** Sign in with email and password through Supabase Auth.
  Your attempts and progress are saved to your account.

## How it works

```
Browser                                              Server (Next.js on Vercel)
───────                                              ──────────────────────────
editor ─code─▶ Web Worker (Pyodide)
               ├─ runs each test with sys.settrace
               └─ records line, locals, loops per step
        ◀─RunResult (tests + trace of failing tests)
replay view (trace stays in the browser)
        ─attempt summary, no trace───────────────▶ server action ─Prisma─▶ Postgres
        ─question + bounded context─▶ POST /api/tutor ─stream─▶ LLM (gpt-4o-mini)
                                                     daily cron ─▶ reminders (in-app, email)
```

- The trace never leaves the browser. The server stores only the attempt
  summary.
- Supabase handles sign-in only. All app data goes through Prisma, and
  every table has row-level security switched on.
- Every AI call goes through one adapter, and its cost is recorded in
  `ai_usage`.

The interface between the engine and the debugger is the
[trace contract](specs/02-trace-contract.md).

| Layer     | Choice                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| App       | Next.js 16 (App Router, React Compiler), React 19, TypeScript                                                                |
| Execution | Pyodide 0.27 in a Web Worker, self-hosted ([ADR-0002](decisions/0002-self-host-pyodide.md))                                  |
| Data      | Postgres on Supabase, via Prisma 6                                                                                           |
| Auth      | Supabase Auth                                                                                                                |
| AI        | OpenAI `gpt-4o-mini` behind a provider adapter ([ADR-0005](decisions/0005-tracy-provider-adapter-streaming-session-chat.md)) |
| Email     | Resend (opt-in reminders)                                                                                                    |
| Ops       | Vercel, GitHub Actions, Sentry, PostHog                                                                                      |
| Tests     | `node --test` (unit), Playwright (end to end)                                                                                |

## Getting started

**You need:** Node 22.18 or later, pnpm (through `corepack enable`), and
Python 3, which some unit tests use to cross-check solutions. On Windows,
use WSL2.

```bash
git clone https://github.com/Asadatf/tracecode.git && cd tracecode
./scripts/onboard.sh   # installs, sets up git hooks, creates .env.local
pnpm dev               # http://localhost:3000
```

Practice and the replay work straight away, signed out. Signing in, saved
progress and Tracy need a Supabase project and keys in `.env.local`.
[`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md) covers that step by step.
Every variable is explained in [`.env.example`](.env.example).

## Running the tests

```bash
pnpm test         # unit tests: engine, grading, reference solutions, learning logic
pnpm test:e2e     # Playwright; starts the app itself unless E2E_BASE_URL is set
pnpm lint && pnpm typecheck && pnpm format:check
```

The same gates run in a pre-push hook and in CI on every pull request.

## Project layout

```
src/
├── app/[locale]/    pages: home, practice/<slug>, problems, dashboard, settings, login
├── app/api/         tutor (streaming), cron/learning-reminders, notifications, health
├── components/      trace/ (workspace, editor, replay), dashboard/, problems/, streak/, ...
├── lib/trace/       engine: worker protocol, Zod contract, problem catalog, grading
├── lib/learning/    statistics, recommendations, reminder planning
├── lib/tutor/       Tracy's client: protocol, conversation store, Markdown
└── server/          server actions, AI adapters, Prisma client, email
prisma/schema/       data model (CI generates the migrations)
specs/               product, architecture, trace contract, one spec per feature
decisions/           architecture decision records (ADRs)
e2e/                 Playwright specs
```

## Documentation

- [`specs/README.md`](specs/README.md): how specs work, plus the status
  board.
- [`specs/00-product.md`](specs/00-product.md): users, core loop, scope.
- [`specs/01-architecture.md`](specs/01-architecture.md): stack, data
  model, contracts.
- [`specs/02-trace-contract.md`](specs/02-trace-contract.md): the engine ↔
  debugger interface.
- [`decisions/`](decisions/): why things are built the way they are.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): branches, commits, PRs, CI,
  migrations, deployment.
- [`AGENTS.md`](AGENTS.md): the rules every coding agent and every person
  follows here.

## Contributing

Spec first, then code. Use small PRs and merge only on green CI. The full
workflow is in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Team

Team D, 8x Playmakers: Asad and Umair Rathore.

## License

[MIT](LICENSE)
