import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROBLEMS } from '../trace/problems.ts'
import { STUDY_PLANS, findPlan } from './plans.ts'
import { buildPlanView, buildPlanViews } from './plan-view.ts'
import type { LearningProgressView } from '../../server/learning/progress.ts'

// specs/features/study-plans.md

function progress(
	rows: Record<string, 'solved' | 'attempted'>,
	available = true
): LearningProgressView {
	return {
		authenticated: true,
		available,
		progress: Object.entries(rows).map(([problemSlug, status]) => ({
			problemSlug,
			status,
			attempts: 1,
			bestTestsPassed: 0,
			testsTotal: 0,
			firstSolvedAt: null,
			latestSolvedAt: null
		})),
		recentAttempts: [],
		replaysInspected: 0,
		hintsRevealed: 0
	}
}

const arrays = findPlan('arrays-and-hashing')!

test('AC6: every plan slug exists in the registry and no plan repeats a slug', () => {
	const planSlugs = STUDY_PLANS.map((plan) => plan.slug)
	assert.equal(new Set(planSlugs).size, planSlugs.length, 'plan slugs are unique')
	for (const plan of STUDY_PLANS) {
		assert.match(plan.slug, /^[a-z]+(-[a-z]+)*$/)
		assert.ok(plan.problems.length >= 2, `${plan.slug}: at least two problems`)
		assert.equal(new Set(plan.problems).size, plan.problems.length, `${plan.slug}: no repeats`)
		for (const slug of plan.problems) assert.ok(PROBLEMS[slug] != null, `${plan.slug}: ${slug}`)
	}
})

test('AC2–AC3: counts and statuses in plan order', () => {
	const view = buildPlanView(
		arrays,
		PROBLEMS,
		progress({ 'two-sum': 'solved', 'valid-anagram': 'attempted' })
	)
	assert.equal(view.total, 6)
	assert.equal(view.solved, 1)
	assert.deepEqual(
		view.problems.map((p) => [p.number, p.slug, p.status]),
		[
			[1, 'two-sum', 'solved'],
			[2, 'contains-duplicate', 'not_started'],
			[3, 'valid-anagram', 'attempted'],
			[4, 'first-unique-character', 'not_started'],
			[5, 'majority-element', 'not_started'],
			[6, 'missing-number', 'not_started']
		]
	)
	assert.equal(view.started, true)
})

test('AC4: Continue goes to the first unsolved problem; all solved is Completed', () => {
	const partway = buildPlanView(
		arrays,
		PROBLEMS,
		progress({ 'two-sum': 'solved', 'valid-anagram': 'solved' })
	)
	assert.equal(partway.continueSlug, 'contains-duplicate')
	assert.equal(partway.completed, false)

	const done = buildPlanView(
		arrays,
		PROBLEMS,
		progress(Object.fromEntries(arrays.problems.map((slug) => [slug, 'solved' as const])))
	)
	assert.equal(done.completed, true)
	assert.equal(done.continueSlug, null)

	const fresh = buildPlanView(arrays, PROBLEMS, progress({}))
	assert.equal(fresh.continueSlug, 'two-sum')
	assert.equal(fresh.started, false)
})

test('AC7: progress unavailable → statuses unknown, never "completed"', () => {
	const views = buildPlanViews(STUDY_PLANS, PROBLEMS, progress({ 'two-sum': 'solved' }, false))
	assert.equal(views.tracked, false)
	for (const plan of views.plans) {
		assert.ok(plan.problems.every((p) => p.status === 'unknown'))
		assert.equal(plan.completed, false)
		assert.equal(plan.continueSlug, plan.problems[0]?.slug)
	}
})
