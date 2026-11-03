import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PROBLEMS } from '../trace/problems.ts'
import { rankRecommendations } from './recommend.ts'
import { catalogEntries } from './recommendation-evidence.ts'
import { planReminder, practicePath, type CatalogProblem } from './reminder-plan.ts'
import { buildProgressView } from '../progress/progress-view.ts'
import { validateAiDiagnosis } from '../../server/learning/recommend-ai.ts'
import { HASHMAP, NESTED, SET_BASED, at, att, buildFor, type Spec } from './evidence-fixtures.mts'
import { computeEvidenceHash } from './evidence-hash.ts'

// The full catalog through M6 statistics, M7.2 evidence, M7.3 ranking,
// the M7.4 slug guard and the M7.5B reminder planner. Everything here is
// catalog-driven (Object.values(PROBLEMS)); these tests prove added problems
// (the curated pack, then problem pack 2) need no changes anywhere downstream. (The older M7 tests pin the
// original two-problem catalog — see evidence-fixtures.mts.)

const FULL = catalogEntries(Object.values(PROBLEMS))
const ALL_SLUGS = Object.keys(PROBLEMS).sort()
// Every problem after the original two.
const NEW_SLUGS = ALL_SLUGS.filter((slug) => slug !== 'two-sum' && slug !== 'contains-duplicate')
const CATALOG_SIZE = Object.keys(PROBLEMS).length
const tagged = (tag: string) =>
	Object.values(PROBLEMS).filter((p) => p.conceptTags.includes(tag)).length

// An attempt on a new problem, sized to that problem's real test count.
function attempt(
	id: string,
	slug: string,
	minute: number,
	result: 'pass' | 'fail',
	features: unknown = null
): Spec {
	const total = PROBLEMS[slug]!.tests.length
	return att(id, minute, result, features, {
		slug,
		testsTotal: total,
		testsPassed: result === 'pass' ? total : 1,
		failedTestIds: result === 'pass' ? [] : ['t2', 't3']
	})
}

test('catalog entries: every problem has a difficulty and concept tags the evidence recognizes', () => {
	assert.equal(FULL.length, CATALOG_SIZE)
	const { evidence } = buildFor([], { catalog: FULL })
	assert.deepEqual(
		evidence.problems.map((p) => p.slug),
		ALL_SLUGS
	)
	assert.ok(evidence.problems.every((p) => p.known))
	const tags = evidence.concepts.map((c) => c.tag)
	for (const tag of [
		'arrays',
		'binary-search',
		'hashing',
		'loops',
		'stacks',
		'strings',
		'two-pointers'
	]) {
		assert.ok(tags.includes(tag), `concept ${tag}`)
	}
	const byTag = Object.fromEntries(evidence.concepts.map((c) => [c.tag, c]))
	assert.ok(byTag['stacks'] != null && byTag['binary-search'] != null)
})

test('a brand-new learner: a deterministic, existing, not-yet-started problem is ranked first', () => {
	const { evidence } = buildFor([], { catalog: FULL })
	const first = rankRecommendations(evidence)
	const second = rankRecommendations(structuredClone(evidence))
	assert.deepEqual(first, second)
	assert.deepEqual(first.rankedProblems.map((p) => p.slug).sort(), ALL_SLUGS)
	assert.ok(first.rankedProblems.every((p) => PROBLEMS[p.slug] != null))
	assert.ok(first.rankedProblems.every((p) => p.reasonCode === 'not_attempted'))
	assert.ok(first.rankedProblems.length === CATALOG_SIZE && first.rankedProblems[0] != null)
})

test('equal-score ties break by difficulty then slug — identically on every run', () => {
	const { evidence } = buildFor([], { catalog: FULL })
	const orders = Array.from({ length: 5 }, () =>
		rankRecommendations(evidence)
			.rankedProblems.map((p) => p.slug)
			.join()
	)
	assert.equal(new Set(orders).size, 1)
	// All untouched, so the order is by difficulty (easy first), then by slug.
	const rank = { easy: 0, medium: 1, hard: 2 } as const
	const expected = [...ALL_SLUGS].sort(
		(a, b) => rank[PROBLEMS[a]!.difficulty] - rank[PROBLEMS[b]!.difficulty] || a.localeCompare(b)
	)
	assert.deepEqual(orders[0]!.split(','), expected)
})

test('attempts on the new problems: failures open a run, a solve closes it, solved is never re-recommended while others remain', () => {
	const specs = [
		attempt('f1', 'valid-anagram', 0, 'fail', NESTED),
		attempt('f2', 'valid-anagram', 4, 'fail', NESTED),
		attempt('f3', 'valid-anagram', 8, 'fail', NESTED),
		attempt('s1', 'binary-search', 10, 'pass', HASHMAP)
	]
	const { evidence } = buildFor(specs, { catalog: FULL })
	const progress = Object.fromEntries(evidence.problems.map((p) => [p.slug, p.progress]))
	assert.equal(progress['valid-anagram'], 'attempted')
	assert.equal(progress['binary-search'], 'solved')
	assert.equal(progress['move-zeroes'], 'not_started')

	const rec = rankRecommendations(evidence)
	const states = Object.fromEntries(rec.rankedProblems.map((p) => [p.slug, p.reasonCode]))
	assert.equal(states['valid-anagram'], 'open_repeated_failures')
	assert.equal(states['binary-search'], 'solved_revision')
	const top = rec.rankedProblems[0]!
	assert.equal(top.slug, 'valid-anagram')
	const solvedRank = rec.rankedProblems.findIndex((p) => p.slug === 'binary-search')
	const untouched = rec.rankedProblems.filter((p) => p.reasonCode === 'not_attempted')
	assert.equal(untouched.length, CATALOG_SIZE - 2)
	assert.ok(untouched.every((p) => rec.rankedProblems.indexOf(p) < solvedRank))
})

