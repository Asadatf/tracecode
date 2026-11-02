import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	RECOMMENDATION_EVIDENCE_VERSION,
	buildRecommendationEvidence,
	type CatalogEntry,
	type ConceptEvidence,
	type ProblemEvidence,
	type RecommendationEvidence
} from './recommendation-evidence.ts'
import { buildAttemptSequences } from './solution-evolution.ts'
import {
	CATALOG,
	HASHMAP,
	MARKER,
	NESTED,
	SET_BASED,
	analyticsOf,
	att,
	buildFor,
	evidenceRecords,
	m6Records
} from './evidence-fixtures.mts'

const problem = (e: RecommendationEvidence, slug: string) =>
	e.problems.find((p) => p.slug === slug) as ProblemEvidence
const concept = (e: RecommendationEvidence, tag: string) =>
	e.concepts.find((c) => c.tag === tag) as ConceptEvidence

test('an empty learner: nothing attempted, every catalog problem listed as not started', () => {
	const { evidence } = buildFor([])
	assert.equal(evidence.v, RECOMMENDATION_EVIDENCE_VERSION)
	assert.equal(evidence.hasActivity, false)
	assert.equal(evidence.totals.attempts, 0)
	assert.deepEqual(
		evidence.problems.map((p) => [p.slug, p.progress, p.known]),
		[
			['contains-duplicate', 'not_started', true],
			['two-sum', 'not_started', true]
		]
	)
	const sum = problem(evidence, 'two-sum')
	assert.deepEqual(sum.conceptTags, ['arrays', 'loops'])
	assert.equal(sum.difficulty, 'easy')
	assert.equal(sum.observed.attempts, 0)
	assert.equal(sum.observed.latestOutcome, 'none')
	assert.equal(sum.observed.windowCoversAllAttempts, true)
	assert.deepEqual(sum.observed.sequence.items, [])
	assert.deepEqual(sum.inferred.signals, [])
	assert.deepEqual(
		evidence.concepts.map((c) => c.tag),
		['arrays', 'hashing', 'loops']
	)
	assert.ok(
		evidence.concepts.every(
			(c) => c.observed.problemsAttempted === 0 && c.observed.problemsSolved === 0
		)
	)
	// M6's own "no activity" insight is observed, not inferred.
	assert.deepEqual(
		evidence.insights.observed.map((i) => i.type),
		['no_activity']
	)
	assert.deepEqual(evidence.insights.inferred, [])
})

test('observed facts and inferred gaps are separate, and M6 supplies both unchanged', () => {
	const specs = [
		att('a1', 0, 'fail', NESTED),
		att('a2', 5, 'fail', NESTED),
		att('a3', 9, 'fail', NESTED)
	]
	const { evidence, analytics } = buildFor(specs)
	const p = problem(evidence, 'two-sum')

	// Observed: straight from M6's statistics and behaviour.
	const stats = analytics.statistics.problems.find((s) => s.problemSlug === 'two-sum')
	const behavior = analytics.behavior.problems.find((b) => b.problemSlug === 'two-sum')
	assert.ok(stats && behavior)
	assert.equal(p.observed.attempts, stats.attempts)
	assert.equal(p.observed.failedAttempts, 3)
	assert.equal(p.observed.latestOutcome, 'failed')
	assert.equal(p.observed.longestFailureStreak, stats.longestFailureStreak)
	assert.deepEqual(p.observed.failurePattern, behavior.observed.failurePattern)
	assert.equal(p.observed.failurePattern.pattern, 'repeat_failures_unresolved')
	assert.deepEqual(p.observed.scoreChanges, behavior.observed.scoreChanges)
	assert.equal(p.progress, 'attempted')

	// Inferred: M6's own signals, each still tagged as inferred.
	assert.deepEqual(
		p.inferred.signals,
		[...behavior.inferred].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
	)
	const codes = p.inferred.signals.map((s) => s.code)
	assert.ok(codes.includes('possible_persistent_misconception'))
	assert.ok(codes.includes('unresolved_struggle'))
	assert.ok(p.inferred.signals.every((s) => s.basis === 'inferred'))

	// Neither layer leaks into the other.
	assert.doesNotMatch(JSON.stringify(p.observed.failurePattern), /inferred/)
	assert.doesNotMatch(JSON.stringify({ ...p.observed, sequence: undefined }), /"basis"/)
	assert.ok(p.observed.insights.every((i) => i.evidence === 'observed'))
	assert.ok(p.inferred.insights.every((i) => i.evidence === 'inferred'))
	assert.ok(p.observed.insights.some((i) => i.type === 'repeated_failure_unresolved'))
	assert.ok(p.inferred.insights.some((i) => i.type === 'persistent_test_failure'))
})

test('structure sits with the observed evidence, with outcomes, and is never turned into a gap', () => {
	const { evidence } = buildFor([
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'pass', HASHMAP)
	])
	const p = problem(evidence, 'two-sum')
	assert.deepEqual(
		p.observed.sequence.transitions.map((t) => t.change),
		['nested_loops_removed', 'loop_depth_decreased', 'dict_introduced']
	)
	assert.equal(p.progress, 'solved')
	assert.equal(p.observed.attemptsToFirstSolve, 3)
	// M7.2 adds no inference of its own: every inferred signal is one M6 defines.
	assert.doesNotMatch(JSON.stringify(p.inferred), /nested_loops|dict_introduced|loop_depth/)
})

