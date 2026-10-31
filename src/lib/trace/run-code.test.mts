import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TraceEngine, type WorkerLike } from './run-code'
import type { RunRequest, RunResult, TraceRequest, TraceResult } from './contract'

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
