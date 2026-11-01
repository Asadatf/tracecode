import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	countsTowardScore,
	isContextualHintEligible,
	isOptimizationEligible,
	isReplayable,
	recommendReplay
} from './learning-flow'

test('recommendReplay fires only after a failed submission', () => {
	assert.equal(recommendReplay([{ passed: false, source: 'a' }]), true)
	assert.equal(recommendReplay([{ passed: true, source: 'a' }]), false)
	assert.equal(recommendReplay([]), false)
})

test('contextual hint needs an examined failed replay plus a later, different failing attempt', () => {
	const attempts = [
		{ passed: false, source: 'A' },
		{ passed: false, source: 'B' }
	]
	assert.equal(
		isContextualHintEligible({ attempts, replays: [{ attemptIndex: 0, testPassed: false }] }),
		true
	)

	// No replay examined yet.
	assert.equal(isContextualHintEligible({ attempts, replays: [] }), false)
	// The examined replay was of a passing test.
	assert.equal(
		isContextualHintEligible({ attempts, replays: [{ attemptIndex: 0, testPassed: true }] }),
		false
	)
	// Code was not changed between attempts.
	assert.equal(
		isContextualHintEligible({
			attempts: [
				{ passed: false, source: 'A' },
				{ passed: false, source: 'A' }
			],
			replays: [{ attemptIndex: 0, testPassed: false }]
		}),
		false
	)
	// Latest attempt passed.
	assert.equal(
		isContextualHintEligible({
			attempts: [
				{ passed: false, source: 'A' },
				{ passed: true, source: 'B' }
			],
			replays: [{ attemptIndex: 0, testPassed: false }]
		}),
		false
	)
})

test('optimization is eligible only once all official tests pass', () => {
	assert.equal(isOptimizationEligible({ allTestsPassed: true }), true)
	assert.equal(isOptimizationEligible({ allTestsPassed: false }), false)
})

test('both passing and failing completed runs are replayable; error states are not', () => {
	assert.equal(isReplayable('completed'), true)
	assert.equal(isReplayable('timeout'), false)
	assert.equal(isReplayable('syntax_error'), false)
	assert.equal(isReplayable('engine_error'), false)
})

test('custom-input runs never count toward official correctness', () => {
	assert.equal(countsTowardScore('official'), true)
	assert.equal(countsTowardScore('custom'), false)
})
