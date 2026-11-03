import type { ProblemSummary } from '@/lib/problems/problem-summary'

// What the Overview's centre column shows besides the metrics
// (specs/features/dashboard-page.md AC6, AC25–AC28), taken from the learner's
// persisted summaries. Nothing is estimated; no attempt record is changed.

// The Progress card shows the five most recently attempted distinct problems.
export const PROGRESS_LIMIT = 5
// Explore scrolls after five rows in CSS; the cap just keeps it bounded.
export const EXPLORE_LIMIT = 20

export interface DashboardSections {
	progress: ProblemSummary[]
	explore: ProblemSummary[]
}

export interface RecommendationInput {
	// The right-hand panel's own ranking, best first.
	rankedSlugs: readonly string[]
}

// Distinct problems with at least one saved attempt, latest attempt first.
function recentlyAttempted(summaries: readonly ProblemSummary[]): ProblemSummary[] {
	return summaries
		.filter((row) => row.lastAttemptAt != null && row.status !== 'not_started')
		.sort((a, b) => Date.parse(b.lastAttemptAt ?? '') - Date.parse(a.lastAttemptAt ?? ''))
		.slice(0, PROGRESS_LIMIT)
}

// Problems never attempted, in the recommendation engine's ranking when there is
// one (otherwise catalogue order). The recommended problem is listed too: the
// Overview should account for every problem the learner has not started.
function unattempted(
	summaries: readonly ProblemSummary[],
	rankedSlugs: readonly string[]
): ProblemSummary[] {
	const rank = new Map(rankedSlugs.map((slug, index) => [slug, index]))
	const order = (slug: string) => rank.get(slug) ?? Number.MAX_SAFE_INTEGER
	return summaries
		.filter((row) => row.status === 'not_started')
		.map((row, index) => ({ row, index }))
		.sort((a, b) => order(a.row.slug) - order(b.row.slug) || a.index - b.index)
		.map(({ row }) => row)
		.slice(0, EXPLORE_LIMIT)
}

export function buildDashboardSections(
	summaries: readonly ProblemSummary[],
	recommendation: RecommendationInput | null
): DashboardSections {
	return {
		progress: recentlyAttempted(summaries),
		explore: unattempted(summaries, recommendation?.rankedSlugs ?? [])
	}
}
