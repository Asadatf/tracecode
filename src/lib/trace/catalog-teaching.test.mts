import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Trace, Value } from './contract'
import { PROBLEMS } from './problems'
import { optimizationPrompt, teach, type TeachingPrompt } from './teach'
import { NOT_IN_PLACE_PREFIX } from './grading'
import { findSolvedAttempt, isOptimizationEligible } from './learning-flow'
import { hintRevealDetail } from '../learning/hint-event'

// Stage A (correctness hints, evidence-based) and Stage B (the optional
// post-solve challenge) for the four added problems.

const int = (value: number): Value => ({ kind: 'int', value })
const str = (value: string): Value => ({ kind: 'str', value })
const bool = (value: boolean): Value => ({ kind: 'bool', value })
const list = (...ns: number[]): Value => ({ kind: 'list', items: ns.map(int) })

// A one-call trace whose entry frame holds `locals`, optionally ending in an exception.
function traceOf(
	locals: Record<string, Value>,
	source = ['def f():', '    pass'],
	exception?: { type: string; message: string }
): Trace {
	const steps: Trace['steps'] = [
		{ index: 0, event: 'call', line: 1, func: 'f', depth: 0, locals },
		{ index: 1, event: 'line', line: 2, func: 'f', depth: 0, locals }
	]
	if (exception) {
		steps.push({ index: 2, event: 'exception', line: 2, func: 'f', depth: 0, locals, exception })
	}
	return { source, steps, truncated: false }
}

function failing(
	slug: string,
	trace: Trace | null,
	actual: Value | undefined,
	expected: Value,
	errored = false
): TeachingPrompt {
	return teach({
		problem: PROBLEMS[slug]!,
		trace,
		outcome: { passed: false, actual, expected, errored },
		allTestsPassed: false
	})
}

