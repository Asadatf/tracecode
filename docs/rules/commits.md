# Commits — discipline and message format

## Don't over-commit — every push is a real CI bill, not a savepoint

**A commit is not autosave.** Every `git push` triggers CI (lint, typecheck,
build, e2e, migrations, an AI review) — that costs real money and real CI
minutes, every single time. The failure mode this rule exists to stop,
observed directly in this repo's own history: one feature commit followed
by three or four separate "fix" commits, each pushed the moment a problem
was found, each kicking off a full CI run — and most of those runs became
irrelevant the moment the _next_ fix was pushed before anyone had looked at
the previous one. Three or four CI runs paid for, one of them actually
read.

**Concretely:**

- Don't commit after every small step of a larger task. Do the work, verify
  it yourself, keep going — commit once the unit of work is actually done,
  not once each sub-step compiles.
- **Run `local-review`'s automated gates (lint, typecheck, format, test,
  build) before you commit, not after CI fails.** CI exists to confirm what
  you already verified locally, not to be the first place a lint error or
  a type error is discovered. If you're pushing to find out whether the
  code compiles, that's the bug this rule is fixing.
- If you're fixing something the user (or CI, or a review) flagged, batch
  those fixes into as few commits as the situation genuinely needs — a
  string of "fix(x): ...", "fix(x): actually fix it", "fix(x): for real
  this time" commits is exactly the anti-pattern. Target: **one feature
  commit, plus at most one consolidated fix commit** if issues surface
  after the fact while stabilizing that same feature. Not one commit per
  bug found.
- **Give the user a chance to review or test a change in chat before
  committing it**, especially for anything beyond a trivial fix. Don't
  assume a fix worked and immediately commit — confirm it, or let the user
  confirm it, first. Git safety: never commit
  unless the user has asked for it, or the specific, already-agreed-upon
  unit of work is genuinely finished and verified.
- Exception: when local reproduction is genuinely impossible (something
  observable only in a real CI runner, a networked service the sandbox
  can't reach) and iterating through CI is the only way to make progress,
  that's legitimate — but still think the fix all the way through before
  each push rather than pushing a guess to see what happens. Minimize the
  number of "let's find out" pushes even then.

This applies to any agent working in this repo (Claude, Codex, whichever)
— it's not a Claude-specific quirk, any agent that treats commits as
checkpoints instead of deliberate, reviewed units of work will produce the
same wasted-CI-run pattern.

## Message format

Every commit follows Conventional Commits: `type(scope): subject`. Enforced
by `.githooks/commit-msg` (installed automatically by `pnpm install`'s
`prepare` script) and mirrored in CI's `commits` job — both call
`scripts/check-commit-message.mjs`, so the rule can't drift between the two.

Types: `feat`, `fix`, `perf`, `refactor`, `style`, `docs`, `test`, `build`,
`ci`, `chore`, `revert`. Append `!` before the colon for a breaking change
(`feat(api)!: ...`). Subject is imperative, lowercase, no trailing period.
Header stays under 72 characters; details go in a body after a blank line.

Scope is curated per project in `scripts/check-commit-message.mjs`'s
`SCOPES` array — it ships empty (any lowercase-kebab scope accepted) so a
brand-new project isn't blocked on deciding a scope taxonomy up front.
Fill it in once the project's feature areas stabilize; an empty list is
easier to start with but weakens scope-searchability of commit history as
the project grows.

## The changelog line

The commit that changes something for the people using the product carries
a `Changelog:` line in its message: what changed for them, in plain words.
A changelog built from the first one across a pull request's commits is
readable by everyone on the project, including PMs and leads who don't
read code. Without it, the only summary is the PR title, which was written
for engineers.

```
feat(r2): attach a bucket to an existing project

Changelog: You can now attach an R2 bucket to a project that already exists.

Co-Authored-By: ...
```

Give it its own paragraph and keep it on one line, however long: only that
line is read, and the commit hook has no limit on body line length. Write
one per PR. The first one wins and a merged commit can't be edited, so fix
a wrong one by amending before you merge, not with a later commit.

- Lead with the thing a user would recognise and say what they can now
  do, see, or no longer hit: "You can now…", "Archive search now…".
- The product's own names and UI labels (tab names, button labels). Never
  code names: files, functions, tables, routes, libraries, env vars,
  branches, hashes, conventional-commit prefixes.
- One sentence, present tense, ending with a period. Several small changes
  share that sentence, separated by commas — never a list. No PR number.
- A fix says what was broken as the user saw it. A security or privacy fix
  is named plainly, without an exploit recipe.
- Say who it affects when it isn't everyone ("for staff accounts", "admins
  can see…", "People outside the team…").
- Nothing user-facing (refactor, CI, tests, dependency bumps, docs): write
  `Changelog: None`.

Good:

- You can now block time for yourself from your calendar or the Booking
  page, so booking pages skip it without a fake "busy" meeting, and nobody
  else sees it.
- Pages left open for a long time no longer fail with "Bad csrf token"
  after you sign in again in another tab.
- Fixed a privacy bug: if someone else signed in on the same browser tab,
  they could see the previous person's agent chat.

Not this — a title, which is what an unwritten line falls back to:

- Add read-only "view server logs" capability (MCP + CLI)
- feat(r2): attach an R2 bucket to an existing project
