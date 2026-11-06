import 'server-only'
import { randomUUID } from 'node:crypto'
import { db, Prisma } from '@/server/db/client'
import { dayColumn } from '@/lib/reviews/review-queries'
import { captureError } from '@/lib/observability/capture-error'
import {
	runWorker,
	type JobHandler,
	type JobHandlers,
	type JobRow,
	type WorkerStats
} from '@/lib/exam/queue'
import {
	applyPolicyV1,
	type IntegrityEventType,
	type PolicyResult
} from '@/lib/exam/integrity-policy'
import { codingScore, finalScore, rankStandings, type StandingStatus } from '@/lib/exam/scoring'
import { emptyFailureCounts, type FailureCounts } from '@/lib/exam/failures'
import {
	EXAM_ASSESSMENT_MAX_OUTPUT_TOKENS,
	EXAM_ASSESSMENT_TIMEOUT_MS,
	buildExamAssessmentPrompt,
	guardExamAssessment,
	ignoresInputs
} from '@/lib/exam/assessment-guard'
import { createSandboxGrader } from '@/lib/challenge/sandbox-grader'
import { isMeaningfulAttempt } from '@/lib/streak/attempt-meaning'
import { loadSandboxFactory } from '@/server/challenge/sandbox'
import { trackReviewPass } from '@/server/reviews/reviews'
import { callTutorProvider, resolveTutorConfig } from '@/server/ai/tutor-provider'
import type { ProblemDefinition } from '@/lib/trace/problem'
import { enqueueInTx } from './exam'
import { jobStore } from './stores'

// The M10 job handlers (specs/features/daily-exam.md § M). Every handler is idempotent: its
// effect is a conditional write on the domain row's expected state, so a replay or a stale worker
// changes nothing, and the queue fences completion on the lease (AC38).

export const EXAM_RESULT_KIND = 'exam_result'
const day = (d: Date) => d.toISOString().slice(0, 10)
const examKey = (j: JobRow) => ({ examDate: dayColumn(j.examDate) })

async function exam(j: JobRow) {
	return db.dailyExam.findUnique({ where: examKey(j) })
}

async function jobsTerminal(j: JobRow, types: string[]): Promise<boolean> {
	const open = await db.examJob.count({
		where: {
			examDate: dayColumn(j.examDate),
			type: { in: types },
			status: { in: ['pending', 'running'] }
		}
	})
	return open === 0
}

const notReady = { ready: false as const }
const ready = { ready: true as const }

function problemDefinition(p: {
	slug: string
	title: string
	entry: string
	statement: unknown
	examples: unknown
	starter: string
	practiceTests: unknown
}): ProblemDefinition {
	const params = (new RegExp(`def\\s+${p.entry}\\s*\\(([^)]*)\\)`).exec(p.starter)?.[1] ?? '')
		.split(',')
		.map((s) => s.split(':')[0]?.split('=')[0]?.trim() ?? '')
		.filter((s) => s.length > 0)
		.map((name) => ({ name }))
	return {
		slug: p.slug,
		title: p.title,
		entry: p.entry,
		params: params.length > 0 ? params : [{ name: 'x' }],
		difficulty: 'medium',
		conceptTags: [],
		statement: p.statement as string[],
		examples: p.examples as ProblemDefinition['examples'],
		starter: p.starter,
		tests: p.practiceTests as ProblemDefinition['tests']
	}
}

// ---- Closeout (AC15, AC47) -------------------------------------------------------------------

