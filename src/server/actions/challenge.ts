'use server'

import { z } from 'zod'
import { validatedAction } from './validated-action'
import { challengeStatus, startChallenge, submitChallenge } from '@/server/challenge/challenge'
import { assessDaily } from '@/server/challenge/assessment'
import { setLeaderboardOptIn } from '@/server/challenge/leaderboard'
import { MAX_SOURCE_BYTES } from '@/lib/challenge/exam-rules'

// Server Actions for the Daily Learning Challenge (and the dormant leaderboard consent).
// Thin shells: none takes a user id (the learner is the session's), and none takes a pass
// count, a result or a time — a result exists only when the server grader writes one.

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// The AI approach assessment of a GRADED final submission: a date only; the code is read from
// the learner's own stored submission and the result is generated once.
export const assessDailyAction = validatedAction({
	input: z.object({ date: dateInput }).strict(),
	handler: async ({ date }) => assessDaily(date)
})

export const startChallengeAction = validatedAction({
	input: z.object({ date: dateInput }).strict(),
	handler: async ({ date }) => startChallenge(date)
})

export const submitChallengeAction = validatedAction({
	input: z.object({ date: dateInput, source: z.string().max(MAX_SOURCE_BYTES * 2) }).strict(),
	handler: async ({ date, source }) => submitChallenge(date, source)
})

export const challengeStatusAction = validatedAction({
	input: z.object({ date: dateInput }).strict(),
	handler: async ({ date }) => challengeStatus(date)
})

export const setLeaderboardOptInAction = validatedAction({
	input: z.object({ optIn: z.boolean() }).strict(),
	handler: async ({ optIn }) => setLeaderboardOptIn(optIn)
})
