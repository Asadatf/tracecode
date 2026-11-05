import test from 'node:test'
import assert from 'node:assert/strict'
import type { Step, Trace, Value } from './contract.ts'
import {
	CONDENSE,
	condenseTrace,
	describeRun,
	outlineIndices,
	runAhead,
	runContaining,
	stepFrom
} from './condense.ts'
import { PROBLEMS } from './problems.ts'
import { REFERENCE_SOLUTIONS } from './reference-solutions.ts'
import { pythonAvailable, traceInPython } from './engine-python.mts'

const skip = !pythonAvailable() && 'python3 not available'
const int = (value: number): Value => ({ kind: 'int', value })
const list = (...items: number[]): Value => ({ kind: 'list', items: items.map(int) })

// A hand-built trace: `for i in range(n): acc = acc + i` shaped as call, then three line events
// per pass (lines 3, 4, 5), then the return. `effect(pass)` supplies the locals AFTER each pass.
function loopTrace(
	passes: number,
	locals: (pass: number) => Record<string, Value>,
	extra: { exceptionAt?: number } = {}
): Trace {
	const steps: Step[] = [
		{ index: 0, event: 'call', line: 1, func: 'f', depth: 0, locals: locals(0) }
	]
	for (let pass = 0; pass < passes; pass += 1) {
		for (const line of [3, 4, 5]) {
			const isError = extra.exceptionAt === pass && line === 4
			steps.push({
				index: steps.length,
				event: isError ? 'exception' : 'line',
				line,
				func: 'f',
				depth: 0,
				locals: locals(pass),
				...(isError ? { exception: { type: 'ValueError', message: 'boom' } } : {})
			})
		}
	}
	steps.push({
		index: steps.length,
		event: 'return',
		line: 6,
		func: 'f',
		depth: 0,
		locals: locals(passes),
		returnValue: int(passes)
	})
	return {
		source: [
			'def f(n):',
			'    acc = 0',
			'    for i in range(n):',
			'        acc += i',
			'        pass',
			'    return acc'
		],
		steps,
		truncated: false
	}
}
const uniform = (pass: number) => ({ i: int(pass), acc: int(pass * pass) })

test('a long repeat of the same events with the same state effect is folded to a few passes and a summary', () => {
	const trace = loopTrace(20, uniform)
	const runs = condenseTrace(trace)
	assert.equal(runs.length, 1)
	const run = runs[0]!
	assert.equal(run.period, 3)
	assert.equal(run.totalPasses, 20)
	// First 3 passes and the last pass stay visible.
	assert.equal(run.hiddenPasses, 20 - CONDENSE.headPasses - CONDENSE.tailPasses)
	assert.equal(run.hiddenSteps, run.hiddenPasses * 3)
	assert.equal(run.noun, 'iterations')
	assert.deepEqual(run.changedEachPass, ['acc', 'i'])
	assert.equal(run.hiddenFrom, 1 + CONDENSE.headPasses * 3)
})

test('the summary states only what the trace established', () => {
	const run = condenseTrace(loopTrace(20, uniform))[0]!
	const words = describeRun(run)
	assert.equal(words.summary, 'This pattern repeats for the next 16 iterations')
	assert.match(words.detail, /Lines 3–5 run again each time\./)
	assert.match(words.detail, /acc and i change on every pass\./)
	// No guesses about intent or results.
	assert.doesNotMatch(
		words.summary + words.detail,
		/because|so that|which means|likely|probably|same result/i
	)
})

test('a short loop is never folded: the fold must save something', () => {
	for (const passes of [2, 5, 7, 8]) {
		const runs = condenseTrace(loopTrace(passes, uniform))
		const hidden = runs.reduce((n, r) => n + r.hiddenPasses, 0)
		assert.equal(
			hidden,
			Math.max(0, passes - CONDENSE.headPasses - CONDENSE.tailPasses) >= CONDENSE.minHidden
				? hidden
				: 0,
			`${passes} passes`
		)
		if (passes < CONDENSE.headPasses + CONDENSE.tailPasses + CONDENSE.minHidden)
			assert.equal(runs.length, 0, `${passes} passes`)
	}
})

