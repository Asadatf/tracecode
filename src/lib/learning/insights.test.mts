import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeLearningBehavior } from './behavior.ts'
import { generateLearningInsights, type InsightType, type LearningInsight } from './insights.ts'
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

function hint(detail: string, minute: number, slug = 'two-sum'): LearningEventRecord {
	return { problemSlug: slug, type: 'hint_revealed', detail, createdAt: at(minute) }
}

function replayEvent(testId: string, minute: number, slug = 'two-sum'): LearningEventRecord {
	return { problemSlug: slug, type: 'replay_inspected', detail: testId, createdAt: at(minute) }
}

function session(attemptId: string, testId: string, minute: number): ReplaySessionRecord {
	return {
		attemptId,
		problemSlug: 'two-sum',
		testId,
		testPassed: false,
		startedAt: at(minute)
	}
}

function insightsFor(partial: Partial<LearningRecords>) {
	const records: LearningRecords = { attempts: [], replaySessions: [], events: [], ...partial }
	const statistics = computeLearningStatistics(records)
	return generateLearningInsights(statistics, analyzeLearningBehavior(statistics, records))
}

function types(insights: LearningInsight[], slug?: string | null): InsightType[] {
	return insights.filter((i) => slug === undefined || i.problemSlug === slug).map((i) => i.type)
}

function find<T extends InsightType>(
	insights: LearningInsight[],
	type: T,
	slug: string | null = 'two-sum'
): Extract<LearningInsight, { type: T }> {
	const found = insights.find(
		(i): i is Extract<LearningInsight, { type: T }> => i.type === type && i.problemSlug === slug
	)
	assert.ok(found, `expected a ${type} insight for ${slug ?? 'the account'}`)
	return found
}

// Wording that would attribute an outcome to a hint or replay.
const CAUSAL = /\b(caus|because|thanks to|helped|led to|due to|result of|so you)/i

test('a new learner gets one no_activity insight and nothing invented', () => {
	const result = insightsFor({})
	assert.equal(result.hasActivity, false)
	assert.deepEqual(types(result.insights), ['no_activity'])
	assert.equal(result.insights[0]?.evidence, 'observed')
	assert.deepEqual(result.insights[0]?.metrics, {})
})

test('a short history says so and draws no trend', () => {
	const result = insightsFor({
		attempts: [attempt('a1', 1, ['t1', 't2']), attempt('a2', 2, ['t1'])]
	})
	assert.deepEqual(find(result.insights, 'limited_history', null).metrics, {
		submissions: 2,
		minimumForTrends: 3
	})
	// The open failure run is a fact and is reported; a score trend (0.5 → 0.75),
	// a misconception or "no replays" from two data points is not.
	assert.deepEqual(types(result.insights), ['repeated_failure_unresolved', 'limited_history'])
})

test('an open failure run is reported with its rising score; only still-failing tests flag a misconception', () => {
	const result = insightsFor({
		attempts: [
			attempt('a1', 1, ['t1', 't2', 't3']),
			attempt('a2', 2, ['t1', 't2']),
			attempt('a3', 3, ['t1', 't2']),
			attempt('a4', 4, ['t1'])
		]
	})
	const unresolved = find(result.insights, 'repeated_failure_unresolved')
	assert.equal(unresolved.evidence, 'observed')
	assert.equal(unresolved.precision, 'exact')
	assert.deepEqual(unresolved.metrics, {
		trailingFailures: 4,
		latestTestsPassed: 3,
		latestTestsTotal: 4,
		passFractionDelta: 0.5
	})
	assert.match(unresolved.message, /last 4 submissions on two-sum did not pass/)
	assert.deepEqual(find(result.insights, 'score_improving').metrics, {
		firstPassFraction: 0.25,
		latestPassFraction: 0.75,
		passFractionDelta: 0.5,
		stepImprovements: 2
	})
	// t1 still fails (4 in a row); t2 failed 3 in a row but passes now → no insight.
	const misconceptions = result.insights.filter((i) => i.type === 'persistent_test_failure')
	assert.deepEqual(
		misconceptions.map((i) => [i.metrics, i.evidence]),
		[[{ testId: 't1', consecutiveFailures: 4, failedAttempts: 4 }, 'inferred']]
	)
	assert.ok(!types(result.insights).includes('first_solve'))
	assert.ok(!types(result.insights).includes('recovered_after_repeated_failure'))
	// Unresolved outranks the improvement.
	assert.ok(
		result.insights.indexOf(unresolved) <
			result.insights.indexOf(find(result.insights, 'score_improving'))
	)
})

test('a regression after solving replaces the declining trend', () => {
	const result = insightsFor({
		attempts: [attempt('a1', 1, []), attempt('a2', 2, ['t1', 't2', 't3'])]
	})
	const regression = find(result.insights, 'regression_after_solve')
	assert.deepEqual(regression.metrics, { failuresAfterFirstSolve: 1, latestAttemptPassed: false })
	assert.match(regression.message, /including the latest/)
	assert.ok(!types(result.insights).includes('score_declining'))
	assert.ok(!types(result.insights).includes('score_improving'))
})

test('a declining score on a still-unsolved problem is reported from 3+ submissions', () => {
	const result = insightsFor({
		attempts: [
			attempt('a1', 1, ['t1']),
			attempt('a2', 2, ['t1', 't2']),
			attempt('a3', 3, ['t1', 't2', 't3'])
		]
	})
	assert.deepEqual(find(result.insights, 'score_declining').metrics, {
		firstPassFraction: 0.75,
		latestPassFraction: 0.25,
		passFractionDelta: -0.5
	})
})

