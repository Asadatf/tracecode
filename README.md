# TraceCode

Coding practice where failed solutions replay step by step, so you see
exactly why they failed. Built by Team D for 8x Playmakers ("Learning that
sticks", Coding track).

When your solution fails a test, TraceCode replays its execution one step
at a time (variables, loops, pointers), so you see where your mental
model and the program part ways. Progressive hints nudge you without
giving the answer away, and once you pass, you rebuild the solution from
blocks to lock in the structure.

## New here? Start here

1. **Set up:** clone, then run `./scripts/onboard.sh` (details in
   [Getting started](#getting-started)).
2. **Read, in order:**
   - [`specs/README.md`](specs/README.md): how we work with specs, fixes
     and decisions, plus the **status board** (what's agreed, what's
     draft, what's next).
   - [`specs/00-product.md`](specs/00-product.md): problem, users, core
     loop, v1 scope, out of scope, how users see progress.
   - [`specs/02-trace-contract.md`](specs/02-trace-contract.md): the
     contract between the Python engine (Track A) and the visual debugger
     (Track B), with a full Two Sum fixture.
   - [`specs/features/fail-and-replay.md`](specs/features/fail-and-replay.md):
     the first milestone, Two Sum → failing test → step-through replay.
   - `AGENTS.md`: the rules every coding agent follows (and so do we).
3. **Work:** see [Working in this repo](#working-in-this-repo):
   branches, commits, PRs, CI and merging.

## Where we are

- Repo set up from the 8x `template-web` template; all CI gates green.
- Specs and ADR-0001 (Python in the browser via Pyodide) are **drafts**;
  agreeing the trace contract and the track split is the next step.
- No app code yet. The order of work is: agree the contract → one shared
  PR with the contract's Zod schemas + fixture → Track A and Track B in
  parallel → integrate on Two Sum.

The live version of this is the status board in `specs/README.md`.

## Stack

| Layer           | Choice                                                        | Note                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack, React Compiler) + React 19 | See `AGENTS.md` for the v13/14→16 breaking changes that matter                                                                                                                     |
| Styling         | Tailwind CSS v4 (CSS-first, no `tailwind.config.js`)          | Tokens in `src/app/globals.css`, see `DESIGN.md`                                                                                                                                   |
| Database        | Prisma 6                                                      | Schema-only workflow — CI generates and commits migrations, you never hand-write one. Prisma 7 is a deliberate future upgrade, not the default (driver-adapter migration required) |
| Auth            | Supabase Auth                                                 | Auth/session only — Prisma still owns all application data. Removed entirely for landing pages with no accounts, see `docs/rules/auth.md`                                          |
| Server state    | TanStack Query                                                | `QueryClient` created inside `useState`, never module scope                                                                                                                        |
| i18n            | next-intl                                                     | Component-scoped translation files                                                                                                                                                 |
| Observability   | Sentry + PostHog                                              | Both no-op gracefully until real keys are set; unified behind `captureError`/`captureClientError`, see `docs/rules/error-handling.md`                                              |
| Testing         | `node --test` (unit) + Playwright (e2e)                       |                                                                                                                                                                                    |
| Package manager | pnpm                                                          | Version pinned in `package.json`                                                                                                                                                   |

## Project structure

```
tracecode/
├── .claude/skills/          Claude Code skills — see "Skills" below
├── .claude-logs/            tracked (not gitignored) — AI session transcripts ship with the branch
├── .github/workflows/       ci.yml, deploy-migrations.yml, claude-code-review.yml
├── .githooks/commit-msg     installed automatically by `pnpm install`
├── decisions/              ADRs — one file per architectural decision
├── docs/
│   ├── rules/                one file per engineering rule (see below)
│   ├── STANDARDS.md          what every repo from this template carries, and the check that proves it
│   └── CI_CD_SETUP.md        GitHub secrets/environments + Vercel setup
├── e2e/smoke.spec.ts        Playwright — delete once real coverage exists
├── messages/en.json         i18n strings
├── prisma/schema/            multi-file schema — the only thing you hand-edit
│   └── migrations/           CI-generated only, never by hand
├── prisma/run-once.sql       one-off SQL, applied once per database on the next deploy
├── specs/                  product, architecture and per-feature specs (spec-driven development)
├── scripts/                  commit-msg check, migration generator, run-once SQL runner, env-var check, standards check, RLS check
├── src/
│   ├── app/[locale]/         App Router pages, error.tsx, not-found.tsx, [...rest]/ (404 plumbing)
│   ├── app/global-error.tsx  root boundary, inline-styled (see docs/rules/error-handling.md)
│   ├── app/globals.css       design tokens (light + dark)
│   ├── components/           query-provider.tsx, error-page.tsx, error-boundary.tsx, ui/ (Button, Input, Card, toasts, ...)
│   ├── i18n/                 next-intl routing + request config
│   ├── lib/                  cn.ts, env.ts, toast.ts, errors/, observability/, notifications/, posthog/, supabase/
│   ├── server/                db/client.ts (the only file that touches Prisma), api/ (route factory)
│   └── proxy.ts               Supabase session refresh + next-intl locale routing
├── instrumentation.ts        Sentry init + env validation, run once at server boot
├── AGENTS.md                  index into docs/rules/* — read by every coding agent
├── CLAUDE.md                  thin: @AGENTS.md + session-log convention + skills pointer
├── DESIGN.md                  design-token/component conventions
└── .env.example               every variable explained inline
```

## Getting started

```bash
git clone https://github.com/Asadatf/tracecode.git && cd tracecode
./scripts/onboard.sh
pnpm dev                           # http://localhost:3000
```

**OS support:** tested on macOS; it's plain bash, so Linux should work too.
**On Windows, use WSL2** (Ubuntu): install it with `wsl --install`, then
clone and run everything _inside_ WSL (under `~/`, not `/mnt/c/`, which is
very slow), with Claude Code running in WSL too. Native Windows isn't
supported: the script needs bash and nvm, and the session-log hook expects
`python3` and Unix paths, so your sessions wouldn't be logged.

`scripts/onboard.sh` is safe to re-run. It:

- checks Node ≥ 22.18 and, if nvm is installed, switches to the version
  in `.nvmrc` (older Node can't load the unit tests, so every push would
  be blocked; run `nvm alias default 22` so new shells use it too);
- enables pnpm via corepack and runs `pnpm install`, which also installs
  the **git hooks** (`.githooks/`: commit-message format, secrets scan,
  pre-push lint/typecheck/tests) and generates the Prisma client;
- creates `.env.local` from `.env.example` if missing. Sentry, PostHog and
  Supabase no-op or fail open locally until their values are set; get
  the shared Supabase values from a teammate, never from a commit;
- checks the **agent session-log hook**: `.claude/settings.json` runs
  `.claude/hooks/extract-log.py` after every prompt and reply, writing the
  session to `.claude-logs/`. Claude Code asks once to trust the
  project's hooks; say yes;
- checks your git identity and that `gh` (GitHub CLI) is signed in.

Once a database exists: `pnpm exec prisma migrate dev` for the first local
migration (see Database & migrations).

## Working in this repo

### The loop

1. **Spec first.** New feature or behaviour change: write or update the
   spec (`/spec-feature` in Claude Code) and get it agreed. Bug fix:
   check the table in `specs/README.md`, since most fixes need no spec edit.
2. **Branch** from an up-to-date `main`: `feat/<topic>`, `fix/<topic>`,
   `chore/<topic>`, `docs/<topic>`. Never commit to `main` directly.
3. **Build** against the spec. Each acceptance criterion (AC1, AC2…) gets
   a test that names it.
4. **Review locally before pushing:** `/local-review` in Claude Code (it
   runs lint, typecheck, format, env check, tests, build, `/spec-check`
   and a rules pass). Without Claude Code:
   `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
   CI is not the dev loop: every push to an open PR is a paid CI run.
5. **Commit:** few commits, not one per tweak. The format is Conventional
   Commits, enforced by a hook and in CI:

   ```
   feat(trace): highlight pointers that run off the end of the array

   Why, in a sentence or two.

   Changelog: The debugger now shows when an index points past the array.
   ```

   `Changelog:` is one plain-words sentence for users, or `Changelog: None`
   for anything they won't notice. See `docs/rules/commits.md`.

6. **Session log:** commit `.claude-logs/` (or `.codex-logs/`) in its own
   commit right before pushing, so the transcript ships with the change.
   Never let a real secret into a transcript (`docs/rules/secrets.md`).
7. **Open the PR as a draft** while it's still moving:
   `gh pr create --draft`. When it's done, write the real title and
   description (what, why, how it was verified, which spec/ACs), add a
   `## Screenshots` Before/After if it changes what people see, then
   `gh pr ready`. See `docs/rules/pull-requests.md`.
8. **Merge only on green:** `gh pr checks <number> --watch`, then merge
   once every check passes. Never merge with a check pending or failing,
   and never `--admin` or `--auto`. If it touches the trace contract or
   shared code, get the other teammate's review first.

### Parallel work: two tracks

- **Track A, execution/tracing:** Pyodide Web Worker, test harness,
  `sys.settrace` tracer; produces `RunResult`.
- **Track B, visualiser:** editor, results panel, step-through debugger;
  consumes `RunResult` and builds against the fixture in
  `specs/02-trace-contract.md` until the engine lands.

The contract is the only coupling. Changing it needs both owners and
updates the spec, the Zod schemas and the fixture in one PR.

### Agents

Claude Code, Codex, Cursor and the rest all read `AGENTS.md`. Claude Code
also gets the skills in `.claude/skills/`; the ones you'll use most are
`/spec-feature`, `/local-review`, `/e2e-review`, `/create-issue` and
`/cicd` (review → PR → CI → review comments).

## Environment variables

Every variable the app reads is documented inline in `.env.example` (what
it's for, its fallback behavior, how to generate it) and validated at boot
by `src/lib/env.ts` — a misconfigured deployment fails immediately with a
clear message instead of an obscure error three requests later. Groups:
database (Prisma), Supabase Auth, Sentry, PostHog, Slack alerting, i18n,
cron secret, app URL. `pnpm check:env` fails if any `process.env.X` in `src/` is missing
from either `.env.example` or the schema. See `docs/CI_CD_SETUP.md` for
which of these are Vercel-side vs. GitHub Actions-only secrets — they're
not the same set.

## Database & migrations

Prisma schema (`prisma/schema/*.prisma`, one file per domain area) is the
only thing you hand-edit. **CI writes the migration, you write the
schema** — never touch a file under `prisma/schema/migrations/` yourself.
The one SQL file you do hand-write is `prisma/run-once.sql`: a one-off
change that isn't a schema change (fix a value, insert reference rows,
replace a view). The next deploy applies it to production once, right after
the migrations, and a ledger keyed by content hash makes sure it never runs
again — replace its content for the next one-off. Full workflow, the
destructive-change safety net, and why this approach was chosen over the
other common migration patterns: `docs/rules/migrations.md`.

## Auth

Supabase Auth by default for any project with real user accounts —
already wired (`src/proxy.ts`, `src/lib/supabase/`), nothing to scaffold.
Auth and session only; Prisma still owns every byte of application data.
Landing pages with nothing to sign into remove it entirely — exact steps
in `docs/rules/auth.md`. TraceCode has accounts, so it stays.

## Testing

```bash
pnpm test        # node --test over scripts/*.test.mjs — fast, no browser
pnpm test:e2e     # Playwright — boots the app itself unless E2E_BASE_URL is set
```

The `e2e-review` skill runs the e2e suite and reviews failures against
their actual trace/screenshot rather than guessing from the error message.

## Skills

| Skill                                                                      | Run it                                                    | What it does                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template-setup`                                                           | Once, right after creating a new repo from this template  | Renames placeholders, confirms the repo was created the right way, asks internal- vs. external-facing and accounts-vs-landing-page, recommends packages accordingly                |
| `dev-onboarding`                                                           | Once per developer, joining an already-customized project | Install, env vars, migrations, boot the dev server — not for creating a new project, see `template-setup` for that                                                                 |
| `local-review`                                                             | Before every push                                         | Runs the full local gate (lint/typecheck/format/env/test/build) plus a manual pass against `docs/rules/*` — run before committing, not after CI fails, per `docs/rules/commits.md` |
| `e2e-review`                                                               | Before opening a PR for a UI/flow change                  | Boots the app, runs Playwright, reviews failures against their trace/screenshot, flags uncovered new flows                                                                         |
| `ai-usage-setup`                                                           | Once, when the project's AI answer is settled             | Wires AI spend tracking for the chosen providers and models, or strips it out — one of the two, never half                                                                         |
| `ai-usage-check`                                                           | On any branch touching an AI call or model                | Model map against live OpenRouter prices, pricing/failure-isolation tests, one real priced row written and read back                                                               |
| `spec-feature`                                                             | Before any new feature or behaviour change                | Drafts `specs/features/<name>.md` from the template, then stops for approval; writes no code                                                                                       |
| `spec-check`                                                               | Run by `local-review`, or on demand                       | Diff vs. specs: behaviour changes without a spec update, trace-contract drift, untested ACs, out-of-scope work                                                                     |
| `staging-migration`, `sql-preview`, `seed-for-pr`, `local-feature-testing` | Day-to-day dev loop                                       | See each `SKILL.md` for detail                                                                                                                                                     |

## Rules live in AGENTS.md, not CLAUDE.md

`AGENTS.md` is a short index into `docs/rules/*.md` — one topic-scoped
file per rule: database access, migrations, auth, AI usage tracking, state
management, code style, code quality, feature approach, commits, pull
requests, deployment.
`AGENTS.md` is the file every coding agent reads (Claude, Codex, Cursor,
...), not just Claude Code, and the individual files are plain markdown
any of them can open directly. `CLAUDE.md` is deliberately thin: it
`@`-includes `AGENTS.md` and holds only the two things that are genuinely
Claude-Code-specific (session-log tracking, the skills list). Add new
rules under `docs/rules/` and link them from `AGENTS.md`; don't grow
`CLAUDE.md` back into a dumping ground.

`DESIGN.md` has the design-token/component conventions — read it before
styling anything. It ships a neutral starter token set (light + dark, via
`prefers-color-scheme`), not a real brand identity; that comes later, from
an actual mockup, via the `impeccable` skills.

## Don't over-commit

Every push triggers a real, paid CI run. Don't commit after every small
step while iterating — run `local-review` locally first, then commit once
the work is actually done, not once per fix as you go. One feature commit,
plus at most one consolidated fix commit if something surfaces while
stabilizing it — not a string of "fix", "actually fix", "fix for real"
commits that each burn a CI run before anyone's looked at the last one.
Full rule, with the reasoning: `docs/rules/commits.md`.

Same principle applies to the PR itself: if you need to open one before
the work is done, open it as a **draft** with a placeholder title — don't
write a final-sounding description for work that isn't final. Write the
real title/description once, when the work is actually done, and mark it
ready for review at the same time. See `docs/rules/pull-requests.md`.

## Deployment

Never run a manual production deploy command — CI/CD handles it (see
`docs/rules/deployment.md`). Before this project's first real PR, read
`docs/CI_CD_SETUP.md` and set up:

- **GitHub**: `MIGRATIONS_TOKEN`, the
  `production-database` environment (holding `PRODUCTION_DATABASE_URL`),
  and branch protection on `main`.
- **Vercel**: connect the repo, mirror `.env.example` into project env
  vars per-environment, and decide explicitly between Vercel's default
  auto-deploy-on-push and a tag-gated release pattern (see
  `docs/rules/deployment.md`) — don't inherit one silently.

## Housekeeping

- Delete `prisma/schema/example.prisma` once real models exist, and
  `e2e/smoke.spec.ts` once real e2e coverage exists.
- Whether v1 makes AI calls (hints) is open. Once decided, run
  `/ai-usage-setup` to wire or remove spend tracking.
- Before the first deploy: Supabase project and env vars, Vercel project,
  and `MIGRATIONS_TOKEN` (see `docs/CI_CD_SETUP.md`).

## Scripts

| Command                                    | What it does                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`             | Standard Next.js                                                                                                                                                                |
| `pnpm lint` / `typecheck` / `format:check` | CI gates, run before pushing                                                                                                                                                    |
| `pnpm test`                                | `node --test` over `scripts/*.test.mjs`                                                                                                                                         |
| `pnpm test:e2e`                            | Playwright — boots the app itself unless `E2E_BASE_URL` is set                                                                                                                  |
| `pnpm check:env`                           | Fails if a `process.env.X` in `src/` isn't declared in `.env.example` + `src/lib/env.ts`                                                                                        |
| `pnpm check:standards`                     | Fails if a standard in `docs/STANDARDS.md` is unwired — rules index, commit hook, CI gates, effective lint/tsc config, tracked-file hygiene. `--root <dir>` audits another repo |
| `pnpm check:template`                      | Fails if the template's own repository (`8xsocial/template-web`) tracks a session log or agent worktree. Passes trivially in a project generated from it                        |
| `pnpm check:rls`                           | Reads `pg_class` on the database `DATABASE_URL` points at: every table has RLS enabled, no policies, never forced. Runs at the end of CI's migrations job                       |
| `pnpm prisma:generate`                     | Regenerate the Prisma client after a schema change                                                                                                                              |
| `pnpm prisma:migrate:generate:check`       | Dry-run what CI's migration generator would write, without writing it                                                                                                           |
| `pnpm db:run-once`                         | Apply `prisma/run-once.sql` once to `DIRECT_URL` (else `DATABASE_URL`) — what a deploy does                                                                                     |

## License

MIT, see [`LICENSE`](LICENSE).
