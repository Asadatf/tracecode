import 'server-only'
import { db, Prisma } from '@/server/db/client'
import { env } from '@/lib/env'
import { captureError } from '@/lib/observability/capture-error'
import { currentUserIdSafe } from '@/server/auth/session'
import { loadRecommendationEvidence } from '@/server/learning/recommendation-evidence'
import { rankRecommendations, type Recommendation } from '@/lib/learning/recommend'
import { resolveModel } from '@/server/ai/openrouter-protocol'
import {
	CLAIM_TTL_MS,
	getRecommendationCore,
	refreshRecommendationCore,
	type AiRow,
	type CacheRow,
	type CacheStore,
	type Deterministic,
	type DeterministicRow,
	type RefreshReason
} from './recommendation-cache'

// Authenticated recommendation service (M7.5A). Wires the pure M7.2 evidence +
// M7.3 ranking + M7.4 enrichment + the cache policy together. The user id comes
// only from the validated session — never a request body — and every query is
// filtered by it, so one learner can never read or refresh another's row.
//
// `getRecommendation` NEVER calls OpenRouter (safe on page load). AI runs only
// through `refreshRecommendation`, behind a durable claim and a cooldown. Both
// degrade like getLearningAnalytics: unauthenticated → authenticated:false, DB /
// evidence unavailable → available:false, and the cache being absent (table not
// migrated) never breaks the deterministic result.

export type RecommendationView =
	| { authenticated: false; available: false; recommendation: null }
	| { authenticated: true; available: false; recommendation: null }
	| { authenticated: true; available: true; recommendation: Recommendation }

export interface RefreshResult {
	view: RecommendationView
	// Why the refresh did or didn't apply AI — a safe enum for the UI, never PII.
	reason: RefreshReason | 'unauthenticated' | 'unavailable'
}

function jsonIn(value: Recommendation): Prisma.InputJsonValue {
	return value as unknown as Prisma.InputJsonValue
}

// P2002 = Prisma unique-constraint violation (the row already exists). Compared
// by code so this doesn't import Prisma's error class.
function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'P2002'
	)
}

// The configured model a cached AI diagnosis must match to be reused. Resolved
// the same way M7.4 resolves the model it actually calls.
function configuredModel(): string {
	return resolveModel(env.OPENROUTER_MODEL)
}

function aiEnabled(): boolean {
	return env.OPENROUTER_API_KEY != null && env.OPENROUTER_API_KEY !== ''
}

// Whether the "Refresh AI insight" control should be offered (an API key is
// configured). The UI reads this so it doesn't show a refresh button that can
// only ever return the deterministic fallback.
export function isRecommendationAiEnabled(): boolean {
	return aiEnabled()
}

// The Prisma-backed cache store. Each method is a single conditional write, which
// is what makes the claim concurrency-safe at the database rather than in memory.
const prismaStore: CacheStore = {
	async get(userId) {
		const row = await db.recommendationCache.findUnique({ where: { userId } })
		if (row == null) return null
		return {
			userId: row.userId,
			v: row.v,
			evidenceHash: row.evidenceHash,
			payload: row.payload,
			model: row.model,
			diagnosisSource: row.diagnosisSource === 'ai' ? 'ai' : 'fallback',
			generatedAt: row.generatedAt.toISOString(),
			refreshState: row.refreshState === 'running' ? 'running' : 'idle',
			refreshClaimHash: row.refreshClaimHash,
			refreshClaimedAt: row.refreshClaimedAt?.toISOString() ?? null,
			lastRefreshAt: row.lastRefreshAt?.toISOString() ?? null
		} satisfies CacheRow
	},

	async upsertDeterministic(row: DeterministicRow) {
		const now = new Date()
		// Create fresh, or — when the row already exists — refresh the payload ONLY
		// while the stored evidence hash differs, so a same-hash AI payload is never
		// clobbered with a fallback. Prisma `upsert` can't express that guard, so
		// this is create-then-guarded-updateMany. The refresh-claim fields are left
		// untouched either way.
		try {
			await db.recommendationCache.create({
				data: {
					userId: row.userId,
					v: row.recommendation.v,
					evidenceHash: row.evidenceHash,
					payload: jsonIn(row.recommendation),
					model: null,
					diagnosisSource: row.recommendation.diagnosis.source,
					generatedAt: now
				}
			})
			return
		} catch (error) {
			// P2002 = unique violation: the row already exists; fall through to update.
			if (!isUniqueViolation(error)) throw error
		}
		await db.recommendationCache.updateMany({
			where: { userId: row.userId, evidenceHash: { not: row.evidenceHash } },
			data: {
				v: row.recommendation.v,
				payload: jsonIn(row.recommendation),
				model: null,
				diagnosisSource: row.recommendation.diagnosis.source,
				generatedAt: now,
				evidenceHash: row.evidenceHash
			}
		})
	},

	async claimRefresh(userId, hash, now) {
		const cutoff = new Date(now.getTime() - CLAIM_TTL_MS)
		const { count } = await db.recommendationCache.updateMany({
			where: {
				userId,
				// Not already running, or the previous claim is older than the TTL.
				OR: [{ refreshState: { not: 'running' } }, { refreshClaimedAt: { lt: cutoff } }]
			},
			data: {
				refreshState: 'running',
				refreshClaimHash: hash,
				refreshClaimedAt: now,
				lastRefreshAt: now
			}
		})
		return count === 1
	},

	async completeAiRefresh(row: AiRow) {
		const { count } = await db.recommendationCache.updateMany({
			// Guarded by the hash: never overwrite a row whose evidence moved on.
			where: { userId: row.userId, evidenceHash: row.evidenceHash },
			data: {
				v: row.recommendation.v,
				payload: jsonIn(row.recommendation),
				model: row.model,
				diagnosisSource: 'ai',
				generatedAt: new Date(),
				refreshState: 'idle',
				refreshClaimHash: null
			}
		})
		return count === 1
	},

	async releaseClaim(userId, hash) {
		await db.recommendationCache.updateMany({
			// Only release our own claim.
			where: { userId, refreshClaimHash: hash },
			data: { refreshState: 'idle', refreshClaimHash: null }
		})
	}
}