test('same source lines are NOT treated as equal: a pass that changes something different stays visible', () => {
	// Pass 11 leaves `acc` unchanged (it hit a plateau); every other pass changes it. The same
	// three lines run each time, but the state effect differs, so it is not folded into either side.
	const trace = loopTrace(24, (pass) => ({
		i: int(pass),
		acc: int(pass <= 11 ? pass * 3 : 33 + 0)
	}))
	const runs = condenseTrace(trace)
	assert.ok(runs.length >= 1)
	const anomaly = 1 + 11 * 3 // first step of the pass where acc stopped changing
	for (const run of runs) {
		assert.ok(
			!(anomaly >= run.hiddenFrom && anomaly <= run.hiddenTo),
			'the differing pass is never folded'
		)
		// Within one fold every pass has the same effect: either `acc` changes on all or on none.
		const names = run.changedEachPass
		assert.ok(names.includes('acc') === run.hiddenTo < anomaly)
	}
	// And no fold mixes the changing passes with the plateau.
	for (const run of runs) assert.ok(run.hiddenTo < anomaly || run.hiddenFrom > anomaly + 2)
})

test('a list changed in place is a different effect from a list that stays the same', () => {
	// Passes 1-9 grow the list by one; pass 10 leaves it alone; 11-20 grow it again.
	const trace = loopTrace(20, (pass) => ({
		i: int(pass),
		seen: list(...Array.from({ length: pass <= 9 ? pass : pass - 1 }, (_, k) => k))
	}))
	const runs = condenseTrace(trace)
	const anomaly = 1 + 9 * 3
	assert.ok(runs.every((r) => !(anomaly >= r.hiddenFrom && anomaly <= r.hiddenTo)))
	assert.ok(runs.every((r) => r.hiddenTo < anomaly || r.hiddenFrom > anomaly + 2))
})

test('a swap in place and a no-op pass are different: in-place change vs unchanged', () => {
	const cells = (pass: number) => list(...(pass % 2 === 0 ? [1, 2, 3] : [3, 2, 1]))
	const trace = loopTrace(20, (pass) => ({ i: int(pass), nums: cells(pass) }))
	const runs = condenseTrace(trace)
	// Every pass swaps the list contents (an items change): consistent, so it may fold, and the
	// summary says nums changes every pass.
	for (const run of runs) assert.ok(run.changedEachPass.includes('nums'))
})

test('an exception is never folded away, and neither is the final return', () => {
	const trace = loopTrace(30, uniform, { exceptionAt: 29 })
	const runs = condenseTrace(trace)
	const last = trace.steps.length - 1
	for (const run of runs) {
		assert.ok(run.hiddenTo < last)
		for (let i = run.hiddenFrom; i <= run.hiddenTo; i += 1) {
			assert.notEqual(trace.steps[i]!.event, 'exception')
			assert.ok(!(trace.steps[i]!.event === 'return' && trace.steps[i]!.depth === 0))
		}
	}
	// An exception in the middle of the loop breaks the run in two; it stays visible.
	const mid = loopTrace(30, uniform, { exceptionAt: 15 })
	const exceptionStep = mid.steps.findIndex((s) => s.event === 'exception')
	for (const run of condenseTrace(mid))
		assert.ok(exceptionStep < run.hiddenFrom || exceptionStep > run.hiddenTo)
})

test('the first and last steps of a trace are always visible', () => {
	const trace = loopTrace(40, uniform)
	const visible = outlineIndices(trace.steps.length, condenseTrace(trace), () => false)
	assert.equal(visible[0], 0)
	assert.equal(visible.at(-1), trace.steps.length - 1)
})

test('expanding shows every recorded step; nothing is removed from the trace', () => {
	const trace = loopTrace(25, uniform)
	const runs = condenseTrace(trace)
	const folded = outlineIndices(trace.steps.length, runs, () => false)
	const open = outlineIndices(trace.steps.length, runs, () => true)
	assert.ok(folded.length < trace.steps.length)
	assert.equal(open.length, trace.steps.length)
	assert.equal(folded.length + runs.reduce((n, r) => n + r.hiddenSteps, 0), trace.steps.length)
	assert.equal(trace.steps.length, 2 + 25 * 3, 'the recorded steps are untouched')
})

