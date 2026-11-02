import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LIMITS, type Trace, type Value } from './contract'
import { PROBLEMS } from './problems'
import { problemMeta } from './problem'
import { REFERENCE_SOLUTIONS } from './reference-solutions'
import { deriveChanges, deriveView } from './derive'
import { listItems } from './value'
import { traceInPyodide } from './engine-python.mts'

// Replay regression on the REAL engine (Pyodide): every reference solution
// traces to a schema-valid, bounded trace, and the debugger's derived view shows
// pointers, dict/array/stack changes only where the trace itself contains them.

const solution = (slug: string, name: string) =>
	REFERENCE_SOLUTIONS[slug]!.find((s) => s.name === name)!.source

async function trace(slug: string, source: string, args: Parameters<typeof traceInPyodide>[2]) {
	const result = await traceInPyodide(source, PROBLEMS[slug]!.entry, args, DEFAULT_LIMITS.maxSteps)
	assert.equal(result.status, 'completed')
	assert.ok(result.trace)
	return { result, trace: result.trace }
}

const itemsOf = (value: Value | undefined) => listItems(value)?.length ?? 0

test('every reference solution produces a valid, bounded trace on a mid-size official input', async () => {
	for (const slug of Object.keys(REFERENCE_SOLUTIONS)) {
		const problem = PROBLEMS[slug]!
		const test = problem.tests.find((t) => t.id === 't10') ?? problem.tests[0]!
		for (const sol of REFERENCE_SOLUTIONS[slug]!) {
			const { trace: t, result } = await trace(slug, sol.source, test.args)
			assert.ok(
				t.steps.length > 0 && t.steps.length <= DEFAULT_LIMITS.maxSteps,
				`${slug}/${sol.name}`
			)
			assert.equal(t.steps[0]?.event, 'call')
			assert.equal(t.steps.at(-1)?.event, 'return')
			assert.deepEqual(
				t.steps.map((s) => s.index),
				t.steps.map((_, i) => i),
				'dense indexes'
			)
			assert.ok(
				t.steps.every((s) => s.depth === 0),
				'learner frames only'
			)
			// views align one-to-one with steps
			assert.equal(deriveView(t, problemMeta(problem)).length, t.steps.length)
			if (problem.grading?.mode !== 'mutate-arg') {
				assert.deepEqual(
					result.actual?.kind === 'bool'
						? result.actual.value
						: (result.actual as { value?: number })?.value,
					test.expected,
					`${slug}/${sol.name}: traced result equals the official expected`
				)
			}
		}
	}
})

test('large official inputs trace to a bounded, explicitly truncated trace — never unbounded', async () => {
	const cases: [string, string, string][] = [
		['valid-anagram', 'Frequency dictionary', 't16'],
		['move-zeroes', 'Two pointers, swap', 't16'],
		['binary-search', 'Linear scan', 't25'],
		['valid-parentheses', 'Stack of expected closers', 't23']
	]
	for (const [slug, name, id] of cases) {
		const test = PROBLEMS[slug]!.tests.find((t) => t.id === id)!
		const { trace: t } = await trace(slug, solution(slug, name), test.args)
		assert.ok(t.steps.length <= DEFAULT_LIMITS.maxSteps, slug)
		assert.equal(t.truncated, true, `${slug}: the cap is reported, not hidden`)
	}
})

test('binary search: left/mid/right pointers appear from the trace and stay inside the array', async () => {
	const problem = PROBLEMS['binary-search']!
	const { trace: t } = await trace(
		'binary-search',
		solution('binary-search', 'Iterative binary search'),
		[[-1, 0, 3, 5, 9, 12], 2]
	)
	const views = deriveView(t, problemMeta(problem))
	const names = new Set(views.flatMap((v) => v.pointers.map((p) => p.name)))
	assert.deepEqual([...names].sort(), ['left', 'mid', 'right'])
	// A pointer is only drawn at a step where the local actually exists.
	for (const [i, v] of views.entries()) {
		for (const p of v.pointers) assert.ok(t.steps[i]!.locals[p.name] !== undefined)
	}
	const mids = views.flatMap((v) => v.pointers.filter((p) => p.name === 'mid').map((p) => p.index))
	assert.ok(mids.length > 0 && mids.every((m) => m >= 0 && m < 6))
	assert.ok(
		views.some((v) => v.loops.length > 0),
		'loop progress is derived'
	)
})

