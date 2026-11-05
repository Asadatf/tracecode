import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPublicProfileStats, type PublicProgressRow } from './public-profile-stats.ts'
import { PROBLEMS } from '../trace/problems.ts'
import type { DailyActivity } from '../activity/daily-activity.ts'

const problems = Object.values(PROBLEMS)
const today = '2026-11-10'
const row = (
	problemSlug: string,
	status: 'solved' | 'attempted',
	attempts = 1
): PublicProgressRow => ({
	problemSlug,
	status,
	attempts,
	bestTestsPassed: status === 'solved' ? 4 : 1,
	testsTotal: 4,
	firstSolvedAt: status === 'solved' ? '2026-11-01T10:00:00.000Z' : null,
	latestSolvedAt: status === 'solved' ? '2026-11-02T10:00:00.000Z' : null,
	lastAttemptAt: '2026-11-02T10:00:00.000Z'
})
const day = (iso: string, attempts = 1): DailyActivity => ({
	day: iso,
	attempts,
	problems: 1,
	solved: 0
})

test('a learner with no data gets honest zeros and the empty flag, not placeholders', () => {
	const stats = buildPublicProfileStats({ problems, progress: [], days: [], runs: 0, today })
	assert.equal(stats.solved, 0)
	assert.equal(stats.totalProblems, problems.length)
	assert.equal(stats.runs, 0)
	assert.deepEqual(stats.streak, { current: 0, longest: 0, active: false })
	assert.deepEqual(stats.days, [])
	assert.equal(stats.empty, true)
	assert.ok(stats.topics.every((topic) => topic.solved === 0 && topic.attempted === 0))
})

test('solved counts distinct solved problems only; attempted-only does not count', () => {
	const stats = buildPublicProfileStats({
		problems,
		progress: [
			row('two-sum', 'solved', 3),
			row('binary-search', 'attempted', 5),
			row('valid-anagram', 'solved')
		],
		days: [],
		runs: 9,
		today
	})
	assert.equal(stats.solved, 2)
	assert.equal(stats.runs, 9)
	assert.equal(stats.empty, false)
})

test('slugs that are not in the catalogue are ignored, not counted', () => {
	const stats = buildPublicProfileStats({
		problems,
		progress: [row('retired-problem', 'solved'), row('two-sum', 'solved')],
		days: [],
		runs: 0,
		today
	})
	assert.equal(stats.solved, 1)
})

test('streaks come from exactly the activity days given', () => {
	const stats = buildPublicProfileStats({
		problems,
		progress: [],
		days: [
			day('2026-11-05'),
			day('2026-11-06'),
			day('2026-11-08'),
			day('2026-11-09'),
			day('2026-11-10')
		],
		runs: 5,
		today
	})
	assert.deepEqual(stats.streak, { current: 3, longest: 3, active: true })
	assert.deepEqual(
		stats.days.map((d) => d.day),
		['2026-11-05', '2026-11-06', '2026-11-08', '2026-11-09', '2026-11-10']
	)
	assert.equal(stats.today, today)
})

test('a broken streak keeps the longest and shows a current of 0', () => {
	const stats = buildPublicProfileStats({
		problems,
		progress: [],
		days: [day('2026-10-01'), day('2026-10-02'), day('2026-10-03'), day('2026-10-04')],
		runs: 4,
		today
	})
	assert.deepEqual(stats.streak, { current: 0, longest: 4, active: false })
})

test('topic coverage is derived from solved and attempted problems', () => {
	const stats = buildPublicProfileStats({
		problems,
		progress: [row('two-sum', 'solved'), row('binary-search', 'attempted')],
		days: [],
		runs: 2,
		today
	})
	const touched = stats.topics.filter((topic) => topic.attempted > 0)
	assert.ok(touched.length >= 1)
	for (const topic of stats.topics) {
		assert.ok(topic.solved <= topic.attempted && topic.attempted <= topic.total, topic.topic)
	}
	assert.ok(stats.topics.some((topic) => topic.solved >= 1))
})

test('runs are floored and never negative', () => {
	assert.equal(
		buildPublicProfileStats({ problems, progress: [], days: [], runs: -4, today }).runs,
		0
	)
	assert.equal(
		buildPublicProfileStats({ problems, progress: [], days: [], runs: 7.9, today }).runs,
		7
	)
})

test('the record is closed: only these keys, and nothing identifying or private', () => {
	const stats = buildPublicProfileStats({
		problems,
		progress: [row('two-sum', 'solved', 2)],
		days: [day('2026-11-10', 2)],
		runs: 2,
		today
	})
	assert.deepEqual(Object.keys(stats).sort(), [
		'days',
		'empty',
		'runs',
		'solved',
		'streak',
		'today',
		'topics',
		'totalProblems'
	])
	const text = JSON.stringify(stats)
	for (const word of [
		'userId',
		'email',
		'source',
		'attemptId',
		'createdAt',
		'lastAttemptAt',
		'firstSolvedAt',
		'password',
		'token'
	]) {
		assert.equal(text.includes(word), false, word)
	}
	// Topic rows carry only the topic name and counts.
	for (const topic of stats.topics)
		assert.deepEqual(Object.keys(topic).sort(), ['attempted', 'solved', 'topic', 'total'])
})
