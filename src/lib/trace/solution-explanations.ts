import type { Json } from './contract'

// What the Solutions tab says about each passing reference solution
// (specs/features/solutions-tab.md, AC4). Keyed by problem slug, then by the
// solution's `name` in reference-solutions.ts, so that file stays a pure list of
// verified solutions. solutions.test.mts fails if a passing solution has no
// explanation here, or if an entry here names no solution.
export const SOLUTION_EXPLANATIONS: Record<string, Record<string, string>> = {
	'two-sum': {
		'Check every pair':
			'Try every pair of positions i < j and return the first pair whose values add up to the target. It always finds the answer, but the number of pairs grows with the square of the list length, so doubling the list makes it about four times slower.',
		"Remember what you've seen":
			'Walk through the list once. For each value, work out the partner it needs (target minus the value) and look it up in a dictionary of values already seen, which takes about the same time however big the dictionary is. If the partner is there, return both indexes; otherwise remember this value and its index. It trades a little memory for one pass instead of every pair.'
	},
	'contains-duplicate': {
		'Compare every pair':
			'Compare each value with every value after it and return True as soon as two are equal. When all values are different it has to check every pair, which grows with the square of the list length.',
		'Set of values seen':
			'Walk through the list once, keeping a set of the values seen so far. Checking whether a value is in a set takes about the same time however big the set is, so a repeat is spotted the moment it appears. The set can grow as large as the list.'
	},
	'valid-anagram': {
		'Sort both strings':
			'Two strings are anagrams exactly when they contain the same letters the same number of times, so sorting both puts them in the same order. Compare the sorted versions. It is short to write, but sorting does more work than counting, and each sorted copy needs memory the size of the string.',
		'Frequency dictionary':
			'Count each letter of s in a dictionary, then walk through t and take one away for each of its letters. If a letter is missing or runs out, they are not anagrams. Each character is looked at once, and the dictionary only grows with the number of different letters.',
		'Fixed 26-slot counter':
			"Like the dictionary, but the strings only use the 26 lowercase letters, so a list of 26 counters is enough. Each letter's position in the alphabet picks its slot. The memory used is the same 26 slots however long the strings are."
	},
	'move-zeroes': {
		'Extra list, written back in place':
			'Collect the non-zero values in order into a new list, then pad it with as many zeros as were removed and copy the result back into nums with a slice assignment. It is easy to get right, but the temporary list is as long as the input.',
		'Two pointers, swap':
			'One index reads every value; the other marks where the next non-zero value belongs. Each non-zero value is swapped into that slot, which pushes zeros towards the end. One pass, and nothing is stored apart from two indexes.',
		'Two pointers, copy then fill':
			'First copy every non-zero value forward to the next free slot, keeping their order. Every slot after the last one written must then be a zero, so fill those in. Two short passes over the list, with no extra list.'
	},
	'binary-search': {
		'Linear scan':
			'Check each position from the start until you find the target, and return -1 if you never do. It works on any list, sorted or not, but in the worst case it looks at every value.',
		'Iterative binary search':
			'Because the list is sorted, comparing the target with the middle value tells you which half it must be in, so you can throw the other half away. Repeat on the remaining half until you find it or nothing is left. Each step halves the search, so even 10 000 values need only about 14 checks.'
	},
	'valid-parentheses': {
		'Repeated adjacent-pair removal':
			'A valid string always contains a matching pair right next to each other, like () or []. Remove one such pair and start again, until no pairs are left; the string was valid if nothing remains. Each removal restarts the scan, so long strings take many passes.',
		'Stack of expected closers':
			'Walk through the string once. For each opening bracket, push the closer it needs onto a stack; for each closing bracket, it must match the top of the stack. The string is valid if every closer matched and the stack is empty at the end.'
	},
	'valid-palindrome': {
		'Clean the string, compare with its reverse':
			'Build a list of just the letters and digits, in lower case, then check that it reads the same backwards. Short and clear, but the cleaned copy (and its reverse) take memory the size of the string.',
		'Two pointers that skip other characters':
			'Keep one index at the start and one at the end. Move each inwards past anything that is not a letter or digit, then compare the two characters ignoring case. Stop at the first mismatch. One pass, with no copy of the string.'
	},
	'reverse-string': {
		'Slice assignment from a reversed copy':
			's[::-1] builds a reversed copy, and s[:] = writes it back into the same list, so the caller sees the change. Assigning to s instead would only point the local name at a new list. Simple, but the copy is as long as the input.',
		'Swap from both ends':
			'Swap the first and last characters, then move both indexes one step inwards and repeat until they meet in the middle. Each character moves once, and nothing is stored apart from two indexes.'
	},
	'maximum-subarray': {
		'Try every start and end':
			'For each starting position, keep adding the next value to a running total and remember the largest total seen. That covers every contiguous run, but there are about n² of them, so doubling the list makes it about four times slower.',
		"Best run ending here (Kadane's)":
			'The best run that ends at a value either starts fresh at that value or extends the best run that ended just before it, whichever is bigger. Keep that running value and the best one seen so far. Starting from nums[0] means an all-negative list correctly returns its largest value. One pass, two variables.'
	},
	'best-time-to-buy-and-sell-stock': {
		'Try every buy and sell pair':
			'Try buying on every day and selling on every later day, keeping the best profit. Selling only after buying is what makes the order of the days matter. It checks about n² pairs.',
		'Track the lowest price so far':
			'If you sell today, the best day to have bought was the cheapest day before it. Walk through the prices once, remembering the lowest price so far and the best profit from selling at today’s price. One pass, two variables.'
	},
	'merge-two-sorted-arrays': {
		'Combine, sort and write back into nums1':
			'Take the m real values of nums1 and the n values of nums2, sort them together and write the result back into nums1 with a slice assignment. Easy to get right, but it ignores that both lists are already sorted, and sorting builds a new list.',
		'Fill nums1 from the back':
			'The largest remaining value is always at the end of one of the two lists. Compare those two, write the bigger one into the last free slot of nums1 and step back. Filling from the back never overwrites a value that has not been placed yet. One pass, no extra list.'
	},
	'first-unique-character': {
		'Count each character with s.count':
			's.count(ch) reads the whole string every time, and it runs once per character, so the work grows with the square of the length. Short to write, slow on long strings.',
		'Count once, then scan again':
			'First count how often each character appears in a dictionary. Then walk through the string again and return the first index whose character has a count of 1. Two passes; the dictionary holds at most one entry per different letter.'
	},
	'missing-number': {
		'Remember seen numbers':
			'Put every number into a set, then check 0, 1, 2 … n in order and return the first one the set does not have. Set lookups are fast, but the set is as large as the list.',
		'Expected sum minus actual sum':
			'The numbers 0 to n add up to n × (n + 1) / 2. Subtract the sum of the list from that, and what is left is the missing number. One pass to add up the list, and no extra storage.'
	},
	'majority-element': {
		'Count every value':
			'Count how many times each value appears in a dictionary, returning a value as soon as its count passes half the length. It is one pass, but the dictionary can hold almost half as many entries as the list.',
		'Boyer–Moore voting':
			'Keep one candidate and a count. A matching value adds a vote and a different value cancels one; when the count drops to 0, the next value becomes the candidate. The majority has more copies than everything else combined, so it is the candidate left at the end. One pass and two variables.'
	},
	'longest-common-prefix': {
		'Shorten a candidate against each string':
			'Start with the whole first string as the candidate prefix. For each other string, chop the last character off the candidate until the string starts with it. Whatever survives every string is the answer.',
		'Compare position by position':
			'Look at the first string one position at a time and check that every other string has the same character there. Stop at the first string that is too short or differs, and return everything before that position. It stops as soon as the prefix ends.'
	},
	'climbing-stairs': {
		'Recursion with a memo table':
			'The last move onto step k came from step k − 1 or step k − 2, so ways(k) = ways(k − 1) + ways(k − 2). Remembering each answer in a dictionary means every step is worked out once. Without the memo, the same steps are recomputed over and over and it is far too slow.',
		'Two running values':
			'Each step only needs the answers for the two steps below it, so keep just those two numbers and slide them up one step at a time. Same number of steps as the memo, without storing every answer.'
	}
}

