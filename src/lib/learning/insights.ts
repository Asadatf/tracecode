import type { LearningBehavior, ProblemBehavior } from './behavior'
import type { LearningStatistics, ProblemStatistics } from './statistics'

// Structured learner insights (M6.3): a pure, deterministic projection of the
// M6.1 statistics and M6.2 behaviour into short, typed, evidence-backed
// statements for M7. It derives nothing new from raw records — every metric is
// read from the analytics it is given.
//
// Each insight says how far its claim can be trusted:
// - `evidence`: 'observed' (read straight off the records) or 'inferred' (a
//   rule-based hypothesis about understanding).
// - `precision`: 'exact', or 'approximate' when it rests on count-based replay
//   dedup or on event timing relative to attempts — the records can't
//   establish those exactly, so the message hedges ("about", "recorded before").
// No insight says a hint or replay caused an outcome.

export type InsightEvidence = 'observed' | 'inferred'
export type InsightPrecision = 'exact' | 'approximate'

// Fewer data points than this support no trend or pattern claim: account-wide
// (limited_history), per problem (score trends need this many measurable
// submissions), or for replay_not_used (this many failed submissions).
const MIN_SUBMISSIONS_FOR_TRENDS = 3

export interface InsightMetrics {
	no_activity: Record<string, never>
	limited_history: { submissions: number; minimumForTrends: number }
	repeated_failure_unresolved: {
		trailingFailures: number
		latestTestsPassed: number
		latestTestsTotal: number
		passFractionDelta: number | null
	}
	persistent_test_failure: { testId: string; consecutiveFailures: number; failedAttempts: number }
	regression_after_solve: { failuresAfterFirstSolve: number; latestAttemptPassed: boolean }
	score_declining: {
		firstPassFraction: number
		latestPassFraction: number
		passFractionDelta: number
	}
	recovered_after_repeated_failure: { recoveries: number; longestFailureStreak: number }
	strategy_before_first_solve: { attemptsToFirstSolve: number; strategyReveals: number }
	score_improving: {
		firstPassFraction: number
		latestPassFraction: number
		passFractionDelta: number
		stepImprovements: number
	}
	independent_first_solve: { attemptsToFirstSolve: number }
	first_solve: { attemptsToFirstSolve: number }
	replay_engagement: {
		replays: number
		linkedSessions: number
		fallbackEvents: number
		failedAttemptsReplayed: number
		failedAttempts: number
	}
	replay_not_used: { failedAttempts: number }
	hint_usage: {
		observation: number
		reasoning: number
		strategy: number
		unclassified: number
		distinctHintsRevealed: number
	}
}

export type InsightType = keyof InsightMetrics

// Higher first. Unresolved, current difficulty outranks history; account-wide
// summaries come last.
const PRIORITY: Record<InsightType, number> = {
	no_activity: 100,
	repeated_failure_unresolved: 90,
	persistent_test_failure: 85,
	regression_after_solve: 80,
	score_declining: 70,
	recovered_after_repeated_failure: 60,
	strategy_before_first_solve: 55,
	score_improving: 50,
	independent_first_solve: 45,
	first_solve: 40,
	replay_engagement: 30,
	replay_not_used: 25,
	hint_usage: 20,
	limited_history: 10
}

interface InsightOf<T extends InsightType> {
	type: T
	// null for account-wide insights.
	problemSlug: string | null
	message: string
	metrics: InsightMetrics[T]
	evidence: InsightEvidence
	precision: InsightPrecision
	priority: number
}

export type LearningInsight = { [T in InsightType]: InsightOf<T> }[InsightType]

type InsightDraft = { [T in InsightType]: Omit<InsightOf<T>, 'priority'> }[InsightType]

export interface LearningInsights {
	hasActivity: boolean
	// Sorted by priority (desc), then problemSlug (account-wide first), then type.
	insights: LearningInsight[]
}

