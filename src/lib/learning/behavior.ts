import {
	REPEAT_FAILURE_MIN,
	addHintEvent,
	emptyHints,
	groupBy,
	parseHintDetail,
	type HintCounts,
	type LearningEventRecord,
	type LearningRecords,
	type LearningStatistics,
	type ProblemStatistics,
	type ReplaySessionRecord,
	type SubmissionPoint
} from './statistics'

// Behavioural analysis (M6.2) layered on M6.1's statistics. It reuses the
// ordered history, first-solve index and failure streaks already computed there
// and only adds what needs timestamps or per-test detail.
//
// Two kinds of output, kept apart on purpose:
// - `observed`: facts read straight off the records (counts, orderings,
//   timings). Any hint/replay figure next to an outcome is CO-OCCURRENCE in
//   time, never a claim that the hint or replay caused the outcome.
// - `inferred`: rule-based hypotheses about understanding, each with the
//   observed evidence it rests on. They are prompts for M7 to weigh, not facts.
//
// Timing rule: an event "precedes" an attempt only if its timestamp is strictly
// earlier; an event at the same instant counts as after.

// A test failing in this many consecutive attempts suggests a misconception.
const PERSISTENT_TEST_FAILURE_MIN = 3

export type FailurePattern =
	| 'no_attempts'
	| 'no_failures'
	// Failures never ran two in a row.
	| 'isolated_failures'
	// Every run of ≥2 failures ended in a pass.
	| 'repeat_failures_recovered'
	// The latest attempts are a still-open run of ≥2 failures.
	| 'repeat_failures_unresolved'

export interface RecurringTestFailure {
	testId: string
	failedAttempts: number
	longestConsecutiveFailures: number
	failingInLatestAttempt: boolean
}

export interface FailurePatternAnalysis {
	pattern: FailurePattern
	// Tests that failed in ≥2 attempts, sorted by testId.
	recurringTestFailures: RecurringTestFailure[]
	// Length of the failure run the history currently ends on (0 if it ends on a pass).
	trailingFailures: number
}

export interface ScoreChangeAnalysis {
	// Consecutive pairs of measurable attempts (pass fraction not null). Rises
	// are ProblemStatistics.stepImprovements; not repeated here.
	transitions: number
	drops: number
	unchanged: number
	largestGain: number | null
	// Magnitude of the biggest fall, as a positive fraction.
	largestDrop: number | null
	failuresAfterFirstSolve: number
}

export type HintLevel = 1 | 2 | 3

export interface PromptLadder {
	promptId: string
	levelsRevealed: HintLevel[]
	highestLevel: HintLevel
	// Levels below highestLevel that were never revealed.
	skippedLevels: HintLevel[]
	// No skipped levels, and each level was first revealed no earlier than the one below.
	revealedInOrder: boolean
}

export interface HintRevealAnalysis {
	// Unsolved problems put every reveal in beforeFirstSolve.
	beforeFirstSolve: HintCounts
	afterFirstSolve: HintCounts
	strategyBeforeFirstSolve: boolean
	// Sorted by promptId; unclassified reveals have no ladder.
	ladders: PromptLadder[]
	attemptsAfterFirstReveal: number
}

export interface ReplayTimingAnalysis {
	// Linked sessions, split by the outcome of the attempt they replay.
	linkedOnFailedAttempts: number
	linkedOnPassedAttempts: number
	// Distinct failed attempts with ≥1 linked replay, and that over all failed attempts.
	failedAttemptsReplayed: number
	failedAttemptReplayRate: number | null
	// Timed from replay_inspected events: every replay, linked or fallback, writes one.
	replaysBeforeFirstSolve: number
	replaysAfterFirstSolve: number
	attemptsAfterFirstReplay: number
}

export interface FailToPassTransition {
	failedAttemptIds: string[]
	passedAttemptId: string
	// Pass fraction of the last failed attempt before the pass.
	scoreBeforePass: number | null
	// Recorded between the first failure of the run and the pass. Co-occurrence
	// in time only; not evidence that either produced the pass.
	coOccurring: { hintReveals: HintCounts; replays: number }
}

export type InferredSignal =
	| {
			code: 'independent_first_solve'
			basis: 'inferred'
			evidence: { attemptsToFirstSolve: number }
	  }
	| {
			code: 'first_solve_after_strategy_reveal'
			basis: 'inferred'
			evidence: { attemptsToFirstSolve: number; strategyRevealsBeforeFirstSolve: number }
	  }
	| {
			code: 'possible_persistent_misconception'
			basis: 'inferred'
			evidence: {
				testId: string
				longestConsecutiveFailures: number
				failingInLatestAttempt: boolean
			}
	  }
	| { code: 'unresolved_struggle'; basis: 'inferred'; evidence: { trailingFailures: number } }
	| {
			code: 'regression_after_solve'
			basis: 'inferred'
			evidence: { failuresAfterFirstSolve: number }
	  }

