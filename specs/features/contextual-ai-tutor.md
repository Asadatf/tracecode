# Feature: Context-aware AI Tutor (M8)

Status: Draft
Owner: Umair
Related: `specs/00-product.md` § Core loop, `specs/features/practice-workspace-layout.md`
(AC16–AC24), `docs/rules/ai-usage.md`

## Why

Learners get stuck on the same classes of mistake the catalog already knows
about — off-by-one, missing edge cases, nested loops where a single pass
would do. The curated hint ladder explains the specification, and the
replay shows what happened, but neither answers the learner's own wording
of "why doesn't this work?". M8 adds a tutor that reads the problem, the
learner's current code, the latest grading result and the selected replay
step and answers in a Socratic voice, grounded in that evidence rather
than in free-form model recall.

It is a pedagogical assistant, not a code generator: it names
misconceptions, explains complexity, and progressively discloses toward a
solution only when the learner asks for one.

## User stories

- As a stuck learner, I want to ask the tutor why my code fails one
  specific test, so that I can see the mistake without being handed the
  answer.
- As a learner inspecting a replay step, I want the tutor to reference the
  variables I can actually see, so that its explanation lines up with the
  evidence in the pane.
- As a privacy-conscious learner, I want my code only sent when I
  deliberately ask a question, so that opening the panel does not ship my
  work to a third party.
- As an operator, I want the tutor's provider to be swappable, so that
  moving from OpenAI to OpenRouter later is a configuration change, not a
  rewrite.

## Acceptance criteria

- **AC1** — GIVEN an authenticated learner on `/practice/<slug>` AND the
  Tutor is closed THEN no network request is made to the AI provider, AND
  the learner's current code has not been transmitted. _Privacy boundary._
- **AC2** — GIVEN the learner sends a question THEN the request is
  authenticated server-side against Supabase (not the request body), the
  problem slug is validated against `PROBLEMS`, and the payload is
  rejected with a 400 if either check fails.
- **AC3** — GIVEN a successful tutor exchange THEN the provider call is
  recorded in `ai_usage` with `feature: 'tutor_chat'`, `provider: 'openai'`
  (or whichever `AI_TUTOR_PROVIDER` names) and the configured model, with
  cost priced at write time.
- **AC4** — GIVEN the tutor is called with a problem id THEN the system
  prompt includes that problem's curated knowledge (concepts,
  misconceptions, complexity, hint strategy) from
  `src/lib/tutor/problem-knowledge.ts`, AND the knowledge map covers every
  slug in `PROBLEMS` (checked by a unit test).
- **AC5** — GIVEN the learner has run tests OR has a selected replay step
  WHEN they ask a question THEN the request payload includes the latest
  pass/fail counts, the failed-test inputs (bounded), and the current
  replay step's line + locals, extracted from state the workspace already
  holds. GIVEN no run has happened THEN the payload omits execution
  evidence rather than fabricating it.
- **AC6** — GIVEN a successful assistant reply THEN the question counter
  advances by 1, visibly, up to 15. GIVEN the counter is at 15 THEN the
  composer disables and a "Start new chat" affordance appears.
- **AC7** — GIVEN a failed request (network, 429, 5xx, timeout, auth,
  malformed response) THEN no question is consumed, the error is
  actionable ("Try again"), the conversation is preserved, and the retry
  does not duplicate the learner message.
- **AC8** — GIVEN a browser refresh WHEN the learner returns THEN their
  conversation for `(user, problem)` is restored from `sessionStorage`,
  including the counter.
- **AC9** — GIVEN the learner signs out THEN every `tracecode.tutor.*`
  sessionStorage entry is cleared before the signed-out tab proceeds.
  Logging back in (same tab) shows no prior transcripts.
- **AC10** — GIVEN the learner switches problem THEN the panel loads the
  other problem's conversation, keeping each namespace independent.
- **AC11** — GIVEN the panel is closed and reopened, OR panes are
  resized, OR tabs are switched THEN the conversation is not lost.
- **AC12** — GIVEN the provider is unavailable (missing key, upstream
  down) THEN the tutor returns a typed `unavailable` result, the learner
  can keep coding, running, replaying, and no partial assistant message
  is persisted.
- **AC13** — GIVEN the request body, the recent history sent to the
  provider is bounded (message count and total character budget);
  learner-supplied text cannot override the tutor's system instructions
  (injected marker + role boundary).
