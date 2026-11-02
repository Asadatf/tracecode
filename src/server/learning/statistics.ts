import 'server-only'
import { db } from '@/server/db/client'
import { currentUserIdSafe } from '@/server/auth/session'
import { captureError } from '@/lib/observability/capture-error'
import {
	computeLearningStatistics,
	type LearningRecords,
	type LearningStatistics
} from '@/lib/learning/statistics'
import { analyzeLearningBehavior, type LearningBehavior } from '@/lib/learning/behavior'
import { generateLearningInsights, type LearningInsights } from '@/lib/learning/insights'

// Server entry point for learner analytics (M6.1 statistics, M6.2 behaviour,
// M6.3 insights; M7 recommendations read it). The user id comes only from the
// validated Supabase session — never from a caller — and every query is
// filtered by it. Records are loaded once; each layer builds on the one before
// it rather than recomputing. Same degradation
// contract as getLearningProgress: unauthenticated → authenticated:false; DB
// unavailable → available:false. Never throws into the caller.

export interface LearningAnalytics {
	statistics: LearningStatistics
	behavior: LearningBehavior
	insights: LearningInsights
}

export type LearningAnalyticsView =
	| { authenticated: false; available: false; analytics: null }
	| { authenticated: true; available: false; analytics: null }
	| { authenticated: true; available: true; analytics: LearningAnalytics }

async function loadLearningRecords(userId: string): Promise<LearningRecords> {
	const [attempts, replaySessions, events] = await Promise.all([
		db.attempt.findMany({
			where: { userId },
			select: {
				id: true,
				problemSlug: true,
				createdAt: true,
				testsPassed: true,
				testsTotal: true,
				allPassed: true,
				testResults: { where: { passed: false }, select: { testId: true } }
			}
		}),
		// The attempt filter is belt-and-braces: recordReplaySession already
		// guarantees a session's attempt belongs to the same learner.
		db.replaySession.findMany({
			where: { userId, attempt: { userId } },
			select: {
				attemptId: true,
				testId: true,
				testPassed: true,
				startedAt: true,
				attempt: { select: { problemSlug: true } }
			}
		}),
		db.learningEvent.findMany({
			where: { userId, type: { in: ['replay_inspected', 'hint_revealed'] } },
			select: { problemSlug: true, type: true, detail: true, createdAt: true }
		})
	])
	return {
		attempts: attempts.map(({ testResults, ...a }) => ({
			...a,
			failedTestIds: testResults.map((t) => t.testId)
		})),
		replaySessions: replaySessions.map(({ attempt, ...s }) => ({
			...s,
			problemSlug: attempt.problemSlug
		})),
		events
	}
}

// Analytics for a known user id. The caller is responsible for where the id came
// from: the session (getLearningAnalytics below) or, for the M7.5B reminder cron,
// the server's own iteration over learners — never a request body. Throws on a
// database error; the wrappers decide how to degrade.
export async function loadLearningAnalytics(userId: string): Promise<LearningAnalytics> {
	const records = await loadLearningRecords(userId)
	const statistics = computeLearningStatistics(records)
	const behavior = analyzeLearningBehavior(statistics, records)
	const insights = generateLearningInsights(statistics, behavior)
	return { statistics, behavior, insights }
}

export async function getLearningAnalytics(): Promise<LearningAnalyticsView> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false, available: false, analytics: null }

	try {
		return { authenticated: true, available: true, analytics: await loadLearningAnalytics(userId) }
	} catch (error) {
		captureError(error, { area: 'learning-analytics' })
		return { authenticated: true, available: false, analytics: null }
	}
}
