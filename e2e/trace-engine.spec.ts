import { test, expect, type Page } from '@playwright/test'
import {
	TRACE_PROGRAM,
	PYODIDE_INDEX_URL,
	PYODIDE_SCRIPT_URL
} from '../src/lib/trace/trace-program'
import { buildWorkerSource } from '../src/lib/trace/worker-source'
import {
	runResultSchema,
	traceResultSchema,
	VALUE_LIMITS,
	type Step,
	type TraceResult
} from '../src/lib/trace/contract'

// Real Pyodide, real browser (chromium). These boot a ~10 MB CPython-in-wasm
// runtime from the CDN, so they are slow and need network. They are the only
// place the actual sys.settrace tracer runs; run-code.test.mts covers the
// main-thread lifecycle with a fake worker instead.
//
// They do NOT need the Next app: each uses about:blank and loads Pyodide itself.
// Run them with the app webServer skipped, e.g.
//   E2E_BASE_URL=http://127.0.0.1:1 pnpm exec playwright test e2e/trace-engine.spec.ts

// The self-pairing bug from specs/02-trace-contract.md: the inner loop starts at
// 0, so an element pairs with itself.
const BUGGY_TWO_SUM = [
	'def two_sum(nums, target):',
	'    for i in range(len(nums)):',
	'        for j in range(len(nums)):',
	'            if nums[i] + nums[j] == target:',
	'                return [i, j]',
	'    return []'
].join('\n')

const LIST_0_0 = {
	kind: 'list',
	items: [
		{ kind: 'int', value: 0 },
		{ kind: 'int', value: 0 }
	]
}

function requestJson(): string {
	return JSON.stringify({
		source: BUGGY_TWO_SUM,
		entry: 'two_sum',
		args: [[3, 2, 4], 6],
		maxSteps: 2000,
		maxItems: VALUE_LIMITS.maxItems,
		maxEntries: VALUE_LIMITS.maxEntries,
		maxStringLength: VALUE_LIMITS.maxStringLength,
		maxReprLength: VALUE_LIMITS.maxReprLength
	})
}

// Assertions shared by the page-level and worker-level runs. Semantic + contract
// correctness, never a byte-exact fixture match.
function assertBuggyTwoSumTrace(result: TraceResult): void {
	expect(result.status).toBe('completed')
	expect(result.actual).toEqual(LIST_0_0)

	const trace = result.trace
	expect(trace).toBeDefined()
	if (trace == null) return
	expect(trace.truncated).toBe(false)
	expect(trace.steps.length).toBeGreaterThan(0)

	// No harness/Pyodide/stdlib frames leaked in: the only function is two_sum,
	// at depth 0, on source lines 1..6.
	for (const step of trace.steps) {
		expect(step.func).toBe('two_sum')
		expect(step.depth).toBe(0)
		expect(step.line).toBeGreaterThanOrEqual(1)
		expect(step.line).toBeLessThanOrEqual(6)
	}

	// First event is the call into two_sum with the inputs present.
	const first = trace.steps[0] as Step
	expect(first.event).toBe('call')
	expect(first.locals.target).toEqual({ kind: 'int', value: 6 })

	// The "aha": i and j both sit on index 0 (3 + 3 == 6).
	const selfPaired = trace.steps.some(
		(s) =>
			s.locals.i?.kind === 'int' &&
			s.locals.i.value === 0 &&
			s.locals.j?.kind === 'int' &&
			s.locals.j.value === 0
	)
	expect(selfPaired).toBe(true)

	// It returns [0, 0].
	const returnStep = trace.steps.find((s) => s.event === 'return')
	expect(returnStep?.returnValue).toEqual(LIST_0_0)
}

test('the tracer runs the buggy Two Sum under real Pyodide (page) and reproduces [0, 0]', async ({
	page
}) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')
	await page.addScriptTag({ url: PYODIDE_SCRIPT_URL })

	const raw = await page.evaluate<string, { program: string; indexURL: string; request: string }>(
		async ({ program, indexURL, request }) => {
			const load = (
				window as unknown as { loadPyodide: (opts: { indexURL: string }) => Promise<unknown> }
			).loadPyodide
			const py = (await load({ indexURL })) as {
				globals: { set: (name: string, value: unknown) => void }
				runPython: (code: string) => string
			}
			py.globals.set('REQUEST_JSON', request)
			return py.runPython(program)
		},
		{ program: TRACE_PROGRAM, indexURL: PYODIDE_INDEX_URL, request: requestJson() }
	)

	const result = traceResultSchema.parse(JSON.parse(raw))
	assertBuggyTwoSumTrace(result)
})

test('the real Blob worker boots Pyodide and returns a contract-valid trace', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')

	const raw = await page.evaluate<unknown, { workerSource: string; request: unknown }>(
		({ workerSource, request }) =>
			new Promise((resolve, reject) => {
				const url = URL.createObjectURL(
					new Blob([workerSource], { type: 'application/javascript' })
				)
				const worker = new Worker(url)
				const timer = setTimeout(() => {
					worker.terminate()
					reject(new Error('worker did not respond in time'))
				}, 170_000)
				worker.onmessage = (event: MessageEvent) => {
					const data = event.data as { type?: string; result?: unknown }
					if (data?.type === 'trace_result') {
						clearTimeout(timer)
						worker.terminate()
						resolve(data.result)
					}
				}
				worker.onerror = (event: ErrorEvent) => {
					clearTimeout(timer)
					reject(new Error(event.message || 'worker error'))
				}
				worker.postMessage({ type: 'trace', request })
			}),
		{
			workerSource: buildWorkerSource(),
			request: {
				code: BUGGY_TWO_SUM,
				entry: 'two_sum',
				input: { args: [[3, 2, 4], 6] },
				limits: { maxSteps: 2000, timeoutMs: 120_000 }
			}
		}
	)

	const result = traceResultSchema.parse(raw)
	assertBuggyTwoSumTrace(result)
})

