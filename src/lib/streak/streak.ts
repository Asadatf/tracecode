// The learning streak (specs/features/streak.md). Pure rules, no I/O, so every
// boundary is unit tested.
//
// A "day" is a UTC calendar day, the same day the Problems calendar and its
// "UTC" chip use, so the flame, the popover calendar and the daily problem can
// never disagree about where a day starts. A day is ACTIVE when the learner saved
// at least one attempt on it that ran to completion (status "completed", whether
// or not every test passed). Logins, syntax errors, engine errors and timeouts do
// not count, and a day counts once however many attempts it holds.

export const STREAK_ACTIVE_FROM = 3
export const STREAK_WINDOW_DAYS = 730

const DAY_MS = 86_400_000

// 'YYYY-MM-DD' of the UTC day containing an instant.
export function utcDay(instant: Date | string | number): string {
	return new Date(instant).toISOString().slice(0, 10)
}

function dayNumber(iso: string): number {
	return Math.floor(Date.parse(`${iso}T00:00:00.000Z`) / DAY_MS)
}

export function addDays(iso: string, days: number): string {
	return new Date((dayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10)
}

export interface AttemptStamp {
	createdAt: Date | string
	status: string
}

// The distinct active days, oldest first. Only completed attempts qualify.
export function activeDaysOf(attempts: readonly AttemptStamp[]): string[] {
	const days = new Set<string>()
	for (const attempt of attempts) {
		if (attempt.status === 'completed') days.add(utcDay(attempt.createdAt))
	}
	return [...days].sort()
}

export interface StreakStats {
	// The chain that is still alive: it ends today, or yesterday (today is not over
	// yet). 0 once a whole day has passed without activity.
	current: number
	// The longest run of consecutive active days among the days given.
	longest: number
	// The flame is lit: a live chain of at least STREAK_ACTIVE_FROM days.
	active: boolean
}

export function computeStreak(activeDays: Iterable<string>, today: string): StreakStats {
	const numbers = [...new Set([...activeDays].map(dayNumber))].sort((a, b) => a - b)
	if (numbers.length === 0) return { current: 0, longest: 0, active: false }

	let longest = 1
	let run = 1
	for (let i = 1; i < numbers.length; i++) {
		run = (numbers[i] ?? 0) - (numbers[i - 1] ?? 0) === 1 ? run + 1 : 1
		longest = Math.max(longest, run)
	}

	// `run` is now the chain ending at the most recent active day. It is alive only
	// if that day is today or yesterday; a day that is over with nothing in it
	// breaks the chain, and the next qualifying day starts a new one.
	const last = numbers[numbers.length - 1] ?? 0
	const gap = dayNumber(today) - last
	const current = gap === 0 || gap === 1 ? run : 0
	return { current, longest, active: current >= STREAK_ACTIVE_FROM }
}
