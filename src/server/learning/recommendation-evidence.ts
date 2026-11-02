import 'server-only'
import { db } from '@/server/db/client'
import { currentUserIdSafe } from '@/server/auth/session'
import { captureError } from '@/lib/observability/capture-error'
import { PROBLEMS } from '@/lib/trace/problems'
import { loadLearningAnalytics } from '@/server/learning/statistics'
import { attemptEvidenceQuery } from '@/lib/learning/attempt-evidence-query'
import { isMissingColumnError } from '@/lib/learning/missing-column'
import { computeEvidenceHash } from '@/lib/learning/evidence-hash'
import {
	buildRecommendationEvidence,
	catalogEntries,
	type RecommendationEvidence
} from '@/lib/learning/recommendation-evidence'
import {
	buildAttemptSequences,
	type AttemptEvidenceRecord
} from '@/lib/learning/solution-evolution'

// Server entry point for the learning evidence (M7.2). Same degradation contract as
// getLearningAnalytics: signed out -> authenticated:false; database unavailable ->
// available:false; it never throws into the caller. The user id comes only from the
// validated session, every query is filtered by it, and the learner's source code
// is never read — only outcomes, failed test ids and the stored fingerprint.

export type RecommendationEvidenceView =
	| { authenticated: false; available: false; evidence: null; evidenceHash: null }
	| { authenticated: true; available: false; evidence: null; evidenceHash: null }
	| {
			authenticated: true
			available: true
			evidence: RecommendationEvidence
			evidenceHash: string
	  }

async function loadRecords(userId: string, withFeatures: boolean) {
	const perProblem = await Promise.all(
		Object.keys(PROBLEMS).map((slug) =>
			db.attempt.findMany(attemptEvidenceQuery(userId, slug, withFeatures))
		)
	)
	return perProblem.flat()
}

async function loadAttemptRecords(userId: string): Promise<AttemptEvidenceRecord[]> {
	let rows: Awaited<ReturnType<typeof loadRecords>>
	try {
		rows = await loadRecords(userId, true)
	} catch (error) {
		// The code can run a moment before the codeFeatures migration has. Evidence
		// then simply has no fingerprints yet, exactly like an un-backfilled learner.
		if (!isMissingColumnError(error)) throw error
		rows = await loadRecords(userId, false)
	}
	return rows.map((row) => ({
		id: row.id,
		problemSlug: row.problemSlug,
		createdAt: row.createdAt,
		status: row.status,
		testsPassed: row.testsPassed,
		testsTotal: row.testsTotal,
		allPassed: row.allPassed,
		failedTestIds: row.testResults.map((t) => t.testId),
		codeFeatures: 'codeFeatures' in row ? row.codeFeatures : null
	}))
}

// The evidence for a known user id (session-derived, or the reminder cron's own
// iteration — never a request body). Throws on a database error.
export async function loadRecommendationEvidence(
	userId: string
): Promise<{ evidence: RecommendationEvidence; evidenceHash: string }> {
	const [analytics, records] = await Promise.all([
		loadLearningAnalytics(userId),
		loadAttemptRecords(userId)
	])
	const evidence = buildRecommendationEvidence(
		analytics,
		buildAttemptSequences(records),
		catalogEntries(Object.values(PROBLEMS)),
		{ generatedAt: new Date().toISOString() }
	)
	return { evidence, evidenceHash: computeEvidenceHash(evidence) }
}

export async function getRecommendationEvidence(): Promise<RecommendationEvidenceView> {
	const userId = await currentUserIdSafe()
	if (userId == null) {
		return { authenticated: false, available: false, evidence: null, evidenceHash: null }
	}
	try {
		const { evidence, evidenceHash } = await loadRecommendationEvidence(userId)
		return { authenticated: true, available: true, evidence, evidenceHash }
	} catch (error) {
		captureError(error, { area: 'recommendation-evidence' })
		return { authenticated: true, available: false, evidence: null, evidenceHash: null }
	}
}
