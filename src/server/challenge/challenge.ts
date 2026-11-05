import 'server-only'
import { cache } from 'react'
import { after } from 'next/server'
import { db } from '@/server/db/client'
import { currentLearnerId, currentUserIdSafe } from '@/server/auth/session'
import { captureError } from '@/lib/observability/capture-error'
import { resolveChallenge, type ChallengeLookup } from '@/lib/challenge/assignment'
import {
	GRADING_CLAIM_TTL_MS,
	MAX_GRADING_TRIES,
	gradeAttempt,
	startAttempt,
	submitAttempt,
	toAttemptView,
	type AttemptView
} from '@/lib/challenge/service'
import { utcDay } from '@/lib/streak/streak'
import { dayColumn } from '@/lib/reviews/review-queries'
import { ELIGIBLE_SLUGS } from './hidden-suites'
import { attemptStore, catalogStore } from './store'
import { activeGrader } from './grade'

// Server entry points for the daily challenge (specs/features/daily-challenge.md).
// The learner is always the validated session's; no request input is ever a user id.

export const today = (): string => utcDay(new Date())

export async function getChallenge(rawDate: string): Promise<ChallengeLookup> {
	try {
		return await resolveChallenge(catalogStore, rawDate, today(), ELIGIBLE_SLUGS)
	} catch (error) {
		captureError(error, { area: 'challenge-lookup' })
		return { status: 'unavailable' }
	}
}

// Every pinned challenge up to today, for the calendar's titles. Future dates are never
// pinned, so nothing about them can leak from here.
export const getPinnedChallenges = cache(async (): Promise<Record<string, string>> => {
	try {
		const rows = await db.dailyChallenge.findMany({
			where: { challengeDate: { lte: dayColumn(today()) } },
			select: { challengeDate: true, problemSlug: true },
			orderBy: { challengeDate: 'desc' },
			take: 800
		})
		return Object.fromEntries(
			rows.map((r) => [r.challengeDate.toISOString().slice(0, 10), r.problemSlug])
		)
	} catch (error) {
		captureError(error, { area: 'challenge-pinned' })
		return {}
	}
})

export type MyAttempt = { available: false } | { available: true; view: AttemptView | null }

export async function getMyAttempt(userId: string, date: string): Promise<MyAttempt> {
	try {
		const row = await attemptStore.find(userId, date)
		return { available: true, view: row == null ? null : toAttemptView(row, new Date()) }
	} catch (error) {
		captureError(error, { area: 'challenge-attempt' })
		return { available: false }
	}
}

// Grading runs AFTER the response, so a submit returns at once. With no grader (the
// default) this does nothing and the submission simply waits: it is never scored.
function gradeLater(userId: string, date: string, problemSlug: string): void {
	after(async () => {
		try {
			await gradeAttempt(attemptStore, await activeGrader(), userId, date, problemSlug, new Date())
		} catch (error) {
			captureError(error, { area: 'challenge-grading' })
		}
	})
}

export type ChallengeActionResult =
	| { ok: true; view: AttemptView }
	| {
			ok: false
			error:
				| 'unauthenticated'
				| 'not_found'
				| 'not_live'
				| 'not_started'
				| 'empty'
				| 'too_large'
				| 'unavailable'
	  }

type Live =
	| { ok: true; challenge: { date: string; problemSlug: string } }
	| { ok: false; error: 'not_found' | 'not_live' | 'unavailable' }

async function liveChallenge(rawDate: string): Promise<Live> {
	const lookup = await getChallenge(rawDate)
	if (
		lookup.status === 'invalid' ||
		lookup.status === 'locked' ||
		lookup.status === 'before_launch'
	)
		return { ok: false, error: 'not_found' }
	if (lookup.status === 'unavailable') return { ok: false, error: 'unavailable' }
	// Only the current UTC day's challenge is competitive; a past day is practice only.
	if (lookup.kind !== 'live') return { ok: false, error: 'not_live' }
	return { ok: true, challenge: { date: lookup.date, problemSlug: lookup.problemSlug } }
}

export async function startChallenge(rawDate: string): Promise<ChallengeActionResult> {
	// A write to a table that references users: ensure the users row exists first.
	const userId = await currentLearnerId()
	if (userId == null) return { ok: false, error: 'unauthenticated' }
	const found = await liveChallenge(rawDate)
	if (!found.ok) return { ok: false, error: found.error }
	const outcome = await startAttempt(attemptStore, userId, found.challenge.date, new Date())
	if (!outcome.ok) return { ok: false, error: 'unavailable' }
	return { ok: true, view: toAttemptView(outcome.attempt, new Date()) }
}

export async function submitChallenge(
	rawDate: string,
	source: string
): Promise<ChallengeActionResult> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { ok: false, error: 'unauthenticated' }
	// NOT restricted to the live day: an attempt started at 23:50 UTC has until 00:20, and
	// its final submission must still be judged by its own server-recorded deadline.
	const lookup = await getChallenge(rawDate)
	if (
		lookup.status === 'invalid' ||
		lookup.status === 'locked' ||
		lookup.status === 'before_launch'
	)
		return { ok: false, error: 'not_found' }
	if (lookup.status === 'unavailable') return { ok: false, error: 'unavailable' }
	const now = new Date()
	const outcome = await submitAttempt(attemptStore, userId, lookup.date, source, now)
	if (!outcome.ok) return { ok: false, error: outcome.error }
	if (outcome.accepted) gradeLater(userId, lookup.date, lookup.problemSlug)
	return { ok: true, view: toAttemptView(outcome.attempt, now) }
}

// The polled status. A submission that is still waiting (or whose grading failed) is
// re-triggered here, which is the recovery path for a grader error or a crashed worker.
export async function challengeStatus(rawDate: string): Promise<ChallengeActionResult> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { ok: false, error: 'unauthenticated' }
	const lookup = await getChallenge(rawDate)
	if (lookup.status !== 'ok') return { ok: false, error: 'not_found' }
	const row = await attemptStore.find(userId, lookup.date)
	if (row == null) return { ok: false, error: 'not_started' }
	if (row.status === 'submitted' || row.status === 'grader_error' || row.status === 'grading') {
		gradeLater(userId, lookup.date, lookup.problemSlug)
	}
	return { ok: true, view: toAttemptView(row, new Date()) }
}

// Retries submissions that are still waiting (never graded, a grader error, or a worker
// that died mid-grade), so an outage or a closed tab does not leave a verified result
// undone. Called from the daily cron; with no grader configured it does nothing.
export async function gradePendingAttempts(limit = 20): Promise<{ attempted: number }> {
	const grader = await activeGrader()
	if (grader == null) return { attempted: 0 }
	const now = new Date()
	const rows = await db.challengeAttempt.findMany({
		where: {
			OR: [
				{ status: 'submitted' },
				// An attempt the grader has given up on is left alone (it would only fill the batch).
				{
					status: 'grader_error',
					OR: [{ gradeError: null }, { NOT: { gradeError: { endsWith: `#${MAX_GRADING_TRIES}` } } }]
				},
				{
					status: 'grading',
					gradingClaimedAt: { lt: new Date(now.getTime() - GRADING_CLAIM_TTL_MS) }
				}
			]
		},
		orderBy: { submittedAt: 'asc' },
		take: limit,
		select: { userId: true, challengeDate: true, challenge: { select: { problemSlug: true } } }
	})
	for (const row of rows) {
		await gradeAttempt(
			attemptStore,
			grader,
			row.userId,
			row.challengeDate.toISOString().slice(0, 10),
			row.challenge.problemSlug,
			new Date()
		)
	}
	return { attempted: rows.length }
}
