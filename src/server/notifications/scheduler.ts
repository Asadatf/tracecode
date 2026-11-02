import type { ReminderPlan } from '@/lib/learning/reminder-plan'
import { isRetryableSend, type SendFailure, type SendResult } from '@/server/email/resend'

// The shared daily scheduler (M7.5B), as pure orchestration over injected
// dependencies — so duplicate runs, concurrent runs, crash recovery, provider
// errors, and "zero AI calls" are unit-tested with fakes. The Prisma/Resend
// wiring lives in `daily-reminders.ts`.
//
// One run, for one UTC date:
//   for each eligible learner (bounded by maxUsers AND a wall-clock deadline):
//     plan ← the CURRENT recommendation (deterministic; cache reused; no AI)
//     in-app ← INSERT … ON CONFLICT DO NOTHING on (user, 'daily:<date>')
//     email  ← claim (user, date, 'email') → send with an idempotency key → record
// The two channels fail independently: an in-app insert error never blocks the
// email, and an email failure never blocks the in-app notification.

export const MAX_DELIVERY_ATTEMPTS = 3
// A 'claimed' row older than this is a crashed run and may be reclaimed. It must
// stay well above the cron route's maxDuration (60 s): the platform kills a run
// long before its claim can look abandoned, so a live claim is never taken over.
export const DELIVERY_CLAIM_TTL_MS = 10 * 60_000
// Sends within one run per claim: the first try plus one immediate retry on a
// transient failure (never on a rate limit). Further tries need a later run.
const SENDS_PER_RUN = 2

export interface DeliverySlot {
	status: string
	attempts: number
	claimedAt: string | null
}

export interface Candidate {
	userId: string
	inAppEnabled: boolean
	emailOptIn: boolean
	// Only present for learners with a preference row and an address on file.
	email: string | null
	unsubscribeToken: string | null
	// Today's state, read with the candidate list so a re-run skips finished
	// learners without planning them. An optimisation only: correctness comes from
	// the unique insert and the atomic claim, which re-check at write time.
	inAppDoneToday: boolean
	emailSlot: DeliverySlot | null
}

// Whether today's email slot could still be claimed: no row yet, a retryable
// row, or a crashed claim past the TTL — and attempts remain.
export function emailSlotOpen(slot: DeliverySlot | null, now: Date): boolean {
	if (slot == null) return true
	if (slot.attempts >= MAX_DELIVERY_ATTEMPTS) return false
	if (slot.status === 'retry') return true
	if (slot.status !== 'claimed') return false
	const claimedAt = slot.claimedAt == null ? 0 : Date.parse(slot.claimedAt)
	return now.getTime() - claimedAt >= DELIVERY_CLAIM_TTL_MS
}

export interface PlannedReminder {
	plan: ReminderPlan
	problemTitle: string
}

export interface EmailChannel {
	// Atomically take the (user, date, 'email') slot. Null = another run owns it,
	// it is already done, or its attempts are exhausted. The first claim freezes
	// `reminder` into the slot; every later claim of the same slot returns that
	// frozen copy, so every send under one idempotency key carries the SAME
	// payload (Resend rejects a reused key with a different body instead of
	// replaying the original response).
	claim(
		userId: string,
		date: string,
		now: Date,
		reminder: PlannedReminder
	): Promise<{ attempts: number; reminder: PlannedReminder } | null>
	send(input: {
		to: string
		reminder: PlannedReminder
		unsubscribeToken: string
		idempotencyKey: string
	}): Promise<SendResult>
	markAccepted(userId: string, date: string, providerMessageId: string): Promise<void>
	markRetry(userId: string, date: string, code: SendFailure): Promise<void>
	markFailed(userId: string, date: string, code: SendFailure): Promise<void>
}

export interface SchedulerDeps {
	now: Date
	// Epoch ms after which no NEW learner is started (keeps within maxDuration).
	deadlineMs: number
	maxUsers: number
	clock?: () => number
	candidates(): Promise<Candidate[]>
	planFor(userId: string): Promise<PlannedReminder | null>
	inApp: { create(userId: string, logicalKey: string, plan: ReminderPlan): Promise<boolean> }
	// Null when email isn't configured (see resolveEmailConfig) — the channel is
	// then skipped entirely and no slot is claimed.
	email: EmailChannel | null
}

export interface RunSummary {
	date: string
	candidates: number
	processed: number
	// Learners with nothing left to do today (finished earlier, or every channel off).
	skipped: number
	// True when the budget ran out before every candidate was processed. The run
	// is idempotent, so re-invoking it the same UTC day continues the work.
	truncated: boolean
	noPlan: number
	planErrors: number
	inApp: { created: number; duplicate: number; failed: number; disabled: number }
	email: {
		configured: boolean
		accepted: number
		notClaimed: number
		retry: number
		failed: number
		notOptedIn: number
		noAddress: number
		rateLimitedStop: boolean
	}
}

export function utcDate(now: Date): string {
	return now.toISOString().slice(0, 10)
}

export function dailyLogicalKey(date: string): string {
	return `daily:${date}`
}

export function emailIdempotencyKey(userId: string, date: string): string {
	return `reminder:${userId}:${date}`
}