- **AC15** — GIVEN a question that asks the tutor to teach a concept or
  prerequisite from first principles THEN the tutor teaches from the
  curated knowledge (or well-established general programming knowledge
  for prerequisites not explicitly listed) using a small example,
  analogy, or short pseudocode; connects the topic back to the current
  problem in one or two sentences; does NOT write the full solution for
  the current problem while teaching the underlying topic; names time
  and space complexity accurately when relevant.
- **AC14** — GIVEN a concurrent send while a request is pending THEN the
  second send is rejected client-side by a synchronous ref guard (the
  composer is also disabled, but the ref is what wins a same-tick race
  that React state cannot). The 15-question limit is a UX cap, not a
  security or billing control; the server-side per-user rate limit (20
  req/min) is the independent cost ceiling, per the "Security
  distinction" section of this spec.

## Data / API

### Route

`POST /api/tutor` — authenticated. Zod input:

```ts
{
  problemSlug: string,
  conversationId: string,
  messages: [{ role: 'user' | 'assistant', text: string }],  // bounded
  context: {
    code?: string,              // bounded
    runSummary?: { passed: number; total: number; status: RunStatus },
    failedTests?: [{ id, args, expected, actual?, error? }],  // bounded
    replay?: { line: number; locals: Record<string, string> }  // bounded
  }
}
```

Response:

```ts
{ ok: true, reply: string }
| { ok: false, reason: 'rate_limited' | 'unavailable' | 'invalid' | 'timeout', message: string }
```

### AI provider adapter

`src/server/ai/tutor-provider.ts` (provider-independent):

- `TutorPrompt` = system + context block + message history
- `TutorProviderResult` = `{ ok, text, usage? } | { ok: false, reason }`
- Selected via `AI_TUTOR_PROVIDER` (default `openai`), implemented by
  `src/server/ai/openai.ts`.

The adapter never returns OpenAI-shaped responses to tutor handler code;
both implementations map to `TutorProviderResult`.

### Tracking

`src/server/ai/openai.ts` wraps `fetch` through `trackAiCall` (see
`docs/rules/ai-usage.md`). `gpt-4o-mini` is registered in
`OPENROUTER_SLUGS` as `openai/gpt-4o-mini` so pricing works and
`check:ai-models` stays green.

### Client

- Conversation store: `sessionStorage` key
  `tracecode.tutor.<userId>.<problemSlug>` with a versioned envelope
  (`{ v: 1, conversationId, messages, counter, createdAt }`).
- Logout clears every `tracecode.tutor.*` key before the server action
  redirects.
- Hook `useTutor(userId, problem, context)` owns send/retry/newChat/limit.

### Analytics

None added. The `ai_usage` row carries `feature: 'tutor_chat'`; aggregate
spend is read from there.

## Edge cases

- First visit, no run yet: the context payload has no execution evidence.
  The system prompt tells the tutor to acknowledge the absence and offer
  conceptual guidance.
- Replay step selected but no failed test: `replay` is populated,
  `failedTests` is omitted; neither side invents the other.
- Syntax error: `runSummary.status === 'syntax_error'` and the failing
  test list is empty; the system prompt forbids claiming a runtime trace
  for a program that never ran.
- Very long code (>8 KB) or very long failing arguments: clamped before
  sending; the prompt says "code excerpt (truncated)" so the tutor does
  not assume it saw everything.
- The learner refreshes mid-request: the pending message is reset client-
  side; the counter was not yet advanced, so no question was consumed.
- The learner opens the panel in a second tab: each tab has its own
  sessionStorage. Both tabs start fresh conversations; this is a tab
  property, not a bug.
- A new chat on the same problem reuses the problem knowledge but does
  not carry prior messages — the server is stateless and the client stores
  only one active conversation per `(user, problem)`.

## Out of scope

- Persistent server-side chat history (sessionStorage only for M8).
- Vector embeddings / RAG / pgvector / document search.
- Tutor-driven code edits applied to the editor.
- Multi-turn streaming (we read the full response then render).
- Daily/monthly quotas. The 15-question cap is per-conversation UX, not
  billing.
- Spaced repetition, streaks, learning paths (M9).

## Tasks

- [x] Add curated knowledge for all six catalog problems.
- [x] Register `gpt-4o-mini` in `OPENROUTER_SLUGS`.
- [x] Provider-agnostic `tutor-provider.ts` + OpenAI implementation
      wrapped in `trackAiCall`.
- [x] `POST /api/tutor` via `createApiRoute`, authenticated, Zod input.
- [x] In-memory per-user rate limit.
- [x] `sessionStorage` conversation store + logout clear.
- [x] Client hook `useTutor`; rewire the panel.
- [x] Unit tests for context assembly, knowledge coverage, limit logic.

## Changelog

- 2026-11-04 — created.
