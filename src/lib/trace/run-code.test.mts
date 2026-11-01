import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TraceEngine, type WorkerLike } from './run-code'
import type { RunRequest, RunResult, TraceRequest, TraceResult } from './contract'
import { FEATURE_LIMITS, type AstResult, type CodeFeatures } from './code-features'

// Lifecycle tests for the main-thread engine, driven by a fake worker — no
// Pyodide, no browser. They verify worker reuse, the two separate timeouts,
// recovery after a timeout/error, and that malformed worker messages are
// ignored. The real tracer (Pyodide) is proven in e2e/trace-engine.spec.ts.

class FakeWorker implements WorkerLike {
	onmessage: ((event: { data: unknown }) => void) | null = null
	onerror: ((event: unknown) => void) | null = null
	terminated = false
	readonly #plan: (worker: FakeWorker, message: unknown) => void

	constructor(plan: (worker: FakeWorker, message: unknown) => void) {
		this.#plan = plan
	}

	postMessage(data: unknown): void {
		this.#plan(this, data)
	}

	terminate(): void {
		this.terminated = true
	}

	emit(data: unknown): void {
		queueMicrotask(() => this.onmessage?.({ data }))
	}

	emitError(message: string): void {
		queueMicrotask(() => this.onerror?.({ message }))
	}
}

const COMPLETED: TraceResult = {
	status: 'completed',
	actual: {
		kind: 'list',
		items: [
			{ kind: 'int', value: 0 },
			{ kind: 'int', value: 0 }
		]
	},
	trace: { source: ['def two_sum(nums, target):', '    return []'], steps: [], truncated: false }
}

function request(timeoutMs = 1000): TraceRequest {
	return {
		code: 'def two_sum(nums, target):\n    return []',
		entry: 'two_sum',
		input: { args: [[3, 2, 4], 6] },
		limits: { maxSteps: 2000, timeoutMs }
	}
}

// Emits the full healthy handshake whenever it receives a trace request.
function healthyPlan(worker: FakeWorker): void {
	worker.emit({ type: 'status', phase: 'loading_runtime' })
	worker.emit({ type: 'status', phase: 'running' })
	worker.emit({ type: 'trace_result', result: COMPLETED })
}

test('traceCode resolves with the completed result and reuses a healthy worker', async () => {
	let created = 0
	const engine = new TraceEngine({
		createWorker: () => {
			created += 1
			return new FakeWorker((worker) => healthyPlan(worker))
		}
	})

	const first = await engine.traceCode(request())
	const second = await engine.traceCode(request())

	assert.equal(first.status, 'completed')
	assert.deepEqual(first.actual, COMPLETED.actual)
	assert.equal(second.status, 'completed')
	assert.equal(created, 1, 'the same booted worker is reused across calls')
})

test('an execution timeout resolves timeout, recycles the worker, and the next call recovers', async () => {
	const workers: FakeWorker[] = []
	const engine = new TraceEngine({
		initTimeoutMs: 1000,
		createWorker: () => {
			const index = workers.length
			const worker = new FakeWorker((w) => {
				if (index === 0) {
					// Boots, then hangs — never returns a result.
					w.emit({ type: 'status', phase: 'loading_runtime' })
					w.emit({ type: 'status', phase: 'running' })
				} else {
					healthyPlan(w)
				}
			})
			workers.push(worker)
			return worker
		}
	})

	const timedOut = await engine.traceCode(request(20))
	const recovered = await engine.traceCode(request())

	assert.equal(timedOut.status, 'timeout')
	assert.equal(workers[0]?.terminated, true, 'the hung worker is terminated')
	assert.equal(workers.length, 2, 'a fresh worker is created for recovery')
	assert.equal(recovered.status, 'completed')
})

test('an init that never reaches running fails as engine_error within initTimeoutMs', async () => {
	const workers: FakeWorker[] = []
	const engine = new TraceEngine({
		initTimeoutMs: 20,
		createWorker: () => {
			const index = workers.length
			const worker = new FakeWorker((w) => {
				if (index === 0)
					w.emit({ type: 'status', phase: 'loading_runtime' }) // stuck loading
				else healthyPlan(w)
			})
			workers.push(worker)
			return worker
		}
	})

	const failed = await engine.traceCode(request())
	const recovered = await engine.traceCode(request())

	assert.equal(failed.status, 'engine_error')
	assert.equal(failed.error?.type, 'engine')
	assert.equal(workers[0]?.terminated, true)
	assert.equal(recovered.status, 'completed')
})

