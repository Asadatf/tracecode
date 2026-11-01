// Pure learning-statistics calculator (M6.1). Takes one learner's persisted
// records and derives descriptive metrics. No I/O, no clock, no randomness: the
// same records always produce the same output, which is what M7 builds on.
//
// These metrics DESCRIBE what was recorded; they never claim causation (e.g.
// that a hint caused a later pass). Pass/fail is browser-reported telemetry,
// not server-verified grading (ADR-0001).

export interface AttemptRecord {
	id: string
	problemSlug: string
	createdAt: Date
	testsPassed: number
	testsTotal: number
	allPassed: boolean
	// testIds of this attempt's failed attempt_test_results rows.
	failedTestIds: string[]
}

export interface ReplaySessionRecord {
	attemptId: string
	// The attempt's problemSlug (sessions don't store their own).
	problemSlug: string
	testId: string
	testPassed: boolean
	startedAt: Date
}

export interface LearningEventRecord {
	problemSlug: string
	type: string
	detail: string | null
	createdAt: Date
}

export interface LearningRecords {
	attempts: AttemptRecord[]
	replaySessions: ReplaySessionRecord[]
	events: LearningEventRecord[]
}

export type HintLevelKind = 'observation' | 'reasoning' | 'strategy'

export interface HintCounts {
	observation: number
	reasoning: number
	strategy: number
	// hint_revealed events whose detail isn't `<promptId>:L<1|2|3>`.
	unclassified: number
}

export interface ReplayEngagement {
	// ReplaySession rows: replays linked to a saved attempt.
	linkedSessions: number
	// replay_inspected events with no matching session (the save hadn't landed
	// or failed, so the workspace fell back to a plain event).
	fallbackEvents: number
	total: number
}

export type ImprovementTrend = 'improving' | 'declining' | 'flat' | 'single_attempt'

export interface SubmissionPoint {
	attemptId: string
	createdAt: string
	testsPassed: number
	testsTotal: number
	allPassed: boolean
	// testsPassed / testsTotal, or null when the attempt reported no tests.
	passFraction: number | null
	failedTestIds: string[]
}

export interface ProblemStatistics {
	problemSlug: string
	attempts: number
	passedAttempts: number
	failedAttempts: number
	solved: boolean
	// 1-based index of the first all-passed attempt; null if never solved.
	attemptsToFirstSolve: number | null
	history: SubmissionPoint[]
	firstPassFraction: number | null
	latestPassFraction: number | null
	bestPassFraction: number | null
	// latest − first; null with fewer than two measurable attempts.
	passFractionDelta: number | null
	trend: ImprovementTrend
	// Attempts whose pass fraction strictly beat the previous measurable one.
	stepImprovements: number
	longestFailureStreak: number
	// Runs of ≥2 consecutive failed attempts.
	repeatFailureStreaks: number
	// Repeat-failure streaks that were immediately followed by a passing attempt.
	recoveriesAfterRepeatFailure: number
	replay: ReplayEngagement
	hints: HintCounts
	distinctHintsRevealed: number
}

export interface LearningStatistics {
	hasActivity: boolean
	totals: {
		attempts: number
		passedAttempts: number
		failedAttempts: number
		// passed / attempts; null when there are no attempts.
		passRate: number | null
		problemsAttempted: number
		problemsSolved: number
		// Mean / median of attemptsToFirstSolve over solved problems; null if none.
		meanAttemptsToFirstSolve: number | null
		medianAttemptsToFirstSolve: number | null
		problemsWithRepeatFailures: number
		repeatFailureStreaks: number
		recoveriesAfterRepeatFailure: number
	}
	replay: ReplayEngagement
	hints: HintCounts
	distinctHintsRevealed: number
	// Sorted by problemSlug.
	problems: ProblemStatistics[]
}

export const REPEAT_FAILURE_MIN = 2

const HINT_LEVEL_KIND: Record<1 | 2 | 3, HintLevelKind> = {
	1: 'observation',
	2: 'reasoning',
	3: 'strategy'
}

// Mirrors hintRevealDetail(): `<promptId>:L<level>`.
const HINT_DETAIL = /^(.+):L([123])$/

export interface ParsedHintDetail {
	promptId: string
	level: 1 | 2 | 3
	kind: HintLevelKind
}

export function parseHintDetail(detail: string | null): ParsedHintDetail | null {
	const match = detail == null ? null : HINT_DETAIL.exec(detail)
	const promptId = match?.[1]
	const level = Number(match?.[2])
	if (promptId == null || (level !== 1 && level !== 2 && level !== 3)) return null
	return { promptId, level, kind: HINT_LEVEL_KIND[level] }
}

