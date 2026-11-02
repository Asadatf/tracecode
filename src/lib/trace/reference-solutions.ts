// Verified reference solutions for the curated catalog — test fixtures and the
// research dossier's ground truth, never shown to learners. Each problem has at
// least a straightforward and an optimized variant; `passes: false` marks a
// deliberately NONCOMPLIANT baseline that grading must reject. Their stated
// complexities are checked by measurement in reference-solutions.test.mts, not
// by the AST heuristics.

export type Growth = 'constant' | 'log' | 'linear' | 'quadratic'

export interface ReferenceSolution {
	name: string
	kind: 'straightforward' | 'optimized'
	// Whether it satisfies the problem's real contract and so must pass every test.
	passes: boolean
	time: string
	space: string
	// Measured by the test: Python line events as the input doubles. Absent for
	// variants whose cost hides inside a C builtin (sorted, str.replace).
	timeGrowth?: Growth
	// Measured by the test: peak auxiliary allocation as the input grows.
	spaceGrowth?: Growth
	source: string
}

const py = (lines: string[]): string => lines.join('\n') + '\n'

export const REFERENCE_SOLUTIONS: Record<string, ReferenceSolution[]> = {
	'valid-anagram': [
		{
			name: 'Sort both strings',
			kind: 'straightforward',
			passes: true,
			time: 'O(n log n)',
			space: 'O(n)',
			source: py(['def is_anagram(s, t):', '    return sorted(s) == sorted(t)'])
		},
		{
			name: 'Frequency dictionary',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(k) for k distinct characters',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			source: py([
				'def is_anagram(s, t):',
				'    if len(s) != len(t):',
				'        return False',
				'    counts = {}',
				'    for ch in s:',
				'        counts[ch] = counts.get(ch, 0) + 1',
				'    for ch in t:',
				'        if counts.get(ch, 0) == 0:',
				'            return False',
				'        counts[ch] -= 1',
				'    return True'
			])
		},
		{
			name: 'Fixed 26-slot counter',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			source: py([
				'def is_anagram(s, t):',
				'    if len(s) != len(t):',
				'        return False',
				'    counts = [0] * 26',
				'    for ch in s:',
				"        counts[ord(ch) - ord('a')] += 1",
				'    for ch in t:',
				"        index = ord(ch) - ord('a')",
				'        counts[index] -= 1',
				'        if counts[index] < 0:',
				'            return False',
				'    return True'
			])
		}
	],
	'move-zeroes': [
		{
			name: 'Extra list, written back in place',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			timeGrowth: 'linear',
			spaceGrowth: 'linear',
			source: py([
				'def move_zeroes(nums):',
				'    kept = [x for x in nums if x != 0]',
				'    nums[:] = kept + [0] * (len(nums) - len(kept))'
			])
		},
		{
			name: 'Extra list, returned (noncompliant)',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(n)',
			source: py([
				'def move_zeroes(nums):',
				'    kept = [x for x in nums if x != 0]',
				'    return kept + [0] * (len(nums) - len(kept))'
			])
		},
		{
			name: 'Two pointers, swap',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			source: py([
				'def move_zeroes(nums):',
				'    write = 0',
				'    for read in range(len(nums)):',
				'        if nums[read] != 0:',
				'            nums[write], nums[read] = nums[read], nums[write]',
				'            write += 1'
			])
		},
		{
			name: 'Two pointers, copy then fill',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			source: py([
				'def move_zeroes(nums):',
				'    write = 0',
				'    for read in range(len(nums)):',
				'        if nums[read] != 0:',
				'            nums[write] = nums[read]',
				'            write += 1',
				'    for i in range(write, len(nums)):',
				'        nums[i] = 0'
			])
		}
	],
	'binary-search': [
		{
			name: 'Linear scan',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			source: py([
				'def search(nums, target):',
				'    for i in range(len(nums)):',
				'        if nums[i] == target:',
				'            return i',
				'    return -1'
			])
		},
		{
			name: 'Iterative binary search',
			kind: 'optimized',
			passes: true,
			time: 'O(log n)',
			space: 'O(1)',
			timeGrowth: 'log',
			spaceGrowth: 'constant',
			source: py([
				'def search(nums, target):',
				'    left, right = 0, len(nums) - 1',
				'    while left <= right:',
				'        mid = left + (right - left) // 2',
				'        if nums[mid] == target:',
				'            return mid',
				'        if nums[mid] < target:',
				'            left = mid + 1',
				'        else:',
				'            right = mid - 1',
				'    return -1'
			])
		}
	],
	'valid-parentheses': [
		{
			name: 'Repeated adjacent-pair removal',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(n)',
			timeGrowth: 'quadratic',
			spaceGrowth: 'linear',
			source: py([
				'def is_valid(s):',
				'    chars = list(s)',
				'    removed = True',
				'    while removed:',
				'        removed = False',
				'        for i in range(len(chars) - 1):',
				"            if chars[i] + chars[i + 1] in ('()', '[]', '{}'):",
				'                del chars[i:i + 2]',
				'                removed = True',
				'                break',
				'    return len(chars) == 0'
			])
		},
		{
			name: 'Stack of expected closers',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			timeGrowth: 'linear',
			spaceGrowth: 'linear',
			source: py([
				'def is_valid(s):',
				"    closer_for = {'(': ')', '[': ']', '{': '}'}",
				'    stack = []',
				'    for ch in s:',
				'        if ch in closer_for:',
				'            stack.append(closer_for[ch])',
				'        elif not stack or stack.pop() != ch:',
				'            return False',
				'    return not stack'
			])
		}
	]
}
