# TraceCode — execution-trace contract

Status: **DRAFT — to agree on the team call.** Once agreed, this is the
only interface between the two tracks; changing it needs both owners'
sign-off and an update here in the same PR.

| Track                    | Owns                                                                                        | Owner |
| ------------------------ | ------------------------------------------------------------------------------------------- | ----- |
| **A. Execution/tracing** | Web Worker, Pyodide loading, test harness, `sys.settrace` tracer, limits; emits `RunResult` | TBD   |
| **B. Visualisation**     | Editor, test-results panel, step-through debugger; consumes `RunResult`                     | TBD   |

Track B builds against the fixture in [§ Fixture](#fixture-two-sum-failing-run)
before Track A's engine exists; Track A tests that its engine produces the
same shape for the same code. Neither side waits on the other.

Code lives in `src/lib/trace/contract.ts` as Zod schemas (types inferred
from them, per `docs/rules/code-style.md`); this file is the prose source
of truth for those schemas.

## Worker protocol

The page talks to the engine only through `runCode(request): Promise<RunResult>`
(Track A), which wraps a Web Worker:

```ts
// main → worker
{
	type: 'run'
	request: RunRequest
}
// worker → main
{
	type: 'status'
	phase: 'loading_runtime' | 'running'
}
{
	type: 'result'
	result: RunResult
}
```

The timeout is enforced on the main thread: if no `result` arrives within
`limits.timeoutMs`, the worker is terminated and `runCode` resolves with
`status: 'timeout'`. A fresh worker is created for the next run.

## Types

```ts
interface RunRequest {
	code: string
	entry: string // function to call, e.g. "two_sum"
	tests: { id: string; args: Json[]; expected: Json }[]
	limits: { maxSteps: number; timeoutMs: number } // defaults: 5000, 3000
}

interface RunResult {
	status: 'completed' | 'syntax_error' | 'timeout' | 'engine_error'
	syntaxError?: { message: string; line: number; column: number }
	tests: TestResult[] // empty unless status === 'completed'
}

interface TestResult {
	testId: string
	passed: boolean
	actual?: Value // absent when the call raised
	expected: Value
	error?: { type: string; message: string; line: number } // e.g. IndexError
	trace?: Trace // present for failing tests only
}

interface Trace {
	source: string[] // learner code, one entry per line (1-based lines index into it)
	steps: Step[]
	truncated: boolean // true when maxSteps was hit
}

interface Step {
	index: number // 0-based, dense
	line: number // 1-based line about to run (or that returned/raised)
	event: 'call' | 'line' | 'return' | 'exception'
	func: string
	depth: number // 0 = entry function
	locals: Record<string, Value> // full snapshot of the top frame, not a diff
	changed: string[] // locals whose value differs from the previous step in the same frame
	loops: LoopState[] // active loops, outermost first
	pointers: Pointer[]
	returnValue?: Value // event === 'return'
	exception?: { type: string; message: string } // event === 'exception'
}

interface LoopState {
	line: number // the `for`/`while` header line
	iteration: number // 1-based
	variable?: string // loop target, for `for` loops
}

interface Pointer {
	name: string // int local, e.g. "i"
	list: string // list local it indexes, e.g. "nums"
	index: number
}

type Value =
	| { kind: 'int' | 'float'; value: number }
	| { kind: 'bool'; value: boolean }
	| { kind: 'str'; value: string }
	| { kind: 'none' }
	| { kind: 'list' | 'tuple'; items: Value[]; truncated?: boolean } // cap 50 items
	| { kind: 'dict'; entries: [Value, Value][]; truncated?: boolean } // cap 50 entries
	| { kind: 'other'; repr: string } // anything else, repr capped at 200 chars
```

## Rules both sides rely on

- **Steps are only for learner code.** Frames from the harness, Pyodide or
  the standard library are never emitted; `depth` counts learner frames
  only.
- **Pointers:** an int local is a pointer to a list local when the
  problem's `pointerVars` names the pair, or — without metadata — when
  it's a loop variable over `range(len(<list>))`. `0 <= index < len` is
  not guaranteed (an out-of-range pointer is exactly what a learner needs
  to see); Track B renders it off the end.
- **Values are by snapshot.** Aliasing (two names, same list) is not
  represented in v1.
- **Trace only failing tests.** Passing tests run untraced, for speed.
- **No trace leaves the browser.** Only pass/fail counts go to the API
  (`specs/01-architecture.md`).

## Fixture: Two Sum failing run

Learner code (the inner loop wrongly starts at 0, so an element is paired
with itself):

```python
def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
```

Test `t2`: `args: [[3, 2, 4], 6]`, `expected: [1, 2]`. Actual `[0, 0]`.

```json
{
	"status": "completed",
	"tests": [
		{
			"testId": "t2",
			"passed": false,
			"actual": {
				"kind": "list",
				"items": [
					{ "kind": "int", "value": 0 },
					{ "kind": "int", "value": 0 }
				]
			},
			"expected": {
				"kind": "list",
				"items": [
					{ "kind": "int", "value": 1 },
					{ "kind": "int", "value": 2 }
				]
			},
			"trace": {
				"source": [
					"def two_sum(nums, target):",
					"    for i in range(len(nums)):",
					"        for j in range(len(nums)):",
					"            if nums[i] + nums[j] == target:",
					"                return [i, j]",
					"    return []"
				],
				"truncated": false,
				"steps": [
					{
						"index": 0,
						"line": 1,
						"event": "call",
						"func": "two_sum",
						"depth": 0,
						"locals": {
							"nums": {
								"kind": "list",
								"items": [
									{ "kind": "int", "value": 3 },
									{ "kind": "int", "value": 2 },
									{ "kind": "int", "value": 4 }
								]
							},
							"target": { "kind": "int", "value": 6 }
						},
						"changed": ["nums", "target"],
						"loops": [],
						"pointers": []
					},
					{
						"index": 1,
						"line": 2,
						"event": "line",
						"func": "two_sum",
						"depth": 0,
						"locals": {
							"nums": {
								"kind": "list",
								"items": [
									{ "kind": "int", "value": 3 },
									{ "kind": "int", "value": 2 },
									{ "kind": "int", "value": 4 }
								]
							},
							"target": { "kind": "int", "value": 6 }
						},
						"changed": [],
						"loops": [],
						"pointers": []
					},
					{
						"index": 2,
						"line": 3,
						"event": "line",
						"func": "two_sum",
						"depth": 0,
						"locals": {
							"nums": {
								"kind": "list",
								"items": [
									{ "kind": "int", "value": 3 },
									{ "kind": "int", "value": 2 },
									{ "kind": "int", "value": 4 }
								]
							},
							"target": { "kind": "int", "value": 6 },
							"i": { "kind": "int", "value": 0 }
						},
						"changed": ["i"],
						"loops": [{ "line": 2, "iteration": 1, "variable": "i" }],
						"pointers": [{ "name": "i", "list": "nums", "index": 0 }]
					},
					{
						"index": 3,
						"line": 4,
						"event": "line",
						"func": "two_sum",
						"depth": 0,
						"locals": {
							"nums": {
								"kind": "list",
								"items": [
									{ "kind": "int", "value": 3 },
									{ "kind": "int", "value": 2 },
									{ "kind": "int", "value": 4 }
								]
							},
							"target": { "kind": "int", "value": 6 },
							"i": { "kind": "int", "value": 0 },
							"j": { "kind": "int", "value": 0 }
						},
						"changed": ["j"],
						"loops": [
							{ "line": 2, "iteration": 1, "variable": "i" },
							{ "line": 3, "iteration": 1, "variable": "j" }
						],
						"pointers": [
							{ "name": "i", "list": "nums", "index": 0 },
							{ "name": "j", "list": "nums", "index": 0 }
						]
					},
					{
						"index": 4,
						"line": 5,
						"event": "line",
						"func": "two_sum",
						"depth": 0,
						"locals": {
							"nums": {
								"kind": "list",
								"items": [
									{ "kind": "int", "value": 3 },
									{ "kind": "int", "value": 2 },
									{ "kind": "int", "value": 4 }
								]
							},
							"target": { "kind": "int", "value": 6 },
							"i": { "kind": "int", "value": 0 },
							"j": { "kind": "int", "value": 0 }
						},
						"changed": [],
						"loops": [
							{ "line": 2, "iteration": 1, "variable": "i" },
							{ "line": 3, "iteration": 1, "variable": "j" }
						],
						"pointers": [
							{ "name": "i", "list": "nums", "index": 0 },
							{ "name": "j", "list": "nums", "index": 0 }
						]
					},
					{
						"index": 5,
						"line": 5,
						"event": "return",
						"func": "two_sum",
						"depth": 0,
						"locals": {
							"nums": {
								"kind": "list",
								"items": [
									{ "kind": "int", "value": 3 },
									{ "kind": "int", "value": 2 },
									{ "kind": "int", "value": 4 }
								]
							},
							"target": { "kind": "int", "value": 6 },
							"i": { "kind": "int", "value": 0 },
							"j": { "kind": "int", "value": 0 }
						},
						"changed": [],
						"loops": [
							{ "line": 2, "iteration": 1, "variable": "i" },
							{ "line": 3, "iteration": 1, "variable": "j" }
						],
						"pointers": [
							{ "name": "i", "list": "nums", "index": 0 },
							{ "name": "j", "list": "nums", "index": 0 }
						],
						"returnValue": {
							"kind": "list",
							"items": [
								{ "kind": "int", "value": 0 },
								{ "kind": "int", "value": 0 }
							]
						}
					}
				]
			}
		}
	]
}
```

Step 3 is the "aha": both pointers sit on `nums[0]`, so `3 + 3 == 6`
pairs an element with itself. (Test `t1`, `[2, 7, 11, 15]` / `9`, passes
with this bug — which is why the failing test, not the first test, is
what gets traced.)

## Open questions for the call

- Track B wants a "first divergent step" marker — does the problem
  supply an expected trace, or is that a hint-level feature?
- Should `locals` be diffs instead of snapshots if traces get large?
  (Snapshots chosen for simplicity; `maxSteps` keeps them bounded.)

## Amendment: `ast` worker message (M7.1)

> **Status: IMPLEMENTED in code (M7.1, 2026-11-02) — Track A + Track B sign-off
> was NOT separately obtained.** Umair decided to implement it; Asad (the other
> track owner) has not reviewed or approved it. It is listed here because the
> worker protocol is part of this governed contract and a change to it normally
> needs both owners (`specs/README.md` § "The trace contract is special"). The
> amendment is purely additive and leaves `RunResult`/`TraceResult` untouched,
> but until the other owner signs off it should be treated as open to change:
> any change is made in one PR with this section, the Zod schemas and the tests
> together. Proposed by M7 (`specs/features/learning-recommendations.md`).

**What changes:** one new request type and one new response type on the worker
protocol. **Nothing else.** `RunRequest`, `RunResult`, `TraceRequest`,
`TraceResult`, `Step`, `Value` and every rule above are untouched — this
amendment only _adds_ variants alongside the existing `run`/`run_result` and
`trace`/`trace_result` pairs in `src/lib/trace/contract.ts`.

**Why:** M7 needs a bounded structural read of the learner's source (loop/branch
counts, dict/set use, nesting depth) to recommend what to practise next. Per
ADR-0001 and ADR-0003 that analysis stays in the browser, and the Pyodide worker
is already booted — so it does an `ast.parse` (parse only, **no execution**) and
returns a small summary.

