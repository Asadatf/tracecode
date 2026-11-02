import type { Json } from './contract'

// Independent TypeScript oracles for the four curated problems — a second,
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
	}
}
