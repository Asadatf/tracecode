# Feature: <name>

Status: Draft | Agreed | In progress | Shipped
Owner: <who>
Related: `specs/00-product.md` § <section>, ADR-<nnnn>

## Why

What learner problem this solves, and how it serves "learning that
sticks". One paragraph.

## User stories

- As a <user>, I want <capability>, so that <outcome>.

## Acceptance criteria

Each one is testable (unit or e2e) and is the contract the implementation
is reviewed against.

- **AC1** — GIVEN <state> WHEN <action> THEN <observable result>.
- **AC2** — GIVEN … WHEN … THEN …

## Data / API

- Prisma models added or changed (link `specs/01-architecture.md` and
  update it in the same PR).
- Routes/actions: method, path, Zod request and response shapes.
- Analytics events (`object_action`, see `docs/rules/analytics.md`).

## Edge cases

- Empty / first-time state:
- Errors and timeouts:
- Unauthenticated or another user's data:
- Limits (sizes, step caps):

## Tasks

- [ ] …

## Changelog

- YYYY-MM-DD — created.
