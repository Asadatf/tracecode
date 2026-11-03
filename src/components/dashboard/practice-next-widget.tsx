import { getTranslations } from 'next-intl/server'
import { PROBLEMS } from '@/lib/trace/problems'
import { chipLabel, topicsBySlug } from '@/lib/learning/summary-topics'
import type { Recommendation } from '@/lib/learning/recommend'
import { PracticeNextInsight, type NextProblem } from './practice-next-insight'
import styles from './dashboard.module.css'

// The lower half of the dashboard's combined card: the same recommendation and
// refresh action as /progress, in the dashboard's own short wording.
export async function PracticeNextWidget({
	recommendation,
	canRefresh
}: {
	recommendation: Recommendation
	canRefresh: boolean
}) {
	const [t, insight] = await Promise.all([
		getTranslations('Dashboard.next'),
		getTranslations('ProgressPage.recommendations.insight')
	])
	const problems = Object.values(PROBLEMS)
	const byTitle: Record<string, NextProblem> = Object.fromEntries(
		problems.map((problem) => [
			problem.slug,
			{ title: problem.title, tags: problem.conceptTags.map(chipLabel) }
		])
	)

	return (
		<section aria-labelledby="dashboard-next" className={styles.nextPart}>
			<h2 id="dashboard-next" className="sr-only">
				{t('heading')}
			</h2>
			{recommendation.rankedProblems[0] == null ? (
				<p className={styles.note}>{t('empty')}</p>
			) : (
				<PracticeNextInsight
					initial={recommendation}
					canRefresh={canRefresh}
					problems={byTitle}
					topicsBySlug={topicsBySlug(problems)}
					labels={{
						insight: t('insight'),
						upNext: t('upNext'),
						start: t('start'),
						continue: t('continue'),
						open: t('open'),
						aiTag: t('aiTag'),
						refresh: t('refresh'),
						refreshing: insight('refreshing'),
						outcomes: {
							refreshed: t('refreshed'),
							up_to_date: insight('upToDate'),
							cooldown: insight('cooldown'),
							running: insight('running'),
							failed: insight('failed')
						}
					}}
				/>
			)}
		</section>
	)
}
