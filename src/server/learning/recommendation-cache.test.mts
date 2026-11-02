import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	CLAIM_TTL_MS,
	REFRESH_COOLDOWN_MS,
	getRecommendationCore,
	parseStoredRecommendation,
	refreshRecommendationCore,
	reusableAiDiagnosis,
	type CacheRow,
	type CacheStore,
	type Deterministic
} from './recommendation-cache.ts'
import { rankRecommendations, type Recommendation } from '../../lib/learning/recommend.ts'
import { buildFor, att, HASHMAP, NESTED, type Spec } from '../../lib/learning/evidence-fixtures.mts'
import { PROBLEMS } from '../../lib/trace/problems.ts'

// M7.5A — the pure caching policy, exercised against an in-memory store that
// mirrors the Prisma store's atomic contract. No database, no provider.

function deterministicFor(specs: Spec[]): Deterministic {
	const { evidence } = buildFor(specs)
	const recommendation = rankRecommendations(evidence, { evidenceHash: computeHash(specs) })
	return { evidence, recommendation }
}
// The real hash from buildFor, so changing specs changes the hash.
function computeHash(specs: Spec[]): string {
	return buildFor(specs).hash
}

function asAi(rec: Recommendation, summary = 'AI says keep going'): Recommendation {
	return {
		...rec,
		diagnosis: {
			source: 'ai',
			stale: false,
			summary,
			nextStep: 'Try it again.',
			claims: []
		}
	}
}

// An in-memory CacheStore. Each method is synchronous internally (no await
// between check and write), which is exactly the atomicity the Prisma conditional
// writes provide — so concurrency behaves like production.
function memoryStore(seed?: CacheRow): CacheStore & { row: () => CacheRow | null } {
	let row: CacheRow | null = seed ? structuredClone(seed) : null
	return {
		row: () => (row ? structuredClone(row) : null),
		async get(userId) {
			return row && row.userId === userId ? structuredClone(row) : null
		},
		async upsertDeterministic({ userId, evidenceHash, recommendation }) {
			if (row == null) {
				row = {
					userId,
					v: recommendation.v,
					evidenceHash,
					payload: recommendation,
					model: null,
					diagnosisSource: recommendation.diagnosis.source,
					generatedAt: new Date().toISOString(),
					refreshState: 'idle',
					refreshClaimHash: null,
					refreshClaimedAt: null,
					lastRefreshAt: null
				}
				return
			}
			if (row.evidenceHash !== evidenceHash) {
				row = {
					...row,
					v: recommendation.v,
					evidenceHash,
					payload: recommendation,
					model: null,
					diagnosisSource: recommendation.diagnosis.source,
					generatedAt: new Date().toISOString()
				}
			}
		},
		async claimRefresh(userId, hash, now) {
			if (row == null || row.userId !== userId) return false
			const stale =
				row.refreshClaimedAt != null &&
				now.getTime() - Date.parse(row.refreshClaimedAt) >= CLAIM_TTL_MS
			if (row.refreshState === 'running' && !stale) return false
			row = {
				...row,
				refreshState: 'running',
				refreshClaimHash: hash,
				refreshClaimedAt: now.toISOString(),
				lastRefreshAt: now.toISOString()
			}
			return true
		},
		async completeAiRefresh({ userId, evidenceHash, model, recommendation }) {
			if (row == null || row.userId !== userId || row.evidenceHash !== evidenceHash) return false
			row = {
				...row,
				v: recommendation.v,
				payload: recommendation,
				model,
				diagnosisSource: 'ai',
				generatedAt: new Date().toISOString(),
				refreshState: 'idle',
				refreshClaimHash: null
			}
			return true
		},
		async releaseClaim(userId, hash) {
			if (row && row.userId === userId && row.refreshClaimHash === hash) {
				row = { ...row, refreshState: 'idle', refreshClaimHash: null }
			}
		}
	}
}

const USER = 'user-1'
const OPEN_FAILURES: Spec[] = [
	att('a1', 0, 'fail', NESTED),
	att('a2', 4, 'fail', NESTED),
	att('a3', 8, 'fail', NESTED)
]

