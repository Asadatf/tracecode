import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot, buildWeekBoard, type WeekUser } from './leaderboard.ts'
import { planConsent } from './consent.ts'
import { LEADERBOARD_SIZE, type VerifiedAttemptRow } from './scoring.ts'

const row = (
	userId: string,
	date: string,
	passed: number,
	total: number,
	score: number,
	elapsedMs = 600_000,
	at = 1000
): VerifiedAttemptRow => ({
	key: userId,
	challengeDate: date,
	testsPassed: passed,
	testsTotal: total,
	score,
	elapsedMs,
	submittedAt: at
})
const user = (id: string, over: Partial<WeekUser> = {}, score = 1000): WeekUser => ({
	userId: id,
	username: `user-${id}`,
	optedIn: true,
	profilePublic: true,
	rows: [row(id, '2026-11-02', 12, 12, score)],
	...over
})

test('only learners who explicitly opted in are listed; a public profile alone is not consent', () => {
	const board = buildWeekBoard(
		[
			user('a', { optedIn: true }, 1100),
			user('b', { optedIn: false, profilePublic: true }, 1000), // public profile, no consent
			user('c', { optedIn: false, profilePublic: false }, 900)
		],
		null
	)
	assert.deepEqual(
		board.entries.map((e) => e.username),
		['user-a']
	)
	assert.equal(board.competitors, 1)
})

test('an opted-in learner with no username cannot be shown under any name, so is not listed', () => {
	const board = buildWeekBoard(
		[user('a', { username: null }), user('b', { username: '' }), user('c')],
		null
	)
	assert.deepEqual(
		board.entries.map((e) => e.username),
		['user-c']
	)
})

test('learners with no verified result are not on the board at all', () => {
	const board = buildWeekBoard([user('a'), user('b', { rows: [] })], null)
	assert.deepEqual(
		board.entries.map((e) => e.username),
		['user-a']
	)
})

test('an empty week is an honest empty board, with no invented rows or ranks', () => {
	assert.deepEqual(buildWeekBoard([], null), { entries: [], competitors: 0, you: null })
	assert.deepEqual(buildWeekBoard([user('a', { rows: [] })], 'a'), {
		entries: [],
		competitors: 0,
		you: null
	})
})

test('the public board shows only the top twenty, ranked by the published rules', () => {
	const many = Array.from({ length: 25 }, (_, i) => user(String(i).padStart(2, '0'), {}, 1000 - i))
	const board = buildWeekBoard(many, null)
	assert.equal(board.entries.length, LEADERBOARD_SIZE)
	assert.deepEqual(
		board.entries.slice(0, 3).map((e) => [e.rank, e.username]),
		[
			[1, 'user-00'],
			[2, 'user-01'],
			[3, 'user-02']
		]
	)
	assert.equal(board.entries.at(-1)?.rank, 20)
	assert.equal(board.competitors, 25)
})

test('ties share a rank and the next rank skips, deterministically', () => {
	const board = buildWeekBoard([user('a', {}, 1000), user('b', {}, 1000), user('c', {}, 900)], null)
	assert.deepEqual(
		board.entries.map((e) => e.rank),
		[1, 1, 3]
	)
})

test('a private learner sees their own rank without being listed or discoverable', () => {
	const board = buildWeekBoard(
		[
			user('a', {}, 1100),
			user('b', {}, 900),
			user('me', { optedIn: false, username: 'hidden-me' }, 1000)
		],
		'me'
	)
	assert.deepEqual(
		board.entries.map((e) => e.username),
		['user-a', 'user-b']
	)
	assert.equal(JSON.stringify(board.entries).includes('hidden-me'), false)
	assert.deepEqual(board.you, {
		rank: 2,
		competitors: 3,
		score: 1000,
		daysSolved: 1,
		totalMs: 600_000,
		listed: false
	})
})

test("a listed learner's own rank is their public rank", () => {
	const board = buildWeekBoard([user('a', {}, 1100), user('me', {}, 1000)], 'me')
	assert.deepEqual(board.you, {
		rank: 2,
		competitors: 2,
		score: 1000,
		daysSolved: 1,
		totalMs: 600_000,
		listed: true
	})
})

test('a viewer with no verified result has no private rank', () => {
	assert.equal(buildWeekBoard([user('a')], 'nobody').you, null)
	assert.equal(buildWeekBoard([user('a')], null).you, null)
})

test('public entries expose exactly username, rank and the verified numbers — no id, email or source', () => {
	const board = buildWeekBoard(
		[user('secret-internal-id', { username: 'visible-name' })],
		'secret-internal-id'
	)
	for (const entry of board.entries)
		assert.deepEqual(Object.keys(entry).sort(), [
			'daysSolved',
			'profilePath',
			'rank',
			'score',
			'totalMs',
			'username'
		])
	const text = JSON.stringify(board)
	for (const forbidden of ['secret-internal-id', 'email', 'source', 'userId', 'attemptId'])
		assert.equal(text.includes(forbidden), false, forbidden)
})

test('a profile link is offered only when that profile is public', () => {
	const board = buildWeekBoard(
		[user('a', { profilePublic: true }, 1100), user('b', { profilePublic: false }, 1000)],
		null
	)
	assert.deepEqual(
		board.entries.map((e) => e.profilePath),
		['/u/user-a', null]
	)
})

test('the archive freezes every verified participant, ranking only those who had opted in', () => {
	const snapshot = buildSnapshot([
		user('a', {}, 1100),
		user('b', { optedIn: false }, 1050),
		user('c', {}, 1000),
		user('d', { rows: [] })
	])
	const byId = Object.fromEntries(snapshot.map((r) => [r.userId, r]))
	assert.deepEqual(Object.keys(byId).sort(), ['a', 'b', 'c'])
	assert.deepEqual([byId.a?.rank, byId.b?.rank, byId.c?.rank], [1, null, 2])
	assert.deepEqual([byId.a?.isPublic, byId.b?.isPublic, byId.c?.isPublic], [true, false, true])
})

test('consent: opting in needs a username; opting out is always allowed; no-ops report no change', () => {
	assert.deepEqual(planConsent({ optIn: false, username: null }, true), {
		ok: false,
		error: 'username_required'
	})
	assert.deepEqual(planConsent({ optIn: false, username: '' }, true), {
		ok: false,
		error: 'username_required'
	})
	assert.deepEqual(planConsent({ optIn: false, username: 'alice' }, true), {
		ok: true,
		change: true
	})
	assert.deepEqual(planConsent({ optIn: true, username: 'alice' }, false), {
		ok: true,
		change: false
	})
	assert.deepEqual(planConsent({ optIn: true, username: null }, false), { ok: true, change: false })
	assert.deepEqual(planConsent({ optIn: true, username: 'alice' }, true), {
		ok: true,
		change: null
	})
	assert.deepEqual(planConsent({ optIn: false, username: 'alice' }, false), {
		ok: true,
		change: null
	})
})
