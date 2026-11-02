import { z } from 'zod'
import { REASON_CODES, type Recommendation } from '@/lib/learning/recommend'
import type { RecommendationEvidence } from '@/lib/learning/recommendation-evidence'

// M7.5 recommendation caching POLICY, kept pure so every branch — cache hit,
// stale hash, cooldown, concurrent claim, expired claim, old-overwrites-newer —
// is unit-testable against an in-memory store, with no database and no provider.
// The Prisma-backed store and the authenticated wiring live in `recommendation.ts`.
//
// M7.3 is always the authority: a cached AI diagnosis is reused ONLY while it is
// bound to the current evidence hash (and model), and even then it is overlaid
// onto the freshly computed deterministic ranking so the ranking, focus concepts
// and hash are never served from a stale payload — only the diagnosis text is.

// A crashed refresh self-heals after this long; a concurrent refresh within it
// sees the live claim and makes no model call.
export const CLAIM_TTL_MS = 60_000
// Per-user minimum interval between AI refresh ATTEMPTS, independent of evidence
// changes — a secondary rate cap on top of the "evidence changed" trigger.
export const REFRESH_COOLDOWN_MS = 10 * 60_000

// What the `recommendation_cache` row holds, as plain data (timestamps as ISO
// strings so the core is clock-serialisation agnostic).
export interface CacheRow {
	userId: string
	v: number
	evidenceHash: string
	payload: unknown
	model: string | null
	diagnosisSource: 'fallback' | 'ai'
	generatedAt: string
	refreshState: 'idle' | 'running'
	refreshClaimHash: string | null
	refreshClaimedAt: string | null
	lastRefreshAt: string | null
}

// The atomic operations the policy needs. Each is a single conditional write in
// the Prisma store; the in-memory test store implements the same contract.
export interface CacheStore {
	get(userId: string): Promise<CacheRow | null>
	// Create the row, or update its payload ONLY when the stored hash differs
	// (never clobbering a same-hash AI payload with a fresh fallback). Never
	// touches the refresh-claim fields.
	upsertDeterministic(row: DeterministicRow): Promise<void>
	// Atomically win the refresh claim: flip to 'running' for `hash` only when not
	// already running, or the previous claim is older than the TTL. Records the
	// attempt time for the cooldown. Returns true iff this caller won.
	claimRefresh(userId: string, hash: string, now: Date): Promise<boolean>
	// Persist a won AI diagnosis, GUARDED by `hash`: writes only while the row's
	// evidenceHash still equals `hash`, so an older refresh can never overwrite a
	// row whose evidence has moved on. Releases the claim. Returns true iff it wrote.
	completeAiRefresh(row: AiRow): Promise<boolean>
	// Release our own claim (matched by claim hash) without changing the payload.
	releaseClaim(userId: string, hash: string): Promise<void>
}

export interface DeterministicRow {
	userId: string
	evidenceHash: string
	recommendation: Recommendation
}

export interface AiRow {
	userId: string
	evidenceHash: string
	model: string
	recommendation: Recommendation
}

// --- payload validation ----------------------------------------------------------

// Defensive parse of a stored payload. It is our own data, but a corrupt or
// older-shape row must read as "no usable cache", never throw.
const evidenceRefSchema = z.object({
	problemSlug: z.string().nullable(),
	metric: z.string(),
	value: z.union([z.string(), z.number(), z.boolean(), z.null()])
})

export const recommendationPayloadSchema = z
	.object({
		v: z.number(),
		generatedAt: z.string().nullable(),
		evidenceHash: z.string(),
		focusConcepts: z.array(z.string()),
		rankedProblems: z.array(
			z.object({
				slug: z.string(),
				score: z.number(),
				reasonCode: z.enum(REASON_CODES),
				reasonText: z.string(),
				evidenceRefs: z.array(evidenceRefSchema)
			})
		),
		diagnosis: z.object({
			source: z.enum(['fallback', 'ai']),
			stale: z.boolean(),
			summary: z.string(),
			nextStep: z.string(),
			claims: z.array(z.object({ problemSlug: z.string().nullable(), metric: z.string() }))
		})
	})
	.strict()

export function parseStoredRecommendation(payload: unknown): Recommendation | null {
	const parsed = recommendationPayloadSchema.safeParse(payload)
	return parsed.success ? (parsed.data as Recommendation) : null
}

// A cached AI diagnosis that is still valid for `hash`, overlaid onto the fresh
// deterministic recommendation. Null when the row is missing, stale, not AI, for
// another model, or unparseable — any of which means "serve deterministic".
export function reusableAiDiagnosis(
	row: CacheRow | null,
	hash: string,
	model: string | null
): Recommendation['diagnosis'] | null {
	if (row == null || row.evidenceHash !== hash || row.diagnosisSource !== 'ai') return null
	if (model != null && row.model !== model) return null
	const payload = parseStoredRecommendation(row.payload)
	if (payload == null || payload.diagnosis.source !== 'ai') return null
	return { ...payload.diagnosis, stale: false }
}

// --- cores -----------------------------------------------------------------------

export interface Deterministic {
	evidence: RecommendationEvidence
	recommendation: Recommendation
}

export interface GetDeps {
	userId: string
	deterministic: Deterministic
	store: CacheStore
	// Which model a cached AI diagnosis must match to be reused (the configured one).
	model: string | null
}

// Swallow a cache failure (table not migrated, DB blip) to a null/no-op: the
// recommendation itself never depends on the cache being available.
async function safeGet(store: CacheStore, userId: string): Promise<CacheRow | null> {
	try {
		return await store.get(userId)
	} catch {
		return null
	}
}

