import 'server-only'
import { cache } from 'react'
import { db } from '@/server/db/client'
import { currentUserIdSafe } from '@/server/auth/session'
import { captureError } from '@/lib/observability/capture-error'
import { planConsent } from '@/lib/challenge/consent'
import {
	buildSnapshot,
	buildWeekBoard,
	type PublicEntry,
	type PrivateRank,
	type WeekUser
} from '@/lib/challenge/leaderboard'
import { LEADERBOARD_SIZE, type VerifiedAttemptRow } from '@/lib/challenge/scoring'
import { isIsoDate, isWeekClosed, shouldArchiveWeek, weekStartOf } from '@/lib/challenge/week'
import { dayColumn } from '@/lib/reviews/review-queries'
import { utcDay } from '@/lib/streak/streak'

// The weekly leaderboard reads (specs/features/daily-challenge.md § Leaderboard).
// Only GRADED attempts — scores the server grader verified — are ever read. Nothing
// here selects an email, source code or an id that leaves the server.

const day = (d: Date) => d.toISOString().slice(0, 10)

async function weekUsers(weekStart: string): Promise<WeekUser[]> {
	const attempts = await db.challengeAttempt.findMany({
		where: { weekStart: dayColumn(weekStart), status: 'graded' },
		select: {
			userId: true,
			challengeDate: true,
			testsPassed: true,
			testsTotal: true,
			score: true,
			elapsedMs: true,
			submittedAt: true,
			user: { select: { username: true, leaderboardOptIn: true, profileVisibility: true } }
		}
	})
	const byUser = new Map<string, WeekUser & { rows: VerifiedAttemptRow[] }>()
	for (const a of attempts) {
		// A graded row always carries its verified numbers; skip anything incomplete.
		if (a.testsPassed == null || a.testsTotal == null || a.score == null || a.elapsedMs == null)
			continue
		let user = byUser.get(a.userId)
		if (user == null) {
			user = {
				userId: a.userId,
				username: a.user.username,
				optedIn: a.user.leaderboardOptIn,
				profilePublic: a.user.profileVisibility === 'PUBLIC',
				rows: []
			}
			byUser.set(a.userId, user)
		}
		user.rows.push({
			key: a.userId,
			challengeDate: day(a.challengeDate),
			testsPassed: a.testsPassed,
			testsTotal: a.testsTotal,
			score: a.score,
			elapsedMs: a.elapsedMs,
			submittedAt: (a.submittedAt ?? a.challengeDate).getTime()
		})
	}
	return [...byUser.values()]
}

export interface LeaderboardView {
	available: boolean
	weekStart: string
	currentWeek: string
	// Closed weeks that have an archived standing, newest first.
	archivedWeeks: string[]
	basis: 'live' | 'archive'
	entries: PublicEntry[]
	competitors: number
	you: PrivateRank | null
}

export const getLeaderboard = cache(
	async (requestedWeek: string | null): Promise<LeaderboardView> => {
		const now = new Date()
		const currentWeek = weekStartOf(utcDay(now))
		const weekStart =
			requestedWeek != null && isIsoDate(requestedWeek) && weekStartOf(requestedWeek) <= currentWeek
				? weekStartOf(requestedWeek)
				: currentWeek
		const empty: LeaderboardView = {
			available: false,
			weekStart,
			currentWeek,
			archivedWeeks: [],
			basis: 'live',
			entries: [],
			competitors: 0,
			you: null
		}
		try {
			const viewerId = await currentUserIdSafe()
			const archived = await db.weeklyStanding.findMany({
				distinct: ['weekStart'],
				select: { weekStart: true },
				orderBy: { weekStart: 'desc' },
				take: 26
			})
			const archivedWeeks = archived.map((r) => day(r.weekStart))

			if (isWeekClosed(weekStart, now) && archivedWeeks.includes(weekStart)) {
				const rows = await db.weeklyStanding.findMany({
					where: { weekStart: dayColumn(weekStart), isPublic: true, rank: { not: null } },
					orderBy: [{ rank: 'asc' }, { score: 'desc' }],
					take: LEADERBOARD_SIZE,
					select: {
						rank: true,
						score: true,
						daysSolved: true,
						totalMs: true,
						user: { select: { username: true, profileVisibility: true } }
					}
				})
				const competitors = await db.weeklyStanding.count({
					where: { weekStart: dayColumn(weekStart), isPublic: true }
				})
				const mine =
					viewerId == null
						? null
						: await db.weeklyStanding.findUnique({
								where: { weekStart_userId: { weekStart: dayColumn(weekStart), userId: viewerId } }
							})
				return {
					available: true,
					weekStart,
					currentWeek,
					archivedWeeks,
					basis: 'archive',
					competitors,
					entries: rows.flatMap((r) =>
						r.rank != null && r.user.username != null
							? [
									{
										rank: r.rank,
										username: r.user.username,
										score: r.score,
										daysSolved: r.daysSolved,
										totalMs: r.totalMs,
										profilePath:
											r.user.profileVisibility === 'PUBLIC' ? `/u/${r.user.username}` : null
									}
								]
							: []
					),
					// An archived week only reports a rank for a learner who was listed.
					you:
						mine == null
							? null
							: {
									rank: mine.rank ?? 0,
									competitors,
									score: mine.score,
									daysSolved: mine.daysSolved,
									totalMs: mine.totalMs,
									listed: mine.isPublic
								}
				}
			}

			const board = buildWeekBoard(await weekUsers(weekStart), viewerId)
			return { available: true, weekStart, currentWeek, archivedWeeks, basis: 'live', ...board }
		} catch (error) {
			captureError(error, { area: 'leaderboard' })
			return empty
		}
	}
)

