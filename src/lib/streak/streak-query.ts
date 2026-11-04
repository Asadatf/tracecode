import { STREAK_WINDOW_DAYS, addDays } from './streak'

function windowStart(today: string): Date {
	return new Date(`${addDays(today, -STREAK_WINDOW_DAYS)}T00:00:00.000Z`)
}

// The learner's recent completed attempts, for the streak. Three scalar columns
// and a lower date bound, so it never reads source text, results or replays, and
// a learner's whole history is not scanned (the window is STREAK_WINDOW_DAYS; a
// streak longer than that reads as the window). It takes the session user id and
// puts it in the WHERE; it accepts a user id from nowhere else.
//
// `meaningful` is null for attempts saved before the column existed; those are
// kept (they count as they always did). Only a server-set `false` is excluded.
// Written as an explicit OR because SQL `<> false` would drop the nulls too.
export function streakAttemptsQuery(userId: string, today: string) {
	return {
		where: {
			userId,
			status: 'completed',
			createdAt: { gte: windowStart(today) },
			OR: [{ meaningful: null }, { meaningful: true }]
		},
		select: { createdAt: true, status: true, meaningful: true },
		orderBy: { createdAt: 'asc' as const }
	}
}

// The same read without the `meaningful` column, for the moment the app is
// deployed before that column's migration has run (P2022). The flame then counts
// every completed attempt, exactly as it did before this rule, instead of going
// dark; it corrects itself once the migration lands.
export function legacyStreakAttemptsQuery(userId: string, today: string) {
	return {
		where: { userId, status: 'completed', createdAt: { gte: windowStart(today) } },
		select: { createdAt: true, status: true },
		orderBy: { createdAt: 'asc' as const }
	}
}
