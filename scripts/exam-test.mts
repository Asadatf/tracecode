// Controlled, accelerated M10 Daily Exam test (specs/features/daily-exam.md § Testing). Creates an
// exam on a MARKED far-future date key (2099-…, scheduleVersion `test@1`) with its own short
// stored timestamps, so the real 15:00–15:30 UTC schedule is untouched, and enables `daily_exam`
// ONLY for the named test accounts through per-user overrides (the global flag stays off).
// Prints counts and statuses only — never problem content.
//
//   node --env-file=.env.local --import ./scripts/register-ts.mjs scripts/exam-test.mts setup \
//     --project <ref> --date 2099-01-01 --opens-in 90 --minutes 8 --publish-after 3 --emails a@x,b@y
//   ... status   --project <ref> --date 2099-01-01
//   ... teardown --project <ref> --emails a@x,b@y     (removes the overrides only; history stays)
import { PrismaClient } from '@prisma/client'
import { MAX_ATTEMPTS, idempotencyKey, type JobType } from '../src/lib/exam/queue.ts'

const [command] = process.argv.slice(2)
const option = (name: string) => {
	const i = process.argv.indexOf(name)
	return i >= 0 ? process.argv[i + 1] : undefined
}
const expected = option('--project')
const ref =
	process.env.DATABASE_URL == null
		? null
		: new URL(process.env.DATABASE_URL).username.split('.').pop()
if (expected == null || ref !== expected) {
	console.error('Refusing: --project does not match the database identity.')
	process.exit(2)
}
const db = new PrismaClient()
const dayColumn = (d: string) => new Date(`${d}T00:00:00.000Z`)

async function overrides(emails: string[], enabled: boolean) {
	const users = await db.user.findMany({
		where: { email: { in: emails.map((e) => e.toLowerCase()), mode: 'insensitive' } },
		select: { id: true }
	})
	for (const u of users) {
		if (enabled)
			await db.featureFlagOverride.upsert({
				where: { flagKey_userId: { flagKey: 'daily_exam', userId: u.id } },
				create: { flagKey: 'daily_exam', userId: u.id, enabled: true },
				update: { enabled: true }
			})
		else await db.featureFlagOverride.deleteMany({ where: { flagKey: 'daily_exam', userId: u.id } })
	}
	return users.length
}

try {
	if (command === 'setup') {
		const date = option('--date') ?? '2099-01-01'
		if (!date.startsWith('2099-')) throw new Error('test exams use 2099-… date keys only')
		const opensAt = new Date(Date.now() + Number(option('--opens-in') ?? 90) * 1000)
		const closesAt = new Date(opensAt.getTime() + Number(option('--minutes') ?? 8) * 60_000)
		const lateEntryUntil = new Date(Math.min(closesAt.getTime(), opensAt.getTime() + 5 * 60_000))
		const publishAt = new Date(closesAt.getTime() + Number(option('--publish-after') ?? 3) * 60_000)
		const created = await db.$transaction(async (tx) => {
			const { count } = await tx.dailyExam.createMany({
				data: [
					{
						examDate: dayColumn(date),
						status: 'scheduled',
						opensAt,
						closesAt,
						lateEntryUntil,
						resultsDueAt: new Date(closesAt.getTime() + 60 * 60_000),
						publishAt,
						retentionDays: 90,
						scheduleVersion: 'test@1',
						policyVersion: 'integrity-policy@1'
					}
				],
				skipDuplicates: true
			})
			if (count === 0) return false
			const jobs: [JobType, Date][] = [
				['EXAM_CLOSEOUT', closesAt],
				['EXAM_RESULT_FINALIZATION', closesAt],
				['EXAM_LEADERBOARD_FINALIZATION', closesAt],
				['EXAM_NOTIFICATIONS', closesAt],
				['EXAM_PROBLEM_PUBLICATION', closesAt],
				['EXAM_RETENTION_CLEANUP', new Date(publishAt.getTime() + 90 * 86_400_000)]
			]
			await tx.examJob.createMany({
				data: jobs.map(([type, runAfter]) => ({
					type,
					idempotencyKey: idempotencyKey({ type, examDate: date }),
					examDate: dayColumn(date),
					status: 'pending',
					runAfter,
					maxAttempts: MAX_ATTEMPTS[type]
				})),
				skipDuplicates: true
			})
			return true
		})
		const n = await overrides((option('--emails') ?? '').split(',').filter(Boolean), true)
		console.log(
			JSON.stringify({
				date,
				created,
				opensAt,
				lateEntryUntil,
				closesAt,
				publishAt,
				overridesFor: n
			})
		)
	} else if (command === 'status') {
		const date = option('--date') ?? '2099-01-01'
		const exam = await db.dailyExam.findUnique({
			where: { examDate: dayColumn(date) },
			select: {
				status: true,
				isRepeat: true,
				problemId: true,
				openedAt: true,
				gradingAt: true,
				publishedAt: true,
				archivedAt: true,
				closesAt: true,
				selection: true
			}
		})
		const attempts = await db.examAttempt.findMany({
			where: { examDate: dayColumn(date) },
			select: {
				status: true,
				submissionKind: true,
				submittedAt: true,
				testsPassed: true,
				testsTotal: true,
				correctnessScore: true,
				speedScore: true,
				codingScore: true,
				deductions: true,
				finalScore: true,
				rank: true,
				ranked: true,
				assessmentStatus: true,
				failureCounts: true,
				attemptId: true,
				gradedAt: true,
				_count: { select: { events: true, decisions: true } }
			}
		})
		const jobs = await db.examJob.groupBy({
			by: ['type', 'status'],
			_count: true,
			where: { examDate: dayColumn(date) }
		})
		const sel = exam?.selection as {
			cooldownDays?: number
			candidates?: unknown[]
			poolSize?: number
		} | null
		console.log(
			JSON.stringify(
				{
					exam: exam && {
						...exam,
						problemAssigned: exam.problemId != null,
						problemId: undefined,
						selection: sel && {
							poolSize: sel.poolSize,
							cooldownDays: sel.cooldownDays,
							candidates: sel.candidates?.length
						}
					},
					attempts,
					jobs: jobs.map((j) => `${j.type}:${j.status}=${j._count}`)
				},
				null,
				1
			)
		)
	} else if (command === 'teardown') {
		console.log(
			'overrides removed for',
			await overrides((option('--emails') ?? '').split(',').filter(Boolean), false),
			'user(s)'
		)
	} else {
		console.error('setup | status | teardown')
		process.exit(2)
	}
} finally {
	await db.$disconnect()
}