export type InferredSignalCode = InferredSignal['code']

export interface ProblemBehavior {
	problemSlug: string
	observed: {
		failurePattern: FailurePatternAnalysis
		scoreChanges: ScoreChangeAnalysis
		hintReveals: HintRevealAnalysis
		replayTiming: ReplayTimingAnalysis
		failToPass: FailToPassTransition[]
	}
	inferred: InferredSignal[]
}

export interface LearningBehavior {
	// Same order as LearningStatistics.problems (by problemSlug).
	problems: ProblemBehavior[]
	summary: {
		problemsByPattern: Record<FailurePattern, number>
		failToPassTransitions: number
		transitionsWithHintReveal: number
		transitionsWithReplay: number
		transitionsWithNeither: number
		signals: Record<InferredSignalCode, number>
	}
}

const toMs = (iso: string): number => Date.parse(iso)

function totalHints(counts: HintCounts): number {
	return counts.observation + counts.reasoning + counts.strategy + counts.unclassified
}

function byTimeThenDetail(a: LearningEventRecord, b: LearningEventRecord): number {
	const diff = a.createdAt.getTime() - b.createdAt.getTime()
	if (diff !== 0) return diff
	const ad = a.detail ?? ''
	const bd = b.detail ?? ''
	return ad < bd ? -1 : ad > bd ? 1 : 0
}

function attemptsAfter(history: SubmissionPoint[], ms: number | null): number {
	return ms == null ? 0 : history.filter((h) => toMs(h.createdAt) > ms).length
}

function trailingFailureRun(history: SubmissionPoint[]): number {
	let run = 0
	for (let i = history.length - 1; i >= 0 && history[i]?.allPassed === false; i -= 1) run += 1
	return run
}

function failurePattern(stats: ProblemStatistics): FailurePattern {
	if (stats.attempts === 0) return 'no_attempts'
	if (stats.failedAttempts === 0) return 'no_failures'
	if (stats.repeatFailureStreaks === 0) return 'isolated_failures'
	// Only the trailing run can be unrecovered.
	return stats.repeatFailureStreaks > stats.recoveriesAfterRepeatFailure
		? 'repeat_failures_unresolved'
		: 'repeat_failures_recovered'
}

function recurringTestFailures(history: SubmissionPoint[]): RecurringTestFailure[] {
	const testIds = [...new Set(history.flatMap((h) => h.failedTestIds))].sort()
	const latest = history.at(-1)
	return testIds.flatMap((testId) => {
		let failedAttempts = 0
		let run = 0
		let longest = 0
		for (const point of history) {
			if (point.failedTestIds.includes(testId)) {
				failedAttempts += 1
				run += 1
				longest = Math.max(longest, run)
			} else {
				run = 0
			}
		}
		if (failedAttempts < REPEAT_FAILURE_MIN) return []
		return [
			{
				testId,
				failedAttempts,
				longestConsecutiveFailures: longest,
				failingInLatestAttempt: latest?.failedTestIds.includes(testId) ?? false
			}
		]
	})
}

function scoreChanges(history: SubmissionPoint[], firstSolveIndex: number): ScoreChangeAnalysis {
	const measured = history.flatMap((h) => (h.passFraction == null ? [] : [h.passFraction]))
	const deltas = measured.slice(1).map((value, i) => value - (measured[i] ?? value))
	const gains = deltas.filter((d) => d > 0)
	const drops = deltas.filter((d) => d < 0)
	return {
		transitions: deltas.length,
		drops: drops.length,
		unchanged: deltas.filter((d) => d === 0).length,
		largestGain: gains.length === 0 ? null : Math.max(...gains),
		largestDrop: drops.length === 0 ? null : -Math.min(...drops),
		failuresAfterFirstSolve:
			firstSolveIndex < 0
				? 0
				: history.slice(firstSolveIndex + 1).filter((h) => !h.allPassed).length
	}
}

