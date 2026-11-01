import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeLearningBehavior, type ProblemBehavior } from './behavior.ts'
import {
	computeLearningStatistics,
	type AttemptRecord,
	type LearningEventRecord,
	type LearningRecords,
	type ReplaySessionRecord
} from './statistics.ts'

const BASE = Date.UTC(2026, 10, 1)
const TOTAL = 4

function at(minute: number): Date {
	return new Date(BASE + minute * 60_000)
}

// failed: the testIds that failed; testsPassed follows from it.
function attempt(id: string, minute: number, failed: string[], slug = 'two-sum'): AttemptRecord {
	return {
		id,
		problemSlug: slug,
		createdAt: at(minute),
		testsPassed: TOTAL - failed.length,
		testsTotal: TOTAL,
		allPassed: failed.length === 0,
		failedTestIds: failed
	}
}

function hint(detail: string | null, minute: number, slug = 'two-sum'): LearningEventRecord {
	return { problemSlug: slug, type: 'hint_revealed', detail, createdAt: at(minute) }
}

function replayEvent(testId: string, minute: number, slug = 'two-sum'): LearningEventRecord {
	return { problemSlug: slug, type: 'replay_inspected', detail: testId, createdAt: at(minute) }
}

function session(
	attemptId: string,
	testId: string,
	minute: number,
	slug = 'two-sum'
): ReplaySessionRecord {
	return { attemptId, problemSlug: slug, testId, testPassed: false, startedAt: at(minute) }
}

// A linked replay as recordReplaySession writes it: session + event.
function linked(attemptId: string, testId: string, minute: number, slug = 'two-sum') {
	return {
		session: session(attemptId, testId, minute, slug),
		event: replayEvent(testId, minute, slug)
	}
}

function analyze(partial: Partial<LearningRecords>) {
	const records: LearningRecords = { attempts: [], replaySessions: [], events: [], ...partial }
	return analyzeLearningBehavior(computeLearningStatistics(records), records)
}

function problem(behavior: ReturnType<typeof analyze>, slug = 'two-sum'): ProblemBehavior {
	const found = behavior.problems.find((p) => p.problemSlug === slug)
	assert.ok(found, `expected behaviour for ${slug}`)
	return found
}

test('an empty history yields no problems and a zeroed summary', () => {
	const behavior = analyze({})
	assert.deepEqual(behavior.problems, [])
	assert.equal(behavior.summary.failToPassTransitions, 0)
	assert.equal(behavior.summary.transitionsWithNeither, 0)
	assert.ok(Object.values(behavior.summary.problemsByPattern).every((n) => n === 0))
	assert.ok(Object.values(behavior.summary.signals).every((n) => n === 0))
})

test('failure patterns are classified per problem', () => {
	const behavior = analyze({
		attempts: [
			attempt('n1', 1, [], 'none'),
			attempt('i1', 1, ['t1'], 'isolated'),
			attempt('i2', 2, [], 'isolated'),
			attempt('i3', 3, ['t2'], 'isolated'),
			attempt('r1', 1, ['t1'], 'recovered'),
			attempt('r2', 2, ['t1'], 'recovered'),
			attempt('r3', 3, [], 'recovered'),
			attempt('u1', 1, [], 'unresolved'),
			attempt('u2', 2, ['t1'], 'unresolved'),
			attempt('u3', 3, ['t1'], 'unresolved')
		],
		events: [hint('p:L1', 1, 'hint-only')]
	})
	const pattern = (slug: string) => problem(behavior, slug).observed.failurePattern.pattern
	assert.equal(pattern('none'), 'no_failures')
	assert.equal(pattern('isolated'), 'isolated_failures')
	assert.equal(pattern('recovered'), 'repeat_failures_recovered')
	assert.equal(pattern('unresolved'), 'repeat_failures_unresolved')
	assert.equal(pattern('hint-only'), 'no_attempts')
	assert.equal(problem(behavior, 'unresolved').observed.failurePattern.trailingFailures, 2)
	assert.equal(problem(behavior, 'recovered').observed.failurePattern.trailingFailures, 0)
	assert.deepEqual(behavior.summary.problemsByPattern, {
		no_attempts: 1,
		no_failures: 1,
		isolated_failures: 1,
		repeat_failures_recovered: 1,
		repeat_failures_unresolved: 1
	})
	// 'unresolved' passed first, then failed twice: the open run is a struggle
	// signal alongside the regression one.
	assert.deepEqual(
		problem(behavior, 'unresolved').inferred.map((s) => s.code),
		['independent_first_solve', 'unresolved_struggle', 'regression_after_solve']
	)
	assert.deepEqual(
		problem(behavior, 'unresolved').inferred.find((s) => s.code === 'unresolved_struggle'),
		{ code: 'unresolved_struggle', basis: 'inferred', evidence: { trailingFailures: 2 } }
	)
	assert.ok(behavior.problems.every((p) => p.inferred.every((s) => s.basis === 'inferred')))
})

