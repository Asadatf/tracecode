import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	BACKFILL_SESSION_LIMIT,
	IDLE_POLL_MS,
	MAX_IDLE_POLLS,
	createSessionBudget,
	runCodeFeatureBackfill,
	type BackfillDeps,
	type BudgetStorage
} from './code-feature-backfill.ts'
import { analysisError, type AstResult, type CodeFeatures } from '../trace/code-features.ts'
import { backfillCandidateQuery } from './code-feature-queries.ts'

const FEATURES: CodeFeatures = {
	v: 1,
	loops: { for: 1, while: 0, maxDepth: 1 },
	comprehensions: 0,
	branches: 0,
	returns: 1,
	defs: 1,
	recursion: false,
	usesDict: false,
	usesSet: false,
	usesSorted: false,
	builtinCalls: [],
	nodeCount: 10,
	lineCount: 3
}
const OK: AstResult = { status: 'ok', features: FEATURES }

function memoryStorage(): BudgetStorage & { data: Map<string, string> } {
	const data = new Map<string, string>()
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v)
	}
}

function attempts(n: number) {
	return Array.from({ length: n }, (_, i) => ({ attemptId: `a${i}`, source: `x = ${i}` }))
}

// A harness that records every dependency call.
function harness(over: Partial<BackfillDeps> & { stored?: number } = {}) {
	const storage = memoryStorage()
	const budget = createSessionBudget(() => storage)
	const calls = { list: [] as number[], analyze: [] as string[], save: [] as string[], sleeps: 0 }
	const saved = new Set<string>()
	const deps: BackfillDeps = {
		budget,
		list: async (limit) => {
			calls.list.push(limit)
			return attempts(25).filter((a) => !saved.has(a.attemptId))
		},
		analyze: async (source) => {
			calls.analyze.push(source)
			return OK
		},
		save: async (attemptId) => {
			calls.save.push(attemptId)
			if (saved.has(attemptId)) return false
			saved.add(attemptId)
			return true
		},
		isIdle: () => true,
		isReady: () => true,
		sleep: async () => {
			calls.sleeps += 1
		},
		isCancelled: () => false,
		...over
	}
	return { deps, calls, storage, saved }
}

test('a session analyses at most 10 attempts, even if the server returns more', async () => {
	const { deps, calls } = harness()
	const summary = await runCodeFeatureBackfill(deps)
	assert.equal(BACKFILL_SESSION_LIMIT, 10)
	assert.deepEqual(calls.list, [10], 'asks for exactly the remaining budget')
	assert.equal(calls.analyze.length, 10)
	assert.equal(summary.listed, 10)
	assert.equal(summary.saved, 10)
	assert.equal(summary.stoppedBecause, null)
})

test('the budget is shared across passes in one session: a second pass does nothing', async () => {
	const { deps, calls } = harness()
	await runCodeFeatureBackfill(deps)
	const again = await runCodeFeatureBackfill(deps)
	assert.equal(again.stoppedBecause, 'no_budget')
	assert.equal(calls.list.length, 1, 'no second server read')
	assert.equal(calls.analyze.length, 10)
})

test('a partly used budget asks for only the remainder', async () => {
	const { deps, calls } = harness()
	deps.budget.consume(7)
	await runCodeFeatureBackfill(deps)
	assert.deepEqual(calls.list, [3])
	assert.equal(calls.analyze.length, 3)
})

test('a reload in the same tab keeps the budget (sessionStorage); a new tab starts fresh', async () => {
	const first = harness()
	await runCodeFeatureBackfill(first.deps)
	const reloaded = createSessionBudget(() => first.storage)
	assert.equal(reloaded.remaining(), 0)
	const newTab = createSessionBudget(() => memoryStorage())
	assert.equal(newTab.remaining(), 10)
})

test('unavailable or throwing storage degrades to a per-page budget, never unbounded', async () => {
	const throwing: BudgetStorage = {
		getItem: () => {
			throw new Error('blocked')
		},
		setItem: () => {
			throw new Error('blocked')
		}
	}
	for (const getStorage of [() => null, () => throwing]) {
		const budget = createSessionBudget(getStorage)
		assert.equal(budget.remaining(), 10)
		budget.consume(4)
		assert.equal(budget.remaining(), 6)
		budget.consume(6)
		assert.equal(budget.remaining(), 0)
		budget.consume(5)
		assert.equal(budget.remaining(), 0)
	}
	assert.equal(
		createSessionBudget(() => ({ getItem: () => 'garbage', setItem() {} })).remaining(),
		10
	)
})

