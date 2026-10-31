import 'server-only'
import { db } from '@/server/db/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
}

export async function getLearningProgress(): Promise<LearningProgressView> {
	const supabase = await createServerSupabaseClient()
	const { data } = await supabase.auth.getUser()
	const userId = data.user?.id
	if (userId == null)
		return { authenticated: false, available: false, progress: [], recentAttempts: [] }

	try {
		const [progress, attempts] = await Promise.all([
			db.problemProgress.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
			db.attempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 })
		])
		return {
			authenticated: true,
			available: true,
			progress: progress.map((p) => ({
				problemSlug: p.problemSlug,
				status: p.status,
				attempts: p.attempts,
				bestTestsPassed: p.bestTestsPassed,
				testsTotal: p.testsTotal
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
		return { authenticated: true, available: false, progress: [], recentAttempts: [] }
	}
}
