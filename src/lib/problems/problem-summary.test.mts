import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProgressView } from '../progress/progress-view.ts'
import {
	buildProblemSummaries,
	matchesStatus,
	practiceAction,
	type StatusFilter
} from './problem-summary.ts'
import type { ProblemDefinition } from '../trace/problem.ts'

const problem = (slug: string, title: string, tags: string[]): ProblemDefinition =>
	({ slug, title, difficulty: 'easy', conceptTags: tags }) as unknown as ProblemDefinition
const problems = [
	problem('two-sum', 'Two Sum', ['arrays', 'loops']),
	problem('contains-duplicate', 'Contains Duplicate', ['arrays', 'hashing']),
	problem('valid-anagram', 'Valid Anagram', ['strings', 'hashing'])
]
const progress = [
	{
		problemSlug: 'two-sum',
		status: 'solved',
		attempts: 6,
		bestTestsPassed: 3,
		testsTotal: 3,
		firstSolvedAt: '2026-11-01T10:00:00.000Z',
		latestSolvedAt: '2026-11-03T10:40:00.000Z',
		lastAttemptAt: '2026-11-03T10:51:00.000Z'
	},
	{
		problemSlug: 'contains-duplicate',
		status: 'attempted',
		attempts: 2,
		bestTestsPassed: 1,
		testsTotal: 3,
		firstSolvedAt: null,
		latestSolvedAt: null,
		lastAttemptAt: '2026-11-02T09:00:00.000Z'
	}
]
const view = buildProgressView(problems, {
	authenticated: true,
	available: true,
	progress,
	recentAttempts: [],
	replaysInspected: 0,
	hintsRevealed: 0
})
const first = {
	'two-sum': '2026-10-30T08:00:00.000Z',
	'contains-duplicate': '2026-11-02T08:30:00.000Z'
}

test('summaries carry real persisted fields in catalogue order', () => {
	const rows = buildProblemSummaries(problems, view, first)
	assert.deepEqual(
		rows.map((row) => [row.number, row.slug, row.status, row.attempts]),
		[
			[1, 'two-sum', 'solved', 6],
			[2, 'contains-duplicate', 'attempted', 2],
			[3, 'valid-anagram', 'not_started', 0]
		]
	)
	const two = rows[0]
	assert.equal(two?.topics, 'Arrays, Loops')
	assert.deepEqual(two?.tags, ['Arrays', 'Loops'])
	assert.deepEqual(two?.best, { passed: 3, total: 3 })
	assert.equal(two?.firstAttemptAt, first['two-sum'])
	assert.equal(two?.lastAttemptAt, '2026-11-03T10:51:00.000Z')
	assert.equal(two?.solvedAt, '2026-11-01T10:00:00.000Z')
	assert.equal(two?.latestSolvedAt, '2026-11-03T10:40:00.000Z')
	// Never attempted: nothing invented.
	const none = rows[2]
	assert.deepEqual(
		[none?.best, none?.firstAttemptAt, none?.lastAttemptAt, none?.solvedAt],
		[null, null, null, null]
	)
})

test('unreadable progress gives unknown statuses, not invented ones', () => {
	const rows = buildProblemSummaries(problems, null, {})
	assert.ok(rows.every((row) => row.status === 'unknown' && row.attempts === 0))
})

test('the Practice action: Start, Continue or Reattempt', () => {
	assert.equal(practiceAction('not_started'), 'start')
	assert.equal(practiceAction('attempted'), 'continue')
	assert.equal(practiceAction('solved'), 'reattempt')
	assert.equal(practiceAction('unknown'), 'start')
})

test('status filter: Attempted includes solved; Unsolved is attempted-not-solved', () => {
	const rows = buildProblemSummaries(problems, view, first)
	const slugs = (filter: StatusFilter) =>
		rows.filter((row) => matchesStatus(row, filter)).map((row) => row.slug)
	assert.deepEqual(slugs('all'), ['two-sum', 'contains-duplicate', 'valid-anagram'])
	assert.deepEqual(slugs('attempted'), ['two-sum', 'contains-duplicate'])
	assert.deepEqual(slugs('not_started'), ['valid-anagram'])
	assert.deepEqual(slugs('solved'), ['two-sum'])
	assert.deepEqual(slugs('unsolved'), ['contains-duplicate'])
})
