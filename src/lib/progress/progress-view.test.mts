import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROBLEMS } from '../trace/problems'
import { buildProgressView } from './progress-view'

// specs/features/progress-page.md — the signed-in views, from the design's example.
// The original two-problem catalog, pinned: these assertions are exact. The full
// catalog is covered in lib/learning/catalog-integration.test.mts.
const problems = [PROBLEMS['two-sum']!, PROBLEMS['contains-duplicate']!]
const view = buildProgressView(problems, {
	authenticated: true,
	available: true,
	progress: [
		{
			problemSlug: 'contains-duplicate',
			status: 'attempted',
			attempts: 2,
			bestTestsPassed: 2,
			testsTotal: 3,
			firstSolvedAt: null
		},
		{
			problemSlug: 'two-sum',
			status: 'solved',
			attempts: 3,
			bestTestsPassed: 3,
			testsTotal: 3,
			firstSolvedAt: '2026-11-01T16:12:00.000Z'
		},
		{
			problemSlug: 'retired',
			status: 'solved',
			attempts: 1,
			bestTestsPassed: 1,
			testsTotal: 1,
			firstSolvedAt: '2026-10-01T00:00:00.000Z'
		}
	],
	recentAttempts: [
		{
			problemSlug: 'contains-duplicate',
			createdAt: '2026-11-01T16:40:00.000Z',
			testsPassed: 2,
			testsTotal: 3,
			allPassed: false
		},
		{
			problemSlug: 'retired',
			createdAt: '2026-10-01T00:00:00.000Z',
			testsPassed: 1,
			testsTotal: 1,
			allPassed: true
		}
	]
})

test('AC4: summary counts solved of all problems, attempted problems and total runs', () => {
	assert.deepEqual(view.summary, { solved: 1, total: problems.length, attempted: 2, runs: 5 })
})

test('AC5: every registry problem in order, with status, best result, runs and solved date', () => {
	assert.deepEqual(
		view.problems.map((row) => row.slug),
		problems.map((problem) => problem.slug)
	)
	const twoSum = view.problems.find((row) => row.slug === 'two-sum')
	assert.deepEqual(twoSum, {
		slug: 'two-sum',
		title: 'Two Sum',
		status: 'solved',
		best: { passed: 3, total: 3 },
		runs: 3,
		solvedAt: '2026-11-01T16:12:00.000Z'
	})
	assert.equal(view.problems.find((row) => row.slug === 'contains-duplicate')?.status, 'attempted')
})

test('AC6: recent runs keep their order, use titles, and fall back to the slug', () => {
	assert.deepEqual(
		view.recent.map((run) => [run.title, run.passed, run.total, run.allPassed]),
		[
			['Contains Duplicate', 2, 3, false],
			['retired', 1, 1, true]
		]
	)
})

test('AC7: solved/total per topic, capitalised, in first-seen registry order', () => {
	assert.deepEqual(view.topics, [
		{ topic: 'Arrays', solved: 1, total: 2 },
		{ topic: 'Loops', solved: 1, total: 1 },
		{ topic: 'Hashing', solved: 0, total: 1 }
	])
})

test('edge: signed in with no runs — zeros, all not started, no best result', () => {
	const empty = buildProgressView(problems, {
		authenticated: true,
		available: true,
		progress: [],
		recentAttempts: []
	})
	assert.deepEqual(empty.summary, { solved: 0, total: problems.length, attempted: 0, runs: 0 })
	assert.ok(empty.problems.every((row) => row.status === 'not_started' && row.best == null))
	assert.equal(empty.recent.length, 0)
	assert.ok(empty.topics.every((topic) => topic.solved === 0))
})

test('edge: a saved row with no completed run has no best result', () => {
	const noRun = buildProgressView(problems, {
		authenticated: true,
		available: true,
		progress: [
			{
				problemSlug: 'two-sum',
				status: 'attempted',
				attempts: 1,
				bestTestsPassed: 0,
				testsTotal: 0,
				firstSolvedAt: null
			}
		],
		recentAttempts: []
	})
	assert.equal(noRun.problems.find((row) => row.slug === 'two-sum')?.best, null)
})
