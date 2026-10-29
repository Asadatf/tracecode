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
