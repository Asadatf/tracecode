import test from 'node:test'
import assert from 'node:assert/strict'
import { isMeaningfulChange } from './meaningful-code.ts'
import { isMeaningfulAttempt } from './attempt-meaning.ts'
import { PROBLEMS } from '../trace/problems.ts'

const starter =
	'def search(nums: list[int], target: int) -> int:\n    # Return the index of target in the sorted list nums, or -1 if absent.\n    return -1'
const changed = (src: string) => isMeaningfulChange(src, starter)

test('untouched starter is not meaningful', () => {
	assert.equal(changed(starter), false)
})

test('empty, whitespace-only and comment-only sources are not meaningful', () => {
	assert.equal(changed(''), false)
	assert.equal(changed('   \n\n\t\n'), false)
	assert.equal(changed('# nothing here\n# still nothing'), false)
})

test('whitespace and comment edits of the starter are not meaningful', () => {
	assert.equal(changed(starter + '\n\n\n'), false)
	assert.equal(changed('\n\n' + starter), false)
	assert.equal(changed(starter.replace(/    /g, '\t')), false)
	assert.equal(changed(starter.replace(/    /g, '  ')), false)
	assert.equal(changed(starter.replace('# Return', '# A different comment, Return')), false)
	assert.equal(changed(starter + '  # trailing comment'), false)
	assert.equal(changed(starter.replace('\n', '\r\n')), false)
	assert.equal(
		changed(starter.replace('nums: list[int], target: int', 'nums:list[int],target:int')),
		false
	)
	assert.equal(changed(starter.replace('return -1', 'return   -1')), false)
	assert.equal(changed(starter.replace('return -1', 'return -\\\n    1')), false)
	assert.equal(
		changed(
			starter
				.replace('(nums: list[int], target: int)', '(\n  nums: list[int],\n  target: int,\n)')
				.replace(',\n)', '\n)')
		),
		false
	)
})

test('a changed expression, name or literal is meaningful', () => {
	assert.equal(changed(starter.replace('return -1', 'return 0')), true)
	assert.equal(changed(starter.replace('nums', 'xs')), true)
	assert.equal(changed(starter.replace('return -1', 'return None')), true)
	assert.equal(changed(starter + '\n    pass'), true)
})

test('block structure is meaningful: moving a line to another depth changes the program', () => {
	const a = 'def f(x):\n    if x:\n        return 1\n    return 0'
	const b = 'def f(x):\n    if x:\n        return 1\n        return 0'
	assert.equal(isMeaningfulChange(b, a), true)
	assert.equal(isMeaningfulChange(a.replace(/ {4}/g, '  ').replace(/ {8}/g, '    '), a), false)
})

test('string contents are compared exactly; # inside a string is not a comment', () => {
	const a = 'x = "a  # b"'
	assert.equal(isMeaningfulChange('x = "a # b"', a), true)
	assert.equal(isMeaningfulChange('x   =   "a  # b"  # real comment', a), false)
	assert.equal(isMeaningfulChange("x = '''a\n  # b'''", "x = '''a\n  # b'''"), false)
	assert.equal(isMeaningfulChange("x = '''a\n    # b'''", "x = '''a\n  # b'''"), true)
	assert.equal(isMeaningfulChange('x = r"a\\"b"', 'x = r"a\\"b"'), false)
})

test('a genuinely different solution is meaningful, however it is formatted', () => {
	const solution =
		'def search(nums, target):\n    lo, hi = 0, len(nums) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if nums[mid] == target:\n            return mid\n        elif nums[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1'
	assert.equal(changed(solution), true)
	assert.equal(changed(solution.replace(/\n/g, '\n\n')), true)
})

test('server verdict uses the canonical catalogue starter', () => {
	const problem = PROBLEMS['binary-search']
	assert.ok(problem)
	assert.equal(isMeaningfulAttempt('binary-search', problem.starter), false)
	assert.equal(isMeaningfulAttempt('binary-search', problem.starter + '\n\n# note'), false)
	assert.equal(
		isMeaningfulAttempt('binary-search', problem.starter.replace('return -1', 'return 0')),
		true
	)
	// Every catalogue starter is itself "untouched", and none is accidentally empty.
	for (const p of Object.values(PROBLEMS)) {
		assert.equal(isMeaningfulAttempt(p.slug, p.starter), false, p.slug)
		assert.ok(p.starter.trim().length > 0, p.slug)
	}
})

test('an unknown or prototype-ish problem slug is never meaningful', () => {
	assert.equal(isMeaningfulAttempt('no-such-problem', 'def f(): return 1'), false)
	assert.equal(isMeaningfulAttempt('constructor', 'def f(): return 1'), false)
	assert.equal(isMeaningfulAttempt('__proto__', 'def f(): return 1'), false)
})
