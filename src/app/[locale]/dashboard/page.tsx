import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { PROBLEMS } from '@/lib/trace/problems'
import { buildProgressView } from '@/lib/progress/progress-view'
import { buildDashboardSections } from '@/lib/progress/dashboard-sections'
import { buildProblemSummaries } from '@/lib/problems/problem-summary'
import { getFirstAttemptDates, getLearningProgress } from '@/server/learning/progress'
import { getRecommendation, isRecommendationAiEnabled } from '@/server/learning/recommendation'
import { AppShell } from '@/components/app-shell/app-shell'
import { DueReviewCallout } from '@/components/reviews/due-review-callout'
import { DueReviewsCard } from '@/components/reviews/due-reviews-card'
import { DueReviewsSkeleton } from '@/components/reviews/due-reviews-skeleton'
import { ActivityHeatmapSlot } from '@/components/activity/activity-heatmap-slot'
import { ActivityHeatmapSkeleton } from '@/components/activity/activity-heatmap-skeleton'
import { PracticeNextWidget } from '@/components/dashboard/practice-next-widget'
import { ExploreProblems } from '@/components/dashboard/explore-problems'
import { ProgressCard } from '@/components/dashboard/progress-card'
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
	const [t, ta, tr, progress, recommendation, firstAttempts] = await Promise.all([
		getTranslations('Dashboard'),
		getTranslations('Activity'),
		getTranslations('Dashboard.reviews'),
		getLearningProgress(),
		getRecommendation(),
		getFirstAttemptDates()
	])
	const problems = Object.values(PROBLEMS)
	const view =
		progress.authenticated && progress.available ? buildProgressView(problems, progress) : null
	// The ranking is the right-hand panel's own: Explore follows it but never repeats
	// its top pick while there is anything else to show.
	const sections =
		view == null
			? null
			: buildDashboardSections(
					buildProblemSummaries(problems, view, firstAttempts),
					recommendation.authenticated && recommendation.available
						? { rankedSlugs: recommendation.recommendation.rankedProblems.map((r) => r.slug) }
						: null
				)

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
							<div className={styles.reviews}>
								<Suspense fallback={<DueReviewsSkeleton label={tr('loading')} />}>
									<DueReviewsCard />
								</Suspense>
							</div>
							<div className={styles.activity}>
								<Suspense fallback={<ActivityHeatmapSkeleton label={ta('loading')} />}>
									<ActivityHeatmapSlot />
								</Suspense>
							</div>
							{sections == null ? null : (
								<>
									<div className={styles.yours}>
										<ProgressCard items={sections.progress} />
									</div>
									<div className={styles.explore}>
										<ExploreProblems items={sections.explore} />
									</div>
								</>
							)}
						</>
					)}
				</div>
				{view == null ? null : (
					<aside className={styles.side}>
						<div className={`${styles.mergedCard} ${styles.float}`}>
							<TopicPanel topics={view.topics} />
							<Suspense fallback={null}>
								<DueReviewCallout />
							</Suspense>
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