const closeout: JobHandler = {
	async ready(j) {
		const e = await exam(j)
		return e != null && Date.now() >= e.closesAt.getTime() ? ready : notReady
	},
	async run(j) {
		const e = await exam(j)
		if (e == null) return { ok: false, code: 'exam_missing', permanent: true }
		// Never-opened exams go straight to grading with no attempts (AC47).
		await db.dailyExam.updateMany({
			where: { examDate: e.examDate, status: { in: ['scheduled', 'open'] } },
			data: { status: 'grading', gradingAt: new Date() }
		})
		const admitted = await db.examAttempt.findMany({
			where: { examDate: e.examDate, status: 'admitted' },
			select: { id: true, autosave: { select: { source: true } } }
		})
		const starter = e.problemId
			? (await db.examProblem.findUnique({ where: { id: e.problemId }, select: { starter: true } }))
					?.starter
			: null
		for (const a of admitted) {
			const source = a.autosave?.source ?? null
			const usable = source != null && source.trim() !== '' && source.trim() !== starter?.trim()
			await db.$transaction(async (tx) => {
				const { count } = await tx.examAttempt.updateMany({
					where: { id: a.id, status: 'admitted' },
					data: usable
						? { status: 'submitted', source, submittedAt: e.closesAt, submissionKind: 'auto' }
						: { status: 'no_submission', submissionKind: null }
				})
				if (count === 1 && usable)
					await enqueueInTx(tx, [
						{ type: 'EXAM_GRADE', examDate: j.examDate, attemptId: a.id, runAfter: new Date() }
					])
			})
		}
		return { ok: true }
	}
}

// ---- Grade (AC17, AC18) ----------------------------------------------------------------------

const grade: JobHandler = {
	async ready() {
		return ready
	},
	async run(j) {
		if (j.attemptId == null) return { ok: false, code: 'no_attempt', permanent: true }
		const a = await db.examAttempt.findUnique({
			where: { id: j.attemptId },
			select: {
				status: true,
				source: true,
				submittedAt: true,
				exam: { select: { opensAt: true, problemId: true } }
			}
		})
		if (a == null) return { ok: false, code: 'attempt_missing', permanent: true }
		if (a.status !== 'submitted') return { ok: true }
		if (a.source == null || a.submittedAt == null || a.exam.problemId == null)
			return { ok: false, code: 'missing_submission', permanent: true }
		const p = await db.examProblem.findUnique({ where: { id: a.exam.problemId } })
		if (p == null) return { ok: false, code: 'problem_missing', permanent: true }
		const factory = await loadSandboxFactory()
		if (factory == null) return { ok: false, code: 'sandbox_unavailable' }
		const cases = p.hiddenCases as { id: string; args: unknown[]; expected: unknown }[]
		const grader = createSandboxGrader(factory, () => ({ problem: problemDefinition(p), cases }))
		const outcome = await grader.grade({ problemSlug: p.slug, source: a.source })
		if (!outcome.ok) return { ok: false, code: outcome.code }
		const elapsed = Math.max(
			0,
			Math.floor((a.submittedAt.getTime() - a.exam.opensAt.getTime()) / 1000)
		)
		const s = codingScore({
			testsPassed: outcome.testsPassed,
			testsTotal: outcome.testsTotal,
			elapsedSeconds: elapsed
		})
		await db.examAttempt.updateMany({
			where: { id: j.attemptId, status: 'submitted' },
			data: {
				status: 'graded',
				testsPassed: outcome.testsPassed,
				testsTotal: outcome.testsTotal,
				graderVersion: outcome.graderVersion,
				gradedAt: new Date(),
				failureCounts: (outcome.failures ??
					emptyFailureCounts()) as unknown as Prisma.InputJsonValue,
				correctnessScore: s.correctness,
				speedScore: s.speed,
				codingScore: s.coding
			}
		})
		return { ok: true }
	},
	async onDead(j) {
		if (j.attemptId == null) return
		await db.examAttempt.updateMany({
			where: { id: j.attemptId, status: 'submitted' },
			data: { status: 'grading_failed' }
		})
	}
}

// ---- Integrity score (AC25) ------------------------------------------------------------------

