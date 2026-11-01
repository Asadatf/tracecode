import assert from 'node:assert/strict'
import { test } from 'node:test'
import { twoSum, containsDuplicate } from '../trace/problems.ts'
import { teach } from '../trace/teach.ts'
import { hintRevealDetail } from './hint-event.ts'

// Exactly what the workspace passes to teach() for a passing run: the source,
// no steps (an optimization prompt needs no trace), and a passing outcome.
function optimizationPrompt(problem: typeof twoSum, source: string, expected: never) {
	return teach({
		problem,
		trace: { source: source.split('\n'), steps: [], truncated: false },
		outcome: { passed: true, actual: expected, expected, errored: false },
		allTestsPassed: true
	})
}

const BRUTE_TWO_SUM = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []`

const expected = { kind: 'list', items: [] } as never

test('optimization guidance records a distinct event detail for each of its three levels', () => {
	const prompt = optimizationPrompt(twoSum, BRUTE_TWO_SUM, expected)
	assert.ok(prompt && prompt.kind === 'diagnosis', 'optimization prompts are leveled prompts')
	assert.deepEqual(
		prompt.hints.map((hint) => hint.kind),
		['observation', 'reasoning', 'strategy']
	)
	const details = [1, 2, 3].map((level) => hintRevealDetail(prompt, level))
	assert.deepEqual(details, [
		'optimise-nested-loops:L1',
		'optimise-nested-loops:L2',
		'optimise-nested-loops:L3'
	])
	assert.equal(new Set(details).size, 3)
})

test('the same format covers the second problem’s optimization ladder', () => {
	const source = `def contains_duplicate(nums):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] == nums[j]:
                return True
    return False`
	const prompt = optimizationPrompt(containsDuplicate as never, source, expected)
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(hintRevealDetail(prompt, 3), 'optimise-nested-loops:L3')
})

test('nothing is recorded without a leveled prompt or for an unknown level', () => {
	const prompt = optimizationPrompt(twoSum, BRUTE_TWO_SUM, expected)
	assert.equal(hintRevealDetail(null, 1), null)
	assert.equal(hintRevealDetail({ kind: 'question', title: 't', body: 'b' }, 1), null)
	assert.equal(hintRevealDetail(prompt, 0), null)
	assert.equal(hintRevealDetail(prompt, 4), null)
})
