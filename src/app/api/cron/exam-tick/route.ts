import { NextResponse } from 'next/server'
import { createCronRoute } from '@/server/api/route-factory'
import { captureError } from '@/lib/observability/capture-error'
import { db } from '@/server/db/client'
import { examDateOf } from '@/lib/exam/schedule'
import { ensureExam, examEnabled, openIfDue } from '@/server/exam/exam'
import { runExamWorker } from '@/server/exam/jobs'

// GET /api/cron/exam-tick — one bounded worker invocation of the M10 durable queue
// (specs/features/daily-exam.md AC4, AC40). CRON_SECRET-guarded; returns counts only. Called by
// .github/workflows/exam-tick.yml every 5 minutes in the processing windows (best effort) and
// by participants' nudges; correctness never depends on when it runs.
export const maxDuration = 300

export const GET = createCronRoute(async () => {
	try {
		// Today's exam exists only while the exam is switched on for everyone.
		if (await examEnabled()) await ensureExam(examDateOf(new Date()))
		const due = await db.dailyExam.findMany({
			where: { status: 'scheduled', opensAt: { lte: new Date() }, closesAt: { gt: new Date() } },
			select: { examDate: true },
			take: 10
		})
		for (const e of due) await openIfDue(e.examDate.toISOString().slice(0, 10))
		const stats = await runExamWorker({ claimBudgetMs: 240_000 })
		const backlog = await db.examJob.groupBy({
			by: ['type', 'status'],
			_count: true,
			where: { status: { in: ['pending', 'running', 'dead'] } }
		})
		return NextResponse.json({
			stats,
			backlog: backlog.map((b) => ({ type: b.type, status: b.status, n: b._count }))
		})
	} catch (error) {
		const { status } = captureError(error, { area: 'exam-tick' })
		return NextResponse.json({ error: 'Exam tick failed' }, { status })
	}
})
