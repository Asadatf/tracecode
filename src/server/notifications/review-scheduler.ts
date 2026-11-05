import {
	buildReviewReminder,
	type DueItem,
	type ReviewReminder
} from '@/lib/reviews/review-reminder'
import { isRetryableSend, type SendFailure, type SendResult } from '@/server/email/resend'
import {
	MAX_DELIVERY_ATTEMPTS,
	emailSlotOpen,
	rotateForDate,
	utcDate,
	type DeliverySlot
} from './scheduler'

// The due-review reminder run (M9C), as pure orchestration over injected dependencies
// so duplicate runs, retries, preferences and failures are tested with fakes. It is a
// sibling of the daily reminder scheduler (./scheduler.ts), not a replacement: it
// reuses that file's slot, retry and rotation rules and the same two ledgers, under
// its own notification kind and its own email channel, so it never shares a slot with
// (or duplicates) the daily practice suggestion.
//
// For each learner with due reviews that have not been announced:
//   in-app  <- INSERT ... ON CONFLICT DO NOTHING on (user, 'review:<date>')
//   email   <- claim (user, date, 'email_review') -> send with an idempotency key
//   then mark the announced reviews as reminded, so each stage is announced once and
//   the next run stops mentioning them; a stage that is completed or rescheduled
//   before a retry is simply no longer announced.
// A retryable email failure leaves the reviews unmarked, so the next run continues.

const SENDS_PER_RUN = 2

export interface ReviewCandidate {
	userId: string
	inAppEnabled: boolean
	emailOptIn: boolean
	email: string | null
	unsubscribeToken: string | null
	// Today's 'review:<date>' in-app notification already exists.
	inAppDoneToday: boolean
	emailSlot: DeliverySlot | null
	// Pending, due and not yet announced, as read at the start of the run.
	due: DueItem[]
}

export interface ReviewEmailChannel {
	claim(
		userId: string,
		date: string,
		now: Date,
		reminder: ReviewReminder
	): Promise<{ attempts: number; reminder: ReviewReminder } | null>
	send(input: {
		to: string
		reminder: ReviewReminder
		unsubscribeToken: string
		idempotencyKey: string
	}): Promise<SendResult>
	markAccepted(userId: string, date: string, providerMessageId: string): Promise<void>
	markRetry(userId: string, date: string, code: SendFailure): Promise<void>
	markFailed(userId: string, date: string, code: SendFailure): Promise<void>
	markSkipped(userId: string, date: string, code: string): Promise<void>
}

export interface ReviewSchedulerDeps {
	now: Date
	deadlineMs: number
	maxUsers: number
	clock?: () => number
	candidates(): Promise<ReviewCandidate[]>
	// Of these reviews, which are still pending AND due right now (a completed or
	// rescheduled review is dropped). Used before an email retry re-sends a frozen
	// payload, so a finished review is never announced again.
	stillDue(userId: string, items: readonly DueItem[]): Promise<DueItem[]>
	inApp: { create(userId: string, logicalKey: string, reminder: ReviewReminder): Promise<boolean> }
	markReminded(userId: string, items: readonly DueItem[], at: Date): Promise<void>
	// Null when email isn't configured: the channel is skipped, which is not a failure.
	email: ReviewEmailChannel | null
}

export interface ReviewRunSummary {
	date: string
	candidates: number
	processed: number
	skipped: number
	truncated: boolean
	inApp: { created: number; duplicate: number; failed: number; disabled: number }
	email: {
		configured: boolean
		accepted: number
		notClaimed: number
		retry: number
		failed: number
		skipped: number
		notOptedIn: number
		noAddress: number
		rateLimitedStop: boolean
	}
	reminded: number
}

export function reviewEmailIdempotencyKey(userId: string, date: string): string {
	return `review-reminder:${userId}:${date}`
}

// 'delivered' | 'pending' (will be retried by a later run) | 'failed' (terminal) | 'none'
type Channel = 'delivered' | 'pending' | 'failed' | 'none'