const integrityScore: JobHandler = {
	async ready(j) {
		const e = await exam(j)
		return e != null && Date.now() >= e.closesAt.getTime() + 90_000 ? ready : notReady
	},
	async run(j) {
		if (j.attemptId == null) return { ok: false, code: 'no_attempt', permanent: true }
		const existing = await db.examIntegrityDecision.findFirst({
			where: { attemptId: j.attemptId, kind: 'auto' }
		})
		if (existing != null) return { ok: true }
		const a = await db.examAttempt.findUnique({
			where: { id: j.attemptId },
			select: { admittedAt: true, exam: { select: { closesAt: true, policyVersion: true } } }
		})
		if (a == null) return { ok: false, code: 'attempt_missing', permanent: true }
		const events = await db.examIntegrityEvent.findMany({
			where: { attemptId: j.attemptId },
			select: { type: true, receivedAt: true, meta: true }
		})
		const result = applyPolicyV1({
			events: events.map((e) => ({
				type: e.type as IntegrityEventType,
				receivedAt: e.receivedAt,
				screenCount:
					typeof (e.meta as { screenCount?: unknown } | null)?.screenCount === 'number'
						? (e.meta as { screenCount: number }).screenCount
						: undefined
			})),
			admittedAt: a.admittedAt,
			closesAt: a.exam.closesAt
		})
		await db.$transaction([
			db.examIntegrityDecision.create({
				data: {
					attemptId: j.attemptId,
					policyVersion: result.policyVersion,
					kind: 'auto',
					deductions: result.totalDeduction,
					flags: result.flags as unknown as Prisma.InputJsonValue,
					inputSummary: {
						summary: result.summary,
						deductions: result.deductions,
						warnings: result.warnings
					} as unknown as Prisma.InputJsonValue
				}
			}),
			db.examAttempt.update({
				where: { id: j.attemptId },
				data: { deductions: result.totalDeduction }
			})
		])
		return { ok: true }
	}
}

// ---- Result finalisation (AC19) --------------------------------------------------------------

const resultFinalization: JobHandler = {
	async ready(j) {
		const e = await exam(j)
		if (e == null || (e.status !== 'grading' && e.status !== 'finalizing')) return notReady
		return (await jobsTerminal(j, ['EXAM_CLOSEOUT', 'EXAM_GRADE', 'EXAM_INTEGRITY_SCORE']))
			? ready
			: notReady
	},
	async run(j) {
		const e = await exam(j)
		if (e == null) return { ok: false, code: 'exam_missing', permanent: true }
		const attempts = await db.examAttempt.findMany({
			where: { examDate: e.examDate },
			select: { id: true, status: true, codingScore: true, deductions: true }
		})
		await db.$transaction(async (tx) => {
			for (const a of attempts) {
				const score =
					a.status === 'graded'
						? finalScore(a.codingScore ?? 0, a.deductions ?? 0)
						: a.status === 'no_submission'
							? 0
							: null
				await tx.examAttempt.update({ where: { id: a.id }, data: { finalScore: score } })
			}
			await tx.dailyExam.updateMany({
				where: { examDate: e.examDate, status: 'grading' },
				data: { status: 'finalizing', finalizingAt: new Date() }
			})
			// AI feedback runs after results exist and never gates publication (AC28b).
			await enqueueInTx(
				tx,
				attempts
					.filter((a) => a.status === 'graded')
					.map((a) => ({
						type: 'EXAM_AI_EVALUATION' as const,
						examDate: j.examDate,
						attemptId: a.id,
						runAfter: new Date()
					}))
			)
		})
		return { ok: true }
	}
}

// ---- Leaderboard (AC19, AC29) ----------------------------------------------------------------

