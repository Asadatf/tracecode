// Deterministic Daily Exam scoring and ranking (specs/features/daily-exam.md AC18, AC19, AC29).
// Integers only (10,000 units max), so ordering never depends on floating-point rounding. Every
// input is server-verified (Sandbox counts, server timestamps, the integrity policy's deductions).
// No AI output reaches this module.

export const CORRECTNESS_MAX = 8000
export const SPEED_MAX = 2000
export const SCORE_MAX = CORRECTNESS_MAX + SPEED_MAX
export const SPEED_WINDOW_SECONDS = 1800

export interface CodingScore {
	correctness: number
	speed: number
	coding: number
	fullPass: boolean
}

export function codingScore(input: {
	testsPassed: number
	testsTotal: number
	elapsedSeconds: number
}): CodingScore {
	const total = Math.max(0, Math.trunc(input.testsTotal))
	const passed = Math.min(total, Math.max(0, Math.trunc(input.testsPassed)))
	const fullPass = total > 0 && passed === total
	const correctness = total === 0 ? 0 : Math.floor((CORRECTNESS_MAX * passed) / total)
	const elapsed = Math.max(0, Math.trunc(input.elapsedSeconds))
	const speed = fullPass
		? Math.floor((SPEED_MAX * Math.max(0, SPEED_WINDOW_SECONDS - elapsed)) / SPEED_WINDOW_SECONDS)
		: 0
	return { correctness, speed, coding: correctness + speed, fullPass }
}

export function finalScore(coding: number, deductions: number): number {
	return Math.max(0, coding - Math.max(0, deductions))
}

export type StandingStatus = 'full_pass' | 'partial' | 'no_submission' | 'grading_failed'

export interface StandingInput {
	userKey: string
	status: StandingStatus
	finalScore: number
	testsPassed: number
	// Server submission instant (ms); null for no submission.
	submittedAtMs: number | null
}

export interface RankedStanding<T extends StandingInput> {
	entry: T
	ranked: boolean
	rank: number | null
}

// A stable tie-breaker that does not favour any account: a 32-bit FNV-1a over exam and user.
export function stableTieKey(examDate: string, userKey: string): number {
	let hash = 0x811c9dc5
	for (const ch of `${examDate}:${userKey}`) {
		hash ^= ch.codePointAt(0) ?? 0
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash
}

// AC19: full pass first, then final score, then hidden tests passed, then the earlier submission;
// equal on all four share a rank, and the stable hash only orders the display of a tie.
// `grading_failed` attempts are listed but NOT ranked (never scored 0 in the ranking).
export function rankStandings<T extends StandingInput>(
	examDate: string,
	entries: readonly T[]
): RankedStanding<T>[] {
	const ranked = entries.filter((e) => e.status !== 'grading_failed')
	const unranked = entries.filter((e) => e.status === 'grading_failed')
	const key = (e: T) =>
		[
			e.status === 'full_pass' ? 0 : 1,
			-e.finalScore,
			-e.testsPassed,
			e.submittedAtMs ?? Number.MAX_SAFE_INTEGER
		] as const
	const compare = (a: T, b: T) => {
		const ka = key(a)
		const kb = key(b)
		for (let i = 0; i < ka.length; i += 1) {
			const d = (ka[i] ?? 0) - (kb[i] ?? 0)
			if (d !== 0) return d
		}
		return stableTieKey(examDate, a.userKey) - stableTieKey(examDate, b.userKey)
	}
	const sorted = [...ranked].sort(compare)
	const out: RankedStanding<T>[] = []
	let rank = 0
	sorted.forEach((entry, index) => {
		const prev = sorted[index - 1]
		const tied = prev != null && key(prev).every((v, i) => v === key(entry)[i])
		if (!tied) rank = index + 1
		out.push({ entry, ranked: true, rank })
	})
	const unrankedSorted = [...unranked].sort(
		(a, b) => stableTieKey(examDate, a.userKey) - stableTieKey(examDate, b.userKey)
	)
	for (const entry of unrankedSorted) out.push({ entry, ranked: false, rank: null })
	return out
}
