import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProgressView } from './progress-view.ts'
import { buildDashboardSections, PROGRESS_LIMIT } from './dashboard-sections.ts'
import { buildProblemSummaries } from '../problems/problem-summary.ts'
import type { ProblemDefinition } from '../trace/problem.ts'

const problem = (slug: string, title: string, tag: string): ProblemDefinition =>
	({ slug, title, difficulty: 'easy', conceptTags: [tag] }) as unknown as ProblemDefinition
const problems = [
	problem('two-sum', 'Two Sum', 'arrays'),
	problem('contains-duplicate', 'Contains Duplicate', 'hashing'),
	problem('valid-anagram', 'Valid Anagram', 'strings'),
	problem('move-zeroes', 'Move Zeroes', 'two-pointers'),
	problem('binary-search', 'Binary Search', 'arrays'),
	problem('valid-parentheses', 'Valid Parentheses', 'stacks'),
	problem('seventh', 'Seventh', 'arrays')
]
const at = (n: number) => new Date(Date.UTC(2026, 10, 3, 12, n)).toISOString()
const row = (slug: string, status: string, attempts: number, lastAt: number) => ({
	problemSlug: slug,
	status,
	attempts,
	bestTestsPassed: 1,
	testsTotal: 3,
	firstSolvedAt: status === 'solved' ? at(1) : null,
	latestSolvedAt: null,
	lastAttemptAt: at(lastAt)
})
function summaries(progress: ReturnType<typeof row>[]) {
	const view = buildProgressView(problems, {
		authenticated: true,
		available: true,
		progress,
		recentAttempts: [],
		replaysInspected: 0,
		hintsRevealed: 0
	})
	return buildProblemSummaries(problems, view, {})
}
const none = null

test('Progress: the five most recently attempted distinct problems, latest first', () => {
	const rows = summaries([
		row('two-sum', 'solved', 6, 3),
		row('contains-duplicate', 'attempted', 4, 9),
		row('valid-anagram', 'attempted', 2, 7),
		row('move-zeroes', 'attempted', 1, 5),
		row('valid-parentheses', 'solved', 8, 8),
		row('binary-search', 'attempted', 3, 6)
	])
	const { progress } = buildDashboardSections(rows, none)
	assert.equal(progress.length, PROGRESS_LIMIT)
	assert.deepEqual(
		progress.map((item) => item.slug),
		['contains-duplicate', 'valid-parentheses', 'valid-anagram', 'binary-search', 'move-zeroes']
	)
	// The oldest (two-sum, attempted at :03) is the one that falls off.
	assert.ok(!progress.some((item) => item.slug === 'two-sum'))
	// Real attempt counts and statuses.
	assert.deepEqual(
		progress.slice(0, 2).map((item) => [item.status, item.attempts]),
		[
			['attempted', 4],
			['solved', 8]
		]
	)
})

test('Progress: never lists a problem that has not been attempted', () => {
	const { progress } = buildDashboardSections(summaries([row('two-sum', 'solved', 1, 1)]), none)
	assert.deepEqual(
		progress.map((item) => item.slug),
		['two-sum']
	)
})

test('Explore: only unattempted problems, ranked order, including the recommended one', () => {
	const rows = summaries([
		row('two-sum', 'solved', 1, 1),
		row('contains-duplicate', 'attempted', 1, 2)
	])
	const { explore } = buildDashboardSections(rows, {
		rankedSlugs: ['binary-search', 'valid-anagram', 'move-zeroes', 'valid-parentheses']
	})
	assert.deepEqual(
		explore.map((item) => item.slug),
		['binary-search', 'valid-anagram', 'move-zeroes', 'valid-parentheses', 'seventh']
	)
	assert.ok(explore.every((item) => item.status === 'not_started'))
})

test('Explore: catalogue order without a ranking; a recommended problem is still listed', () => {
	assert.deepEqual(
		buildDashboardSections(summaries([]), none).explore.map((item) => item.slug),
		problems.map((p) => p.slug)
	)
	const rows = summaries(
		problems
			.filter((p) => p.slug !== 'binary-search')
			.map((p, i) => row(p.slug, 'solved', 1, i + 1))
	)
	assert.deepEqual(
		buildDashboardSections(rows, { rankedSlugs: ['binary-search'] }).explore.map((i) => i.slug),
		['binary-search']
	)
})

test('empty states: a new learner has nothing in Progress and everything to explore', () => {
	const sections = buildDashboardSections(summaries([]), none)
	assert.deepEqual(sections.progress, [])
	assert.equal(sections.explore.length, problems.length)
})

test('a learner who has attempted everything has nothing to explore', () => {
	const sections = buildDashboardSections(
		summaries(problems.map((p, i) => row(p.slug, 'solved', 1, i + 1))),
		none
	)
	assert.deepEqual(sections.explore, [])
	assert.equal(sections.progress.length, PROGRESS_LIMIT)
})
