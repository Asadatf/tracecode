// The rows a replay persists, in one place so the analytics in statistics.ts
// can be tested against exactly what the actions write. A linked replay (its
// attempt saved) writes a replay_sessions row AND a replay_inspected event; a
// fallback replay (save not landed or failed) writes only the event.

export interface ReplayInspectedEvent {
	problemSlug: string
	type: 'replay_inspected'
	detail: string
}

export interface LinkedReplayInput {
	attemptId: string
	problemSlug: string
	testId: string
	testPassed: boolean
}

export function replayInspectedEvent(problemSlug: string, testId: string): ReplayInspectedEvent {
	return { problemSlug, type: 'replay_inspected', detail: testId }
}

export function linkedReplayWrites(input: LinkedReplayInput): {
	session: { attemptId: string; testId: string; testPassed: boolean }
	event: ReplayInspectedEvent
} {
	return {
		session: { attemptId: input.attemptId, testId: input.testId, testPassed: input.testPassed },
		event: replayInspectedEvent(input.problemSlug, input.testId)
	}
}
