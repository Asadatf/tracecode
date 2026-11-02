import type { ProblemDefinition } from '../trace/problem'
import {
	emptyHints,
	type HintCounts,
	type ImprovementTrend,
	type LearningStatistics,
	type ProblemStatistics,
	type ReplayEngagement
} from './statistics'
import type {
	FailurePatternAnalysis,
	InferredSignal,
	InferredSignalCode,
	LearningBehavior,
	ProblemBehavior,
	ScoreChangeAnalysis
} from './behavior'
import type {
	InsightEvidence,
	InsightPrecision,
	InsightType,
	LearningInsight,
	LearningInsights
} from './insights'
import {
	emptySequence,
	type AttemptSequence,
	type PatternStatus,
	type StructuralFeature
} from './solution-evolution'

// Learning evidence assembly (M7.2): one typed, deterministic snapshot of what is
// known about a learner, built from
//   - M6 statistics, behaviour and insights (reused as-is, never recomputed),
//   - M7.1 structural fingerprints, via the per-problem attempt sequences,
//   - the curated problem catalog.
// It is what the ranking (M7.3), the AI diagnosis (M7.4) and, later, the
// problem-specific tutor (M8) and adaptive learning (M9) read. Nothing in it is
// specific to ranking, and nothing about the catalog's SIZE is baked in: problems
// and concepts are lists keyed by slug and tag.
//
// OBSERVED and INFERRED are kept in separate fields on every level:
//   observed — facts read off the records (counts, orderings, outcomes, and the
//              structural differences between attempts);
//   inferred — M6's rule-based hypotheses about understanding, each tagged
//              `basis: 'inferred'` there. M7.2 adds NO inference of its own.
// There is deliberately no mastery score, no "struggling" flag and no claim that
// a structural change improves a solution: those are judgements, and a judgement
// built on counts of AST nodes would be wrong as often as right.

export const RECOMMENDATION_EVIDENCE_VERSION = 1

// The M6 output M7.2 consumes. Structural, so the server's LearningAnalytics fits.
export interface LearningAnalyticsInput {
	statistics: LearningStatistics
	behavior: LearningBehavior
	insights: LearningInsights
}

// The slice of a problem the evidence needs. A full ProblemDefinition fits.
export type CatalogEntry = Pick<ProblemDefinition, 'slug' | 'conceptTags' | 'difficulty'>
export type Difficulty = CatalogEntry['difficulty']

export type ProblemProgress = 'not_started' | 'attempted' | 'solved'
export type LatestOutcome = 'passed' | 'failed' | 'none'

// An M6 insight, reduced to what a consumer needs to weigh it. Its message text is
// left out on purpose: it is presentation, and copy edits must not change evidence.
export interface InsightRef {
	type: InsightType
	problemSlug: string | null
	evidence: InsightEvidence
	precision: InsightPrecision
	priority: number
}

export interface ProblemObserved {
	attempts: number
	passedAttempts: number
	failedAttempts: number
	solved: boolean
	attemptsToFirstSolve: number | null
	latestOutcome: LatestOutcome
	latestPassFraction: number | null
	bestPassFraction: number | null
	trend: ImprovementTrend
	stepImprovements: number
	longestFailureStreak: number
	failurePattern: FailurePatternAnalysis
	scoreChanges: ScoreChangeAnalysis
	hints: HintCounts
	replay: ReplayEngagement
	// True when the sequence below holds every attempt the learner made.
	windowCoversAllAttempts: boolean
	// The latest attempts, their fingerprints and how they differ (observed only).
	sequence: AttemptSequence
	insights: InsightRef[]
}

export interface ProblemInferred {
	// M6's inferred signals for this problem, each with the evidence it rests on.
	signals: InferredSignal[]
	insights: InsightRef[]
}

export interface ProblemEvidence {
	slug: string
	// False for a problem the learner has history on that the catalog no longer has.
	known: boolean
	conceptTags: string[]
	difficulty: Difficulty | null
	progress: ProblemProgress
	observed: ProblemObserved
	inferred: ProblemInferred
}

export type PatternCounts = Record<PatternStatus, number>

export interface ConceptEvidence {
	tag: string
	// Catalog problems carrying the tag, sorted.
	problems: string[]
	observed: {
		problemsInCatalog: number
		problemsAttempted: number
		problemsSolved: number
		// Failure runs of two or more at any point, or still open now.
		problemsWithRepeatedFailures: number
		problemsWithOpenRepeatedFailures: number
		// For each structural fact, how many of the concept's problems show each
		// pattern status in the learner's latest attempts.
		structuralPatterns: Record<StructuralFeature, PatternCounts>
	}
	inferred: {
		// How many of the concept's problems carry each M6 inferred signal.
		signals: Partial<Record<InferredSignalCode, number>>
	}
}

