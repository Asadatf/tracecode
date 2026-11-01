import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { traceResultSchema } from '../trace/contract'
import { twoSum } from '../trace/problems'
import { buildTwoSumDemo, DEMO_HIGHLIGHT_STEP } from './two-sum-demo'

// home-page AC4/AC5: the step table is the engine's real buggy Two Sum run.
const fixture = traceResultSchema.parse(
	JSON.parse(readFileSync(new URL('../trace/fixtures/buggy-two-sum.json', import.meta.url), 'utf8'))
)
const failingTest = twoSum.tests.find((t) => t.id === 't2')
assert.ok(failingTest)
const demo = buildTwoSumDemo(fixture, failingTest, twoSum.entry)

test('AC4: the caption names the call, the expected and the actual result', () => {
	assert.equal(demo.call, 'two_sum([3, 2, 4], 6)')
	assert.equal(demo.expected, '[1, 2]')
	assert.equal(demo.actual, '[0, 0]')
})

test('AC4: steps 1–5, the return step left to the caption', () => {
	assert.deepEqual(
		demo.rows.map((row) => row.step),
		[1, 2, 3, 4, 5]
	)
	assert.equal(demo.rows[0]?.code, 'def two_sum(nums, target):')
	assert.equal(demo.rows[0]?.i, '·')
})

test('AC5: the highlighted step is the self-pairing bug — i and j both 0, 3 + 3 = 6', () => {
	const highlighted = demo.rows.filter((row) => row.highlighted)
	assert.equal(highlighted.length, 1)
	assert.deepEqual(highlighted[0], {
		step: DEMO_HIGHLIGHT_STEP,
		code: 'if nums[i] + nums[j] == target:',
		i: '0',
		j: '0',
		sum: '3 + 3 = 6',
		highlighted: true
	})
})
