import { planReviewAction, type ReviewAction, type ReviewState } from './review-schedule'

// Recording a qualifying pass against the learner's review row, as orchestration over
// an injected store so duplicate and concurrent requests are tested with an in-memory
// fake that behaves like the database. Prisma wiring: src/server/reviews/reviews.ts.
//
// Safety is in the store contract, not in a read-then-write: `create` is "insert if
// absent" (a unique key decides), and `advance` is ONE conditional update that only
// matches while the row is still at the stage the caller saw. Of N simultaneous
// requests exactly one can win, and a repeated request finds the stage already moved.

export interface ReviewRow extends ReviewState {
	completed: boolean
}

export interface ReviewStore {
	find(userId: string, problemSlug: string): Promise<ReviewRow | null>
	// Insert if absent; true when this call created the row.
	create(userId: string, problemSlug: string, state: ReviewState): Promise<boolean>
	// Move the row from `from` to `to` ONLY while it is still at `from` and not
	// complete; true when this call did it. Clears any "reminded" mark.
	advance(
		userId: string,
		problemSlug: string,
		from: ReviewState,
		to: ReviewState,
		completed: boolean,
		at: Date
	): Promise<boolean>
}

export type ReviewOutcome = 'enrolled' | 'advanced' | 'completed' | 'unchanged'

export async function recordReviewPass(
	store: ReviewStore,
	userId: string,
	problemSlug: string,
	at: Date
): Promise<ReviewOutcome> {
	const row = await store.find(userId, problemSlug)
	const plan: ReviewAction = planReviewAction(
		row == null ? null : { reviewsDone: row.reviewsDone, dueDay: row.dueDay },
		at
	)
	if (plan.action === 'none') return 'unchanged'
	if (plan.action === 'enrol') {
		return (await store.create(userId, problemSlug, plan.state)) ? 'enrolled' : 'unchanged'
	}
	const won = await store.advance(userId, problemSlug, plan.from, plan.to, plan.completed, at)
	if (!won) return 'unchanged'
	return plan.completed ? 'completed' : 'advanced'
}
