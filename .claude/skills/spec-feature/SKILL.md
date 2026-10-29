---
name: spec-feature
description: Draft a feature spec in specs/features/ from the template before any code is written, then stop for approval. Use when the user says "/spec-feature", "spec this", "write a spec for", or asks to build a new feature (or change existing behaviour) that has no spec yet in specs/features/. Not for bug fixes that restore already-specified behaviour — see specs/README.md, "Fixes and other ad-hoc changes".
---

# Spec a feature

TraceCode is spec-first (`specs/README.md`). This skill turns a feature
request into a spec someone can agree to. **It writes no application
code.** It ends by asking for approval.

## 1. Read the context

Read, in this order, before writing anything:

1. `specs/README.md` — the workflow and status rules.
2. `specs/00-product.md` — core loop, v1 scope, **out of scope**.
3. `specs/01-architecture.md` — stack, data model, API contracts.
4. `specs/02-trace-contract.md` if the feature touches the engine or the
   debugger.
5. `specs/features/*.md` — an existing spec may already cover this; if so,
   propose amending it instead of creating a new one.
6. `decisions/*.md` — don't contradict an accepted ADR without proposing a
   superseding one.

If the request falls under "Out of scope" in `00-product.md`, say so and
stop: scope changes are agreed first, not spec'd around.

## 2. Propose the slice

Per `docs/rules/feature-approach.md`, offer the 80/20 slice and the fuller
version in two or three lines each, and ask which one to spec. Skip this
only if the user already named the scope.

## 3. Write the spec

Copy `specs/features/_TEMPLATE.md` to `specs/features/<kebab-name>.md` and
fill every section:

- **Status: Draft**, owner, related specs/ADRs.
- **Why** — one paragraph, tied to "learning that sticks".
- **User stories.**
- **Acceptance criteria** — numbered `AC1`…, each `GIVEN … WHEN … THEN …`,
  each observable and testable. Include the failure paths (errors,
  timeouts, empty states), not just the happy path.
- **Data / API** — models, routes with Zod-shaped request/response,
  analytics events (`object_action`, `docs/rules/analytics.md`).
- **Edge cases** — empty/first-time, errors, auth/other users' data,
  limits.
- **Tasks** — split by track (A engine / B visualiser) where it applies.
- **Changelog** — today's date, "created".

In the same change, draft the matching edits to `01-architecture.md` (new
models/routes) and `02-trace-contract.md` (contract changes — flag that
both track owners must agree), and add the spec to the status board in
`specs/README.md`.

## 4. Stop for approval

Summarise the ACs and any open questions, and ask the user to approve or
adjust. Do not start implementing. Once approved, set `Status: Agreed`
(and update the status board) — building it is a separate step.