```ts
// main → worker
{
	type: 'ast'
	request: {
		code: string
	}
}
// worker → main  (status messages are reused as-is)
{
	type: 'ast_result'
	result: AstResult
}

// A source that does not parse, or cannot be analysed, is a validated outcome —
// never a thrown error — so the caller simply persists no features for it.
type AstResult =
	| { status: 'ok'; features: CodeFeatures }
	| { status: 'syntax_error'; syntaxError: { message: string; line: number; column: number } }
	| { status: 'analysis_error'; message: string; permanent: boolean }
// permanent: too large (> 20 000 chars) or a parser limit: the same source always fails.
// not permanent: timeout or worker failure: worth retrying.
```

```ts
// Additive, versioned, bounded. Full field list in the M7 spec.
interface CodeFeatures {
	v: 1
	loops: { for: number; while: number; maxDepth: number }
	comprehensions: number
	branches: number
	returns: number
	defs: number
	recursion: boolean
	usesDict: boolean
	usesSet: boolean
	usesSorted: boolean
	builtinCalls: string[] // fixed allowlist, sorted, ≤16 — no raw identifiers
	nodeCount: number
	lineCount: number
}
```

**Guarantees for both tracks:**

- **Parse, never execute.** The worker calls `ast.parse` and walks the tree; it
  never runs the learner's code for this message. No `sys.settrace`, no `RunResult`
  path involved.
