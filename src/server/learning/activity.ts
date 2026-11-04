import 'server-only'
import { cache } from 'react'
import { db } from '@/server/db/client'
import { currentUserIdSafe } from '@/server/auth/session'
import { readWithColumnFallback } from '@/lib/learning/optional-columns'
import { activityAttemptsQuery, legacyActivityAttemptsQuery } from '@/lib/activity/activity-query'
import { buildDailyActivity, type DailyActivity } from '@/lib/activity/daily-activity'
import { utcDay } from '@/lib/streak/streak'

// The learner's daily practice activity (specs/features/activity-heatmap.md),
// derived from saved attempts: Attempt stays the only source of truth, nothing is
// stored or estimated. Wrapped in React `cache`, so the toolbar flame and the
// contribution graph on one page share a single query. Signed out, or the database
// unreachable: no numbers at all, so nothing is ever made up.
export type ActivitySummary =
	| { authenticated: false }
	| { authenticated: true; available: false }
	| {
			authenticated: true
			available: true
			// The server's UTC day, so the first client render agrees with it.
			today: string
			// Days with a qualifying attempt, oldest first, within the supported window.
			days: DailyActivity[]
	  }

export const getActivitySummary = cache(async (): Promise<ActivitySummary> => {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false }
	try {
		const today = utcDay(new Date())
		const rows = await readWithColumnFallback(
			'meaningful',
			() => db.attempt.findMany(activityAttemptsQuery(userId, today)),
			() => db.attempt.findMany(legacyActivityAttemptsQuery(userId, today))
		)
		return { authenticated: true, available: true, today, days: buildDailyActivity(rows) }
	} catch {
		return { authenticated: true, available: false }
	}
})