const leaderboardFinalization: JobHandler = {
	async ready(j) {
		const e = await exam(j)
		return e?.status === 'finalizing' ? ready : notReady
	},
	async run(j) {
		const e = await exam(j)
		if (e == null) return { ok: false, code: 'exam_missing', permanent: true }
		const attempts = await db.examAttempt.findMany({
			where: { examDate: e.examDate },
			select: {
				id: true,
				userId: true,
				status: true,
				finalScore: true,
				codingScore: true,
				deductions: true,
				testsPassed: true,
				testsTotal: true,
				submittedAt: true,
				user: { select: { username: true, leaderboardOptIn: true } }
			}
		})
		const statusOf = (a: (typeof attempts)[number]): StandingStatus =>
			a.status === 'grading_failed'
				? 'grading_failed'
				: a.status === 'no_submission'
					? 'no_submission'
					: a.testsTotal != null && a.testsTotal > 0 && a.testsPassed === a.testsTotal
						? 'full_pass'
						: 'partial'
		const ranked = rankStandings(
			day(e.examDate),
			attempts.map((a) => ({
				userKey: a.userId,
				status: statusOf(a),
				finalScore: a.finalScore ?? 0,
				testsPassed: a.testsPassed ?? 0,
				submittedAtMs: a.submittedAt?.getTime() ?? null,
				attempt: a
			}))
		)
		await db.$transaction(async (tx) => {
			await tx.examStanding.createMany({
				data: ranked.map((r) => ({
					examDate: e.examDate,
					version: e.correctionCount,
					userId: r.entry.attempt.userId,
					rank: r.rank,
					ranked: r.ranked,
					// A name only with explicit public-identity consent (AC29).
					displayName:
						r.entry.attempt.user.leaderboardOptIn && r.entry.attempt.user.username != null
							? r.entry.attempt.user.username
							: null,
					codingScore: r.entry.attempt.codingScore ?? 0,
					deductions: r.entry.attempt.deductions ?? 0,
					finalScore: r.entry.finalScore,
					testsPassed: r.entry.attempt.testsPassed ?? 0,
					testsTotal: r.entry.attempt.testsTotal ?? 0,
					elapsedSeconds:
						r.entry.attempt.submittedAt == null
							? null
							: Math.max(
									0,
									Math.floor((r.entry.attempt.submittedAt.getTime() - e.opensAt.getTime()) / 1000)
								),
					status: r.entry.status
				})),
				skipDuplicates: true
			})
			for (const r of ranked)
				await tx.examAttempt.update({
					where: { id: r.entry.attempt.id },
					data: { rank: r.rank, ranked: r.ranked }
				})
			await tx.dailyExam.updateMany({
				where: { examDate: e.examDate, status: 'finalizing' },
				data: { status: 'published', publishedAt: new Date() }
			})
		})
		return { ok: true }
	}
}

// ---- Notifications (AC32) --------------------------------------------------------------------

const notifications: JobHandler = {
	async ready(j) {
		const e = await exam(j)
		return e?.status === 'published' || e?.status === 'archived' ? ready : notReady
	},
	async run(j) {
		const attempts = await db.examAttempt.findMany({
			where: { examDate: dayColumn(j.examDate) },
			select: { userId: true, finalScore: true, rank: true, ranked: true }
		})
		const total = attempts.filter((a) => a.ranked === true).length
		await db.learningNotification.createMany({
			data: attempts.map((a) => ({
				userId: a.userId,
				logicalKey: `exam:${j.examDate}`,
				kind: EXAM_RESULT_KIND,
				// Never the problem's name (AC32).
				payload: {
					v: 1,
					date: j.examDate,
					finalScore: a.finalScore,
					rank: a.rank,
					ranked: a.ranked,
					total
				}
			})),
			skipDuplicates: true
		})
		return { ok: true }
	}
}

// ---- Publication + learning credit (AC30, AC31, AC49) -----------------------------------------