export interface RecommendationEvidence {
	v: typeof RECOMMENDATION_EVIDENCE_VERSION
	// When this was assembled. Volatile: excluded from the evidence fingerprint.
	generatedAt: string | null
	hasActivity: boolean
	totals: LearningStatistics['totals']
	// Every catalog problem (started or not) plus any other problem the learner has
	// history on, sorted by slug.
	problems: ProblemEvidence[]
	// One entry per concept tag in the catalog, sorted by tag.
	concepts: ConceptEvidence[]
	// Account-wide M6 insights, split by what they rest on.
	insights: { observed: InsightRef[]; inferred: InsightRef[] }
}

export interface BuildEvidenceOptions {
	// Passed in so the builder stays clock-free.
	generatedAt?: string | null
}

// Per scope; M6 already sorts by priority, so this keeps the most important ones.
export const MAX_INSIGHTS_PER_SCOPE = 10

export function catalogEntries(problems: readonly CatalogEntry[]): CatalogEntry[] {
	return problems.map(({ slug, conceptTags, difficulty }) => ({ slug, conceptTags, difficulty }))
}

function insightRef(insight: LearningInsight): InsightRef {
	return {
		type: insight.type,
		problemSlug: insight.problemSlug,
		evidence: insight.evidence,
		precision: insight.precision,
		priority: insight.priority
	}
}

