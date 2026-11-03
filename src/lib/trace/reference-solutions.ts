import type { Json } from './contract'

// Verified reference solutions for every problem in the registry. They are
// test fixtures, and the passing ones are also shown to learners in the
// Solutions tab (specs/features/solutions-tab.md), with their explanation.
// Each problem has at least a straightforward and an optimized variant;
// `passes: false` marks a deliberately NONCOMPLIANT baseline that grading must
// reject (never shown). Their stated complexities are checked by measurement
// in reference-solutions.test.mts, not by the AST heuristics.

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
	// Two to four plain-English sentences for the Solutions tab: the idea, and
	// why it costs what it costs. No complexity notation beyond `time`/`space`.
	explanation: string
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
			explanation:
				'Two strings are anagrams exactly when they contain the same letters the same number of times, so sorting both puts them in the same order. Compare the sorted versions. It is short to write, but sorting does more work than counting, and each sorted copy needs memory the size of the string.',
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
			explanation:
				'Count each letter of s in a dictionary, then walk through t and take one away for each of its letters. If a letter is missing or runs out, they are not anagrams. Each character is looked at once, and the dictionary only grows with the number of different letters.',
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
			explanation:
				"Like the dictionary, but the strings only use the 26 lowercase letters, so a list of 26 counters is enough. Each letter's position in the alphabet picks its slot. The memory used is the same 26 slots however long the strings are.",
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
			explanation:
				'Collect the non-zero values in order into a new list, then pad it with as many zeros as were removed and copy the result back into nums with a slice assignment. It is easy to get right, but the temporary list is as long as the input.',
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
			explanation:
				"Builds the right list but returns it instead of changing nums, so the caller's list is never updated.",
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
			explanation:
				'One index reads every value; the other marks where the next non-zero value belongs. Each non-zero value is swapped into that slot, which pushes zeros towards the end. One pass, and nothing is stored apart from two indexes.',
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
			explanation:
				'First copy every non-zero value forward to the next free slot, keeping their order. Every slot after the last one written must then be a zero, so fill those in. Two short passes over the list, with no extra list.',
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
			explanation:
				'Check each position from the start until you find the target, and return -1 if you never do. It works on any list, sorted or not, but in the worst case it looks at every value.',
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
			explanation:
				'Because the list is sorted, comparing the target with the middle value tells you which half it must be in, so you can throw the other half away. Repeat on the remaining half until you find it or nothing is left. Each step halves the search, so even 10 000 values need only about 14 checks.',
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
			explanation:
				'A valid string always contains a matching pair right next to each other, like () or []. Remove one such pair and start again, until no pairs are left; the string was valid if nothing remains. Each removal restarts the scan, so long strings take many passes.',
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
			explanation:
				'Walk through the string once. For each opening bracket, push the closer it needs onto a stack; for each closing bracket, it must match the top of the stack. The string is valid if every closer matched and the stack is empty at the end.',
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
	],
	'two-sum': [
		{
			name: 'Check every pair',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(1)',
			timeGrowth: 'quadratic',
			spaceGrowth: 'constant',
			explanation:
				'Try every pair of positions i < j and return the first pair whose values add up to the target. It always finds the answer, but the number of pairs grows with the square of the list length, so doubling the list makes it about four times slower.',
			source: py([
				'def two_sum(nums, target):',
				'    for i in range(len(nums)):',
				'        for j in range(i + 1, len(nums)):',
				'            if nums[i] + nums[j] == target:',
				'                return [i, j]',
				'    return []'
			])
		},
		{
			name: "Remember what you've seen",
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			timeGrowth: 'linear',
			spaceGrowth: 'linear',
			explanation:
				'Walk through the list once. For each value, work out the partner it needs (target minus the value) and look it up in a dictionary of values already seen, which takes about the same time however big the dictionary is. If the partner is there, return both indexes; otherwise remember this value and its index. It trades a little memory for one pass instead of every pair.',
			source: py([
				'def two_sum(nums, target):',
				'    seen = {}',
				'    for i, n in enumerate(nums):',
				'        need = target - n',
				'        if need in seen:',
				'            return [seen[need], i]',
				'        seen[n] = i',
				'    return []'
			])
		}
	],
	'contains-duplicate': [
		{
			name: 'Compare every pair',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(1)',
			timeGrowth: 'quadratic',
			spaceGrowth: 'constant',
			explanation:
				'Compare each value with every value after it and return True as soon as two are equal. When all values are different it has to check every pair, which grows with the square of the list length.',
			source: py([
				'def contains_duplicate(nums):',
				'    for i in range(len(nums)):',
				'        for j in range(i + 1, len(nums)):',
				'            if nums[i] == nums[j]:',
				'                return True',
				'    return False'
			])
		},
		{
			name: 'Set of values seen',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			timeGrowth: 'linear',
			spaceGrowth: 'linear',
			explanation:
				'Walk through the list once, keeping a set of the values seen so far. Checking whether a value is in a set takes about the same time however big the set is, so a repeat is spotted the moment it appears. The set can grow as large as the list.',
			source: py([
				'def contains_duplicate(nums):',
				'    seen = set()',
				'    for n in nums:',
				'        if n in seen:',
				'            return True',
				'        seen.add(n)',
				'    return False'
			])
		}
	],
	// Problem pack 2 (specs/features/problem-pack-classics.md).
	'best-time-to-buy-and-sell-stock': [
		{
			name: 'Every pair of days',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(1)',
			timeGrowth: 'quadratic',
			spaceGrowth: 'constant',
			explanation:
				'Try buying on every day i and selling on every later day j, and keep the biggest profit, starting from 0 so a falling market returns 0. It is correct, but the number of day pairs grows with the square of the number of days.',
			source: py([
				'def max_profit(prices):',
				'    best = 0',
				'    for i in range(len(prices)):',
				'        for j in range(i + 1, len(prices)):',
				'            best = max(best, prices[j] - prices[i])',
				'    return best'
			])
		},
		{
			name: 'Running minimum',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			explanation:
				'If you sell today, the best day to have bought was the cheapest day so far. So walk through the prices once, remembering the lowest price seen and the best profit seen, and update both on each day. One pass and two numbers.',
			source: py([
				'def max_profit(prices):',
				'    lowest = prices[0]',
				'    best = 0',
				'    for price in prices:',
				'        lowest = min(lowest, price)',
				'        best = max(best, price - lowest)',
				'    return best'
			])
		}
	],
	'valid-palindrome': [
		{
			name: 'Clean, then compare with the reverse',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			timeGrowth: 'linear',
			spaceGrowth: 'linear',
			explanation:
				'Build a list of just the letters and digits, in lower case, then check that it equals its own reverse. It is short and clear, but the cleaned list and its reverse each take memory about the size of the input.',
			source: py([
				'def is_palindrome(s):',
				'    cleaned = [ch.lower() for ch in s if ch.isalnum()]',
				'    return cleaned == cleaned[::-1]'
			])
		},
		{
			name: 'Two pointers from both ends',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			explanation:
				'Keep one index at the start and one at the end. Move each inwards past anything that is not a letter or digit, compare the two characters in lower case, and stop at the first mismatch. Every character is visited at most once and no copy of the string is made.',
			source: py([
				'def is_palindrome(s):',
				'    left, right = 0, len(s) - 1',
				'    while left < right:',
				'        if not s[left].isalnum():',
				'            left += 1',
				'        elif not s[right].isalnum():',
				'            right -= 1',
				'        elif s[left].lower() != s[right].lower():',
				'            return False',
				'        else:',
				'            left += 1',
				'            right -= 1',
				'    return True'
			])
		}
	],
	'maximum-subarray': [
		{
			name: 'Every starting position',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(1)',
			timeGrowth: 'quadratic',
			spaceGrowth: 'constant',
			explanation:
				'For each starting position, keep adding the next value to a running total and remember the biggest total reached. The best over all starts is the answer. Starting from the first value, not 0, makes all-negative lists come out right. It tries every start and end, so the work grows with the square of the length.',
			source: py([
				'def max_sub_array(nums):',
				'    best = nums[0]',
				'    for i in range(len(nums)):',
				'        total = 0',
				'        for j in range(i, len(nums)):',
				'            total += nums[j]',
				'            best = max(best, total)',
				'    return best'
			])
		},
		{
			name: "Kadane's running best",
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			explanation:
				'The best run ending at a value either starts fresh at that value or extends the best run ending just before it, whichever is bigger. Walk through the list once, keeping that running best and the best seen anywhere. A running total that has gone negative is simply dropped.',
			source: py([
				'def max_sub_array(nums):',
				'    best = nums[0]',
				'    current = 0',
				'    for x in nums:',
				'        current = max(x, current + x)',
				'        best = max(best, current)',
				'    return best'
			])
		}
	],
	'merge-sorted-array': [
		{
			name: 'Copy in, then sort',
			kind: 'straightforward',
			passes: true,
			time: 'O((m + n) log(m + n))',
			space: 'O(m + n)',
			explanation:
				"Copy nums2 into the free slots at the end of nums1, then sort nums1 in place. It is two lines and easy to trust, but it ignores that both lists were already sorted, and Python's sort needs some extra memory of its own.",
			source: py(['def merge(nums1, m, nums2, n):', '    nums1[m:] = nums2', '    nums1.sort()'])
		},
		{
			name: 'Merged copy, returned (noncompliant)',
			kind: 'straightforward',
			passes: false,
			time: 'O((m + n) log(m + n))',
			space: 'O(m + n)',
			explanation:
				"Builds the right list but returns it instead of changing nums1, so the caller's list is never updated.",
			source: py(['def merge(nums1, m, nums2, n):', '    return sorted(nums1[:m] + nums2)'])
		},
		{
			name: 'Three pointers from the back',
			kind: 'optimized',
			passes: true,
			time: 'O(m + n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			explanation:
				'The largest remaining value is always at the end of one of the two lists, and the free slots are at the end of nums1. So fill nums1 from the back: compare the last unplaced values of each list and put the bigger one in the last free slot. Nothing still needed is ever overwritten, and no extra list is made.',
			source: py([
				'def merge(nums1, m, nums2, n):',
				'    i, j, k = m - 1, n - 1, m + n - 1',
				'    while j >= 0:',
				'        if i >= 0 and nums1[i] > nums2[j]:',
				'            nums1[k] = nums1[i]',
				'            i -= 1',
				'        else:',
				'            nums1[k] = nums2[j]',
				'            j -= 1',
				'        k -= 1'
			])
		}
	],
	'majority-element': [
		{
			name: 'Count with a dictionary',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			timeGrowth: 'linear',
			spaceGrowth: 'linear',
			explanation:
				'Count how many times each value appears in a dictionary, returning a value as soon as its count passes half the length. It is one pass, but the dictionary can hold almost half as many entries as the list.',
			source: py([
				'def majority_element(nums):',
				'    counts = {}',
				'    for x in nums:',
				'        counts[x] = counts.get(x, 0) + 1',
				'        if counts[x] > len(nums) // 2:',
				'            return x'
			])
		},
		{
			name: 'Boyer–Moore voting',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			explanation:
				'Keep one candidate and a count. A matching value adds a vote and a different value cancels one; when the count drops to 0, the next value becomes the candidate. The majority has more copies than everything else combined, so it is the candidate left at the end. One pass and two variables.',
			source: py([
				'def majority_element(nums):',
				'    candidate, count = None, 0',
				'    for x in nums:',
				'        if count == 0:',
				'            candidate = x',
				'        count += 1 if x == candidate else -1',
				'    return candidate'
			])
		}
	],
	'climbing-stairs': [
		{
			name: 'Table of ways for every step',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			timeGrowth: 'linear',
			spaceGrowth: 'linear',
			explanation:
				'The last move onto step i came from step i − 1 or step i − 2, so ways[i] = ways[i − 1] + ways[i − 2]. Fill a list from the bottom up, starting with 1 way to stand at step 0 and 1 way to reach step 1. Each step is worked out once, but the list keeps an entry for every step.',
			source: py([
				'def climb_stairs(n):',
				'    ways = [1, 1] + [0] * (n - 1)',
				'    for i in range(2, n + 1):',
				'        ways[i] = ways[i - 1] + ways[i - 2]',
				'    return ways[n]'
			])
		},
		{
			name: 'Two running values',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			timeGrowth: 'linear',
			spaceGrowth: 'constant',
			explanation:
				'Each step only needs the answers for the two steps below it, so keep just those two numbers and slide them up one step at a time. Same number of steps as the table, without storing every answer. (Plain recursion without remembering results recomputes the same steps over and over and is far too slow for n = 45.)',
			source: py([
				'def climb_stairs(n):',
				'    below, current = 1, 1',
				'    for _ in range(n - 1):',
				'        below, current = current, below + current',
				'    return current'
			])
		}
	]
}

