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
