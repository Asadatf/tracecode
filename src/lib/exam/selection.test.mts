import test from 'node:test'
import assert from 'node:assert/strict'
import {
	SELECTION_VERSION,
	daysSince,
	historyFor,
	openExam,
	secureRandomInt,
	selectProblem,
	weightOf,
	type OpenStore,
	type PoolCandidate,
	type RandomInt,
	type SelectionRecord
} from './selection.ts'

// specs/features/daily-exam.md AC7, AC50, AC51 — selection@1 (ADR-0012).

// A seeded generator so weighted-distribution checks are reproducible. Production uses
// crypto.randomInt (secureRandomInt).
function seeded(seed: number): RandomInt {
	let a = seed >>> 0
	return (max) => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296
		return Math.floor(r * max)
	}
}

const addDays = (date: string, n: number) =>
	new Date(Date.parse(`${date}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10)

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)

// Run the real selection day after day, feeding each choice back into the history exactly as
// daily_exams would.
function simulate(poolSize: number, days: number, seed = 1) {
	const pool = ids(poolSize)
	const random = seeded(seed)
	const past: { examDate: string; problemId: string }[] = []
	const records: SelectionRecord[] = []
	const repeats: boolean[] = []
	const start = '2026-12-01'
	for (let d = 0; d < days; d += 1) {
		const date = addDays(start, d)
		const r = selectProblem(date, historyFor(date, pool, past), random)
		assert.equal(r.kind, 'selected')
		if (r.kind !== 'selected') throw new Error('unreachable')
		past.push({ examDate: date, problemId: r.problemId })
		records.push(r.record)
		repeats.push(r.isRepeat)
	}
	return { seq: past.map((p) => p.problemId), records, repeats }
}

const neverYesterday = (seq: string[]) => seq.every((id, i) => i === 0 || seq[i - 1] !== id)

test('the weight formula: (1 + min(daysSince, 30)) / (1 + 3 × priorUses), in micro-units', () => {
	assert.equal(weightOf(null, 0), 31_000_000, 'never used')
	assert.equal(weightOf(45, 0), 31_000_000, 'recency capped at 30 days')
	assert.equal(weightOf(9, 1), Math.floor((1_000_000 * 10) / 4))
	assert.equal(weightOf(1, 10), Math.floor((1_000_000 * 2) / 31))
	assert.ok(weightOf(0, 1_000_000) >= 1)
	assert.equal(daysSince('2026-12-08', '2026-12-01'), 7)
	assert.equal(daysSince('2026-12-08', null), null)
})

test('an empty pool is the only case that cannot select', () => {
	assert.deepEqual(selectProblem('2026-12-01', [], seeded(1)), { kind: 'empty' })
})

test('pool of 1: the same problem daily, cooldown 0, labelled a repeat from day 2', () => {
	const { seq, records, repeats } = simulate(1, 10)
	assert.ok(seq.every((id) => id === 'p01'))
	// Day 1: never used, so the full 7-day cooldown is satisfiable; from day 2 it must relax to 0.
	assert.equal(records[0]?.cooldownDays, 7)
	assert.ok(records.slice(1).every((r) => r.cooldownDays === 0))
	assert.deepEqual(repeats, [false, ...Array(9).fill(true)])
})

test("pool of 2: yesterday's problem is never repeated (strict alternation)", () => {
	const { seq, records } = simulate(2, 60)
	assert.ok(neverYesterday(seq))
	assert.ok(records.every((r) => r.cooldownDays >= 1))
})

test('pool of 3: never yesterday, cooldown relaxed below 7', () => {
	const { seq, records } = simulate(3, 120, 7)
	assert.ok(neverYesterday(seq))
	assert.ok(records.slice(3).every((r) => r.cooldownDays >= 1 && r.cooldownDays < 7))
	assert.equal(new Set(seq).size, 3)
})

test('pool of 7: the cooldown relaxes to 6 and every problem comes round once a week', () => {
	const { seq, records } = simulate(7, 70, 3)
	assert.ok(neverYesterday(seq))
	// Once all have been used, no problem is free of a 7-day cooldown, so k relaxes to 6 and only the
	// problem used exactly 7 days ago qualifies: a strict weekly rotation.
	for (let i = 7; i < seq.length; i += 1) assert.equal(seq[i], seq[i - 7])
	assert.ok(records.slice(7).every((r) => r.cooldownDays === 6))
})

test('pool of 20: the 7-day cooldown always holds and use stays balanced', () => {
	const { seq, records } = simulate(20, 400, 11)
	for (let i = 0; i < seq.length; i += 1)
		for (let j = Math.max(0, i - 7); j < i; j += 1) assert.notEqual(seq[i], seq[j], `day ${i}`)
	assert.ok(records.every((r) => r.cooldownDays === 7))
	const counts = new Map<string, number>()
	for (const id of seq) counts.set(id, (counts.get(id) ?? 0) + 1)
	assert.equal(counts.size, 20)
	const values = [...counts.values()]
	assert.ok(Math.max(...values) - Math.min(...values) <= 8, `spread ${values.join(',')}`)
})

test('the cooldown takes the LARGEST feasible k (relaxing one day at a time)', () => {
	const date = '2026-12-20'
	// Last used 3, 5 and 6 days ago: k = 7 and 6 are empty; k = 5 keeps only the 6-day one.
	const pool: PoolCandidate[] = [
		{ id: 'a', priorUses: 1, lastUsed: '2026-12-17' },
		{ id: 'b', priorUses: 1, lastUsed: '2026-12-15' },
		{ id: 'c', priorUses: 1, lastUsed: '2026-12-14' }
	]
	const r = selectProblem(date, pool, seeded(5))
	assert.equal(r.kind, 'selected')
	if (r.kind === 'selected') {
		assert.equal(r.record.cooldownDays, 5)
		assert.equal(r.problemId, 'c')
	}
})

test('observed frequencies match the weights (seeded draw, 40,000 trials)', () => {
	const date = '2026-12-20'
	const pool: PoolCandidate[] = [
		{ id: 'new', priorUses: 0, lastUsed: null }, // weight 31
		{ id: 'old', priorUses: 1, lastUsed: '2026-11-20' }, // (1+30)/4 = 7.75
		{ id: 'mid', priorUses: 2, lastUsed: '2026-12-10' }, // (1+10)/7 ≈ 1.571
		{ id: 'busy', priorUses: 5, lastUsed: '2026-12-01' } // (1+19)/16 = 1.25
	]
	const random = seeded(42)
	const counts = new Map<string, number>()
	const trials = 40_000
	let record: SelectionRecord | null = null
	for (let i = 0; i < trials; i += 1) {
		const r = selectProblem(date, pool, random)
		if (r.kind !== 'selected') throw new Error('unexpected')
		record = r.record
		counts.set(r.problemId, (counts.get(r.problemId) ?? 0) + 1)
	}
	if (record == null) throw new Error('unexpected')
	// The record carries exactly the formula's weights, not just any weights.
	assert.deepEqual(Object.fromEntries(record.candidates.map((c) => [c.id, c.weight])), {
		busy: 1_250_000,
		mid: 1_571_428,
		new: 31_000_000,
		old: 7_750_000
	})
	for (const c of record.candidates) {
		const expected = c.weight / record.total
		const observed = (counts.get(c.id) ?? 0) / trials
		assert.ok(Math.abs(observed - expected) < 0.01, `${c.id}: ${observed} vs ${expected}`)
	}
})

test('selection is a pure function of the history and the draw (repeatable, auditable)', () => {
	const date = '2026-12-20'
	const pool = historyFor(date, ids(5), [{ examDate: '2026-12-19', problemId: 'p01' }])
	const fixed: RandomInt = (max) => Math.floor(max / 2)
	const a = selectProblem(date, pool, fixed)
	const b = selectProblem(date, [...pool].reverse(), fixed)
	assert.deepEqual(a, b, 'input order does not matter')
	if (a.kind === 'selected') {
		assert.equal(a.record.version, SELECTION_VERSION)
		assert.ok(
			a.record.candidates.every((c) => c.id !== 'p01'),
			"yesterday's excluded"
		)
		assert.equal(a.record.draw, Math.floor(a.record.total / 2))
	}
})

test('history counts only exams strictly before the exam being opened', () => {
	const h = historyFor(
		'2026-12-10',
		['a', 'b'],
		[
			{ examDate: '2026-12-01', problemId: 'a' },
			{ examDate: '2026-12-05', problemId: 'a' },
			{ examDate: '2026-12-10', problemId: 'b' },
			{ examDate: '2026-12-11', problemId: 'b' },
			{ examDate: '2026-12-03', problemId: null }
		]
	)
	assert.deepEqual(h, [
		{ id: 'a', priorUses: 2, lastUsed: '2026-12-05' },
		{ id: 'b', priorUses: 0, lastUsed: null }
	])
})

test('a bad random source is refused, and the default is the server CSPRNG', () => {
	const pool = historyFor('2026-12-20', ids(3), [])
	assert.throws(() => selectProblem('2026-12-20', pool, () => -1), /bad random draw/)
	assert.throws(() => selectProblem('2026-12-20', pool, (max) => max), /bad random draw/)
	for (let i = 0; i < 200; i += 1) {
		const n = secureRandomInt(10)
		assert.ok(Number.isInteger(n) && n >= 0 && n < 10)
	}
	assert.equal(selectProblem('2026-12-20', pool).kind, 'selected')
})

// ---- openExam: race-safe, idempotent, recoverable ----------------------------------------

function fakeExams(pool: string[], past: { examDate: string; problemId: string }[] = []) {
	const exams = new Map<
		string,
		{ status: string; problemId: string | null; isRepeat: boolean; record: SelectionRecord | null }
	>()
	let failNextOpen = false
	const store: OpenStore = {
		async read(date) {
			const e = exams.get(date)
			return e == null ? null : { status: e.status, problemId: e.problemId, isRepeat: e.isRepeat }
		},
		async loadPool(date) {
			await new Promise<void>((r) => setImmediate(r))
			return historyFor(date, pool, past)
		},
		async tryOpen(date, problemId, isRepeat, record) {
			if (failNextOpen) {
				failNextOpen = false
				throw new Error('connection reset')
			}
			const e = exams.get(date)
			if (e == null || e.status !== 'scheduled' || e.problemId != null) return false
			Object.assign(e, { status: 'open', problemId, isRepeat, record })
			return true
		},
		async tryCancelEmpty(date) {
			const e = exams.get(date)
			if (e == null || e.status !== 'scheduled' || e.problemId != null) return false
			e.status = 'cancelled'
			return true
		}
	}
	return {
		store,
		exams,
		schedule: (date: string) =>
			exams.set(date, { status: 'scheduled', problemId: null, isRepeat: false, record: null }),
		failNextOpen: () => {
			failNextOpen = true
		}
	}
}

test('concurrent openers store exactly one problem and all report it', async () => {
	const f = fakeExams(ids(20))
	f.schedule('2026-12-20')
	const results = await Promise.all(
		Array.from({ length: 8 }, (_, i) => openExam(f.store, '2026-12-20', seeded(100 + i)))
	)
	const stored = f.exams.get('2026-12-20')?.problemId
	assert.ok(stored != null)
	assert.equal(results.filter((r) => r.kind === 'open' && r.won).length, 1)
	assert.ok(results.every((r) => r.kind === 'open' && r.problemId === stored))
})

test('repeated opening (a job retry) never changes the stored problem, even after the pool changes', async () => {
	const f = fakeExams(ids(5))
	f.schedule('2026-12-20')
	const first = await openExam(f.store, '2026-12-20', seeded(1))
	assert.equal(first.kind, 'open')
	for (let i = 0; i < 20; i += 1) {
		const again = await openExam(f.store, '2026-12-20', seeded(1000 + i))
		assert.deepEqual(
			again.kind === 'open' && again.problemId,
			first.kind === 'open' && first.problemId
		)
		assert.equal(again.kind === 'open' && again.won, false)
	}
})

test('recovery after a failure between choosing and writing: nothing stored, the retry opens it', async () => {
	const f = fakeExams(ids(5))
	f.schedule('2026-12-20')
	f.failNextOpen()
	await assert.rejects(openExam(f.store, '2026-12-20', seeded(1)), /connection reset/)
	assert.equal(f.exams.get('2026-12-20')?.problemId, null)
	assert.equal(f.exams.get('2026-12-20')?.status, 'scheduled')
	const retry = await openExam(f.store, '2026-12-20', seeded(2))
	assert.equal(retry.kind, 'open')
	assert.equal(f.exams.get('2026-12-20')?.status, 'open')
})

test('only a genuinely empty pool cancels, and a cancelled exam stays cancelled', async () => {
	const f = fakeExams([])
	f.schedule('2026-12-20')
	assert.deepEqual(await openExam(f.store, '2026-12-20', seeded(1)), { kind: 'cancelled' })
	assert.deepEqual(await openExam(f.store, '2026-12-20', seeded(2)), { kind: 'cancelled' })
	// A pool of one never cancels, even when that problem ran yesterday.
	const one = fakeExams(['p01'], [{ examDate: '2026-12-19', problemId: 'p01' }])
	one.schedule('2026-12-20')
	const r = await openExam(one.store, '2026-12-20', seeded(3))
	assert.equal(r.kind === 'open' && r.problemId, 'p01')
	assert.equal(r.kind === 'open' && r.isRepeat, true)
})

test('an exam that is not scheduled (missing, or already past) is never opened', async () => {
	const f = fakeExams(ids(3))
	assert.deepEqual(await openExam(f.store, '2026-12-20'), { kind: 'not_openable', status: null })
	f.exams.set('2026-12-21', { status: 'grading', problemId: null, isRepeat: false, record: null })
	assert.deepEqual(await openExam(f.store, '2026-12-21'), {
		kind: 'not_openable',
		status: 'grading'
	})
})
