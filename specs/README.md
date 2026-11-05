# Specs — how we work

TraceCode is built spec-first. A spec is the contract for a piece of
behaviour: it's written and agreed **before** the code, the code is
reviewed against it, and it's updated **in the same PR** whenever
behaviour changes. This matters more than usual here because most code is
written by coding agents working in parallel — the spec is what keeps two
agents (and two people) building the same thing.

## What to read, when

| You're about to…                                   | Read first                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Do anything at all, first time in the repo         | [`00-product.md`](00-product.md) — problem, users, core loop, scope, out of scope |
| Touch data, an API route, or add a dependency      | [`01-architecture.md`](01-architecture.md) — stack, data model, API contracts     |
| Touch the Python engine **or** the visual debugger | [`02-trace-contract.md`](02-trace-contract.md) — the interface between the two    |
| Build or change a feature                          | Its file in [`features/`](features/)                                              |
| Wonder "why did we do it this way?"                | [`../decisions/`](../decisions/) — ADRs                                           |

## Spec status

Every spec carries a `Status:` line at the top:

- **Draft** — being written; don't build against it yet.
- **Agreed** — both of us have signed off; build against it.
- **In progress** — code is being written; the spec is still the contract.
- **Shipped** — the code matches the spec on `main`.

Moving a spec to **Agreed** needs both teammates. Say so in the team chat
(that's where decisions get recorded), then change the status in a PR.

## New feature

1. Copy [`features/_TEMPLATE.md`](features/_TEMPLATE.md) to
   `features/<feature-name>.md` (kebab-case).
2. Fill in: why, user stories, **GIVEN/WHEN/THEN acceptance criteria**
   (numbered AC1, AC2… — each one testable), data/API, edge cases, tasks.
   Propose the 80/20 slice, not the fullest version
   (`docs/rules/feature-approach.md`).
3. If it adds or changes a model or route, update `01-architecture.md`
   in the same PR. If it touches the engine ↔ debugger boundary, update
   `02-trace-contract.md` (see below).
4. Get it **Agreed**, then build it. Every AC should end up with a test
   (unit or Playwright) that names it.

In Claude Code, `/spec-feature <what you want>` does steps 1–3 for you and
stops for approval before any code is written.

## Fixes and other ad-hoc changes

A fix should never wait on paperwork. What the spec needs depends on what
the change does to behaviour:

| Change                                                                   | Spec work                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Bug fix that restores behaviour a spec already describes                 | None. Add a regression test; name the AC in the commit, e.g. `fix(trace): … (fail-and-replay AC4)` |
| Bug in a case no spec covered                                            | Add it to that spec's **Edge cases** (or a new AC) in the same PR                                  |
| Any behaviour change, however small (copy, limits, flow, defaults)       | Update the spec in the same PR                                                                     |
| Refactor, dependency bump, CI, tooling, styling with no behaviour change | None                                                                                               |
| A choice with real trade-offs (library, data shape, security posture)    | Write an ADR (below)                                                                               |
| Anything listed under "Out of scope" in `00-product.md`                  | Change and agree `00-product.md` first                                                             |

If the code and the spec disagree, don't silently pick one — ask which is
right, then fix the other.

`/local-review` runs `/spec-check`, which applies this table to your diff
and flags behaviour changes with no spec update.

## The trace contract is special

`02-trace-contract.md` is the only interface between **Track A**
(execution/tracing: Pyodide worker, test harness, `sys.settrace` tracer)
and **Track B** (visualiser: editor, results panel, step-through debugger).
Once Agreed, changing it needs **both** track owners' sign-off, and the
spec, the Zod schemas in `src/lib/trace/contract.ts` and the fixture all
change in one PR. Track B builds against the fixture; Track A proves its
engine reproduces it.

## Decisions (ADRs)

For a decision that has real trade-offs or would surprise someone reading
the code later:

1. Copy `decisions/0000-template.md` to `decisions/NNNN-short-title.md`
   (next number).
2. Context → decision → alternatives considered → consequences.
   Start it as **Proposed**; **Accepted** once we both agree.
3. Add a row to `decisions/README.md`.

Never edit an accepted ADR's decision. Reverse it with a new ADR that
supersedes it, and mark the old one `Superseded by NNNN`.

## Status board

Update this table in the same PR that changes a status.

| Spec / ADR                                                                           | Status                                         | Owner       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- | ----------- |
| [`00-product.md`](00-product.md)                                                     | Draft                                          | Team        |
| [`01-architecture.md`](01-architecture.md)                                           | Draft                                          | Team        |
| [`02-trace-contract.md`](02-trace-contract.md)                                       | Draft                                          | Track A + B |
| [`features/fail-and-replay.md`](features/fail-and-replay.md)                         | Draft                                          | Track A + B |
| [`features/home-page.md`](features/home-page.md)                                     | In progress                                    | Asad        |
| [`features/progress-page.md`](features/progress-page.md)                             | Superseded (retired; see streak.md)            | Asad        |
| [`features/activity-heatmap.md`](features/activity-heatmap.md)                       | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/public-profile-page.md`](features/public-profile-page.md)                 | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/public-profile-settings.md`](features/public-profile-settings.md)         | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/spaced-review.md`](features/spaced-review.md)                             | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/streak.md`](features/streak.md)                                           | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/daily-challenge.md`](features/daily-challenge.md)                         | Agreed (Umair; learning challenge, ADR-0008)   | Umair       |
| [`features/dashboard-page.md`](features/dashboard-page.md)                           | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/practice-trace-condensing.md`](features/practice-trace-condensing.md)     | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/practice-workspace-layout.md`](features/practice-workspace-layout.md)     | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/contextual-ai-tutor.md`](features/contextual-ai-tutor.md)                 | In progress (no teammate sign-off)             | Umair       |
| [`features/problems-page.md`](features/problems-page.md)                             | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/learning-statistics.md`](features/learning-statistics.md)                 | Draft                                          | Umair       |
| [`features/learning-recommendations.md`](features/learning-recommendations.md)       | In progress (M7.1 built; no teammate sign-off) | Umair       |
| [`features/problem-catalogue-expansion.md`](features/problem-catalogue-expansion.md) | Agreed (Umair; no teammate sign-off)           | Umair       |
| [`features/curated-problem-pack.md`](features/curated-problem-pack.md)               | In progress (no teammate sign-off)             | Umair       |
| [ADR-0001](../decisions/0001-in-browser-python-execution.md)                         | Proposed                                       | Team        |
| [ADR-0002](../decisions/0002-self-host-pyodide.md)                                   | Proposed                                       | Team        |
| [ADR-0003](../decisions/0003-browser-ast-and-cached-recommendations.md)              | Accepted (Umair; no teammate sign-off)         | Team        |
| [ADR-0005](../decisions/0005-tracy-provider-adapter-streaming-session-chat.md)       | Accepted (Umair; no teammate sign-off)         | Team        |

**Open decisions** (bottom of `00-product.md`): track ownership; hints
hand-authored vs. AI-generated (and which provider); the "mastered" rule;
how many problems beyond Two Sum.

**Next up:** agree the trace contract → one shared PR with the Zod schemas
and the fixture as JSON → Track A and Track B build in parallel →
integrate on the Two Sum fail → replay demo.