test('anagram: the frequency dictionary’s changes are in the trace and flagged as changed', async () => {
	const { trace: t } = await trace(
		'valid-anagram',
		solution('valid-anagram', 'Frequency dictionary'),
		['aab', 'aba']
	)
	const changes = deriveChanges(t)
	const dictSteps = t.steps.filter((s) => s.locals['counts']?.kind === 'dict')
	assert.ok(dictSteps.length > 0)
	const states = new Set(dictSteps.map((s) => JSON.stringify(s.locals['counts'])))
	assert.ok(states.size >= 4, 'the dictionary visibly grows and shrinks')
	assert.ok(changes.some((c) => c.some((v) => v.name === 'counts' && v.from !== undefined)))
	const final = t.steps.find((s) => s.event === 'return')
	assert.deepEqual(final?.locals['counts'], {
		kind: 'dict',
		entries: [
			[
				{ kind: 'str', value: 'a' },
				{ kind: 'int', value: 0 }
			],
			[
				{ kind: 'str', value: 'b' },
				{ kind: 'int', value: 0 }
			]
		]
	})
})

test('move zeroes: in-place mutation is visible as nums changing between steps, with write/read pointers', async () => {
	const problem = PROBLEMS['move-zeroes']!
	const { trace: t, result } = await trace(
		'move-zeroes',
		solution('move-zeroes', 'Two pointers, swap'),
		[[0, 1, 0, 3, 12]]
	)
	assert.equal(result.actual?.kind, 'none', 'the function returns nothing')
	const snapshots = t.steps.map((s) => JSON.stringify(s.locals['nums']))
	assert.ok(new Set(snapshots).size >= 3, 'the array changes along the way')
	assert.equal(snapshots.at(-1), JSON.stringify(list(1, 3, 12, 0, 0)))
	const views = deriveView(t, problemMeta(problem))
	const names = new Set(views.flatMap((v) => v.pointers.map((p) => p.name)))
	assert.ok(names.has('write') && names.has('read'))
	const changedNums = deriveChanges(t).filter((c) => c.some((v) => v.name === 'nums' && v.from))
	assert.ok(changedNums.length >= 2)
})

test('parentheses: stack pushes and pops are in the trace — the stack grows to the nesting depth and empties', async () => {
	const { trace: t } = await trace(
		'valid-parentheses',
		solution('valid-parentheses', 'Stack of expected closers'),
		['{[()]}']
	)
	const sizes = t.steps
		.filter((s) => s.locals['stack'] !== undefined)
		.map((s) => itemsOf(s.locals['stack']))
	assert.equal(Math.max(...sizes), 3)
	assert.equal(sizes.at(-1), 0)
	assert.ok(
		sizes.some((n, i) => i > 0 && n > sizes[i - 1]!),
		'a push'
	)
	assert.ok(
		sizes.some((n, i) => i > 0 && n < sizes[i - 1]!),
		'a pop'
	)
})

test('a failing replay of an invalid string still completes, with the early return in the trace', async () => {
	const { trace: t, result } = await trace(
		'valid-parentheses',
		solution('valid-parentheses', 'Stack of expected closers'),
		['(]']
	)
	assert.deepEqual(result.actual, { kind: 'bool', value: false })
	assert.equal(t.steps.at(-1)?.event, 'return')
})

test('a crash in the learner’s code is captured as a runtime error with an exception step, not a hung replay', async () => {
	const crashing =
		'def is_valid(s):\n    stack = []\n    for ch in s:\n        stack.pop()\n    return True'
	const result = await traceInPyodide(crashing, 'is_valid', [')'])
	assert.equal(result.error?.type, 'IndexError')
	assert.ok(result.trace?.steps.some((s: Trace['steps'][number]) => s.event === 'exception'))
})

function list(...ns: number[]): Value {
	return { kind: 'list', items: ns.map((value) => ({ kind: 'int', value })) }
}