function aiRow(det: Deterministic, model: string | null, over: Partial<CacheRow> = {}): CacheRow {
	return {
		userId: USER,
		v: det.recommendation.v,
		evidenceHash: det.recommendation.evidenceHash,
		payload: asAi(det.recommendation),
		model,
		diagnosisSource: 'ai',
		generatedAt: new Date().toISOString(),
		refreshState: 'idle',
		refreshClaimHash: null,
		refreshClaimedAt: null,
		lastRefreshAt: null,
		...over
	}
}

// --- 2. Cold start ---------------------------------------------------------------

test('cold start: a deterministic recommendation is returned and cached', async () => {
	const det = deterministicFor([])
	const store = memoryStore()
	const out = await getRecommendationCore({ userId: USER, deterministic: det, store, model: 'm' })
	assert.equal(out.diagnosis.source, 'fallback')
	assert.ok(out.rankedProblems.length > 0)
	// It was persisted for reuse.
	assert.equal(store.row()?.evidenceHash, det.recommendation.evidenceHash)
})

// --- 3 & 6. Cached AI hit --------------------------------------------------------

test('a valid cached AI diagnosis is reused and overlaid on the fresh ranking', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore(aiRow(det, 'm'))
	const out = await getRecommendationCore({ userId: USER, deterministic: det, store, model: 'm' })
	assert.equal(out.diagnosis.source, 'ai')
	assert.equal(out.diagnosis.summary, 'AI says keep going')
	// Ranking is the fresh deterministic one, never served from the stored payload.
	assert.deepEqual(out.rankedProblems, det.recommendation.rankedProblems)
	assert.equal(out.evidenceHash, det.recommendation.evidenceHash)
})

// --- 4 & 5 & 7. Changed hash / backfill / stale AI suppression -------------------

test('a cached AI diagnosis for a different evidence hash is never surfaced', async () => {
	const oldDet = deterministicFor([att('a1', 0, 'fail', null)])
	const newDet = deterministicFor(OPEN_FAILURES)
	assert.notEqual(oldDet.recommendation.evidenceHash, newDet.recommendation.evidenceHash)
	const store = memoryStore(aiRow(oldDet, 'm'))
	const out = await getRecommendationCore({
		userId: USER,
		deterministic: newDet,
		store,
		model: 'm'
	})
	assert.equal(out.diagnosis.source, 'fallback')
	// And the stale row was replaced with the current deterministic one.
	assert.equal(store.row()?.evidenceHash, newDet.recommendation.evidenceHash)
})

test('backfilling features changes the hash, invalidating a cached AI diagnosis', async () => {
	const before = deterministicFor([att('a1', 0, 'fail', null), att('a2', 4, 'fail', null)])
	const after = deterministicFor([att('a1', 0, 'fail', NESTED), att('a2', 4, 'fail', NESTED)])
	assert.notEqual(before.recommendation.evidenceHash, after.recommendation.evidenceHash)
	const store = memoryStore(aiRow(before, 'm'))
	const out = await getRecommendationCore({ userId: USER, deterministic: after, store, model: 'm' })
	assert.equal(out.diagnosis.source, 'fallback')
})

// --- 8. Model change -------------------------------------------------------------

test('a cached AI diagnosis from a different model is not reused', () => {
	const det = deterministicFor(OPEN_FAILURES)
	const row = aiRow(det, 'old-model')
	assert.equal(reusableAiDiagnosis(row, det.recommendation.evidenceHash, 'new-model'), null)
	assert.ok(reusableAiDiagnosis(row, det.recommendation.evidenceHash, 'old-model') != null)
})

// --- 16. getRecommendation never calls AI (structural) ---------------------------

test('the read path cannot call the provider — it takes no diagnose dependency', async () => {
	// getRecommendationCore has no `diagnose` parameter at all; a fallback row stays
	// fallback on read.
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore()
	const out = await getRecommendationCore({ userId: USER, deterministic: det, store, model: 'm' })
	assert.equal(out.diagnosis.source, 'fallback')
})