test('recurring test failures flag a possible misconception at 3 consecutive failures', () => {
	const behavior = analyze({
		attempts: [
			attempt('a1', 1, ['t1', 't2']),
			attempt('a2', 2, ['t1']),
			attempt('a3', 3, ['t1', 't2']),
			attempt('a4', 4, ['t3'])
		]
	})
	const p = problem(behavior)
	assert.deepEqual(p.observed.failurePattern.recurringTestFailures, [
		{
			testId: 't1',
			failedAttempts: 3,
			longestConsecutiveFailures: 3,
			failingInLatestAttempt: false
		},
		{
			testId: 't2',
			failedAttempts: 2,
			longestConsecutiveFailures: 1,
			failingInLatestAttempt: false
		}
	])
	const misconceptions = p.inferred.filter((s) => s.code === 'possible_persistent_misconception')
	assert.deepEqual(misconceptions, [
		{
			code: 'possible_persistent_misconception',
			basis: 'inferred',
			evidence: { testId: 't1', longestConsecutiveFailures: 3, failingInLatestAttempt: false }
		}
	])
})

test('score changes count drops, flat steps, extremes and failures after the first solve', () => {
	const behavior = analyze({
		attempts: [
			attempt('a1', 1, ['t1', 't2', 't3']), // 0.25
			attempt('a2', 2, ['t1']), // 0.75  +0.5
			attempt('a3', 3, ['t1']), // 0.75  flat
			attempt('a4', 4, []), // 1.00  +0.25 (first solve)
			attempt('a5', 5, ['t1', 't2']) // 0.50  −0.5
		]
	})
	const p = problem(behavior)
	assert.deepEqual(p.observed.scoreChanges, {
		transitions: 4,
		drops: 1,
		unchanged: 1,
		largestGain: 0.5,
		largestDrop: 0.5,
		failuresAfterFirstSolve: 1
	})
	assert.ok(
		p.inferred.some(
			(s) => s.code === 'regression_after_solve' && s.evidence.failuresAfterFirstSolve === 1
		)
	)
})

test('hint reveals are split around the first solve and laddered per prompt', () => {
	const behavior = analyze({
		attempts: [attempt('a1', 1, ['t1']), attempt('a2', 10, [])],
		events: [
			hint('diag:L1', 2),
			hint('diag:L2', 3),
			hint('diag:L3', 4),
			hint('diag:L1', 5), // repeat reveal: still one ladder level
			hint('opt:L2', 10), // same instant as the solve → counts as after
			hint('legacy', 11)
		]
	})
	const hints = problem(behavior).observed.hintReveals
	assert.deepEqual(hints.beforeFirstSolve, {
		observation: 2,
		reasoning: 1,
		strategy: 1,
		unclassified: 0
	})
	assert.deepEqual(hints.afterFirstSolve, {
		observation: 0,
		reasoning: 1,
		strategy: 0,
		unclassified: 1
	})
	assert.equal(hints.strategyBeforeFirstSolve, true)
	assert.equal(hints.attemptsAfterFirstReveal, 1)
	assert.deepEqual(hints.ladders, [
		{
			promptId: 'diag',
			levelsRevealed: [1, 2, 3],
			highestLevel: 3,
			skippedLevels: [],
			revealedInOrder: true
		},
		{
			promptId: 'opt',
			levelsRevealed: [2],
			highestLevel: 2,
			skippedLevels: [1],
			revealedInOrder: false
		}
	])
	assert.ok(
		problem(behavior).inferred.some(
			(s) =>
				s.code === 'first_solve_after_strategy_reveal' &&
				s.evidence.strategyRevealsBeforeFirstSolve === 1
		)
	)
})