// The input the Solutions tab traces a learner's solution and the optimised
// approach on (specs/features/solutions-tab.md, AC7). Big enough to show a
// difference, small enough that a straightforward approach stays under the
// 2 000-step trace cap. Positional args, like a test.
export const COMPARISON_ARGS: Record<string, Json[]> = {
	'two-sum': [Array.from({ length: 24 }, (_, i) => i + 1), 47],
	'contains-duplicate': [Array.from({ length: 30 }, (_, i) => (i * 7) % 31)],
	'valid-anagram': ['listenpotsearthcinema', [...'listenpotsearthcinema'].reverse().join('')],
	'move-zeroes': [Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 0 : i))],
	'binary-search': [Array.from({ length: 100 }, (_, i) => i), 100],
	'valid-parentheses': ['('.repeat(15) + ')'.repeat(15)],
	'best-time-to-buy-and-sell-stock': [Array.from({ length: 30 }, (_, i) => (i * 37) % 50)],
	'valid-palindrome': ['Never odd or even, never odd or even'],
	'maximum-subarray': [Array.from({ length: 25 }, (_, i) => ((i * 13) % 21) - 10)],
	'merge-sorted-array': [
		[...Array.from({ length: 15 }, (_, i) => i * 2), ...Array.from({ length: 15 }, () => 0)],
		15,
		Array.from({ length: 15 }, (_, i) => i * 2 + 1),
		15
	],
	'majority-element': [Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? 4 : i))],
	'climbing-stairs': [20]
}