test('recovery after repeated failure and the first solve are both reported, not the redundant trend', () => {
	const result = insightsFor({
		attempts: [
			attempt('a1', 1, ['t1', 't2']),
			attempt('a2', 2, ['t1']),
			attempt('a3', 3, ['t1']),
			attempt('a4', 4, [])
		]
	})
	assert.deepEqual(types(result.insights, 'two-sum'), [
		'recovered_after_repeated_failure',
		'independent_first_solve'
	])
	assert.deepEqual(find(result.insights, 'recovered_after_repeated_failure').metrics, {
		recoveries: 1,
		longestFailureStreak: 3
	})
})

test('first-solve insights are exclusive: independent (inferred, approximate) or plain (observed)', () => {
	const result = insightsFor({
		attempts: [
			attempt('a1', 1, []),
			attempt('b1', 1, ['t1'], 'contains-duplicate'),
			attempt('b2', 3, [], 'contains-duplicate')
		],
		events: [hint('opt:L1', 2, 'contains-duplicate')]
	})
	const independent = find(result.insights, 'independent_first_solve')
	assert.equal(independent.evidence, 'inferred')
	// "No hint before the solve" rests on event timing.
	assert.equal(independent.precision, 'approximate')
	assert.match(independent.message, /recorded before/)
	assert.deepEqual(types(result.insights, 'contains-duplicate'), ['first_solve'])
	assert.equal(find(result.insights, 'first_solve', 'contains-duplicate').evidence, 'observed')
})

test('a Strategy reveal before the first solve is inferred, approximate and not a causal claim', () => {
	const result = insightsFor({
		attempts: [attempt('a1', 1, ['t1']), attempt('a2', 5, [])],
		events: [hint('diag:L1', 2), hint('diag:L2', 3), hint('diag:L3', 4)]
	})
	const strategy = find(result.insights, 'strategy_before_first_solve')
	assert.equal(strategy.evidence, 'inferred')
	assert.equal(strategy.precision, 'approximate')
	assert.deepEqual(strategy.metrics, { attemptsToFirstSolve: 2, strategyReveals: 1 })
	assert.ok(!types(result.insights).includes('independent_first_solve'))
	assert.deepEqual(find(result.insights, 'hint_usage', null).metrics, {
		observation: 1,
		reasoning: 1,
		strategy: 1,
		unclassified: 0,
		distinctHintsRevealed: 3
	})
})

test('replay counts are exact when all linked and approximate once fallbacks are involved', () => {
	const linkedOnly = insightsFor({
		attempts: [attempt('a1', 1, ['t1']), attempt('a2', 3, [])],
		replaySessions: [session('a1', 't1', 2)],
		events: [replayEvent('t1', 2)]
	})
	const exact = find(linkedOnly.insights, 'replay_engagement', null)
	assert.equal(exact.precision, 'exact')
	assert.doesNotMatch(exact.message, /about/)
	assert.deepEqual(exact.metrics, {
		replays: 1,
		linkedSessions: 1,
		fallbackEvents: 0,
		failedAttemptsReplayed: 1,
		failedAttempts: 1
	})

	const withFallback = insightsFor({
		attempts: [attempt('a1', 1, ['t1'])],
		events: [replayEvent('t1', 2)]
	})
	const approx = find(withFallback.insights, 'replay_engagement', null)
	assert.equal(approx.precision, 'approximate')
	assert.match(approx.message, /about 1 replay/)
})

test('missing replays are only reported once there are enough failures to mean something', () => {
	const three = insightsFor({
		attempts: [attempt('a1', 1, ['t1']), attempt('a2', 2, ['t2']), attempt('a3', 3, ['t3'])]
	})
	assert.equal(find(three.insights, 'replay_not_used', null).metrics.failedAttempts, 3)
	const two = insightsFor({ attempts: [attempt('a1', 1, ['t1']), attempt('a2', 2, ['t1'])] })
	assert.ok(!types(two.insights).includes('replay_not_used'))
})

test('every insight is well-formed, uniquely keyed, and never attributes an outcome to guidance', () => {
	const result = insightsFor({
		attempts: [
			attempt('a1', 1, ['t1']),
			attempt('a2', 3, ['t1']),
			attempt('a3', 5, []),
			attempt('a4', 6, ['t2']),
			attempt('b1', 1, ['t1'], 'contains-duplicate'),
			attempt('b2', 2, ['t1'], 'contains-duplicate'),
			attempt('b3', 3, ['t1'], 'contains-duplicate')
		],
		replaySessions: [session('a1', 't1', 2)],
		events: [replayEvent('t1', 2), replayEvent('t1', 4), hint('diag:L3', 4), hint('x', 4)]
	})
	const keys = new Set<string>()
	for (const i of result.insights) {
		assert.ok(i.message.length > 0 && i.message.length <= 200, i.message)
		assert.doesNotMatch(i.message, CAUSAL)
		assert.ok(i.evidence === 'observed' || i.evidence === 'inferred')
		const key = `${i.type}|${i.problemSlug ?? ''}|${JSON.stringify(i.metrics)}`
		assert.ok(!keys.has(key), `duplicate insight ${key}`)
		keys.add(key)
	}
	const priorities = result.insights.map((i) => i.priority)
	assert.deepEqual(
		priorities,
		[...priorities].sort((a, b) => b - a)
	)
})

test('output is deterministic regardless of record order', () => {
	const attempts = [
		attempt('a1', 1, ['t1']),
		attempt('a2', 2, ['t1']),
		attempt('a3', 3, []),
		attempt('b1', 1, ['t1'], 'contains-duplicate')
	]
	const events = [hint('d:L1', 2), replayEvent('t1', 2), hint('d:L2', 2)]
	assert.deepEqual(
		insightsFor({ attempts, events }),
		insightsFor({ attempts: [...attempts].reverse(), events: [...events].reverse() })
	)
})
