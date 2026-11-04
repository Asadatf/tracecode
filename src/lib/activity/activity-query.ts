import { STREAK_WINDOW_DAYS, addDays } from '../streak/streak'

function windowStart(today: string): Date {
	return new Date(`${addDays(today, -STREAK_WINDOW_DAYS)}T00:00:00.000Z`)
}

// The learner's recent completed attempts: the ONE read behind both the streak and
// the contribution graph, so their days cannot disagree. Five scalar columns and a
// lower date bound, so it never reads source text, results or replays, and a
// learner's whole history is not scanned (the window is STREAK_WINDOW_DAYS; a
// streak longer than that reads as the window). It takes the session user id and
// puts it in the WHERE; it accepts a user id from nowhere else. Served by the
// (userId, createdAt) index.
//
// `meaningful` is null for attempts saved before the column existed; those are
// kept (they count as they always did). Only a server-set `false` is excluded.
// Written as an explicit OR because SQL `<> false` would drop the nulls too.
export function activityAttemptsQuery(userId: string, today: string) {
	return {
		where: {
			userId,
			status: 'completed',
			createdAt: { gte: windowStart(today) },
			OR: [{ meaningful: null }, { meaningful: true }]
		},
		select: {
			createdAt: true,
			status: true,
			meaningful: true,
			problemSlug: true,
			allPassed: true
		},
		orderBy: { createdAt: 'asc' as const }
	}
}

// The same read without the `meaningful` column, for the moment the app is
// deployed before that column's migration has run (undefined column). Every
// completed attempt then counts, exactly as before the starter rule; it corrects
// itself once the migration lands.
export function legacyActivityAttemptsQuery(userId: string, today: string) {
	return {
		where: { userId, status: 'completed', createdAt: { gte: windowStart(today) } },
		select: { createdAt: true, status: true, problemSlug: true, allPassed: true },
		orderBy: { createdAt: 'asc' as const }
	}
}

// All-time count of the learner's qualifying runs (the same rule as the activity
// read, with no date window), for the public profile's "practice runs" total.
export function qualifyingRunsCountQuery(userId: string) {
	return {
		where: {
			userId,
			status: 'completed',
			OR: [{ meaningful: null }, { meaningful: true }]
		}
	}
}

// The same count before the `meaningful` column's migration has run.
export function legacyQualifyingRunsCountQuery(userId: string) {
	return { where: { userId, status: 'completed' } }
}
