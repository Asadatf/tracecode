import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGradingJob, judgeOutputs, parseRunnerStdout } from './grading.ts'
import { pythonEquals } from './judge.ts'
import { PROBLEMS } from '../trace/problems.ts'

const cases = [
	{ id: 'h1', args: [[1, 2]], expected: [0, 1] },
	{ id: 'h2', args: [[3]], expected: true }
]

test('Python equality: True == 1, 1 == 1.0, deep lists and dicts; nothing else is equal', () => {
	assert.equal(pythonEquals(true, 1), true)
	assert.equal(pythonEquals(false, 0), true)
	assert.equal(pythonEquals(1, 1.0), true)
	assert.equal(pythonEquals([1, [2, true]], [1, [2, 1]]), true)
	assert.equal(pythonEquals({ a: 1, b: [2] }, { b: [2], a: 1 }), true)
	assert.equal(pythonEquals(null, null), true)
	assert.equal(pythonEquals(null, 0), false)
	assert.equal(pythonEquals('1', 1), false)
	assert.equal(pythonEquals([1, 2], [2, 1]), false)
	assert.equal(pythonEquals([1], [1, 1]), false)
	assert.equal(pythonEquals({ a: 1 }, { a: 1, b: 2 }), false)
	assert.equal(pythonEquals('a', 'b'), false)
	assert.equal(pythonEquals(undefined, null), false)
})

test('the grading job carries the inputs and the code, and NEVER an expected answer', () => {
	const problem = PROBLEMS['two-sum']!
	const job = buildGradingJob(problem, 'def two_sum(nums, target):\n    return [0, 1]\n', cases)
	assert.deepEqual(job.cases, [
		{ id: 'h1', args: [[1, 2]] },
		{ id: 'h2', args: [[3]] }
	])
	const text = JSON.stringify(job)
	assert.equal(text.includes('expected'), false)
	assert.equal(text.includes('"true"') || text.includes(':true'), false, 'no boolean answer leaked')
	assert.equal(job.entry, 'two_sum')
})

test('in-place problems are wrapped by the same harness practice uses', () => {
	const job = buildGradingJob(PROBLEMS['move-zeroes']!, 'def move_zeroes(nums):\n    pass\n', [
		{ id: 'h1', args: [[0, 1]], expected: [1, 0] }
	])
	assert.notEqual(job.entry, 'move_zeroes')
	assert.match(job.code, /__tracecode_grade__/)
})

test('judging counts only cases whose output equals the hidden answer', () => {
	const outputs = [
		{ id: 'h1', ok: true, actual: [0, 1] },
		{ id: 'h2', ok: true, actual: false }
	]
	assert.deepEqual(judgeOutputs(outputs, cases), { ok: true, testsPassed: 1, testsTotal: 2 })
})

test('errors, timeouts and missing outputs are failed cases, not passes', () => {
	const outputs = [
		{ id: 'h1', ok: false, error: 'timeout' },
		{ id: 'h2', ok: false, error: 'exception' }
	]
	assert.deepEqual(judgeOutputs(outputs, cases), { ok: true, testsPassed: 0, testsTotal: 2 })
})

test('a runner report that does not cover the job exactly is a GRADER failure, never a learner score', () => {
	for (const bad of [
		null,
		'x',
		{},
		[],
		[{ id: 'h1', ok: true, actual: [0, 1] }],
		[
			{ id: 'h1', ok: true },
			{ id: 'h1', ok: true }
		],
		[
			{ id: 'h1', ok: true },
			{ id: 'zz', ok: true }
		],
		[1, 2]
	]) {
		assert.deepEqual(
			judgeOutputs(bad, cases),
			{ ok: false, code: 'bad_runner_output' },
			JSON.stringify(bad)
		)
	}
})

test('learner output that tries to impersonate the runner cannot change the result: only the last JSON line counts', () => {
	assert.deepEqual(parseRunnerStdout('noise\n{"x":1}\n[{"id":"h1","ok":true,"actual":1}]\n'), [
		{ id: 'h1', ok: true, actual: 1 }
	])
	assert.equal(parseRunnerStdout(''), null)
	assert.equal(parseRunnerStdout('not json'), null)
})
