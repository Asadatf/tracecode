import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	computeLearningStatistics,
	hintKindFromDetail,
	type AttemptRecord,
	type LearningEventRecord,
	type LearningRecords,
	type ReplaySessionRecord
} from './statistics.ts'

const BASE = Date.UTC(2026, 10, 1)

function at(minute: number): Date {
	return new Date(BASE + minute * 60_000)
}

function attempt(
	id: string,
	problemSlug: string,
	minute: number,
	testsPassed: number,
	testsTotal = 4,
	failedTestIds: string[] = []
): AttemptRecord {
	return {
		id,
		problemSlug,
		createdAt: at(minute),
		testsPassed,
		testsTotal,
		allPassed: testsTotal > 0 && testsPassed === testsTotal,
		failedTestIds
	}
}

function event(
	problemSlug: string,
	type: string,
	detail: string | null,
	minute = 0
): LearningEventRecord {
	return { problemSlug, type, detail, createdAt: at(minute) }
}

function session(problemSlug: string, testId: string, attemptId = 'a1'): ReplaySessionRecord {
	return { attemptId, problemSlug, testId, testPassed: false, startedAt: at(0) }
}

function records(partial: Partial<LearningRecords>): LearningRecords {
	return { attempts: [], replaySessions: [], events: [], ...partial }
}

test('an empty history yields zeroed counts and null rates, not NaN', () => {
	const stats = computeLearningStatistics(records({}))
	assert.equal(stats.hasActivity, false)
	assert.deepEqual(stats.problems, [])
	assert.equal(stats.totals.attempts, 0)
	assert.equal(stats.totals.passRate, null)
	assert.equal(stats.totals.meanAttemptsToFirstSolve, null)
	assert.equal(stats.totals.medianAttemptsToFirstSolve, null)
	assert.deepEqual(stats.replay, { linkedSessions: 0, fallbackEvents: 0, total: 0 })
	assert.deepEqual(stats.hints, { observation: 0, reasoning: 0, strategy: 0, unclassified: 0 })
})

test('multiple attempts: totals, pass rate and attempts-to-first-solve', () => {
	const stats = computeLearningStatistics(
		records({
			attempts: [
				attempt('a3', 'two-sum', 3, 4),
				attempt('a1', 'two-sum', 1, 1),
				attempt('a2', 'two-sum', 2, 2),
				attempt('a4', 'two-sum', 4, 4),
				attempt('b1', 'contains-duplicate', 1, 4),
				attempt('c1', 'valid-anagram', 1, 0)
			]
		})
	)
	assert.equal(stats.totals.attempts, 6)
	assert.equal(stats.totals.passedAttempts, 3)
	assert.equal(stats.totals.failedAttempts, 3)
	assert.equal(stats.totals.passRate, 0.5)
	assert.equal(stats.totals.problemsAttempted, 3)
	assert.equal(stats.totals.problemsSolved, 2)
	// two-sum: solved on its 3rd attempt (input order is ignored); contains-duplicate: 1st.
	assert.equal(stats.totals.meanAttemptsToFirstSolve, 2)
	assert.equal(stats.totals.medianAttemptsToFirstSolve, 2)
	assert.deepEqual(
		stats.problems.map((p) => p.problemSlug),
		['contains-duplicate', 'two-sum', 'valid-anagram']
	)
	const twoSum = stats.problems[1]
	assert.deepEqual(
		twoSum.history.map((h) => h.attemptId),
		['a1', 'a2', 'a3', 'a4']
	)
	assert.equal(twoSum.attemptsToFirstSolve, 3)
	assert.equal(stats.problems[2].attemptsToFirstSolve, null)
	assert.equal(stats.problems[2].solved, false)
})

test('attempts sharing a timestamp are ordered by id, so output is deterministic', () => {
	const a = attempt('b', 'two-sum', 1, 4)
	const b = attempt('a', 'two-sum', 1, 1)
	const forward = computeLearningStatistics(records({ attempts: [a, b] }))
	const reverse = computeLearningStatistics(records({ attempts: [b, a] }))
	assert.deepEqual(forward, reverse)
	assert.equal(forward.problems[0].attemptsToFirstSolve, 2)
})

test('improvement trend compares latest vs first measurable pass fraction', () => {
	const stats = computeLearningStatistics(
		records({
			attempts: [
				attempt('i1', 'improving', 1, 1),
				attempt('i2', 'improving', 2, 3),
				attempt('i3', 'improving', 3, 2),
				attempt('i4', 'improving', 4, 4),
				attempt('d1', 'declining', 1, 3),
				attempt('d2', 'declining', 2, 1),
				attempt('f1', 'flat', 1, 2),
				attempt('f2', 'flat', 2, 2),
				attempt('s1', 'single', 1, 2),
				attempt('z1', 'no-tests', 1, 0, 0)
			]
		})
	)
	const bySlug = new Map(stats.problems.map((p) => [p.problemSlug, p]))
	const improving = bySlug.get('improving')
	assert.ok(improving)
	assert.equal(improving.trend, 'improving')
	assert.equal(improving.firstPassFraction, 0.25)
	assert.equal(improving.latestPassFraction, 1)
	assert.equal(improving.bestPassFraction, 1)
	assert.equal(improving.passFractionDelta, 0.75)
	// 1→3 and 2→4 are step improvements; 3→2 is not.
	assert.equal(improving.stepImprovements, 2)
	assert.equal(bySlug.get('declining')?.trend, 'declining')
	assert.equal(bySlug.get('flat')?.trend, 'flat')
	assert.equal(bySlug.get('single')?.trend, 'single_attempt')
	assert.equal(bySlug.get('single')?.passFractionDelta, null)
	const noTests = bySlug.get('no-tests')
	assert.equal(noTests?.history[0].passFraction, null)
	assert.equal(noTests?.trend, 'single_attempt')
	assert.equal(noTests?.solved, false)
})

