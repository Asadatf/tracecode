import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkedReplayWrites, replayInspectedEvent } from './replay-writes.ts'
import {
	computeLearningStatistics,
	type AttemptRecord,
	type LearningRecords
} from './statistics.ts'

// Regression for the M6.1 replay-counting assumption, driven by the same
// payload builders recordReplaySession and persistReplay's fallback use: a
// linked replay writes a session AND a replay_inspected event, a fallback
// replay writes only the event, and the statistics count each replay once.

const ATTEMPT: AttemptRecord = {
	id: '00000000-0000-4000-8000-000000000001',
	problemSlug: 'two-sum',
	createdAt: new Date(Date.UTC(2026, 10, 1)),
	testsPassed: 1,
	testsTotal: 4,
	allPassed: false,
	failedTestIds: ['t2', 't3', 't4']
}

// An in-memory stand-in for the rows the actions insert, read back the way
// loadLearningRecords maps them (a session takes its attempt's problemSlug).
function store() {
	const records: LearningRecords = { attempts: [ATTEMPT], replaySessions: [], events: [] }
	let clock = ATTEMPT.createdAt.getTime()
	const now = () => new Date((clock += 1000))
	return {
		records,
		linkedReplay(testId: string, testPassed: boolean) {
			const writes = linkedReplayWrites({
				attemptId: ATTEMPT.id,
				problemSlug: ATTEMPT.problemSlug,
				testId,
				testPassed
			})
			const startedAt = now()
			records.replaySessions.push({
				...writes.session,
				problemSlug: ATTEMPT.problemSlug,
				startedAt
			})
			records.events.push({ ...writes.event, createdAt: startedAt })
		},
		fallbackReplay(testId: string) {
			records.events.push({
				...replayInspectedEvent(ATTEMPT.problemSlug, testId),
				createdAt: now()
			})
		}
	}
}

test('a linked replay writes one session and one replay_inspected event with the same test', () => {
	const writes = linkedReplayWrites({
		attemptId: ATTEMPT.id,
		problemSlug: 'two-sum',
		testId: 't2',
		testPassed: false
	})
	assert.deepEqual(writes.session, { attemptId: ATTEMPT.id, testId: 't2', testPassed: false })
	assert.deepEqual(writes.event, { problemSlug: 'two-sum', type: 'replay_inspected', detail: 't2' })
})

test('regression: linked replays are counted once, not as session + event', () => {
	const db = store()
	db.linkedReplay('t2', false)
	db.linkedReplay('t2', false)
	db.linkedReplay('t3', false)
	assert.equal(db.records.events.length, 3, 'each linked replay also wrote an event')
	assert.deepEqual(computeLearningStatistics(db.records).replay, {
		linkedSessions: 3,
		fallbackEvents: 0,
		total: 3
	})
})

test('regression: fallback and linked replays of the same test are each counted once', () => {
	const db = store()
	db.fallbackReplay('t2')
	db.linkedReplay('t2', false)
	db.fallbackReplay('t4')
	assert.deepEqual(computeLearningStatistics(db.records).replay, {
		linkedSessions: 1,
		fallbackEvents: 2,
		total: 3
	})
})
