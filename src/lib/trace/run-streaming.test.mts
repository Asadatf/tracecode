import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TraceEngine, type WorkerLike } from './run-code'
import { buildWorkerSource } from './worker-source'
import { runInPyodide } from './engine-python.mts'
import { PYODIDE_VERSION } from './trace-program'
import type { RunRequest, TestResult } from './contract'

// Per-test streaming of a Run. Two layers:
//  - the main-thread engine, against a scripted worker (ordering, stale events, timeouts,
//    errors, a faulty listener, consecutive runs);
//  - the REAL worker source + the REAL Python runner under real Pyodide, to prove each test is
//    reported while the loop is still running, and that the final result is unchanged.

const int = (value: number) => ({ kind: 'int' as const, value })
const ok = (testId: string, n = 1): TestResult => ({
	testId,
	passed: true,
	actual: int(n),
	expected: int(n)
})

function runRequest(ids: string[], timeoutMs = 1000): RunRequest {
	return {
		code: 'def f(x):\n    return x',
		entry: 'f',
		tests: ids.map((id, i) => ({ id, args: [i], expected: i })),
		limits: { timeoutMs }
	}
}

class ScriptedWorker implements WorkerLike {
	onmessage: ((event: { data: unknown }) => void) | null = null
	onerror: ((event: unknown) => void) | null = null
	terminated = false
	readonly plan: (worker: ScriptedWorker, message: unknown) => void
	constructor(plan: (worker: ScriptedWorker, message: unknown) => void) {
		this.plan = plan
	}
	postMessage(data: unknown) {
		this.plan(this, data)
	}
	terminate() {
		this.terminated = true
	}
	emit(data: unknown) {
		queueMicrotask(() => this.onmessage?.({ data }))
	}
}

const status = { type: 'status', phase: 'running' } as const
const event = (index: number, test: TestResult) => ({ type: 'test_result', index, test })

