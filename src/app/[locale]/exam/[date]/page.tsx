import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { AppShell } from '@/components/app-shell/app-shell'
import { ExamRoom } from '@/components/exam/exam-room'
import {
	ensureExam,
	examEnabled,
	examProblemFor,
	examPublicView,
	myAttempt,
	openIfDue,
	todayExamDate
} from '@/server/exam/exam'

// The M10 Daily Exam (specs/features/daily-exam.md). Account-only and noindex. While `daily_exam`
// is off for this learner the page does not exist. The problem statement reaches the browser only
// for an admitted participant while the exam is open (AC5, AC9).
export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Daily Exam | TraceCode', robots: { index: false, follow: false } }
}

export default async function ExamPage({
	params
}: {
	params: Promise<{ locale: string; date: string }>
}) {
	const { date } = await params
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({
			href: `/login?next=${encodeURIComponent(`/exam/${date}`)}`,
			locale: await getLocale()
		})
		return null
	}
	if (!(await examEnabled(account.id))) notFound()
	if (date === todayExamDate()) await ensureExam(date)
	await openIfDue(date)
	const view = await examPublicView(date)
	if (view == null) notFound()
	const [attempt, problem] = await Promise.all([
		myAttempt(account.id, date),
		examProblemFor(account.id, date)
	])
	return (
		<AppShell bare startCollapsed>
			<div data-in-shell>
				<ExamRoom
					date={date}
					initialView={view}
					attempt={attempt == null ? null : { status: attempt.status, autosave: attempt.autosave }}
					problem={attempt?.status === 'admitted' ? problem : null}
				/>
			</div>
		</AppShell>
	)
}