// Freezes every finished, closed week that has verified results and no archive yet.
// Idempotent: the (week, user) primary key and skipDuplicates make a re-run a no-op.
export async function closeFinishedWeeks(now: Date = new Date()): Promise<{ closed: number }> {
	const currentWeek = weekStartOf(utcDay(now))
	const weeks = await db.challengeAttempt.findMany({
		where: { status: 'graded', weekStart: { lt: dayColumn(currentWeek) } },
		distinct: ['weekStart'],
		select: { weekStart: true }
	})
	let closed = 0
	for (const { weekStart } of weeks) {
		const week = day(weekStart)
		const pending = await db.challengeAttempt.count({
			where: {
				weekStart,
				status: { in: ['submitted', 'grading', 'grader_error'] }
			}
		})
		if (!shouldArchiveWeek(week, now, pending)) continue
		if ((await db.weeklyStanding.count({ where: { weekStart } })) > 0) continue
		const rows = buildSnapshot(await weekUsers(week))
		if (rows.length === 0) continue
		await db.weeklyStanding.createMany({
			data: rows.map((r) => ({ ...r, weekStart })),
			skipDuplicates: true
		})
		closed += 1
	}
	return { closed }
}

// ---- Consent ------------------------------------------------------------------------

export type ConsentView =
	| { authenticated: false }
	| { authenticated: true; available: false }
	| { authenticated: true; available: true; optIn: boolean; hasUsername: boolean }

export async function getLeaderboardConsent(): Promise<ConsentView> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { authenticated: false }
	try {
		const row = await db.user.findUnique({
			where: { id: userId },
			select: { leaderboardOptIn: true, username: true }
		})
		return {
			authenticated: true,
			available: true,
			optIn: row?.leaderboardOptIn ?? false,
			hasUsername: row?.username != null
		}
	} catch (error) {
		captureError(error, { area: 'leaderboard-consent' })
		return { authenticated: true, available: false }
	}
}

export type ConsentResult =
	{ saved: true; optIn: boolean } | { saved: false; error: 'unauthenticated' | 'username_required' }

// Only the signed-in owner can change their own consent; the id is never an input.
export async function setLeaderboardOptIn(wanted: boolean): Promise<ConsentResult> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { saved: false, error: 'unauthenticated' }
	const row = await db.user.findUnique({
		where: { id: userId },
		select: { leaderboardOptIn: true, username: true }
	})
	const plan = planConsent(
		{ optIn: row?.leaderboardOptIn ?? false, username: row?.username ?? null },
		wanted
	)
	if (!plan.ok) return { saved: false, error: plan.error }
	if (plan.change != null) {
		await db.user.update({
			where: { id: userId },
			data: { leaderboardOptIn: plan.change },
			select: { id: true }
		})
	}
	return { saved: true, optIn: plan.change ?? row?.leaderboardOptIn ?? false }
}