export function hintKindFromDetail(detail: string | null): HintLevelKind | null {
	return parseHintDetail(detail)?.kind ?? null
}

export function emptyHints(): HintCounts {
	return { observation: 0, reasoning: 0, strategy: 0, unclassified: 0 }
}

export function addHintEvent(into: HintCounts, detail: string | null): void {
	const kind = hintKindFromDetail(detail)
	if (kind == null) into.unclassified += 1
	else into[kind] += 1
}

function addHints(into: HintCounts, from: HintCounts): void {
	into.observation += from.observation
	into.reasoning += from.reasoning
	into.strategy += from.strategy
	into.unclassified += from.unclassified
}

function passFraction(a: AttemptRecord): number | null {
	return a.testsTotal > 0 ? a.testsPassed / a.testsTotal : null
}

function byTimeThenId(a: AttemptRecord, b: AttemptRecord): number {
	const diff = a.createdAt.getTime() - b.createdAt.getTime()
	if (diff !== 0) return diff
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>()
	for (const item of items) {
		const k = key(item)
		const group = groups.get(k)
		if (group) group.push(item)
		else groups.set(k, [item])
	}
	return groups
}

function median(values: number[]): number | null {
	if (values.length === 0) return null
	const sorted = [...values].sort((a, b) => a - b)
	const upper = sorted[Math.floor(sorted.length / 2)] ?? 0
	const lower = sorted[Math.ceil(sorted.length / 2) - 1] ?? 0
	return (lower + upper) / 2
}

function mean(values: number[]): number | null {
	if (values.length === 0) return null
	return values.reduce((sum, v) => sum + v, 0) / values.length
}

// Every linked replay writes one ReplaySession AND one replay_inspected event
// (detail = testId); a fallback replay writes only the event. Events don't
// carry an attempt id, so per (problem, test) the events beyond the session
// count are the fallbacks. Clamped at 0 in case a session's event write failed.
function replayEngagement(
	sessions: ReplaySessionRecord[],
	replayEvents: LearningEventRecord[]
): ReplayEngagement {
	const sessionsByKey = groupBy(sessions, (s) => `${s.problemSlug}\u0000${s.testId}`)
	const eventsByKey = groupBy(replayEvents, (e) => `${e.problemSlug}\u0000${e.detail ?? ''}`)
	let fallbackEvents = 0
	for (const [key, events] of eventsByKey) {
		fallbackEvents += Math.max(0, events.length - (sessionsByKey.get(key)?.length ?? 0))
	}
	return {
		linkedSessions: sessions.length,
		fallbackEvents,
		total: sessions.length + fallbackEvents
	}
}

function hintStats(hintEvents: LearningEventRecord[]): { counts: HintCounts; distinct: number } {
	const counts = emptyHints()
	for (const event of hintEvents) addHintEvent(counts, event.detail)
	const distinct = new Set(hintEvents.map((e) => `${e.problemSlug}\u0000${e.detail ?? ''}`)).size
	return { counts, distinct }
}

function trendOf(delta: number | null): ImprovementTrend {
	if (delta == null) return 'single_attempt'
	if (delta > 0) return 'improving'
	if (delta < 0) return 'declining'
	return 'flat'
}

function failureStreaks(ordered: AttemptRecord[]): {
	longest: number
	repeatStreaks: number
	recoveries: number
} {
	let longest = 0
	let repeatStreaks = 0
	let recoveries = 0
	let run = 0
	for (const attempt of ordered) {
		if (!attempt.allPassed) {
			run += 1
			longest = Math.max(longest, run)
			continue
		}
		if (run >= REPEAT_FAILURE_MIN) {
			repeatStreaks += 1
			recoveries += 1
		}
		run = 0
	}
	if (run >= REPEAT_FAILURE_MIN) repeatStreaks += 1
	return { longest, repeatStreaks, recoveries }
}

