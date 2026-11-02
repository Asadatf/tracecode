import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	MAX_NEXT_STEP,
	MAX_SUMMARY,
	REASON_CODES,
	RECOMMENDATION_VERSION,
	REVISION_BONUS,
	STRUCTURAL_FOCUS_BONUS,
	TIER_SCORE,
	lookupMetric,
	rankRecommendations,
	type Recommendation
} from './recommend.ts'
import { computeEvidenceHash } from './evidence-hash.ts'
import { buildRecommendationEvidence, type CatalogEntry } from './recommendation-evidence.ts'
import { buildAttemptSequences, type AttemptEvidenceRecord } from './solution-evolution.ts'
import type { AttemptRecord, LearningRecords } from './statistics.ts'
import {
	CATALOG,
	HASHMAP,
	MARKER,
	NESTED,
	SET_BASED,
	analyticsOf,
	at,
	att,
	buildFor,
	type Spec
} from './evidence-fixtures.mts'

// M7.3 — the deterministic recommendation engine. These exercise the ranking over
// the REAL two-problem catalog (with a few synthetic larger ones), driving genuine
// M6 + M7.2 evidence so the engine sees exactly what it would in production.

const TWO_SUM_ONLY: CatalogEntry[] = CATALOG.filter((e) => e.slug === 'two-sum')

const recFor = (specs: Spec[], options: { catalog?: CatalogEntry[] } = {}): Recommendation => {
	const { evidence } = buildFor(specs, options)
	return rankRecommendations(evidence)
}

const ranked = (r: Recommendation, slug: string) =>
	r.rankedProblems.find((p) => p.slug === slug) as Recommendation['rankedProblems'][number]

// A lower-level builder for records M6's helpers can't express (an attempt whose
// stored allPassed contradicts its test tallies): we set every field by hand.
function evidenceFromRecords(
	rows: {
		id: string
		slug: string
		minute: number
		testsPassed: number
		testsTotal: number
		allPassed: boolean
		failedTestIds: string[]
		status: string
		features: unknown
	}[],
	catalog: CatalogEntry[]
) {
	const m6: LearningRecords = {
		attempts: rows.map((r): AttemptRecord => ({
			id: r.id,
			problemSlug: r.slug,
			createdAt: at(r.minute),
			testsPassed: r.testsPassed,
			testsTotal: r.testsTotal,
			allPassed: r.allPassed,
			failedTestIds: r.failedTestIds
		})),
		replaySessions: [],
		events: []
	}
	const evRecords: AttemptEvidenceRecord[] = rows.map((r) => ({
		id: r.id,
		problemSlug: r.slug,
		createdAt: at(r.minute),
		status: r.status,
		testsPassed: r.testsPassed,
		testsTotal: r.testsTotal,
		allPassed: r.allPassed,
		failedTestIds: r.failedTestIds,
		codeFeatures: r.features
	}))
	return buildRecommendationEvidence(analyticsOf(m6), buildAttemptSequences(evRecords), catalog)
}

