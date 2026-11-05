import { type ProblemDefinition } from '../problem'

// Contract: 0 ≤ len ≤ 1000, each price an integer in [0, 10⁴]. One purchase, then one later sale.
const wavy = Array.from({ length: 1000 }, (_, i) => 5000 + ((i * 37) % 900) - (i % 2) * 400)
function bestProfit(prices: number[]): number {
	let low = Infinity
	let profit = 0
	for (const p of prices) {
		low = Math.min(low, p)
		profit = Math.max(profit, p - low)
	}
	return profit
}

export const bestTimeToBuyAndSellStock = {
	slug: 'best-time-to-buy-and-sell-stock',
	title: 'Best Time to Buy and Sell Stock',
	entry: 'max_profit',
	params: [{ name: 'prices' }],
	difficulty: 'easy',
	conceptTags: ['arrays', 'greedy'],
	statement: [
		'prices[i] is the price of a stock on day i. You may buy on one day and sell on a LATER day, once. Return the largest profit you can make.',
		'You must sell after you buy, so a low price that comes after a high price cannot be used for that sale. If no trade can make a profit, or there are fewer than two days, return 0.'
	],
	examples: [
		{ args: [[7, 1, 5, 3, 6, 4]], output: 5 },
		{ args: [[7, 6, 4, 3, 1]], output: 0 }
	],
	starter:
		'def max_profit(prices: list[int]) -> int:\n    # Return the largest profit from buying on one day and selling on a later day.\n    # Return 0 if no profit is possible.\n    return 0',
	visibleTestIds: ['t1', 't2', 't3', 't4', 't5', 't8'],
	tests: [
		{ id: 't1', args: [[7, 1, 5, 3, 6, 4]], expected: 5 },
		{ id: 't2', args: [[7, 6, 4, 3, 1]], expected: 0 },
		{ id: 't3', args: [[]], expected: 0 },
		{ id: 't4', args: [[5]], expected: 0 },
		{ id: 't5', args: [[1, 2]], expected: 1 },
		{ id: 't6', args: [[2, 1]], expected: 0 },
		{ id: 't7', args: [[3, 3, 3]], expected: 0 },
		// The lowest price (1) comes AFTER the highest (4): the best trade is 2 → 4, not 1 → 4.
		{ id: 't8', args: [[2, 4, 1]], expected: 2 },
		{ id: 't9', args: [[1, 2, 4, 2, 5, 7, 2, 4, 9, 0, 9]], expected: 9 },
		{ id: 't10', args: [wavy], expected: bestProfit(wavy) }
	],
	arrayVar: 'prices',
	pointerVars: [
		['i', 'prices'],
		['j', 'prices'],
		['day', 'prices'],
		['buy', 'prices'],
		['sell', 'prices']
	],
	correctnessHints: [
		'Check the order of the two days in your answer: is the day you sell strictly after the day you buy?',
		'The highest price minus the lowest price is not always allowed: the lowest price may come after the highest. And if every trade loses money, the answer is 0, not a negative number.',
		"Walk through the days in order, remembering the lowest price so far. At each day, the best sale today is today's price minus that lowest price; keep the largest such value, starting at 0."
	],
	optimization: {
		title: 'Optional: look for repeated work',
		goal: 'Your solution passes. As an optional exercise, ask whether you need to compare every pair of days, or whether one pass can carry forward what it has already learned.',
		hints: [
			'Trying every pair of buy and sell days compares the same earlier days against each later day again and again.',
			'For any sale day, the best day to have bought is simply the cheapest day before it.',
			"Scan the days once, keeping the cheapest price seen so far and the best profit so far. Update the cheapest price as you go and compare today's price minus it against the best profit."
		]
	},
	knownStrategies: [
		{ name: 'Try every buy and sell pair', time: 'O(n²)', space: 'O(1)' },
		{ name: 'Track the lowest price so far', time: 'O(n)', space: 'O(1)' }
	]
} satisfies ProblemDefinition
