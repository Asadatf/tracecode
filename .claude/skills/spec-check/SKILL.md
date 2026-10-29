---
name: spec-check
description: Check the current branch's diff against specs/ — flag behaviour changes with no spec update, acceptance criteria with no test, trace-contract drift, and out-of-scope work. Use when the user says "/spec-check", "does this match the spec", "are the specs up to date", and as a step of /local-review before every push.
---

# Spec check

Applies the rules in `specs/README.md` ("Fixes and other ad-hoc changes")
to the diff. It reports; it doesn't rewrite specs on its own — a spec
change is a decision, so propose the edit and let the user confirm.

## 1. Get the diff

```bash
git diff --stat $(git merge-base main HEAD)...HEAD
git diff $(git merge-base main HEAD)...HEAD
git log --oneline $(git merge-base main HEAD)..HEAD
```

Include uncommitted changes (`git diff HEAD`) if the branch isn't
committed yet.

## 2. Classify the change

Using the table in `specs/README.md`, decide which row each part of the
diff falls in: restoring specified behaviour, uncovered edge case,
behaviour change, no-behaviour change (refactor/chore/tooling), trade-off
decision, out of scope. Commit prefixes are a hint, not proof — a `fix:`
that changes a limit or a message is a behaviour change.

## 3. Check

- **Behaviour change without a spec update** — new or changed routes,
  Prisma models, user-visible copy or flow, limits/defaults, analytics
  events, with no matching edit under `specs/`. Name the spec that should
  change.
- **Contract drift** — any change to `src/lib/trace/contract.ts`, the
  worker protocol, or the shape of `RunResult`/`Step`, without the same
  change in `specs/02-trace-contract.md` (and its fixture). Flag that both
  track owners must agree.
- **Architecture drift** — models/routes in code that
  `specs/01-architecture.md` doesn't list, or that it lists differently.
- **Untested acceptance criteria** — for each feature spec the diff
  implements, every `ACn` should have a test that references it. List the
  ones that don't.
- **Out of scope** — anything under "Out of scope" in `00-product.md`.
- **Building on a Draft** — implementation code for a spec whose status
  is still `Draft`.
- **Status board** — a spec whose status changed without the table in
  `specs/README.md` changing too.
- **Trade-off without an ADR** — a new dependency, data-shape choice or
  security posture with no file in `decisions/`.

## 4. Report

One list, blocking first: each finding with file:line and the spec it
relates to, plus the edit you'd propose. "No spec work needed — refactor
only" is a valid, complete answer for a no-behaviour diff.
