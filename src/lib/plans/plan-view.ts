import type { ProblemDefinition } from '@/lib/trace/problem'
import type { ProblemStatus } from '@/lib/home/problem-rows'
import type { LearningProgressView } from '@/server/learning/progress'
import type { StudyPlan } from './plans'

// What the study-plan pages show (specs/features/study-plans.md, AC2–AC4, AC7),
// built from the plan, the registry and the learner's saved progress.

export interface PlanProblemRow {
	number: number
	slug: string
	title: string
	difficulty: ProblemDefinition['difficulty']
	status: ProblemStatus
}

export interface PlanView {
	slug: string
	title: string
	description: string
	total: number
	solved: number
	completed: boolean
	// The first unsolved problem in plan order, or null once completed (AC4).
	continueSlug: string | null
	// Whether the learner has started the plan (a "Continue" vs. "Start" label).
	started: boolean
	problems: PlanProblemRow[]
}

export interface PlanViews {
	// false when progress can't be read: statuses are 'unknown' (AC7).
	tracked: boolean
	plans: PlanView[]
}

export function buildPlanView(
	plan: StudyPlan,
	problems: Readonly<Record<string, ProblemDefinition>>,
	progress: LearningProgressView
): PlanView {
	const tracked = progress.authenticated && progress.available
	const statusBySlug = new Map(progress.progress.map((row) => [row.problemSlug, row.status]))
	const rows = plan.problems.flatMap((slug, index): PlanProblemRow[] => {
		const problem = problems[slug]
		if (problem == null) return []
		const saved = statusBySlug.get(slug)
		let status: ProblemStatus = 'unknown'
		if (tracked) status = saved === 'solved' || saved === 'attempted' ? saved : 'not_started'
		return [
			{ number: index + 1, slug, title: problem.title, difficulty: problem.difficulty, status }
		]
	})
	const solved = rows.filter((row) => row.status === 'solved').length
	const completed = tracked && rows.length > 0 && solved === rows.length
	return {
		slug: plan.slug,
		title: plan.title,
		description: plan.description,
		total: rows.length,
		solved,
		completed,
		continueSlug: completed ? null : (rows.find((row) => row.status !== 'solved')?.slug ?? null),
		started: rows.some((row) => row.status === 'solved' || row.status === 'attempted'),
		problems: rows
	}
}

export function buildPlanViews(
	plans: readonly StudyPlan[],
	problems: Readonly<Record<string, ProblemDefinition>>,
	progress: LearningProgressView
): PlanViews {
	return {
		tracked: progress.authenticated && progress.available,
		plans: plans.map((plan) => buildPlanView(plan, problems, progress))
	}
}