function insight(draft: InsightDraft): LearningInsight {
	return { ...draft, priority: PRIORITY[draft.type] }
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? '' : 's'}`
}

function percent(fraction: number): string {
	return `${Math.round(fraction * 100)}%`
}

function problemInsights(stats: ProblemStatistics, behavior: ProblemBehavior): LearningInsight[] {
	const slug = stats.problemSlug
	const { failurePattern, scoreChanges, hintReveals } = behavior.observed
	const signals = new Set(behavior.inferred.map((s) => s.code))
	const latest = stats.history.at(-1)
	const out: LearningInsight[] = []
	if (latest == null) return out

	const unresolved = failurePattern.pattern === 'repeat_failures_unresolved'
	const regressed = scoreChanges.failuresAfterFirstSolve > 0

	if (unresolved) {
		out.push(
			insight({
				type: 'repeated_failure_unresolved',
				problemSlug: slug,
				message: `Your last ${failurePattern.trailingFailures} submissions on ${slug} did not pass all tests (latest: ${latest.testsPassed}/${latest.testsTotal}).`,
				metrics: {
					trailingFailures: failurePattern.trailingFailures,
					latestTestsPassed: latest.testsPassed,
					latestTestsTotal: latest.testsTotal,
					passFractionDelta: stats.passFractionDelta
				},
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}

	// Only tests still failing now: a misconception the learner has since fixed
	// would contradict their latest result.
	for (const signal of behavior.inferred) {
		if (signal.code !== 'possible_persistent_misconception') continue
		if (!signal.evidence.failingInLatestAttempt) continue
		const recurring = failurePattern.recurringTestFailures.find(
			(t) => t.testId === signal.evidence.testId
		)
		out.push(
			insight({
				type: 'persistent_test_failure',
				problemSlug: slug,
				message: `Test ${signal.evidence.testId} on ${slug} has failed in ${signal.evidence.longestConsecutiveFailures} consecutive submissions and still fails; it may involve a case your solution doesn't handle yet.`,
				metrics: {
					testId: signal.evidence.testId,
					consecutiveFailures: signal.evidence.longestConsecutiveFailures,
					failedAttempts: recurring?.failedAttempts ?? signal.evidence.longestConsecutiveFailures
				},
				evidence: 'inferred',
				precision: 'exact'
			})
		)
	}

	if (regressed) {
		const message = latest.allPassed
			? `After first solving ${slug}, ${plural(scoreChanges.failuresAfterFirstSolve, 'later submission')} did not pass; your latest one passes.`
			: `After first solving ${slug}, ${plural(scoreChanges.failuresAfterFirstSolve, 'later submission')} did not pass, including the latest.`
		out.push(
			insight({
				type: 'regression_after_solve',
				problemSlug: slug,
				message,
				metrics: {
					failuresAfterFirstSolve: scoreChanges.failuresAfterFirstSolve,
					latestAttemptPassed: latest.allPassed
				},
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}

	// Score trends need enough measurable submissions, and only while the problem
	// is still failing: a passing latest attempt is covered by the solve/recovery
	// insights, and a regression already explains the change. Alongside an open
	// failure run a trend adds direction.
	const first = stats.firstPassFraction
	const last = stats.latestPassFraction
	const delta = stats.passFractionDelta
	const measured = stats.history.filter((h) => h.passFraction != null).length
	const trendIsNews =
		measured >= MIN_SUBMISSIONS_FOR_TRENDS &&
		!latest.allPassed &&
		!regressed &&
		first != null &&
		last != null
	if (trendIsNews && delta != null && stats.trend === 'declining') {
		out.push(
			insight({
				type: 'score_declining',
				problemSlug: slug,
				message: `Your test score on ${slug} went from ${percent(first)} to ${percent(last)} across submissions.`,
				metrics: { firstPassFraction: first, latestPassFraction: last, passFractionDelta: delta },
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}
	if (trendIsNews && delta != null && stats.trend === 'improving') {
		out.push(
			insight({
				type: 'score_improving',
				problemSlug: slug,
				message: `Your test score on ${slug} rose from ${percent(first)} to ${percent(last)} across submissions.`,
				metrics: {
					firstPassFraction: first,
					latestPassFraction: last,
					passFractionDelta: delta,
					stepImprovements: stats.stepImprovements
				},
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}

	if (!unresolved && stats.recoveriesAfterRepeatFailure > 0) {
		out.push(
			insight({
				type: 'recovered_after_repeated_failure',
				problemSlug: slug,
				message: `On ${slug} you passed after ${stats.longestFailureStreak > 2 ? `up to ${stats.longestFailureStreak}` : 'repeated'} failed submissions in a row.`,
				metrics: {
					recoveries: stats.recoveriesAfterRepeatFailure,
					longestFailureStreak: stats.longestFailureStreak
				},
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}

	const solvedOn = stats.attemptsToFirstSolve
	if (solvedOn != null) {
		if (signals.has('first_solve_after_strategy_reveal')) {
			out.push(
				insight({
					type: 'strategy_before_first_solve',
					problemSlug: slug,
					message: `A Strategy hint was recorded before your first solve on ${slug}, so that solve doesn't show whether you could reach the approach unaided.`,
					metrics: {
						attemptsToFirstSolve: solvedOn,
						strategyReveals: hintReveals.beforeFirstSolve.strategy
					},
					evidence: 'inferred',
					precision: 'approximate'
				})
			)
		}
		if (signals.has('independent_first_solve')) {
			out.push(
				insight({
					type: 'independent_first_solve',
					problemSlug: slug,
					message: `You solved ${slug} on attempt ${solvedOn} with no hints or replays recorded before it.`,
					metrics: { attemptsToFirstSolve: solvedOn },
					evidence: 'inferred',
					precision: 'approximate'
				})
			)
		} else {
			out.push(
				insight({
					type: 'first_solve',
					problemSlug: slug,
					message: `You first solved ${slug} on attempt ${solvedOn}.`,
					metrics: { attemptsToFirstSolve: solvedOn },
					evidence: 'observed',
					precision: 'exact'
				})
			)
		}
	}
	return out
}

function accountInsights(
	statistics: LearningStatistics,
	behavior: LearningBehavior
): LearningInsight[] {
	const { totals, replay, hints } = statistics
	const out: LearningInsight[] = []

	if (totals.attempts > 0 && totals.attempts < MIN_SUBMISSIONS_FOR_TRENDS) {
		out.push(
			insight({
				type: 'limited_history',
				problemSlug: null,
				message: `Only ${plural(totals.attempts, 'submission')} saved so far — not enough to show trends.`,
				metrics: { submissions: totals.attempts, minimumForTrends: MIN_SUBMISSIONS_FOR_TRENDS },
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}

	const failedAttemptsReplayed = behavior.problems.reduce(
		(sum, p) => sum + p.observed.replayTiming.failedAttemptsReplayed,
		0
	)
	if (replay.total > 0) {
		// Fallback events are separated from linked replays by count, not by id.
		const approximate = replay.fallbackEvents > 0
		out.push(
			insight({
				type: 'replay_engagement',
				problemSlug: null,
				message: `You inspected ${approximate ? 'about ' : ''}${plural(replay.total, 'replay')}; ${failedAttemptsReplayed} of your ${plural(totals.failedAttempts, 'failed submission')} ${failedAttemptsReplayed === 1 ? 'has' : 'have'} a replay linked to it.`,
				metrics: {
					replays: replay.total,
					linkedSessions: replay.linkedSessions,
					fallbackEvents: replay.fallbackEvents,
					failedAttemptsReplayed,
					failedAttempts: totals.failedAttempts
				},
				evidence: 'observed',
				precision: approximate ? 'approximate' : 'exact'
			})
		)
	} else if (totals.failedAttempts >= MIN_SUBMISSIONS_FOR_TRENDS) {
		out.push(
			insight({
				type: 'replay_not_used',
				problemSlug: null,
				message: `No replays are recorded across your ${plural(totals.failedAttempts, 'failed submission')}.`,
				metrics: { failedAttempts: totals.failedAttempts },
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}

	const hintTotal = hints.observation + hints.reasoning + hints.strategy + hints.unclassified
	if (hintTotal > 0) {
		const other = hints.unclassified > 0 ? `, ${hints.unclassified} other` : ''
		out.push(
			insight({
				type: 'hint_usage',
				problemSlug: null,
				message: `Hints revealed: ${hints.observation} Observation, ${hints.reasoning} Reasoning, ${hints.strategy} Strategy${other}.`,
				metrics: { ...hints, distinctHintsRevealed: statistics.distinctHintsRevealed },
				evidence: 'observed',
				precision: 'exact'
			})
		)
	}
	return out
}

function compareInsights(a: LearningInsight, b: LearningInsight): number {
	if (a.priority !== b.priority) return b.priority - a.priority
	const aSlug = a.problemSlug ?? ''
	const bSlug = b.problemSlug ?? ''
	if (aSlug !== bSlug) return aSlug < bSlug ? -1 : 1
	if (a.type !== b.type) return a.type < b.type ? -1 : 1
	return a.message < b.message ? -1 : a.message > b.message ? 1 : 0
}

export function generateLearningInsights(
	statistics: LearningStatistics,
	behavior: LearningBehavior
): LearningInsights {
	if (!statistics.hasActivity) {
		return {
			hasActivity: false,
			insights: [
				insight({
					type: 'no_activity',
					problemSlug: null,
					message: 'No saved activity yet, so there is nothing to summarise.',
					metrics: {},
					evidence: 'observed',
					precision: 'exact'
				})
			]
		}
	}

	const behaviorBySlug = new Map(behavior.problems.map((p) => [p.problemSlug, p]))
	const perProblem = statistics.problems.flatMap((stats) => {
		const problemBehavior = behaviorBySlug.get(stats.problemSlug)
		return problemBehavior == null ? [] : problemInsights(stats, problemBehavior)
	})

	return {
		hasActivity: true,
		insights: [...accountInsights(statistics, behavior), ...perProblem].sort(compareInsights)
	}
}