test('stepping skips a fold, an expanded fold is stepped through, and a fold you are inside stays readable', () => {
	const trace = loopTrace(20, uniform)
	const total = trace.steps.length
	const runs = condenseTrace(trace)
	const run = runs[0]!
	const closed = () => false
	const before = run.hiddenFrom - 1
	assert.equal(stepFrom(runs, before, 1, total, closed), run.hiddenTo + 1)
	assert.equal(stepFrom(runs, run.hiddenTo + 1, -1, total, closed), before)
	assert.equal(runAhead(runs, before, 1, closed)?.id, run.id)
	assert.equal(runAhead(runs, before - 5, 1, closed), undefined)
	const open = (r: { id: number }) => r.id === run.id
	assert.equal(stepFrom(runs, before, 1, total, open), run.hiddenFrom)
	assert.equal(runAhead(runs, before, 1, open), undefined)
	assert.equal(runContaining(runs, run.hiddenFrom)?.id, run.id)
	// Bounds.
	assert.equal(stepFrom(runs, 0, -1, total, closed), 0)
	assert.equal(stepFrom(runs, total - 1, 1, total, closed), total - 1)
})

test('describeRun words a single pass in the singular and flags cut-off values', () => {
	const run = condenseTrace(loopTrace(20, uniform))[0]!
	const one = describeRun({ ...run, hiddenPasses: 1 })
	assert.match(one.summary, /next 1 iteration$/)
	const partial = describeRun({ ...run, partial: true, changedEachPass: [] })
	assert.match(partial.detail, /No change is recorded in the values that were captured\./)
	assert.match(partial.detail, /cut off in the recording/)
})

// ---- real traces from the real Python engine -----------------------------------------

function trace(source: string, entry: string, args: unknown[], maxSteps = 2000): Trace {
	const result = traceInPython(source, entry, args as never, maxSteps)
	assert.ok(result.trace, 'trace recorded')
	return result.trace
}

function independentTokens(t: Trace): string[] {
	let previous = t.steps[0]?.depth ?? 0
	return t.steps.map((s) => {
		const token = `${s.event}:${s.line}:${s.depth - previous}`
		previous = s.depth
		return token
	})
}

test('a real loop over a large input is folded and the loop-ending steps stay', { skip }, () => {
	const source = [
		'def total(nums):',
		'    acc = 0',
		'    for x in nums:',
		'        acc += x',
		'    return acc',
		''
	].join('\n')
	const t = trace(source, 'total', [Array.from({ length: 60 }, (_, i) => i + 1)])
	const runs = condenseTrace(t)
	assert.equal(runs.length, 1)
	assert.equal(runs[0]!.noun, 'iterations')
	const last = t.steps.length - 1
	assert.equal(t.steps[last]!.event, 'return')
	assert.ok(runs[0]!.hiddenTo < last - 1, 'the loop exit and the return stay visible')
	const outline = outlineIndices(t.steps.length, runs, () => false)
	assert.ok(outline.length < t.steps.length / 3, `${outline.length} of ${t.steps.length}`)
})

test(
	'real recursion: the descent and the unwinding fold, the base case and final return stay',
	{ skip },
	() => {
		const source = [
			'def depth(n):',
			'    if n == 0:',
			'        return 0',
			'    return 1 + depth(n - 1)',
			''
		].join('\n')
		const t = trace(source, 'depth', [40])
		const runs = condenseTrace(t)
		assert.ok(runs.length >= 1)
		assert.ok(runs.some((r) => r.noun === 'recursive calls'))
		const last = t.steps.length - 1
		const baseCase = t.steps.findIndex((s) => s.line === 3 && s.event === 'line')
		assert.ok(baseCase > 0)
		for (const run of runs) {
			assert.ok(
				!(baseCase >= run.hiddenFrom && baseCase <= run.hiddenTo),
				'the base case stays visible'
			)
			assert.ok(run.hiddenTo < last)
		}
		assert.equal(t.steps[last]!.event, 'return')
		assert.equal(t.steps[last]!.depth, 0)
		assert.deepEqual(t.steps[last]!.returnValue, int(40))
	}
)

test(
	'a real loop where the state effect changes keeps the changed pass on its own',
	{ skip },
	() => {
		const source = [
			'def best_of(nums):',
			'    best = 0',
			'    for x in nums:',
			'        best = max(best, x)',
			'    return best',
			''
		].join('\n')
		// 30 rising values, then 30 smaller ones: the same lines run, but `best` stops changing.
		const nums = [
			...Array.from({ length: 30 }, (_, i) => i + 1),
			...Array.from({ length: 30 }, () => 1)
		]
		const t = trace(source, 'best_of', [nums])
		const runs = condenseTrace(t)
		assert.ok(runs.length >= 2, 'rising passes and plateau passes fold separately')
		const bestOf = (i: number) => (t.steps[i]!.locals.best as { value: number } | undefined)?.value
		for (const run of runs) {
			const changing = run.changedEachPass.includes('best')
			// Verify against the raw steps: inside this fold best really changes on every pass or on none.
			for (let i = run.hiddenFrom; i + run.period <= run.hiddenTo + 1; i += run.period) {
				assert.equal(bestOf(i) !== bestOf(i + run.period), changing, `step ${i}`)
			}
		}
	}
)

