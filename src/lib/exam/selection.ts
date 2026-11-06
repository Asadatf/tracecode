import { randomInt } from 'node:crypto'

// selection@1 — the Daily Exam's problem draw (specs/features/daily-exam.md AC7, AC50, AC51;
// ADR-0012). Problems are REUSED. Each day one eligible problem is drawn with weights that favour
// problems not used recently and used fewer times, under a 7-day cooldown that relaxes one day at a
// time when the pool is too small, and never yesterday's problem when 2 or more are eligible.
//
// Pure apart from the injected random source; the default is the server's CSPRNG
// (crypto.randomInt), never Math.random and never the browser. The draw is made ONCE, at opening,
// and stored in the same conditional write that opens the exam (`openExam` below), so a retry, a
// concurrent opener or a later pool change can never alter an exam's problem.

export const SELECTION_VERSION = 'selection@1'

export const SELECTION_V1 = {
	maxCooldownDays: 7,
	// With 2+ eligible problems the cooldown never relaxes below 1: yesterday's is excluded.
	minCooldownDaysWhenAlternatives: 1,
	recencyCapDays: 30,
	usePenalty: 3,
	// Integer micro-weights keep the draw exact.
	weightScale: 1_000_000
} as const

export type RandomInt = (maxExclusive: number) => number

// The server's CSPRNG.
export const secureRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive)

export interface PoolCandidate {
	id: string
	// Prior exam appearances strictly before the exam being opened (from daily_exams history).
	priorUses: number
	// The last exam date ('YYYY-MM-DD') it was used on before this exam, or null if never.
	lastUsed: string | null
}

export interface WeightedCandidate {
	id: string
	daysSince: number | null
	priorUses: number
	weight: number
}

export interface SelectionRecord {
	version: typeof SELECTION_VERSION
	poolSize: number
	cooldownDays: number
	candidates: WeightedCandidate[]
	total: number
	draw: number
}

export type SelectionResult =
	| { kind: 'selected'; problemId: string; isRepeat: boolean; record: SelectionRecord }
	| { kind: 'empty' }