- **No trace, no source leaves the browser** via this message — it returns only
  the bounded `CodeFeatures` (counts/booleans and allow-listed builtin names).
  Where that summary is later persisted is M7's concern, outside this contract.
- **Reuses the booted worker** and the existing `status` phases; it is single-
  flight with `run`/`trace` like today. Capped (source ≤ 20 000 characters, every
  count ≤ 100 000, a 2 s main-thread timeout that recycles the worker like any
  other) and deterministic (sorted arrays, same source → same bytes).
- **Track B impact: none required.** The visualiser's `run`/`trace` consumption is
  unchanged; it may ignore `ast` entirely. Only M7's non-visualiser client code
  sends it.

**Where it lives:** the two variants are in the worker request/response unions
in `src/lib/trace/contract.ts`. `codeFeaturesSchema` (`.strict()`, so an unknown
key is rejected rather than stored), `astResultSchema`, the limits and the
builtin allow-list are in `src/lib/trace/code-features.ts`, which `contract.ts`
imports (so the governed file stays small and the new one has no reverse
dependency). The Python is `AST_PROGRAM` in `src/lib/trace/ast-program.ts`: it
calls `ast.parse` and walks the tree with an `ast.NodeVisitor`, and a test fails
if it ever gains an `exec`/`eval`/`compile` call. Verified against real Pyodide in
`e2e/trace-engine.spec.ts`, including a `run → ast → trace → run` sequence on one
worker that leaves the run and trace results unchanged.

