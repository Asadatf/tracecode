import 'server-only'
import { db } from '@/server/db/client'
import { currentUserIdSafe } from '@/server/auth/session'
import { recentAttemptsQuery } from '@/lib/learning/recent-attempts-query'
import { firstAttemptsQuery, toFirstAttempts } from '@/lib/learning/first-attempts-query'
import { computeStreak, type StreakStats } from '@/lib/streak/streak'
import { getActivitySummary } from '@/server/learning/activity'

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
	// When the learner last ran this problem. The row is only ever written by
	// saveAttempt, so its `updatedAt` is the time of the latest attempt.
	lastAttemptAt: string
}

export interface AttemptRow {
	problemSlug: string
	createdAt: string
	// How the run ended: completed, syntax_error, timeout or engine_error.
	status: string
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
			db.attempt.findMany(recentAttemptsQuery(userId)),
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
				latestSolvedAt: p.latestSolvedAt?.toISOString() ?? null,
				lastAttemptAt: p.updatedAt.toISOString()
			})),
			recentAttempts: attempts.map((a) => ({
				problemSlug: a.problemSlug,
				createdAt: a.createdAt.toISOString(),
				status: a.status,
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

// When the signed-in learner first attempted each problem (slug → ISO time), for
// the problem-detail modal. A separate, read-only aggregate used only by the pages
// that show it. Unauthenticated, or the database unreachable: an empty map, so the
// modal shows a dash rather than a made-up date.
export async function getFirstAttemptDates(): Promise<Record<string, string>> {
	const userId = await currentUserIdSafe()
	if (userId == null) return {}
	try {
		const query = firstAttemptsQuery(userId)
		// Bound to a variable first: passing the call straight into toFirstAttempts
		// makes TypeScript infer Prisma's groupBy generic from the wrong context.
		const rows = await db.attempt.groupBy({
			by: ['problemSlug'],
			where: query.where,
			_min: query._min
		})
		return toFirstAttempts(rows)
	} catch {
		return {}
	}
}

export type StreakSummary =
	| { authenticated: false }
	| { authenticated: true; available: false }
	| ({
			authenticated: true
			available: true
			// The server's UTC day, so the first client render agrees with it.
			today: string
			// Active days (YYYY-MM-DD, UTC), for the popover calendar.
			activeDays: string[]
	  } & StreakStats)

// The toolbar flame (specs/features/streak.md). Derived from saved attempts, never
// stored or estimated, so it can only show what the learner actually did. Signed
// out, or the database unreachable: no numbers at all, and the flame stays neutral.
export async function getStreakSummary(): Promise<StreakSummary> {
	// The same cached read as the contribution graph (one query per request), so the
	// flame, its calendar and the graph are built from identical days.
	const activity = await getActivitySummary()
	if (!activity.authenticated) return { authenticated: false }
	if (!activity.available) return { authenticated: true, available: false }
	const activeDays = activity.days.map((entry) => entry.day)
	return {
		authenticated: true,
		available: true,
		today: activity.today,
		activeDays,
		...computeStreak(activeDays, activity.today)
	}
}