test('failed -> failed -> passed is reported with its sequence and M6 recovery facts', () => {
	const { evidence } = buildFor([
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'pass', NESTED)
	])
	const p = problem(evidence, 'two-sum')
	assert.deepEqual(
		p.observed.sequence.items.map((i) => i.outcome),
		['failed', 'failed', 'passed']
	)
	assert.equal(p.observed.failurePattern.pattern, 'repeat_failures_recovered')
	assert.equal(p.observed.latestOutcome, 'passed')
})

test('concept aggregation counts problems, repeated failures, structure and M6 signals per tag', () => {
	const { evidence } = buildFor([
		att('t1', 0, 'fail', NESTED),
		att('t2', 4, 'fail', NESTED),
		att('t3', 8, 'pass', HASHMAP),
		att('c1', 1, 'fail', SET_BASED, { slug: 'contains-duplicate' }),
		att('c2', 5, 'fail', SET_BASED, { slug: 'contains-duplicate' })
	])
	const arrays = concept(evidence, 'arrays')
	assert.deepEqual(arrays.problems, ['contains-duplicate', 'two-sum'])
	assert.deepEqual(
		[
			arrays.observed.problemsInCatalog,
			arrays.observed.problemsAttempted,
			arrays.observed.problemsSolved,
			arrays.observed.problemsWithRepeatedFailures,
			arrays.observed.problemsWithOpenRepeatedFailures
		],
		[2, 2, 1, 2, 1]
	)
	const patterns = arrays.observed.structuralPatterns
	assert.deepEqual([patterns.nested_loops.disappeared, patterns.nested_loops.absent], [1, 1])
	assert.deepEqual([patterns.dict.appeared_once, patterns.dict.absent], [1, 1])
	assert.deepEqual([patterns.set.recurring, patterns.set.absent], [1, 1])
	assert.deepEqual(arrays.inferred.signals, { independent_first_solve: 1, unresolved_struggle: 1 })

	const loops = concept(evidence, 'loops')
	assert.deepEqual(loops.problems, ['two-sum'])
	assert.deepEqual([loops.observed.problemsAttempted, loops.observed.problemsSolved], [1, 1])
	const hashing = concept(evidence, 'hashing')
	assert.deepEqual([hashing.observed.problemsAttempted, hashing.observed.problemsSolved], [1, 0])
	assert.equal(hashing.observed.problemsWithOpenRepeatedFailures, 1)
})

test('a problem the catalog no longer has is kept as unknown and counted in no concept', () => {
	const { evidence } = buildFor([
		att('r1', 0, 'pass', NESTED, { slug: 'retired-problem' }),
		att('t1', 1, 'fail', NESTED)
	])
	const retired = problem(evidence, 'retired-problem')
	assert.equal(retired.known, false)
	assert.deepEqual(retired.conceptTags, [])
	assert.equal(retired.difficulty, null)
	assert.equal(retired.progress, 'solved')
	assert.ok(evidence.concepts.every((c) => !c.problems.includes('retired-problem')))
	assert.equal(
		concept(evidence, 'arrays').observed.problemsSolved,
		0,
		'the retired solve is not credited'
	)
	assert.deepEqual(
		evidence.problems.map((p) => p.slug),
		['contains-duplicate', 'retired-problem', 'two-sum']
	)
})

test('missing and unanalyzable fingerprints are reported as coverage, and evidence still builds', () => {
	const { evidence } = buildFor([
		att('a1', 0, 'fail', null),
		att('a2', 1, 'fail', MARKER),
		att('a3', 2, 'fail', null, {
			status: 'syntax_error',
			testsPassed: 0,
			testsTotal: 0,
			failedTestIds: []
		}),
		att('a4', 3, 'pass', HASHMAP)
	])
	const seq = problem(evidence, 'two-sum').observed.sequence
	assert.deepEqual(seq.coverage, { attempts: 4, withFeatures: 1, unanalyzable: 2, missing: 1 })
	assert.deepEqual(seq.transitions, [])
	assert.equal(problem(evidence, 'two-sum').observed.attempts, 4)
})

test('statistics without a sequence, or a sequence without statistics, do not break the build', () => {
	const specs = [att('a1', 0, 'fail', NESTED), att('a2', 1, 'fail', NESTED)]
	const analytics = analyticsOf(m6Records(specs))
	const noSequences = buildRecommendationEvidence(analytics, [], CATALOG)
	const p = problem(noSequences, 'two-sum')
	assert.equal(p.observed.attempts, 2)
	assert.equal(p.observed.windowCoversAllAttempts, false)
	assert.deepEqual(p.observed.sequence.items, [])

	const sequences = buildAttemptSequences(
		evidenceRecords([att('x1', 0, 'fail', NESTED, { slug: 'only-in-sequence' })])
	)
	const noStats = buildRecommendationEvidence(analyticsOf(m6Records([])), sequences, CATALOG)
	assert.equal(problem(noStats, 'only-in-sequence').known, false)
	assert.equal(problem(noStats, 'only-in-sequence').observed.sequence.items.length, 1)
})

