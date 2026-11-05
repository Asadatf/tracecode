import { PROBLEMS } from '@/lib/trace/problems'
import { parseReminderPlan, practicePath, reminderCopy } from '@/lib/learning/reminder-plan'
import {
	CHALLENGE_RESULT_KIND,
	challengeResultCopy,
	parseChallengeResult
} from '@/lib/challenge/notification'
import {
	REVIEW_REMINDER_KIND,
	parseReviewReminder,
	reviewReminderCopy
} from '@/lib/reviews/review-reminder'

// Prisma argument builders for the in-app inbox and preferences (M7.5B), in the
// same style as code-feature-queries.ts: plain objects, no client import, so the
// OWNERSHIP of every read and write is unit-tested — each builder takes the
// session user id and puts it in the WHERE clause, and none accepts a user id
// from anywhere else.

export const NOTIFICATION_LIST_LIMIT = 20

export function listNotificationsQuery(userId: string) {
	return {
		where: { userId },
		orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
		take: NOTIFICATION_LIST_LIMIT,
		select: { id: true, kind: true, payload: true, readAt: true, createdAt: true }
	}
}

export function unreadCountQuery(userId: string) {
	return { where: { userId, readAt: null } }
}

// Conditional: only the caller's own, only while unread. Another learner's id
// matches nothing, so `count: 0` reveals nothing about whether it exists.
export function markReadQuery(userId: string, notificationId: string, now: Date) {
	return { where: { id: notificationId, userId, readAt: null }, data: { readAt: now } }
}

export function markAllReadQuery(userId: string, now: Date) {
	return { where: { userId, readAt: null }, data: { readAt: now } }
}

// 32 random bytes, base64url, unpadded = exactly 43 characters.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/
export function isWellFormedUnsubscribeToken(token: unknown): token is string {
	return typeof token === 'string' && TOKEN_SHAPE.test(token)
}

// Turns email OFF for the one learner holding this token. Never turns anything
// on, never touches in-app, and never needs a session.
export function unsubscribeQuery(token: string) {
	return { where: { unsubscribeToken: token }, data: { emailOptIn: false } }
}

export interface PreferenceInput {
	inAppEnabled?: boolean
	emailOptIn?: boolean
}

export function upsertPreferencesQuery(userId: string, newToken: string, input: PreferenceInput) {
	return {
		where: { userId },
		// Defaults: in-app ON, email OFF (explicit opt-in).
		create: {
			userId,
			unsubscribeToken: newToken,
			inAppEnabled: input.inAppEnabled ?? true,
			emailOptIn: input.emailOptIn ?? false
		},
		update: {
			...(input.inAppEnabled === undefined ? {} : { inAppEnabled: input.inAppEnabled }),
			...(input.emailOptIn === undefined ? {} : { emailOptIn: input.emailOptIn })
		}
	}
}

export interface NotificationView {
	id: string
	title: string
	body: string
	concept: string | null
	href: string
	cta: string
	createdAt: string
	read: boolean
}

// Renders a stored notification. A payload that doesn't parse, or names a problem
// the catalog no longer has, becomes a neutral pointer to Overview — never a
// link to a practice page that would 404.
export function toNotificationView(row: {
	id: string
	// The notification's kind; absent for older callers, which means a daily reminder.
	kind?: string
	payload: unknown
	readAt: Date | null
	createdAt: Date
}): NotificationView {
	const base = { id: row.id, createdAt: row.createdAt.toISOString(), read: row.readAt != null }
	if (row.kind === CHALLENGE_RESULT_KIND) {
		const result = parseChallengeResult(row.payload)
		if (result == null) {
			return {
				...base,
				title: 'Your daily challenge result is ready',
				body: 'Open the daily challenge to see how it went.',
				concept: null,
				href: '/problems',
				cta: 'Open problems'
			}
		}
		const titles = Object.fromEntries(Object.values(PROBLEMS).map((p) => [p.slug, p.title]))
		return { ...base, ...challengeResultCopy(result, titles) }
	}
	if (row.kind === REVIEW_REMINDER_KIND) {
		const reminder = parseReviewReminder(row.payload)
		if (reminder == null) {
			return {
				...base,
				title: 'Reviews due',
				body: 'Your overview lists the problems due for review.',
				concept: null,
				href: '/dashboard',
				cta: 'Open overview'
			}
		}
		const titles = Object.fromEntries(Object.values(PROBLEMS).map((p) => [p.slug, p.title]))
		const concepts = Object.fromEntries(
			Object.values(PROBLEMS).map((p) => [p.slug, p.conceptTags[0]])
		)
		return { ...base, ...reviewReminderCopy(reminder, titles, concepts) }
	}
	const plan = parseReminderPlan(row.payload)
	const problem = plan ? PROBLEMS[plan.problemSlug] : undefined
	if (plan == null || problem == null) {
		return {
			...base,
			title: 'Practice reminder',
			body: 'Your overview has today’s recommendation.',
			concept: null,
			href: '/dashboard',
			cta: 'Open overview'
		}
	}
	const copy = reminderCopy(plan, problem.title)
	return { ...base, ...copy, href: practicePath(plan.problemSlug) }
}