export async function runReviewScheduler(deps: ReviewSchedulerDeps): Promise<ReviewRunSummary> {
	const clock = deps.clock ?? Date.now
	const date = utcDate(deps.now)
	const summary: ReviewRunSummary = {
		date,
		candidates: 0,
		processed: 0,
		skipped: 0,
		truncated: false,
		inApp: { created: 0, duplicate: 0, failed: 0, disabled: 0 },
		email: {
			configured: deps.email != null,
			accepted: 0,
			notClaimed: 0,
			retry: 0,
			failed: 0,
			skipped: 0,
			notOptedIn: 0,
			noAddress: 0,
			rateLimitedStop: false
		},
		reminded: 0
	}

	const candidates = rotateForDate(await deps.candidates(), date)
	summary.candidates = candidates.length

	for (const candidate of candidates) {
		const wantsInApp = candidate.inAppEnabled
		const wantsEmail =
			deps.email != null && candidate.emailOptIn && emailSlotOpen(candidate.emailSlot, deps.now)
		if (!wantsInApp && !wantsEmail) {
			summary.skipped += 1
			if (!candidate.inAppEnabled) summary.inApp.disabled += 1
			continue
		}
		if (summary.processed >= deps.maxUsers || clock() >= deps.deadlineMs) {
			summary.truncated = true
			break
		}
		summary.processed += 1

		const reminder = buildReviewReminder(candidate.due)
		if (reminder == null) continue

		const inApp = await deliverInApp(deps, candidate, reminder, date, summary)
		const email = await deliverEmail(deps, candidate, reminder, date, summary)

		// Announced once nothing is left to retry and at least one channel was tried.
		const attempted = [inApp, email].some((c) => c === 'delivered' || c === 'failed')
		const pending = [inApp, email].includes('pending')
		if (attempted && !pending) {
			try {
				await deps.markReminded(candidate.userId, candidate.due, deps.now)
				summary.reminded += 1
			} catch {
				// Not marked: the next run re-selects them; the unique key keeps it duplicate-free.
			}
		}
	}
	return summary
}

async function deliverInApp(
	deps: ReviewSchedulerDeps,
	candidate: ReviewCandidate,
	reminder: ReviewReminder,
	date: string,
	summary: ReviewRunSummary
): Promise<Channel> {
	if (!candidate.inAppEnabled) {
		summary.inApp.disabled += 1
		return 'none'
	}
	if (candidate.inAppDoneToday) {
		summary.inApp.duplicate += 1
		return 'delivered'
	}
	try {
		const created = await deps.inApp.create(candidate.userId, `review:${date}`, reminder)
		if (created) summary.inApp.created += 1
		else summary.inApp.duplicate += 1
		return 'delivered'
	} catch {
		summary.inApp.failed += 1
		return 'pending'
	}
}

async function deliverEmail(
	deps: ReviewSchedulerDeps,
	candidate: ReviewCandidate,
	reminder: ReviewReminder,
	date: string,
	summary: ReviewRunSummary
): Promise<Channel> {
	const email = deps.email
	if (email == null || summary.email.rateLimitedStop) return 'none'
	if (!candidate.emailOptIn) {
		summary.email.notOptedIn += 1
		return 'none'
	}
	if (candidate.email == null || candidate.unsubscribeToken == null) {
		summary.email.noAddress += 1
		return 'none'
	}
	if (!emailSlotOpen(candidate.emailSlot, deps.now)) {
		summary.email.notClaimed += 1
		// An accepted/failed slot is finished; a slot someone else holds is not ours to judge.
		return candidate.emailSlot?.status === 'accepted' ? 'delivered' : 'none'
	}

	try {
		for (let send = 0; send < SENDS_PER_RUN; send += 1) {
			const claim = await email.claim(candidate.userId, date, deps.now, reminder)
			if (claim == null) {
				if (send === 0) summary.email.notClaimed += 1
				return 'none'
			}
			// The claim may hand back a payload frozen by an earlier try. If every review
			// in it has since been completed or rescheduled, do not announce it.
			const frozenDue: DueItem[] = candidate.due.filter((item) =>
				claim.reminder.items.some((named) => named.problemSlug === item.problemSlug)
			)
			const live = await deps.stillDue(candidate.userId, frozenDue)
			if (live.length === 0) {
				await email.markSkipped(candidate.userId, date, 'no_longer_due')
				summary.email.skipped += 1
				return 'none'
			}
			const result = await email.send({
				to: candidate.email,
				reminder: claim.reminder,
				unsubscribeToken: candidate.unsubscribeToken,
				idempotencyKey: reviewEmailIdempotencyKey(candidate.userId, date)
			})
			if (result.ok) {
				await email.markAccepted(candidate.userId, date, result.id)
				summary.email.accepted += 1
				return 'delivered'
			}
			const exhausted = claim.attempts >= MAX_DELIVERY_ATTEMPTS
			if (!isRetryableSend(result.reason) || exhausted) {
				await email.markFailed(candidate.userId, date, result.reason)
				summary.email.failed += 1
				return 'failed'
			}
			await email.markRetry(candidate.userId, date, result.reason)
			if (result.reason === 'rate_limited') {
				summary.email.rateLimitedStop = true
				summary.email.retry += 1
				return 'pending'
			}
			if (send === SENDS_PER_RUN - 1) {
				summary.email.retry += 1
				return 'pending'
			}
		}
		return 'pending'
	} catch {
		summary.email.failed += 1
		return 'pending'
	}
}
