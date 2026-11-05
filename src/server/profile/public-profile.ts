import 'server-only'
import { cache } from 'react'
import { db } from '@/server/db/client'
import { reportProfileFailure } from './report'
import { readWithColumnFallback } from '@/lib/learning/optional-columns'
import {
	legacyQualifyingRunsCountQuery,
	qualifyingRunsCountQuery
} from '@/lib/activity/activity-query'
import {
	resolvePublicProfile as resolve,
	type ProfileStore,
	type PublicProfileLookup,
	type PublicProfileOwner
} from '@/lib/profile/profile-service'
import { publicProfileLookupQuery } from '@/lib/profile/profile-queries'
import {
	buildPublicProfileStats,
	type PublicProfileStats
} from '@/lib/profile/public-profile-stats'
import { utcDay } from '@/lib/streak/streak'
import { PROBLEMS } from '@/lib/trace/problems'
import { loadActivityDays } from '@/server/learning/activity'

// The public profile's data (specs/features/public-profile-page.md).
//
// Deliberately NO session import: a public profile is about its owner, never about
// whoever is looking. The only way in is `resolvePublicProfile(username)`, which
// finds a PUBLIC owner, and `loadPublicProfileStats(owner)`, which reads that owner's
// data and nothing else. No request input is ever a user id. A source-level test
// forbids this file from importing the session helpers.

// Read-only on purpose: the public path has no way to write, only to look a PUBLIC
// profile up.
const store: Pick<ProfileStore, 'findPublic'> = {
	findPublic: (username) => db.user.findFirst(publicProfileLookupQuery(username))
}

// Cached per request so the page and its metadata share one lookup.
export const resolvePublicProfile = cache((rawUsername: string): Promise<PublicProfileLookup> =>
	resolve(store, rawUsername, (error) => reportProfileFailure('public-profile-lookup', error))
)

export type PublicProfileStatsResult =
	{ status: 'ready'; stats: PublicProfileStats } | { status: 'unavailable' }

// Keyed by the resolved owner's id string so React `cache` can share one read between
// the page and its metadata. Not exported: callers hand over the owner they resolved.
const loadStatsFor = cache(async (userId: string): Promise<PublicProfileStatsResult> => {
	try {
		const today = utcDay(new Date())
		const [progress, days, runs] = await Promise.all([
			db.problemProgress.findMany({
				where: { userId },
				select: {
					problemSlug: true,
					status: true,
					attempts: true,
					bestTestsPassed: true,
					testsTotal: true,
					firstSolvedAt: true,
					latestSolvedAt: true,
					updatedAt: true
				}
			}),
			loadActivityDays(userId, today),
			readWithColumnFallback(
				'meaningful',
				() => db.attempt.count(qualifyingRunsCountQuery(userId)),
				() => db.attempt.count(legacyQualifyingRunsCountQuery(userId))
			)
		])
		return {
			status: 'ready',
			stats: buildPublicProfileStats({
				problems: Object.values(PROBLEMS),
				progress: progress.map((row) => ({
					problemSlug: row.problemSlug,
					status: row.status,
					attempts: row.attempts,
					bestTestsPassed: row.bestTestsPassed,
					testsTotal: row.testsTotal,
					firstSolvedAt: row.firstSolvedAt?.toISOString() ?? null,
					latestSolvedAt: row.latestSolvedAt?.toISOString() ?? null,
					lastAttemptAt: row.updatedAt.toISOString()
				})),
				days,
				runs,
				today
			})
		}
	} catch (error) {
		reportProfileFailure('public-profile-stats', error)
		return { status: 'unavailable' }
	}
})

export function loadPublicProfileStats(
	owner: PublicProfileOwner
): Promise<PublicProfileStatsResult> {
	return loadStatsFor(owner.userId)
}

export type { PublicProfileLookup, PublicProfileOwner }
