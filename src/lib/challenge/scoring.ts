import { EXAM_DURATION_MS } from './exam-rules'

// Scoring and ranking (specs/features/daily-challenge.md § Scoring). Pure. Every input
// is a server-verified result: nothing here sees a browser-reported pass count.

export const POINTS_PER_CHALLENGE = 1000
// Extra for a FULL pass only, scaled by the time left, so speed breaks nothing else.
export const MAX_TIME_BONUS = 100

export interface VerifiedResult {
	testsPassed: number
	testsTotal: number
	// Server-measured milliseconds from start to submit.
	elapsedMs: number
}

export function isFullPass(result: Pick<VerifiedResult, 'testsPassed' | 'testsTotal'>): boolean {
	return result.testsTotal > 0 && result.testsPassed === result.testsTotal
}

// 1000 x passed / total, rounded; plus up to 100 for a full pass, linear in the time
// remaining. An empty or inconsistent result scores 0.
export function dailyScore(result: VerifiedResult): number {
	const { testsPassed, testsTotal } = result
	if (testsTotal <= 0 || testsPassed < 0 || testsPassed > testsTotal) return 0
	const base = Math.round((POINTS_PER_CHALLENGE * testsPassed) / testsTotal)
	if (!isFullPass(result)) return base
	const remaining = Math.max(0, EXAM_DURATION_MS - Math.min(EXAM_DURATION_MS, result.elapsedMs))
	return base + Math.floor((MAX_TIME_BONUS * remaining) / EXAM_DURATION_MS)
}

export interface StandingInput {
	// An opaque id used only to join rows; never displayed.
	key: string
	score: number
	daysSolved: number
	// Total elapsed milliseconds on the fully solved days.
	totalMs: number
	// When the last scoring submission was made (epoch ms).
	lastSubmittedAt: number
}

export interface RankedStanding<T extends StandingInput = StandingInput> {
	rank: number
	entry: T
}

// The published tie-break order: higher total score; then more fully solved days;
// then lower total time on solved days; then the earlier final scoring submission.
// Entries equal on all four SHARE a rank (competition ranking: 1, 2, 2, 4), so no
// one is placed above an equal by an arbitrary rule. The returned order for equal
// entries is stable by `key`, which only affects row order, never rank.
export function compareStandings(a: StandingInput, b: StandingInput): number {
	return (
		b.score - a.score ||
		b.daysSolved - a.daysSolved ||
		a.totalMs - b.totalMs ||
		a.lastSubmittedAt - b.lastSubmittedAt ||
		(a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
	)
}

function tied(a: StandingInput, b: StandingInput): boolean {
	return (
		a.score === b.score &&
		a.daysSolved === b.daysSolved &&
		a.totalMs === b.totalMs &&
		a.lastSubmittedAt === b.lastSubmittedAt
	)
}

export function rankStandings<T extends StandingInput>(entries: readonly T[]): RankedStanding<T>[] {
	const sorted = [...entries].sort(compareStandings)
	const ranked: RankedStanding<T>[] = []
	sorted.forEach((entry, index) => {
		const previous = ranked[index - 1]
		ranked.push({
			rank: previous != null && tied(previous.entry, entry) ? previous.rank : index + 1,
			entry
		})
	})
	return ranked
}

export const LEADERBOARD_SIZE = 20

export interface VerifiedAttemptRow {
	key: string
	challengeDate: string
	testsPassed: number
	testsTotal: number
	score: number
	elapsedMs: number
	submittedAt: number
}

// Folds one learner's graded attempts for a week into a standing.
export function standingFor(key: string, rows: readonly VerifiedAttemptRow[]): StandingInput {
	let score = 0
	let daysSolved = 0
	let totalMs = 0
	let lastSubmittedAt = 0
	for (const row of rows) {
		score += row.score
		lastSubmittedAt = Math.max(lastSubmittedAt, row.submittedAt)
		if (isFullPass(row)) {
			daysSolved += 1
			totalMs += row.elapsedMs
		}
	}
	return { key, score, daysSolved, totalMs, lastSubmittedAt }
}
