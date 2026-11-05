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
	// ---- the ten catalogue-expansion problems ----
	'valid-palindrome': ([s]) => {
		const kept = [...String(s)].filter((c) => /[A-Za-z0-9]/.test(c)).map((c) => c.toLowerCase())
		return kept.every((c, i) => c === kept[kept.length - 1 - i])
	},
	// Expected value is the list AFTER the call.
	'reverse-string': ([chars]) => [...(chars as string[])].reverse(),
	'maximum-subarray': ([nums]) => {
		const list = nums as number[]
		let top = -Infinity
		for (let i = 0; i < list.length; i++) {
			let sum = 0
			for (let j = i; j < list.length; j++) {
				sum += list[j]!
				if (sum > top) top = sum
			}
		}
		return top
	},
	'best-time-to-buy-and-sell-stock': ([prices]) => {
		const list = prices as number[]
		let top = 0
		for (let i = 0; i < list.length; i++)
			for (let j = i + 1; j < list.length; j++) top = Math.max(top, list[j]! - list[i]!)
		return top
	},
	// Expected value is nums1 AFTER the call.
	'merge-two-sorted-arrays': ([nums1, m, nums2, n]) => {
		const real = (nums1 as number[]).slice(0, m as number)
		const extra = (nums2 as number[]).slice(0, n as number)
		return [...real, ...extra].sort((a, b) => a - b)
	},
	'first-unique-character': ([s]) => {
		const text = String(s)
		for (let i = 0; i < text.length; i++)
			if (text.indexOf(text[i]!) === i && text.lastIndexOf(text[i]!) === i) return i
		return -1
	},
	'missing-number': ([nums]) => {
		const list = nums as number[]
		const seen = new Set(list)
		for (let i = 0; i <= list.length; i++) if (!seen.has(i)) return i
		return -1
	},
	'majority-element': ([nums]) => {
		const list = nums as number[]
		const counts = new Map<number, number>()
		for (const x of list) counts.set(x, (counts.get(x) ?? 0) + 1)
		for (const [value, count] of counts) if (count > Math.floor(list.length / 2)) return value
		return null
	},
	'longest-common-prefix': ([strs]) => {
		const list = strs as string[]
		if (list.length === 0) return ''
		let prefix = ''
		for (let i = 0; i < Math.min(...list.map((s) => s.length)); i++) {
			if (list.every((s) => s[i] === list[0]![i])) prefix += list[0]![i]
			else break
		}
		return prefix
	},
	'climbing-stairs': ([n]) => {
		// Counts the move sequences directly (compositions of n into 1s and 2s), not by Fibonacci.
		const count = (left: number): number =>
			left === 0 ? 1 : left < 0 ? 0 : count(left - 1) + count(left - 2)
		return count(n as number)
	}
}