describe('engine: streamed test results', () => {
	it('reports each test in order, before the final result', async () => {
		const log: string[] = []
		const engine = new TraceEngine({
			createWorker: () =>
				new ScriptedWorker((w) => {
					w.emit(status)
					w.emit(event(0, ok('t1')))
					w.emit(event(1, ok('t2')))
					w.emit({
						type: 'run_result',
						result: { status: 'completed', tests: [ok('t1'), ok('t2')] }
					})
				})
		})
		const result = await engine.runCode(runRequest(['t1', 't2']), {
			onTestResult: (index, test) => log.push(`${index}:${test.testId}`)
		})
		assert.deepEqual(log, ['0:t1', '1:t2'])
		assert.equal(result.status, 'completed')
		assert.equal(result.tests.length, 2)
	})

	it('ignores a duplicate, a gap and a malformed event', async () => {
		const seen: number[] = []
		const engine = new TraceEngine({
			createWorker: () =>
				new ScriptedWorker((w) => {
					w.emit(status)
					w.emit(event(0, ok('t1')))
					w.emit(event(0, ok('t1'))) // duplicate
					w.emit(event(2, ok('t3'))) // gap
					w.emit({ type: 'test_result', index: -1, test: ok('x') }) // malformed
					w.emit(event(1, ok('t2')))
					w.emit({ type: 'run_result', result: { status: 'completed', tests: [] } })
				})
		})
		await engine.runCode(runRequest(['t1', 't2', 't3']), {
			onTestResult: (index) => seen.push(index)
		})
		assert.deepEqual(seen, [0, 1])
	})

	it('a timeout keeps what already finished and nothing arrives after it', async () => {
		const seen: string[] = []
		let worker: ScriptedWorker | null = null
		const engine = new TraceEngine({
			createWorker: () =>
				(worker = new ScriptedWorker((w) => {
					w.emit(status)
					w.emit(event(0, ok('t1')))
					// t2 never finishes: an infinite loop.
				}))
		})
		const result = await engine.runCode(runRequest(['t1', 't2'], 30), {
			onTestResult: (_index, test) => seen.push(test.testId)
		})
		assert.equal(result.status, 'timeout')
		assert.deepEqual(seen, ['t1'])
		assert.equal(worker!.terminated, true)
		// A late event from the dead run reaches nobody.
		worker!.onmessage?.({ data: event(1, ok('t2')) })
		assert.deepEqual(seen, ['t1'])
	})

	it('a worker error mid-run settles as an engine error and keeps the earlier results', async () => {
		const seen: string[] = []
		const engine = new TraceEngine({
			createWorker: () =>
				new ScriptedWorker((w) => {
					w.emit(status)
					w.emit(event(0, ok('t1')))
					queueMicrotask(() => queueMicrotask(() => w.onerror?.({ message: 'boom' })))
				})
		})
		const result = await engine.runCode(runRequest(['t1', 't2']), {
			onTestResult: (_i, test) => seen.push(test.testId)
		})
		assert.equal(result.status, 'engine_error')
		assert.deepEqual(seen, ['t1'])
	})

	it('a throwing progress listener never costs the run its result', async () => {
		const engine = new TraceEngine({
			createWorker: () =>
				new ScriptedWorker((w) => {
					w.emit(status)
					w.emit(event(0, ok('t1')))
					w.emit({ type: 'run_result', result: { status: 'completed', tests: [ok('t1')] } })
				})
		})
		const result = await engine.runCode(runRequest(['t1']), {
			onTestResult: () => {
				throw new Error('listener bug')
			}
		})
		assert.equal(result.status, 'completed')
	})

	it("consecutive runs are single-flight and never see each other's events", async () => {
		const first: string[] = []
		const second: string[] = []
		const engine = new TraceEngine({
			createWorker: () =>
				new ScriptedWorker((w, message) => {
					const tests = (message as { request: RunRequest }).request.tests
					w.emit(status)
					tests.forEach((t, i) => w.emit(event(i, ok(t.id))))
					w.emit({
						type: 'run_result',
						result: { status: 'completed', tests: tests.map((t) => ok(t.id)) }
					})
				})
		})
		const a = engine.runCode(runRequest(['a1', 'a2']), {
			onTestResult: (_i, t) => first.push(t.testId)
		})
		const b = engine.runCode(runRequest(['b1']), { onTestResult: (_i, t) => second.push(t.testId) })
		await Promise.all([a, b])
		assert.deepEqual(first, ['a1', 'a2'])
		assert.deepEqual(second, ['b1'])
	})

	it('without a listener, behaviour is exactly as before', async () => {
		const engine = new TraceEngine({
			createWorker: () =>
				new ScriptedWorker((w) => {
					w.emit(status)
					w.emit(event(0, ok('t1')))
					w.emit({ type: 'run_result', result: { status: 'completed', tests: [ok('t1')] } })
				})
		})
		const result = await engine.runCode(runRequest(['t1']))
		assert.equal(result.status, 'completed')
	})
})

// ── The real worker, the real runner, real Pyodide ───────────────────────────
// The worker source is run with the Pyodide the app ships, its `self` and `importScripts`
// stubbed (the worker normally gets them from the browser). Messages cross the same
// postMessage boundary, in the order the worker posts them.

declare global {
	// The learner code below logs here through Pyodide's `js` module.
	var __tcLog: string[] | undefined
}

// Booting Pyodide is the expensive part, and this suite runs beside other Pyodide tests with
// wall-clock budgets, so the real worker is booted once and shared by the tests below.
let post: ((data: unknown) => void) | undefined
let sharedWorker: Promise<WorkerLike> | null = null

function realWorker(onPost?: (data: unknown) => void): Promise<WorkerLike> {
	post = onPost
	sharedWorker ??= (async () => {
		const { loadPyodide } = await import('pyodide')
		const indexPath = new URL(`../../../public/pyodide/v${PYODIDE_VERSION}/`, import.meta.url)
			.pathname
		const worker: WorkerLike = {
			onmessage: null,
			onerror: null,
			postMessage: (data) => self_.onmessage?.({ data }),
			terminate: () => undefined
		}
		const self_: {
			onmessage: ((e: { data: unknown }) => Promise<void>) | null
			postMessage: (d: unknown) => void
		} = {
			onmessage: null,
			postMessage: (data) => {
				post?.(data)
				queueMicrotask(() => worker.onmessage?.({ data }))
			}
		}
		new Function('self', 'importScripts', 'loadPyodide', buildWorkerSource(indexPath))(
			self_,
			() => undefined,
			loadPyodide
		)
		return worker
	})()
	return sharedWorker
}