test('saving is idempotent: attempts already stored are not listed again, and a lost race is not counted', async () => {
	const { deps, saved } = harness()
	saved.add('a0') // another tab already stored this one; server still listed it
	const summary = await runCodeFeatureBackfill({
		...deps,
		list: async () => attempts(3)
	})
	assert.equal(summary.analyzed, 3)
	assert.equal(summary.saved, 2, 'save() returned false for a0 (already set)')
})

test('final failures store a marker (never re-listed); the parseable ones store features', async () => {
	const results: AstResult[] = [
		{ status: 'syntax_error', syntaxError: { message: 'invalid syntax', line: 1, column: 0 } },
		analysisError('source too large to analyze', true),
		OK
	]
	let i = 0
	const stored: Array<[string, unknown]> = []
	const { deps } = harness({
		analyze: async () => results[i++] ?? OK,
		save: async (id, value) => {
			stored.push([id, value])
			return true
		}
	})
	const summary = await runCodeFeatureBackfill({ ...deps, list: async () => attempts(3) })
	assert.deepEqual(stored, [
		['a0', { v: 1, unanalyzable: 'syntax_error' }],
		['a1', { v: 1, unanalyzable: 'not_analyzable' }],
		['a2', FEATURES]
	])
	assert.deepEqual([summary.marked, summary.saved, summary.failed], [2, 1, 0])
	assert.equal(summary.stoppedBecause, null)
	assert.equal(deps.budget.remaining(), 7)
})

test('a transient failure (timeout, dead worker) stores nothing and ends the pass', async () => {
	for (const failure of [analysisError('analysis timed out'), analysisError('wasm trap')]) {
		let analysed = 0
		const { deps, calls } = harness({
			analyze: async () => {
				analysed += 1
				return failure
			}
		})
		const summary = await runCodeFeatureBackfill({ ...deps, list: async () => attempts(5) })
		assert.equal(summary.stoppedBecause, 'engine_failed')
		assert.equal(summary.failed, 1)
		assert.equal(calls.save.length, 0, 'a retryable failure must not poison the attempt')
		assert.equal(analysed, 1, 'the pass stops instead of burning through the budget')
		assert.equal(deps.budget.remaining(), 9, 'only the failed attempt used a slot')
	}
})

test('a throwing analyzer or saver is contained and ends the pass without throwing', async () => {
	const thrower = harness({
		analyze: async () => {
			throw new Error('worker blew up')
		}
	})
	const a = await runCodeFeatureBackfill({ ...thrower.deps, list: async () => attempts(4) })
	assert.equal(a.stoppedBecause, 'engine_failed')
	const saver = harness({
		save: async () => {
			throw new Error('server action failed')
		}
	})
	const b = await runCodeFeatureBackfill({ ...saver.deps, list: async () => attempts(4) })
	assert.equal(b.stoppedBecause, 'engine_failed')
	assert.equal(b.failed, 1)
})

test('it never boots Pyodide: not ready means no server read and no analysis', async () => {
	const cold = harness({ isReady: () => false })
	const summary = await runCodeFeatureBackfill(cold.deps)
	assert.equal(summary.stoppedBecause, 'not_ready')
	assert.deepEqual([cold.calls.list.length, cold.calls.analyze.length], [0, 0])
	assert.equal(cold.deps.budget.remaining(), 10, 'nothing spent')
})

test('a worker recycled mid-pass (e.g. after a timeout) stops the pass instead of rebooting', async () => {
	let ready = true
	let analysed = 0
	const { deps } = harness({
		isReady: () => ready,
		analyze: async () => {
			analysed += 1
			ready = false // the engine dropped its worker after this item
			return OK
		}
	})
	const summary = await runCodeFeatureBackfill({ ...deps, list: async () => attempts(5) })
	assert.equal(summary.stoppedBecause, 'not_ready')
	assert.equal(analysed, 1)
	assert.equal(summary.saved, 1)
})

