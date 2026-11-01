import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
	traceResultSchema,
	type ProblemMeta,
	type Step,
	type StepView,
	type TraceResult
} from './contract'
import { explainStep, explainTrace } from './explain'

function loadTrace(name: string) {
	const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url))
	const fixture: TraceResult = traceResultSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
	assert.ok(fixture.trace)
	return fixture.trace
}

const TWO_SUM_META: ProblemMeta = {
	entry: 'two_sum',
	params: [{ name: 'nums' }, { name: 'target' }],
	pointerVars: [
		['i', 'nums'],
		['j', 'nums']
	],
	arrayVar: 'nums'
}

// Words that would indicate a FABRICATED branch outcome — the engine never
// records whether a condition was true, so no explanation may claim one.
const FABRICATION =
	/\b(is true|is false|was true|was false|evaluated to|condition (?:passed|held|was met)|entered the|branch was taken)\b/i

test('buggy Two Sum: the overlap and the return are explained from real values', () => {
	const t = loadTrace('buggy-two-sum')
	const history = explainTrace(t, TWO_SUM_META)

	assert.ok(
		history.some((h) => h.body === 'Both i and j reference index 0, where the value is 3.'),
		'expected the self-pairing explanation'
	)
	assert.ok(
		history.some((h) => h.event === 'return' && h.body === 'The function returned [0, 0].'),
		'expected the return to be described with its actual value'
	)
})

test('the call step names the actual arguments', () => {
	const t = loadTrace('buggy-two-sum')
	const history = explainTrace(t, TWO_SUM_META)
	assert.equal(history[0]?.event, 'call')
	assert.equal(history[0]?.body, 'two_sum was called with nums = [3, 2, 4] and target = 6.')
})

test('brute force: a variable change reads "i changed from 0 to 1"', () => {
	const t = loadTrace('brute-two-sum')
	const history = explainTrace(t, TWO_SUM_META)
	assert.ok(history.some((h) => h.body.includes('i changed from 0 to 1')))
})

test('an exception is described with its type and message', () => {
	const t = loadTrace('index-error')
	const history = explainTrace(t, TWO_SUM_META)
	assert.ok(
		history.some(
			(h) =>
				h.event === 'exception' && h.body === 'A IndexError was raised: list index out of range.'
		)
	)
})

test('no explanation fabricates a condition outcome, across every fixture', () => {
	for (const name of [
		'buggy-two-sum',
		'brute-two-sum',
		'hashmap-two-sum',
		'returned-values-two-sum',
		'index-error'
	]) {
		for (const entry of explainTrace(loadTrace(name), TWO_SUM_META)) {
			assert.ok(!FABRICATION.test(entry.body), `fabricated claim in "${entry.body}" (${name})`)
		}
	}
})

test('a plain condition line is quoted, never resolved', () => {
	const conditionStep: Step = {
		index: 0,
		event: 'line',
		line: 1,
		func: 'two_sum',
		depth: 0,
		locals: {}
	}
	const emptyView: StepView = { changed: [], loops: [], pointers: [] }
	const { title, body } = explainStep({
		step: conditionStep,
		changes: [],
		view: emptyView,
		source: ['if nums[i] + nums[j] == target:'],
		meta: TWO_SUM_META
	})
	assert.equal(title, 'Condition')
	assert.equal(body, 'Evaluating the condition `nums[i] + nums[j] == target`.')
})

test('execution history preserves the original trace step indexes', () => {
	const t = loadTrace('brute-two-sum')
	const history = explainTrace(t, TWO_SUM_META)
	assert.equal(history.length, t.steps.length)
	history.forEach((entry, i) => {
		assert.equal(entry.index, t.steps[i]?.index)
		assert.equal(entry.line, t.steps[i]?.line)
		assert.equal(entry.event, t.steps[i]?.event)
	})
	assert.equal(history[0]?.event, 'call')
	assert.equal(history.at(-1)?.event, 'return')
})