async function safeUpsert(store: CacheStore, row: DeterministicRow): Promise<void> {
	try {
		await store.upsertDeterministic(row)
	} catch {
		// Cache unavailable — the deterministic result is still returned to the caller.
	}
}

// The read path. NEVER calls the provider. Returns a cached AI diagnosis only
// while it is bound to the current evidence hash; otherwise the deterministic
// result, which it best-effort persists when the cache is stale or missing.
export async function getRecommendationCore(deps: GetDeps): Promise<Recommendation> {
	const { userId, deterministic, store, model } = deps
	const hash = deterministic.recommendation.evidenceHash
	const row = await safeGet(store, userId)

	const diagnosis = reusableAiDiagnosis(row, hash, model)
	if (diagnosis != null) {
		return { ...deterministic.recommendation, diagnosis }
	}
	if (row == null || row.evidenceHash !== hash) {
		await safeUpsert(store, {
			userId,
			evidenceHash: hash,
			recommendation: deterministic.recommendation
		})
	}
	return deterministic.recommendation
}

export type RefreshOutcome =
	// what to return, plus why (for safe reporting/analytics; never PII)
	{ recommendation: Recommendation; refreshed: boolean; reason: RefreshReason }

export type RefreshReason =
	| 'reused_cache' // a valid cached AI diagnosis was reused, no model call
	| 'ai_disabled' // no API key configured
	| 'cooldown' // within the per-user cooldown, no model call
	| 'claim_lost' // a concurrent refresh holds the claim, no model call
	| 'ai_applied' // a fresh AI diagnosis was validated and persisted
	| 'ai_rejected_or_failed' // provider failed or output rejected → deterministic
	| 'evidence_moved' // AI returned but evidence changed mid-flight → not written

export interface RefreshDeps extends GetDeps {
	aiEnabled: boolean
	now: Date
	// The M7.4 enrichment service; returns a Recommendation whose diagnosis is
	// 'ai' on success or 'fallback' otherwise. Never throws (M7.4 contract), but
	// the core guards anyway.
	diagnose: (input: Deterministic) => Promise<Recommendation>
}

// The AI refresh path. Recomputes nothing here (evidence is passed in, computed
// once up front); enforces reuse → cooldown → durable claim → one model call →
// hash-guarded persist. Always resolves to a complete recommendation.
export async function refreshRecommendationCore(deps: RefreshDeps): Promise<RefreshOutcome> {
	const { userId, deterministic, store, model, aiEnabled, now, diagnose } = deps
	const hash = deterministic.recommendation.evidenceHash
	const fallback = deterministic.recommendation

	const row = await safeGet(store, userId)

	// Nothing meaningful changed since a valid AI diagnosis was cached: reuse it.
	const reusable = reusableAiDiagnosis(row, hash, model)
	if (reusable != null) {
		return {
			recommendation: { ...fallback, diagnosis: reusable },
			refreshed: false,
			reason: 'reused_cache'
		}
	}

	if (!aiEnabled) {
		await safeUpsert(store, { userId, evidenceHash: hash, recommendation: fallback })
		return { recommendation: fallback, refreshed: false, reason: 'ai_disabled' }
	}

	// Per-user cooldown: a recent attempt bars another model call regardless of
	// evidence changes.
	if (withinCooldown(row, now)) {
		await safeUpsert(store, { userId, evidenceHash: hash, recommendation: fallback })
		return { recommendation: fallback, refreshed: false, reason: 'cooldown' }
	}

	// Ensure a row exists bound to the current hash so the claim has something to
	// flip, then win the durable claim (or bow out to a concurrent refresh).
	await safeUpsert(store, { userId, evidenceHash: hash, recommendation: fallback })
	const won = await safeClaim(store, userId, hash, now)
	if (!won) {
		return { recommendation: fallback, refreshed: false, reason: 'claim_lost' }
	}

	try {
		const enriched = await diagnose(deterministic)
		if (enriched.diagnosis.source === 'ai') {
			const wrote = await safeComplete(store, {
				userId,
				evidenceHash: hash,
				model: model ?? '',
				recommendation: enriched
			})
			// A successful write already released the claim (set it idle). If the
			// guarded write missed, the evidence moved on under us: release our now
			// stale claim and keep the (newer) deterministic result rather than
			// overwriting it.
			if (wrote) return { recommendation: enriched, refreshed: true, reason: 'ai_applied' }
			await safeRelease(store, userId, hash)
			return { recommendation: fallback, refreshed: false, reason: 'evidence_moved' }
		}
		// Provider failed or output was rejected by M7.4 → deterministic stays.
		await safeRelease(store, userId, hash)
		return { recommendation: fallback, refreshed: false, reason: 'ai_rejected_or_failed' }
	} catch {
		await safeRelease(store, userId, hash)
		return { recommendation: fallback, refreshed: false, reason: 'ai_rejected_or_failed' }
	}
}

function withinCooldown(row: CacheRow | null, now: Date): boolean {
	if (row?.lastRefreshAt == null) return false
	return now.getTime() - Date.parse(row.lastRefreshAt) < REFRESH_COOLDOWN_MS
}

async function safeClaim(
	store: CacheStore,
	userId: string,
	hash: string,
	now: Date
): Promise<boolean> {
	try {
		return await store.claimRefresh(userId, hash, now)
	} catch {
		return false
	}
}

async function safeComplete(store: CacheStore, row: AiRow): Promise<boolean> {
	try {
		return await store.completeAiRefresh(row)
	} catch {
		return false
	}
}

async function safeRelease(store: CacheStore, userId: string, hash: string): Promise<void> {
	try {
		await store.releaseClaim(userId, hash)
	} catch {
		// Claim self-heals after CLAIM_TTL_MS even if release fails.
	}
}