// --- 13. Cache/DB unavailable ----------------------------------------------------

test('a throwing store degrades to the deterministic result without throwing', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const brokenStore: CacheStore = {
		async get() {
			throw new Error('table missing')
		},
		async upsertDeterministic() {
			throw new Error('table missing')
		},
		async claimRefresh() {
			throw new Error('table missing')
		},
		async completeAiRefresh() {
			throw new Error('table missing')
		},
		async releaseClaim() {
			throw new Error('table missing')
		}
	}
	const read = await getRecommendationCore({
		userId: USER,
		deterministic: det,
		store: brokenStore,
		model: 'm'
	})
	assert.equal(read.diagnosis.source, 'fallback')
	let calls = 0
	const refresh = await refreshRecommendationCore({
		userId: USER,
		deterministic: det,
		store: brokenStore,
		model: 'm',
		aiEnabled: true,
		now: new Date(),
		diagnose: async () => {
			calls += 1
			return asAi(det.recommendation)
		}
	})
	// The claim could not be won (store throws), so no model call, deterministic result.
	assert.equal(calls, 0)
	assert.equal(refresh.recommendation.diagnosis.source, 'fallback')
})

// --- refresh: reuse, ai_disabled, cooldown ---------------------------------------

test('refresh reuses a valid cached AI diagnosis without calling the model', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore(aiRow(det, 'm'))
	let calls = 0
	const out = await refreshRecommendationCore({
		userId: USER,
		deterministic: det,
		store,
		model: 'm',
		aiEnabled: true,
		now: new Date(),
		diagnose: async () => {
			calls += 1
			return asAi(det.recommendation)
		}
	})
	assert.equal(calls, 0)
	assert.equal(out.reason, 'reused_cache')
	assert.equal(out.recommendation.diagnosis.source, 'ai')
})

test('refresh with AI disabled returns the deterministic result and never calls the model', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore()
	let calls = 0
	const out = await refreshRecommendationCore({
		userId: USER,
		deterministic: det,
		store,
		model: null,
		aiEnabled: false,
		now: new Date(),
		diagnose: async () => {
			calls += 1
			return asAi(det.recommendation)
		}
	})
	assert.equal(calls, 0)
	assert.equal(out.reason, 'ai_disabled')
	assert.equal(out.recommendation.diagnosis.source, 'fallback')
})

// --- 11. Cooldown ----------------------------------------------------------------

test('a recent refresh attempt blocks another model call (cooldown)', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const now = new Date()
	const store = memoryStore(
		aiRow(det, 'm', {
			diagnosisSource: 'fallback',
			payload: det.recommendation,
			lastRefreshAt: new Date(now.getTime() - REFRESH_COOLDOWN_MS / 2).toISOString()
		})
	)
	let calls = 0
	const out = await refreshRecommendationCore({
		userId: USER,
		deterministic: det,
		store,
		model: 'm',
		aiEnabled: true,
		now,
		diagnose: async () => {
			calls += 1
			return asAi(det.recommendation)
		}
	})
	assert.equal(calls, 0)
	assert.equal(out.reason, 'cooldown')
})

// --- 9. Concurrent refreshes -----------------------------------------------------

test('two concurrent refreshes make exactly one model call; the other bows out', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore()
	let calls = 0
	const diagnose = async () => {
		calls += 1
		await Promise.resolve()
		return asAi(det.recommendation)
	}
	const deps = {
		userId: USER,
		deterministic: det,
		store,
		model: 'm',
		aiEnabled: true,
		now: new Date(),
		diagnose
	}
	const [a, b] = await Promise.all([
		refreshRecommendationCore(deps),
		refreshRecommendationCore(deps)
	])
	assert.equal(calls, 1)
	const reasons = [a.reason, b.reason].sort()
	assert.deepEqual(reasons, ['ai_applied', 'claim_lost'])
})

// --- 10. Expired claim recovery --------------------------------------------------

