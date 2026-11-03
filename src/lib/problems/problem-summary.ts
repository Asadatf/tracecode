import type { ProblemDefinition } from '@/lib/trace/problem'
import { topicLabel } from '@/lib/home/problem-rows'
import type { ProgressView } from '@/lib/progress/progress-view'

// One learner-and-problem record shared by the Overview's Progress card, the
// Problems table and the single problem-detail modal (specs/features/problems-page.md
// AC13–AC17, dashboard-page.md AC25–AC27). Every field is persisted data or the
// catalogue: nothing is estimated. `unknown` means saved progress could not be read.

export type SummaryStatus = 'solved' | 'attempted' | 'not_started' | 'unknown'

export interface ProblemSummary {
	number: number
	slug: string
	title: string
	difficulty: ProblemDefinition['difficulty']
	// "Arrays, Hashing" for display, and the same topics as separate labels.
	topics: string
	tags: string[]
	status: SummaryStatus
	attempts: number
	best: { passed: number; total: number } | null
	firstAttemptAt: string | null
	lastAttemptAt: string | null
	// First and most recent time solved (null until solved).
	solvedAt: string | null
	latestSolvedAt: string | null
}

// The Practice action for a problem: Start (never attempted), Continue (attempted,
// not solved) or Reattempt (solved). Unknown progress offers Start.
export type PracticeAction = 'start' | 'continue' | 'reattempt'

export function practiceAction(status: SummaryStatus): PracticeAction {
	if (status === 'solved') return 'reattempt'
	if (status === 'attempted') return 'continue'
	return 'start'
}

// `view` is null when saved progress could not be read; the first-attempt dates
// come from a separate read (slug → ISO time) and may be empty.
export function buildProblemSummaries(
	problems: readonly ProblemDefinition[],
	view: ProgressView | null,
	firstAttempts: Readonly<Record<string, string>>
): ProblemSummary[] {
	const rows = new Map((view?.problems ?? []).map((row) => [row.slug, row]))
	return problems.map((problem, index): ProblemSummary => {
		const row = rows.get(problem.slug)
		const tags = problem.conceptTags.map(topicLabel)
		return {
			number: index + 1,
			slug: problem.slug,
			title: problem.title,
			difficulty: problem.difficulty,
			topics: tags.join(', '),
			tags,
			status: view == null || row == null ? (view == null ? 'unknown' : 'not_started') : row.status,
			attempts: row?.runs ?? 0,
			best: row?.best ?? null,
			firstAttemptAt: firstAttempts[problem.slug] ?? null,
			lastAttemptAt: row?.lastAttemptAt ?? null,
			solvedAt: row?.solvedAt ?? null,
			latestSolvedAt: row?.latestSolvedAt ?? null
		}
	})
}

// The status dropdown (problems-page AC12). "Attempted" is every problem with a
// saved attempt, solved or not; "Unsolved" is attempted but not yet solved.
export type StatusFilter = 'all' | 'attempted' | 'not_started' | 'solved' | 'unsolved'

export function matchesStatus(summary: Pick<ProblemSummary, 'status'>, filter: StatusFilter) {
	switch (filter) {
		case 'all':
			return true
		case 'attempted':
			return summary.status === 'attempted' || summary.status === 'solved'
		case 'not_started':
			return summary.status === 'not_started'
		case 'solved':
			return summary.status === 'solved'
		case 'unsolved':
			return summary.status === 'attempted'
	}
}
