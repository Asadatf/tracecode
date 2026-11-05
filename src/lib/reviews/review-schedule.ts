import { addDays, utcDay } from '../streak/streak'

// The spaced-review rules (specs/features/spaced-review.md). Pure: no I/O and no
// clock (callers pass instants), so every boundary is unit tested. All days are UTC
// calendar days, the same day the streak, the graph and the daily reminder use.
//
//   solve (day D)        -> review 1 due on D+1
//   review 1 done (R1)   -> review 2 due on R1+3
//   review 2 done (R2)   -> review 3 due on R2+7
//   review 3 done        -> cycle complete
//
// Intervals count from the day the previous review was SUCCESSFULLY completed, so a
// learner who is late is not penalised with an instantly-due next stage.
// This is a habit nudge, not a retention model: nothing here claims that completing
// a stage means the learner knows or will remember anything.

export const REVIEW_STAGES = 3
export const INITIAL_DELAY_DAYS = 1
// Delay before the NEXT review, indexed by reviews completed so far (1 or 2).
export const NEXT_DELAY_DAYS = [0, 3, 7] as const

export interface ReviewState {
	// Successful reviews so far, 0..REVIEW_STAGES.
	reviewsDone: number
	// 'YYYY-MM-DD' (UTC) the pending review falls due.
	dueDay: string
}

export function isComplete(state: ReviewState): boolean {
	return state.reviewsDone >= REVIEW_STAGES
}

// The pending review's number (1..3), or null once the cycle is complete.
export function pendingStage(state: ReviewState): number | null {
	return isComplete(state) ? null : state.reviewsDone + 1
}

// A learner's first qualifying solve on `solveDay` starts the cycle.
export function enrol(solveDay: string): ReviewState {
	return { reviewsDone: 0, dueDay: addDays(solveDay, INITIAL_DELAY_DAYS) }
}

export function isDue(state: ReviewState, today: string): boolean {
	return !isComplete(state) && state.dueDay <= today
}

// How the due date reads: today, or N whole UTC days late.
export type DueLabel =
	{ kind: 'today' } | { kind: 'overdue'; days: number } | { kind: 'upcoming'; days: number }

export function dueLabel(state: ReviewState, today: string): DueLabel {
	const diff = Math.round(
		(Date.parse(`${today}T00:00:00Z`) - Date.parse(`${state.dueDay}T00:00:00Z`)) / 86_400_000
	)
	if (diff === 0) return { kind: 'today' }
	return diff > 0 ? { kind: 'overdue', days: diff } : { kind: 'upcoming', days: -diff }
}

export type Advance =
	| { advanced: true; state: ReviewState; completed: boolean }
	| { advanced: false; reason: 'complete' | 'not_due' }

// A qualifying, passing attempt made on `attemptDay`. It completes the pending
// review only if that review is already due; an ordinary pass BEFORE the due day
// changes nothing (so a pass can never skip ahead), and one pass completes at most
// one stage (the next stage is due strictly later than `attemptDay`).
export function advance(state: ReviewState, attemptDay: string): Advance {
	if (isComplete(state)) return { advanced: false, reason: 'complete' }
	if (attemptDay < state.dueDay) return { advanced: false, reason: 'not_due' }
	const reviewsDone = state.reviewsDone + 1
	const completed = reviewsDone >= REVIEW_STAGES
	return {
		advanced: true,
		completed,
		state: {
			reviewsDone,
			// Once complete the due day is kept as a record, not a new deadline.
			dueDay: completed ? state.dueDay : addDays(attemptDay, NEXT_DELAY_DAYS[reviewsDone] ?? 1)
		}
	}
}

// What a qualifying pass on `attemptDay` does to a problem's review row (or its
// absence): start the cycle, advance a due review, or nothing.
export type ReviewAction =
	| { action: 'enrol'; state: ReviewState }
	| { action: 'advance'; from: ReviewState; to: ReviewState; completed: boolean }
	| { action: 'none'; reason: 'complete' | 'not_due' }

export function planReviewAction(current: ReviewState | null, attemptInstant: Date): ReviewAction {
	const day = utcDay(attemptInstant)
	if (current == null) return { action: 'enrol', state: enrol(day) }
	const result = advance(current, day)
	if (!result.advanced) return { action: 'none', reason: result.reason }
	return { action: 'advance', from: current, to: result.state, completed: result.completed }
}