test('assembly is deterministic: input order never matters and generatedAt is passed through, never read', () => {
	const specs = [
		att('t1', 0, 'fail', NESTED),
		att('t2', 3, 'pass', HASHMAP),
		att('c1', 1, 'fail', SET_BASED, { slug: 'contains-duplicate' })
	]
	const analytics = analyticsOf(m6Records(specs))
	const sequences = buildAttemptSequences(evidenceRecords(specs))
	const forward = buildRecommendationEvidence(analytics, sequences, CATALOG)
	const shuffled = buildRecommendationEvidence(
		analytics,
		[...sequences].reverse(),
		[...CATALOG].reverse()
	)
	assert.deepEqual(shuffled, forward)
	assert.equal(forward.generatedAt, null)
	const stamped = buildRecommendationEvidence(analytics, sequences, CATALOG, {
		generatedAt: '2026-11-02T00:00:00.000Z'
	})
	assert.equal(stamped.generatedAt, '2026-11-02T00:00:00.000Z')
	assert.deepEqual({ ...stamped, generatedAt: null }, forward)
})

test('a larger curated catalog needs no change to the contract', () => {
	const tags = ['arrays', 'loops', 'hashing', 'strings', 'recursion', 'sorting']
	const big: CatalogEntry[] = Array.from({ length: 14 }, (_, i) => ({
		slug: `p${String(i).padStart(2, '0')}`,
		conceptTags: [tags[i % tags.length] as string, tags[(i + 2) % tags.length] as string],
		difficulty: (['easy', 'medium', 'hard'] as const)[i % 3] ?? 'easy'
	}))
	const specs = [
		att('a1', 0, 'pass', NESTED, { slug: 'p03' }),
		att('a2', 1, 'fail', HASHMAP, { slug: 'p07' })
	]
	const small = buildFor(specs).evidence
	const large = buildFor(specs, { catalog: [...CATALOG, ...big] }).evidence
	assert.equal(large.problems.length, 2 + 14)
	assert.deepEqual(
		large.concepts.map((c) => c.tag),
		[...tags, ...['arrays', 'hashing', 'loops']].filter((t, i, a) => a.indexOf(t) === i).sort()
	)
	// Same shapes at any catalog size.
	assert.deepEqual(Object.keys(large), Object.keys(small))
	assert.deepEqual(Object.keys(large.problems[0] ?? {}), Object.keys(small.problems[0] ?? {}))
	assert.deepEqual(Object.keys(large.concepts[0] ?? {}), Object.keys(small.concepts[0] ?? {}))
	assert.equal(problem(large, 'p03').progress, 'solved')
	assert.equal(problem(large, 'p07').progress, 'attempted')
})

// The module may describe what the records and fingerprints show. It may not
// invent a mastery score, call a learner skilled, or say a structural change made
// a solution faster, better or more correct.
function walk(value: unknown, visit: (kind: 'key' | 'string', text: string) => void): void {
	if (typeof value === 'string') visit('string', value)
	else if (Array.isArray(value)) for (const item of value) walk(item, visit)
	else if (value != null && typeof value === 'object') {
		for (const [key, member] of Object.entries(value)) {
			visit('key', key)
			walk(member, visit)
		}
	}
}

test('no unsupported mastery, skill, speed or correctness claims anywhere M7.2 contributes', () => {
	const { evidence } = buildFor([
		att('t1', 0, 'fail', NESTED),
		att('t2', 4, 'fail', NESTED),
		att('t3', 8, 'pass', HASHMAP),
		att('c1', 1, 'pass', SET_BASED, { slug: 'contains-duplicate' })
	])
	const banned =
		/mastery|mastered|complexity|faster|slower|better|worse|optimal|efficien|improv|understand|proficien|skill|score|struggl/i
	// M7.2's own contributions, in full: the top-level shape, concepts, and each
	// problem's sequence, structure and progress label. (M6's fields, e.g. its
	// score-trend words, are M6's and are covered by M6's own tests.)
	const own: unknown[] = [
		Object.keys(evidence),
		evidence.concepts.map((c) => c.observed.structuralPatterns),
		evidence.concepts.map((c) => Object.keys(c)),
		evidence.concepts.map((c) => Object.keys(c.observed)),
		evidence.problems.map((p) => [p.progress, Object.keys(p), p.observed.sequence])
	]
	walk(own, (kind, text) => assert.doesNotMatch(text, banned, `${kind}: ${text}`))
	// A concept with one solved problem carries counts, not a verdict.
	const loops = concept(evidence, 'loops')
	assert.equal(loops.observed.problemsSolved, 1)
	assert.ok(
		!('mastered' in loops) && !('mastery' in loops.observed) && !('level' in loops.observed)
	)
	for (const c of evidence.concepts) {
		for (const value of Object.values(c.observed))
			assert.ok(typeof value === 'number' || typeof value === 'object')
	}
})
