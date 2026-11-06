import 'server-only'
import { db } from '@/server/db/client'
import { dayColumn } from '@/lib/reviews/review-queries'
import type { FailureCounts } from '@/lib/exam/failures'
import type { ExamAssessment } from '@/lib/exam/assessment-guard'
import type { PolicyResult } from '@/lib/exam/integrity-policy'

// Published results and leaderboards (specs/features/daily-exam.md AC27, AC29). Nothing here is
// readable before the exam is `published`; the leaderboard never carries an email, source code,
// integrity events or (before publication) the problem's identity.

export interface ExamResultView {
	status: string
	submissionKind: string | null
	submittedAt: string | null
	elapsedSeconds: number | null
	testsPassed: number | null
	testsTotal: number | null
	failures: FailureCounts | null
	correctnessScore: number | null
	speedScore: number | null
	codingScore: number | null
	deductions: number
	finalScore: number | null
	rank: number | null
	ranked: boolean | null
	participants: number
	integrity: { summary: PolicyResult['summary']; deductions: PolicyResult['deductions'] } | null
	flags: { kind: string; count: number }[]
	assessmentStatus: string
	assessment: ExamAssessment | null
	isRepeat: boolean
}

export async function examResultFor(
	userId: string,
	examDate: string
): Promise<ExamResultView | null> {
	const a = await db.examAttempt.findUnique({
		where: { examDate_userId: { examDate: dayColumn(examDate), userId } },
		include: {
			exam: { select: { status: true, opensAt: true, isRepeat: true } },
			decisions: { where: { kind: 'auto' }, take: 1 }
		}
	})
	if (a == null) return null
	if (a.exam.status !== 'published' && a.exam.status !== 'archived') return null
	const participants = await db.examAttempt.count({
		where: { examDate: dayColumn(examDate), ranked: true }
	})
	const decision = a.decisions[0]
	const input = (decision?.inputSummary ?? null) as {
		summary: PolicyResult['summary']
		deductions: PolicyResult['deductions']
	} | null
	return {
		status: a.status,
		submissionKind: a.submissionKind,
		submittedAt: a.submittedAt?.toISOString() ?? null,
		elapsedSeconds:
			a.submittedAt == null
				? null
				: Math.max(0, Math.floor((a.submittedAt.getTime() - a.exam.opensAt.getTime()) / 1000)),
		testsPassed: a.testsPassed,
		testsTotal: a.testsTotal,
		failures: (a.failureCounts ?? null) as FailureCounts | null,
		correctnessScore: a.correctnessScore,
		speedScore: a.speedScore,
		codingScore: a.codingScore,
		deductions: a.deductions ?? 0,
		finalScore: a.finalScore,
		rank: a.rank,
		ranked: a.ranked,
		participants,
		integrity: input == null ? null : { summary: input.summary, deductions: input.deductions },
		flags: ((decision?.flags ?? []) as { kind: string; count: number }[]) ?? [],
		assessmentStatus: a.assessmentStatus,
		assessment: a.assessmentStatus === 'ready' ? (a.assessment as unknown as ExamAssessment) : null,
		isRepeat: a.exam.isRepeat
	}
}

export interface StandingRow {
	rank: number | null
	ranked: boolean
	name: string
	isYou: boolean
	codingScore: number
	deductions: number
	finalScore: number
	testsPassed: number
	testsTotal: number
	elapsedSeconds: number | null
	status: string
}

export async function leaderboardFor(
	examDate: string,
	viewerId: string | null
): Promise<{ published: boolean; isRepeat: boolean; rows: StandingRow[] }> {
	const exam = await db.dailyExam.findUnique({
		where: { examDate: dayColumn(examDate) },
		select: { status: true, correctionCount: true, isRepeat: true }
	})
	if (exam == null || (exam.status !== 'published' && exam.status !== 'archived'))
		return { published: false, isRepeat: false, rows: [] }
	const rows = await db.examStanding.findMany({
		where: { examDate: dayColumn(examDate), version: exam.correctionCount },
		orderBy: [{ ranked: 'desc' }, { rank: 'asc' }, { id: 'asc' }]
	})
	return {
		published: true,
		isRepeat: exam.isRepeat,
		rows: rows.map((r) => ({
			rank: r.rank,
			ranked: r.ranked,
			name: r.userId == null ? 'Removed participant' : (r.displayName ?? 'Anonymous participant'),
			isYou: viewerId != null && r.userId === viewerId,
			codingScore: r.codingScore,
			deductions: r.deductions,
			finalScore: r.finalScore,
			testsPassed: r.testsPassed,
			testsTotal: r.testsTotal,
			elapsedSeconds: r.elapsedSeconds,
			status: r.status
		}))
	}
}