// Deterministic per-day rotation of the candidate list, so a run truncated by
// its budget doesn't starve the same learners at the end of the list every day.
export function rotateForDate<T>(items: readonly T[], date: string): T[] {
	if (items.length === 0) return []
	const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
	const offset = ((day % items.length) + items.length) % items.length
	return [...items.slice(offset), ...items.slice(0, offset)]
}

export async function runScheduler(deps: SchedulerDeps): Promise<RunSummary> {
	const clock = deps.clock ?? Date.now
	const date = utcDate(deps.now)
	const summary: RunSummary = {
		date,
		candidates: 0,
		processed: 0,
		skipped: 0,
		truncated: false,
		noPlan: 0,
		planErrors: 0,
		inApp: { created: 0, duplicate: 0, failed: 0, disabled: 0 },
		email: {
			configured: deps.email != null,
			accepted: 0,
			notClaimed: 0,
			retry: 0,
			failed: 0,
			notOptedIn: 0,
			noAddress: 0,
			rateLimitedStop: false
		}
	}

	const candidates = rotateForDate(await deps.candidates(), date)
	summary.candidates = candidates.length

	for (const candidate of candidates) {
		const wantsInApp = candidate.inAppEnabled && !candidate.inAppDoneToday
		const wantsEmail =
			deps.email != null && candidate.emailOptIn && emailSlotOpen(candidate.emailSlot, deps.now)
		if (!wantsInApp && !wantsEmail) {
			// Nothing to do: costs no planning and doesn't count against the budget,
			// which is what lets a re-run the same day pick up where one stopped.
			summary.skipped += 1
			if (!candidate.inAppEnabled) summary.inApp.disabled += 1
			continue
		}
		if (summary.processed >= deps.maxUsers || clock() >= deps.deadlineMs) {
			summary.truncated = true
			break
		}
		summary.processed += 1

		let reminder: PlannedReminder | null
		try {
			reminder = await deps.planFor(candidate.userId)
		} catch {
			summary.planErrors += 1
			continue
		}
		if (reminder == null) {
			// e.g. the recommendation points at a problem the catalog no longer has.
			summary.noPlan += 1
			continue
		}

		await deliverInApp(deps, candidate, reminder, date, summary)
		await deliverEmail(deps, candidate, reminder, date, summary)
	}
	return summary
}

async function deliverInApp(
	deps: SchedulerDeps,
	candidate: Candidate,
	reminder: PlannedReminder,
	date: string,
	summary: RunSummary
): Promise<void> {
	if (!candidate.inAppEnabled) {
		summary.inApp.disabled += 1
		return
	}
	if (candidate.inAppDoneToday) {
		summary.inApp.duplicate += 1
		return
	}
	try {
		const created = await deps.inApp.create(candidate.userId, dailyLogicalKey(date), reminder.plan)
		if (created) summary.inApp.created += 1
		else summary.inApp.duplicate += 1
	} catch {
		summary.inApp.failed += 1
	}
}

async function deliverEmail(
	deps: SchedulerDeps,
	candidate: Candidate,
	reminder: PlannedReminder,
	date: string,
	summary: RunSummary
): Promise<void> {
	const email = deps.email
	if (email == null || summary.email.rateLimitedStop) return
	if (!candidate.emailOptIn) {
		summary.email.notOptedIn += 1
		return
	}
	if (candidate.email == null || candidate.unsubscribeToken == null) {
		summary.email.noAddress += 1
		return
	}
	if (!emailSlotOpen(candidate.emailSlot, deps.now)) {
		summary.email.notClaimed += 1
		return
	}

	try {
		for (let send = 0; send < SENDS_PER_RUN; send += 1) {
			const claim = await email.claim(candidate.userId, date, deps.now, reminder)
			if (claim == null) {
				// First pass: someone else owns it, or it's done/exhausted. A null on the
				// retry pass means the bound was hit after markRetry below.
				if (send === 0) summary.email.notClaimed += 1
				return
			}
			const result = await email.send({
				to: candidate.email,
				reminder: claim.reminder,
				unsubscribeToken: candidate.unsubscribeToken,
				idempotencyKey: emailIdempotencyKey(candidate.userId, date)
			})
			if (result.ok) {
				await email.markAccepted(candidate.userId, date, result.id)
				summary.email.accepted += 1
				return
			}
			const exhausted = claim.attempts >= MAX_DELIVERY_ATTEMPTS
			if (!isRetryableSend(result.reason) || exhausted) {
				await email.markFailed(candidate.userId, date, result.reason)
				summary.email.failed += 1
				return
			}
			await email.markRetry(candidate.userId, date, result.reason)
			if (result.reason === 'rate_limited') {
				// Circuit breaker: stop emailing for the rest of this run.
				summary.email.rateLimitedStop = true
				summary.email.retry += 1
				return
			}
			if (send === SENDS_PER_RUN - 1) summary.email.retry += 1
		}
	} catch {
		// A ledger write failed mid-flight. The slot stays 'claimed' and is
		// recoverable after DELIVERY_CLAIM_TTL_MS; the idempotency key keeps a later
		// re-send from duplicating an email Resend already accepted.
		summary.email.failed += 1
	}
}
