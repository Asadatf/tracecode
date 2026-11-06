import type { ProblemDefinition } from '@/lib/trace/problem'
import type { LearningProgressView } from '@/server/learning/progress'

// The home page's problem table (specs/features/home-page.md, AC6–AC8): one row
// per registry problem, in registry order, with the signed-in learner's status.

export type ProblemStatus = 'solved' | 'attempted' | 'not_started' | 'unknown'

export interface ProblemRow {
	number: number
	slug: string
	title: string
	topics: string
	difficulty: ProblemDefinition['difficulty']
	status: ProblemStatus
}

export interface ProblemTable {
	rows: ProblemRow[]
	// false when nobody is signed in or saved progress can't be read: every
	// status is then 'unknown' and the page asks the learner to sign in.
	tracked: boolean
}

// A concept tag as people read it: 'arrays' → 'Arrays'.
export function topicLabel(tag: string): string {
	return tag.charAt(0).toUpperCase() + tag.slice(1)
}

// The landing page is an introduction, not the catalogue: it shows this many problems however
// large the registry grows, and links to /problems for the rest.
export const LANDING_PROBLEM_LIMIT = 6

export function buildProblemTable(
	problems: readonly ProblemDefinition[],
	progress: LearningProgressView,
	limit: number = LANDING_PROBLEM_LIMIT
): ProblemTable {
	const tracked = progress.authenticated && progress.available
	const statusBySlug = new Map(progress.progress.map((row) => [row.problemSlug, row.status]))

	const rows = problems.slice(0, limit).map((problem, index): ProblemRow => {
		const saved = statusBySlug.get(problem.slug)
		let status: ProblemStatus = 'unknown'
		if (tracked) status = saved === 'solved' || saved === 'attempted' ? saved : 'not_started'
		return {
			number: index + 1,
			slug: problem.slug,
			title: problem.title,
			topics: problem.conceptTags.map(topicLabel).join(', '),
			difficulty: problem.difficulty,
			status
		}
	})

	return { rows, tracked }
}
