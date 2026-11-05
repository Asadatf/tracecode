import 'server-only'
import { currentUserIdSafe } from '@/server/auth/session'
import { captureError } from '@/lib/observability/capture-error'
import { PROBLEMS } from '@/lib/trace/problems'
import {
	generateAssessment,
	parseStoredAssessment,
	type Assessment,
	type AskModel
} from '@/lib/challenge/assessment'
import { callTutorProvider, resolveTutorConfig } from '@/server/ai/tutor-provider'
import { checkRateLimit } from '@/server/tutor/rate-limit'
import { assessmentStore } from './assessment-store'
import { getChallenge } from './challenge'
import { attemptStore } from './store'

// The AI approach assessment of a Daily Learning Challenge's ONE final submission, pass or
// fail. It reuses the app's existing AI integration end to end: Tracy's provider adapter and
// model configuration (`resolveTutorConfig`, one registered, priced model), its tracked usage
// accounting (`ai_usage`, under its own feature name), and its per-user rate limit. No new
// provider or infrastructure. It runs only once the submission has been GRADED, reads the
// code from the learner's own stored submission (never from the request), and tells the model
// only how many hidden tests passed. The result is stored once on the challenge attempt, so
// reloads and duplicate requests spend nothing.

export const ASSESSMENT_FEATURE = 'challenge_assessment'

export type AssessResult =
	| { ok: true; assessment: Assessment }
	| { ok: false; error: 'unauthenticated' | 'not_found' | 'not_graded' | 'unavailable' }

const askTracyProvider: AskModel = async (prompt) => {
	const config = { ...resolveTutorConfig(), feature: ASSESSMENT_FEATURE }
	const result = await callTutorProvider(config, {
		system: prompt.system,
		messages: [{ role: 'user', content: prompt.user }],
		maxOutputTokens: prompt.maxOutputTokens,
		timeoutMs: prompt.timeoutMs
	})
	return result.ok
		? { ok: true, text: result.text, model: result.model }
		: { ok: false, reason: result.reason }
}

// The stored assessment for the page (a read only: this never calls the model). A missing
// column before its migration, or any read failure, simply means none yet.
export async function getStoredAssessment(
	userId: string,
	date: string
): Promise<Assessment | null> {
	try {
		const row = await assessmentStore.read(userId, date)
		return row == null ? null : parseStoredAssessment(row.assessment)
	} catch {
		return null
	}
}

export async function assessDaily(rawDate: string): Promise<AssessResult> {
	const userId = await currentUserIdSafe()
	if (userId == null) return { ok: false, error: 'unauthenticated' }
	const lookup = await getChallenge(rawDate)
	if (lookup.status !== 'ok') return { ok: false, error: 'not_found' }
	const problem = Object.hasOwn(PROBLEMS, lookup.problemSlug)
		? PROBLEMS[lookup.problemSlug]
		: undefined
	if (problem == null) return { ok: false, error: 'not_found' }
	try {
		const row = await attemptStore.find(userId, lookup.date)
		// Only after grading has produced the counts: never for an open challenge, and a
		// submission still waiting on the grader waits for the assessment too.
		if (row == null || row.status !== 'graded' || row.testsPassed == null || row.testsTotal == null)
			return { ok: false, error: 'not_graded' }
		const source = await attemptStore.readSource(userId, lookup.date)
		if (source == null) return { ok: false, error: 'unavailable' }
		const outcome = await generateAssessment(
			{
				userId,
				date: lookup.date,
				attemptId: row.id,
				source,
				result: { passed: row.testsPassed, total: row.testsTotal },
				problem,
				now: new Date()
			},
			{ store: assessmentStore, ask: askTracyProvider, allow: (id) => checkRateLimit(id).ok }
		)
		if (outcome.status === 'ready') return { ok: true, assessment: outcome.assessment }
		// "No API key" and "storage not migrated yet" are expected states, not incidents.
		if (outcome.reason !== 'no_api_key' && outcome.reason !== 'storage')
			captureError(new Error(`challenge assessment unavailable: ${outcome.reason}`), {
				area: 'challenge-assessment'
			})
		return { ok: false, error: 'unavailable' }
	} catch (error) {
		captureError(error, { area: 'challenge-assessment' })
		return { ok: false, error: 'unavailable' }
	}
}
