'use server'

import { z } from 'zod'
import { after } from 'next/server'
import { validatedAction } from './validated-action'
import { currentLearnerId, currentUserIdSafe } from '@/server/auth/session'
import {
	autosaveExam,
	examEnabled,
	examPublicView,
	myAttempt,
	openIfDue,
	recordEvents,
	startExam,
	submitExam
} from '@/server/exam/exam'
import { examResultFor } from '@/server/exam/results'
import { runExamWorker } from '@/server/exam/jobs'
import { MAX_SOURCE_BYTES } from '@/lib/challenge/exam-rules'

// Server Actions for the Daily Exam (specs/features/daily-exam.md). None takes a user id, a score,
// a time or a result: the learner is the session's, and every decision is the server's.

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

async function learner(): Promise<string | null> {
	const userId = await currentUserIdSafe()
	if (userId == null) return null
	return (await examEnabled(userId)) ? userId : null
}

// After closing, a participant's page nudges ITS exam's jobs, bounded and throttled (AC43). It is
// never needed for correctness; the scheduled tick does the same work.
const lastNudge = new Map<string, number>()
function nudge(examDate: string) {
	const now = Date.now()
	if (now - (lastNudge.get(examDate) ?? 0) < 30_000) return
	lastNudge.set(examDate, now)
	after(async () => {
		await runExamWorker({
			claimBudgetMs: 45_000,
			maxJobs: 25,
			filter: (j) => j.examDate === examDate
		}).catch(() => undefined)
	})
}

export const examStatusAction = validatedAction({
	input: z.object({ date: dateInput }).strict(),
	handler: async ({ date }) => {
		const userId = await learner()
		if (userId == null) return { ok: false as const, error: 'unauthenticated' as const }
		await openIfDue(date)
		const view = await examPublicView(date)
		if (view == null) return { ok: false as const, error: 'not_found' as const }
		if (view.phase === 'closed' || view.phase === 'processing') nudge(date)
		const [attempt, result] = await Promise.all([
			myAttempt(userId, date),
			examResultFor(userId, date)
		])
		return {
			ok: true as const,
			view,
			attempt:
				attempt == null ? null : { status: attempt.status, submittedAt: attempt.submittedAt },
			result
		}
	}
})

const preflightInput = z
	.object({
		camera: z.boolean(),
		microphone: z.boolean(),
		screen: z.boolean(),
		screenSurface: z.enum(['monitor', 'window', 'browser', 'unknown']),
		fullscreen: z.boolean(),
		screenDetails: z.enum(['reported', 'unsupported', 'denied']),
		screenCount: z.number().int().min(0).max(32).nullable()
	})
	.strict()

export const startExamAction = validatedAction({
	input: z.object({ date: dateInput, preflight: preflightInput }).strict(),
	handler: async ({ date, preflight }) => {
		// A write that references users: provision the users row first.
		const userId = await currentLearnerId()
		if (userId == null || !(await examEnabled(userId)))
			return { ok: false as const, error: 'unauthenticated' as const }
		return startExam(userId, date, preflight)
	}
})

export const autosaveExamAction = validatedAction({
	input: z
		.object({
			date: dateInput,
			source: z.string().max(MAX_SOURCE_BYTES * 2),
			clientSeq: z.number().int().min(1)
		})
		.strict(),
	handler: async ({ date, source, clientSeq }) => {
		const userId = await learner()
		if (userId == null) return { ok: false as const, error: 'closed' as const }
		return autosaveExam(userId, date, source, clientSeq)
	}
})

export const submitExamAction = validatedAction({
	input: z.object({ date: dateInput, source: z.string().max(MAX_SOURCE_BYTES * 2) }).strict(),
	handler: async ({ date, source }) => {
		const userId = await learner()
		if (userId == null) return { ok: false as const, error: 'closed' as const }
		const result = await submitExam(userId, date, source)
		// Grade promptly: the queue picks the new job up now rather than at the next tick.
		if (result.ok) nudge(date)
		return result
	}
})

const eventInput = z
	.object({
		clientEventId: z.string().min(1).max(64),
		clientSeq: z.number().int().min(0),
		type: z.string().min(1).max(40),
		occurredAt: z.string().max(40).optional(),
		screenCount: z.number().int().min(0).max(32).optional()
	})
	.strict()

export const reportIntegrityEventsAction = validatedAction({
	input: z.object({ date: dateInput, events: z.array(eventInput).max(50) }).strict(),
	handler: async ({ date, events }) => {
		const userId = await learner()
		if (userId == null) return { accepted: 0, duplicates: 0, rejected: events.length }
		return recordEvents(userId, date, events)
	}
})
