import test from 'node:test'
import assert from 'node:assert/strict'
import {
	CHALLENGE_RESULT_KIND,
	buildChallengeResult,
	challengeResultCopy,
	challengeResultKey,
	parseChallengeResult
} from './notification.ts'
import { toNotificationView } from '../notifications/queries.ts'

const titles = { 'binary-search': 'Binary Search' }

test('the notification payload is small, versioned and validated', () => {
	const payload = buildChallengeResult('2026-11-05', 'binary-search', 5, 13)
	assert.deepEqual(payload, {
		v: 1,
		date: '2026-11-05',
		problemSlug: 'binary-search',
		testsPassed: 5,
		testsTotal: 13
	})
	assert.deepEqual(parseChallengeResult(payload), payload)
	// Impossible or malformed counts and dates are refused, never stored.
	assert.equal(buildChallengeResult('2026-11-05', 'x', 14, 13), null)
	assert.equal(buildChallengeResult('2026-11-05', 'x', 1, 0), null)
	assert.equal(buildChallengeResult('tomorrow', 'x', 1, 2), null)
	assert.equal(parseChallengeResult({ ...payload, extra: 1 }), null)
})

test('one notification per learner per challenge date', () => {
	assert.equal(challengeResultKey('2026-11-05'), 'challenge:2026-11-05')
})

test('the words state the verified counts and nothing else: no score, rank or judgement', () => {
	const fail = challengeResultCopy(
		buildChallengeResult('2026-11-05', 'binary-search', 5, 13)!,
		titles
	)
	assert.equal(fail.body, 'Binary Search: 5 of 13 tests passed.')
	const pass = challengeResultCopy(
		buildChallengeResult('2026-11-05', 'binary-search', 13, 13)!,
		titles
	)
	assert.equal(pass.body, 'Binary Search: 13 of 13 tests passed — challenge complete.')
	for (const copy of [fail, pass]) {
		assert.equal(copy.href, '/challenge/2026-11-05')
		assert.doesNotMatch(JSON.stringify(copy), /score|rank|leaderboard|better|worse|failed/i)
	}
})

test('the inbox renders it, and a payload that does not parse becomes a neutral pointer', () => {
	const view = toNotificationView({
		id: 'n1',
		kind: CHALLENGE_RESULT_KIND,
		payload: buildChallengeResult('2026-11-05', 'binary-search', 13, 13),
		readAt: null,
		createdAt: new Date('2026-11-05T06:00:00Z')
	})
	assert.equal(view.title, 'Your daily challenge result is ready')
	assert.match(view.body, /13 of 13 tests passed/)
	assert.equal(view.href, '/challenge/2026-11-05')
	assert.equal(view.read, false)
	const broken = toNotificationView({
		id: 'n2',
		kind: CHALLENGE_RESULT_KIND,
		payload: { nonsense: true },
		readAt: null,
		createdAt: new Date()
	})
	assert.equal(broken.href, '/problems')
	// An unknown problem still renders (a generic name), never a broken link.
	const unknown = challengeResultCopy(buildChallengeResult('2026-11-05', 'gone', 1, 2)!, titles)
	assert.match(unknown.body, /Today’s problem: 1 of 2/)
})
