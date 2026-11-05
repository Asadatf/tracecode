import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { PROBLEMS } from '@/lib/trace/problems'
import { toExamProblem } from '@/lib/challenge/exam-problem'
import { getChallenge, getMyAttempt } from '@/server/challenge/challenge'
import { getStoredAssessment } from '@/server/challenge/assessment'
import { activeGrader } from '@/server/challenge/grade'
import { ChallengeExam } from '@/components/challenge/challenge-exam'
import { AppShell } from '@/components/app-shell/app-shell'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import styles from '@/components/challenge/challenge.module.css'

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--tc-sans' })
const jetBrainsMono = JetBrains_Mono({
	subsets: ['latin'],
	weight: ['400', '600', '700'],
	variable: '--tc-mono'
})

// specs/features/daily-challenge.md. One designated problem per UTC day, the same for
// everyone, pinned the first time the date is needed. A FUTURE date is a 404 (it cannot
// be opened or previewed); a PAST date is practice only and never touches the weekly
// competition; only today's date can be started as a timed, scored attempt. A personal
// page → noindex.
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Challenge')
	return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

export default async function ChallengePage({
	params
}: {
	params: Promise<{ locale: string; date: string }>
}) {
	const { locale, date } = await params
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({
			href: `/login?next=${encodeURIComponent(`/challenge/${date}`)}`,
			locale: await getLocale()
		})
		return null
	}

	const [t, lookup] = await Promise.all([getTranslations('Challenge'), getChallenge(date)])
	if (
		lookup.status === 'invalid' ||
		lookup.status === 'locked' ||
		lookup.status === 'before_launch'
	)
		notFound()

	const header = (
		<header className={styles.top}>
			<Link href="/" className={styles.brand}>
				tracecode
			</Link>
		</header>
	)
	const problem = lookup.status === 'ok' ? PROBLEMS[lookup.problemSlug] : undefined
	if (lookup.status !== 'ok' || problem == null) {
		return (
			<div className={styles.page}>
				{header}
				<main className={styles.main}>
					<p role="status" className={styles.statement}>
						{t('unavailable')}
					</p>
				</main>
			</div>
		)
	}

	const exam = toExamProblem(problem)
	const heading = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
		new Date(`${date}T00:00:00.000Z`)
	)

	const [mine, grader] = await Promise.all([getMyAttempt(account.id, date), activeGrader()])
	const stored =
		mine.available && mine.view?.phase === 'graded'
			? await getStoredAssessment(account.id, date)
			: null
	// The learner's OWN attempt decides what to show, not today's date: one started late in
	// the day (say 23:50) keeps its full server deadline after midnight, and a finished
	// attempt stays visible. A past date with no attempt of theirs is practice only.
	const hasAttempt = mine.available && mine.view != null

	// A past challenge with no attempt of the learner's is practice only: straight into the
	// normal Practice workspace for that problem (no separate page).
	if (lookup.kind === 'past' && !hasAttempt) {
		redirect({ href: `/practice/${problem.slug}`, locale })
		return null
	}

	// The exam gets the same frame as Practice (app shell, full-height panes, same fonts).
	return (
		<div className={`${dmSans.variable} ${jetBrainsMono.variable}`}>
			<AppShell bare startCollapsed>
				<div data-in-shell>
					{mine.available ? (
						<ChallengeExam
							date={date}
							heading={heading}
							problem={exam}
							initial={mine.view}
							initialAssessment={stored}
							serverNow={new Date().toISOString()}
							gradingOn={grader != null}
						/>
					) : (
						<p role="status" className={styles.statement}>
							{t('unavailable')}
						</p>
					)}
				</div>
			</AppShell>
		</div>
	)
}
