import type { ProblemDefinition } from '@/lib/trace/problem'
import { topicLabel } from '@/lib/home/problem-rows'
import type { LearningProgressView } from '@/server/learning/progress'

// Everything /progress shows for a signed-in learner (specs/features/progress-page.md,
// AC4–AC7), worked out from their saved progress and the problem registry.

export type ProgressStatus = 'solved' | 'attempted' | 'not_started'

export interface ProgressProblemRow {
	slug: string
	title: string
	status: ProgressStatus
	// "3/3"-style best result, or null before any completed run.
	best: { passed: number; total: number } | null
	runs: number
	solvedAt: string | null
}

export interface RecentRun {
	key: string
	slug: string
	title: string
	passed: number
	total: number
	allPassed: boolean
	at: string
}

export interface TopicRow {
	topic: string
	solved: number
	total: number
}

export interface ProgressView {
	summary: { solved: number; total: number; attempted: number; runs: number }
	problems: ProgressProblemRow[]
	recent: RecentRun[]
	topics: TopicRow[]
}

export function buildProgressView(
	problems: readonly ProblemDefinition[],
	progress: LearningProgressView
): ProgressView {
	const saved = new Map(progress.progress.map((row) => [row.problemSlug, row]))
	const titles = new Map(problems.map((problem) => [problem.slug, problem.title]))

	const rows = problems.map((problem): ProgressProblemRow => {
		const row = saved.get(problem.slug)
		let status: ProgressStatus = 'not_started'
		if (row?.status === 'solved') status = 'solved'
		else if (row != null) status = 'attempted'
		return {
			slug: problem.slug,
			title: problem.title,
			status,
			best:
				row == null || row.testsTotal === 0
					? null
					: { passed: row.bestTestsPassed, total: row.testsTotal },
			runs: row?.attempts ?? 0,
			solvedAt: row?.firstSolvedAt ?? null
		}
	})

	const topics: TopicRow[] = []
	for (const problem of problems) {
		const solved = rows.find((row) => row.slug === problem.slug)?.status === 'solved'
		for (const tag of problem.conceptTags) {
			const topic = topicLabel(tag)
			let entry = topics.find((t) => t.topic === topic)
			if (entry == null) {
				entry = { topic, solved: 0, total: 0 }
				topics.push(entry)
			}
			entry.total += 1
			if (solved) entry.solved += 1
		}
	}

	const recent = progress.recentAttempts.map((attempt, index): RecentRun => ({
		key: `${attempt.createdAt}-${index}`,
		slug: attempt.problemSlug,
		title: titles.get(attempt.problemSlug) ?? attempt.problemSlug,
		passed: attempt.testsPassed,
		total: attempt.testsTotal,
		allPassed: attempt.allPassed,
		at: attempt.createdAt
	}))

	return {
		summary: {
			solved: rows.filter((row) => row.status === 'solved').length,
			total: rows.length,
			attempted: rows.filter((row) => row.status !== 'not_started').length,
			runs: rows.reduce((sum, row) => sum + row.runs, 0)
		},
		problems: rows,
		recent,
		topics
	}
}
