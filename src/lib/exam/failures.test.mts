import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyFailureCounts, failureCounts } from './failures.ts'

// specs/features/daily-exam.md AC28 (test evidence: aggregate failure categories, counts only).

const cases = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({ id, expected: i }))

test('each runner outcome lands in its category; passes count nowhere', () => {
	const counts = failureCounts(
		[
			{ id: 'a', ok: true, actual: 0 }, // pass
			{ id: 'b', ok: true, actual: 99 }, // wrong answer
			{ id: 'c', ok: false, error: 'exception' },
			{ id: 'd', ok: false, error: 'timeout' },
			{ id: 'e', ok: false, error: 'memory' },
			{ id: 'f', ok: false, error: 'recursion' },
			{ id: 'g', ok: false, error: 'entry_not_found' },
			{ id: 'h', ok: false, error: 'output_too_large' }
		],
		cases
	)
	assert.deepEqual(counts, {
		wrong_answer: 1,
		exception: 1,
		timeout: 1,
		memory: 1,
		recursion: 1,
		entry_not_found: 1,
		other: 1
	})
	// Seven failures out of eight cases, one passed.
	assert.equal(
		Object.values(counts).reduce((a, b) => a + b, 0),
		7
	)
})

test('equality follows the M9 judge (Python semantics: True == 1, lists by value)', () => {
	const counts = failureCounts(
		[
			{ id: 'x', ok: true, actual: [1, 2] },
			{ id: 'y', ok: true, actual: true }
		],
		[
			{ id: 'x', expected: [1, 2] },
			{ id: 'y', expected: 1 }
		]
	)
	assert.deepEqual(counts, emptyFailureCounts())
})

test('missing or malformed outputs are "other", never a wrong answer', () => {
	assert.equal(failureCounts('nonsense', cases).other, cases.length)
	assert.equal(failureCounts([{ id: 'a', ok: true, actual: 0 }], cases).other, cases.length - 1)
})

test('the result is counts only: no case id, input or expected output', () => {
	const counts = failureCounts(
		[{ id: 'secret-case', ok: true, actual: 1 }],
		[{ id: 'secret-case', expected: 2 }]
	)
	assert.ok(!JSON.stringify(counts).includes('secret'))
	assert.deepEqual(Object.keys(counts).sort(), Object.keys(emptyFailureCounts()).sort())
})
