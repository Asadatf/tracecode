import { z } from 'zod'
import { REVIEW_STAGES } from './review-schedule'
import { topicLabel } from '../home/problem-rows'

// The due-review reminder (M9C): one small, versioned, enum-only payload shared by the
// in-app notification and the email, so they can never disagree. It is a SEPARATE
// kind from the daily practice suggestion (`daily_reminder`): its own notification
// kind and key, and its own email delivery channel, so neither can crowd out or
// duplicate the other. Pure; the words state what the records show (which reviews are
// due), never a judgement about what the learner knows or will remember.

export const REVIEW_REMINDER_KIND = 'review_due'
export const REVIEW_EMAIL_CHANNEL = 'email_review'
export const REVIEW_REMINDER_VERSION = 1 as const
// Named in the message; the rest are summarised as a count.
export const MAX_ITEMS_NAMED = 3

export function reviewLogicalKey(date: string): string {
	return `review:${date}`
}

export const reviewReminderSchema = z
	.object({
		v: z.literal(REVIEW_REMINDER_VERSION),
		// Every unannounced due review, not only the ones named.
		total: z.number().int().min(1).max(100_000),
		items: z
			.array(
				z
					.object({
						problemSlug: z.string().min(1).max(100),
						stage: z.number().int().min(1).max(REVIEW_STAGES)
					})
					.strict()
			)
			.min(1)
			.max(MAX_ITEMS_NAMED)
	})
	.strict()
export type ReviewReminder = z.infer<typeof reviewReminderSchema>

export interface DueItem {
	problemSlug: string
	// Reviews done so far (0..2) — the pending stage is reviewsDone + 1.
	reviewsDone: number
	dueDay: string
}

// The payload for a learner's unannounced due reviews, most overdue first. Null when
// there is nothing to announce.
export function buildReviewReminder(due: readonly DueItem[]): ReviewReminder | null {
	if (due.length === 0) return null
	const sorted = [...due].sort(
		(a, b) => a.dueDay.localeCompare(b.dueDay) || a.problemSlug.localeCompare(b.problemSlug)
	)
	return {
		v: REVIEW_REMINDER_VERSION,
		total: sorted.length,
		items: sorted.slice(0, MAX_ITEMS_NAMED).map((item) => ({
			problemSlug: item.problemSlug,
			stage: Math.min(REVIEW_STAGES, item.reviewsDone + 1)
		}))
	}
}

export function parseReviewReminder(value: unknown): ReviewReminder | null {
	const parsed = reviewReminderSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}

export interface ReviewReminderCopy {
	title: string
	body: string
	concept: string | null
	cta: string
	// A single review links straight to its problem; several go to the Overview queue.
	href: string
}

// `titles` maps a slug to its catalogue title; `concepts` to its first concept tag.
export function reviewReminderCopy(
	reminder: ReviewReminder,
	titles: Readonly<Record<string, string | undefined>>,
	concepts: Readonly<Record<string, string | undefined>> = {}
): ReviewReminderCopy {
	const first = reminder.items[0]
	const firstTitle = first == null ? undefined : titles[first.problemSlug]
	if (reminder.total === 1 && first != null && firstTitle != null) {
		const tag = concepts[first.problemSlug]
		return {
			title: `Review ${firstTitle}`,
			body: `Review ${first.stage} of ${REVIEW_STAGES} for ${firstTitle} is due. Solve it again from a fresh start to complete it.`,
			concept: tag == null ? null : `Topic: ${topicLabel(tag)}`,
			cta: `Start review`,
			href: `/practice/${encodeURIComponent(first.problemSlug)}`
		}
	}
	const named = reminder.items
		.map((item) => titles[item.problemSlug])
		.filter((title): title is string => title != null)
	const more = reminder.total - named.length
	return {
		title: `${reminder.total} problems are due for review`,
		body:
			named.length === 0
				? `You have ${reminder.total} reviews due.`
				: `Due: ${named.join(', ')}${more > 0 ? `, and ${more} more` : ''}. Solve each again from a fresh start to complete its review.`,
		concept: null,
		cta: 'Open your reviews',
		href: '/dashboard'
	}
}
