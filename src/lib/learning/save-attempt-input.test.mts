import test from 'node:test'
import assert from 'node:assert/strict'
import { saveAttemptInput } from './save-attempt-input.ts'

const base = {
	problemSlug: 'binary-search',
	source: 'def search(nums, target):\n    return -1',
	status: 'completed',
	testsPassed: 0,
	testsTotal: 4,
	allPassed: false,
	tests: []
}

test('a client-supplied qualification flag never reaches the handler', () => {
	const parsed = saveAttemptInput.parse({ ...base, meaningful: true, isMeaningful: true })
	assert.equal('meaningful' in parsed, false)
	assert.equal('isMeaningful' in parsed, false)
})
