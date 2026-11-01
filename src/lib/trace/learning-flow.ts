import type { RunStatus } from './contract'

// Pure eligibility rules for the learning flow — when the UI may surface a
// replay nudge, a contextual hint, or an optimization prompt. No persistence:
// callers pass in whatever history they already hold (localStorage now, a DB
// later). Mirrors the prototype's coaching gates without its storage.

export interface AttemptRecord {
	passed: boolean
	source: string
}

export interface ReplayRecord {
	// Index into the attempts array that this replay belongs to.
	attemptIndex: number
	// Whether the replayed test itself passed (both pass and fail are replayable).
	testPassed: boolean
}

// After a failed submission, nudge the learner to replay a failed test first.
export function recommendReplay(attempts: AttemptRecord[]): boolean {
	const latest = attempts.at(-1)
	return latest != null && !latest.passed
}

// A contextual hint is eligible once the learner has examined a failed replay
// and then made a *different* submission that still failed — i.e. they engaged
// with the evidence and are still stuck, not on their first miss.
export function isContextualHintEligible(input: {
	attempts: AttemptRecord[]
	replays: ReplayRecord[]
}): boolean {
	const { attempts, replays } = input
	const latest = attempts.at(-1)
	if (latest == null || latest.passed) return false
	return attempts.slice(0, -1).some((prior, index) => {
		if (prior.passed || prior.source === latest.source) return false
		return replays.some((replay) => replay.attemptIndex === index && !replay.testPassed)
	})
}

// Optimization prompts are only eligible once every official test passes.
export function isOptimizationEligible(input: { allTestsPassed: boolean }): boolean {
	return input.allTestsPassed
}

// A test is replayable when the engine completed it (pass OR fail, including a
// raised exception). Syntax errors, timeouts and engine errors have no trace.
export function isReplayable(status: RunStatus): boolean {
	return status === 'completed'
}

// Custom-input runs are exploration only — they never affect official scoring.
export function countsTowardScore(runKind: 'official' | 'custom'): boolean {
	return runKind === 'official'
}
