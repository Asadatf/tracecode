import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { PROBLEMS } from '@/lib/trace/problems'
import { buildProgressView } from '@/lib/progress/progress-view'
import { getLearningProgress } from '@/server/learning/progress'
import { getRecommendation, isRecommendationAiEnabled } from '@/server/learning/recommendation'
import { AppShell } from '@/components/app-shell/app-shell'
import { PracticeNextWidget } from '@/components/dashboard/practice-next-widget'
import { RecentRuns } from '@/components/dashboard/recent-runs'
import { SummaryStrip } from '@/components/dashboard/summary-strip'
import { TopicPanel } from '@/components/dashboard/topic-panel'
import styles from '@/components/dashboard/dashboard.module.css'

// specs/features/dashboard-page.md. A personal page → noindex, which also opts
// it out of the SEO PUBLIC_PAGES requirement.
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Dashboard')
	return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

export default async function DashboardPage() {
	// Personal data: no session, no page (AC1). Checked before any loader runs.
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({ href: '/login?next=%2Fdashboard', locale: await getLocale() })
		return null
	}
	// Independent reads start together. getRecommendation never calls the model.
	const [t, progress, recommendation] = await Promise.all([
		getTranslations('Dashboard'),
		getLearningProgress(),
		getRecommendation()
	])
	const view =
		progress.authenticated && progress.available
			? buildProgressView(Object.values(PROBLEMS), progress)
			: null

	return (
		<AppShell current="overview">
			<header className={styles.head}>
				<p className={styles.eyebrow}>{t('eyebrow')}</p>
				<h1 className={styles.title}>{t('heading')}</h1>
			</header>
			<div className={styles.board}>
				<div className={styles.centre}>
					{view == null ? (
						<p className={styles.unavailable}>{t('unavailable')}</p>
					) : (
						<>
							<SummaryStrip summary={view.summary} />
							<div className={styles.recent}>
								<RecentRuns runs={view.recent} />
							</div>
						</>
					)}
				</div>
				{view == null ? null : (
					<aside className={styles.side}>
						<div className={`${styles.mergedCard} ${styles.float}`}>
							<TopicPanel topics={view.topics} />
							{recommendation.authenticated && recommendation.available ? (
								<PracticeNextWidget
									recommendation={recommendation.recommendation}
									canRefresh={isRecommendationAiEnabled()}
								/>
							) : null}
						</div>
					</aside>
				)}
			</div>
		</AppShell>
	)
}
