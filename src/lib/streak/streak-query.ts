import { STREAK_WINDOW_DAYS, addDays } from './streak'

// The learner's recent completed attempts, for the streak. Two scalar columns and
// a lower date bound, so it never reads source text, results or replays, and a
// learner's whole history is not scanned (the window is STREAK_WINDOW_DAYS; a
// streak longer than that reads as the window). It takes the session user id and
// puts it in the WHERE; it accepts a user id from nowhere else.
export function streakAttemptsQuery(userId: string, today: string) {
	return {
		where: {
			userId,
			status: 'completed',
			createdAt: { gte: new Date(`${addDays(today, -STREAK_WINDOW_DAYS)}T00:00:00.000Z`) }
		},
		select: { createdAt: true, status: true },
		orderBy: { createdAt: 'asc' as const }
	}
}
