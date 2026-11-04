import 'server-only'
import { cache } from 'react'
import { db } from '@/server/db/client'
import { captureError } from '@/lib/observability/capture-error'
import { currentUserIdSafe } from '@/server/auth/session'
import { PROBLEMS } from '@/lib/trace/problems'
import { utcDay } from '@/lib/streak/streak'
import {
	advanceReviewQuery,
	createReviewData,
	dueReviewsQuery,
	findReviewQuery
} from '@/lib/reviews/review-queries'
import { recordReviewPass, type ReviewStore } from '@/lib/reviews/review-service'
import { dueLabel, type DueLabel } from '@/lib/reviews/review-schedule'

// Spaced reviews (specs/features/spaced-review.md). Every function resolves the
// learner from the validated session (or is handed the id the server resolved) and
// puts it in the WHERE; no request input is a user id.

function dayString(date: Date): string {
	return date.toISOString().slice(0, 10)
}

const store: ReviewStore = {
	async find(userId, problemSlug) {
		const row = await db.problemReview.findUnique(findReviewQuery(userId, problemSlug))
		return row == null
			? null
			: {
					reviewsDone: row.reviewsDone,
					dueDay: dayString(row.dueDay),
					completed: row.completedAt != null
				}
	},
	async create(userId, problemSlug, state) {
		const { count } = await db.problemReview.createMany(
			createReviewData(userId, problemSlug, state)
		)
		return count === 1
	},
	async advance(userId, problemSlug, from, to, completed, at) {
		const { count } = await db.problemReview.updateMany(
			advanceReviewQuery(userId, problemSlug, from, to, completed, at)
		)
		return count === 1
	}
}

// Called by saveAttempt AFTER the attempt is stored and only for a pass the evidence
// gate accepted. It never throws: a review problem (or the table not being migrated
// yet) must not lose the learner's submission, so it is reported and swallowed.
//
// `attemptAt` is the stored attempt's own database-set `createdAt`, NOT the clock at
// processing time. The review is judged on the day that attempt actually happened, so
// tracking that is retried or replayed later, after the row has moved on, can never
// advance a later stage: an old attempt is never "due" for a stage that fell due after it.
export async function trackReviewPass(
	userId: string,
	problemSlug: string,
	attemptAt: Date
): Promise<void> {
	try {
		await recordReviewPass(store, userId, problemSlug, attemptAt)
	} catch (error) {
		captureError(error, { area: 'review-tracking' })
	}
}

export interface DueReviewItem {
	slug: string
	// 1..3
	stage: number
	dueDay: string
	label: DueLabel
}

export type DueReviewsView =
	| { authenticated: false }
	| { authenticated: true; available: false }
	| {
			authenticated: true
			available: true
			today: string
			// Most overdue first, only problems the catalogue still has.
			items: DueReviewItem[]
	  }

// The signed-in learner's reviews that are due today or overdue, for the Overview.
// Cached per request, so the Overview card and the recommendation callout share one read.
export const getDueReviews = cache(async (): Promise<DueReviewsView> => {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false }
	try {
		const today = utcDay(new Date())
		const rows = await db.problemReview.findMany(dueReviewsQuery(userId, today))
		const items = rows
			.filter((row) => Object.hasOwn(PROBLEMS, row.problemSlug))
			.map((row): DueReviewItem => {
				const dueDay = dayString(row.dueDay)
				return {
					slug: row.problemSlug,
					stage: row.reviewsDone + 1,
					dueDay,
					label: dueLabel({ reviewsDone: row.reviewsDone, dueDay }, today)
				}
			})
		return { authenticated: true, available: true, today, items }
	} catch (error) {
		captureError(error, { area: 'due-reviews' })
		return { authenticated: true, available: false }
	}
})
