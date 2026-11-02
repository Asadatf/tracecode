import { computeEvidenceHash } from './evidence-hash'
import type { Difficulty, ProblemEvidence, RecommendationEvidence } from './recommendation-evidence'
import type { AttemptSequence, StructuralFeature } from './solution-evolution'

// Deterministic recommendation engine (M7.3). Given the M7.2 RecommendationEvidence
// and nothing else, it ranks the EXISTING curated catalog and chooses what to
// practise next. It is the source of truth: pure, clock-free, randomness-free, and
// independent of OpenRouter. The same evidence always yields the same ranking,
// scores, reason codes and explanations, so the dashboard, a refresh and the cron
// all agree. A later AI diagnosis (M7.4) may re-WORD this result, but it may never
// change which problems are eligible, invent a problem, or add evidence.
//
// What the engine will NOT do, by construction:
//   - invent or recommend a problem the catalog does not have (only `known` problems
//     are ranked);
//   - let a raw attempt count decide anything (ten attempts can mean persistence,
//     not confusion) — ranking is by learner STATE, not by how many tries happened;
//   - claim mastery, correctness, complexity or a cause ("you don't understand
//     arrays", "your code is O(n²)", "you mastered hash maps"). Every explanation is
//     an OBSERVED fact that resolves to a field in the evidence, and structural
//     facts from AST are stated as what they are (a recurring shape), never judged.
//
// Ranking is a small, explicit priority hierarchy over each problem's state:
//   open_repeated_failures  — attempted, unsolved, the latest run is ≥2 failures.
//                             The clearest, most actionable gap: achievable practice.
//   in_progress             — attempted, unsolved, but not an open failure run.
//                             Unfinished work edges out starting something new.
//   not_attempted           — never tried. New learning, and an accessible starting
//                             point for a brand-new learner. Still ranks above a
//                             solved problem, so new learning beats re-doing a solve.
//   solved                  — already solved; favoured only for revision, and only
//                             when there is nothing new left to try.
// A bounded structural bonus orders attempted problems among themselves when the
// records show a recurring shape alongside the failures; it is small enough never to
// cross a tier. Ties break deterministically: score, then difficulty (easier first),
// then slug.

export const RECOMMENDATION_VERSION = 1

// Caps on the human-readable copy, enforced as a backstop.
export const MAX_SUMMARY = 280
export const MAX_NEXT_STEP = 160
export const MAX_FOCUS_CONCEPTS = 3