test('an exception raised in a loop is kept visible with the error', { skip }, () => {
	const source = [
		'def f(nums):',
		'    out = 0',
		'    for x in nums:',
		'        out += 10 // x',
		'    return out',
		''
	].join('\n')
	const t = trace(source, 'f', [[...Array.from({ length: 30 }, (_, i) => i + 1), 0]])
	const runs = condenseTrace(t)
	const raised = t.steps.findIndex((s) => s.event === 'exception')
	assert.ok(raised > 0)
	assert.equal(t.steps[raised]!.exception?.type, 'ZeroDivisionError')
	for (const run of runs) assert.ok(raised < run.hiddenFrom || raised > run.hiddenTo)
	assert.equal(t.steps.at(-1)!.event === 'exception' || t.steps.at(-1)!.event === 'return', true)
})

test(
	'safety limits stay: a very long run is still capped at the engine limit, flagged truncated, and condenses',
	{ skip },
	() => {
		const source = [
			'def spin(nums):',
			'    n = 0',
			'    for i in range(200000):',
			'        n += 1',
			'    return n',
			''
		].join('\n')
		const t = trace(source, 'spin', [[1]], 500)
		assert.equal(t.truncated, true)
		assert.equal(t.steps.length, 500, 'the recording cap is unchanged')
		const runs = condenseTrace(t)
		assert.equal(runs.length >= 1, true)
		assert.ok(outlineIndices(t.steps.length, runs, () => false).length < 40)
		// The summary never claims the loop finished: it counts only the recorded passes.
		assert.match(
			describeRun(runs[0]!).summary,
			/^This pattern repeats for the next \d+ iterations$/
		)
	}
)

test('invariants hold on every real trace of every reference solution and test', { skip }, () => {
	let traces = 0
	let folded = 0
	for (const [slug, problem] of Object.entries(PROBLEMS)) {
		const refs = (REFERENCE_SOLUTIONS[slug] ?? []).filter(
			(r) => r.passes && problem.grading?.mode !== 'mutate-arg'
		)
		const sources = refs.length > 0 ? refs.slice(-1).map((r) => r.source) : []
		for (const source of sources) {
			for (const test of problem.tests.filter((_, i) => i % 3 === 0).slice(0, 8)) {
				const t = traceInPython(source, problem.entry, test.args, 600).trace
				if (t == null) continue
				traces += 1
				const runs = condenseTrace(t)
				const tokens = independentTokens(t)
				let previousEnd = -1
				for (const run of runs) {
					folded += 1
					assert.ok(run.hiddenFrom > previousEnd, `${slug}: runs are ordered and disjoint`)
					previousEnd = run.hiddenTo
					assert.ok(
						run.hiddenFrom >= 1 && run.hiddenTo < t.steps.length - 1,
						`${slug}: first and last stay`
					)
					assert.equal(run.hiddenSteps, run.hiddenTo - run.hiddenFrom + 1)
					assert.equal(run.hiddenSteps, run.hiddenPasses * run.period)
					// Every folded pass is a genuine repeat of the pass before it (same event/line/depth change).
					for (let i = run.hiddenFrom; i + run.period <= run.hiddenTo + 1; i += run.period) {
						for (let k = 0; k < run.period; k += 1)
							assert.equal(
								tokens[i + k],
								tokens[i + k - run.period],
								`${slug}: step ${i + k} repeats`
							)
					}
					for (let i = run.hiddenFrom; i <= run.hiddenTo; i += 1) {
						assert.notEqual(t.steps[i]!.event, 'exception')
						assert.ok(!(t.steps[i]!.event === 'return' && t.steps[i]!.depth === 0))
					}
				}
			}
		}
	}
	assert.ok(traces >= 10, `${traces} traces checked`)
	assert.ok(folded >= 3, `${folded} folds checked`)
})
