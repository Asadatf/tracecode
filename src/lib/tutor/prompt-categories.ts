// The six example-prompt categories exposed by the "How to ask Tracy"
// help panel (M8 UX addition). Lives in src/lib/tutor so the data can be
// unit-tested under `node --test` without pulling in the React/TSX
// component's JSX (which the TS strip-only test loader can't parse).

export interface PromptCategory {
	id: string
	label: string
	example: string
}

export const PROMPT_CATEGORIES: readonly PromptCategory[] = [
	{
		id: 'learn-topic',
		label: 'Learn a topic',
		example:
			'Teach me the main concept behind this problem from first principles, using a small example.'
	},
	{
		id: 'get-hint',
		label: 'Get a conceptual hint',
		example: 'Give me a conceptual hint about my current approach without revealing the solution.'
	},
	{
		id: 'understand-failed-tests',
		label: 'Understand failed tests',
		example: 'Why are my tests failing? Explain using my actual code and test results.'
	},
	{
		id: 'explore-execution',
		label: 'Explore execution',
		example: 'Explain my selected replay step and what the variables tell us.'
	},
	{
		id: 'optimize-solution',
		label: 'Optimize my solution',
		example:
			"Explain my solution's time and space complexity, then guide me toward optimization without writing the code."
	},
	{
		id: 'review-solution',
		label: 'Review my solution',
		example: 'Review my current solution for correctness, edge cases, and readability.'
	}
]
