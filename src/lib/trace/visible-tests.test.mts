import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PROBLEMS } from './problems.ts'
import { REFERENCE_SOLUTIONS } from './reference-solutions.ts'
import { pythonAvailable, runInPython } from './engine-python.mts'
import { buildRunRequest } from './grading.ts'
import { splitResults, visibleTestIds } from './visible-tests.ts'
import { HIDDEN_SUITES } from '../../server/challenge/hidden-suites.data.ts'

const skip = !pythonAvailable() && 'python3 not available'
// The original six problems; the ten catalogue-expansion problems are covered in
// catalog-expansion.test.mts.
const slugs = [
	'two-sum',
	'contains-duplicate',
	'valid-anagram',
	'move-zeroes',
	'binary-search',
	'valid-parentheses'
]
const json = (value: unknown) => JSON.stringify(value)

// Test counts BEFORE this change, so the validation set can never be quietly shrunk: the four
// larger problems are untouched, Two Sum gained three distinct cases.
const FULL_COUNTS: Record<string, number> = {
	'two-sum': 6,
	'contains-duplicate': 5,
	'valid-anagram': 18,
	'move-zeroes': 19,
	'binary-search': 25,
	'valid-parentheses': 26
}

test('every problem shows a small teaching set of 5 to 6 results', () => {
	for (const slug of slugs) {
		const problem = PROBLEMS[slug]!
		const shown = visibleTestIds(problem)
		assert.ok(shown.size >= 5 && shown.size <= 6, `${slug}: ${shown.size} visible`)
		for (const id of shown)
			assert.ok(
				problem.tests.some((t) => t.id === id),
				`${slug}: ${id} exists`
			)
	}
})

test('the visible cases of a problem are distinct and small enough to read', () => {
	for (const slug of slugs) {
		const problem = PROBLEMS[slug]!
		const shown = problem.tests.filter((t) => visibleTestIds(problem).has(t.id))
		assert.equal(
			new Set(shown.map((t) => json(t.args))).size,
			shown.length,
			`${slug}: distinct inputs`
		)
		for (const t of shown)
			assert.ok(json(t.args).length < 120, `${slug} ${t.id} is a readable input`)
	}
})

test('every test still runs: the validation set was not reduced', () => {
	for (const slug of slugs)
		assert.equal(PROBLEMS[slug]!.tests.length, FULL_COUNTS[slug], `${slug} test count`)
	// The larger inputs that guard performance are still there for the problems that had them.
	for (const slug of ['valid-anagram', 'move-zeroes', 'binary-search', 'valid-parentheses']) {
		const big = PROBLEMS[slug]!.tests.filter((t) => json(t.args).length > 3000)
		assert.ok(big.length >= 3, `${slug}: large validation inputs retained (${big.length})`)
		for (const t of big)
			assert.equal(
				visibleTestIds(PROBLEMS[slug]!).has(t.id),
				false,
				`${slug} ${t.id} is validation`
			)
	}
})

const ids = (slug: string) =>
	new Set(
		PROBLEMS[slug]!.tests.filter((t) => visibleTestIds(PROBLEMS[slug]!).has(t.id)).map((t) => t.id)
	)
const visible = (slug: string) => PROBLEMS[slug]!.tests.filter((t) => ids(slug).has(t.id))

test('Two Sum shows a normal case, duplicates, negatives, a zero pair and an answer at the end', () => {
	const args = visible('two-sum').map((t) => json(t.args))
	assert.ok(args.includes('[[2,7,11,15],9]'))
	assert.ok(args.includes('[[3,3],6]'), 'duplicate values')
	assert.ok(
		args.some((a) => /-\d/.test(a)),
		'negative numbers'
	)
	assert.ok(args.includes('[[0,4,0],0]'), 'zero target with zeros')
	assert.ok(
		visible('two-sum').some((t) => json(t.expected) === '[2,3]'),
		'answer at the end of the list'
	)
})

test('Contains Duplicate keeps both outcomes, the empty list and a negative duplicate', () => {
	const v = visible('contains-duplicate')
	assert.ok(v.some((t) => t.expected === true) && v.some((t) => t.expected === false))
	assert.ok(v.some((t) => json(t.args) === '[[]]'))
	assert.ok(v.some((t) => /-\d/.test(json(t.args))))
})