test('a stale running claim is recoverable: a new refresh wins it', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const now = new Date()
	const store = memoryStore(
		aiRow(det, 'm', {
			diagnosisSource: 'fallback',
			payload: det.recommendation,
			refreshState: 'running',
			refreshClaimHash: 'old-claim',
			refreshClaimedAt: new Date(now.getTime() - CLAIM_TTL_MS * 2).toISOString()
		})
	)
	let calls = 0
	const out = await refreshRecommendationCore({
		userId: USER,
		deterministic: det,
		store,
		model: 'm',
		aiEnabled: true,
		now,
		diagnose: async () => {
			calls += 1
			return asAi(det.recommendation)
		}
	})
	assert.equal(calls, 1)
	assert.equal(out.reason, 'ai_applied')
})

// --- 12. Provider failure --------------------------------------------------------

test('a provider failure (AI returns fallback) keeps the deterministic result and releases the claim', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore()
	const out = await refreshRecommendationCore({
		userId: USER,
		deterministic: det,
		store,
		model: 'm',
		aiEnabled: true,
		now: new Date(),
		// M7.4 returns the deterministic recommendation (source 'fallback') on any failure.
		diagnose: async () => det.recommendation
	})
	assert.equal(out.reason, 'ai_rejected_or_failed')
	assert.equal(out.recommendation.diagnosis.source, 'fallback')
	assert.equal(store.row()?.refreshState, 'idle', 'claim released')
})

// --- 15. Old refresh completing after newer evidence -----------------------------

test('an AI result for stale evidence does not overwrite a newer recommendation', async () => {
	const oldDet = deterministicFor(OPEN_FAILURES)
	const newDet = deterministicFor([...OPEN_FAILURES, att('a4', 12, 'pass', HASHMAP)])
	assert.notEqual(oldDet.recommendation.evidenceHash, newDet.recommendation.evidenceHash)
	const store = memoryStore()
	const out = await refreshRecommendationCore({
		userId: USER,
		deterministic: oldDet,
		store,
		model: 'm',
		aiEnabled: true,
		now: new Date(),
		diagnose: async () => {
			// While "the model runs", newer evidence lands (a concurrent read persisted it).
			await store.upsertDeterministic({
				userId: USER,
				evidenceHash: newDet.recommendation.evidenceHash,
				recommendation: newDet.recommendation
			})
			return asAi(oldDet.recommendation)
		}
	})
	assert.equal(out.reason, 'evidence_moved')
	// The row kept the newer evidence; the stale AI write was rejected.
	assert.equal(store.row()?.evidenceHash, newDet.recommendation.evidenceHash)
	assert.equal(store.row()?.diagnosisSource, 'fallback')
	assert.equal(store.row()?.refreshState, 'idle', 'stale claim released')
})

// --- reusableAiDiagnosis guards --------------------------------------------------

test('reusableAiDiagnosis rejects fallback rows, hash mismatches and corrupt payloads', () => {
	const det = deterministicFor(OPEN_FAILURES)
	const hash = det.recommendation.evidenceHash
	assert.equal(reusableAiDiagnosis(null, hash, 'm'), null)
	assert.equal(
		reusableAiDiagnosis(aiRow(det, 'm', { diagnosisSource: 'fallback' }), hash, 'm'),
		null
	)
	assert.equal(reusableAiDiagnosis(aiRow(det, 'm'), 'different-hash', 'm'), null)
	assert.equal(reusableAiDiagnosis(aiRow(det, 'm', { payload: { junk: true } }), hash, 'm'), null)
	assert.ok(reusableAiDiagnosis(aiRow(det, 'm'), hash, null) != null, 'null model matches any')
})

// --- payload parsing -------------------------------------------------------------

test('parseStoredRecommendation accepts a real recommendation and rejects corruption', () => {
	const det = deterministicFor(OPEN_FAILURES)
	assert.deepEqual(parseStoredRecommendation(det.recommendation), det.recommendation)
	assert.equal(parseStoredRecommendation({ v: 1 }), null)
	assert.equal(parseStoredRecommendation(null), null)
	assert.equal(parseStoredRecommendation('nope'), null)
})