function promptLadders(hintEvents: LearningEventRecord[]): PromptLadder[] {
	// First-reveal time per (prompt, level); events arrive sorted by time.
	const firstReveal = new Map<string, Map<HintLevel, number>>()
	for (const event of hintEvents) {
		const parsed = parseHintDetail(event.detail)
		if (parsed == null) continue
		const levels = firstReveal.get(parsed.promptId) ?? new Map<HintLevel, number>()
		if (!levels.has(parsed.level)) levels.set(parsed.level, event.createdAt.getTime())
		firstReveal.set(parsed.promptId, levels)
	}
	return [...firstReveal.keys()].sort().map((promptId) => {
		const levels = firstReveal.get(promptId) ?? new Map<HintLevel, number>()
		const revealed = [...levels.keys()].sort((a, b) => a - b)
		const highestLevel = revealed.at(-1) ?? 1
		const skippedLevels = ([1, 2, 3] as const).filter((l) => l < highestLevel && !levels.has(l))
		const times = revealed.map((l) => levels.get(l) ?? 0)
		const monotonic = times.every((t, i) => i === 0 || t >= (times[i - 1] ?? t))
		return {
			promptId,
			levelsRevealed: revealed,
			highestLevel,
			skippedLevels,
			revealedInOrder: skippedLevels.length === 0 && monotonic
		}
	})
}

function hintReveals(
	history: SubmissionPoint[],
	hintEvents: LearningEventRecord[],
	firstSolveMs: number | null
): HintRevealAnalysis {
	const beforeFirstSolve = emptyHints()
	const afterFirstSolve = emptyHints()
	for (const event of hintEvents) {
		const before = firstSolveMs == null || event.createdAt.getTime() < firstSolveMs
		addHintEvent(before ? beforeFirstSolve : afterFirstSolve, event.detail)
	}
	return {
		beforeFirstSolve,
		afterFirstSolve,
		strategyBeforeFirstSolve: firstSolveMs != null && beforeFirstSolve.strategy > 0,
		ladders: promptLadders(hintEvents),
		attemptsAfterFirstReveal: attemptsAfter(history, hintEvents[0]?.createdAt.getTime() ?? null)
	}
}

function replayTiming(
	history: SubmissionPoint[],
	sessions: ReplaySessionRecord[],
	replayEvents: LearningEventRecord[],
	firstSolveMs: number | null
): ReplayTimingAnalysis {
	const passedById = new Map(history.map((h) => [h.attemptId, h.allPassed]))
	const onFailed = sessions.filter((s) => passedById.get(s.attemptId) === false)
	const failedAttempts = history.filter((h) => !h.allPassed).length
	const failedAttemptsReplayed = new Set(onFailed.map((s) => s.attemptId)).size
	const beforeSolve = replayEvents.filter(
		(e) => firstSolveMs == null || e.createdAt.getTime() < firstSolveMs
	).length
	return {
		linkedOnFailedAttempts: onFailed.length,
		linkedOnPassedAttempts: sessions.filter((s) => passedById.get(s.attemptId) === true).length,
		failedAttemptsReplayed,
		failedAttemptReplayRate: failedAttempts === 0 ? null : failedAttemptsReplayed / failedAttempts,
		replaysBeforeFirstSolve: beforeSolve,
		replaysAfterFirstSolve: replayEvents.length - beforeSolve,
		attemptsAfterFirstReplay: attemptsAfter(history, replayEvents[0]?.createdAt.getTime() ?? null)
	}
}

function failToPass(
	history: SubmissionPoint[],
	hintEvents: LearningEventRecord[],
	replayEvents: LearningEventRecord[]
): FailToPassTransition[] {
	const transitions: FailToPassTransition[] = []
	let run: SubmissionPoint[] = []
	for (const point of history) {
		if (!point.allPassed) {
			run.push(point)
			continue
		}
		const firstFail = run[0]
		if (firstFail != null) {
			const from = toMs(firstFail.createdAt)
			const to = toMs(point.createdAt)
			const within = (e: LearningEventRecord) => {
				const t = e.createdAt.getTime()
				return t >= from && t < to
			}
			const hintsBetween = emptyHints()
			for (const e of hintEvents.filter(within)) addHintEvent(hintsBetween, e.detail)
			transitions.push({
				failedAttemptIds: run.map((r) => r.attemptId),
				passedAttemptId: point.attemptId,
				scoreBeforePass: run.at(-1)?.passFraction ?? null,
				coOccurring: { hintReveals: hintsBetween, replays: replayEvents.filter(within).length }
			})
		}
		run = []
	}
	return transitions
}