// The input both programs run on for "Compare steps" (AC7): mid-sized, so the
// difference in work is visible without hitting the step cap.
export const COMPARISON_ARGS: Record<string, Json[]> = {
	'two-sum': [Array.from({ length: 24 }, (_, i) => i + 1), 47],
	'contains-duplicate': [Array.from({ length: 30 }, (_, i) => (i * 7) % 31)],
	'valid-anagram': ['listenpotsearthcinema', [...'listenpotsearthcinema'].reverse().join('')],
	'move-zeroes': [Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 0 : i))],
	'binary-search': [Array.from({ length: 100 }, (_, i) => i), 100],
	'valid-parentheses': ['('.repeat(15) + ')'.repeat(15)],
	'valid-palindrome': ['Never odd or even, never odd or even'],
	'reverse-string': [[...'practice makes it stick']],
	'maximum-subarray': [Array.from({ length: 25 }, (_, i) => ((i * 13) % 21) - 10)],
	'best-time-to-buy-and-sell-stock': [Array.from({ length: 30 }, (_, i) => (i * 37) % 50)],
	'merge-two-sorted-arrays': [
		[...Array.from({ length: 15 }, (_, i) => i * 2), ...Array.from({ length: 15 }, () => 0)],
		15,
		Array.from({ length: 15 }, (_, i) => i * 2 + 1),
		15
	],
	'first-unique-character': ['aabbccddeeffgghhiijjkkllmmz'],
	'missing-number': [Array.from({ length: 30 }, (_, i) => (i < 17 ? i : i + 1))],
	'majority-element': [Array.from({ length: 31 }, (_, i) => (i % 2 === 0 ? 4 : i))],
	'longest-common-prefix': [['interstellar', 'internet', 'interval', 'internal', 'interview']],
	'climbing-stairs': [20]
}
