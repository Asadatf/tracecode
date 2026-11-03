import type { Json } from './contract'

// Independent TypeScript oracles for the curated problems — a second,
// differently-written source of truth for "what is the right answer", used to
// cross-check every official `expected` value and the differential inputs. They
// deliberately share no logic with the Python reference solutions.

export const ORACLES: Record<string, (args: Json[]) => Json> = {
	'valid-anagram': ([s, t]) => {
		const counts = new Map<string, number>()
		for (const ch of String(s)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
		for (const ch of String(t)) counts.set(ch, (counts.get(ch) ?? 0) - 1)
		return [...counts.values()].every((n) => n === 0)
	},
	// Expected value is the list AFTER the call.
	'move-zeroes': ([nums]) => {
		const list = nums as number[]
		return [...list.filter((x) => x !== 0), ...list.filter((x) => x === 0)]
	},
	'binary-search': ([nums, target]) => (nums as number[]).indexOf(target as number),
	'valid-parentheses': ([s]) => {
		const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
		const open: string[] = []
		for (const ch of String(s)) {
			const partner = pairs[ch]
			if (partner === undefined) open.push(ch)
			else if (open.pop() !== partner) return false
		}
		return open.length === 0
	},
	// Problem pack 2 (specs/features/problem-pack-classics.md). Each is written
	// differently from both the catalog's own generators and the references.
	'best-time-to-buy-and-sell-stock': ([prices]) => {
		// Best future price per day, scanned from the right.
		const list = prices as number[]
		let bestAfter = -Infinity
		let best = 0
		for (let i = list.length - 1; i >= 0; i--) {
			bestAfter = Math.max(bestAfter, list[i]!)
			best = Math.max(best, bestAfter - list[i]!)
		}
		return best
	},
	'valid-palindrome': ([s]) => {
		const kept = String(s)
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')
		return kept === [...kept].reverse().join('')
	},
	'maximum-subarray': ([nums]) => {
		// Prefix sums: best = max over j of prefix[j] - min(prefix[0..j-1]).
		const list = nums as number[]
		let prefix = 0
		let lowestPrefix = 0
		let best = -Infinity
		for (const x of list) {
			prefix += x
			best = Math.max(best, prefix - lowestPrefix)
			lowestPrefix = Math.min(lowestPrefix, prefix)
		}
		return best
	},
	// Expected value is nums1 AFTER the call.
	'merge-sorted-array': ([nums1, m, nums2]) =>
		[...(nums1 as number[]).slice(0, m as number), ...(nums2 as number[])].sort((a, b) => a - b),
	'majority-element': ([nums]) => {
		const list = nums as number[]
		const counts = new Map<number, number>()
		for (const x of list) counts.set(x, (counts.get(x) ?? 0) + 1)
		for (const [value, count] of counts) if (count * 2 > list.length) return value
		return null
	},
	'climbing-stairs': ([n]) => {
		// Count compositions of n into 1s and 2s: sum over k twos of C(n - k, k).
		const steps = n as number
		let total = 0
		for (let twos = 0; twos * 2 <= steps; twos++) {
			const parts = steps - twos
			let ways = 1
			for (let i = 0; i < twos; i++) ways = (ways * (parts - i)) / (i + 1)
			total += Math.round(ways)
		}
		return total
	}
}
