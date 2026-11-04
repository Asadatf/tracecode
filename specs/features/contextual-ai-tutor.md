# Feature: Tracy, the context-aware AI Tutor (M8)

Status: In progress (user-agreed 2026-11-04; no teammate sign-off)
Owner: Umair
Related: `specs/00-product.md` § Core loop, `specs/features/practice-workspace-layout.md`
(AC16–AC27: the panel, layout and reset), ADR-0005, `docs/rules/ai-usage.md`

## Why

Learners get stuck on the same classes of mistake the catalog already knows
about: off-by-one errors, missing edge cases, nested loops where one pass would
do. The curated hint ladder explains the specification and the replay shows what
happened, but neither answers the learner's own question in their own words.
Tracy reads the problem, the learner's current code, the latest grading result
and the selected replay step, and answers in a patient, Socratic voice grounded
in that evidence rather than in free-form model recall.

Tracy is a pedagogical assistant, not a code generator. She names mistakes and
misconceptions, teaches the concepts behind a problem from first principles,
explains complexity, and discloses a solution progressively, only as far as the
learner asks.

## User stories

- As a stuck learner, I want to ask why my code fails a specific test, so that I
  can see the mistake without being handed the answer.
- As a learner inspecting a replay step, I want Tracy to refer to the variables I
  can see, so that her explanation lines up with the evidence on screen.
- As a learner new to a concept, I want it taught from first principles with a
  small example, so that I understand it rather than copy it.
- As a privacy-conscious learner, I want my code sent only when I ask a question,
  so that opening the panel does not ship my work to a third party.
- As an operator, I want the provider to be swappable, so that moving to
  OpenRouter later is configuration plus one adapter, not a rewrite.

## Scope

In: the `POST /api/tutor` streaming endpoint, the provider adapter, curated
problem knowledge, the system prompt, the Tracy panel behaviour (conversation,
streaming, Stop, retry, the 15-question limit, persistence, Markdown rendering,
the "How to ask Tracy" guide), and usage accounting. The panel's layout
(placement, sizing, maximize, reset) is specified in
`practice-workspace-layout.md`.

Out: persistent server-side chat history, vector search or RAG, diagrams and
visualizations (M10), tutor-driven edits to the editor, daily or monthly quotas
(the 15-question cap is a per-chat UX limit, not billing), spaced repetition and
streaks (M9), adaptive interventions (M11).

## Acceptance criteria

### Privacy and security

- **AC1** — GIVEN a signed-in learner on `/practice/<slug>` WHEN Tracy is closed,
  opened, resized or maximized, or the guide is opened or copied from, THEN no
  request is made to `/api/tutor` and no code leaves the browser. A request is
  made only when the learner sends a question.
- **AC2** — GIVEN a request to `POST /api/tutor` THEN the user is identified from
  the verified server session (never the body), the body is validated with Zod
  (field and size bounds), the problem slug must exist in `PROBLEMS`, and a
  per-user rate limit applies. Failures return a JSON error with the right
  status (401, 400, 429) and no stream. The provider key is read only on the
  server and is never returned, logged or stored.
- **AC3** — GIVEN a guest THEN Tracy shows a sign-in notice and the composer is
  disabled; the rest of Practice is unaffected.

### Context and teaching quality

- **AC4** — GIVEN any problem in `PROBLEMS` THEN curated teaching knowledge
  exists for it (concepts, prerequisites, both strategies with complexity,
  misconceptions, common errors, edge cases, hint strategy, Python notes, teaching
  guidance). A unit test fails if a problem has none.
- **AC5** — GIVEN a question THEN the request carries only bounded, relevant
  context: the current code, the latest run summary, up to three failed tests
  (inputs looked up from the catalog by test id, values formatted to readable
  Python), the selected replay step (line, source line, locals), the revealed
  hint level, and a flag when the code changed since the last run. Nothing is
  fabricated: absent evidence is stated as absent, and a syntax error produces no
  replay or variables.
