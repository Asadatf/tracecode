// Study plans (specs/features/study-plans.md): short, hand-ordered paths through
// a topic. Static content, like the problem registry; plans.test.mts checks that
// every slug exists and none repeats within a plan.

export interface StudyPlan {
	slug: string
	title: string
	description: string
	// Problem slugs, in the order to solve them.
	problems: readonly string[]
}

export const STUDY_PLANS: readonly StudyPlan[] = [
	{
		slug: 'arrays-and-hashing',
		title: 'Arrays and hashing',
		description:
			'Loop over a list, then learn to remember what you have seen with a dictionary or a set.',
		problems: [
			'two-sum',
			'contains-duplicate',
			'valid-anagram',
			'majority-element',
			'best-time-to-buy-and-sell-stock'
		]
	},
	{
		slug: 'two-pointers',
		title: 'Two pointers',
		description:
			'Walk a list or string from both ends, or with a reader and a writer, to work in place.',
		problems: ['valid-palindrome', 'move-zeroes', 'merge-sorted-array']
	},
	{
		slug: 'searching-and-stacks',
		title: 'Searching and stacks',
		description: 'Halve a sorted list to find a value, and use a stack to match brackets.',
		problems: ['binary-search', 'valid-parentheses']
	},
	{
		slug: 'step-by-step',
		title: 'Step by step',
		description:
			'Build an answer from the answers to smaller steps: the starting point of dynamic programming.',
		problems: ['climbing-stairs', 'maximum-subarray']
	}
]

export function findPlan(slug: string): StudyPlan | undefined {
	return STUDY_PLANS.find((plan) => plan.slug === slug)
}