## Amendment: `test_result` worker event (Practice Run progress)

> **Status: IMPLEMENTED in code — Track A + Track B sign-off was NOT separately
> obtained.** Requested in the product brief for the Practice Run experience
> (`specs/features/practice-run-progress.md`). Like the `ast` amendment above, it
> is purely additive and leaves `RunRequest`, `RunResult` and every rule untouched,
> but the worker protocol is part of this governed contract, so until the other
> owner signs off it is open to change: any change is made in one PR with this
> section, the Zod schemas and the tests together.

**What changes:** one new worker → main message, `test_result`. **Nothing else.**
The `run` request and the final `run_result` are exactly as before, and
`run_result` remains the one authoritative result.

**Why:** the Python run program already executes the tests one after another, but
the worker only posted once, after the last one. A learner watching a slow run saw
nothing until the end. Posting as each test finishes lets the page show real
progress — no timers, no replaying a finished batch.

```ts
// worker → main, zero or more per `run`, in test order, before `run_result`
{
	type: 'test_result'
	index: number // position in `request.tests`, 0-based
	test: TestResult // the same object that appears in run_result.tests[index]
}
```

**Guarantees for both tracks:**

- **Real events.** `RUN_PROGRAM` calls an optional `REPORT_TEST` after each test,
  while its loop is still running; the worker turns that into `postMessage`
  synchronously, so the message is sent before the next test starts. A test in
  `run_result.tests` is byte-identical to its `test_result`.
- **Grading is untouched.** The comparison, `safe()`, the `deepcopy` of args and
  the error capture are unchanged; reporting happens after a test's result is
  recorded and a failure to report is swallowed. A run with no `REPORT_TEST`
  (the node test harness) behaves exactly as before.
- **Ordered and de-duplicated on the main thread.** The engine forwards an event
  only if its `index` is the next expected one; a duplicate, a gap or a malformed
  event is ignored. Handlers are cleared when the call settles, so nothing from a
  finished, timed-out or recycled run can reach a later one.
- **Not sent when no test runs:** a syntax error or a missing entry produces no
  `test_result`, only `run_result`.
- **Timeouts and the single-flight rule are unchanged.** The execution timer still
  covers the whole run (events do not extend it). On a timeout the worker is
  terminated and `run_result` is still `status: 'timeout'` with `tests: []`; the
  caller may keep the events it already received for display, but they are not
  a result and are never graded or persisted.
- **Track B impact: optional.** A consumer may ignore `test_result` entirely and
  only read `run_result`; Daily Challenge examples do.

**Where it lives:** the variant is in `workerResponseSchema` in
`src/lib/trace/contract.ts`; the Python in `RUN_PROGRAM`
(`src/lib/trace/trace-program.ts`); the glue in `src/lib/trace/worker-source.ts`;
the main-thread side is `EngineCallOptions.onTestResult` in
`src/lib/trace/run-code.ts`. Tested against the real worker source and the real
runner under Pyodide in `src/lib/trace/run-streaming.test.mts` (strict
alternation of the learner's own code and the reports proves they are not batched).

## Judging in-place problems (no contract change)

A problem whose function returns nothing and mutates its argument (Move Zeroes)
is judged by `buildRunRequest` in `src/lib/trace/grading.ts`: it appends a harness
function to the learner's source and uses it as the run entry, so the unchanged
`run` program compares the _mutated argument_ with `expected`. The `run`/`trace`
requests, the worker and every schema in this document are untouched; a `trace`
still runs the learner's own function. See
[`features/curated-problem-pack.md`](features/curated-problem-pack.md).