const publication: JobHandler = {
	async ready(j) {
		const e = await exam(j)
		if (e == null) return notReady
		if (e.status === 'archived') return ready
		if (e.status !== 'published') return notReady
		return e.isRepeat || Date.now() >= e.publishAt.getTime() ? ready : notReady
	},
	async run(j) {
		const e = await exam(j)
		if (e == null) return { ok: false, code: 'exam_missing', permanent: true }
		if (e.status === 'cancelled' || e.problemId == null) return { ok: true }
		// Accelerated test exams are isolated from production learning activity: no Attempt,
		// progress, streak or review is written, and nothing is published to Practice (see
		// publishedExamProblem). They only archive.
		if (e.scheduleVersion.startsWith('test')) {
			await db.dailyExam.updateMany({
				where: { examDate: e.examDate, status: 'published' },
				data: { status: 'archived', archivedAt: new Date() }
			})
			return { ok: true }
		}
		const problem = await db.examProblem.findUnique({
			where: { id: e.problemId },
			select: { slug: true }
		})
		if (problem == null) return { ok: false, code: 'problem_missing', permanent: true }
		const passes = await db.examAttempt.findMany({
			where: { examDate: e.examDate, status: 'graded', attemptId: null },
			select: {
				id: true,
				userId: true,
				source: true,
				submittedAt: true,
				testsPassed: true,
				testsTotal: true
			}
		})
		for (const a of passes) {
			if (a.testsTotal == null || a.testsTotal === 0 || a.testsPassed !== a.testsTotal) continue
			if (a.source == null || a.submittedAt == null) continue
			const at = a.submittedAt
			const source = a.source
			const credited = await db
				.$transaction(async (tx) => {
					const attempt = await tx.attempt.create({
						data: {
							userId: a.userId,
							problemSlug: problem.slug,
							source,
							createdAt: at,
							status: 'completed',
							testsPassed: a.testsPassed ?? 0,
							testsTotal: a.testsTotal ?? 0,
							allPassed: true,
							meaningful: isMeaningfulAttempt(problem.slug, source)
						},
						select: { id: true }
					})
					// Fenced: only if no credit was linked yet (exactly once).
					const { count } = await tx.examAttempt.updateMany({
						where: { id: a.id, attemptId: null },
						data: { attemptId: attempt.id }
					})
					if (count !== 1) throw new Error('already_credited')
					const existing = await tx.problemProgress.findUnique({
						where: { userId_problemSlug: { userId: a.userId, problemSlug: problem.slug } }
					})
					await tx.problemProgress.upsert({
						where: { userId_problemSlug: { userId: a.userId, problemSlug: problem.slug } },
						create: {
							userId: a.userId,
							problemSlug: problem.slug,
							status: 'solved',
							attempts: 1,
							bestTestsPassed: a.testsPassed ?? 0,
							testsTotal: a.testsTotal ?? 0,
							firstSolvedAt: at,
							latestSolvedAt: at
						},
						update: {
							status: 'solved',
							attempts: { increment: 1 },
							bestTestsPassed: Math.max(existing?.bestTestsPassed ?? 0, a.testsPassed ?? 0),
							testsTotal: a.testsTotal ?? 0,
							firstSolvedAt: existing?.firstSolvedAt ?? at,
							latestSolvedAt: at
						}
					})
					return true
				})
				.catch((error: unknown) => {
					if (error instanceof Error && error.message === 'already_credited') return false
					throw error
				})
			if (credited) await trackReviewPass(a.userId, problem.slug, at)
		}
		await db.dailyExam.updateMany({
			where: { examDate: e.examDate, status: 'published' },
			data: { status: 'archived', archivedAt: new Date() }
		})
		return { ok: true }
	}
}

// ---- AI evaluation (AC28–AC28b) --------------------------------------------------------------

function parseLoose(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		const s = text.indexOf('{')
		const e = text.lastIndexOf('}')
		if (s < 0 || e <= s) return undefined
		try {
			return JSON.parse(text.slice(s, e + 1))
		} catch {
			return undefined
		}
	}
}