// --- 17. Links resolve to real catalog problems ----------------------------------

test('every recommended slug is a real catalog problem (links cannot 404)', () => {
	for (const specs of [[], OPEN_FAILURES, [att('a1', 0, 'pass', HASHMAP)]]) {
		const det = deterministicFor(specs as Spec[])
		for (const ranked of det.recommendation.rankedProblems) {
			assert.ok(PROBLEMS[ranked.slug] != null, ranked.slug)
		}
	}
})

// --- 12. Real M7.4 enrichment composed with the cache, provider mocked ------------

test('timeout, 429, invalid JSON and a missing key all keep the deterministic result', async () => {
	const { enrichWithAi } = await import('./recommend-ai.ts')
	const failures = [
		async () => ({ ok: false as const, reason: 'timeout' as const }),
		async () => ({ ok: false as const, reason: 'rate_limited' as const, status: 429 }),
		async () => ({ ok: false as const, reason: 'no_api_key' as const }),
		async () => ({ ok: true as const, content: 'definitely not json', model: 'm' })
	]
	for (const askModel of failures) {
		const det = deterministicFor(OPEN_FAILURES)
		const store = memoryStore()
		const out = await refreshRecommendationCore({
			userId: USER,
			deterministic: det,
			store,
			model: 'm',
			aiEnabled: true,
			now: new Date(),
			diagnose: (input) => enrichWithAi(input, { askModel })
		})
		assert.equal(out.reason, 'ai_rejected_or_failed')
		assert.deepEqual(out.recommendation, det.recommendation)
		assert.equal(store.row()?.diagnosisSource, 'fallback')
		assert.equal(store.row()?.refreshState, 'idle')
	}
})

test('a valid mocked model response is validated, persisted and bound to the hash', async () => {
	const { enrichWithAi } = await import('./recommend-ai.ts')
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore()
	const content = JSON.stringify({
		summary: 'Your recent two-sum submissions did not pass every test yet.',
		nextStep: 'Open two-sum and work through the failing cases.',
		claims: [{ problemSlug: 'two-sum', metric: 'observed.failedAttempts', value: 3 }]
	})
	const out = await refreshRecommendationCore({
		userId: USER,
		deterministic: det,
		store,
		model: 'm',
		aiEnabled: true,
		now: new Date(),
		diagnose: (input) =>
			enrichWithAi(input, { askModel: async () => ({ ok: true, content, model: 'm' }) })
	})
	assert.equal(out.reason, 'ai_applied')
	// Ranking unchanged by AI.
	assert.deepEqual(out.recommendation.rankedProblems, det.recommendation.rankedProblems)
	assert.equal(store.row()?.evidenceHash, det.recommendation.evidenceHash)
	assert.equal(store.row()?.model, 'm')
	// A later read reuses it, still without any model call.
	const read = await getRecommendationCore({ userId: USER, deterministic: det, store, model: 'm' })
	assert.equal(read.diagnosis.source, 'ai')
})

// --- 14. Cross-user isolation (store contract) ------------------------------------

test('one learner can neither read nor claim nor overwrite another learner’s row', async () => {
	const det = deterministicFor(OPEN_FAILURES)
	const store = memoryStore(aiRow(det, 'm'))
	assert.equal(await store.get('someone-else'), null)
	assert.equal(
		await store.claimRefresh('someone-else', det.recommendation.evidenceHash, new Date()),
		false
	)
	assert.equal(
		await store.completeAiRefresh({
			userId: 'someone-else',
			evidenceHash: det.recommendation.evidenceHash,
			model: 'm',
			recommendation: det.recommendation
		}),
		false
	)
	const other = await getRecommendationCore({
		userId: 'someone-else',
		deterministic: det,
		store,
		model: 'm'
	})
	assert.equal(other.diagnosis.source, 'fallback', 'no AI diagnosis leaks across users')
})
