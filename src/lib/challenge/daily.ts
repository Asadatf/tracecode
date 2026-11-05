import { EXAM_DURATION_MS } from './exam-rules'

// The Daily Learning Challenge's clock (specs/features/daily-challenge.md). Thirty minutes
// is a SOFT TARGET for personal feedback: nothing here expires an attempt or blocks the
// final submission, and nothing compares one learner with another. Pure and clock-free: callers pass
// the instant to judge, derived from the SERVER's recorded `startedAt` and the server's
// "now" at page load, never from a browser's own date.

export const DAILY_TARGET_MS = EXAM_DURATION_MS

// What the server knows about one learner's go at one date's challenge.
export interface DailyState {
	// Server-recorded start (ISO), or null until the learner clicks Start.
	startedAt: string | null
	// When the ONE final submission was made (ISO), or null while the challenge is open.
	submittedAt: string | null
}

export type DailyPhase = 'not_started' | 'running' | 'overtime' | 'submitted'

export interface DailyClock {
	phase: DailyPhase
	// Time left of the 30-minute target (0 once it is used up).
	remainingMs: number
	// Time past the target (0 until then).
	overtimeMs: number
	// Time on the challenge so far; frozen at the final submit.
	elapsedMs: number
}

export function dailyClock(state: DailyState, nowMs: number): DailyClock {
	if (state.startedAt == null) {
		return { phase: 'not_started', remainingMs: DAILY_TARGET_MS, overtimeMs: 0, elapsedMs: 0 }
	}
	const started = Date.parse(state.startedAt)
	// The timer stops at the final submit and stays stopped, whatever the date is now.
	const end = state.submittedAt == null ? nowMs : Date.parse(state.submittedAt)
	const elapsedMs = Math.max(0, end - started)
	return {
		phase:
			state.submittedAt != null
				? 'submitted'
				: elapsedMs > DAILY_TARGET_MS
					? 'overtime'
					: 'running',
		remainingMs: Math.max(0, DAILY_TARGET_MS - elapsedMs),
		overtimeMs: Math.max(0, elapsedMs - DAILY_TARGET_MS),
		elapsedMs
	}
}

// MM:SS (or H:MM:SS from an hour on).
export function formatClock(ms: number): string {
	const total = Math.floor(Math.max(0, ms) / 1000)
	const hours = Math.floor(total / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const seconds = total % 60
	const two = (value: number) => String(value).padStart(2, '0')
	return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`
}
