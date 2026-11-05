import test from 'node:test'
import assert from 'node:assert/strict'
import { EXAM_DURATION_MS } from './exam-rules.ts'
import {
	LEADERBOARD_SIZE,
	MAX_TIME_BONUS,
	POINTS_PER_CHALLENGE,
	compareStandings,
	dailyScore,
	isFullPass,
	rankStandings,
	standingFor,
	type StandingInput
} from './scoring.ts'

test('a partial result scores in proportion, with no time bonus', () => {
	assert.equal(dailyScore({ testsPassed: 6, testsTotal: 12, elapsedMs: 60_000 }), 500)
	assert.equal(dailyScore({ testsPassed: 1, testsTotal: 3, elapsedMs: 0 }), 333)
	assert.equal(dailyScore({ testsPassed: 0, testsTotal: 12, elapsedMs: 0 }), 0)
})

test('a full pass earns the base plus a bonus that shrinks with elapsed time', () => {
	assert.equal(
		dailyScore({ testsPassed: 12, testsTotal: 12, elapsedMs: 0 }),
		POINTS_PER_CHALLENGE + MAX_TIME_BONUS
	)
	assert.equal(
		dailyScore({ testsPassed: 12, testsTotal: 12, elapsedMs: EXAM_DURATION_MS / 2 }),
		POINTS_PER_CHALLENGE + MAX_TIME_BONUS / 2
	)
	assert.equal(
		dailyScore({ testsPassed: 12, testsTotal: 12, elapsedMs: EXAM_DURATION_MS }),
		POINTS_PER_CHALLENGE
	)
	// More than the limit (should not happen) is clamped, never negative.
	assert.equal(
		dailyScore({ testsPassed: 12, testsTotal: 12, elapsedMs: EXAM_DURATION_MS * 3 }),
		POINTS_PER_CHALLENGE
	)
})

test('speed can never turn a failing result into a better score than a full pass', () => {
	const slowFull = dailyScore({ testsPassed: 12, testsTotal: 12, elapsedMs: EXAM_DURATION_MS })
	const fastAlmost = dailyScore({ testsPassed: 11, testsTotal: 12, elapsedMs: 0 })
	assert.ok(slowFull > fastAlmost)
})

test('inconsistent or empty results score nothing', () => {
	assert.equal(dailyScore({ testsPassed: 5, testsTotal: 0, elapsedMs: 0 }), 0)
	assert.equal(dailyScore({ testsPassed: 13, testsTotal: 12, elapsedMs: 0 }), 0)
	assert.equal(dailyScore({ testsPassed: -1, testsTotal: 12, elapsedMs: 0 }), 0)
	assert.equal(isFullPass({ testsPassed: 0, testsTotal: 0 }), false)
})

const s = (key: string, over: Partial<StandingInput> = {}): StandingInput => ({
	key,
	score: 1000,
	daysSolved: 1,
	totalMs: 600_000,
	lastSubmittedAt: 1_000,
	...over
})

test('ranking order: score, then days solved, then total time, then earlier final submission', () => {
	const ranked = rankStandings([
		s('lowScore', { score: 900 }),
		s('slowerTime', { totalMs: 700_000 }),
		s('fewerDays', { daysSolved: 0, totalMs: 0 }),
		s('later', { lastSubmittedAt: 2_000 }),
		s('best', { score: 1100 })
	])
	assert.deepEqual(
		ranked.map((r) => [r.entry.key, r.rank]),
		[
			['best', 1],
			['later', 2],
			['slowerTime', 3],
			['fewerDays', 4],
			['lowScore', 5]
		]
	)
})

test('each tie-break step decides when the ones before are equal', () => {
	assert.ok(compareStandings(s('a', { score: 2 }), s('b', { score: 1 })) < 0)
	assert.ok(compareStandings(s('a', { daysSolved: 3 }), s('b', { daysSolved: 2 })) < 0)
	assert.ok(compareStandings(s('a', { totalMs: 5 }), s('b', { totalMs: 9 })) < 0)
	assert.ok(compareStandings(s('a', { lastSubmittedAt: 5 }), s('b', { lastSubmittedAt: 9 })) < 0)
})

test('entries equal on every published criterion SHARE a rank (1, 2, 2, 4), never an arbitrary order', () => {
	const ranked = rankStandings([s('a', { score: 2000 }), s('b'), s('c'), s('d', { score: 500 })])
	assert.deepEqual(
		ranked.map((r) => r.rank),
		[1, 2, 2, 4]
	)
})

test('ranking is deterministic whatever order the input arrives in', () => {
	const input = [s('a', { score: 3 }), s('b', { score: 3 }), s('c', { score: 9 }), s('d')]
	const forward = rankStandings(input).map((r) => [r.entry.key, r.rank])
	const reversed = rankStandings([...input].reverse()).map((r) => [r.entry.key, r.rank])
	assert.deepEqual(forward, reversed)
})

test("a week folds a learner's verified attempts into one standing", () => {
	const row = (
		date: string,
		passed: number,
		total: number,
		score: number,
		ms: number,
		at: number
	) => ({
		key: 'u',
		challengeDate: date,
		testsPassed: passed,
		testsTotal: total,
		score,
		elapsedMs: ms,
		submittedAt: at
	})
	const standing = standingFor('u', [
		row('2026-11-02', 12, 12, 1100, 60_000, 10),
		row('2026-11-03', 6, 12, 500, 90_000, 30),
		row('2026-11-04', 12, 12, 1050, 120_000, 20)
	])
	assert.deepEqual(standing, {
		key: 'u',
		score: 2650,
		daysSolved: 2,
		totalMs: 180_000,
		lastSubmittedAt: 30
	})
})

test('the public board is the top twenty', () => assert.equal(LEADERBOARD_SIZE, 20))
