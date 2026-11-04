import { getTranslations } from 'next-intl/server'
import { FlameIcon } from '@/components/ui/icons'
import { ActivityHeatmap } from '@/components/activity/activity-heatmap'
import { loadPublicProfileStats, type PublicProfileOwner } from '@/server/profile/public-profile'
import styles from './profile.module.css'

// The statistics half of a public profile: streaks, totals, the contribution graph
// and topic coverage. Everything comes from `loadPublicProfileStats(owner)` for the
// RESOLVED owner, so it can only ever describe that profile, whoever is viewing.
// Read-only: no control here changes anything. Wrapped in <Suspense> by the page.
export async function PublicProfileBody({ owner }: { owner: PublicProfileOwner }) {
	const [t, result] = await Promise.all([
		getTranslations('PublicProfile'),
		loadPublicProfileStats(owner)
	])

	if (result.status === 'unavailable') {
		return (
			<p role="status" className={`${styles.card} ${styles.note} ${styles.warn}`}>
				{t('unavailable')}
			</p>
		)
	}
	const { stats } = result
	const practised = stats.topics.filter((topic) => topic.attempted > 0).length

	return (
		<>
			<dl className={styles.stats}>
				<div className={styles.stat}>
					<dt className={styles.statLabel}>{t('stats.solved')}</dt>
					<dd className={styles.statValue}>
						{stats.solved}
						<span className={styles.statUnit}>
							{t('stats.solvedOf', { total: stats.totalProblems })}
						</span>
					</dd>
				</div>
				<div className={styles.stat}>
					<dt className={styles.statLabel}>{t('stats.runs')}</dt>
					<dd className={styles.statValue}>{stats.runs}</dd>
				</div>
				<div className={styles.stat}>
					<dt className={styles.statLabel}>{t('stats.current')}</dt>
					<dd className={styles.statValue}>
						<FlameIcon
							size={22}
							className={stats.streak.active ? styles.flameActive : styles.flame}
						/>
						{stats.streak.current}
						<span className={styles.statUnit}>
							{t('stats.days', { count: stats.streak.current })}
						</span>
					</dd>
				</div>
				<div className={styles.stat}>
					<dt className={styles.statLabel}>{t('stats.longest')}</dt>
					<dd className={styles.statValue}>
						{stats.streak.longest}
						<span className={styles.statUnit}>
							{t('stats.days', { count: stats.streak.longest })}
						</span>
					</dd>
				</div>
			</dl>

			{stats.empty ? (
				<p className={`${styles.card} ${styles.note}`}>
					{t('empty', { username: owner.username })}
				</p>
			) : null}

			<section aria-labelledby="profile-activity" className={styles.card}>
				<h2 id="profile-activity" className={styles.cardTitle}>
					{t('activity')}
				</h2>
				<ActivityHeatmap days={stats.days} today={stats.today} headingId="profile-activity" />
			</section>

			<section aria-labelledby="profile-topics" className={styles.card}>
				<h2 id="profile-topics" className={styles.cardTitle}>
					{t('topics.heading')}
				</h2>
				<p className={styles.note} style={{ marginBottom: 14 }}>
					{t('topics.summary', { practised, total: stats.topics.length })}
				</p>
				<ul className={styles.topics}>
					{stats.topics.map((topic) => (
						<li key={topic.topic}>
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
			</section>
		</>
	)
}
