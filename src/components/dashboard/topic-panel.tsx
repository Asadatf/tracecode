import { getTranslations } from 'next-intl/server'
import type { TopicRow } from '@/lib/progress/progress-view'
import styles from './dashboard.module.css'

// By topic (dashboard-page AC7): the text `solved/total` is the value; the bar
// is decoration, so it is hidden from assistive tech.
export async function TopicPanel({ topics }: { topics: TopicRow[] }) {
	const t = await getTranslations('Dashboard.topics')

	return (
		<section aria-labelledby="dashboard-topics" className={styles.sideSection}>
			<div className={`${styles.floatCard} ${styles.float}`}>
				<h2 id="dashboard-topics" className={styles.cardTitle}>
					{t('heading')}
				</h2>
				<ul className={styles.topicList}>
					{topics.map((topic) => (
						<li key={topic.topic} className={styles.topic}>
							<div className={styles.topicRow}>
								<span>{topic.topic}</span>
								<span className={styles.topicCount}>
									{topic.solved}/{topic.total}
								</span>
							</div>
							<div className={styles.bar} aria-hidden="true">
								<div
									className={styles.barFill}
									style={{
										width: `${topic.total === 0 ? 0 : (topic.solved / topic.total) * 100}%`
									}}
								/>
							</div>
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}
