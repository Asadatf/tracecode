// Query shapes for the M7.1 attempt code-features actions, kept pure (like
// replay-writes.ts) so the two properties that matter — every query is scoped to
// the signed-in learner, and the backfill read is bounded — are unit-tested
// without a database. The actions in src/server/actions/learning.ts run these
// against Prisma. `missing` is Prisma.DbNull, injected because this file stays
// free of the server-only Prisma client.

// The hard ceiling on one backfill read. The browser also keeps a per-session
// budget (code-feature-backfill.ts); this caps what the server will ever return
// in one call, whatever a client asks for.
export const BACKFILL_MAX_BATCH = 10

export function clampBackfillLimit(requested: number): number {
	if (!Number.isFinite(requested)) return BACKFILL_MAX_BATCH
	return Math.min(BACKFILL_MAX_BATCH, Math.max(1, Math.floor(requested)))
}

// The learner's own newest attempts that still lack features. Newest first,
// because the latest few attempts per problem are what M7 analyses. Attempts
// whose status is `syntax_error` can never parse, so they are never candidates
// (otherwise they would be re-listed, and re-analysed, every session). Only the
// two columns the browser needs are selected.
export function backfillCandidateQuery<Missing>(userId: string, limit: number, missing: Missing) {
	return {
		where: {
			userId,
			codeFeatures: { equals: missing },
			status: { not: 'syntax_error' }
		},
		orderBy: { createdAt: 'desc' as const },
		take: clampBackfillLimit(limit),
		select: { id: true, source: true }
	}
}

// Set features on one of the learner's own attempts, only while they are still
// missing. A single conditional UPDATE: the ownership check, the "only if
// missing" idempotency check and the write are one statement, so concurrent
// calls cannot overwrite each other, and an id that belongs to someone else (or
// does not exist) matches no row — indistinguishable from "already set".
export function setFeaturesIfMissingQuery<Missing, Features>(
	userId: string,
	attemptId: string,
	features: Features,
	missing: Missing
) {
	return {
		where: { id: attemptId, userId, codeFeatures: { equals: missing } },
		data: { codeFeatures: features }
	}
}