const SLOW_REAL_TESTS = { timeout: 120_000 }

describe('real worker + real Python runner: streaming', () => {
	it(
		'reports each test while the loop is still running, not as a batch afterwards',
		SLOW_REAL_TESTS,
		async () => {
			globalThis.__tcLog = []
			// The learner's own code logs when it runs; the worker logs when it posts. Strict
			// alternation is only possible if each result is posted before the next test starts.
			const code = [
				'import js',
				'def f(x):',
				"    js.__tcLog.push('run:' + str(x))",
				'    return x'
			].join('\n')
			const request: RunRequest = {
				code,
				entry: 'f',
				tests: [0, 1, 2].map((i) => ({ id: `t${i}`, args: [i], expected: i })),
				limits: { timeoutMs: 60_000 }
			}
			const worker = await realWorker((data) => {
				const message = data as { type: string; index?: number }
				if (message.type === 'test_result') globalThis.__tcLog?.push(`post:${message.index}`)
				if (message.type === 'run_result') globalThis.__tcLog?.push('post:final')
			})
			const streamed: TestResult[] = []
			const realEngine = new TraceEngine({ createWorker: () => worker })
			const result = await realEngine.runCode(request, {
				onTestResult: (_index, test) => streamed.push(test)
			})
			assert.deepEqual(globalThis.__tcLog, [
				'run:0',
				'post:0',
				'run:1',
				'post:1',
				'run:2',
				'post:2',
				'post:final'
			])
			assert.equal(streamed.length, 3)
			assert.equal(result.status, 'completed')
			assert.deepEqual(streamed, result.tests, 'streamed results equal the final result, in order')
		}
	)

	it(
		'streams failures with their details, and the final result matches the non-streaming grader',
		SLOW_REAL_TESTS,
		async () => {
			const code = [
				'def f(x):',
				'    if x == 1:',
				'        return 99',
				'    if x == 2:',
				'        return 1 // 0',
				'    return x'
			].join('\n')
			const request: RunRequest = {
				code,
				entry: 'f',
				tests: [0, 1, 2, 3].map((i) => ({ id: `t${i}`, args: [i], expected: i })),
				limits: { timeoutMs: 60_000 }
			}
			const streamed: TestResult[] = []
			const worker = await realWorker()
			const engine = new TraceEngine({ createWorker: () => worker })
			const result = await engine.runCode(request, { onTestResult: (_i, t) => streamed.push(t) })

			assert.deepEqual(
				streamed.map((t) => [t.testId, t.passed]),
				[
					['t0', true],
					['t1', false],
					['t2', false],
					['t3', true]
				]
			)
			// A wrong answer keeps actual vs expected; a runtime error keeps its type, message and line.
			assert.deepEqual(streamed[1]?.actual, int(99))
			assert.equal(streamed[2]?.error?.type, 'ZeroDivisionError')
			assert.equal(streamed[2]?.error?.line, 5)
			// The existing grader path (no progress callback at all) gives the identical result.
			const graded = await runInPyodide(request)
			assert.deepEqual(result, graded)
			assert.deepEqual(streamed, result.tests)
		}
	)

	it(
		'a syntax error or missing entry reports no tests, exactly as before',
		SLOW_REAL_TESTS,
		async () => {
			const worker = await realWorker()
			const engine = new TraceEngine({ createWorker: () => worker })
			const streamed: TestResult[] = []
			const base = {
				entry: 'f',
				tests: [{ id: 't0', args: [0], expected: 0 }],
				limits: { timeoutMs: 60_000 }
			}
			const bad = await engine.runCode(
				{ ...base, code: 'def f(:\n  pass' },
				{ onTestResult: (_i, t) => streamed.push(t) }
			)
			const missing = await engine.runCode(
				{ ...base, code: 'def g(x):\n    return x' },
				{ onTestResult: (_i, t) => streamed.push(t) }
			)
			assert.equal(bad.status, 'syntax_error')
			assert.equal(missing.status, 'engine_error')
			assert.deepEqual(streamed, [])
		}
	)
})
