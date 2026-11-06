import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { checkPack, packProblemSchema, toProblemDefinition, type PackProblem } from './pool-pack.ts'

// specs/features/daily-exam.md AC6, AC42. Uses a SYNTHETIC fixture only: real pool content lives in
// the git-ignored private/exam-pool/ and is never read by tests.

const fixture = (over: Partial<PackProblem> = {}): PackProblem =>
	packProblemSchema.parse({
		slug: 'synthetic-double',
		title: 'Synthetic Double',
		entry: 'double',
		params: [{ name: 'n' }],
		difficulty: 'easy',
		conceptTags: ['math'],
		statement: ['Return twice n, for a synthetic test fixture only.'],
		examples: [{ args: [2], output: 4 }],
		starter: 'def double(n):\n    return 0\n',
		practiceTests: [1, 2, 3, 4].map((n) => ({ id: `t${n}`, args: [n], expected: n * 2 })),
		hiddenCases: Array.from({ length: 10 }, (_, i) => ({
			id: `h${i}`,
			args: [i + 10],
			expected: (i + 10) * 2
		})),
		referenceSolutions: [{ name: 'ref', source: 'def double(n):\n    return n * 2\n' }],
		wrongSolutions: [
			{ name: 'zero', source: 'def double(n):\n    return 0\n' },
			{ name: 'same', source: 'def double(n):\n    return n\n' }
		],
		...over
	})

test('a well-formed pack has no issues', () => {
	assert.deepEqual(checkPack([fixture()], new Set()), [])
})

test('a pool problem may not reuse a public catalogue slug or another pool slug', () => {
	const codes = checkPack([fixture(), fixture()], new Set(['synthetic-double'])).map((i) => i.code)
	assert.ok(codes.includes('duplicate_slug'))
	assert.ok(codes.includes('slug_is_public_catalogue_problem'))
})

test('the public practice set and examples may not share an input with the hidden suite', () => {
	const p = fixture({
		practiceTests: [10, 2, 3, 4].map((n, i) => ({ id: `t${i}`, args: [n], expected: n * 2 }))
	})
	assert.deepEqual(
		checkPack([p], new Set()).map((i) => i.code),
		['practice_overlaps_hidden']
	)
	const e = fixture({ examples: [{ args: [11], output: 22 }] })
	assert.deepEqual(
		checkPack([e], new Set()).map((i) => i.code),
		['example_overlaps_hidden']
	)
})

test('arity, ids, starter entry and disagreeing examples are caught', () => {
	const codes = checkPack(
		[
			fixture({
				examples: [{ args: [2], output: 5 }],
				practiceTests: [
					{ id: 't1', args: [2], expected: 4 },
					{ id: 't1', args: [3], expected: 6 },
					{ id: 't3', args: [4, 5], expected: 8 },
					{ id: 't4', args: [5], expected: 10 }
				],
				starter: 'def other(n):\n    return 0\n'
			})
		],
		new Set()
	).map((i) => i.code)
	for (const code of [
		'arity_mismatch',
		'duplicate_practice_id',
		'example_disagrees',
		'starter_lacks_entry'
	])
		assert.ok(codes.includes(code), code)
})

test('the schema demands enough hidden cases and at least two wrong solutions', () => {
	assert.throws(() => fixture({ hiddenCases: [] }))
	assert.throws(() =>
		fixture({ wrongSolutions: [{ name: 'only', source: 'def double(n):\n    return 0\n' }] })
	)
})

test('the runner definition carries the PUBLIC practice cases, never the hidden suite', () => {
	const def = toProblemDefinition(fixture())
	assert.deepEqual(
		def.tests.map((t) => t.id),
		['t1', 't2', 't3', 't4']
	)
	assert.ok(!JSON.stringify(def).includes('"h0"'))
	assert.ok(!('hiddenCases' in def) && !('referenceSolutions' in def))
})

// Code only: a comment may mention the directory, a string or import that names it may not.
const stripComments = (source: string) =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

test('AC6: nothing under src/ or scripts/ reads the private pool directory except the loader', () => {
	const offenders: string[] = []
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name)
			if (entry.isDirectory()) walk(path)
			else if (/\.(m?ts|tsx|mjs)$/.test(entry.name) && !entry.name.includes('.test.')) {
				if (
					/exam-pool/.test(stripComments(readFileSync(path, 'utf8'))) &&
					!path.endsWith('load-exam-pool.mts')
				)
					offenders.push(path)
			}
		}
	}
	walk('src')
	walk('scripts')
	assert.deepEqual(offenders, [])
})
