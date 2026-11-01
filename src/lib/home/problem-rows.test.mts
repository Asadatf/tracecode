import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROBLEMS } from '../trace/problems'
import { buildProblemTable } from './problem-rows'

const problems = Object.values(PROBLEMS)
const signedOut = { authenticated: false, available: false, progress: [], recentAttempts: [] }

test('AC6: one row per registry problem, in registry order, with topics and difficulty', () => {
	const { rows } = buildProblemTable(problems, signedOut)
	assert.equal(rows.length, problems.length)
	assert.deepEqual(
		rows.map((row) => [row.number, row.slug]),
		problems.map((problem, index) => [index + 1, problem.slug])
	)
	const twoSum = rows.find((row) => row.slug === 'two-sum')
	assert.equal(twoSum?.topics, 'Arrays, Loops')
	assert.equal(twoSum?.difficulty, 'easy')
})

test('AC7: a signed-in learner sees solved, attempted and not started', () => {
	const { rows, tracked } = buildProblemTable(problems, {
		authenticated: true,
		available: true,
		progress: [
			{
				problemSlug: 'two-sum',
				status: 'solved',
				attempts: 3,
				bestTestsPassed: 3,
				testsTotal: 3,
				firstSolvedAt: null
			},
			{
				problemSlug: 'contains-duplicate',
				status: 'attempted',
				attempts: 1,
				bestTestsPassed: 1,
				testsTotal: 3,
				firstSolvedAt: null
			}
		],
		recentAttempts: []
	})
	assert.equal(tracked, true)
	assert.equal(rows.find((row) => row.slug === 'two-sum')?.status, 'solved')
	assert.equal(rows.find((row) => row.slug === 'contains-duplicate')?.status, 'attempted')

	const fresh = buildProblemTable(problems, { ...signedOut, authenticated: true, available: true })
	assert.ok(fresh.rows.every((row) => row.status === 'not_started'))
})

test('AC8: signed out, or progress unavailable, every status is unknown and untracked', () => {
	for (const view of [signedOut, { ...signedOut, authenticated: true }]) {
		const { rows, tracked } = buildProblemTable(problems, view)
		assert.equal(tracked, false)
		assert.ok(rows.every((row) => row.status === 'unknown'))
	}
})

test('edge: a slug in saved progress but not in the registry adds no row', () => {
	const { rows } = buildProblemTable(problems, {
		authenticated: true,
		available: true,
		progress: [
			{
				problemSlug: 'retired',
				status: 'solved',
				attempts: 1,
				bestTestsPassed: 1,
				testsTotal: 1,
				firstSolvedAt: null
			}
		],
		recentAttempts: []
	})
	assert.equal(rows.length, problems.length)
})