function inferredSignals(
	stats: ProblemStatistics,
	observed: ProblemBehavior['observed']
): InferredSignal[] {
	const signals: InferredSignal[] = []
	const { hintReveals: hints, replayTiming: replay, failurePattern: failures } = observed
	if (stats.attemptsToFirstSolve != null) {
		if (totalHints(hints.beforeFirstSolve) === 0 && replay.replaysBeforeFirstSolve === 0) {
			signals.push({
				code: 'independent_first_solve',
				basis: 'inferred',
				evidence: { attemptsToFirstSolve: stats.attemptsToFirstSolve }
			})
		}
		if (hints.strategyBeforeFirstSolve) {
			signals.push({
				code: 'first_solve_after_strategy_reveal',
				basis: 'inferred',
				evidence: {
					attemptsToFirstSolve: stats.attemptsToFirstSolve,
					strategyRevealsBeforeFirstSolve: hints.beforeFirstSolve.strategy
				}
			})
		}
	}
	for (const test of failures.recurringTestFailures) {
		if (test.longestConsecutiveFailures < PERSISTENT_TEST_FAILURE_MIN) continue
		signals.push({
			code: 'possible_persistent_misconception',
			basis: 'inferred',
			evidence: {
				testId: test.testId,
				longestConsecutiveFailures: test.longestConsecutiveFailures,
				failingInLatestAttempt: test.failingInLatestAttempt
			}
		})
	}
	if (failures.pattern === 'repeat_failures_unresolved') {
		signals.push({
			code: 'unresolved_struggle',
			basis: 'inferred',
			evidence: { trailingFailures: failures.trailingFailures }
		})
	}
	if (observed.scoreChanges.failuresAfterFirstSolve > 0) {
		signals.push({
			code: 'regression_after_solve',
			basis: 'inferred',
			evidence: { failuresAfterFirstSolve: observed.scoreChanges.failuresAfterFirstSolve }
		})
	}
	return signals
}

function problemBehavior(
	stats: ProblemStatistics,
	sessions: ReplaySessionRecord[],
	replayEvents: LearningEventRecord[],
	hintEvents: LearningEventRecord[]
): ProblemBehavior {
	const { history } = stats
	const firstSolveIndex = stats.attemptsToFirstSolve == null ? -1 : stats.attemptsToFirstSolve - 1
	const firstSolve = history[firstSolveIndex]
	const firstSolveMs = firstSolve == null ? null : toMs(firstSolve.createdAt)

	const observed: ProblemBehavior['observed'] = {
		failurePattern: {
			pattern: failurePattern(stats),
			recurringTestFailures: recurringTestFailures(history),
			trailingFailures: trailingFailureRun(history)
		},
		scoreChanges: scoreChanges(history, firstSolveIndex),
		hintReveals: hintReveals(history, hintEvents, firstSolveMs),
		replayTiming: replayTiming(history, sessions, replayEvents, firstSolveMs),
		failToPass: failToPass(history, hintEvents, replayEvents)
	}
	return { problemSlug: stats.problemSlug, observed, inferred: inferredSignals(stats, observed) }
}

function emptySignalCounts(): Record<InferredSignalCode, number> {
	return {
		independent_first_solve: 0,
		first_solve_after_strategy_reveal: 0,
		possible_persistent_misconception: 0,
		unresolved_struggle: 0,
		regression_after_solve: 0
	}
}

export function analyzeLearningBehavior(
	statistics: LearningStatistics,
	records: LearningRecords
): LearningBehavior {
	const sorted = [...records.events].sort(byTimeThenDetail)
	const replayBySlug = groupBy(
		sorted.filter((e) => e.type === 'replay_inspected'),
		(e) => e.problemSlug
	)
	const hintsBySlug = groupBy(
		sorted.filter((e) => e.type === 'hint_revealed'),
		(e) => e.problemSlug
	)
	const sessionsBySlug = groupBy(records.replaySessions, (s) => s.problemSlug)

	const problems = statistics.problems.map((stats) =>
		problemBehavior(
			stats,
			sessionsBySlug.get(stats.problemSlug) ?? [],
			replayBySlug.get(stats.problemSlug) ?? [],
			hintsBySlug.get(stats.problemSlug) ?? []
		)
	)

	const problemsByPattern: Record<FailurePattern, number> = {
		no_attempts: 0,
		no_failures: 0,
		isolated_failures: 0,
		repeat_failures_recovered: 0,
		repeat_failures_unresolved: 0
	}
	const signals = emptySignalCounts()
	const transitions = problems.flatMap((p) => p.observed.failToPass)
	for (const p of problems) {
		problemsByPattern[p.observed.failurePattern.pattern] += 1
		for (const signal of p.inferred) signals[signal.code] += 1
	}
	const withHint = transitions.filter((t) => totalHints(t.coOccurring.hintReveals) > 0)
	const withReplay = transitions.filter((t) => t.coOccurring.replays > 0)

	return {
		problems,
		summary: {
			problemsByPattern,
			failToPassTransitions: transitions.length,
			transitionsWithHintReveal: withHint.length,
			transitionsWithReplay: withReplay.length,
			transitionsWithNeither: transitions.filter(
				(t) => totalHints(t.coOccurring.hintReveals) === 0 && t.coOccurring.replays === 0
			).length,
			signals
		}
	}
}
