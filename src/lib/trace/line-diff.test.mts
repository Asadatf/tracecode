import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
	defaultComparePair,
	hasChanges,
	lineDiff,
	tooLongToDiff,
	MAX_DIFF_LINES
} from './line-diff'

// specs/features/compare-attempts.md

const kinds = (a: string, b: string) => lineDiff(a, b).map((l) => `${l.kind[0]}:${l.text}`)

test('AC5: identical sources have no changes', () => {
	const src = 'def f(x):\n    return x'
	assert.equal(hasChanges(lineDiff(src, src)), false)
	assert.deepEqual(kinds(src, src), ['s:def f(x):', 's:    return x'])
})

test('AC4: one changed line shows as removed then added, with line numbers per side', () => {
	const before = 'for i in range(n):\n    for j in range(n):\n        check(i, j)'
	const after = 'for i in range(n):\n    for j in range(i + 1, n):\n        check(i, j)'
	const diff = lineDiff(before, after)
	assert.deepEqual(
		diff.map((l) => l.kind),
		['same', 'removed', 'added', 'same']
	)
	assert.deepEqual(diff[1], { kind: 'removed', text: '    for j in range(n):', aLine: 2 })
	assert.deepEqual(diff[2], { kind: 'added', text: '    for j in range(i + 1, n):', bLine: 2 })
	assert.deepEqual(diff[3], { kind: 'same', text: '        check(i, j)', aLine: 3, bLine: 3 })
})

test('added-only and removed-only changes', () => {
	assert.deepEqual(kinds('a\nc', 'a\nb\nc'), ['s:a', 'a:b', 's:c'])
	assert.deepEqual(kinds('a\nb\nc', 'a\nc'), ['s:a', 'r:b', 's:c'])
	assert.deepEqual(kinds('', 'x'), ['r:', 'a:x'])
})

test('trailing whitespace is not a change; indentation is', () => {
	assert.equal(hasChanges(lineDiff('x = 1   ', 'x = 1')), false)
	assert.equal(hasChanges(lineDiff('    x = 1', 'x = 1')), true)
})

test('edge: sources over the line cap are too long to compare', () => {
	const long = Array.from({ length: MAX_DIFF_LINES + 1 }, () => 'x').join('\n')
	assert.equal(tooLongToDiff(long, 'x'), true)
	assert.equal(tooLongToDiff('x', 'y'), false)
})

test('AC3: defaults to the last failure before the first pass, else the two latest', () => {
	assert.equal(defaultComparePair([false]), null)
	assert.deepEqual(defaultComparePair([false, false, true, true]), [1, 2])
	assert.deepEqual(defaultComparePair([false, true]), [0, 1])
	assert.deepEqual(defaultComparePair([false, false, false]), [1, 2])
	assert.deepEqual(defaultComparePair([true, true, false]), [1, 2])
})
