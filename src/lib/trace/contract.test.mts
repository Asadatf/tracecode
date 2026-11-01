import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	traceSchema,
	valueSchema,
	runResultSchema,
	traceResultSchema,
	workerResponseSchema,
	type Trace
} from './contract'
import { problemDefinitionSchema, problemMeta } from './problem'
import { twoSum, PROBLEMS } from './problems'

// A SMALL, representative Hybrid trace (engine facts only — no changed/loops/
// pointers). This exercises the schema shape; it is NOT the regression oracle,
// which is snapshotted from the real engine in M1.
const sampleTrace: Trace = {
	source: ['def two_sum(nums, target):', '    for i in range(len(nums)):', '        return [i, i]'],
	truncated: false,
	steps: [
		{
			index: 0,
			event: 'call',
			line: 1,
			func: 'two_sum',
			depth: 0,
			locals: {
				nums: {
					kind: 'list',
					items: [
						{ kind: 'int', value: 3 },
						{ kind: 'int', value: 2 },
						{ kind: 'int', value: 4 }
					]
				},
				target: { kind: 'int', value: 6 }
			}
		},
		{
			index: 1,
			event: 'line',
			line: 2,
			func: 'two_sum',
			depth: 0,
			locals: {
				nums: { kind: 'list', items: [{ kind: 'int', value: 3 }] },
				i: { kind: 'int', value: 0 }
			}
		},
		{
			index: 2,
			event: 'return',
			line: 3,
			func: 'two_sum',
			depth: 0,
			locals: { i: { kind: 'int', value: 0 } },
			returnValue: {
				kind: 'list',
				items: [
					{ kind: 'int', value: 0 },
					{ kind: 'int', value: 0 }
				]
			}
		}
	]
}

test('traceSchema accepts a well-formed Hybrid trace and round-trips it', () => {
	const parsed = traceSchema.parse(sampleTrace)
	assert.deepEqual(parsed, sampleTrace)
})

test('valueSchema accepts every Value kind, including nested and truncated collections', () => {
	for (const value of [
		{ kind: 'int', value: 3 },
		{ kind: 'float', value: 1.5 },
		{ kind: 'bool', value: true },
		{ kind: 'str', value: 'hi' },
		{ kind: 'none' },
		{ kind: 'list', items: [{ kind: 'int', value: 1 }], truncated: true },
		{ kind: 'tuple', items: [{ kind: 'none' }] },
		{
			kind: 'dict',
			entries: [
				[
					{ kind: 'str', value: 'k' },
					{ kind: 'int', value: 2 }
				]
			]
		},
		{ kind: 'other', repr: '<generator>' }
	]) {
		assert.equal(valueSchema.safeParse(value).success, true)
	}
})

test('valueSchema rejects unknown kinds and malformed values', () => {
	assert.equal(valueSchema.safeParse({ kind: 'set', items: [] }).success, false)
	assert.equal(valueSchema.safeParse({ kind: 'int' }).success, false)
	assert.equal(valueSchema.safeParse({ kind: 'int', value: 'nope' }).success, false)
})

test('stepSchema (via traceSchema) rejects internal-frame violations and bad events', () => {
	assert.equal(
		traceSchema.safeParse({
			...sampleTrace,
			steps: [{ ...sampleTrace.steps[0], event: 'generator' }]
		}).success,
		false
	)
	// depth must be a non-negative integer (learner frames only, 0-based)
	assert.equal(
		traceSchema.safeParse({ ...sampleTrace, steps: [{ ...sampleTrace.steps[0], depth: -1 }] })
			.success,
		false
	)
	// line is 1-based and positive
	assert.equal(
		traceSchema.safeParse({ ...sampleTrace, steps: [{ ...sampleTrace.steps[0], line: 0 }] })
			.success,
		false
	)
})

test('runResultSchema accepts a completed run with pass and fail test results', () => {
	const result = runResultSchema.parse({
		status: 'completed',
		tests: [
			{
				testId: 't1',
				passed: true,
				actual: { kind: 'list', items: [] },
				expected: { kind: 'list', items: [] }
			},
			{
				testId: 't2',
				passed: false,
				actual: {
					kind: 'list',
					items: [
						{ kind: 'int', value: 0 },
						{ kind: 'int', value: 0 }
					]
				},
				expected: {
					kind: 'list',
					items: [
						{ kind: 'int', value: 1 },
						{ kind: 'int', value: 2 }
					]
				}
			}
		]
	})
	assert.equal(result.tests.length, 2)
})

test('traceResultSchema accepts syntax_error, timeout, exception, and truncated outcomes', () => {
	assert.equal(
		traceResultSchema.safeParse({
			status: 'syntax_error',
			syntaxError: { message: 'bad', line: 2, column: 4 }
		}).success,
		true
	)
	assert.equal(traceResultSchema.safeParse({ status: 'timeout' }).success, true)
	assert.equal(
		traceResultSchema.safeParse({
			status: 'completed',
			error: { type: 'IndexError', message: 'x', line: 3 }
		}).success,
		true
	)
	assert.equal(
		traceResultSchema.safeParse({ status: 'completed', trace: { ...sampleTrace, truncated: true } })
			.success,
		true
	)
})

test('workerResponseSchema discriminates status, run_result and trace_result', () => {
	assert.equal(
		workerResponseSchema.safeParse({ type: 'status', phase: 'loading_runtime' }).success,
		true
	)
	assert.equal(workerResponseSchema.safeParse({ type: 'status', phase: 'warming' }).success, false)
	assert.equal(
		workerResponseSchema.safeParse({ type: 'trace_result', result: { status: 'timeout' } }).success,
		true
	)
})

test('the Two Sum definition is valid and registered by slug', () => {
	assert.doesNotThrow(() => problemDefinitionSchema.parse(twoSum))
	assert.equal(PROBLEMS['two-sum'], twoSum)
})

test('every Two Sum test supplies one positional arg per declared parameter', () => {
	for (const testCase of twoSum.tests) {
		assert.equal(testCase.args.length, twoSum.params.length)
	}
})

test('problemMeta projects the entry, params, and visualiser hints', () => {
	assert.deepEqual(problemMeta(twoSum), {
		entry: 'two_sum',
		params: [{ name: 'nums' }, { name: 'target' }],
		pointerVars: [
			['i', 'nums'],
			['j', 'nums']
		],
		arrayVar: 'nums'
	})
})
