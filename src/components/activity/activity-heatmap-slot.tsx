import { getTranslations } from 'next-intl/server'
import { getActivitySummary } from '@/server/learning/activity'
import { ActivityHeatmap } from './activity-heatmap'
import styles from '@/components/dashboard/dashboard.module.css'

// Server half of the Overview's "Practice activity" card. Nothing for a signed-out
// visitor. For a learner: the graph from the same cached activity read the toolbar
// flame uses, or the "unavailable" message when that read failed. Wrapped in
// <Suspense> by the page so the query never delays it.
export async function ActivityHeatmapSlot() {
	const [activity, t] = await Promise.all([getActivitySummary(), getTranslations('Activity')])
	if (!activity.authenticated) return null
	return (
		<section aria-labelledby="dashboard-activity" className={styles.card}>
			<div className={styles.cardHead}>
				<h2 id="dashboard-activity" className={styles.cardTitle}>
					{t('heading')}
				</h2>
			</div>
			<ActivityHeatmap
				days={activity.available ? activity.days : null}
				today={activity.available ? activity.today : ''}
				headingId="dashboard-activity"
			/>
		</section>
	)
}
