# 0005. Tracy: a provider adapter, NDJSON streaming and session-only chats

Date: 2026-11-04
Status: Accepted (Umair; no teammate sign-off yet)

## Context

M8 adds Tracy, an AI tutor inside the Practice Workspace. Four choices have real
trade-offs and are hard to reverse once learners depend on them:

- Which provider to call first, and how to keep the next one cheap to add.
- How replies reach the browser (waiting for the whole reply is slow to read).
- Where conversations live, given that they contain learners' code.
- How to bound cost without building a billing system for a UX limit.

## Decision

1. **A provider-independent adapter.** Tutor logic depends on `TutorPrompt` and a
   streaming handle (`deltas`, one `completion`, `abort`) in
   `src/server/ai/tutor-provider.ts`; only `src/server/ai/openai.ts` knows OpenAI's
   wire format, and it is the only file that calls it or `trackAiCall` (enforced by
   the existing lint rule). OpenAI `gpt-4o-mini` is the first provider because the
   project already has credit with it. OpenRouter is a typed stub: adding it is one
   file and one case, not a rewrite. The M7 OpenRouter code is untouched.
2. **Real streaming over NDJSON.** The route forwards the provider's SSE deltas as
   one JSON event per line and ends every reply with exactly one of `done`,
   `aborted` or `error`. The client treats a reply as finished only on `done`, and
   the server sends `done` only if the provider declared the end (a `finish_reason`
   or `[DONE]`). A body that merely stops is a cut-off reply, never an answer.
   NDJSON was chosen over SSE or WebSockets because it works with `fetch` and an
   `AbortController` (Stop), needs no extra dependency and no connection state.
3. **Conversations stay in the browser's `sessionStorage`.** Keyed per user and
   problem, cleared on sign-out, bounded by construction (15 questions). No chat
   table: learners' code is sent to a third party only per question, and keeping it
   out of our database avoids a retention and privacy problem we do not need yet.
   The cost is that a chat ends with the tab and cannot be reopened. A future
   history feature would need its own decision and a migration.
4. **The 15-question limit is a UX limit, not a control.** `sessionStorage` is
   client-controlled, so it cannot enforce billing. Cost is bounded server-side
   instead: authentication, field and size bounds, a 600-token output cap, a
   30-second stream timeout and a per-user rate limit. The rate limit is in memory
   per instance; with several instances a learner can exceed it, which the output
   cap and the provider's own limits keep cheap. Redis was rejected as new
   infrastructure for this milestone.
5. **Usage is recorded honestly.** One `ai_usage` row per stream. Only a finished
   reply with provider-reported usage is a priced `ok` row. A cut-off, failed or
   stopped stream with no usage is an `error` row with no tokens, because a
   zero-token `ok` row would claim a finished, free call. Tokens and costs are
   never estimated.

## Consequences

- Adding a provider, or moving Tracy to OpenRouter, is contained to the adapter.
- A dropped connection costs the learner a retry, never a wrong saved answer or a
  lost question.
- Chats cannot be recovered after the tab closes, and cannot be audited by us.
- Spend visibility for stopped replies is partial: OpenAI sends no usage when a
  request is aborted, so those rows have no tokens.

## Alternatives considered

- Wait for the whole reply, then show it: simpler, but a slow first impression and
  no Stop that saves cost.
- Store chats in Postgres: enables history and review, but stores learners' code and
  needs a schema, retention and RLS work that M8 does not justify.
- Enforce the 15-question limit on the server: needs a quota table and a counter per
  conversation for a limit that is about reading comfort, not money.