// ── Official-test run path (untraced correctness) ────────────────────────────

const CORRECT_TWO_SUM = [
	'def two_sum(nums, target):',
	'    for i in range(len(nums)):',
	'        for j in range(i + 1, len(nums)):',
	'            if nums[i] + nums[j] == target:',
	'                return [i, j]',
	'    return []'
].join('\n')

const OFFICIAL_TESTS = [
	{ id: 't1', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
	{ id: 't2', args: [[3, 2, 4], 6], expected: [1, 2] },
	{ id: 't3', args: [[3, 3], 6], expected: [0, 1] }
]

// Post one worker message (run or trace) to a fresh Blob worker and resolve on
// the matching result. Boots Pyodide via importScripts from the CDN.
function postToWorker(page: Page, message: unknown): Promise<unknown> {
	return page.evaluate(
		({ workerSource, msg }: { workerSource: string; msg: unknown }) =>
			new Promise((resolve, reject) => {
				const url = URL.createObjectURL(
					new Blob([workerSource], { type: 'application/javascript' })
				)
				const worker = new Worker(url)
				const timer = setTimeout(() => {
					worker.terminate()
					reject(new Error('worker did not respond in time'))
				}, 170_000)
				worker.onmessage = (event: MessageEvent) => {
					const data = event.data as { type?: string; result?: unknown }
					if (data?.type === 'run_result' || data?.type === 'trace_result') {
						clearTimeout(timer)
						worker.terminate()
						resolve(data.result)
					}
				}
				worker.onerror = (event: ErrorEvent) => {
					clearTimeout(timer)
					reject(new Error(event.message || 'worker error'))
				}
				worker.postMessage(msg)
			}),
		{ workerSource: buildWorkerSource(), msg: message }
	)
}

function runMessage(code: string) {
	return {
		type: 'run',
		request: { code, entry: 'two_sum', tests: OFFICIAL_TESTS, limits: { timeoutMs: 120_000 } }
	}
}

test('run: a correct solution passes every official test', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')
	const result = runResultSchema.parse(await postToWorker(page, runMessage(CORRECT_TWO_SUM)))
	expect(result.status).toBe('completed')
	expect(result.tests.map((t) => t.passed)).toEqual([true, true, true])
	expect(result.tests[0]?.actual).toEqual({
		kind: 'list',
		items: [
			{ kind: 'int', value: 0 },
			{ kind: 'int', value: 1 }
		]
	})
})

test('run: the buggy solution passes t1 and fails t2/t3 with [0, 0]', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')
	const result = runResultSchema.parse(await postToWorker(page, runMessage(BUGGY_TWO_SUM)))
	expect(result.status).toBe('completed')
	const byId = Object.fromEntries(result.tests.map((t) => [t.testId, t] as const))
	expect(byId.t1?.passed).toBe(true)
	expect(byId.t2?.passed).toBe(false)
	expect(byId.t2?.actual).toEqual(LIST_0_0)
	expect(byId.t3?.passed).toBe(false)
})

test('run: a syntax error reports status syntax_error and runs no tests', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')
	const result = runResultSchema.parse(
		await postToWorker(page, runMessage('def two_sum(nums, target)\n    return []'))
	)
	expect(result.status).toBe('syntax_error')
	expect(result.syntaxError?.line).toBeGreaterThanOrEqual(1)
	expect(result.tests).toEqual([])
})

test('run: a missing entry function reports entry_not_found', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')
	const result = runResultSchema.parse(
		await postToWorker(page, runMessage('def solve(nums, target):\n    return []'))
	)
	expect(result.status).toBe('engine_error')
	expect(result.error?.type).toBe('entry_not_found')
})

test('run: a runtime exception fails that test with an error, status still completed', async ({
	page
}) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')
	const result = runResultSchema.parse(
		await postToWorker(page, runMessage('def two_sum(nums, target):\n    return nums[target]'))
	)
	expect(result.status).toBe('completed')
	expect(result.tests[0]?.passed).toBe(false)
	expect(result.tests[0]?.error?.type).toBe('IndexError')
})

test('run then replay: the same source and args reproduce the failing trace', async ({ page }) => {
	test.setTimeout(180_000)
	await page.goto('about:blank')

	const run = runResultSchema.parse(await postToWorker(page, runMessage(BUGGY_TWO_SUM)))
	const failing = run.tests.find((t) => !t.passed)
	expect(failing).toBeDefined()
	const failingArgs = OFFICIAL_TESTS.find((t) => t.id === failing?.testId)?.args
	expect(failingArgs).toBeDefined()

	const traceRaw = await postToWorker(page, {
		type: 'trace',
		request: {
			code: BUGGY_TWO_SUM,
			entry: 'two_sum',
			input: { args: failingArgs },
			limits: { maxSteps: 2000, timeoutMs: 120_000 }
		}
	})
	const trace = traceResultSchema.parse(traceRaw)
	expect(trace.status).toBe('completed')
	expect(trace.actual).toEqual(LIST_0_0)
	expect(trace.trace?.steps.some((s) => s.event === 'return')).toBe(true)
})
