import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { PROBLEMS } from '@/lib/trace/problems'
import { buildProgressView } from '@/lib/progress/progress-view'
import { buildProblemSummaries } from '@/lib/problems/problem-summary'
import { getFirstAttemptDates, getLearningProgress } from '@/server/learning/progress'
import { AppShell } from '@/components/app-shell/app-shell'
import { getChallenge, getMyAttempt, getPinnedChallenges } from '@/server/challenge/challenge'
import { ProblemCalendar } from '@/components/problems/problem-calendar'
import { ProblemList } from '@/components/problems/problem-list'
import dashboard from '@/components/dashboard/dashboard.module.css'
import styles from '@/components/problems/problems.module.css'

// specs/features/problems-page.md. A personal page → noindex, which also opts
// it out of the SEO PUBLIC_PAGES requirement.
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('ProblemsPage')
	return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

export default async function ProblemsPage() {
	// No session, no page (AC1): checked before progress is read.
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({ href: '/login?next=%2Fproblems', locale: await getLocale() })
		return null
	}
	const todayIso = new Date().toISOString().slice(0, 10)
	const [t, progress, firstAttempts, pinned] = await Promise.all([
		getTranslations('ProblemsPage'),
		getLearningProgress(),
		getFirstAttemptDates(),
		// Today's challenge is pinned the first time it is needed, so the calendar can
		// name it; the pinned map covers today and earlier only, never a future date.
		getChallenge(todayIso).then(() => getPinnedChallenges())
	])
	const todaySlug = pinned[todayIso]
	const today = todaySlug == null ? null : await getMyAttempt(account.id, todayIso)
	const todayView = today != null && today.available ? today.view : null
	// Completed only by a fully passing graded final submission; a failed or still-pending one
	// reads as "Submitted". Nothing is scored.
	const todayState =
		todayView == null || todayView.submittedAt == null
			? 'open'
			: todayView.phase === 'graded' && todayView.testsPassed === todayView.testsTotal
				? 'completed'
				: 'submitted'
	const problems = Object.values(PROBLEMS)
	// Statuses are shown only when saved progress could actually be read.
	const view =
		progress.authenticated && progress.available ? buildProgressView(problems, progress) : null
	const summaries = buildProblemSummaries(problems, view, firstAttempts)

	return (
		<AppShell current="problems">
			<header className={dashboard.head}>
				<p className={dashboard.eyebrow}>{t('eyebrow')}</p>
				<h1 className={dashboard.title}>{t('heading')}</h1>
			</header>
			<div className={styles.boardCal}>
				<div className={dashboard.centre}>
					<ProblemList tracked={view != null} rows={summaries} />
				</div>
				<aside className={styles.sideCal}>
					<ProblemCalendar
						pinned={pinned}
						titles={Object.fromEntries(problems.map((problem) => [problem.slug, problem.title]))}
						todayIso={todayIso}
						todayState={todayState}
						labels={{
							dayHeading: t('calendar.dayHeading', { day: '{day}' }),
							timeLeft: t('calendar.timeLeft', { time: '{time}' }),
							previous: t('calendar.previous'),
							next: t('calendar.next'),
							todaysProblem: t('calendar.todaysProblem'),
							dayLabel: t('calendar.dayLabel', { date: '{date}', title: '{title}' }),
							dayLabelPlain: t('calendar.dayLabelPlain', { date: '{date}' }),
							dayLocked: t('calendar.dayLocked', { date: '{date}' }),
							dayNone: t('calendar.dayNone', { date: '{date}' }),
							openToday: t('calendar.openToday'),
							todayDone: t('calendar.todayDone'),
							todaySubmitted: t('calendar.todaySubmitted')
						}}
					/>
				</aside>
			</div>
		</AppShell>
	)
}