// Per-problem reason, stable across releases (a cache/analytics key). Each maps to a
// learner state the evidence makes unambiguous.
export const REASON_CODES = [
	'not_attempted',
	'open_repeated_failures',
	'in_progress',
	'solved_revision'
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

// The state a problem is in for one learner. `solved` is last on purpose.
export type ProblemState = 'open_repeated_failures' | 'not_attempted' | 'in_progress' | 'solved'

// Base score per state (higher is recommended first). The gaps are wide enough that
// the structural bonus below can reorder within a tier without ever crossing one.
export const TIER_SCORE: Record<ProblemState, number> = {
	open_repeated_failures: 100,
	in_progress: 80,
	not_attempted: 70,
	solved: 20
}

// Added to an ATTEMPTED problem whose latest fingerprinted attempt still shows a
// recurring nested-loop shape: the records point at a concrete thing to vary next.
// Kept below the smallest tier gap (10), so it only reorders within one tier.
export const STRUCTURAL_FOCUS_BONUS = 4

// Added to a SOLVED problem the learner reached only after earlier failures: among
// solved problems it is the better revision target, and the records say why. Bounded
// the same way, so it never lifts a solved problem over unfinished or new work.
export const REVISION_BONUS = 4

const DIFFICULTY_RANK: Record<NonNullable<Difficulty>, number> = { easy: 0, medium: 1, hard: 2 }
// Unknown difficulty sorts after every known one (least "accessible" by default).
const UNKNOWN_DIFFICULTY_RANK = 3

// An evidence reference: a metric that EXISTS in the evidence, with the value read
// from it. It makes every explanation checkable (M7.4 validates AI claims the same
// way) and is why the engine can never cite something it did not observe.
export interface EvidenceRef {
	problemSlug: string | null
	metric: string
	value: string | number | boolean | null
}

export interface RankedProblem {
	slug: string
	score: number
	reasonCode: ReasonCode
	reasonText: string
	evidenceRefs: EvidenceRef[]
}

export interface Diagnosis {
	// M7.3 always produces the fallback; M7.4 may replace it with `ai`.
	source: 'fallback' | 'ai'
	// True only once M7.4 keeps a diagnosis bound to an older evidence hash.
	stale: boolean
	summary: string
	nextStep: string
	// Every claim resolves to a field in the evidence (see EvidenceRef).
	claims: { problemSlug: string | null; metric: string }[]
}

export interface Recommendation {
	v: typeof RECOMMENDATION_VERSION
	// Volatile: excluded from evidenceHash, passed in so the engine stays clock-free.
	generatedAt: string | null
	evidenceHash: string
	focusConcepts: string[]
	rankedProblems: RankedProblem[]
	diagnosis: Diagnosis
}

export interface RankOptions {
	generatedAt?: string | null
	// Reuse a hash the caller already computed (the server loader does); otherwise
	// the engine computes it with the shared computeEvidenceHash — never a copy of it.
	evidenceHash?: string
}

// --- Evidence lookup -------------------------------------------------------------

// Resolves a metric token against the evidence. The set is fixed and small: every
// token the engine ever cites is here, so a citation can never drift from the data.
// Returns `{ found: false }` for anything not present, which is exactly what M7.4
// will use to reject an AI claim that references evidence the engine does not have.
export function lookupMetric(
	evidence: RecommendationEvidence,
	problemSlug: string | null,
	metric: string
): { found: true; value: EvidenceRef['value'] } | { found: false } {
	if (problemSlug == null) {
		switch (metric) {
			case 'totals.attempts':
				return { found: true, value: evidence.totals.attempts }
			case 'totals.problemsSolved':
				return { found: true, value: evidence.totals.problemsSolved }
			case 'totals.problemsAttempted':
				return { found: true, value: evidence.totals.problemsAttempted }
			case 'hasActivity':
				return { found: true, value: evidence.hasActivity }
			default:
				return { found: false }
		}
	}
	const problem = evidence.problems.find((p) => p.slug === problemSlug)
	if (problem == null) return { found: false }
	const o = problem.observed
	switch (metric) {
		case 'progress':
			return { found: true, value: problem.progress }
		case 'known':
			return { found: true, value: problem.known }
		case 'observed.attempts':
			return { found: true, value: o.attempts }
		case 'observed.failedAttempts':
			return { found: true, value: o.failedAttempts }
		case 'observed.latestOutcome':
			return { found: true, value: o.latestOutcome }
		case 'observed.attemptsToFirstSolve':
			return { found: true, value: o.attemptsToFirstSolve }
		case 'observed.failurePattern.pattern':
			return { found: true, value: o.failurePattern.pattern }
		case 'observed.failurePattern.trailingFailures':
			return { found: true, value: o.failurePattern.trailingFailures }
		default:
			break
	}
	// Structural pattern status: observed.sequence.patterns.<feature>.status
	const patternMatch = /^observed\.sequence\.patterns\.([a-z_]+)\.status$/.exec(metric)
	if (patternMatch) {
		const feature = patternMatch[1] as StructuralFeature
		const pattern = o.sequence.patterns.find((p) => p.feature === feature)
		return pattern == null ? { found: false } : { found: true, value: pattern.status }
	}
	return { found: false }
}

// Builds references for the metrics given, dropping any that do not resolve. Nothing
// the engine cites can therefore be absent from the evidence.
function refs(
	evidence: RecommendationEvidence,
	problemSlug: string | null,
	metrics: string[]
): EvidenceRef[] {
	return metrics.flatMap((metric) => {
		const hit = lookupMetric(evidence, problemSlug, metric)
		return hit.found ? [{ problemSlug, metric, value: hit.value }] : []
	})
}

// --- Per-problem classification --------------------------------------------------

function stateOf(problem: ProblemEvidence): ProblemState {
	if (problem.progress === 'not_started') return 'not_attempted'
	if (problem.progress === 'solved') return 'solved'
	// Attempted but not solved: an open run of ≥2 failures is the actionable case.
	return problem.observed.failurePattern.pattern === 'repeat_failures_unresolved'
		? 'open_repeated_failures'
		: 'in_progress'
}

// A nested-loop shape that is present in the latest fingerprinted attempt and in the
// window as a whole. OBSERVED only — never read as "too slow" or "wrong".
function recurringNestedLoops(sequence: AttemptSequence): boolean {
	const nested = sequence.patterns.find((p) => p.feature === 'nested_loops')
	return nested != null && nested.inLatest === true && nested.status === 'recurring'
}

// Solved, but the records show it was not first-try: earlier failures preceded the
// solve. Used only to RECOGNISE improvement in wording — never to claim mastery.
function solvedAfterStruggle(problem: ProblemEvidence): boolean {
	if (problem.progress !== 'solved') return false
	const o = problem.observed
	return (
		(o.attemptsToFirstSolve ?? 1) > 1 || o.failurePattern.pattern === 'repeat_failures_recovered'
	)
}

// A subject whose latest records contradict themselves, or whose identical structure
// gave different outcomes: there is no clear pattern, so the engine stays neutral.
function hasConfusingContradiction(problem: ProblemEvidence): boolean {
	const latestId = problem.observed.sequence.items.at(-1)?.attemptId
	return problem.observed.sequence.contradictions.some(
		(c) =>
			c.kind === 'same_structure_different_outcome' ||
			(c.kind === 'inconsistent_attempt_record' &&
				latestId != null &&
				c.attemptIds.includes(latestId))
	)
}

// A bounded, within-tier nudge. For attempted problems it raises one whose records
// show a recurring shape alongside the struggle; for solved problems it raises the
// one worth revisiting (solved only after earlier failures). Never crosses a tier.
function priorityBonus(state: ProblemState, problem: ProblemEvidence): number {
	if (state === 'open_repeated_failures' || state === 'in_progress') {
		return recurringNestedLoops(problem.observed.sequence) ? STRUCTURAL_FOCUS_BONUS : 0
	}
	if (state === 'solved') return solvedAfterStruggle(problem) ? REVISION_BONUS : 0
	return 0
}

// --- Per-problem reason text -----------------------------------------------------

const REASON_FOR_STATE: Record<ProblemState, ReasonCode> = {
	open_repeated_failures: 'open_repeated_failures',
	not_attempted: 'not_attempted',
	in_progress: 'in_progress',
	solved: 'solved_revision'
}

function reasonTextFor(state: ProblemState, problem: ProblemEvidence): string {
	const o = problem.observed
	switch (state) {
		case 'not_attempted':
			return 'You haven’t attempted this problem yet.'
		case 'open_repeated_failures':
			return `Your recent submissions here have failed several tests (the last ${o.failurePattern.trailingFailures} did not pass all tests).`
		case 'in_progress':
			return 'You’ve started this problem but haven’t passed every test yet.'
		case 'solved':
			return o.attemptsToFirstSolve != null && o.attemptsToFirstSolve > 1
				? `You solved this on attempt ${o.attemptsToFirstSolve}.`
				: 'You’ve already solved this problem.'
	}
}

function evidenceRefsFor(
	evidence: RecommendationEvidence,
	state: ProblemState,
	problem: ProblemEvidence
): EvidenceRef[] {
	const slug = problem.slug
	switch (state) {
		case 'not_attempted':
			return refs(evidence, slug, ['progress'])
		case 'open_repeated_failures':
			return refs(evidence, slug, [
				'observed.failurePattern.pattern',
				'observed.failurePattern.trailingFailures',
				'observed.latestOutcome'
			])
		case 'in_progress':
			return refs(evidence, slug, ['progress', 'observed.latestOutcome'])
		case 'solved':
			return refs(evidence, slug, ['progress', 'observed.attemptsToFirstSolve'])
	}
}

// --- Ranking ---------------------------------------------------------------------

interface Candidate {
	problem: ProblemEvidence
	state: ProblemState
	ranked: RankedProblem
}

function difficultyRank(difficulty: Difficulty | null): number {
	return difficulty == null ? UNKNOWN_DIFFICULTY_RANK : DIFFICULTY_RANK[difficulty]
}

// Score desc, then easier-first, then slug. Deterministic and total.
function byPriority(a: Candidate, b: Candidate): number {
	if (a.ranked.score !== b.ranked.score) return b.ranked.score - a.ranked.score
	const da = difficultyRank(a.problem.difficulty)
	const db = difficultyRank(b.problem.difficulty)
	if (da !== db) return da - db
	return a.problem.slug < b.problem.slug ? -1 : a.problem.slug > b.problem.slug ? 1 : 0
}

function candidateFor(evidence: RecommendationEvidence, problem: ProblemEvidence): Candidate {
	const state = stateOf(problem)
	const score = TIER_SCORE[state] + priorityBonus(state, problem)
	return {
		problem,
		state,
		ranked: {
			slug: problem.slug,
			score,
			reasonCode: REASON_FOR_STATE[state],
			reasonText: reasonTextFor(state, problem),
			evidenceRefs: evidenceRefsFor(evidence, state, problem)
		}
	}
}

// --- Focus concepts --------------------------------------------------------------

function focusConceptsFor(
	evidence: RecommendationEvidence,
	subject: ProblemEvidence | undefined
): string[] {
	const tags = new Set<string>(subject?.conceptTags ?? [])
	// Concepts the learner is visibly stuck on belong in focus too.
	for (const concept of evidence.concepts) {
		if (concept.observed.problemsWithOpenRepeatedFailures > 0) tags.add(concept.tag)
	}
	return [...tags].sort().slice(0, MAX_FOCUS_CONCEPTS)
}

// --- Diagnosis (deterministic fallback) ------------------------------------------

function clamp(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

interface DiagnosisDraft {
	summary: string
	nextStep: string
	claims: { problemSlug: string | null; metric: string }[]
}

function diagnosisDraft(
	evidence: RecommendationEvidence,
	subject: ProblemEvidence | undefined,
	state: ProblemState | null,
	allKnownSolved: boolean
): DiagnosisDraft {
	// No catalog problem to point at (every known problem is retired): stay honest.
	if (subject == null || state == null) {
		return {
			summary: 'There are no practice problems available to recommend right now.',
			nextStep: 'Check back when new problems are added.',
			claims: refs(evidence, null, ['hasActivity']).map(({ problemSlug, metric }) => ({
				problemSlug,
				metric
			}))
		}
	}
	const slug = subject.slug
	const claim = (problemSlug: string | null, metrics: string[]) =>
		refs(evidence, problemSlug, metrics).map(({ problemSlug: p, metric }) => ({
			problemSlug: p,
			metric
		}))

	// Mixed/contradictory records for the subject: neutral wording, no pattern claim.
	if (hasConfusingContradiction(subject)) {
		return {
			summary: `Your recent records for ${slug} are mixed, so there isn’t a clear pattern to go on yet.`,
			nextStep: `Try ${slug} again and run all of its tests.`,
			claims: claim(slug, ['progress'])
		}
	}

	// A completed catalog: honest revision, with the reason read off the records.
	if (allKnownSolved) {
		const struggled = evidence.problems.some((p) => p.known && solvedAfterStruggle(p))
		const o = subject.observed
		const why =
			o.attemptsToFirstSolve != null && o.attemptsToFirstSolve > 1
				? ` You first solved it on attempt ${o.attemptsToFirstSolve}, so another pass can help it stick.`
				: ''
		return {
			summary: clamp(
				`You’ve solved every problem in the current set${struggled ? ', including some that took a few tries' : ''}. There’s nothing new to start right now.`,
				MAX_SUMMARY
			),
			nextStep: clamp(`Revisit ${slug} to reinforce it.${why}`, MAX_NEXT_STEP),
			claims: claim(slug, ['progress', 'observed.attemptsToFirstSolve'])
		}
	}

	// A fresh recommendation while other problems are done/in flight: recognise any
	// earlier improvement without overclaiming, then point at the new problem.
	const progressionNote = evidence.problems.find((p) => p.known && solvedAfterStruggle(p))

	switch (state) {
		case 'not_attempted': {
			if (!evidence.hasActivity) {
				return {
					summary:
						'You haven’t saved any attempts yet. Starting with an easier problem is a good way in.',
					nextStep: `Start with ${slug}.`,
					claims: claim(null, ['totals.attempts'])
				}
			}
			const recognised =
				progressionNote != null
					? `You solved ${progressionNote.slug} after some earlier unsuccessful attempts. `
					: `You’ve made progress on the problems you’ve tried. `
			return {
				summary: clamp(`${recognised}Here’s one you haven’t started yet.`, MAX_SUMMARY),
				nextStep: `Try ${slug} next.`,
				claims: claim(slug, ['progress'])
			}
		}
		case 'open_repeated_failures': {
			const o = subject.observed
			const nested = recurringNestedLoops(o.sequence)
				? ` Your recent solutions here keep the same nested-loop shape.`
				: ''
			return {
				summary: clamp(
					`Your recent submissions for ${slug} have failed several tests${o.latestPassFraction != null ? ` (latest passed about ${Math.round(o.latestPassFraction * 100)}% of them)` : ''}.${nested}`,
					MAX_SUMMARY
				),
				nextStep: clamp(
					`Keep working on ${slug}; focus on the tests that are still failing.`,
					MAX_NEXT_STEP
				),
				claims: claim(slug, [
					'observed.failurePattern.pattern',
					'observed.failurePattern.trailingFailures'
				])
			}
		}
		case 'in_progress':
			return {
				summary: `You’ve started ${slug} but haven’t passed every test yet.`,
				nextStep: `Give ${slug} another try.`,
				claims: claim(slug, ['progress', 'observed.latestOutcome'])
			}
		case 'solved':
			// Reachable only if the one non-solved slug is unknown; treat as revision.
			return {
				summary: `You’ve solved ${slug}. Revisiting it can help it stick.`,
				nextStep: `Revisit ${slug}.`,
				claims: claim(slug, ['progress'])
			}
	}
}

// --- Entry point -----------------------------------------------------------------

// Ranks the catalog and produces a complete, deterministic Recommendation. Always
// returns a full result — even for an empty learner or all-null features — with
// `diagnosis.source: 'fallback'` and no AI involved.
export function rankRecommendations(
	evidence: RecommendationEvidence,
	options: RankOptions = {}
): Recommendation {
	// Only problems the catalog actually has are ever ranked or recommended.
	const known = evidence.problems.filter((p) => p.known)
	const candidates = known.map((problem) => candidateFor(evidence, problem)).sort(byPriority)

	const top = candidates[0]
	const subject = top?.problem
	const allKnownSolved = known.length > 0 && known.every((p) => p.progress === 'solved')

	const draft = diagnosisDraft(evidence, subject, top?.state ?? null, allKnownSolved)

	return {
		v: RECOMMENDATION_VERSION,
		generatedAt: options.generatedAt ?? null,
		evidenceHash: options.evidenceHash ?? computeEvidenceHash(evidence),
		focusConcepts: focusConceptsFor(evidence, subject),
		rankedProblems: candidates.map((c) => c.ranked),
		diagnosis: {
			source: 'fallback',
			stale: false,
			summary: clamp(draft.summary, MAX_SUMMARY),
			nextStep: clamp(draft.nextStep, MAX_NEXT_STEP),
			claims: draft.claims
		}
	}
}
