import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { traceResultSchema, type Trace, type TraceResult, type Value } from './contract'
import { containsDuplicate, twoSum } from './problems'
import { teach } from './teach'

function loadTrace(name: string): Trace {
	const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url))
	const fixture: TraceResult = traceResultSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
	assert.ok(fixture.trace)
	return fixture.trace
}

function intList(...ns: number[]): Value {
	return { kind: 'list', items: ns.map((n) => ({ kind: 'int', value: n })) }
}

const EXPECTED = intList(1, 2)

test('buggy nested loop is diagnosed as the same index used twice, with 3 hints', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('buggy-two-sum'),
		outcome: { passed: false, actual: intList(0, 0), expected: EXPECTED },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(prompt.id, 'same-index-reused')
	assert.deepEqual(
		prompt.hints.map((h) => h.level),
		[1, 2, 3]
	)
	assert.deepEqual(
		prompt.hints.map((h) => h.kind),
		['observation', 'reasoning', 'strategy']
	)
	// Never hands back the corrected code.
	for (const hint of prompt.hints) {
		assert.ok(!hint.body.includes('def two_sum'))
		assert.ok(!hint.body.includes('range(i + 1'))
	}
})

test('returning element values instead of indices is diagnosed', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('returned-values-two-sum'),
		outcome: { passed: false, actual: intList(2, 4), expected: EXPECTED },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(prompt.id, 'returned-values-not-indices')
})

test('returning [] when a pair exists is diagnosed as no solution found', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('empty-two-sum'),
		outcome: { passed: false, actual: intList(), expected: EXPECTED },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(prompt.id, 'no-solution-found')
})

test('an exception is not misdiagnosed as a logic bug; a neutral question is returned', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('index-error'),
		outcome: { passed: false, actual: undefined, expected: EXPECTED, errored: true },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'question')
})

test('a correct brute-force solution becomes eligible for an optimization prompt', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('brute-two-sum'),
		outcome: { passed: true, actual: intList(1, 2), expected: EXPECTED },
		allTestsPassed: true
	})
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(prompt.id, 'optimise-nested-loops')
})

test('a correct single-pass hash map gets no optimization prompt (nothing to say)', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('hashmap-two-sum'),
		outcome: { passed: true, actual: intList(1, 2), expected: EXPECTED },
		allTestsPassed: true
	})
	assert.equal(prompt, null)
})

test('a passing test never yields a bug diagnosis', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('brute-two-sum'),
		outcome: { passed: true, actual: intList(1, 2), expected: EXPECTED },
		allTestsPassed: false
	})
	assert.equal(prompt, null)
})

test('an unsupported failing case returns a neutral debugging question, not a guess', () => {
	const prompt = teach({
		problem: twoSum,
		trace: loadTrace('buggy-two-sum'),
		// A result that matches no rule: not the equal-index pair, not the values, not empty.
		outcome: { passed: false, actual: intList(5, 6), expected: EXPECTED },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'question')
})

test('with no trace a failing test still yields a neutral question', () => {
	const prompt = teach({
		problem: twoSum,
		trace: null,
		outcome: { passed: false, actual: intList(0, 0), expected: EXPECTED },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'question')
})

const boolValue = (v: boolean): Value => ({ kind: 'bool', value: v })

test('contains-duplicate: returning a non-boolean is diagnosed', () => {
	const prompt = teach({
		problem: containsDuplicate,
		trace: null,
		outcome: { passed: false, actual: intList(1), expected: boolValue(true) },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(prompt.id, 'not-a-boolean')
})

test('contains-duplicate: returning False when a duplicate exists is diagnosed', () => {
	const prompt = teach({
		problem: containsDuplicate,
		trace: null,
		outcome: { passed: false, actual: boolValue(false), expected: boolValue(true) },
		allTestsPassed: false
	})
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(prompt.id, 'missed-duplicate')
})

test('contains-duplicate: a nested-loop pass gets the set optimization', () => {
	const prompt = teach({
		problem: containsDuplicate,
		trace: {
			source: [
				'def contains_duplicate(nums):',
				'    for i in range(len(nums)):',
				'        for j in range(i + 1, len(nums)):',
				'            if nums[i] == nums[j]:',
				'                return True',
				'    return False'
			],
			steps: [],
			truncated: false
		},
		outcome: { passed: true, actual: boolValue(true), expected: boolValue(true) },
		allTestsPassed: true
	})
	assert.ok(prompt && prompt.kind === 'diagnosis')
	assert.equal(prompt.id, 'optimise-nested-loops')
})
