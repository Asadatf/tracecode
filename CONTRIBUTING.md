# Contributing to TraceCode

How we work in this repo: setup details, the spec → branch → PR loop, CI,
migrations and deployment. For what TraceCode is and how to run it, start
with the [README](README.md).

## Setup details

**OS support:** tested on macOS; it's plain bash, so Linux should work too.
**On Windows, use WSL2** (Ubuntu): install it with `wsl --install`, then
clone and run everything _inside_ WSL (under `~/`, not `/mnt/c/`, which is
very slow), with Claude Code running in WSL too. Native Windows isn't
supported: the script needs bash and nvm, and the session-log hook expects
`python3` and Unix paths, so your sessions wouldn't be logged.

`scripts/onboard.sh` (from the README's Getting started) is safe to re-run. It:

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

For a database, sign-in and saved progress, follow
[`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md).

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
`docs/rules/deployment.md`). The one-time setup is in
`docs/CI_CD_SETUP.md`:

- **GitHub**: `MIGRATIONS_TOKEN`, the
  `production-database` environment (holding `PRODUCTION_DATABASE_URL`),
  and branch protection on `main`.
- **Vercel**: connect the repo, mirror `.env.example` into project env
  vars per-environment, and decide explicitly between Vercel's default
  auto-deploy-on-push and a tag-gated release pattern (see
  `docs/rules/deployment.md`) — don't inherit one silently.

## Scripts

| Command                                    | What it does                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`             | Standard Next.js                                                                                                                                                                |
| `pnpm lint` / `typecheck` / `format:check` | CI gates, run before pushing                                                                                                                                                    |
| `pnpm test`                                | Unit tests (`node --test`) over `scripts/` and `src/`                                                                                                                           |
| `pnpm test:e2e`                            | Playwright — boots the app itself unless `E2E_BASE_URL` is set                                                                                                                  |
| `pnpm check:env`                           | Fails if a `process.env.X` in `src/` isn't declared in `.env.example` + `src/lib/env.ts`                                                                                        |
| `pnpm check:standards`                     | Fails if a standard in `docs/STANDARDS.md` is unwired — rules index, commit hook, CI gates, effective lint/tsc config, tracked-file hygiene. `--root <dir>` audits another repo |
| `pnpm check:template`                      | Fails if the template's own repository (`8xsocial/template-web`) tracks a session log or agent worktree. Passes trivially in a project generated from it                        |
| `pnpm check:rls`                           | Reads `pg_class` on the database `DATABASE_URL` points at: every table has RLS enabled, no policies, never forced. Runs at the end of CI's migrations job                       |
| `pnpm prisma:generate`                     | Regenerate the Prisma client after a schema change                                                                                                                              |
| `pnpm prisma:migrate:generate:check`       | Dry-run what CI's migration generator would write, without writing it                                                                                                           |
| `pnpm db:run-once`                         | Apply `prisma/run-once.sql` once to `DIRECT_URL` (else `DATABASE_URL`) — what a deploy does                                                                                     |
