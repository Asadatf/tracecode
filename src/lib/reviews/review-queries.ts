import type { ReviewState } from './review-schedule'

// Query builders for spaced reviews. Pure, so what is selected, scoped and compared
// can be asserted. The learner id is always a parameter the caller resolved (the
// session, or the cron's own iteration) and sits in the WHERE; no request input is
// ever one.

// A UTC 'YYYY-MM-DD' as the value of a Postgres DATE column.
export function dayColumn(day: string): Date {
	return new Date(`${day}T00:00:00.000Z`)
}

const REVIEW_SELECT = {
	problemSlug: true,
	reviewsDone: true,
	dueDay: true,
	completedAt: true
} as const

// The learner's pending reviews that are due (or overdue) on `today`.
export function dueReviewsQuery(userId: string, today: string) {
	return {
		where: { userId, completedAt: null, dueDay: { lte: dayColumn(today) } },
		orderBy: [{ dueDay: 'asc' as const }, { problemSlug: 'asc' as const }],
		select: REVIEW_SELECT
	}
}

export function findReviewQuery(userId: string, problemSlug: string) {
	return { where: { userId_problemSlug: { userId, problemSlug } }, select: REVIEW_SELECT }
}

export function createReviewData(userId: string, problemSlug: string, state: ReviewState) {
	return {
		data: [
			{ userId, problemSlug, reviewsDone: state.reviewsDone, dueDay: dayColumn(state.dueDay) }
		],
		skipDuplicates: true as const
	}
}

// The single conditional update behind "an advance happens at most once": it matches
// only while the row is still at the stage and due day the caller saw, and not
// complete. A duplicate or concurrent request matches nothing.
export function advanceReviewQuery(
	userId: string,
	problemSlug: string,
	from: ReviewState,
	to: ReviewState,
	completed: boolean,
	at: Date
) {
	return {
		where: {
			userId,
			problemSlug,
			reviewsDone: from.reviewsDone,
			dueDay: dayColumn(from.dueDay),
			completedAt: null
		},
		data: {
			reviewsDone: to.reviewsDone,
			dueDay: dayColumn(to.dueDay),
			lastReviewedAt: at,
			completedAt: completed ? at : null,
			// The new stage has not been announced yet.
			remindedAt: null
		}
	}
}

// The reminder job's scan: pending, due, not yet announced.
export function unremindedDueQuery(today: string, take: number) {
	return {
		where: { completedAt: null, remindedAt: null, dueDay: { lte: dayColumn(today) } },
		orderBy: [
			{ userId: 'asc' as const },
			{ dueDay: 'asc' as const },
			{ problemSlug: 'asc' as const }
		],
		take,
		select: { userId: true, problemSlug: true, reviewsDone: true, dueDay: true }
	}
}

// Marks a stage as announced, only if it is still the stage that was announced.
export function markRemindedQuery(
	userId: string,
	problemSlug: string,
	reviewsDone: number,
	at: Date
) {
	return {
		where: { userId, problemSlug, reviewsDone, completedAt: null, remindedAt: null },
		data: { remindedAt: at }
	}
}