// Any word that would be an unsupported judgement about skill, speed or correctness.
const BANNED =
	/master|complexity|\bO\(|faster|slower|better|worse|optimal|efficien|proficien|\bskill|you don.t understand|genius|smart/i

function allCopy(r: Recommendation): string[] {
	return [
		r.diagnosis.summary,
		r.diagnosis.nextStep,
		...r.focusConcepts,
		...r.rankedProblems.map((p) => p.reasonText)
	]
}

// --- 1. Cold start ---------------------------------------------------------------

test('a brand-new learner is pointed at an accessible, existing problem with no AI', () => {
	const r = recFor([])
	assert.equal(r.v, RECOMMENDATION_VERSION)
	assert.equal(r.diagnosis.source, 'fallback')
	assert.equal(r.diagnosis.stale, false)
	// Only the real catalog, both not started, both easy.
	assert.deepEqual(
		r.rankedProblems.map((p) => [p.slug, p.reasonCode, p.score]),
		[
			['contains-duplicate', 'not_attempted', TIER_SCORE.not_attempted],
			['two-sum', 'not_attempted', TIER_SCORE.not_attempted]
		]
	)
	const top = r.rankedProblems[0]
	assert.ok(top && ['two-sum', 'contains-duplicate'].includes(top.slug))
	assert.match(r.diagnosis.nextStep, /^Start with /)
	assert.ok(r.focusConcepts.length > 0)
	// Cold start cites account-level evidence that exists.
	assert.deepEqual(r.diagnosis.claims, [{ problemSlug: null, metric: 'totals.attempts' }])
})

// --- 2 & 3. A single problem attempted -------------------------------------------

test('only Two Sum attempted (one failed try): continue it over an untouched problem', () => {
	const r = recFor([att('a1', 0, 'fail', NESTED)])
	const top = r.rankedProblems[0]
	assert.equal(top?.slug, 'two-sum')
	assert.equal(top?.reasonCode, 'in_progress')
	assert.equal(top?.score, TIER_SCORE.in_progress)
	// New learning still beats the untouched one only after the in-progress one.
	assert.equal(ranked(r, 'contains-duplicate').reasonCode, 'not_attempted')
	assert.ok(TIER_SCORE.in_progress > TIER_SCORE.not_attempted)
})

test('only Contains Duplicate attempted: the same logic applies to either slug', () => {
	const r = recFor([att('c1', 0, 'fail', SET_BASED, { slug: 'contains-duplicate' })])
	const top = r.rankedProblems[0]
	assert.equal(top?.slug, 'contains-duplicate')
	assert.equal(top?.reasonCode, 'in_progress')
	assert.equal(ranked(r, 'two-sum').reasonCode, 'not_attempted')
})

// --- 4. Repeated failures followed by success ------------------------------------

test('a solve after earlier failures is recognised without any mastery claim', () => {
	const r = recFor([
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'pass', HASHMAP)
	])
	// Two Sum is solved; a brand-new problem is favoured over re-doing it.
	assert.equal(ranked(r, 'two-sum').reasonCode, 'solved_revision')
	// Solved only after a struggle, so it carries the revision nudge but stays a solve.
	assert.equal(ranked(r, 'two-sum').score, TIER_SCORE.solved + REVISION_BONUS)
	assert.ok(ranked(r, 'two-sum').score < TIER_SCORE.not_attempted)
	assert.equal(r.rankedProblems[0]?.slug, 'contains-duplicate')
	// The improvement is acknowledged, carefully.
	assert.match(r.diagnosis.summary, /after some earlier unsuccessful attempts/)
	allCopy(r).forEach((text) => assert.doesNotMatch(text, BANNED, text))
})

// --- 5. Ongoing repeated failures ------------------------------------------------

test('an open run of failures is the top priority: achievable practice on that problem', () => {
	const r = recFor([
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'fail', NESTED)
	])
	const top = r.rankedProblems[0]
	assert.equal(top?.slug, 'two-sum')
	assert.equal(top?.reasonCode, 'open_repeated_failures')
	assert.ok((top?.score ?? 0) >= TIER_SCORE.open_repeated_failures)
	assert.ok(top!.score > ranked(r, 'contains-duplicate').score)
	assert.match(r.diagnosis.summary, /failed several tests/)
	assert.match(r.diagnosis.nextStep, /Keep working on two-sum/)
})

// --- 6. Same AST structure, different outcomes -----------------------------------

test('identical structure with different outcomes yields neutral, non-committal wording', () => {
	const { evidence } = buildFor([att('a1', 0, 'fail', NESTED), att('a2', 5, 'pass', NESTED)], {
		catalog: TWO_SUM_ONLY
	})
	const twoSum = evidence.problems.find((p) => p.slug === 'two-sum')
	assert.ok(
		twoSum?.observed.sequence.contradictions.some(
			(c) => c.kind === 'same_structure_different_outcome'
		)
	)
	const r = rankRecommendations(evidence)
	assert.match(r.diagnosis.summary, /mixed|clear pattern/)
	assert.match(r.diagnosis.nextStep, /run all of its tests/)
	allCopy(r).forEach((text) => assert.doesNotMatch(text, BANNED, text))
})

// --- 7. Nested-loop removal / dict introduction, and AST changing the result -----