// Regression: oversized (or otherwise never-analysable) attempts used to be
// re-listed, re-downloaded and re-parsed in EVERY session, and since the newest
// ten were always the same ten, the ordinary attempts behind them were never
// reached. Driven through the real query builder over an in-memory table, with a
// fresh browser session (new budget) each time.
test('regression: never-analysable attempts are processed once and cannot starve the rest', async () => {
	const MISSING = Symbol('DbNull')
	const U = 'u1'
	type Row = {
		id: string
		userId: string
		status: string
		createdAt: number
		big: boolean
		stored: unknown
	}
	const rows: Row[] = [
		...Array.from({ length: 12 }, (_, i) => ({
			id: `big-${i}`,
			userId: U,
			status: 'completed',
			createdAt: 100 + i,
			big: true,
			stored: MISSING as unknown
		})),
		...Array.from({ length: 8 }, (_, i) => ({
			id: `ok-${i}`,
			userId: U,
			status: 'completed',
			createdAt: i,
			big: false,
			stored: MISSING as unknown
		}))
	]
	const bigSeen = new Map<string, number>()
	for (let session = 1; session <= 4; session++) {
		await runCodeFeatureBackfill({
			budget: createSessionBudget(() => null), // a fresh tab every time
			list: async (limit) => {
				const q = backfillCandidateQuery(U, limit, MISSING)
				return rows
					.filter((r) => r.userId === U && r.stored === MISSING && r.status !== 'syntax_error')
					.sort((x, y) => y.createdAt - x.createdAt)
					.slice(0, q.take)
					.map((r) => ({ attemptId: r.id, source: r.big ? 'BIG' : 'ok' }))
			},
			analyze: async (source) =>
				source === 'BIG' ? analysisError('source too large to analyze', true) : OK,
			save: async (id, value) => {
				const row = rows.find((r) => r.id === id)
				if (row == null || row.stored !== MISSING) return false
				row.stored = value
				if (row.big) bigSeen.set(id, (bigSeen.get(id) ?? 0) + 1)
				return true
			},
			isIdle: () => true,
			isReady: () => true,
			sleep: async () => {},
			isCancelled: () => false
		})
	}
	assert.equal(
		rows.filter((r) => !r.big && r.stored !== MISSING).length,
		8,
		'ordinary attempts reached'
	)
	assert.ok(
		rows.filter((r) => r.big).every((r) => r.stored !== MISSING),
		'each oversized attempt is marked'
	)
	assert.ok(
		[...bigSeen.values()].every((n) => n === 1),
		'and marked exactly once, never reprocessed'
	)
})

test('a failed or signed-out listing ends quietly without spending budget', async () => {
	for (const list of [
		async () => null,
		async () => {
			throw new Error('network')
		}
	]) {
		const { deps } = harness({ list })
		const summary = await runCodeFeatureBackfill(deps)
		assert.equal(summary.stoppedBecause, 'list_failed')
		assert.equal(deps.budget.remaining(), 10)
	}
	const { deps } = harness({ list: async () => [] })
	const empty = await runCodeFeatureBackfill(deps)
	assert.deepEqual(
		{ listed: empty.listed, analyzed: empty.analyzed, stoppedBecause: empty.stoppedBecause },
		{ listed: 0, analyzed: 0, stoppedBecause: null }
	)
})

test('it waits while a learner’s own Run is in flight, and gives up if that never ends', async () => {
	let busyFor = 3
	const waits = harness({
		isIdle: () => busyFor-- <= 0,
		sleep: async (ms) => {
			assert.equal(ms, IDLE_POLL_MS)
		}
	})
	const done = await runCodeFeatureBackfill({ ...waits.deps, list: async () => attempts(2) })
	assert.equal(done.analyzed, 2)

	const stuck = harness({ isIdle: () => false })
	const summary = await runCodeFeatureBackfill({ ...stuck.deps, list: async () => attempts(2) })
	assert.equal(summary.stoppedBecause, 'busy')
	assert.equal(summary.analyzed, 0, 'nothing analysed, nothing spent')
	assert.equal(stuck.calls.sleeps, MAX_IDLE_POLLS)
	assert.equal(stuck.deps.budget.remaining(), 10)
})

test('cancellation (the page unmounting) stops the pass between attempts', async () => {
	let cancelled = false
	const { deps, calls } = harness({
		isCancelled: () => cancelled,
		analyze: async (source) => {
			cancelled = true
			void source
			return OK
		}
	})
	const summary = await runCodeFeatureBackfill({ ...deps, list: async () => attempts(5) })
	assert.equal(summary.stoppedBecause, 'cancelled')
	assert.equal(summary.analyzed, 1)
	assert.equal(calls.save.length, 1, 'the in-flight attempt still finishes')
})
