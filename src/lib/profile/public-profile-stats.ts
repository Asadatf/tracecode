import type { ProblemDefinition } from '../trace/problem'
import { buildProgressView, type TopicRow } from '../progress/progress-view'
import { computeStreak, type StreakStats } from '../streak/streak'
import type { DailyActivity } from '../activity/daily-activity'

// What a public profile shows, and ONLY that (specs/features/public-profile-page.md).
// Pure: it is given the owner's saved progress rows, activity days and run total and
// returns a closed, browser-safe record. Every number is derived from the learner's
// saved data; nothing is estimated, and with no data every count is a real zero.
// The record has no id, email, source, test result, tutor conversation or timestamp
// of a single run, by construction (a test pins the exact key set).

export interface PublicProgressRow {
	problemSlug: string
	status: string
	attempts: number
	bestTestsPassed: number
	testsTotal: number
	firstSolvedAt: string | null
	latestSolvedAt: string | null
	lastAttemptAt: string
}

export interface PublicProfileStats {
	solved: number
	totalProblems: number
	// All-time qualifying practice runs (the streak's rule).
	runs: number
	streak: StreakStats
	// Days with a qualifying run in the supported window, oldest first.
	days: DailyActivity[]
	// The server's UTC day, so the first client render agrees with it.
	today: string
	topics: TopicRow[]
	// Whether there is nothing to show yet: no runs and no solved problems.
	empty: boolean
}

export function buildPublicProfileStats(input: {
	problems: readonly ProblemDefinition[]
	progress: readonly PublicProgressRow[]
	days: readonly DailyActivity[]
	runs: number
	today: string
}): PublicProfileStats {
	// Reuse the Overview's own progress and topic maths (one definition of "solved"
	// and "topic"), fed ONLY progress rows: no recent attempts, replays or hints.
	const view = buildProgressView(input.problems, {
		authenticated: true,
		available: true,
		progress: [...input.progress],
		recentAttempts: [],
		replaysInspected: 0,
		hintsRevealed: 0
	})
	const runs = Math.max(0, Math.floor(input.runs))
	return {
		solved: view.summary.solved,
		totalProblems: view.summary.total,
		runs,
		streak: computeStreak(
			input.days.map((entry) => entry.day),
			input.today
		),
		days: [...input.days],
		today: input.today,
		topics: view.topics,
		empty: runs === 0 && view.summary.solved === 0
	}
}