test('a recurring nested-loop shape alongside failures raises the score and is noted, as an observation', () => {
	const withShape = recFor([
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'fail', NESTED)
	])
	const withoutShape = recFor([
		att('a1', 0, 'fail', null),
		att('a2', 4, 'fail', null),
		att('a3', 8, 'fail', null)
	])
	assert.equal(
		ranked(withShape, 'two-sum').score,
		TIER_SCORE.open_repeated_failures + STRUCTURAL_FOCUS_BONUS
	)
	assert.equal(ranked(withoutShape, 'two-sum').score, TIER_SCORE.open_repeated_failures)
	assert.match(withShape.diagnosis.summary, /nested-loop shape/)
	assert.doesNotMatch(withoutShape.diagnosis.summary, /nested-loop shape/)
	// Backfilled features genuinely change the recommendation and its hash.
	assert.notEqual(withShape.evidenceHash, withoutShape.evidenceHash)
	// ...but the shape is never judged as slow or wrong.
	allCopy(withShape).forEach((text) => assert.doesNotMatch(text, BANNED, text))
})

test('moving from nested loops to a dict across a failed->passed solve is recorded as observed transitions', () => {
	const { evidence } = buildFor(
		[att('a1', 0, 'fail', NESTED), att('a2', 4, 'fail', NESTED), att('a3', 8, 'pass', HASHMAP)],
		{ catalog: TWO_SUM_ONLY }
	)
	const seq = evidence.problems.find((p) => p.slug === 'two-sum')?.observed.sequence
	assert.ok(seq?.transitions.some((t) => t.change === 'nested_loops_removed'))
	assert.ok(seq?.transitions.some((t) => t.change === 'dict_introduced'))
	const r = rankRecommendations(evidence)
	allCopy(r).forEach((text) => assert.doesNotMatch(text, BANNED, text))
})

// --- 8. Both problems solved -----------------------------------------------------

test('every problem solved: an honest completion / revision state, no invented problem', () => {
	const r = recFor([
		att('a1', 0, 'pass', HASHMAP),
		att('c1', 1, 'pass', SET_BASED, { slug: 'contains-duplicate' })
	])
	assert.equal(r.rankedProblems.length, 2)
	assert.ok(r.rankedProblems.every((p) => p.reasonCode === 'solved_revision'))
	assert.match(r.diagnosis.summary, /solved every problem/)
	assert.match(r.diagnosis.nextStep, /Revisit /)
	// It does not pretend more problems exist.
	assert.doesNotMatch(r.diagnosis.summary, /next problem|new problem|try a new/)
})

test('a completed set that took several tries acknowledges the effort honestly', () => {
	const r = recFor([
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'pass', HASHMAP),
		att('c1', 1, 'pass', SET_BASED, { slug: 'contains-duplicate' })
	])
	assert.match(r.diagnosis.summary, /took a few tries/)
	assert.match(r.diagnosis.nextStep, /attempt 3/)
})

// --- 9. Solved vs unattempted ----------------------------------------------------

test('a solved problem is never re-recommended while an untouched one remains', () => {
	const r = recFor([att('a1', 0, 'pass', HASHMAP)])
	assert.equal(r.rankedProblems[0]?.slug, 'contains-duplicate')
	assert.equal(ranked(r, 'contains-duplicate').reasonCode, 'not_attempted')
	assert.equal(ranked(r, 'two-sum').reasonCode, 'solved_revision')
	assert.ok(ranked(r, 'contains-duplicate').score > ranked(r, 'two-sum').score)
})

// --- 10. Missing / unanalyzable AST features -------------------------------------

test('missing and unanalyzable features still yield a complete recommendation', () => {
	const r = recFor([
		att('a1', 0, 'fail', null),
		att('a2', 1, 'fail', MARKER),
		att('a3', 2, 'fail', null, {
			status: 'syntax_error',
			testsPassed: 0,
			testsTotal: 0,
			failedTestIds: []
		})
	])
	const top = r.rankedProblems[0]
	assert.equal(top?.slug, 'two-sum')
	assert.equal(top?.reasonCode, 'open_repeated_failures')
	// No fingerprint, so no structural bonus and no structural wording.
	assert.equal(top?.score, TIER_SCORE.open_repeated_failures)
	assert.doesNotMatch(r.diagnosis.summary, /nested-loop/)
	assert.ok(r.focusConcepts.length > 0)
})

