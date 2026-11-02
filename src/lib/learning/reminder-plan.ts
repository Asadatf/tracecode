import { z } from 'zod'
import { REASON_CODES, type Recommendation } from './recommend'
import type { RecommendationEvidence } from './recommendation-evidence'

// The shared reminder planner (M7.5B). Turns the learner's CURRENT M7.3
// recommendation into one small, enum-only plan that both channels — the in-app
// notification and the daily email — render from, so they can never disagree.
// Pure and deterministic: no clock (`now` is passed in), no I/O, no AI, no Python.
//
// It decides only the framing. WHICH problem is always the recommendation's top
// pick; the planner never re-ranks, and it refuses (returns null) rather than
// point a learner at a problem the catalog doesn't have.

export const REMINDER_PLAN_VERSION = 1 as const
// A learner whose latest saved attempt is at least this old is "returning".
export const INACTIVE_AFTER_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

export const REMINDER_TEMPLATES = [
	'cold_start', // no saved attempts at all
	'returning', // has history, but the latest attempt is INACTIVE_AFTER_DAYS+ old
	'unfinished', // the pick is attempted-but-unsolved
	'new_problem', // the pick is one they haven't tried, while other work exists
	'revision' // everything is solved; the pick is a revision target
] as const
export type ReminderTemplate = (typeof REMINDER_TEMPLATES)[number]

export const reminderPlanSchema = z
	.object({
		v: z.literal(REMINDER_PLAN_VERSION),
		template: z.enum(REMINDER_TEMPLATES),
		problemSlug: z.string().min(1).max(100),
		reasonCode: z.enum(REASON_CODES),
		conceptTag: z.string().max(60).nullable(),
		// Whole days since the latest saved attempt; set only for 'returning'.
		inactiveDays: z.number().int().min(0).max(100_000).nullable()
	})
	.strict()
export type ReminderPlan = z.infer<typeof reminderPlanSchema>

export interface CatalogProblem {
	slug: string
	title: string
	conceptTags: readonly string[]
}

// The latest attempt time anywhere in the evidence. Each problem's sequence
// window always includes its newest attempt, so the max over all windows is the
// learner's newest attempt overall.
export function latestAttemptAt(evidence: RecommendationEvidence): Date | null {
	let latest: number | null = null
	for (const problem of evidence.problems) {
		for (const item of problem.observed.sequence.items) {
			const t = Date.parse(item.createdAt)
			if (Number.isFinite(t) && (latest == null || t > latest)) latest = t
		}
	}
	return latest == null ? null : new Date(latest)
}

export function planReminder(
	recommendation: Recommendation,
	evidence: RecommendationEvidence,
	catalog: readonly CatalogProblem[],
	now: Date
): ReminderPlan | null {
	const top = recommendation.rankedProblems[0]
	const problem = top ? catalog.find((p) => p.slug === top.slug) : undefined
	// Never point at a problem the catalog doesn't have.
	if (top == null || problem == null) return null

	const conceptTag =
		recommendation.focusConcepts.find((tag) => problem.conceptTags.includes(tag)) ??
		problem.conceptTags[0] ??
		null
	const base = {
		v: REMINDER_PLAN_VERSION,
		problemSlug: top.slug,
		reasonCode: top.reasonCode,
		conceptTag
	}

	if (!evidence.hasActivity || evidence.totals.attempts === 0) {
		return { ...base, template: 'cold_start', inactiveDays: null }
	}
	const latest = latestAttemptAt(evidence)
	if (latest != null) {
		const days = Math.floor((now.getTime() - latest.getTime()) / DAY_MS)
		if (days >= INACTIVE_AFTER_DAYS) return { ...base, template: 'returning', inactiveDays: days }
	}
	const template: ReminderTemplate =
		top.reasonCode === 'solved_revision'
			? 'revision'
			: top.reasonCode === 'not_attempted'
				? 'new_problem'
				: 'unfinished'
	return { ...base, template, inactiveDays: null }
}

export function parseReminderPlan(value: unknown): ReminderPlan | null {
	const parsed = reminderPlanSchema.safeParse(value)
	return parsed.success ? parsed.data : null
}

export function practicePath(slug: string): string {
	return `/practice/${encodeURIComponent(slug)}`
}

export interface ReminderCopy {
	title: string
	body: string
	concept: string | null
	cta: string
}

// The words, from the plan alone. Every sentence states something the records
// show (a status, a count of days) — never a judgement about ability, mastery,
// speed or what the learner "understands".
export function reminderCopy(plan: ReminderPlan, problemTitle: string): ReminderCopy {
	const concept = plan.conceptTag == null ? null : `Concept to focus on: ${plan.conceptTag}`
	switch (plan.template) {
		case 'cold_start':
			return {
				title: 'Ready for your first problem?',
				body: `You haven’t saved an attempt yet. ${problemTitle} is a good place to start.`,
				concept,
				cta: `Start ${problemTitle}`
			}
		case 'returning': {
			const days = plan.inactiveDays ?? INACTIVE_AFTER_DAYS
			return {
				title: 'Pick up where you left off',
				body: `Your last saved attempt was ${days} days ago. Here’s one problem to restart with: ${problemTitle}.`,
				concept,
				cta: `Open ${problemTitle}`
			}
		}
		case 'unfinished':
			return {
				title: `${problemTitle} is still in progress`,
				body:
					plan.reasonCode === 'open_repeated_failures'
						? `Your last few submissions on ${problemTitle} didn’t pass every test yet.`
						: `You’ve started ${problemTitle} but haven’t passed every test yet.`,
				concept,
				cta: `Continue ${problemTitle}`
			}
		case 'new_problem':
			return {
				title: 'A new problem to try',
				body: `Here’s one you haven’t attempted yet: ${problemTitle}.`,
				concept,
				cta: `Start ${problemTitle}`
			}
		case 'revision':
			return {
				title: 'Time for a quick revision',
				body: `You’ve solved every problem in the current set. Revisiting ${problemTitle} can help it stick.`,
				concept,
				cta: `Revisit ${problemTitle}`
			}
	}
}