test('solving only the new problems still leaves the original two as not started', () => {
	const specs = NEW_SLUGS.map((slug, i) => attempt(`s${i}`, slug, i, 'pass', HASHMAP))
	const { evidence } = buildFor(specs, { catalog: FULL })
	const rec = rankRecommendations(evidence)
	assert.deepEqual(
		rec.rankedProblems
			.filter((p) => p.reasonCode === 'not_attempted')
			.map((p) => p.slug)
			.sort(),
		['contains-duplicate', 'two-sum']
	)
})

test('existing learner records stay valid: two-sum evidence is identical with or without the new problems', () => {
	const specs = [att('a1', 0, 'fail', NESTED), att('a2', 5, 'pass', HASHMAP)]
	const original = catalogEntries([PROBLEMS['two-sum']!, PROBLEMS['contains-duplicate']!])
	const before = buildFor(specs, { catalog: original }).evidence
	const after = buildFor(specs, { catalog: FULL }).evidence
	assert.deepEqual(
		after.problems.find((p) => p.slug === 'two-sum'),
		before.problems.find((p) => p.slug === 'two-sum')
	)
	assert.equal(after.totals.attempts, before.totals.attempts)
	assert.notEqual(
		computeEvidenceHash(after),
		computeEvidenceHash(before),
		'a bigger catalog is a different fingerprint'
	)
})

test('history on a slug the catalog does not have is kept as unknown and never recommended', () => {
	const specs = [
		attempt('a1', 'move-zeroes', 0, 'fail', NESTED),
		att('x1', 1, 'pass', HASHMAP, { slug: 'retired-problem' })
	]
	const { evidence } = buildFor(specs, { catalog: FULL })
	assert.equal(evidence.problems.find((p) => p.slug === 'retired-problem')?.known, false)
	const rec = rankRecommendations(evidence)
	assert.ok(rec.rankedProblems.every((p) => PROBLEMS[p.slug] != null))
	assert.ok(!rec.rankedProblems.some((p) => p.slug === 'retired-problem'))
})

test('the AI guard accepts a new catalog slug and rejects a nonexistent one', () => {
	const { evidence } = buildFor([attempt('a1', 'move-zeroes', 0, 'fail', NESTED)], {
		catalog: FULL
	})
	const response = (problemSlug: string) => ({
		summary: 'Move Zeroes has one failed attempt.',
		nextStep: 'Replay the failing test.',
		claims: [{ problemSlug, metric: 'observed.attempts' }]
	})
	assert.deepEqual(validateAiDiagnosis(response('move-zeroes') as never, evidence).ok, true)
	const bad = validateAiDiagnosis(response('two-pointers-pro') as never, evidence)
	assert.equal(bad.ok, false)
})

test('the reminder planner only ever points at a catalog problem, with a resolvable route', () => {
	const catalog: CatalogProblem[] = Object.values(PROBLEMS).map((p) => ({
		slug: p.slug,
		title: p.title,
		conceptTags: p.conceptTags
	}))
	const histories: Spec[][] = [
		[],
		[attempt('a1', 'valid-parentheses', 0, 'fail', NESTED)],
		[attempt('a1', 'valid-parentheses', 0, 'pass', SET_BASED)],
		NEW_SLUGS.map((slug, i) => attempt(`s${i}`, slug, i, 'pass', HASHMAP))
	]
	for (const specs of histories) {
		const { evidence } = buildFor(specs, { catalog: FULL })
		const plan = planReminder(rankRecommendations(evidence), evidence, catalog, at(60 * 24 * 5))
		if (plan == null) continue
		assert.ok(PROBLEMS[plan.problemSlug], `plan slug ${plan.problemSlug} exists`)
		assert.equal(practicePath(plan.problemSlug), `/practice/${plan.problemSlug}`)
	}
})

test('M6 statistics and the progress view count the new problems', () => {
	const specs = [
		attempt('a1', 'valid-parentheses', 0, 'pass', HASHMAP),
		attempt('a2', 'move-zeroes', 1, 'fail', NESTED)
	]
	const { analytics } = buildFor(specs, { catalog: FULL })
	const slugs = analytics.statistics.problems.map((p) => p.problemSlug)
	assert.deepEqual(slugs, ['move-zeroes', 'valid-parentheses'])
	assert.equal(
		analytics.statistics.problems.find((p) => p.problemSlug === 'valid-parentheses')?.solved,
		true
	)

	const view = buildProgressView(Object.values(PROBLEMS), {
		authenticated: true,
		available: true,
		progress: [
			{
				problemSlug: 'valid-parentheses',
				status: 'solved',
				attempts: 1,
				bestTestsPassed: 26,
				testsTotal: 26,
				firstSolvedAt: at(0).toISOString(),
				lastAttemptAt: at(0).toISOString()
			}
		],
		recentAttempts: []
	} as never)
	assert.equal(view.summary.total, CATALOG_SIZE)
	assert.equal(view.summary.solved, 1)
	assert.deepEqual(
		view.topics.filter((t) => ['Strings', 'Stacks'].includes(t.topic)),
		[
			{ topic: 'Strings', solved: 1, attempted: 1, total: tagged('strings') },
			{ topic: 'Stacks', solved: 1, attempted: 1, total: tagged('stacks') }
		]
	)
})

test('every practice route resolves: each catalog slug is a key of PROBLEMS and matches its path', () => {
	for (const [key, problem] of Object.entries(PROBLEMS)) {
		assert.equal(problem.slug, key)
		assert.equal(practicePath(problem.slug), `/practice/${key}`)
	}
})