const aiEvaluation: JobHandler = {
	async ready() {
		return ready
	},
	async run(j) {
		if (j.attemptId == null) return { ok: false, code: 'no_attempt', permanent: true }
		const a = await db.examAttempt.findUnique({
			where: { id: j.attemptId },
			include: {
				exam: { include: { problem: true } },
				decisions: { where: { kind: 'auto' }, take: 1 }
			}
		})
		if (a == null || a.exam.problem == null)
			return { ok: false, code: 'attempt_missing', permanent: true }
		if (a.assessmentStatus === 'ready') return { ok: true }
		const p = a.exam.problem
		const def = problemDefinition(p)
		const decision = a.decisions[0]
		const input = (decision?.inputSummary ?? null) as {
			summary: PolicyResult['summary']
			deductions: PolicyResult['deductions']
		} | null
		if (input == null) return { ok: false, code: 'integrity_not_scored' }
		const source = a.source ?? ''
		const evidence = {
			problem: {
				title: p.title,
				statement: def.statement,
				entry: p.entry,
				params: def.params.map((x) => x.name)
			},
			source,
			tests: {
				passed: a.testsPassed ?? 0,
				total: a.testsTotal ?? 0,
				failures: (a.failureCounts ?? emptyFailureCounts()) as FailureCounts
			},
			time: {
				opensAt: a.exam.opensAt.toISOString(),
				admittedAt: a.admittedAt.toISOString(),
				submittedAt: a.submittedAt?.toISOString() ?? null,
				submissionKind: (a.submissionKind as 'manual' | 'auto' | null) ?? null,
				elapsedSeconds:
					a.submittedAt == null
						? null
						: Math.max(0, Math.floor((a.submittedAt.getTime() - a.exam.opensAt.getTime()) / 1000)),
				remainingSeconds:
					a.submittedAt == null
						? null
						: Math.max(0, Math.floor((a.exam.closesAt.getTime() - a.submittedAt.getTime()) / 1000))
			},
			integrity: {
				summary: input.summary,
				deductions: input.deductions,
				totalDeduction: a.deductions ?? 0
			},
			ignoresInputs: ignoresInputs(
				source,
				p.entry,
				def.params.map((x) => x.name)
			)
		}
		const prompt = buildExamAssessmentPrompt(evidence)
		const result = await callTutorProvider(
			{ ...resolveTutorConfig(), feature: 'exam_assessment' },
			{
				system: prompt.system,
				messages: [{ role: 'user', content: prompt.user }],
				maxOutputTokens: EXAM_ASSESSMENT_MAX_OUTPUT_TOKENS,
				timeoutMs: EXAM_ASSESSMENT_TIMEOUT_MS
			}
		)
		if (!result.ok)
			return { ok: false, code: `ai_${result.reason}`, permanent: result.reason === 'no_api_key' }
		const guarded = guardExamAssessment(parseLoose(result.text), evidence)
		if (!guarded.ok) return { ok: false, code: `guard_${guarded.reason}` }
		await db.examAttempt.updateMany({
			where: { id: j.attemptId, assessmentStatus: { not: 'ready' } },
			data: {
				assessment: {
					...guarded.assessment,
					model: result.model
				} as unknown as Prisma.InputJsonValue,
				assessmentStatus: 'ready'
			}
		})
		return { ok: true }
	},
	async onDead(j) {
		if (j.attemptId == null) return
		await db.examAttempt.updateMany({
			where: { id: j.attemptId, assessmentStatus: 'pending' },
			data: { assessmentStatus: 'unavailable' }
		})
	}
}

// ---- Retention (AC35) ------------------------------------------------------------------------

const retention: JobHandler = {
	async ready() {
		return ready
	},
	async run(j) {
		await db.examIntegrityEvent.deleteMany({
			where: { attempt: { examDate: dayColumn(j.examDate), challenge: null } }
		})
		return { ok: true }
	}
}

export const EXAM_HANDLERS: JobHandlers = {
	EXAM_CLOSEOUT: closeout,
	EXAM_GRADE: grade,
	EXAM_INTEGRITY_SCORE: integrityScore,
	EXAM_AI_EVALUATION: aiEvaluation,
	EXAM_RESULT_FINALIZATION: resultFinalization,
	EXAM_LEADERBOARD_FINALIZATION: leaderboardFinalization,
	EXAM_NOTIFICATIONS: notifications,
	EXAM_PROBLEM_PUBLICATION: publication,
	EXAM_RETENTION_CLEANUP: retention
}

export async function runExamWorker(options: {
	claimBudgetMs?: number
	maxJobs?: number
	filter?: (j: JobRow) => boolean
}): Promise<WorkerStats> {
	try {
		return await runWorker({
			store: jobStore,
			handlers: EXAM_HANDLERS,
			now: () => new Date(),
			newToken: () => randomUUID(),
			...options
		})
	} catch (error) {
		captureError(error, { area: 'exam-worker' })
		throw error
	}
}
