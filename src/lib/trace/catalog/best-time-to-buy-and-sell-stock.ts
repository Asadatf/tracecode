import { type ProblemDefinition } from '../problem'
import { seededRandom } from './test-data'

// LeetCode 121 contract: 1 ≤ len ≤ 10⁵, 0 ≤ price ≤ 10⁴. The large tests are
// capped at 1 500 days so the straightforward every-pair baseline still
// finishes inside the 5 s run budget in Pyodide.
const LARGE = 1500
const MAX_PRICE = 10_000

const random = seededRandom(121)
const randomPrices = Array.from({ length: LARGE }, () => Math.floor(random() * (MAX_PRICE + 1)))
// Best profit for the generated list, computed directly here so the literal
// tests above stay readable. ORACLES cross-checks it independently.
function bestProfit(prices: readonly number[]): number {
	let low = Infinity
	let best = 0
	for (const price of prices) {
		low = Math.min(low, price)
		best = Math.max(best, price - low)
	}
	return best
}
const falling = Array.from({ length: LARGE }, (_, i) => MAX_PRICE - i)
// Prices fall to a low late in the list, then recover: the best buy day is not
// the first day, and the best sell day comes after the overall maximum.
const lateLow = [
	...Array.from({ length: LARGE - 500 }, (_, i) => 5000 + ((i * 37) % 3000)),
	3,
	...Array.from({ length: 499 }, (_, i) => 4 + ((i * 53) % 9000))
]

export const bestTimeToBuyAndSellStock = {
	slug: 'best-time-to-buy-and-sell-stock',
	title: 'Best Time to Buy and Sell Stock',
	entry: 'max_profit',
	params: [{ name: 'prices' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'greedy'],
	statement: [
		'prices[i] is the price of a stock on day i. You may buy the stock on one day and sell it on a later day.',
		'Return the largest profit you can make from one buy followed by one sell. If no trade makes money, return 0.'
	],
	examples: [
		{ args: [[7, 1, 5, 3, 6, 4]], output: 5 },
		{ args: [[7, 6, 4, 3, 1]], output: 0 }
	],
	starter:
		'def max_profit(prices: list[int]) -> int:\n    # Buy on one day, sell on a later day. Return the best profit, or 0.\n    return 0',
	tests: [
		{ id: 't1', args: [[7, 1, 5, 3, 6, 4]], expected: 5 },
		{ id: 't2', args: [[7, 6, 4, 3, 1]], expected: 0 },
		{ id: 't3', args: [[1]], expected: 0 },
		{ id: 't4', args: [[1, 2]], expected: 1 },
		{ id: 't5', args: [[2, 1]], expected: 0 },
		{ id: 't6', args: [[3, 3, 3]], expected: 0 },
		{ id: 't7', args: [[2, 4, 1]], expected: 2 },
		{ id: 't8', args: [[3, 2, 6, 5, 0, 3]], expected: 4 },
		{ id: 't9', args: [[1, 2, 3, 4, 5]], expected: 4 },
		{ id: 't10', args: [[2, 1, 2, 1, 0, 1, 2]], expected: 2 },
		{ id: 't11', args: [[0, MAX_PRICE]], expected: MAX_PRICE },
		{ id: 't12', args: [[MAX_PRICE, 0]], expected: 0 },
		{ id: 't13', args: [[5, 4, 3, 10]], expected: 7 },
		{ id: 't14', args: [[1, 7, 1, 9]], expected: 8 },
		{ id: 't15', args: [[4, 1, 2]], expected: 1 },
		{ id: 't16', args: [[9, 2, 8, 1, 3]], expected: 6 },
		{ id: 't17', args: [randomPrices], expected: bestProfit(randomPrices) },
		{ id: 't18', args: [falling], expected: 0 },
		{ id: 't19', args: [lateLow], expected: bestProfit(lateLow) }
	],
	arrayVar: 'prices',
	pointerVars: [
		['i', 'prices'],
		['j', 'prices'],
		['buy', 'prices'],
		['sell', 'prices'],
		['day', 'prices']
	],
	correctnessHints: [
		'Look at a failing input and find the best trade by hand: which day would you buy, and which later day would you sell?',
		'The sell day has to come after the buy day. The highest price in the list is no use if it comes before the lowest one, and when prices only fall the answer is 0, not a negative number.',
		'For every possible sell day, the best buy day is the cheapest day before it. Work out the profit for each sell day that way and keep the largest, starting from 0.'
	],
	optimization: {
		title: 'Optional: avoid comparing every pair of days',
		goal: 'Your solution passes. As an optional exercise, ask whether you need to look at every pair of days, or whether one pass through the prices is enough.',
		hints: [
			'Comparing each day with every later day means the work grows with the square of the number of days.',
			'When you reach a day, the only earlier day that matters for selling today is the cheapest one so far.',
			'Walk through the prices once, remembering the lowest price seen so far and the best profit so far. Update both on every day.'
		]
	},
	knownStrategies: [
		{ name: 'Every pair of days', time: 'O(n²)', space: 'O(1)' },
		{ name: 'Running minimum', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
