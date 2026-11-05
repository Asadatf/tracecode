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
	],
	// ---- catalogue expansion: each has a straightforward and an optimized compliant variant and
	// deliberately wrong beginner baselines that grading must reject. Growth is documented in
	// `time`/`space` and not claimed by measurement here (no timeGrowth/spaceGrowth).
	'valid-palindrome': [
		{
			name: 'Clean the string, compare with its reverse',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			source: py([
				'def is_palindrome(s):',
				'    cleaned = [ch.lower() for ch in s if ch.isalnum()]',
				'    return cleaned == cleaned[::-1]'
			])
		},
		{
			name: 'Two pointers that skip other characters',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def is_palindrome(s):',
				'    left, right = 0, len(s) - 1',
				'    while left < right:',
				'        if not s[left].isalnum():',
				'            left += 1',
				'        elif not s[right].isalnum():',
				'            right -= 1',
				'        else:',
				'            if s[left].lower() != s[right].lower():',
				'                return False',
				'            left += 1',
				'            right -= 1',
				'    return True'
			])
		},
		{
			name: 'Compares the raw string with its reverse',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(n)',
			source: py(['def is_palindrome(s):', '    return s.lower() == s.lower()[::-1]'])
		},
		{
			name: 'Treats digits as skippable (isalpha)',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(n)',
			source: py([
				'def is_palindrome(s):',
				'    cleaned = [ch.lower() for ch in s if ch.isalpha()]',
				'    return cleaned == cleaned[::-1]'
			])
		},
		{
			name: 'Forgets to ignore letter case',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(n)',
			source: py([
				'def is_palindrome(s):',
				'    cleaned = [ch for ch in s if ch.isalnum()]',
				'    return cleaned == cleaned[::-1]'
			])
		},
		{
			name: 'Returns False for an empty string',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(n)',
			source: py([
				'def is_palindrome(s):',
				'    cleaned = [ch.lower() for ch in s if ch.isalnum()]',
				'    if not s:',
				'        return False',
				'    return cleaned == cleaned[::-1]'
			])
		}
	],
	'reverse-string': [
		{
			name: 'Slice assignment from a reversed copy',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			source: py(['def reverse_string(s):', '    s[:] = s[::-1]'])
		},
		{
			name: 'Swap from both ends',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def reverse_string(s):',
				'    left, right = 0, len(s) - 1',
				'    while left < right:',
				'        s[left], s[right] = s[right], s[left]',
				'        left += 1',
				'        right -= 1'
			])
		},
		{
			name: 'Returns a reversed copy instead of changing s',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(n)',
			source: py(['def reverse_string(s):', '    return s[::-1]'])
		},
		{
			name: 'Rebinds the name s (the caller still holds the old list)',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(n)',
			source: py(['def reverse_string(s):', '    s = s[::-1]'])
		},
		{
			name: 'Swaps every pair twice (loops over the whole list)',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def reverse_string(s):',
				'    for i in range(len(s)):',
				'        j = len(s) - 1 - i',
				'        s[i], s[j] = s[j], s[i]'
			])
		}
	],
	'maximum-subarray': [
		{
			name: 'Try every start and end',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(1)',
			source: py([
				'def max_sub_array(nums):',
				'    best = nums[0]',
				'    for start in range(len(nums)):',
				'        total = 0',
				'        for end in range(start, len(nums)):',
				'            total += nums[end]',
				'            if total > best:',
				'                best = total',
				'    return best'
			])
		},
		{
			name: "Best run ending here (Kadane's)",
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_sub_array(nums):',
				'    current = best = nums[0]',
				'    for x in nums[1:]:',
				'        current = max(x, current + x)',
				'        best = max(best, current)',
				'    return best'
			])
		},
		{
			name: 'Starts the best at 0, so all-negative input returns 0',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_sub_array(nums):',
				'    current = best = 0',
				'    for x in nums:',
				'        current = max(0, current + x)',
				'        best = max(best, current)',
				'    return best'
			])
		},
		{
			name: 'Adds every positive number (not contiguous)',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_sub_array(nums):',
				'    return sum(x for x in nums if x > 0) or max(nums)'
			])
		},
		{
			name: 'Only compares neighbouring pairs',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_sub_array(nums):',
				'    best = nums[0]',
				'    for i in range(len(nums) - 1):',
				'        best = max(best, nums[i] + nums[i + 1])',
				'    return best'
			])
		}
	],
	'best-time-to-buy-and-sell-stock': [
		{
			name: 'Try every buy and sell pair',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(1)',
			source: py([
				'def max_profit(prices):',
				'    best = 0',
				'    for buy in range(len(prices)):',
				'        for sell in range(buy + 1, len(prices)):',
				'            best = max(best, prices[sell] - prices[buy])',
				'    return best'
			])
		},
		{
			name: 'Track the lowest price so far',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_profit(prices):',
				'    lowest = None',
				'    best = 0',
				'    for price in prices:',
				'        if lowest is None or price < lowest:',
				'            lowest = price',
				'        elif price - lowest > best:',
				'            best = price - lowest',
				'    return best'
			])
		},
		{
			name: 'Highest minus lowest, ignoring the order of the days',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_profit(prices):',
				'    return max(prices) - min(prices) if prices else 0'
			])
		},
		{
			name: 'Reads prices[0] without checking for an empty list',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_profit(prices):',
				'    lowest = prices[0]',
				'    best = 0',
				'    for price in prices:',
				'        lowest = min(lowest, price)',
				'        best = max(best, price - lowest)',
				'    return best'
			])
		},
		{
			name: 'Sells before it buys (highest so far minus a later price)',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def max_profit(prices):',
				'    highest = 0',
				'    best = 0',
				'    for price in prices:',
				'        highest = max(highest, price)',
				'        best = max(best, highest - price)',
				'    return best'
			])
		}
	],
	'merge-two-sorted-arrays': [
		{
			name: 'Combine, sort and write back into nums1',
			kind: 'straightforward',
			passes: true,
			time: 'O((m+n) log(m+n))',
			space: 'O(m+n)',
			source: py(['def merge(nums1, m, nums2, n):', '    nums1[:] = sorted(nums1[:m] + nums2[:n])'])
		},
		{
			name: 'Fill nums1 from the back',
			kind: 'optimized',
			passes: true,
			time: 'O(m+n)',
			space: 'O(1)',
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
		},
		{
			name: 'Rebinds nums1 to a new sorted list',
			kind: 'straightforward',
			passes: false,
			time: 'O((m+n) log(m+n))',
			space: 'O(m+n)',
			source: py(['def merge(nums1, m, nums2, n):', '    nums1 = sorted(nums1[:m] + nums2[:n])'])
		},
		{
			name: 'Sorts nums1 with its placeholder zeros included',
			kind: 'straightforward',
			passes: false,
			time: 'O((m+n) log(m+n))',
			space: 'O(1)',
			source: py(['def merge(nums1, m, nums2, n):', '    nums1.sort()'])
		},
		{
			name: 'Forgets the values left over in nums2',
			kind: 'optimized',
			passes: false,
			time: 'O(m+n)',
			space: 'O(1)',
			source: py([
				'def merge(nums1, m, nums2, n):',
				'    i, j, k = m - 1, n - 1, m + n - 1',
				'    while i >= 0 and j >= 0:',
				'        if nums1[i] > nums2[j]:',
				'            nums1[k] = nums1[i]',
				'            i -= 1',
				'        else:',
				'            nums1[k] = nums2[j]',
				'            j -= 1',
				'        k -= 1'
			])
		}
	],
	'first-unique-character': [
		{
			name: 'Count each character with s.count',
			kind: 'straightforward',
			passes: true,
			time: 'O(n²)',
			space: 'O(1)',
			source: py([
				'def first_uniq_char(s):',
				'    for i, ch in enumerate(s):',
				'        if s.count(ch) == 1:',
				'            return i',
				'    return -1'
			])
		},
		{
			name: 'Count once, then scan again',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def first_uniq_char(s):',
				'    counts = {}',
				'    for ch in s:',
				'        counts[ch] = counts.get(ch, 0) + 1',
				'    for i, ch in enumerate(s):',
				'        if counts[ch] == 1:',
				'            return i',
				'    return -1'
			])
		},
		{
			name: 'Returns the LAST unique character',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def first_uniq_char(s):',
				'    counts = {}',
				'    for ch in s:',
				'        counts[ch] = counts.get(ch, 0) + 1',
				'    for i in range(len(s) - 1, -1, -1):',
				'        if counts[s[i]] == 1:',
				'            return i',
				'    return -1'
			])
		},
		{
			name: 'Only compares a character with its neighbours',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def first_uniq_char(s):',
				'    for i in range(len(s)):',
				'        before = i == 0 or s[i - 1] != s[i]',
				'        after = i == len(s) - 1 or s[i + 1] != s[i]',
				'        if before and after:',
				'            return i',
				'    return -1'
			])
		},
		{
			name: 'Returns 0 when nothing is unique',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def first_uniq_char(s):',
				'    counts = {}',
				'    for ch in s:',
				'        counts[ch] = counts.get(ch, 0) + 1',
				'    for i, ch in enumerate(s):',
				'        if counts[ch] == 1:',
				'            return i',
				'    return 0'
			])
		}
	],
	'missing-number': [
		{
			name: 'Remember seen numbers',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			source: py([
				'def missing_number(nums):',
				'    seen = set(nums)',
				'    for value in range(len(nums) + 1):',
				'        if value not in seen:',
				'            return value'
			])
		},
		{
			name: 'Expected sum minus actual sum',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def missing_number(nums):',
				'    n = len(nums)',
				'    return n * (n + 1) // 2 - sum(nums)'
			])
		},
		{
			name: 'Sums only 0..n-1, so it is off by n',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py(['def missing_number(nums):', '    return sum(range(len(nums))) - sum(nums)'])
		},
		{
			name: 'Assumes the list is already sorted',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def missing_number(nums):',
				'    for i in range(len(nums)):',
				'        if nums[i] != i:',
				'            return i',
				'    return len(nums)'
			])
		},
		{
			name: 'XOR that forgets to include n',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def missing_number(nums):',
				'    result = 0',
				'    for i, x in enumerate(nums):',
				'        result ^= i ^ x',
				'    return result'
			])
		}
	],
	'majority-element': [
		{
			name: 'Count every value',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
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
			source: py([
				'def majority_element(nums):',
				'    candidate = None',
				'    votes = 0',
				'    for x in nums:',
				'        if votes == 0:',
				'            candidate = x',
				'        votes += 1 if x == candidate else -1',
				'    return candidate'
			])
		},
		{
			name: 'Returns the first element',
			kind: 'straightforward',
			passes: false,
			time: 'O(1)',
			space: 'O(1)',
			source: py(['def majority_element(nums):', '    return nums[0]'])
		},
		{
			name: 'Returns the largest element',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py(['def majority_element(nums):', '    return max(nums)'])
		},
		{
			name: 'Returns the middle element without sorting',
			kind: 'optimized',
			passes: false,
			time: 'O(1)',
			space: 'O(1)',
			source: py(['def majority_element(nums):', '    return nums[len(nums) // 2]'])
		}
	],
	'longest-common-prefix': [
		{
			name: 'Shorten a candidate against each string',
			kind: 'straightforward',
			passes: true,
			time: 'O(total characters)',
			space: 'O(1)',
			source: py([
				'def longest_common_prefix(strs):',
				'    if not strs:',
				'        return ""',
				'    prefix = strs[0]',
				'    for word in strs[1:]:',
				'        while not word.startswith(prefix):',
				'            prefix = prefix[:-1]',
				'    return prefix'
			])
		},
		{
			name: 'Compare position by position',
			kind: 'optimized',
			passes: true,
			time: 'O(total characters)',
			space: 'O(1)',
			source: py([
				'def longest_common_prefix(strs):',
				'    if not strs:',
				'        return ""',
				'    for i in range(len(strs[0])):',
				'        for word in strs[1:]:',
				'            if i == len(word) or word[i] != strs[0][i]:',
				'                return strs[0][:i]',
				'    return strs[0]'
			])
		},
		{
			name: 'Only compares the first two strings',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def longest_common_prefix(strs):',
				'    if len(strs) < 2:',
				'        return strs[0] if strs else ""',
				'    prefix = ""',
				'    for a, b in zip(strs[0], strs[1]):',
				'        if a != b:',
				'            break',
				'        prefix += a',
				'    return prefix'
			])
		},
		{
			name: 'Reads past the end of a shorter string',
			kind: 'optimized',
			passes: false,
			time: 'O(total characters)',
			space: 'O(1)',
			source: py([
				'def longest_common_prefix(strs):',
				'    if not strs:',
				'        return ""',
				'    for i in range(len(strs[0])):',
				'        for word in strs[1:]:',
				'            if word[i] != strs[0][i]:',
				'                return strs[0][:i]',
				'    return strs[0]'
			])
		},
		{
			name: 'Crashes on an empty list',
			kind: 'optimized',
			passes: false,
			time: 'O(total characters)',
			space: 'O(1)',
			source: py([
				'def longest_common_prefix(strs):',
				'    prefix = strs[0]',
				'    for word in strs[1:]:',
				'        while not word.startswith(prefix):',
				'            prefix = prefix[:-1]',
				'    return prefix'
			])
		}
	],
	'climbing-stairs': [
		{
			name: 'Recursion with a memo table',
			kind: 'straightforward',
			passes: true,
			time: 'O(n)',
			space: 'O(n)',
			source: py([
				'def climb_stairs(n):',
				'    memo = {1: 1, 2: 2}',
				'    def ways(k):',
				'        if k not in memo:',
				'            memo[k] = ways(k - 1) + ways(k - 2)',
				'        return memo[k]',
				'    return ways(n)'
			])
		},
		{
			name: 'Two running values',
			kind: 'optimized',
			passes: true,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def climb_stairs(n):',
				'    previous, current = 1, 1',
				'    for _ in range(n - 1):',
				'        previous, current = current, previous + current',
				'    return current'
			])
		},
		{
			name: 'Wrong base case: one way for 0 and 1 steps shifts the sequence',
			kind: 'optimized',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def climb_stairs(n):',
				'    previous, current = 0, 1',
				'    for _ in range(n - 1):',
				'        previous, current = current, previous + current',
				'    return current'
			])
		},
		{
			name: 'Doubles each step (2 ** (n - 1))',
			kind: 'straightforward',
			passes: false,
			time: 'O(1)',
			space: 'O(1)',
			source: py(['def climb_stairs(n):', '    return 2 ** (n - 1)'])
		},
		{
			name: 'Returns n for small inputs and stops adding',
			kind: 'straightforward',
			passes: false,
			time: 'O(n)',
			space: 'O(1)',
			source: py([
				'def climb_stairs(n):',
				'    if n <= 3:',
				'        return n',
				'    return climb_stairs(n - 1) + climb_stairs(n - 3)'
			])
		}
	]
}