test('a ladder revealed out of order is reported as such; unsolved problems never claim a guided solve', () => {
	const behavior = analyze({
		attempts: [attempt('a1', 1, ['t1'])],
		events: [hint('diag:L2', 2), hint('diag:L1', 3), hint('diag:L3', 4)]
	})
	const p = problem(behavior)
	assert.equal(p.observed.hintReveals.ladders[0]?.revealedInOrder, false)
	assert.deepEqual(p.observed.hintReveals.ladders[0]?.skippedLevels, [])
	assert.equal(p.observed.hintReveals.strategyBeforeFirstSolve, false)
	assert.equal(p.observed.hintReveals.beforeFirstSolve.strategy, 1)
	assert.deepEqual(p.inferred, [])
})

test('replay timing relates replays to the attempts they replay and to the first solve', () => {
	const r1 = linked('a1', 't1', 2)
	const r2 = linked('a1', 't1', 3)
	const r3 = linked('a3', 't1', 7)
	const behavior = analyze({
		attempts: [attempt('a1', 1, ['t1']), attempt('a2', 4, ['t1']), attempt('a3', 6, [])],
		replaySessions: [r1.session, r2.session, r3.session],
		// a fallback replay (event only) after the solve
		events: [r1.event, r2.event, r3.event, replayEvent('t2', 8)]
	})
	assert.deepEqual(problem(behavior).observed.replayTiming, {
		linkedOnFailedAttempts: 2,
		linkedOnPassedAttempts: 1,
		failedAttemptsReplayed: 1,
		failedAttemptReplayRate: 0.5,
		replaysBeforeFirstSolve: 2,
		replaysAfterFirstSolve: 2,
		attemptsAfterFirstReplay: 2
	})
})

test('fail-to-pass transitions record co-occurring hints and replays without attributing the pass', () => {
	const r = linked('a2', 't1', 3)
	const behavior = analyze({
		attempts: [
			attempt('a1', 1, ['t1']),
			attempt('a2', 2, ['t1', 't2']),
			attempt('a3', 5, []),
			attempt('b1', 1, ['t1'], 'contains-duplicate'),
			attempt('b2', 2, [], 'contains-duplicate')
		],
		replaySessions: [r.session],
		events: [
			hint('diag:L1', 1), // at the first failure → inside the window
			r.event,
			hint('diag:L2', 5) // same instant as the pass → outside
		]
	})
	assert.deepEqual(problem(behavior).observed.failToPass, [
		{
			failedAttemptIds: ['a1', 'a2'],
			passedAttemptId: 'a3',
			scoreBeforePass: 0.5,
			coOccurring: {
				hintReveals: { observation: 1, reasoning: 0, strategy: 0, unclassified: 0 },
				replays: 1
			}
		}
	])
	assert.equal(behavior.summary.failToPassTransitions, 2)
	assert.equal(behavior.summary.transitionsWithHintReveal, 1)
	assert.equal(behavior.summary.transitionsWithReplay, 1)
	assert.equal(behavior.summary.transitionsWithNeither, 1)
})

test('independent first solve requires no hint or replay before the solve', () => {
	const behavior = analyze({
		attempts: [
			attempt('a1', 1, ['t1']),
			attempt('a2', 2, []),
			attempt('b1', 1, [], 'contains-duplicate')
		],
		events: [hint('opt:L1', 3), replayEvent('t1', 1, 'contains-duplicate')]
	})
	assert.deepEqual(problem(behavior).inferred, [
		{ code: 'independent_first_solve', basis: 'inferred', evidence: { attemptsToFirstSolve: 2 } }
	])
	// Replay at the same instant as the solving attempt counts as after it.
	assert.deepEqual(problem(behavior, 'contains-duplicate').inferred, [
		{ code: 'independent_first_solve', basis: 'inferred', evidence: { attemptsToFirstSolve: 1 } }
	])
	assert.equal(behavior.summary.signals.independent_first_solve, 2)
})

test('output does not depend on record order', () => {
	const r = linked('a1', 't1', 2)
	const attempts = [attempt('a1', 1, ['t1']), attempt('a2', 3, ['t1']), attempt('a3', 4, [])]
	const events = [hint('d:L1', 2), hint('d:L2', 2), r.event, hint('x', 5)]
	const forward = analyze({ attempts, replaySessions: [r.session], events })
	const reverse = analyze({
		attempts: [...attempts].reverse(),
		replaySessions: [r.session],
		events: [...events].reverse()
	})
	assert.deepEqual(forward, reverse)
})
