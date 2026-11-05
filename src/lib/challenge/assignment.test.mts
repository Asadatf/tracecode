import test from 'node:test'
import assert from 'node:assert/strict'
import {
	CHALLENGE_EPOCH,
	pickProblem,
	resolveChallenge,
	type ChallengeCatalogStore,
	type PinnedChallenge
} from './assignment.ts'
import { problemForDate } from '../problems/daily-problem.ts'

// A table with the real semantics: a unique key, insert-if-absent, never overwrite.
function fakeCatalog() {
	const rows = new Map<string, PinnedChallenge>()
	let pins = 0
	const store: ChallengeCatalogStore = {
		async find(date) {
			await new Promise((r) => setImmediate(r))
			return rows.get(date) ?? null
		},
		async pin(date, problemSlug) {
			await new Promise((r) => setImmediate(r))
			if (!rows.has(date)) {
				rows.set(date, { challengeDate: date, problemSlug })
				pins += 1
			}
		}
	}
	return { store, rows, pins: () => pins }
}

const SIX = [
	'two-sum',
	'contains-duplicate',
	'valid-anagram',
	'move-zeroes',
	'binary-search',
	'valid-parentheses'
]
const TODAY = '2026-11-10'

test('the first assignment is the same deterministic hash the calendar always used', () => {
	assert.equal(pickProblem(SIX, '2026-11-05'), problemForDate(SIX, '2026-11-05'))
})

test('an assignment is pinned once and survives the catalogue changing', async () => {
	const { store } = fakeCatalog()
	const first = await resolveChallenge(store, '2026-11-05', TODAY, SIX)
	assert.equal(first.status, 'ok')
	const slug = first.status === 'ok' ? first.problemSlug : ''
	// The catalogue grows (and the hash would now point elsewhere for many dates).
	const grown = [...SIX, 'new-problem-7', 'new-problem-8', 'new-problem-9']
	const shrunk = SIX.slice(0, 3)
	for (const catalogue of [grown, shrunk, []]) {
		const again = await resolveChallenge(store, '2026-11-05', TODAY, catalogue)
		assert.deepEqual(again, { status: 'ok', date: '2026-11-05', problemSlug: slug, kind: 'past' })
	}
})

test('for a date never pinned, a different catalogue would assign differently — pinning is what makes history stable', async () => {
	const differing = Array.from(
		{ length: 60 },
		(_, i) => `2026-09-${String((i % 28) + 1).padStart(2, '0')}`
	).find((d) => problemForDate(SIX, d) !== problemForDate([...SIX, 'a', 'b', 'c'], d))
	assert.ok(differing, 'the hash is catalogue-dependent, so pinning matters')
	const { store } = fakeCatalog()
	const pinned = await resolveChallenge(store, differing!, TODAY, SIX)
	const later = await resolveChallenge(store, differing!, TODAY, [...SIX, 'a', 'b', 'c'])
	assert.deepEqual(later, pinned)
})

test('one challenge per date, shared by everyone; concurrent first requests agree on one row', async () => {
	const { store, rows, pins } = fakeCatalog()
	const results = await Promise.all(
		Array.from({ length: 10 }, () => resolveChallenge(store, TODAY, TODAY, SIX))
	)
	assert.equal(new Set(results.map((r) => (r.status === 'ok' ? r.problemSlug : r.status))).size, 1)
	assert.equal(rows.size, 1)
	assert.equal(pins(), 1)
})

test('today is live, earlier days are past, and the future is locked', async () => {
	const { store, rows } = fakeCatalog()
	assert.equal((await resolveChallenge(store, TODAY, TODAY, SIX)).status === 'ok', true)
	const live = await resolveChallenge(store, TODAY, TODAY, SIX)
	assert.equal(live.status === 'ok' && live.kind, 'live')
	const past = await resolveChallenge(store, '2026-11-09', TODAY, SIX)
	assert.equal(past.status === 'ok' && past.kind, 'past')
	assert.deepEqual(await resolveChallenge(store, '2026-11-11', TODAY, SIX), { status: 'locked' })
	assert.deepEqual(await resolveChallenge(store, '2099-01-01', TODAY, SIX), { status: 'locked' })
	assert.equal(
		rows.has('2026-11-11'),
		false,
		'a locked date is never created, so it cannot be previewed'
	)
})

test('UTC day boundary: 23:59:59Z and 00:00:00Z are different days', async () => {
	const { store } = fakeCatalog()
	const justBefore = await resolveChallenge(store, '2026-11-10', '2026-11-10', SIX)
	const nextDayStillLocked = await resolveChallenge(store, '2026-11-11', '2026-11-10', SIX)
	const nextDayOpen = await resolveChallenge(store, '2026-11-11', '2026-11-11', SIX)
	assert.equal(justBefore.status, 'ok')
	assert.equal(nextDayStillLocked.status, 'locked')
	assert.equal(nextDayOpen.status, 'ok')
})

test('invalid dates and an empty eligible list fail safely', async () => {
	const { store } = fakeCatalog()
	for (const bad of ['2026-02-30', 'abc', '', '2026-1-1'])
		assert.deepEqual(await resolveChallenge(store, bad, TODAY, SIX), { status: 'invalid' })
	assert.deepEqual(await resolveChallenge(store, '2026-11-01', TODAY, []), {
		status: 'unavailable'
	})
})

test('no challenge exists before launch: such a date reads and creates nothing', async () => {
	const { store, rows, pins } = fakeCatalog()
	assert.equal(CHALLENGE_EPOCH, '2026-10-30')
	for (const early of ['1900-01-01', '2020-06-15', '2026-10-29']) {
		assert.deepEqual(await resolveChallenge(store, early, TODAY, SIX), { status: 'before_launch' })
	}
	assert.equal(rows.size, 0)
	assert.equal(pins(), 0)
	// The launch day itself is a normal past day.
	assert.equal((await resolveChallenge(store, CHALLENGE_EPOCH, TODAY, SIX)).status, 'ok')
})
