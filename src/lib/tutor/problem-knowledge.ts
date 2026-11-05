import { PROBLEMS } from '@/lib/trace/problems'

// Curated teaching notes keyed by problem slug. The tutor is never left to
// guess complexity or common mistakes from the problem text alone: everything
// in this file has been written by a human and is appended to the system
// prompt (src/lib/tutor/system-prompt.ts). Strings are terse so the prompt
// stays under a predictable size.
//
// Every slug in `PROBLEMS` MUST have an entry — there is a unit test that
// fails CI if one is missing. Adding a new problem means adding its
// knowledge file here before shipping.

export interface ProblemKnowledge {
	coreConcepts: string[]
	prerequisites: string[]
	straightforward: { approach: string; time: string; space: string }
	optimized: { approach: string; time: string; space: string }
	commonMisconceptions: string[]
	commonErrors: string[]
	edgeCases: string[]
	hintStrategy: string[] // L1 observation → L2 strategy → L3 implementation
	pythonNotes: string[]
	teachingGuidance: string[]
}

const K: Record<string, ProblemKnowledge> = {
	'two-sum': {
		coreConcepts: ['array traversal', 'hash-map lookups for O(1) complement search'],
		prerequisites: ['indexing', 'dictionaries', 'equality'],
		straightforward: {
			approach: 'Nested loops: for each i, scan j > i for nums[i] + nums[j] == target',
			time: 'O(n²)',
			space: 'O(1)'
		},
		optimized: {
			approach:
				'One pass with a dict mapping value → index; on each nums[i] check if target - nums[i] was seen',
			time: 'O(n) average',
			space: 'O(n)'
		},
		commonMisconceptions: [
			'Sorting first — this loses the original indices unless you remember them.',
			'Using the same element twice (i == j).',
			'Returning values instead of indices.'
		],
		commonErrors: [
			'Off-by-one in the inner loop range (j starts at i, not i+1).',
			'Storing the complement in the map rather than the value.',
			'Overwriting the map before reading it, so duplicates collide.'
		],
		edgeCases: [
			'Duplicates that form the pair, e.g. [3, 3] target 6.',
			'Negative numbers and zero.',
			'The pair at the end of the array.'
		],
		hintStrategy: [
			'What has to be true of two indices i and j for them to be the answer? How could you ask it as a question about one value at a time?',
			'As you walk the array, the complement target - nums[i] is a value you could look up. What data structure makes that lookup O(1)?',
			'Store each value you have seen in a dict keyed by value → index. Before storing nums[i], check whether target - nums[i] is already a key.'
		],
		pythonNotes: ['dict lookups are average O(1)', 'enumerate gives (index, value)'],
		teachingGuidance: [
			'If their solution is nested loops and they ask about speed, point at the complement idea before showing a dict.',
			'Never rewrite their code in one shot — walk one iteration at a time.'
		]
	},
	'contains-duplicate': {
		coreConcepts: ['set membership for O(1) duplicate detection'],
		prerequisites: ['sets', 'iteration'],
		straightforward: {
			approach: 'Nested loops comparing every pair, or sort then scan adjacent pairs',
			time: 'O(n²) for nested, O(n log n) for sort',
			space: 'O(1) or O(n) depending on sort'
		},
		optimized: {
			approach: 'One pass: add each value to a set, return True on collision',
			time: 'O(n) average',
			space: 'O(n)'
		},
		commonMisconceptions: [
			'Thinking len(set(nums)) != len(nums) is slow — it is one pass.',
			'Returning early on the FIRST element, before any duplicate could exist.'
		],
		commonErrors: [
			'Returning None instead of a boolean.',
			'Comparing nums[i] with nums[i] (same index).'
		],
		edgeCases: [
			'Empty list → False.',
			'Single-element list → False.',
			'All-distinct and all-same.'
		],
		hintStrategy: [
			'What is the difference between "I have seen this value before" and "there is some j ≠ i with nums[i] == nums[j]"? Can you answer one as you walk?',
			'A set remembers membership in O(1). What would you add to it, and what would you check?',
			'Walk the list once, keep a set of values seen so far. If nums[i] is already in the set, return True; otherwise add and continue.'
		],
		pythonNotes: ['set() lookups are average O(1)', 'len(set(xs)) != len(xs) is a one-liner'],
		teachingGuidance: ['Explain why sort+scan is still valid, just slower.']
	},
	'valid-anagram': {
		coreConcepts: ['character frequency counting', 'string length as a quick reject'],
		prerequisites: ['strings', 'dicts or fixed-size counters'],
		straightforward: {
			approach: 'sorted(s) == sorted(t)',
			time: 'O(n log n)',
			space: 'O(n)'
		},
		optimized: {
			approach:
				'If lengths differ return False; count s with a dict, decrement with t, rejecting on negative or missing letters',
			time: 'O(n)',
			space: 'O(k) where k = distinct letters (O(1) for the 26-letter alphabet)'
		},
		commonMisconceptions: [
			'Using set equality — anagrams need equal MULTISETS, not sets.',
			'Thinking the sorted() solution is "cheating" — it is correct, just not linear.'
		],
		commonErrors: [
			'Not short-circuiting on different lengths, so the counter work is wasted.',
			'Mutating one string implicitly while iterating.'
		],
		edgeCases: ['Equal strings.', 'Strings of different lengths.', 'Repeated letters.'],
		hintStrategy: [
			'Two strings are anagrams exactly when each letter appears the same number of times in each. How would you turn that into something you can check?',
			'A fast reject: if len(s) != len(t) the answer is False without looking. Beyond that, you want a count per letter.',
			'Walk s once, build counts[ch]; walk t, decrement. Return False the instant a count goes negative or a letter is missing. Any count left over means not an anagram.'
		],
		pythonNotes: ['collections.Counter does this in one line', 'ord(ch) - ord("a") indexes 0..25'],
		teachingGuidance: ['Prefer teaching the counter over the sort — it generalises.']
	},
	'move-zeroes': {
		coreConcepts: ['in-place array mutation', 'two-pointer write/read split'],
		prerequisites: ['list indexing and assignment', 'what "in place" means for the caller'],
		straightforward: {
			approach:
				'Collect non-zeros in a new list, then overwrite nums with that list followed by zeros',
			time: 'O(n)',
			space: 'O(n) extra'
		},
		optimized: {
			approach:
				'Two indices: write starts at 0; read walks the list. When nums[read] != 0, assign nums[write] = nums[read] and advance both; otherwise only read advances. Fill the tail with zeros.',
			time: 'O(n)',
			space: 'O(1) auxiliary'
		},
		commonMisconceptions: [
			'Returning a new list — "in place" means the caller sees the change on the same object.',
			'Thinking you may reorder non-zeros — the relative order must be preserved.'
		],
		commonErrors: [
			'Using nums = [...] — this rebinds the local name, the caller still has the old list.',
			'Overwriting nums[write] before nums[read] has been read.',
			'Forgetting to pad the tail with zeros.'
		],
		edgeCases: ['All zeros.', 'No zeros.', 'Zeros at the end already.', 'Single element.'],
		hintStrategy: [
			'What does "in place" demand of the list the caller handed you? What test in the suite would fail if you returned a new list?',
			'Separate "where I read from" and "where I write to". Can one pointer stay pinned at the next slot that should hold a non-zero?',
			'Keep a write index at 0. Walk read from 0 to n-1; on a non-zero, assign nums[write] = nums[read] and write += 1. After the walk, assign zeros from write to n-1.'
		],
		pythonNotes: [
			'nums[:] = [...] REPLACES contents in place; nums = [...] rebinds the name.',
			'Return None, not the list.'
		],
		teachingGuidance: ['If they return a new list, show them the actual failing assertion.']
	},
	'binary-search': {
		coreConcepts: ['divide-and-conquer on a sorted range', 'loop invariants over lo/hi'],
		prerequisites: ['indexing', 'integer midpoints', 'the "sorted ascending" guarantee'],
		straightforward: {
			approach: 'Linear scan comparing each element with target',
			time: 'O(n)',
			space: 'O(1)'
		},
		optimized: {
			approach:
				'Maintain [lo, hi] with hi inclusive; mid = (lo + hi) // 2. If nums[mid] == target return mid; if less, lo = mid + 1; else hi = mid - 1. Return -1 when lo > hi.',
			time: 'O(log n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Thinking you need to copy the array halves — the halves are expressed by indices, not slices.',
			'Mixing half-open and inclusive conventions in the same loop.'
		],
		commonErrors: [
			'`while lo < hi` with hi = len(nums) and later `hi = mid - 1` — that mixes conventions and can skip or re-check indices.',
			'mid = (lo + hi) // 2 with Python is fine, but in other languages overflow matters; avoid teaching the wrong lesson.',
			'Not returning -1 when the loop exits.'
		],
		edgeCases: [
			'Empty list.',
			'Single element.',
			'Target smaller than every value.',
			'Target larger than every value.'
		],
		hintStrategy: [
			'What does the "sorted ascending" guarantee let one comparison at nums[mid] tell you about the whole left and right halves?',
			'Keep a candidate range [lo, hi]. On each step, compare nums[mid] with target to drop one half. When does the range become empty?',
			'lo=0, hi=len(nums)-1. While lo <= hi, mid = (lo+hi)//2; compare and either return or set lo=mid+1 / hi=mid-1. If the loop exits, return -1.'
		],
		pythonNotes: ['bisect module does this, but write it manually to understand the invariant.'],
		teachingGuidance: ['Always draw lo, mid, hi against the actual nums when explaining a step.']
	},
	'valid-parentheses': {
		coreConcepts: ['stack / LIFO matching', 'one-pass scanning', 'matching the most-recent opener'],
		prerequisites: ['lists as stacks (append/pop)', 'dictionaries for pair tables'],
		straightforward: {
			approach:
				'Repeatedly remove "()" / "[]" / "{}" until no change, then check the string is empty',
			time: 'O(n²) worst case',
			space: 'O(n)'
		},
		optimized: {
			approach:
				'Iterate once; push openers on a stack; on a closer, fail if the stack is empty or its top is the wrong kind, otherwise pop. After the walk, the string is valid iff the stack is empty.',
			time: 'O(n)',
			space: 'O(n)'
		},
		commonMisconceptions: [
			'Counting brackets of each kind — order matters, so counts are insufficient.',
			'Thinking a prefix check is enough — "([)]" fails on order, not counts.'
		],
		commonErrors: [
			'Returning True early on an empty string segment when the stack still holds openers.',
			'Forgetting to check the stack is non-empty before indexing [-1].',
			'Using the wrong pair table (mismatched closers → openers).'
		],
		edgeCases: [
			'Empty string → True.',
			'Single closer → False.',
			'All openers → False.',
			'Nested of depth N.'
		],
		hintStrategy: [
			'Pick a failing input like "([)]" and name why it fails: the ")" arrives when the most-recent unclosed bracket is "[", not "(".',
			'What single structure lets you ask "what is the most recent opener still unmatched?" cheaply? What happens to it when a closer arrives?',
			'Push every opener onto a stack. On a closer, if the stack is empty or its top is not the matching opener, return False; otherwise pop. At the end, return len(stack) == 0.'
		],
		pythonNotes: ['Lists are stacks: append() / pop(). dict() for the pair table.'],
		teachingGuidance: [
			'Insist on walking a failing input character-by-character before writing code.'
		]
	},
	'valid-palindrome': {
		coreConcepts: [
			'two pointers moving inward',
			'filtering characters',
			'case-insensitive comparison'
		],
		prerequisites: ['strings', 'indexing', 'str.isalnum / str.lower'],
		straightforward: {
			approach:
				'Build a cleaned lowercase list of letters and digits and compare it with its reverse',
			time: 'O(n)',
			space: 'O(n)'
		},
		optimized: {
			approach:
				'Two indexes from both ends; skip characters that are not letters or digits; compare the rest ignoring case',
			time: 'O(n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Comparing the raw string with its reverse (punctuation and spaces count against it).',
			'Removing digits as well as punctuation (the contract keeps letters AND digits).',
			'Forgetting that upper and lower case match.'
		],
		commonErrors: [
			'Moving a pointer past the other one while skipping characters.',
			'Treating the empty or all-punctuation string as not a palindrome.',
			'Skipping only spaces and leaving punctuation or underscores in.'
		],
		edgeCases: [
			'"" and " " are palindromes.',
			'Punctuation only, e.g. ".,!?".',
			'"0P" is not a palindrome (digit vs letter).'
		],
		hintStrategy: [
			'Which characters should your code actually compare? Try the phrase "A man, a plan" and say which characters count.',
			'Two comparisons can start at opposite ends and move toward each other. What should happen when one of them lands on a comma or a space?',
			'Move each index inward past characters that are not letters or digits, compare the two remaining characters in lowercase, and stop when the indexes meet.'
		],
		pythonNotes: ['str.isalnum() tests letters and digits; str.lower() lowers case.'],
		teachingGuidance: [
			'Ask the learner to say aloud which characters are ignored before writing code.'
		]
	},
	'reverse-string': {
		coreConcepts: ['in-place mutation', 'swapping with two pointers', 'list identity vs rebinding'],
		prerequisites: ['lists', 'indexing', 'tuple assignment'],
		straightforward: {
			approach:
				'Build a reversed copy and assign it back into the same list using slice assignment',
			time: 'O(n)',
			space: 'O(n)'
		},
		optimized: {
			approach: 'Swap the characters at two indexes that move toward each other from the ends',
			time: 'O(n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Returning a reversed list: the caller is judged on the original list, not the return value.',
			'Writing s = s[::-1], which rebinds the local name and leaves the caller’s list unchanged.'
		],
		commonErrors: [
			'Looping over the whole list while swapping, which swaps each pair twice and restores the original.',
			'Going one step too far on odd lengths.'
		],
		edgeCases: ['Empty list.', 'A single character.', 'Odd and even lengths.'],
		hintStrategy: [
			'After your function runs, look at the original list the caller holds. Did that list change?',
			'Which two positions end up swapped when you reverse a list? Do you need to touch the middle element of an odd-length list?',
			'Keep two indexes, left and right. Swap the elements they point at, move them toward each other, and stop when they meet or cross.'
		],
		pythonNotes: [
			'a, b = b, a swaps two values.',
			's[:] = ... changes the list in place; s = ... only rebinds a name.'
		],
		teachingGuidance: ['Use the replay to show the list changing between steps.']
	},
	'maximum-subarray': {
		coreConcepts: ["Kadane's algorithm", 'best run ending at each position', 'contiguity'],
		prerequisites: ['loops', 'max()', 'running totals'],
		straightforward: {
			approach: 'Try every start and end index and keep the largest sum',
			time: 'O(n²)',
			space: 'O(1)'
		},
		optimized: {
			approach:
				'One pass keeping the best sum of a run ending here (extend the previous run or start fresh) and the best seen',
			time: 'O(n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Adding every positive number (the run must be contiguous).',
			'Starting the best at 0, which wrongly returns 0 for an all-negative list.'
		],
		commonErrors: [
			'Resetting the running sum to 0 instead of to the current element.',
			'Skipping the first element or forgetting a final comparison.'
		],
		edgeCases: [
			'A single element.',
			'All negative numbers (answer is the largest single value).',
			'The best run at the very end.'
		],
		hintStrategy: [
			'What is the answer for [-3, -2, -1]? Is an empty run allowed?',
			'For each position, the best run that ends there either starts at that element or extends the best run that ended just before it. Which is larger?',
			'Carry two variables through one loop: the best sum ending at the current element and the best sum seen so far.'
		],
		pythonNotes: ['max(a, b) picks the larger value.'],
		teachingGuidance: ['Trace [-2, 1, -3, 4] and watch the running value restart.']
	},
	'best-time-to-buy-and-sell-stock': {
		coreConcepts: ['single-pass tracking', 'running minimum', 'order matters (sell after buy)'],
		prerequisites: ['loops', 'min()/max()', 'initial values'],
		straightforward: {
			approach: 'Compare every buy day with every later sell day',
			time: 'O(n²)',
			space: 'O(1)'
		},
		optimized: {
			approach: 'Scan once, tracking the lowest price so far and the best profit so far',
			time: 'O(n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Using highest minus lowest price, which ignores that the sale must come after the purchase.',
			'Returning a negative number when every trade loses money (the answer is 0).'
		],
		commonErrors: [
			'Reading prices[0] on an empty list.',
			'Updating the minimum after computing profit, or computing profit against a later low.'
		],
		edgeCases: [
			'Empty or single-day list.',
			'Strictly decreasing prices (0).',
			'The low price after the high price.'
		],
		hintStrategy: [
			'For the prices [2, 4, 1], which day can you sell on if you buy on the day priced 1?',
			'If you sell today, the best day to have bought is the cheapest one before today. How could you keep that value as you go?',
			'Loop once, updating the lowest price seen so far and the largest difference between today and that low; start the profit at 0.'
		],
		pythonNotes: [
			'float("inf") or the first price can start the minimum; check the list is not empty first.'
		],
		teachingGuidance: ['Ask what the lowest price must be before today, not overall.']
	},
	'merge-two-sorted-arrays': {
		coreConcepts: ['merging with two pointers', 'in-place mutation', 'filling from the back'],
		prerequisites: ['lists', 'indexing', 'while loops'],
		straightforward: {
			approach:
				'Combine the real values, sort them, and write them back into nums1 (nums1[:] = ...)',
			time: 'O((m+n) log(m+n))',
			space: 'O(m+n)'
		},
		optimized: {
			approach:
				'Three indexes: last real value of nums1, last value of nums2, last slot of nums1; write the larger value at the last slot and move back',
			time: 'O(m+n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Returning a merged list: the caller is judged on nums1 after the call.',
			'Sorting all of nums1, including the placeholder zeros.',
			'Merging from the front, which overwrites values of nums1 not yet used.'
		],
		commonErrors: [
			'Stopping when nums1’s real values run out and forgetting the rest of nums2.',
			'Rebinding nums1 instead of changing it.',
			'Off-by-one starting indexes (m - 1, n - 1, m + n - 1).'
		],
		edgeCases: ['m = 0 or n = 0.', 'All of nums2 smaller than nums1.', 'Duplicates and negatives.'],
		hintStrategy: [
			'After your function runs, what does nums1 hold? Are the placeholder zeros gone and every value in order?',
			'The free slots are at the end of nums1. Where does the largest of all the values belong?',
			'Compare the last real value of each list, put the larger into the last free slot of nums1, and move that list’s index and the write index back; when nums2 is used up, you are done.'
		],
		pythonNotes: ['nums1[:] = ... assigns into the same list; nums1 = ... rebinds the name.'],
		teachingGuidance: ['Use the replay to watch nums1 fill from the right.']
	},
	'first-unique-character': {
		coreConcepts: ['frequency counting', 'hash maps', 'two passes'],
		prerequisites: ['dictionaries', 'enumerate', 'strings'],
		straightforward: {
			approach:
				'For each character, count it in the whole string (s.count) and return the first with count 1',
			time: 'O(n²)',
			space: 'O(1)'
		},
		optimized: {
			approach: 'Count every character once in a dict, then scan again for the first count of 1',
			time: 'O(n)',
			space: 'O(1) (at most 26 letters)'
		},
		commonMisconceptions: [
			'Only checking a character’s neighbours (a repeat can be far away).',
			'Returning the character instead of its index.'
		],
		commonErrors: [
			'Returning 0 instead of -1 when nothing is unique.',
			'Returning the last unique character.',
			'Crashing on the empty string.'
		],
		edgeCases: [
			'Empty string (-1).',
			'No unique character, e.g. "aabb".',
			'The only unique character is last.'
		],
		hintStrategy: [
			'In "abcabc" no neighbours are equal. Is any letter unique?',
			'To know whether a letter is unique you must know how often it appears in the whole string. What could store that for every letter?',
			'Count the letters in one pass, then go through the string from the front and return the first index whose letter has count 1; otherwise -1.'
		],
		pythonNotes: ['dict.get(ch, 0) + 1 counts; collections.Counter is another way.'],
		teachingGuidance: ['Ask the learner to predict the counts before running.']
	},
	'missing-number': {
		coreConcepts: ['range arithmetic', 'sum formula', 'XOR cancelling'],
		prerequisites: ['sum()', 'range()', 'sets'],
		straightforward: {
			approach: 'Put the numbers in a set and return the first value in 0..n that is not in it',
			time: 'O(n)',
			space: 'O(n)'
		},
		optimized: {
			approach:
				'Expected sum n(n+1)/2 minus the actual sum, or XOR all indexes and values together with n',
			time: 'O(n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Assuming the list is sorted.',
			'Thinking the missing number is always within the list’s indexes (it can be n).'
		],
		commonErrors: [
			'Summing 0..n-1 instead of 0..n (off by n).',
			'Forgetting to include n when XOR-ing.',
			'Returning len(nums) always.'
		],
		edgeCases: ['Empty list (0).', 'Missing 0.', 'Missing n.'],
		hintStrategy: [
			'For [1, 2, 3], which number from the range 0 to 3 is missing?',
			'Numbers 0 through n have a total you can compute without looking at the list. What does the actual total of the list differ by?',
			'Compute n * (n + 1) // 2, where n is the list length, and subtract sum(nums).'
		],
		pythonNotes: ['// is integer division; ^ is XOR.'],
		teachingGuidance: ['Let the learner discover that n itself can be the answer.']
	},
	'majority-element': {
		coreConcepts: ['frequency counting', 'Boyer–Moore voting', 'majority definition'],
		prerequisites: ['dictionaries', 'loops', 'integer division'],
		straightforward: {
			approach: 'Count every value in a dict and return the one whose count exceeds len // 2',
			time: 'O(n)',
			space: 'O(n)'
		},
		optimized: {
			approach: 'Boyer–Moore: keep a candidate and a vote count; reset the candidate at 0 votes',
			time: 'O(n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Assuming the majority is the first, largest or middle element of an unsorted list.',
			'Thinking the most common value is enough (it must appear MORE than half the time; here it is guaranteed).'
		],
		commonErrors: [
			'Not resetting the candidate when the vote count hits zero.',
			'Using >= len // 2 instead of > len // 2.'
		],
		edgeCases: ['A single element.', 'Negative numbers.', 'Majority at the end of the list.'],
		hintStrategy: [
			'In [6, 5, 5] the first and the largest values are not the answer. What makes 5 the answer?',
			'A majority appears more often than all the others combined. How could you track how often values appear?',
			'Count with a dict, or keep one candidate and a counter: +1 when you see the candidate again, -1 for a different value, and pick a new candidate at 0.'
		],
		pythonNotes: ['dict.get(x, 0) + 1; the conditional expression a if c else b.'],
		teachingGuidance: ['Trace Boyer–Moore on [2, 2, 1, 1, 1, 2, 2] step by step.']
	},
	'longest-common-prefix': {
		coreConcepts: ['vertical scanning', 'prefixes', 'early exit'],
		prerequisites: ['strings', 'indexing', 'nested loops'],
		straightforward: {
			approach:
				'Start with the first string and shorten it until every other string starts with it',
			time: 'O(total characters)',
			space: 'O(1)'
		},
		optimized: {
			approach:
				'Compare position i of every string to the first, returning at the first mismatch or short string',
			time: 'O(total characters)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Looking only at the first two strings.',
			'Looking for any shared substring instead of one starting at index 0.'
		],
		commonErrors: [
			'Indexing past the end of a shorter string (IndexError).',
			'Crashing on an empty list.',
			'Returning a prefix of the first string without checking all others.'
		],
		edgeCases: ['Empty list.', 'Empty strings in the list.', 'One string is a prefix of another.'],
		hintStrategy: [
			'For ["ab", "a"], how long can the common prefix be at most?',
			'The prefix can never be longer than the shortest string. At each position, what must be true of every string?',
			'Walk positions 0, 1, 2, ... and compare the character of every string to the first string’s; return what you have collected when any string differs or ends.'
		],
		pythonNotes: ['str.startswith(prefix) and slicing s[:i].'],
		teachingGuidance: ['Ask what happens for [] and [""] before any code is written.']
	},
	'climbing-stairs': {
		coreConcepts: [
			'recurrence relation',
			'dynamic programming',
			'memoization / two running values'
		],
		prerequisites: ['loops', 'recursion basics', 'tuple assignment'],
		straightforward: {
			approach:
				'Recursion where ways(n) = ways(n - 1) + ways(n - 2), with a memo table so each value is computed once',
			time: 'O(n)',
			space: 'O(n)'
		},
		optimized: {
			approach: 'Bottom-up with two running values, repeatedly replacing (a, b) with (b, a + b)',
			time: 'O(n)',
			space: 'O(1)'
		},
		commonMisconceptions: [
			'Thinking there are 2^(n-1) ways (each step is not an independent choice).',
			'Plain recursion without memoization, which recomputes the same values and becomes very slow.'
		],
		commonErrors: [
			'Wrong base cases (ways(1) = 1 and ways(2) = 2).',
			'Off-by-one in the number of loop repeats.',
			'Using n for small inputs and then a wrong recurrence.'
		],
		edgeCases: [
			'n = 1 and n = 2 (base cases).',
			'n = 3 (first interesting case).',
			'Larger n up to 35.'
		],
		hintStrategy: [
			'List the ways for n = 1, 2, 3, 4 by hand. How do the counts grow?',
			'Your last move was either 1 step or 2 steps. What step were you on before each of those moves?',
			'The answer for n is the answer for n - 1 plus the answer for n - 2. Start from the first two answers and build upward, keeping only the last two values.'
		],
		pythonNotes: ['a, b = b, a + b updates both values at once.'],
		teachingGuidance: ['Have the learner write the first six answers before coding.']
	}
}

// Fail loudly if the catalog grows without a knowledge entry. The test in
// `problem-knowledge.test.mts` asserts this too; the runtime guard here is a
// defence in depth for anyone who ran the dev server without CI.
export function knowledgeFor(slug: string): ProblemKnowledge | null {
	return K[slug] ?? null
}

export function knownSlugs(): string[] {
	return Object.keys(K)
}

export function catalogSlugs(): string[] {
	return Object.keys(PROBLEMS)
}