function assertLadder(prompt: TeachingPrompt, id: string) {
	assert.ok(prompt && prompt.kind === 'diagnosis', `expected a diagnosis for ${id}`)
	assert.equal(prompt.id, id)
	assert.deepEqual(
		prompt.hints.map((h) => h.level),
		[1, 2, 3]
	)
	assert.deepEqual(
		prompt.hints.map((h) => h.kind),
		['observation', 'reasoning', 'strategy']
	)
	for (const hint of prompt.hints) {
		assert.ok(hint.body.length > 20)
		assert.ok(!hint.body.includes('```'), 'no code blocks')
		assert.ok(!/\bdef \w+\(/.test(hint.body), 'no pasted function')
	}
}

// ── Stage A: evidence-based diagnoses ────────────────────────────────────────

test('anagram: unequal lengths accepted, same letters different counts, valid rejected, non-boolean', () => {
	assertLadder(
		failing('valid-anagram', traceOf({ s: str('ab'), t: str('a') }), bool(true), bool(false)),
		'anagram-length-mismatch'
	)
	assertLadder(
		failing('valid-anagram', traceOf({ s: str('aab'), t: str('abb') }), bool(true), bool(false)),
		'anagram-counts-differ'
	)
	assertLadder(
		failing('valid-anagram', traceOf({ s: str('ab'), t: str('ba') }), bool(false), bool(true)),
		'anagram-rejected-valid'
	)
	assertLadder(
		failing('valid-anagram', traceOf({ s: str('ab'), t: str('ba') }), int(2), bool(true)),
		'not-a-boolean'
	)
})

test('move zeroes: new object returned, nums unchanged, order lost', () => {
	assertLadder(
		failing(
			'move-zeroes',
			traceOf({ nums: list(0, 1) }),
			str(`${NOT_IN_PLACE_PREFIX}nums: [1, 0]`),
			list(1, 0)
		),
		'move-zeroes-not-in-place'
	)
	assertLadder(
		failing('move-zeroes', traceOf({ nums: list(0, 1) }), list(0, 1), list(1, 0)),
		'move-zeroes-unchanged'
	)
	assertLadder(
		failing('move-zeroes', traceOf({ nums: list(3, 0, 1) }), list(1, 3, 0), list(3, 1, 0)),
		'move-zeroes-order-lost'
	)
})

test('binary search: missed target, false hit, value returned instead of index', () => {
	assertLadder(
		failing('binary-search', traceOf({ nums: list(1, 3), target: int(3) }), int(-1), int(1)),
		'search-missed-target'
	)
	assertLadder(
		failing('binary-search', traceOf({ nums: list(1, 3), target: int(2) }), int(1), int(-1)),
		'search-false-hit'
	)
	assertLadder(
		failing('binary-search', traceOf({ nums: list(10, 20, 30), target: int(30) }), int(30), int(2)),
		'search-value-not-index'
	)
})

test('valid parentheses: accepted-invalid names the counts, rejected-valid, pop on empty from the trace', () => {
	const odd = failing('valid-parentheses', traceOf({ s: str('(()') }), bool(true), bool(false))
	assertLadder(odd, 'parens-accepted-invalid')
	assert.ok(odd?.kind === 'diagnosis' && /2 opening and 1 closing/.test(odd.hints[0].body))
	const ordered = failing('valid-parentheses', traceOf({ s: str('([)]') }), bool(true), bool(false))
	assert.ok(ordered?.kind === 'diagnosis' && /order or the kinds/.test(ordered.hints[0].body))
	assertLadder(
		failing('valid-parentheses', traceOf({ s: str('()') }), bool(false), bool(true)),
		'parens-rejected-valid'
	)
	assertLadder(
		failing(
			'valid-parentheses',
			traceOf({ s: str(')') }, undefined, { type: 'IndexError', message: 'pop from empty list' }),
			undefined,
			bool(false),
			true
		),
		'parens-pop-empty'
	)
})

test('an unexplained failure falls back to the problem’s own correctness ladder, never a guess', () => {
	for (const slug of ['valid-anagram', 'move-zeroes', 'binary-search', 'valid-parentheses']) {
		const problem = PROBLEMS[slug]!
		const prompt = failing(slug, null, undefined, bool(true), true)
		assertLadder(prompt, `${slug}-spec`)
		assert.ok(prompt?.kind === 'diagnosis')
		assert.deepEqual(
			prompt.hints.map((h) => h.body),
			problem.correctnessHints
		)
	}
	// The original problems keep their neutral question fallback.
	assert.equal(failing('two-sum', null, undefined, list(0, 1), true)?.kind, 'question')
})

// ── Stage B: the optional optimization challenge ─────────────────────────────

test('a passing solution is never labelled brute-force from loop structure on the new problems', () => {
	const nested = ['def f(x):', '    for i in x:', '        for j in x:', '            pass']
	for (const slug of ['valid-anagram', 'move-zeroes', 'binary-search', 'valid-parentheses']) {
		const prompt = teach({
			problem: PROBLEMS[slug]!,
			trace: { source: nested, steps: [], truncated: false },
			outcome: { passed: true, actual: bool(true), expected: bool(true), errored: false },
			allTestsPassed: true
		})
		assert.equal(prompt, null, `${slug}: teach() stays silent on a pass`)
	}
	// Pre-existing behaviour for Two Sum is unchanged.
	assert.equal(
		teach({
			problem: PROBLEMS['two-sum']!,
			trace: { source: nested, steps: [], truncated: false },
			outcome: { passed: true, actual: list(0, 1), expected: list(0, 1), errored: false },
			allTestsPassed: true
		})?.kind,
		'diagnosis'
	)
})

test('optimizationPrompt: a three-level observation → reasoning → strategy ladder per new problem', () => {
	for (const slug of ['valid-anagram', 'move-zeroes', 'binary-search', 'valid-parentheses']) {
		const prompt = optimizationPrompt(PROBLEMS[slug]!)
		assertLadder(prompt, `optimise-${slug}`)
		assert.ok(prompt?.kind === 'diagnosis')
		assert.equal(hintRevealDetail(prompt, 2), `optimise-${slug}:L2`)
		for (const hint of prompt.hints) {
			assert.ok(!/\bO\([^)]*\)/.test(hint.body), 'no complexity claim about the learner')
			assert.ok(!/\b(your|you) (solution|code) is (slow|brute|inefficient)/i.test(hint.body))
		}
	}
	assert.equal(optimizationPrompt(PROBLEMS['two-sum']!), null)
})

test('the goal text is an invitation, not a verdict on the learner’s solution', () => {
	for (const slug of ['valid-anagram', 'move-zeroes', 'binary-search', 'valid-parentheses']) {
		const goal = PROBLEMS[slug]!.optimization!.goal
		assert.match(goal, /^Your solution passes\. As an optional exercise/)
		assert.ok(!/\bO\(/.test(goal))
	}
})

test('solved status survives later failing attempts and the first solve stays retrievable', () => {
	const attempts = [
		{ passed: false, source: 'v1' },
		{ passed: true, source: 'v2-solved' },
		{ passed: false, source: 'v3-optimising' },
		{ passed: false, source: 'v4-optimising' }
	]
	assert.equal(findSolvedAttempt(attempts)?.source, 'v2-solved')
	assert.equal(
		isOptimizationEligible({ allTestsPassed: findSolvedAttempt(attempts) != null }),
		true
	)
	// A second pass does not displace the original solution.
	assert.equal(
		findSolvedAttempt([...attempts, { passed: true, source: 'v5-better' }])?.source,
		'v2-solved'
	)
	// Nothing solved → no challenge.
	assert.equal(findSolvedAttempt(attempts.slice(0, 1)), undefined)
	assert.equal(isOptimizationEligible({ allTestsPassed: false }), false)
})