function sortedRefs(insights: LearningInsight[]): InsightRef[] {
	return insights
		.map(insightRef)
		.sort((a, b) => b.priority - a.priority || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
		.slice(0, MAX_INSIGHTS_PER_SCOPE)
}

function splitByEvidence(insights: LearningInsight[]): {
	observed: InsightRef[]
	inferred: InsightRef[]
} {
	return {
		observed: sortedRefs(insights.filter((i) => i.evidence === 'observed')),
		inferred: sortedRefs(insights.filter((i) => i.evidence === 'inferred'))
	}
}

function emptyObserved(sequence: AttemptSequence): ProblemObserved {
	return {
		attempts: 0,
		passedAttempts: 0,
		failedAttempts: 0,
		solved: false,
		attemptsToFirstSolve: null,
		latestOutcome: 'none',
		latestPassFraction: null,
		bestPassFraction: null,
		trend: 'single_attempt',
		stepImprovements: 0,
		longestFailureStreak: 0,
		failurePattern: { pattern: 'no_attempts', recurringTestFailures: [], trailingFailures: 0 },
		scoreChanges: {
			transitions: 0,
			drops: 0,
			unchanged: 0,
			largestGain: null,
			largestDrop: null,
			failuresAfterFirstSolve: 0
		},
		hints: emptyHints(),
		replay: { linkedSessions: 0, fallbackEvents: 0, total: 0 },
		windowCoversAllAttempts: true,
		sequence,
		insights: []
	}
}

function observedOf(
	stats: ProblemStatistics,
	behavior: ProblemBehavior | undefined,
	sequence: AttemptSequence,
	insights: LearningInsight[]
): ProblemObserved {
	const latest = stats.history.at(-1)
	const base = emptyObserved(sequence)
	return {
		...base,
		attempts: stats.attempts,
		passedAttempts: stats.passedAttempts,
		failedAttempts: stats.failedAttempts,
		solved: stats.solved,
		attemptsToFirstSolve: stats.attemptsToFirstSolve,
		latestOutcome: latest == null ? 'none' : latest.allPassed ? 'passed' : 'failed',
		latestPassFraction: stats.latestPassFraction,
		bestPassFraction: stats.bestPassFraction,
		trend: stats.trend,
		stepImprovements: stats.stepImprovements,
		longestFailureStreak: stats.longestFailureStreak,
		failurePattern: behavior?.observed.failurePattern ?? base.failurePattern,
		scoreChanges: behavior?.observed.scoreChanges ?? base.scoreChanges,
		hints: stats.hints,
		replay: stats.replay,
		windowCoversAllAttempts: sequence.items.length >= stats.attempts,
		insights: splitByEvidence(insights).observed
	}
}

function signalOrder(a: InferredSignal, b: InferredSignal): number {
	if (a.code !== b.code) return a.code < b.code ? -1 : 1
	const aTest = 'testId' in a.evidence ? a.evidence.testId : ''
	const bTest = 'testId' in b.evidence ? b.evidence.testId : ''
	return aTest < bTest ? -1 : aTest > bTest ? 1 : 0
}

function problemEvidence(
	slug: string,
	entry: CatalogEntry | undefined,
	stats: ProblemStatistics | undefined,
	behavior: ProblemBehavior | undefined,
	sequence: AttemptSequence,
	insights: LearningInsight[]
): ProblemEvidence {
	const observed =
		stats == null ? emptyObserved(sequence) : observedOf(stats, behavior, sequence, insights)
	return {
		slug,
		known: entry != null,
		conceptTags: [...new Set(entry?.conceptTags ?? [])].sort(),
		difficulty: entry?.difficulty ?? null,
		progress: observed.solved ? 'solved' : observed.attempts > 0 ? 'attempted' : 'not_started',
		observed,
		inferred: {
			signals: [...(behavior?.inferred ?? [])].sort(signalOrder),
			insights: splitByEvidence(insights).inferred
		}
	}
}

function emptyPatternCounts(): PatternCounts {
	return { no_evidence: 0, absent: 0, appeared_once: 0, recurring: 0, disappeared: 0 }
}

// Spelled out so a structural fact added to STRUCTURAL_FEATURES is a compile error
// here rather than a silently missing key.
function emptyStructuralPatterns(): Record<StructuralFeature, PatternCounts> {
	return {
		nested_loops: emptyPatternCounts(),
		dict: emptyPatternCounts(),
		set: emptyPatternCounts(),
		sorted: emptyPatternCounts(),
		recursion: emptyPatternCounts()
	}
}

function conceptEvidence(tag: string, problems: ProblemEvidence[]): ConceptEvidence {
	const members = problems.filter((p) => p.known && p.conceptTags.includes(tag))
	const structuralPatterns = emptyStructuralPatterns()
	const signals: Partial<Record<InferredSignalCode, number>> = {}
	for (const problem of members) {
		for (const pattern of problem.observed.sequence.patterns) {
			structuralPatterns[pattern.feature][pattern.status] += 1
		}
		for (const code of new Set(problem.inferred.signals.map((s) => s.code))) {
			signals[code] = (signals[code] ?? 0) + 1
		}
	}
	const repeated = (p: ProblemEvidence) =>
		p.observed.failurePattern.pattern === 'repeat_failures_recovered' ||
		p.observed.failurePattern.pattern === 'repeat_failures_unresolved'
	return {
		tag,
		problems: members.map((p) => p.slug),
		observed: {
			problemsInCatalog: members.length,
			problemsAttempted: members.filter((p) => p.progress !== 'not_started').length,
			problemsSolved: members.filter((p) => p.progress === 'solved').length,
			problemsWithRepeatedFailures: members.filter(repeated).length,
			problemsWithOpenRepeatedFailures: members.filter(
				(p) => p.observed.failurePattern.pattern === 'repeat_failures_unresolved'
			).length,
			structuralPatterns
		},
		inferred: { signals }
	}
}

// Assembles the evidence. Pure: the same inputs give the same output, whatever
// order the inputs arrive in, and `generatedAt` is the only volatile field.
export function buildRecommendationEvidence(
	analytics: LearningAnalyticsInput,
	attemptSequences: readonly AttemptSequence[],
	catalog: readonly CatalogEntry[],
	options: BuildEvidenceOptions = {}
): RecommendationEvidence {
	const { statistics, behavior, insights } = analytics
	const entries = new Map(catalog.map((entry) => [entry.slug, entry]))
	const stats = new Map(statistics.problems.map((p) => [p.problemSlug, p]))
	const behaviors = new Map(behavior.problems.map((p) => [p.problemSlug, p]))
	const sequences = new Map(attemptSequences.map((s) => [s.problemSlug, s]))

	const slugs = [
		...new Set([...entries.keys(), ...stats.keys(), ...behaviors.keys(), ...sequences.keys()])
	].sort()

	const problems = slugs.map((slug) =>
		problemEvidence(
			slug,
			entries.get(slug),
			stats.get(slug),
			behaviors.get(slug),
			sequences.get(slug) ?? emptySequence(slug),
			insights.insights.filter((insight) => insight.problemSlug === slug)
		)
	)

	const tags = [...new Set(catalog.flatMap((entry) => entry.conceptTags))].sort()
	return {
		v: RECOMMENDATION_EVIDENCE_VERSION,
		generatedAt: options.generatedAt ?? null,
		hasActivity: statistics.hasActivity,
		totals: statistics.totals,
		problems,
		concepts: tags.map((tag) => conceptEvidence(tag, problems)),
		insights: splitByEvidence(insights.insights.filter((insight) => insight.problemSlug == null))
	}
}