test('a worker error resolves engine_error with the message and recycles', async () => {
	const workers: FakeWorker[] = []
	const engine = new TraceEngine({
		createWorker: () => {
			const index = workers.length
			const worker = new FakeWorker((w) => {
				if (index === 0) w.emitError('boom')
				else healthyPlan(w)
			})
			workers.push(worker)
			return worker
		}
	})

	const failed = await engine.traceCode(request())
	const recovered = await engine.traceCode(request())

	assert.equal(failed.status, 'engine_error')
	assert.equal(failed.error?.message, 'boom')
	assert.equal(workers[0]?.terminated, true)
	assert.equal(recovered.status, 'completed')
})

test('malformed worker messages are ignored until a valid result arrives', async () => {
	const engine = new TraceEngine({
		createWorker: () =>
			new FakeWorker((worker) => {
				worker.emit({ type: 'nonsense' })
				worker.emit({ type: 'status', phase: 'warming' }) // invalid phase
				worker.emit({ type: 'status', phase: 'running' })
				worker.emit({ nope: true })
				worker.emit({ type: 'trace_result', result: COMPLETED })
			})
	})

	const result = await engine.traceCode(request())
	assert.equal(result.status, 'completed')
})

const COMPLETED_RUN: RunResult = {
	status: 'completed',
	tests: [
		{
			testId: 't1',
			passed: true,
			actual: {
				kind: 'list',
				items: [
					{ kind: 'int', value: 0 },
					{ kind: 'int', value: 1 }
				]
			},
			expected: {
				kind: 'list',
				items: [
					{ kind: 'int', value: 0 },
					{ kind: 'int', value: 1 }
				]
			}
		},
		{
			testId: 't2',
			passed: false,
			actual: { kind: 'list', items: [] },
			expected: {
				kind: 'list',
				items: [
					{ kind: 'int', value: 1 },
					{ kind: 'int', value: 2 }
				]
			}
		}
	]
}

