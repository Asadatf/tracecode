import { pythonEquals } from '../challenge/judge'

// Aggregate failure categories for a graded exam submission (specs/features/daily-exam.md AC28,
// evidence category 2). COUNTS ONLY: never which case, its input or its expected output, so the
// result can be shown to the learner and given to the AI without revealing the hidden suite.
// Uses the same equality rule as the verified M9 judge (judge.ts), so a case counts as a wrong
// answer exactly when that judge would fail it.

export const FAILURE_CATEGORIES = [
	'wrong_answer',
	'exception',
	'timeout',
	'memory',
	'recursion',
	'entry_not_found',
	'other'
] as const
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number]
export type FailureCounts = Record<FailureCategory, number>

// The runner's per-case error codes (src/lib/challenge/runner-program.ts) mapped to categories.
const BY_ERROR: Readonly<Record<string, FailureCategory>> = {
	exception: 'exception',
	timeout: 'timeout',
	memory: 'memory',
	recursion: 'recursion',
	entry_not_found: 'entry_not_found'
}

export function emptyFailureCounts(): FailureCounts {
	return {
		wrong_answer: 0,
		exception: 0,
		timeout: 0,
		memory: 0,
		recursion: 0,
		entry_not_found: 0,
		other: 0
	}
}

// `outputs` is the runner's parsed stdout, already validated by judgeOutputs; anything that is
// not a well-formed case output, or a missing one, counts as `other`.
export function failureCounts(
	outputs: unknown,
	cases: readonly { id: string; expected: unknown }[]
): FailureCounts {
	const counts = emptyFailureCounts()
	const byId = new Map<string, { ok?: unknown; actual?: unknown; error?: unknown }>()
	if (Array.isArray(outputs))
		for (const o of outputs)
			if (typeof o === 'object' && o !== null && typeof (o as { id?: unknown }).id === 'string')
				byId.set((o as { id: string }).id, o as { ok?: unknown; actual?: unknown; error?: unknown })
	for (const c of cases) {
		const out = byId.get(c.id)
		if (out == null) counts.other += 1
		else if (out.ok === true) {
			if (!pythonEquals(out.actual, c.expected)) counts.wrong_answer += 1
		} else {
			const code = typeof out.error === 'string' ? out.error : ''
			counts[BY_ERROR[code] ?? 'other'] += 1
		}
	}
	return counts
}
