import 'server-only'
import { db } from '@/server/db/client'
import type { ProblemDefinition } from '@/lib/trace/problem'

// A Daily Exam problem as an ordinary Practice problem, ONLY once it is public: the read-time
// publication gate (AC30: now >= publishAt, credit written) for a first use, and never while any
// exam on it is open or not yet credited (AC49's Practice lock). Returns the public practice set as
// `tests`; hidden cases and reference solutions are never selected.
export async function publishedExamProblem(slug: string): Promise<ProblemDefinition | null> {
	const p = await db.examProblem.findUnique({
		where: { slug },
		select: {
			id: true,
			slug: true,
			title: true,
			entry: true,
			statement: true,
			examples: true,
			starter: true,
			practiceTests: true
		}
	})
	if (p == null) return null
	const exams = await db.dailyExam.findMany({
		where: { problemId: p.id },
		select: { status: true, publishAt: true, openedAt: true }
	})
	const now = Date.now()
	const published = exams.some((e) => e.status === 'archived' && now >= e.publishAt.getTime())
	// Locked while examined: opened but not yet archived (credit written).
	const locked = exams.some(
		(e) => e.openedAt != null && e.status !== 'archived' && e.status !== 'cancelled'
	)
	if (!published || locked) return null
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