- **AC6** — GIVEN the system prompt THEN it (a) separates observed evidence,
  reasoned interpretation and general programming knowledge; (b) defines the
  progressive ladder: L1 a conceptual hint about the learner's own
  implementation (explains the mistake and its cause from the evidence, without
  the exact fix), L2 a strategic hint, L3 targeted implementation guidance, L4 a
  complete worked solution only on an explicit request; (c) treats optimization
  as a separate axis, so a conceptual hint never returns the optimized algorithm;
  (d) allows topic teaching from first principles, including prerequisites not
  listed for the problem, without writing the problem's solution; (e) requires
  accurate Python terminology (a `list` is a dynamic array); (f) asks for no em
  dashes in explanatory prose, as a style preference that never edits code,
  quotes, inputs, problem statements or execution evidence; (g) specifies fenced
  code on its own lines. There is no output-rewriting or solution-leak filter.

### Streaming, completion and failure

- **AC7** — GIVEN a question is sent THEN the reply is streamed from OpenAI
  (`gpt-4o-mini`) through the provider adapter, forwarded as NDJSON events
  (`start`, `delta`, then exactly one of `done`, `aborted`, `error`), and shown as
  it arrives. A subtle "Tracy is thinking" indicator shows until the first text.
  Deltas are batched once per animation frame; there is no fixed typing delay. The
  conversation follows the newest text only while the learner is near the bottom,
  and never forces a learner who scrolled up back down.
- **AC8** — GIVEN a stream THEN it counts as a finished reply only if the provider
  declared the end (a `finish_reason` or `[DONE]`) and the server sent `done`. A
  body that simply stops, a server `aborted`, a content-filter stop, a read error
  or an empty reply is NOT a success: nothing is saved, no question is counted,
  and the learner sees "The reply was cut off before it finished" (or the matching
  message) with a retry. A model reaching its output cap is a provider-declared
  end and counts as finished.
- **AC9** — GIVEN Tracy is replying WHEN the learner presses Stop (a button that
  replaces Send) THEN the request is aborted, the partial text is discarded, the
  question is not counted, and the panel shows "Stopped. That question was not
  counted." with a Retry button and the question text. Retry resends the same
  question without retyping and without a duplicate message.
- **AC10** — GIVEN a network failure, timeout, provider error, rate limit or
  missing key THEN the learner sees a clear, actionable message, the conversation
  and editor are untouched, no question is consumed, and the failed question can
  be retried. Practice keeps working without Tracy.
- **AC11** — GIVEN a send is in flight THEN a second send cannot start (a
  synchronous guard, not only a disabled button).

### Conversation lifecycle

- **AC12** — GIVEN the conversation THEN the question counter shows "N / 15
  questions used". It increases by exactly one, and only when a reply finished
  (AC8). At 15 the transcript stays readable, the composer is disabled, and
  "Start new chat" is offered. Starting a new chat discards the previous
  transcript, resets the counter to 0 and keeps the current problem.
- **AC13** — GIVEN `sessionStorage` THEN each (user, problem) pair has its own
  conversation, restored after a refresh or navigating away and back, and cleared
  (all `tracecode.tutor.*` keys, nothing else) on sign-out. Stored data is
  validated before use; invalid or oversized data and storage failures degrade to
  an empty conversation without breaking Practice. Chats are never stored on the
  server.
- **AC14** — GIVEN the learner switches problem or starts a new chat during a
  reply THEN that request is aborted and its response is ignored: it can never
  add a message, change the counter or change the status of a different
  conversation. The workspace is keyed by problem, so each problem starts with a
  fresh instance.

### Rendering and presentation

- **AC15** — GIVEN an assistant reply THEN Markdown is rendered (paragraphs,
  headings, lists, bold, inline code, fenced code) through React, with no raw HTML
  from the model. Fenced code is read-only, syntax highlighted for Python,
  indentation preserved, scrolls horizontally inside the narrow column, and has a
  Copy button. The renderer also accepts, only when unambiguous: an indented
  fence, a one-line fence (` ```python x = 1``` `), code on the opening line after
  a known language, and a closing fence glued to the last line. An unterminated
  fence (a stream in flight) renders as code to the end of the text. Content
  inside valid blocks is never altered. Learner messages are shown verbatim.
