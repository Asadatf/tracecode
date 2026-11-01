# 0003. Browser-side AST analysis and cached recommendations

Date: 2026-11-02
Status: Accepted

> Accepted by Umair on 2026-11-02 to proceed with M7.1. **Asad (the other track
> owner) has not reviewed or approved it**, and neither ADR-0001 nor ADR-0002 has
> been accepted by the team either. The worker-protocol part is additive; if the
> team objects, reverse it with a superseding ADR rather than editing this one.

## Context

M7 (`specs/features/learning-recommendations.md`) recommends what a learner
should practise next. It needs a structural read of the Python they wrote — how
many loops, whether they reached for a dict or set, whether a nested loop was
later removed — to tell a recurring mistake from a corrected one, and it may ask
an LLM for a short natural-language diagnosis.

Two forces constrain how:

- **ADR-0001 keeps all Python execution in the browser.** Learner code never runs
  on our servers, and a hackathon team on Vercel has no sandbox. Structural
  analysis needs a Python parser (`ast`), which we already have in the browser via
  Pyodide but not on the server.
- **OpenRouter calls cost money and can fail.** The dashboard loads and a daily
  email cron both need a recommendation, and neither can afford a model call on
  every read, nor a hard dependency on the provider being up. M4 already stores
  past `source`, so history must be analysable without asking learners to
  resubmit.

## Decision

**Extract AST features in the browser, never on the server.** A new additive `ast`
worker message runs `ast.parse` (parse only — no execution) inside the existing
Pyodide worker and returns a bounded, versioned `CodeFeatures` summary (counts,
booleans, an allow-listed set of builtin names — no raw identifiers). It is
persisted per attempt (`attempts.codeFeatures Json?`, nullable). Historical
attempts are backfilled lazily and browser-side, capped at 10 per session, and
every layer tolerates missing features.

**Compute recommendations deterministically and cache them.** A pure engine ranks
the static catalog from the features + M6 analytics and always produces a complete
result. The cache is keyed by a **content-addressed `evidenceHash`** over the
normalised feature content and outcomes (excluding volatile timestamps), so a
backfill invalidates stale evidence. The OpenRouter diagnosis is an **optional
enrichment**: called only on explicit refresh, only when evidence changed and a
durable per-learner refresh claim is won, validated against the evidence, and
cached bound to its hash. The daily email cron reads or recomputes the
deterministic recommendation and **never calls OpenRouter**.

## Alternatives considered

- **Server-side Python/AST (run `ast` in a serverless function or a JS Python
  parser).** Simpler data flow — no persisted features, no backfill — but it
  breaks ADR-0001's "no learner code on our servers" line, adds a runtime or a
  dependency to maintain, and still needs a parser we'd have to trust. The browser
  already has a faithful CPython parser loaded.
- **Regex/heuristic structural analysis in TypeScript.** No Pyodide round-trip,
  but brittle and wrong on exactly the cases that matter (comprehensions, nesting,
  recursion). An AST is the honest source.
- **Call OpenRouter on each dashboard load / each email.** Freshest prose, but
  per-render cost, latency, and a hard provider dependency on a read path — and
  the cron would fan out one call per learner per day. Rejected for cost and
  reliability.
- **Store the diagnosis without an evidence hash.** Cheaper to write, but then a
  backfill or a new attempt leaves a stale explanation describing old code.
  Content-addressing is what lets us detect and suppress that.

## Consequences

- Structural analysis needs features to already be present; a brand-new feature
  set arrives only after the browser computes it, so the server/cron paths must
  (and do) tolerate `codeFeatures = null`.
- One extra lightweight worker round-trip per submission and per backfilled
  attempt; backfill is bounded so it never floods the worker or the DB.
- The `ast` message is an **addition to the worker protocol**, which is the
  governed trace contract — it needs Track A + B sign-off even though it does not
  touch `RunResult`/`TraceResult` (see the pending amendment in
  `specs/02-trace-contract.md`).
- `evidenceHash` must hash normalised content, not identifiers or timestamps, or
  it will either miss backfills or churn forever; there is a unit test for exactly
  this.
- A new AI provider (OpenRouter) enters the project; it stays behind
  `src/server/ai/openrouter.ts` and `trackAiCall` per `docs/rules/ai-usage.md`,
  and the one model is mapped in `OPENROUTER_SLUGS`.
- `CodeFeatures` / `RecommendationEvidence` become a reusable evidence layer for
  M8/M9; keeping them versioned and ranking-agnostic is now a constraint we carry.