function runRequest(timeoutMs = 1000): RunRequest {
	return {
		code: 'def two_sum(nums, target):\n    return []',
		entry: 'two_sum',
		tests: [
			{ id: 't1', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
			{ id: 't2', args: [[3, 2, 4], 6], expected: [1, 2] }
		],
		limits: { timeoutMs }
	}
}

function healthyRunPlan(worker: FakeWorker): void {
	worker.emit({ type: 'status', phase: 'loading_runtime' })
	worker.emit({ type: 'status', phase: 'running' })
	worker.emit({ type: 'run_result', result: COMPLETED_RUN })
}

test('runCode resolves a completed RunResult and reuses a healthy worker', async () => {
	let created = 0
	const engine = new TraceEngine({
		createWorker: () => {
			created += 1
			return new FakeWorker((worker) => healthyRunPlan(worker))
		}
	})

	const first = await engine.runCode(runRequest())
	const second = await engine.runCode(runRequest())

	assert.equal(first.status, 'completed')
	assert.equal(first.tests.length, 2)
	assert.equal(first.tests[0]?.passed, true)
	assert.equal(first.tests[1]?.passed, false)
	assert.equal(second.status, 'completed')
	assert.equal(created, 1, 'the same booted worker is reused across run calls')
})

test('runCode execution timeout resolves { status: timeout, tests: [] } and recovers', async () => {
	const workers: FakeWorker[] = []
	const engine = new TraceEngine({
		initTimeoutMs: 1000,
		createWorker: () => {
			const index = workers.length
			const worker = new FakeWorker((w) => {
				if (index === 0) {
					w.emit({ type: 'status', phase: 'loading_runtime' })
					w.emit({ type: 'status', phase: 'running' })
				} else {
					healthyRunPlan(w)
				}
			})
			workers.push(worker)
			return worker
		}
	})

	const timedOut = await engine.runCode(runRequest(20))
	const recovered = await engine.runCode(runRequest())

	assert.equal(timedOut.status, 'timeout')
	assert.deepEqual(timedOut.tests, [])
	assert.equal(workers[0]?.terminated, true)
	assert.equal(recovered.status, 'completed')
})

test('runCode surfaces a worker error as engine_error with an empty tests array', async () => {
	const engine = new TraceEngine({
		createWorker: () => new FakeWorker((w) => w.emitError('kaboom'))
	})
	const failed = await engine.runCode(runRequest())
	assert.equal(failed.status, 'engine_error')
	assert.equal(failed.error?.type, 'engine')
	assert.deepEqual(failed.tests, [])
})

test('one engine reuses a single worker across both runCode and traceCode', async () => {
	let created = 0
	const engine = new TraceEngine({
		createWorker: () => {
			created += 1
			return new FakeWorker((worker, message) => {
				const kind = (message as { type?: string }).type
				worker.emit({ type: 'status', phase: 'running' })
				if (kind === 'run') worker.emit({ type: 'run_result', result: COMPLETED_RUN })
				else worker.emit({ type: 'trace_result', result: COMPLETED })
			})
		}
	})

	const run = await engine.runCode(runRequest())
	const trace = await engine.traceCode(request())

	assert.equal(run.status, 'completed')
	assert.equal(trace.status, 'completed')
	assert.equal(created, 1, 'run and trace share one Pyodide worker')
})

// ── M7.1: the additive `ast` message ─────────────────────────────────────────

const AST_FEATURES: CodeFeatures = {
	v: 1,
	loops: { for: 2, while: 0, maxDepth: 2 },
	comprehensions: 0,
	branches: 1,
	returns: 2,
	defs: 1,
	recursion: false,
	usesDict: false,
	usesSet: false,
	usesSorted: false,
	builtinCalls: ['len', 'range'],
	nodeCount: 61,
	lineCount: 6
}
const AST_OK: AstResult = { status: 'ok', features: AST_FEATURES }

function healthyAstPlan(worker: FakeWorker, message: unknown): void {
	worker.emit({ type: 'status', phase: 'loading_runtime' })
	worker.emit({ type: 'status', phase: 'running' })
	const type = (message as { type: string }).type
	if (type === 'ast') worker.emit({ type: 'ast_result', result: AST_OK })
	else if (type === 'trace') worker.emit({ type: 'trace_result', result: COMPLETED })
	else worker.emit({ type: 'run_result', result: { status: 'completed', tests: [] } })
}

test('analyzeCode sends an ast request and resolves the validated result', async () => {
	const sent: unknown[] = []
	const engine = new TraceEngine({
		createWorker: () =>
			new FakeWorker((worker, message) => {
				sent.push(message)
				healthyAstPlan(worker, message)
			})
	})
	const result = await engine.analyzeCode({ code: 'def f(): pass' })
	assert.deepEqual(result, AST_OK)
	assert.deepEqual(sent, [{ type: 'ast', request: { code: 'def f(): pass' } }])
})

test('analyzeCode shares the worker with run and trace, in call order', async () => {
	let created = 0
	const order: string[] = []
	const engine = new TraceEngine({
		createWorker: () => {
			created += 1
			return new FakeWorker((worker, message) => {
				order.push((message as { type: string }).type)
				healthyAstPlan(worker, message)
			})
		}
	})
	const [run, ast, trace] = await Promise.all([
		engine.runCode({ code: 'x', entry: 'f', tests: [], limits: { timeoutMs: 1000 } }),
		engine.analyzeCode({ code: 'x = 1' }),
		engine.traceCode(request())
	])
	assert.equal(run.status, 'completed')
	assert.equal(ast.status, 'ok')
	assert.equal(trace.status, 'completed')
	assert.deepEqual(order, ['run', 'ast', 'trace'], 'single-flight, FIFO')
	assert.equal(created, 1)
})

test('a syntax error from the worker is a validated result, not a failure', async () => {
	const syntax: AstResult = {
		status: 'syntax_error',
		syntaxError: { message: 'invalid syntax', line: 1, column: 4 }
	}
	const engine = new TraceEngine({
		createWorker: () =>
			new FakeWorker((worker) => {
				worker.emit({ type: 'status', phase: 'running' })
				worker.emit({ type: 'ast_result', result: syntax })
			})
	})
	assert.deepEqual(await engine.analyzeCode({ code: 'def (' }), syntax)
})

test('an oversized source is refused without touching the worker', async () => {
	let created = 0
	const engine = new TraceEngine({
		createWorker: () => {
			created += 1
			return new FakeWorker(() => undefined)
		}
	})
	const result = await engine.analyzeCode({ code: 'x'.repeat(FEATURE_LIMITS.maxSourceChars + 1) })
	assert.equal(result.status, 'analysis_error')
	assert.equal(result.status === 'analysis_error' && result.permanent, true, 'final: never retried')
	assert.equal(created, 0)
})

test('an ast timeout resolves analysis_error, recycles the worker, and the next call recovers', async () => {
	const workers: FakeWorker[] = []
	const engine = new TraceEngine({
		astTimeoutMs: 20,
		createWorker: () => {
			const index = workers.length
			const worker = new FakeWorker((w, message) => {
				if (index === 0) {
					w.emit({ type: 'status', phase: 'running' }) // hangs
				} else healthyAstPlan(w, message)
			})
			workers.push(worker)
			return worker
		}
	})
	const timedOut = await engine.analyzeCode({ code: 'x = 1' })
	const recovered = await engine.analyzeCode({ code: 'x = 1' })
	assert.equal(timedOut.status, 'analysis_error')
	assert.equal(timedOut.status === 'analysis_error' && timedOut.permanent, false, 'worth retrying')
	assert.equal(workers[0]?.terminated, true)
	assert.equal(recovered.status, 'ok')
})

test('a worker that cannot be created resolves analysis_error instead of throwing', async () => {
	const engine = new TraceEngine({
		createWorker: () => {
			throw new Error('Worker is not supported')
		}
	})
	const result = await engine.analyzeCode({ code: 'x = 1' })
	assert.equal(result.status, 'analysis_error')
	// The queue survives: a later call is still processed.
	assert.equal(engine.idle, true)
})

test('a worker error resolves analysis_error with the message', async () => {
	const engine = new TraceEngine({
		createWorker: () => new FakeWorker((worker) => worker.emitError('wasm trap'))
	})
	const result = await engine.analyzeCode({ code: 'x = 1' })
	assert.deepEqual(result, { status: 'analysis_error', message: 'wasm trap', permanent: false })
})

test('an ast_result is ignored by run and trace calls, and a stray run_result by analyzeCode', async () => {
	const engine = new TraceEngine({
		createWorker: () =>
			new FakeWorker((worker, message) => {
				worker.emit({ type: 'status', phase: 'running' })
				const type = (message as { type: string }).type
				if (type === 'trace') {
					worker.emit({ type: 'ast_result', result: AST_OK }) // wrong kind: ignored
					worker.emit({ type: 'trace_result', result: COMPLETED })
				} else {
					worker.emit({ type: 'run_result', result: { status: 'completed', tests: [] } })
					worker.emit({ type: 'ast_result', result: AST_OK })
				}
			})
	})
	assert.equal((await engine.traceCode(request())).status, 'completed')
	assert.equal((await engine.analyzeCode({ code: 'x = 1' })).status, 'ok')
})

test('a malformed ast_result still settles (via the ast timeout) and the engine recovers', async () => {
	const workers: FakeWorker[] = []
	const engine = new TraceEngine({
		astTimeoutMs: 20,
		createWorker: () => {
			const index = workers.length
			const worker = new FakeWorker((w, message) => {
				if (index === 0) {
					w.emit({ type: 'status', phase: 'running' })
					w.emit({ type: 'ast_result', result: { status: 'ok', features: { v: 1 } } }) // fails validation
				} else healthyAstPlan(w, message)
			})
			workers.push(worker)
			return worker
		}
	})
	const first = await engine.analyzeCode({ code: 'x = 1' })
	assert.equal(first.status, 'analysis_error')
	assert.equal((await engine.analyzeCode({ code: 'x = 1' })).status, 'ok')
	assert.equal(engine.idle, true)
})

test('an ast request queued behind a Run never delays or alters it', async () => {
	const seen: string[] = []
	const engine = new TraceEngine({
		createWorker: () =>
			new FakeWorker((worker, message) => {
				seen.push((message as { type: string }).type)
				healthyAstPlan(worker, message)
			})
	})
	const run = engine.runCode({ code: 'x', entry: 'f', tests: [], limits: { timeoutMs: 1000 } })
	const ast = engine.analyzeCode({ code: 'x = 1' })
	const replay = engine.traceCode(request())
	assert.equal((await run).status, 'completed')
	assert.equal((await ast).status, 'ok')
	assert.equal((await replay).status, 'completed')
	assert.deepEqual(seen, ['run', 'ast', 'trace'], 'strictly first-come first-served')
})

test('idle is false while work is queued or running and true again afterwards', async () => {
	const engine = new TraceEngine({
		createWorker: () => new FakeWorker((worker, message) => healthyAstPlan(worker, message))
	})
	assert.equal(engine.idle, true)
	const pending = engine.analyzeCode({ code: 'x = 1' })
	assert.equal(engine.idle, false)
	await pending
	await new Promise((resolve) => setImmediate(resolve))
	assert.equal(engine.idle, true)
})
