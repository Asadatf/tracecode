import { getTranslations } from 'next-intl/server'
import { PROBLEMS } from '@/lib/trace/problems'
import { topicsBySlug } from '@/lib/learning/summary-topics'
import type { Recommendation } from '@/lib/learning/recommend'
import {
	RecommendationInsight,
	type InsightLabels
} from '@/components/progress/recommendation-insight'
import styles from './dashboard.module.css'

// "What to practise next" for the dashboard: the same recommendation and the
// same refresh action as /progress, laid out as heading, one activity card
// (summary, next step with Start, note, refresh) and the focus concepts after
// it. All of that lives in RecommendationInsight so a refresh updates it whole.
export async function PracticeNextWidget({
	recommendation,
	canRefresh
}: {
	recommendation: Recommendation
	canRefresh: boolean
}) {
	const t = await getTranslations('ProgressPage.recommendations')

	const labels: InsightLabels = {
		aiHeading: t('insight.aiHeading'),
		fallbackHeading: t('insight.fallbackHeading'),
		aiDisclaimer: t('insight.aiDisclaimer'),
		fallbackDisclaimer: t('insight.fallbackDisclaimer'),
		nextStepLabel: t('insight.nextStep'),
		refresh: t('insight.refresh'),
		refreshing: t('insight.refreshing'),
		upToDate: t('insight.upToDate'),
		cooldown: t('insight.cooldown'),
		running: t('insight.running'),
		failed: t('insight.failed')
	}

	return (
		<section
			aria-labelledby="dashboard-next"
			className={`${styles.floatLight} ${styles.float} ${styles.nextWidget}`}
		>
			<header className={styles.nextHead}>
				<h2 id="dashboard-next" className={styles.cardTitle}>
					{t('heading')}
				</h2>
				<p>{t('subheading')}</p>
			</header>
			{recommendation.rankedProblems[0] == null ? (
				<p className={styles.note}>{t('empty')}</p>
			) : (
				<RecommendationInsight
					initial={recommendation}
					canRefresh={canRefresh}
					labels={labels}
					dashboard={{
						topicsBySlug: topicsBySlug(Object.values(PROBLEMS)),
						startLabels: {
							start: t('action.start'),
							continue: t('action.continue'),
							open: t('action.open')
						},
						focusLabel: t('focusConcepts')
					}}
				/>
			)}
		</section>
	)
}
