import 'server-only'
import { db } from '@/server/db/client'
import { currentUserIdSafe } from '@/server/auth/session'

// Read a learner's persisted progress. A plain server-only helper (NOT a
// component), so its try/catch is free of the React Compiler's constraints.
// Degrades gracefully: unauthenticated → authenticated:false; DB/migrations
// unavailable → available:false. Never throws into the page.

export interface ProgressRow {
	problemSlug: string
	status: string
	attempts: number
	bestTestsPassed: number
	testsTotal: number
	firstSolvedAt: string | null
	latestSolvedAt: string | null
}

export interface AttemptRow {
	problemSlug: string
	createdAt: string
	testsPassed: number
	testsTotal: number
	allPassed: boolean
}

export interface LearningProgressView {
	authenticated: boolean
	available: boolean
	progress: ProgressRow[]
	recentAttempts: AttemptRow[]
	replaysInspected: number
	hintsRevealed: number
}

function empty(authenticated: boolean): LearningProgressView {
	return {
		authenticated,
		available: false,
		progress: [],
		recentAttempts: [],
		replaysInspected: 0,
		hintsRevealed: 0
	}
}

export async function getLearningProgress(): Promise<LearningProgressView> {
	const userId = await currentUserIdSafe()
	if (userId == null) return empty(false)

	try {
		const [progress, attempts, replaysInspected, hintsRevealed] = await Promise.all([
			db.problemProgress.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
			db.attempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
			db.learningEvent.count({ where: { userId, type: 'replay_inspected' } }),
			db.learningEvent.count({ where: { userId, type: 'hint_revealed' } })
		])
		return {
			authenticated: true,
			available: true,
			replaysInspected,
			hintsRevealed,
			progress: progress.map((p) => ({
				problemSlug: p.problemSlug,
				status: p.status,
				attempts: p.attempts,
				bestTestsPassed: p.bestTestsPassed,
				testsTotal: p.testsTotal,
				firstSolvedAt: p.firstSolvedAt?.toISOString() ?? null,
				latestSolvedAt: p.latestSolvedAt?.toISOString() ?? null
			})),
			recentAttempts: attempts.map((a) => ({
				problemSlug: a.problemSlug,
				createdAt: a.createdAt.toISOString(),
				testsPassed: a.testsPassed,
				testsTotal: a.testsTotal,
				allPassed: a.allPassed
			}))
		}
	} catch {
		// Tables not migrated yet, or the database is unreachable.
		return empty(true)
	}
}
