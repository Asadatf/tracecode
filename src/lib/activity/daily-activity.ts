import { attemptQualifies, utcDay, type AttemptStamp } from '../streak/streak'

// Per-UTC-day practice activity (specs/features/activity-heatmap.md). Pure and
// derived: it is rebuilt from the learner's saved attempts on every read, so it can
// never drift from them, never double-counts a retry or a concurrent write (there
// is no counter to increment), and shows history from before it existed.
//
// Only attempts that earn a streak day contribute (completed AND not judged
// untouched-starter by the server): the SAME rule, `attemptQualifies`, the streak
// uses. That is what guarantees the heatmap and the streak show the same days.
export interface ActivityAttempt extends AttemptStamp {
	problemSlug: string
	allPassed: boolean
}

export interface DailyActivity {
	// 'YYYY-MM-DD', UTC.
	day: string
	// Qualifying runs that day: the heatmap's intensity. Many runs make a darker
	// cell; they never make more than one streak day.
	attempts: number
	// Distinct problems practiced that day (failing runs and reattempts included).
	problems: number
	// Distinct problems whose qualifying run passed every test that day. A re-solve
	// of an already-solved problem counts on the day it happens.
	solved: number
}

// Every day with at least one qualifying attempt, oldest first. A day appearing in
// this list IS a streak day.
export function buildDailyActivity(attempts: readonly ActivityAttempt[]): DailyActivity[] {
	const byDay = new Map<string, { attempts: number; problems: Set<string>; solved: Set<string> }>()
	for (const attempt of attempts) {
		if (!attemptQualifies(attempt)) continue
		const day = utcDay(attempt.createdAt)
		let entry = byDay.get(day)
		if (entry == null) {
			entry = { attempts: 0, problems: new Set(), solved: new Set() }
			byDay.set(day, entry)
		}
		entry.attempts += 1
		entry.problems.add(attempt.problemSlug)
		if (attempt.allPassed) entry.solved.add(attempt.problemSlug)
	}
	return [...byDay.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([day, entry]) => ({
			day,
			attempts: entry.attempts,
			problems: entry.problems.size,
			solved: entry.solved.size
		}))
}