// --- 11. Contradictory evidence --------------------------------------------------

test('an attempt whose record contradicts itself drives neutral, conservative wording', () => {
	const evidence = evidenceFromRecords(
		[
			{
				id: 'a1',
				slug: 'two-sum',
				minute: 0,
				testsPassed: 3,
				testsTotal: 3,
				allPassed: false, // claims failed, yet every test passed: inconsistent
				failedTestIds: [],
				status: 'completed',
				features: NESTED
			}
		],
		TWO_SUM_ONLY
	)
	const twoSum = evidence.problems.find((p) => p.slug === 'two-sum')
	assert.ok(
		twoSum?.observed.sequence.contradictions.some((c) => c.kind === 'inconsistent_attempt_record')
	)
	const r = rankRecommendations(evidence)
	assert.match(r.diagnosis.summary, /mixed|clear pattern/)
	allCopy(r).forEach((text) => assert.doesNotMatch(text, BANNED, text))
})

// --- 12. Deterministic ties ------------------------------------------------------

test('equal-score problems break ties by difficulty then slug, stably across runs', () => {
	const specs = [att('x', 0, 'fail', NESTED, { slug: 'nope' })] // history on a retired slug
	const a = recFor(specs)
	const b = recFor(specs)
	assert.deepEqual(a, b)
	// Both catalog problems are not_attempted + easy, so slug decides.
	assert.deepEqual(
		a.rankedProblems.map((p) => p.slug),
		['contains-duplicate', 'two-sum']
	)
})

// --- 13. Reordered evidence inputs -----------------------------------------------

test('input order never changes the recommendation', () => {
	const specs = [
		att('t1', 0, 'fail', NESTED),
		att('t2', 3, 'pass', HASHMAP),
		att('c1', 1, 'fail', SET_BASED, { slug: 'contains-duplicate' })
	]
	const forward = rankRecommendations(buildFor(specs).evidence)
	const reversed = rankRecommendations(buildFor([...specs].reverse()).evidence)
	assert.deepEqual(reversed, forward)
})

// --- 14. Larger synthetic catalog ------------------------------------------------

test('a 10-15 problem catalog needs no interface change and ranks every known problem', () => {
	const tags = ['arrays', 'loops', 'hashing', 'strings', 'recursion', 'sorting']
	const big: CatalogEntry[] = Array.from({ length: 13 }, (_, i) => ({
		slug: `p${String(i).padStart(2, '0')}`,
		conceptTags: [tags[i % tags.length] as string],
		difficulty: (['easy', 'medium', 'hard'] as const)[i % 3] ?? 'easy'
	}))
	const catalog = [...CATALOG, ...big]
	const r = recFor(
		[
			att('a1', 0, 'fail', NESTED, { slug: 'p03' }),
			att('a2', 1, 'fail', NESTED, { slug: 'p03' }),
			att('a3', 2, 'fail', NESTED, { slug: 'p03' }),
			att('a4', 3, 'pass', HASHMAP, { slug: 'p07' })
		],
		{ catalog }
	)
	assert.equal(r.rankedProblems.length, catalog.length)
	// The open-failure problem leads; a solved one is near the bottom.
	assert.equal(r.rankedProblems[0]?.slug, 'p03')
	assert.equal(ranked(r, 'p03').reasonCode, 'open_repeated_failures')
	assert.equal(ranked(r, 'p07').reasonCode, 'solved_revision')
	// Scores are non-increasing down the list.
	const scores = r.rankedProblems.map((p) => p.score)
	assert.deepEqual(
		scores,
		[...scores].sort((x, y) => y - x)
	)
})

// --- 15. No invented problems ----------------------------------------------------

test('only catalog problems are ranked; a problem with history but out of the catalog is excluded', () => {
	const r = recFor([
		att('r1', 0, 'pass', NESTED, { slug: 'retired-problem' }),
		att('t1', 1, 'fail', NESTED)
	])
	const slugs = r.rankedProblems.map((p) => p.slug)
	assert.deepEqual([...slugs].sort(), ['contains-duplicate', 'two-sum'])
	assert.ok(!slugs.includes('retired-problem'))
})