function problemStatistics(
	problemSlug: string,
	attempts: AttemptRecord[],
	sessions: ReplaySessionRecord[],
	replayEvents: LearningEventRecord[],
	hintEvents: LearningEventRecord[]
): ProblemStatistics {
	const ordered = [...attempts].sort(byTimeThenId)
	const history: SubmissionPoint[] = ordered.map((a) => ({
		attemptId: a.id,
		createdAt: a.createdAt.toISOString(),
		testsPassed: a.testsPassed,
		testsTotal: a.testsTotal,
		allPassed: a.allPassed,
		passFraction: passFraction(a),
		failedTestIds: [...a.failedTestIds].sort()
	}))

	const measured = history.flatMap((h) => (h.passFraction == null ? [] : [h.passFraction]))
	const first = measured[0] ?? null
	const latest = measured.at(-1) ?? null
	const delta = measured.length >= 2 && first != null && latest != null ? latest - first : null
	const stepImprovements = measured.filter(
		(value, i) => i > 0 && value > (measured[i - 1] ?? value)
	).length

	const firstSolveIndex = ordered.findIndex((a) => a.allPassed)
	const passedAttempts = ordered.filter((a) => a.allPassed).length
	const streaks = failureStreaks(ordered)
	const hints = hintStats(hintEvents)

	return {
		problemSlug,
		attempts: ordered.length,
		passedAttempts,
		failedAttempts: ordered.length - passedAttempts,
		solved: firstSolveIndex !== -1,
		attemptsToFirstSolve: firstSolveIndex === -1 ? null : firstSolveIndex + 1,
		history,
		firstPassFraction: first,
		latestPassFraction: latest,
		bestPassFraction: measured.length === 0 ? null : Math.max(...measured),
		passFractionDelta: delta,
		trend: trendOf(delta),
		stepImprovements,
		longestFailureStreak: streaks.longest,
		repeatFailureStreaks: streaks.repeatStreaks,
		recoveriesAfterRepeatFailure: streaks.recoveries,
		replay: replayEngagement(sessions, replayEvents),
		hints: hints.counts,
		distinctHintsRevealed: hints.distinct
	}
}

export function computeLearningStatistics(records: LearningRecords): LearningStatistics {
	const replayEvents = records.events.filter((e) => e.type === 'replay_inspected')
	const hintEvents = records.events.filter((e) => e.type === 'hint_revealed')

	const attemptsBySlug = groupBy(records.attempts, (a) => a.problemSlug)
	const sessionsBySlug = groupBy(records.replaySessions, (s) => s.problemSlug)
	const replayBySlug = groupBy(replayEvents, (e) => e.problemSlug)
	const hintsBySlug = groupBy(hintEvents, (e) => e.problemSlug)

	// A problem appears if it has any recorded activity, not just attempts.
	const slugs = [
		...new Set([
			...attemptsBySlug.keys(),
			...sessionsBySlug.keys(),
			...replayBySlug.keys(),
			...hintsBySlug.keys()
		])
	].sort()

	const problems = slugs.map((slug) =>
		problemStatistics(
			slug,
			attemptsBySlug.get(slug) ?? [],
			sessionsBySlug.get(slug) ?? [],
			replayBySlug.get(slug) ?? [],
			hintsBySlug.get(slug) ?? []
		)
	)

	const hints = emptyHints()
	const replay: ReplayEngagement = { linkedSessions: 0, fallbackEvents: 0, total: 0 }
	for (const p of problems) {
		addHints(hints, p.hints)
		replay.linkedSessions += p.replay.linkedSessions
		replay.fallbackEvents += p.replay.fallbackEvents
		replay.total += p.replay.total
	}

	const attempted = problems.filter((p) => p.attempts > 0)
	const firstSolves = attempted.flatMap((p) =>
		p.attemptsToFirstSolve == null ? [] : [p.attemptsToFirstSolve]
	)
	const passedAttempts = attempted.reduce((sum, p) => sum + p.passedAttempts, 0)
	const totalAttempts = records.attempts.length

	return {
		hasActivity: problems.length > 0,
		totals: {
			attempts: totalAttempts,
			passedAttempts,
			failedAttempts: totalAttempts - passedAttempts,
			passRate: totalAttempts === 0 ? null : passedAttempts / totalAttempts,
			problemsAttempted: attempted.length,
			problemsSolved: firstSolves.length,
			meanAttemptsToFirstSolve: mean(firstSolves),
			medianAttemptsToFirstSolve: median(firstSolves),
			problemsWithRepeatFailures: attempted.filter((p) => p.repeatFailureStreaks > 0).length,
			repeatFailureStreaks: attempted.reduce((sum, p) => sum + p.repeatFailureStreaks, 0),
			recoveriesAfterRepeatFailure: attempted.reduce(
				(sum, p) => sum + p.recoveriesAfterRepeatFailure,
				0
			)
		},
		replay,
		hints,
		distinctHintsRevealed: problems.reduce((sum, p) => sum + p.distinctHintsRevealed, 0),
		problems
	}
}