test('repeat failures count streaks of 2+ and the passes that follow them', () => {
	const stats = computeLearningStatistics(
		records({
			attempts: [
				// fail, fail, pass, fail, pass, fail, fail, fail (unrecovered)
				attempt('1', 'two-sum', 1, 0),
				attempt('2', 'two-sum', 2, 1),
				attempt('3', 'two-sum', 3, 4),
				attempt('4', 'two-sum', 4, 2),
				attempt('5', 'two-sum', 5, 4),
				attempt('6', 'two-sum', 6, 1),
				attempt('7', 'two-sum', 7, 1),
				attempt('8', 'two-sum', 8, 1),
				// single failure then pass: not a repeat failure
				attempt('x1', 'contains-duplicate', 1, 1),
				attempt('x2', 'contains-duplicate', 2, 4)
			]
		})
	)
	const twoSum = stats.problems.find((p) => p.problemSlug === 'two-sum')
	assert.ok(twoSum)
	assert.equal(twoSum.longestFailureStreak, 3)
	assert.equal(twoSum.repeatFailureStreaks, 2)
	assert.equal(twoSum.recoveriesAfterRepeatFailure, 1)
	const dup = stats.problems.find((p) => p.problemSlug === 'contains-duplicate')
	assert.equal(dup?.repeatFailureStreaks, 0)
	assert.equal(stats.totals.problemsWithRepeatFailures, 1)
	assert.equal(stats.totals.repeatFailureStreaks, 2)
	assert.equal(stats.totals.recoveriesAfterRepeatFailure, 1)
})

test('linked replays are not double-counted with their companion event', () => {
	const stats = computeLearningStatistics(
		records({
			attempts: [attempt('a1', 'two-sum', 1, 1)],
			// Two linked replays of t1: each writes a session AND an event.
			replaySessions: [session('two-sum', 't1'), session('two-sum', 't1')],
			events: [
				event('two-sum', 'replay_inspected', 't1'),
				event('two-sum', 'replay_inspected', 't1'),
				// Fallback replays (save not landed): event only.
				event('two-sum', 'replay_inspected', 't1'),
				event('two-sum', 'replay_inspected', 't2')
			]
		})
	)
	assert.deepEqual(stats.replay, { linkedSessions: 2, fallbackEvents: 2, total: 4 })
})

test('a session whose companion event is missing still counts once, never negative', () => {
	const stats = computeLearningStatistics(
		records({
			replaySessions: [session('two-sum', 't1')],
			events: [event('two-sum', 'replay_inspected', 't2')]
		})
	)
	assert.deepEqual(stats.replay, { linkedSessions: 1, fallbackEvents: 1, total: 2 })
	assert.equal(stats.hasActivity, true)
	// Replay without attempts makes a problem visible but not "attempted".
	assert.equal(stats.totals.problemsAttempted, 0)
	assert.equal(stats.totals.passRate, null)
})

test('replay events on different problems with the same test id are kept apart', () => {
	const stats = computeLearningStatistics(
		records({
			replaySessions: [session('two-sum', 't1')],
			events: [
				event('two-sum', 'replay_inspected', 't1'),
				event('contains-duplicate', 'replay_inspected', 't1')
			]
		})
	)
	assert.deepEqual(stats.replay, { linkedSessions: 1, fallbackEvents: 1, total: 2 })
})

test('hint reveals are classified by level into observation, reasoning and strategy', () => {
	const stats = computeLearningStatistics(
		records({
			events: [
				event('two-sum', 'hint_revealed', 'optimise-nested-loops:L1'),
				event('two-sum', 'hint_revealed', 'optimise-nested-loops:L1'),
				event('two-sum', 'hint_revealed', 'optimise-nested-loops:L2'),
				event('two-sum', 'hint_revealed', 'off-by-one:L3'),
				event('contains-duplicate', 'hint_revealed', 'optimise-nested-loops:L1'),
				event('two-sum', 'hint_revealed', 'legacy'),
				event('two-sum', 'hint_revealed', null),
				event('two-sum', 'milestone_reached', 'first_solve')
			]
		})
	)
	assert.deepEqual(stats.hints, { observation: 3, reasoning: 1, strategy: 1, unclassified: 2 })
	// Repeat reveal of the same hint on the same problem counts once here.
	assert.equal(stats.distinctHintsRevealed, 6)
	const twoSum = stats.problems.find((p) => p.problemSlug === 'two-sum')
	assert.deepEqual(twoSum?.hints, { observation: 2, reasoning: 1, strategy: 1, unclassified: 2 })
})

test('hintKindFromDetail only accepts the hintRevealDetail format', () => {
	assert.equal(hintKindFromDetail('p:L1'), 'observation')
	assert.equal(hintKindFromDetail('p:L2'), 'reasoning')
	assert.equal(hintKindFromDetail('p:L3'), 'strategy')
	assert.equal(hintKindFromDetail('p:L4'), null)
	assert.equal(hintKindFromDetail(':L1'), null)
	assert.equal(hintKindFromDetail(null), null)
})