test('Valid Anagram shows a match, a mismatch, a length difference and same-length different counts', () => {
	const v = visible('valid-anagram')
	assert.ok(v.some((t) => t.expected === true) && v.some((t) => t.expected === false))
	assert.ok(
		v.some((t) => t.args[0]!.toString().length !== t.args[1]!.toString().length),
		'length mismatch'
	)
	assert.ok(
		v.some(
			(t) =>
				t.expected === false &&
				t.args[0]!.toString().length === t.args[1]!.toString().length &&
				t.args[0] !== t.args[1] &&
				[...new Set(String(t.args[0]))].sort().join('') ===
					[...new Set(String(t.args[1]))].sort().join('')
		),
		'same letters, different counts'
	)
	assert.ok(
		v.some((t) => t.expected === true && /(.)\1|(.).*\2/.test(String(t.args[0]))),
		'repeated letters'
	)
})

test('Move Zeroes shows the example, a lone zero, all zeros, no zeros, leading zeros and a mixed order', () => {
	const args = visible('move-zeroes').map((t) => json(t.args))
	for (const needed of [
		'[[0,1,0,3,12]]',
		'[[0]]',
		'[[0,0,0,0]]',
		'[[1,2,3]]',
		'[[0,0,1]]',
		'[[4,0,5,0,0,6]]'
	])
		assert.ok(args.includes(needed), needed)
})

test('Binary Search shows found, missing, a single element and both ends of the list', () => {
	const v = visible('binary-search')
	assert.ok(v.some((t) => t.expected !== -1) && v.some((t) => t.expected === -1))
	assert.ok(
		v.some((t) => (t.args[0] as number[]).length === 1 && t.expected === 0),
		'single element found'
	)
	assert.ok(
		v.some((t) => (t.args[0] as number[]).length === 1 && t.expected === -1),
		'single element missing'
	)
	assert.ok(
		v.some((t) => t.expected === 0 && (t.args[0] as number[]).length > 1),
		'first element'
	)
	assert.ok(
		v.some((t) => t.expected === (t.args[0] as number[]).length - 1 && t.expected > 0),
		'last element'
	)
})

test('Valid Parentheses shows valid nesting, a wrong kind, wrong order, an unclosed and a lone closer', () => {
	const args = visible('valid-parentheses').map((t) => String(t.args[0]))
	for (const needed of ['()[]{}', '{[]}', '(]', '([)]', '(', ')'])
		assert.ok(args.includes(needed), needed)
})

test('visible results are presentation only: a failing validation check is never hidden', () => {
	const problem = PROBLEMS['valid-anagram']!
	const results = problem.tests.map((t) => ({
		testId: t.id,
		passed: !['t16', 't9'].includes(t.id)
	}))
	const split = splitResults(problem, results)
	assert.equal(split.visible.length + split.checks.length, problem.tests.length)
	assert.deepEqual(split.failedChecks.map((r) => r.testId).sort(), ['t16', 't9'])
	assert.equal(split.passedChecks.length, split.checks.length - 2)
	// With no visibleTestIds every test is shown individually.
	const all = splitResults({ tests: problem.tests }, results)
	assert.equal(all.checks.length, 0)
})

test('hidden Daily Challenge suites are unchanged by this work (fingerprint)', () => {
	const fingerprint = createHash('sha256').update(json(HIDDEN_SUITES)).digest('hex')
	assert.equal(fingerprint, HIDDEN_FINGERPRINT)
	assert.deepEqual(Object.keys(HIDDEN_SUITES).sort(), [...slugs].sort())
})

// Grading correctness is unchanged: compliant solutions pass every test (visible and validation),
// and the deliberately wrong references still fail at least one.
test(
	'grading still accepts every compliant reference and rejects every non-compliant one',
	{ skip },
	() => {
		let checked = 0
		for (const slug of Object.keys(REFERENCE_SOLUTIONS)) {
			const problem = PROBLEMS[slug]!
			for (const reference of REFERENCE_SOLUTIONS[slug]!) {
				const result = runInPython(
					buildRunRequest(problem, reference.source, { timeoutMs: 30_000 })
				)
				const failed = result.tests.filter((t) => !t.passed)
				if (reference.passes) assert.equal(failed.length, 0, `${slug} / ${reference.name}`)
				else assert.ok(failed.length > 0, `${slug} / ${reference.name} must fail something`)
				checked += 1
			}
		}
		assert.ok(checked >= 8, `${checked} references checked`)
	}
)

const HIDDEN_FINGERPRINT = '36cbccd384fc85f5ad67812a398ee4c72b84d90ae8430d9a0b25188b154cb3e9'
