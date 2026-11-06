// PREVIEW / PRESENTATION DATA for the Daily Exam UI walkthrough (/exam/preview/*).
//
// Everything here is deterministic SAMPLE data, labelled "Preview" wherever it is shown. It is
// never read from or written to the database, never reaches a real leaderboard, progress or
// learning credit, and never stands for an observed grading, monitoring or AI result. The
// problem shown in the preview workspace is a public catalogue problem, not an exam problem.

export const PREVIEW_PROBLEM_SLUG = 'two-sum'

export interface PreviewArchiveRow {
	date: string
	kind: 'first' | 'repeat' | 'upcoming' | 'today'
	status: 'results' | 'published' | 'locked' | 'open' | 'no_exam'
	title: string | null
	difficulty: 'easy' | 'medium' | 'hard' | null
	score: number | null
	rank: number | null
	practiceSlug: string | null
}

export const PREVIEW_ARCHIVE: PreviewArchiveRow[] = [
	{
		date: '2026-11-12',
		kind: 'upcoming',
		status: 'locked',
		title: null,
		difficulty: null,
		score: null,
		rank: null,
		practiceSlug: null
	},
	{
		date: '2026-11-11',
		kind: 'today',
		status: 'open',
		title: null,
		difficulty: null,
		score: null,
		rank: null,
		practiceSlug: null
	},
	{
		date: '2026-11-10',
		kind: 'first',
		status: 'results',
		title: 'Balance Point (sample)',
		difficulty: 'easy',
		score: 9140,
		rank: 3,
		practiceSlug: 'two-sum'
	},
	{
		date: '2026-11-09',
		kind: 'repeat',
		status: 'results',
		title: 'Reef Count (sample)',
		difficulty: 'medium',
		score: 6120,
		rank: 11,
		practiceSlug: 'binary-search'
	},
	{
		date: '2026-11-08',
		kind: 'first',
		status: 'published',
		title: 'Gap Pairs (sample)',
		difficulty: 'medium',
		score: null,
		rank: null,
		practiceSlug: 'contains-duplicate'
	},
	{
		date: '2026-11-07',
		kind: 'first',
		status: 'no_exam',
		title: null,
		difficulty: null,
		score: null,
		rank: null,
		practiceSlug: null
	},
	{
		date: '2026-11-06',
		kind: 'first',
		status: 'results',
		title: 'Busiest Moment (sample)',
		difficulty: 'medium',
		score: 10000 - 940,
		rank: 1,
		practiceSlug: 'move-zeroes'
	}
]

export interface PreviewStanding {
	rank: number | null
	name: string
	isYou: boolean
	status: 'full_pass' | 'partial' | 'no_submission' | 'grading_failed'
	tests: [number, number]
	coding: number
	deductions: number
	finalScore: number
	elapsedSeconds: number | null
}

export const PREVIEW_STANDINGS: PreviewStanding[] = [
	{
		rank: 1,
		name: 'ada_codes',
		isYou: false,
		status: 'full_pass',
		tests: [13, 13],
		coding: 9610,
		deductions: 0,
		finalScore: 9610,
		elapsedSeconds: 421
	},
	{
		rank: 2,
		name: 'Anonymous participant',
		isYou: false,
		status: 'full_pass',
		tests: [13, 13],
		coding: 9380,
		deductions: 0,
		finalScore: 9380,
		elapsedSeconds: 556
	},
	{
		rank: 3,
		name: 'Anonymous participant',
		isYou: true,
		status: 'full_pass',
		tests: [13, 13],
		coding: 9140,
		deductions: 200,
		finalScore: 8940,
		elapsedSeconds: 690
	},
	{
		rank: 4,
		name: 'grace_hopper_fan',
		isYou: false,
		status: 'full_pass',
		tests: [13, 13],
		coding: 8800,
		deductions: 0,
		finalScore: 8800,
		elapsedSeconds: 920
	},
	{
		rank: 5,
		name: 'Anonymous participant',
		isYou: false,
		status: 'full_pass',
		tests: [13, 13],
		coding: 8420,
		deductions: 300,
		finalScore: 8120,
		elapsedSeconds: 1210
	},
	{
		rank: 6,
		name: 'Anonymous participant',
		isYou: false,
		status: 'partial',
		tests: [11, 13],
		coding: 6769,
		deductions: 0,
		finalScore: 6769,
		elapsedSeconds: 1503
	},
	{
		rank: 6,
		name: 'turing_tumbler',
		isYou: false,
		status: 'partial',
		tests: [11, 13],
		coding: 6769,
		deductions: 0,
		finalScore: 6769,
		elapsedSeconds: 1503
	},
	{
		rank: 8,
		name: 'Anonymous participant',
		isYou: false,
		status: 'partial',
		tests: [5, 13],
		coding: 3076,
		deductions: 0,
		finalScore: 3076,
		elapsedSeconds: 1800
	},
	{
		rank: null,
		name: 'Anonymous participant',
		isYou: false,
		status: 'no_submission',
		tests: [0, 0],
		coding: 0,
		deductions: 0,
		finalScore: 0,
		elapsedSeconds: null
	},
	{
		rank: null,
		name: 'Anonymous participant',
		isYou: false,
		status: 'grading_failed',
		tests: [0, 0],
		coding: 0,
		deductions: 0,
		finalScore: 0,
		elapsedSeconds: 1288
	}
]