- **AC16** — GIVEN the header THEN an information button beside the title opens
  the dialog "How to ask Tracy (guide)", separate from the conversation. It lists
  six categories with an example prompt and a Copy button each (Learn a topic, Get
  a conceptual hint, Understand failed tests, Explore execution, Optimize my
  solution, Review my solution), states that Tracy uses the relevant context
  available in the Practice Workspace when a question is sent, and that test or
  execution questions need a run first. Copy only copies; it never sends or fills
  the composer. Opening it costs no question and makes no request. It is a modal
  dialog: Escape closes it (not Tracy), Tab stays inside, focus returns to the
  button. Its copy has no em dashes.
- **AC17** — GIVEN the panel is maximized on a wide screen THEN the conversation
  and composer are capped at 960px and centred; the compact panel is unchanged.
- **AC18** — GIVEN the product name THEN the toolbar button reads "Ask Tracy", the
  header "Tracy" with the subtitle "AI Tutor", assistant messages are labelled
  "Tracy", and the empty state greets "Hi, I'm Tracy!". Internal identifiers (the
  route, component names, the `tutor_chat` usage feature) keep the "tutor" name.

### Usage and cost

- **AC19** — GIVEN a stream THEN exactly one `ai_usage` row is written with
  `feature: 'tutor_chat'`, priced at write time. A finished reply with
  provider-reported usage is an `ok` row with the real token counts. A cut-off,
  failed or stopped stream with no provider usage is an `error` row with no
  tokens. Counts and costs are never estimated; a model with no rate is NULL, not 0. Both `gpt-4o-mini` and its dated served id are mapped. Output is capped at
  600 tokens, a stream at 30 seconds. Messages and code are never logged or put in
  `meta`.

## Data / API

- No Prisma change. `ai_usage` already carries the usage rows.
- `POST /api/tutor` body: `{ problemSlug, conversationId, messages[], context }`
  (bounds in `src/lib/tutor/types.ts`). Success is `application/x-ndjson`; any
  precondition failure is `application/json` `{ ok: false, reason, message }`.
- Provider adapter: `src/server/ai/tutor-provider.ts` (provider-independent
  contract with a streaming handle: deltas, a single completion, abort),
  `openai.ts` (the only OpenAI call and the only `trackAiCall` for it),
  `openai-protocol.ts` (pure SSE parsing, completion verdict, usage mapping).
  Configured by `AI_TUTOR_PROVIDER` (default `openai`), `AI_TUTOR_MODEL` (default
  `gpt-4o-mini`) and `OPENAI_API_KEY`. OpenRouter is a typed stub.
- Client: `src/lib/tutor/exchange.ts` (protocol and outcome),
  `conversation-flow.ts` (what an outcome does to the conversation),
  `conversation-store.ts` (`sessionStorage`), `markdown.ts` (parser).
- Analytics: none added.

## Edge cases

- No run yet: the request omits run evidence; Tracy is told it is absent.
- Syntax error: `status: syntax_error`, no failed tests, no replay, no variables.
- Selected replay step but no failed test: replay is sent alone.
- Very long code or arguments: clamped, and the prompt says so.
- Refresh mid-reply: the in-flight reply is lost and nothing was counted.
- Two tabs: each has its own `sessionStorage`, so separate conversations.
- The server rate limit is per instance (in memory); on a multi-instance deploy a
  learner can exceed it across instances. OpenAI's own limits and the per-call
  output cap bound the cost. Redis was deliberately not added for this milestone.
- Provider keys are required only on the server; if unset, Tracy reports it is
  not configured and Practice continues.

## Tasks

- [x] Provider adapter, OpenAI streaming, usage accounting
- [x] Curated knowledge for every problem; system prompt
- [x] `/api/tutor` streaming route with auth, validation, rate limit
- [x] Conversation store, hook, Stop and retry, 15-question limit
- [x] Markdown renderer and fence tolerance; guide; fullscreen width
- [x] Unit tests; Playwright for the panel, guide and reset; mocked signed-in flows
- [ ] Real tracked-call check against a disposable database (`/ai-usage-check`)
- [ ] Teammate sign-off; move to Agreed

## Changelog

- 2026-11-04 — created; refined the same day to streaming, Stop and retry,
  completion rules, Tracy branding, the guide, fence tolerance and the usage
  rules above (user).
