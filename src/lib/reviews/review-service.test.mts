import test from 'node:test'
import assert from 'node:assert/strict'
import { recordReviewPass, type ReviewRow, type ReviewStore } from './review-service.ts'

// An in-memory table that behaves like Postgres where it matters: insert-if-absent on
// a unique key, and ONE conditional update that only matches while the row is still
// at the stage the caller saw. Every method yields, so concurrent callers interleave.
function fakeStore() {
	const rows = new Map<string, ReviewRow & { reminded: boolean }>()
	const key = (u: string, p: string) => `${u}|${p}`
	const tick = () => new Promise((r) => setImmediate(r))
	const store: ReviewStore = {
		async find(u, p) {
			await tick()
			const row = rows.get(key(u, p))
			return row == null ? null : { ...row }
		},
		async create(u, p, state) {
			await tick()
			if (rows.has(key(u, p))) return false
			rows.set(key(u, p), { ...state, completed: false, reminded: true })
			return true
		},
		async advance(u, p, from, to, completed) {
			await tick()
			const row = rows.get(key(u, p))
			if (row == null || row.completed) return false
			if (row.reviewsDone !== from.reviewsDone || row.dueDay !== from.dueDay) return false
			Object.assign(row, to, { completed, reminded: false })
			return true
		}
	}
	return { store, rows }
}

const at = (iso: string) => new Date(iso)

test('first qualifying pass enrols; a repeat the same day changes nothing', async () => {
	const { store, rows } = fakeStore()
	assert.equal(
		await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z')),
		'enrolled'
	)
	assert.equal(
		await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:05:00Z')),
		'unchanged'
	)
	assert.equal(rows.get('u1|two-sum')?.dueDay, '2026-11-11')
})

test('the whole cycle: 1 day, 3 days, 7 days, then complete and inert', async () => {
	const { store, rows } = fakeStore()
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z'))
	assert.equal(
		await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-11T09:00:00Z')),
		'advanced'
	)
	assert.equal(rows.get('u1|two-sum')?.dueDay, '2026-11-14')
	assert.equal(
		await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-14T00:00:00Z')),
		'advanced'
	)
	assert.equal(rows.get('u1|two-sum')?.dueDay, '2026-11-21')
	assert.equal(
		await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-21T23:59:59Z')),
		'completed'
	)
	assert.equal(rows.get('u1|two-sum')?.completed, true)
	assert.equal(
		await recordReviewPass(store, 'u1', 'two-sum', at('2027-01-01T00:00:00Z')),
		'unchanged'
	)
})

test('an ordinary pass before the due day does not skip or advance', async () => {
	const { store, rows } = fakeStore()
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z'))
	for (let i = 0; i < 5; i++) {
		assert.equal(
			await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T20:00:00Z')),
			'unchanged'
		)
	}
	assert.equal(rows.get('u1|two-sum')?.reviewsDone, 0)
})

test('duplicate requests the same day advance exactly one stage', async () => {
	const { store, rows } = fakeStore()
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z'))
	const when = at('2026-11-11T10:00:00Z')
	const results = []
	for (let i = 0; i < 4; i++) results.push(await recordReviewPass(store, 'u1', 'two-sum', when))
	assert.deepEqual(results, ['advanced', 'unchanged', 'unchanged', 'unchanged'])
	assert.equal(rows.get('u1|two-sum')?.reviewsDone, 1)
})

test('simultaneous requests: exactly one wins, in both enrolment and advance', async () => {
	const enrol = fakeStore()
	const enrolled = await Promise.all(
		Array.from({ length: 6 }, () =>
			recordReviewPass(enrol.store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z'))
		)
	)
	assert.equal(enrolled.filter((r) => r === 'enrolled').length, 1)

	const adv = fakeStore()
	await recordReviewPass(adv.store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z'))
	const advanced = await Promise.all(
		Array.from({ length: 6 }, () =>
			recordReviewPass(adv.store, 'u1', 'two-sum', at('2026-11-11T09:00:00Z'))
		)
	)
	assert.equal(advanced.filter((r) => r === 'advanced').length, 1)
	assert.equal(adv.rows.get('u1|two-sum')?.reviewsDone, 1)
})

test('a successful pass clears the "reminded" mark so the next stage is announced afresh', async () => {
	const { store, rows } = fakeStore()
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z'))
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-11T09:00:00Z'))
	assert.equal(rows.get('u1|two-sum')?.reminded, false)
})

test('learners and problems are independent', async () => {
	const { store, rows } = fakeStore()
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z'))
	await recordReviewPass(store, 'u2', 'two-sum', at('2026-11-10T10:00:00Z'))
	await recordReviewPass(store, 'u1', 'binary-search', at('2026-11-10T11:00:00Z'))
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-11T09:00:00Z'))
	assert.equal(rows.get('u1|two-sum')?.reviewsDone, 1)
	assert.equal(rows.get('u2|two-sum')?.reviewsDone, 0)
	assert.equal(rows.get('u1|binary-search')?.reviewsDone, 0)
})

test('a problem solved before this feature has no row: nothing is due until the next qualifying pass', async () => {
	const { store, rows } = fakeStore()
	assert.equal(rows.size, 0)
	assert.equal(
		await recordReviewPass(store, 'u1', 'valid-anagram', at('2026-11-20T09:00:00Z')),
		'enrolled'
	)
	assert.equal(rows.get('u1|valid-anagram')?.dueDay, '2026-11-21')
})

test("replaying an earlier attempt later cannot advance a later stage (judged at the attempt's own time)", async () => {
	const { store, rows } = fakeStore()
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z')) // enrol, due 11-11
	const attemptX = at('2026-11-11T09:00:00Z')
	assert.equal(await recordReviewPass(store, 'u1', 'two-sum', attemptX), 'advanced') // stage 1, next due 11-14
	// The tracking for the SAME attempt is retried or replayed days later. It is still
	// evaluated at X's own time, so the stage that fell due after X is not due for it.
	for (let i = 0; i < 3; i++) {
		assert.equal(await recordReviewPass(store, 'u1', 'two-sum', attemptX), 'unchanged')
	}
	assert.equal(rows.get('u1|two-sum')?.reviewsDone, 1)
	// A genuinely new attempt on the due day still advances it.
	assert.equal(
		await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-14T10:00:00Z')),
		'advanced'
	)
	assert.equal(rows.get('u1|two-sum')?.reviewsDone, 2)
})

test('a replayed enrolment attempt after the row moved on changes nothing', async () => {
	const { store, rows } = fakeStore()
	const first = at('2026-11-10T09:00:00Z')
	await recordReviewPass(store, 'u1', 'two-sum', first)
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-11T09:00:00Z'))
	assert.equal(await recordReviewPass(store, 'u1', 'two-sum', first), 'unchanged')
	assert.equal(rows.get('u1|two-sum')?.reviewsDone, 1)
})

test('an older and a newer attempt processed out of order: only the one that is due advances', async () => {
	const { store, rows } = fakeStore()
	await recordReviewPass(store, 'u1', 'two-sum', at('2026-11-10T09:00:00Z')) // due 11-11
	const early = at('2026-11-10T20:00:00Z') // before due
	const due = at('2026-11-11T08:00:00Z')
	const results = await Promise.all([
		recordReviewPass(store, 'u1', 'two-sum', early),
		recordReviewPass(store, 'u1', 'two-sum', due)
	])
	assert.deepEqual(results.slice().sort(), ['advanced', 'unchanged'])
	assert.equal(rows.get('u1|two-sum')?.reviewsDone, 1)
})
