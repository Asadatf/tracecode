// A line-by-line diff for comparing two attempts (specs/features/compare-attempts.md).
// Longest common subsequence over lines: O(a·b) time and memory, fine for the
// few hundred lines a solution has; callers check MAX_DIFF_LINES first.

export const MAX_DIFF_LINES = 2000

export type DiffLine =
	| { kind: 'same'; text: string; aLine: number; bLine: number }
	| { kind: 'removed'; text: string; aLine: number }
	| { kind: 'added'; text: string; bLine: number }

// Trailing whitespace never counts as a change; indentation does (it changes
// what Python runs).
const normal = (line: string) => line.replace(/\s+$/, '')

export function lineDiff(a: string, b: string): DiffLine[] {
	const left = a.split('\n')
	const right = b.split('\n')
	const n = left.length
	const m = right.length
	// lcs[i][j] = length of the LCS of left[i..] and right[j..].
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
	for (let i = n - 1; i >= 0; i--) {
		const row = lcs[i]!
		const below = lcs[i + 1]!
		for (let j = m - 1; j >= 0; j--) {
			row[j] =
				normal(left[i]!) === normal(right[j]!)
					? below[j + 1]! + 1
					: Math.max(below[j]!, row[j + 1]!)
		}
	}

	const out: DiffLine[] = []
	let i = 0
	let j = 0
	while (i < n && j < m) {
		if (normal(left[i]!) === normal(right[j]!)) {
			out.push({ kind: 'same', text: right[j]!, aLine: i + 1, bLine: j + 1 })
			i++
			j++
		} else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
			out.push({ kind: 'removed', text: left[i]!, aLine: i + 1 })
			i++
		} else {
			out.push({ kind: 'added', text: right[j]!, bLine: j + 1 })
			j++
		}
	}
	for (; i < n; i++) out.push({ kind: 'removed', text: left[i]!, aLine: i + 1 })
	for (; j < m; j++) out.push({ kind: 'added', text: right[j]!, bLine: j + 1 })
	return out
}

export function hasChanges(diff: readonly DiffLine[]): boolean {
	return diff.some((line) => line.kind !== 'same')
}

export function tooLongToDiff(a: string, b: string): boolean {
	return a.split('\n').length > MAX_DIFF_LINES || b.split('\n').length > MAX_DIFF_LINES
}

// AC3: default From/To. The last failing attempt before the first pass, and
// that pass; otherwise the two most recent attempts. Indexes into `passed`.
export function defaultComparePair(passed: readonly boolean[]): [number, number] | null {
	if (passed.length < 2) return null
	const firstPass = passed.indexOf(true)
	if (firstPass > 0) {
		for (let i = firstPass - 1; i >= 0; i--) if (!passed[i]) return [i, firstPass]
	}
	return [passed.length - 2, passed.length - 1]
}
