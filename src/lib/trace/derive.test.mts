import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { traceResultSchema, type ProblemMeta, type StepView, type TraceResult } from './contract'
import { deriveChanges, deriveView, hasNestedLoops, parseLoops } from './derive'

// Fixtures are REAL M1-engine output (generated in a browser via Pyodide), so
// these pure-function tests run offline against genuine traces.
function loadFixture(name: string): TraceResult {
	const path = fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url))
	return traceResultSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
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

function trace(name: string) {
	const fixture = loadFixture(name)
	assert.ok(fixture.trace)
	return fixture.trace
}

test('buggy nested loop: call introduces args, i/j become changed, and loops nest', () => {
	const t = trace('buggy-two-sum')
	const views = deriveView(t, TWO_SUM_META)
	assert.equal(views.length, t.steps.length)

	// #0 call introduces both parameters.
	assert.deepEqual((views[0] as StepView).changed.sort(), ['nums', 'target'])
	// i then j appear as changes on the steps that first bind them.
	assert.ok(t.steps.some((s, i) => (views[i] as StepView).changed.includes('i')))
	assert.ok(t.steps.some((s, i) => (views[i] as StepView).changed.includes('j')))

	// Once inside the inner loop, two loops are active, outermost first.
	const inner = views.find((v) => v.loops.length === 2) as StepView
	assert.equal(inner.loops[0]?.line, 2)
	assert.equal(inner.loops[0]?.variable, 'i')
	assert.equal(inner.loops[1]?.line, 3)
	assert.equal(inner.loops[1]?.variable, 'j')
})

test('buggy nested loop: i and j overlap on index 0 (overlapping pointers)', () => {
	const t = trace('buggy-two-sum')
	const views = deriveView(t, TWO_SUM_META)
	const overlap = views.find((v) => v.pointers.length === 2) as StepView
	assert.ok(overlap)
	assert.deepEqual(
		overlap.pointers.map((p) => ({ name: p.name, index: p.index })),
		[
			{ name: 'i', index: 0 },
			{ name: 'j', index: 0 }
		]
	)
})

test('brute force: i changes 0 -> 1, and at the return the inner loop has reset', () => {
	const t = trace('brute-two-sum')
	const changes = deriveChanges(t)
	const iAdvance = changes.some((perStep) =>
		perStep.some(
			(c) =>
				c.name === 'i' &&
				c.from?.kind === 'int' &&
				c.from.value === 0 &&
				c.to.kind === 'int' &&
				c.to.value === 1
		)
	)
	assert.ok(iAdvance, 'expected a step where i changed from 0 to 1')

	const views = deriveView(t, TWO_SUM_META)
	const returnIndex = t.steps.findIndex((s) => s.event === 'return')
	const returnView = views[returnIndex] as StepView
	const outer = returnView.loops.find((l) => l.line === 2)
	const innerLoop = returnView.loops.find((l) => l.line === 3)
	assert.equal(outer?.iteration, 2, 'outer loop advanced to its 2nd iteration')
	assert.equal(innerLoop?.iteration, 1, 'inner loop restarted on the new outer iteration')
})

test('brute force: pointers are distinct when i and j sit on different indexes', () => {
	const t = trace('brute-two-sum')
	const views = deriveView(t, TWO_SUM_META)
	const distinct = views.find(
		(v) => v.pointers.length === 2 && v.pointers[0]?.index !== v.pointers[1]?.index
	)
	assert.ok(distinct, 'expected a step with i and j on different indexes')
})

test('hash map: only i is a pointer (no invented j), and seen is tracked as changed', () => {
	const t = trace('hashmap-two-sum')
	const views = deriveView(t, TWO_SUM_META)
	for (const view of views) {
		for (const pointer of view.pointers) assert.notEqual(pointer.name, 'j')
	}
	assert.ok(views.some((v) => v.pointers.some((p) => p.name === 'i')))
	const changes = deriveChanges(t)
	assert.ok(changes.some((perStep) => perStep.some((c) => c.name === 'seen')))
})

test('out-of-range pointer is reported, not clamped or hidden', () => {
	const t = trace('out-of-range-pointers')
	const views = deriveView(t, TWO_SUM_META)
	const arrayLength = 3
	const offEnd = views.some((v) => v.pointers.some((p) => p.name === 'j' && p.index >= arrayLength))
	assert.ok(offEnd, 'j points at index 3, past the end of a length-3 array')
})

test('exception trace is interpreted without crashing and keeps every step', () => {
	const t = trace('index-error')
	const views = deriveView(t, TWO_SUM_META)
	assert.equal(views.length, t.steps.length)
	assert.ok(t.steps.some((s) => s.event === 'exception'))
})

test('truncated trace is honoured: fewer steps, truncated flag preserved', () => {
	const fixture = loadFixture('truncated')
	assert.ok(fixture.trace)
	assert.equal(fixture.trace.truncated, true)
	const views = deriveView(fixture.trace, TWO_SUM_META)
	assert.equal(views.length, fixture.trace.steps.length)
})

test('parseLoops and hasNestedLoops read loop structure from source', () => {
	const t = trace('buggy-two-sum')
	assert.equal(hasNestedLoops(t.source), true)
	assert.equal(hasNestedLoops(['def f(x):', '    return x']), false)
	const headers = parseLoops(t.source)
	assert.deepEqual(
		headers.map((h) => ({ line: h.line, variable: h.variable })),
		[
			{ line: 2, variable: 'i' },
			{ line: 3, variable: 'j' }
		]
	)
})