type Tag = 'fact' | 'estimate' | 'unverified'
export interface PreviewResult {
	finalScore: number
	correctness: number
	speed: number
	coding: number
	deductions: number
	deductionLines: { rule: string; units: number; points: number }[]
	flags: string[]
	testsPassed: number
	testsTotal: number
	failures: { label: string; count: number }[]
	elapsedSeconds: number
	remainingSeconds: number
	rank: number
	participants: number
	sections: {
		id: string
		title: string
		kind: 'estimate' | 'fact'
		lines: { tag: Tag; text: string }[]
	}[]
	summary: string
}

export const PREVIEW_RESULT: PreviewResult = {
	finalScore: 8940,
	correctness: 8000,
	speed: 1140,
	coding: 9140,
	deductions: 200,
	deductionLines: [{ rule: 'Left the exam tab repeatedly', units: 1, points: 200 }],
	flags: ['2 window focus changes', '1 possible screenshot shortcut'],
	testsPassed: 13,
	testsTotal: 13,
	failures: [],
	elapsedSeconds: 690,
	remainingSeconds: 1110,
	rank: 3,
	participants: 8,
	sections: [
		{
			id: 'quality',
			title: 'Solution quality',
			kind: 'estimate',
			lines: [
				{
					tag: 'estimate',
					text: 'A single pass with a hash map: clear names, early return and no wasted work.'
				},
				{
					tag: 'estimate',
					text: 'The empty and single-element inputs are handled without special cases.'
				}
			]
		},
		{
			id: 'efficiency',
			title: 'Algorithmic efficiency',
			kind: 'estimate',
			lines: [
				{
					tag: 'estimate',
					text: 'Estimated time O(n) and space O(n). Looks optimal for this problem.'
				},
				{ tag: 'estimate', text: 'Sorting first would have cost O(n log n) with no benefit here.' }
			]
		},
		{
			id: 'tests',
			title: 'Test outcome analysis',
			kind: 'fact',
			lines: [
				{ tag: 'fact', text: '13 of 13 hidden tests passed, verified in the sandbox.' },
				{ tag: 'fact', text: 'No wrong answers, exceptions, timeouts or memory errors.' }
			]
		},
		{
			id: 'time',
			title: 'Time management',
			kind: 'fact',
			lines: [
				{ tag: 'fact', text: 'Submitted after 11:30, with 18:30 remaining.' },
				{
					tag: 'estimate',
					text: 'Finishing earlier would have earned up to 8.60 more speed points.'
				}
			]
		},
		{
			id: 'integrity',
			title: 'Integrity observations',
			kind: 'fact',
			lines: [
				{
					tag: 'fact',
					text: 'The exam tab was hidden twice, for about 52 seconds in total (reported by the browser).'
				},
				{ tag: 'unverified', text: 'This cannot show what happened while the tab was hidden.' },
				{
					tag: 'unverified',
					text: 'A possible screenshot shortcut was observed once; a browser cannot tell whether anything was captured.'
				}
			]
		},
		{
			id: 'next',
			title: 'What to improve next',
			kind: 'estimate',
			lines: [
				{
					tag: 'estimate',
					text: 'Practise problems where a sorted input allows a two-pointer scan instead of a hash map.'
				},
				{
					tag: 'estimate',
					text: 'Try explaining the invariant of your loop before submitting; it speeds up final checks.'
				}
			]
		}
	],
	summary:
		'A correct and efficient solution, submitted with plenty of time left. Keep the exam tab in focus to avoid avoidable deductions.'
}

export const units = (n: number | null | undefined) => ((n ?? 0) / 100).toFixed(2)
export const mmss = (seconds: number) =>
	`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
