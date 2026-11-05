import { addDays } from '../streak/streak'

// UTC dates and competition weeks (specs/features/daily-challenge.md). A week runs
// Monday 00:00:00 UTC to Sunday 23:59:59.999 UTC and is identified by its Monday.
// Pure, UTC only, so it agrees with the streak, the activity graph and the daily
// reminder.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// A real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30 and shapes that merely look right).
export function isIsoDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false
	const parsed = new Date(`${value}T00:00:00.000Z`)
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// 0 = Monday .. 6 = Sunday.
function mondayIndex(iso: string): number {
	return (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7
}

// The Monday of the week containing `iso`.
export function weekStartOf(iso: string): string {
	return addDays(iso, -mondayIndex(iso))
}

export function weekEndOf(weekStart: string): string {
	return addDays(weekStart, 6)
}

// The seven dates of a week, Monday first.
export function daysOfWeek(weekStart: string): string[] {
	return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

// A week is closed once it has ended and a grace period for late grading has passed,
// so a Sunday-night submission graded just after midnight still counts.
export const WEEK_CLOSE_GRACE_MS = 60 * 60 * 1000

export function isWeekClosed(weekStart: string, now: Date): boolean {
	const nextMonday = Date.parse(`${addDays(weekStart, 7)}T00:00:00.000Z`)
	return now.getTime() >= nextMonday + WEEK_CLOSE_GRACE_MS
}

// How long after a week ends a still-pending grading may hold up its archive. After this
// the week is archived anyway, so one stuck submission cannot keep standings open forever.
export const WEEK_PENDING_PATIENCE_MS = 7 * 24 * 60 * 60 * 1000

// Whether to freeze a week now: it must be closed, and no submission in it may still be
// waiting to be graded (that result would otherwise be missing from the archive) unless
// the patience window has passed.
export function shouldArchiveWeek(weekStart: string, now: Date, pendingGradings: number): boolean {
	if (!isWeekClosed(weekStart, now)) return false
	if (pendingGradings === 0) return true
	const nextMonday = Date.parse(`${addDays(weekStart, 7)}T00:00:00.000Z`)
	return now.getTime() >= nextMonday + WEEK_PENDING_PATIENCE_MS
}