// --- 16. No unsupported mastery / complexity claims ------------------------------

test('no recommendation copy makes a mastery, speed or complexity claim', () => {
	const scenarios: Spec[][] = [
		[],
		[att('a1', 0, 'fail', NESTED)],
		[att('a1', 0, 'fail', NESTED), att('a2', 4, 'fail', NESTED), att('a3', 8, 'fail', NESTED)],
		[att('a1', 0, 'fail', NESTED), att('a2', 4, 'fail', NESTED), att('a3', 8, 'pass', HASHMAP)],
		[att('a1', 0, 'pass', HASHMAP), att('c1', 1, 'pass', SET_BASED, { slug: 'contains-duplicate' })]
	]
	for (const specs of scenarios) {
		const r = recFor(specs)
		allCopy(r).forEach((text) => assert.doesNotMatch(text, BANNED, `${text}`))
	}
})

// --- 17. Stable reason codes and resolvable evidence references ------------------

test('every reason code is stable and every evidence reference resolves against the evidence', () => {
	const scenarios: Spec[][] = [
		[],
		[att('a1', 0, 'fail', NESTED)],
		[att('a1', 0, 'fail', NESTED), att('a2', 4, 'fail', NESTED), att('a3', 8, 'fail', NESTED)],
		[att('a1', 0, 'pass', HASHMAP)],
		[
			att('a1', 0, 'fail', NESTED),
			att('a2', 4, 'fail', NESTED),
			att('a3', 8, 'pass', HASHMAP),
			att('c1', 1, 'pass', SET_BASED, { slug: 'contains-duplicate' })
		]
	]
	for (const specs of scenarios) {
		const { evidence } = buildFor(specs)
		const r = rankRecommendations(evidence)
		for (const problem of r.rankedProblems) {
			assert.ok(REASON_CODES.includes(problem.reasonCode), problem.reasonCode)
			for (const refItem of problem.evidenceRefs) {
				const hit = lookupMetric(evidence, refItem.problemSlug, refItem.metric)
				assert.ok(hit.found, `unresolved ref ${refItem.problemSlug}:${refItem.metric}`)
				assert.deepEqual(refItem.value, hit.found ? hit.value : undefined)
			}
		}
		for (const claim of r.diagnosis.claims) {
			const hit = lookupMetric(evidence, claim.problemSlug, claim.metric)
			assert.ok(hit.found, `unresolved claim ${claim.problemSlug}:${claim.metric}`)
		}
	}
})

// --- Hash reuse, determinism, volatile fields ------------------------------------

test('the engine reuses computeEvidenceHash and lets a caller pass a precomputed hash', () => {
	const { evidence } = buildFor([att('a1', 0, 'fail', NESTED)])
	assert.equal(rankRecommendations(evidence).evidenceHash, computeEvidenceHash(evidence))
	assert.equal(
		rankRecommendations(evidence, { evidenceHash: 'ev1:precomputed' }).evidenceHash,
		'ev1:precomputed'
	)
})

test('generatedAt is passed through and never affects anything else', () => {
	const { evidence } = buildFor([att('a1', 0, 'fail', NESTED)])
	const withTime = rankRecommendations(evidence, { generatedAt: '2026-11-02T00:00:00.000Z' })
	const withoutTime = rankRecommendations(evidence)
	assert.equal(withTime.generatedAt, '2026-11-02T00:00:00.000Z')
	assert.equal(withoutTime.generatedAt, null)
	assert.deepEqual({ ...withTime, generatedAt: null }, withoutTime)
})

test('every recommendation keeps summary and nextStep within their caps', () => {
	for (const specs of [[], [att('a1', 0, 'fail', NESTED)], [att('a1', 0, 'pass', HASHMAP)]]) {
		const r = recFor(specs as Spec[])
		assert.ok(r.diagnosis.summary.length <= MAX_SUMMARY)
		assert.ok(r.diagnosis.nextStep.length <= MAX_NEXT_STEP)
	}
})