// Computes evidence + the deterministic recommendation for a known user id (from
// the session, or the reminder cron's own iteration). Throws on a database error;
// callers decide how to degrade.
async function loadDeterministic(userId: string): Promise<Deterministic> {
	const { evidence, evidenceHash } = await loadRecommendationEvidence(userId)
	const recommendation = rankRecommendations(evidence, {
		generatedAt: new Date().toISOString(),
		evidenceHash
	})
	return { evidence, recommendation }
}

/**
 * The current recommendation for a learner the SERVER chose (the M7.5B reminder
 * cron) — never a request-supplied id. Reuses a valid cached AI diagnosis and
 * persists the deterministic result exactly like getRecommendation, and never
 * calls the provider. Throws on a database error.
 */
export async function recommendationForUser(userId: string): Promise<Deterministic> {
	const deterministic = await loadDeterministic(userId)
	const recommendation = await getRecommendationCore({
		userId,
		deterministic,
		store: prismaStore,
		model: configuredModel()
	})
	return { evidence: deterministic.evidence, recommendation }
}

/**
 * The learner's current recommendation. Deterministic always; a cached AI
 * diagnosis only while it is bound to the current evidence hash. Never calls the
 * provider. Degrades gracefully and never throws into the page.
 */
export async function getRecommendation(): Promise<RecommendationView> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false, available: false, recommendation: null }
	try {
		const { recommendation } = await recommendationForUser(userId)
		return { authenticated: true, available: true, recommendation }
	} catch (error) {
		captureError(error, { area: 'recommendation' })
		return { authenticated: true, available: false, recommendation: null }
	}
}

/**
 * Explicit AI refresh. Authenticated only. Recomputes evidence, reuses a valid
 * cached AI diagnosis, else enforces cooldown + a durable atomic claim before one
 * M7.4 model call, validates and persists bound to the exact evidence hash, and
 * never lets an older refresh overwrite newer evidence. On any failure it returns
 * the deterministic recommendation.
 */
export async function refreshRecommendation(): Promise<RefreshResult> {
	const userId = await currentUserIdSafe()
	if (userId == null) {
		return {
			view: { authenticated: false, available: false, recommendation: null },
			reason: 'unauthenticated'
		}
	}
	try {
		const deterministic = await loadDeterministic(userId)
		// Bound lazily so a plain read of this module never loads the provider.
		const { diagnoseRecommendation } = await import('@/server/learning/recommend-ai')
		const outcome = await refreshRecommendationCore({
			userId,
			deterministic,
			store: prismaStore,
			model: configuredModel(),
			aiEnabled: aiEnabled(),
			now: new Date(),
			diagnose: (input) => diagnoseRecommendation(input)
		})
		return {
			view: { authenticated: true, available: true, recommendation: outcome.recommendation },
			reason: outcome.reason
		}
	} catch (error) {
		captureError(error, { area: 'recommendation-refresh' })
		return {
			view: { authenticated: true, available: false, recommendation: null },
			reason: 'unavailable'
		}
	}
}