const DAY_MS = 86_400_000
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00.000Z`) / DAY_MS)

export function daysSince(examDate: string, lastUsed: string | null): number | null {
	if (lastUsed == null) return null
	return Math.max(0, dayNumber(examDate) - dayNumber(lastUsed))
}

// weight = (1 + min(daysSince, 30)) / (1 + 3 × priorUses), scaled to an integer ≥ 1.
export function weightOf(days: number | null, priorUses: number): number {
	const p = SELECTION_V1
	const recency = 1 + Math.min(days ?? p.recencyCapDays, p.recencyCapDays)
	const uses = 1 + p.usePenalty * Math.max(0, Math.trunc(priorUses))
	return Math.max(1, Math.floor((p.weightScale * recency) / uses))
}

export function selectProblem(
	examDate: string,
	pool: readonly PoolCandidate[],
	random: RandomInt = secureRandomInt
): SelectionResult {
	if (pool.length === 0) return { kind: 'empty' }
	const p = SELECTION_V1
	const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	const withDays = sorted.map((c) => ({ ...c, days: daysSince(examDate, c.lastUsed) }))
	const floor: number = withDays.length >= 2 ? p.minCooldownDaysWhenAlternatives : 0

	let cooldown: number = floor
	let eligible = withDays
	for (let k: number = p.maxCooldownDays; k >= floor; k -= 1) {
		// `daysSince > k`: never-used (null) always passes; k = 0 admits everything.
		const set = withDays.filter((c) => k === 0 || c.days == null || c.days > k)
		if (set.length > 0) {
			cooldown = k
			eligible = set
			break
		}
	}

	const candidates: WeightedCandidate[] = eligible.map((c) => ({
		id: c.id,
		daysSince: c.days,
		priorUses: c.priorUses,
		weight: weightOf(c.days, c.priorUses)
	}))
	const total = candidates.reduce((a, c) => a + c.weight, 0)
	const draw = random(total)
	if (!Number.isInteger(draw) || draw < 0 || draw >= total) throw new Error('bad random draw')
	let acc = 0
	let chosen = candidates[candidates.length - 1]
	for (const c of candidates) {
		acc += c.weight
		if (draw < acc) {
			chosen = c
			break
		}
	}
	if (chosen == null) return { kind: 'empty' }
	return {
		kind: 'selected',
		problemId: chosen.id,
		isRepeat: chosen.priorUses > 0,
		record: {
			version: SELECTION_VERSION,
			poolSize: pool.length,
			cooldownDays: cooldown,
			candidates,
			total,
			draw
		}
	}
}

// Derive each eligible problem's history from past exams (daily_exams is the one source of
// truth; nothing denormalised can drift). Only exams strictly before `examDate` count.
export function historyFor(
	examDate: string,
	eligibleIds: readonly string[],
	pastExams: readonly { examDate: string; problemId: string | null }[]
): PoolCandidate[] {
	return eligibleIds.map((id) => {
		const uses = pastExams.filter((e) => e.problemId === id && e.examDate < examDate)
		const last = uses.reduce<string | null>(
			(max, e) => (max == null || e.examDate > max ? e.examDate : max),
			null
		)
		return { id, priorUses: uses.length, lastUsed: last }
	})
}

// ---- Opening, race-safe and idempotent -----------------------------------------------------

export interface OpenStore {
	// The stored problem, or null while the exam has none (and its status).
	read(
		examDate: string
	): Promise<{ status: string; problemId: string | null; isRepeat: boolean } | null>
	// Eligible ids and past exams, read fresh for this attempt to open.
	loadPool(examDate: string): Promise<PoolCandidate[]>
	// ONE conditional write: status = scheduled AND problemId IS NULL AND opensAt <= now() < closesAt
	// -> open with this problem, flag and record. True only for the single winner.
	tryOpen(
		examDate: string,
		problemId: string,
		isRepeat: boolean,
		record: SelectionRecord
	): Promise<boolean>
	// scheduled -> cancelled (no_problem), conditionally; true for the winner.
	tryCancelEmpty(examDate: string): Promise<boolean>
}

export type OpenOutcome =
	| { kind: 'open'; problemId: string; isRepeat: boolean; won: boolean }
	| { kind: 'cancelled' }
	| { kind: 'not_openable'; status: string | null }

export async function openExam(
	store: OpenStore,
	examDate: string,
	random: RandomInt = secureRandomInt
): Promise<OpenOutcome> {
	const before = await store.read(examDate)
	if (before == null) return { kind: 'not_openable', status: null }
	// Already chosen: never recompute (idempotent).
	if (before.problemId != null)
		return { kind: 'open', problemId: before.problemId, isRepeat: before.isRepeat, won: false }
	if (before.status === 'cancelled') return { kind: 'cancelled' }
	if (before.status !== 'scheduled') return { kind: 'not_openable', status: before.status }

	const result = selectProblem(examDate, await store.loadPool(examDate), random)
	if (result.kind === 'empty') {
		await store.tryCancelEmpty(examDate)
		const after = await store.read(examDate)
		if (after?.problemId != null)
			return { kind: 'open', problemId: after.problemId, isRepeat: after.isRepeat, won: false }
		return after?.status === 'cancelled'
			? { kind: 'cancelled' }
			: { kind: 'not_openable', status: after?.status ?? null }
	}
	const won = await store.tryOpen(examDate, result.problemId, result.isRepeat, result.record)
	// The loser (or a write refused by the time window) reads what is actually stored.
	const after = await store.read(examDate)
	if (after?.problemId != null)
		return { kind: 'open', problemId: after.problemId, isRepeat: after.isRepeat, won }
	return { kind: 'not_openable', status: after?.status ?? null }
}
