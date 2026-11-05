import { getTranslations } from 'next-intl/server'
import { FlameIcon } from '@/components/ui/icons'
import { ProfileIdentity } from './profile-identity'
import { ActivityHeatmap } from '@/components/activity/activity-heatmap'
import { loadPublicProfileStats, type PublicProfileOwner } from '@/server/profile/public-profile'
import styles from './profile.module.css'

// The data half of a public profile, both panels: the identity panel with its four
// statistics, and the contribution graph. Everything comes from `loadPublicProfileStats(owner)` for the
// RESOLVED owner, so it can only ever describe that profile, whoever is viewing.
// Read-only: no control here changes anything. Wrapped in <Suspense> by the page.
export async function PublicProfileBody({
	owner,
	url
}: {
	owner: PublicProfileOwner
	url: string
}) {
	const [t, result] = await Promise.all([
		getTranslations('PublicProfile'),
		loadPublicProfileStats(owner)
	])

	if (result.status === 'unavailable') {
		return (
			<>
				<ProfileIdentity username={owner.username} url={url}>
					<span aria-hidden="true" />
				</ProfileIdentity>
				<p role="status" className={`${styles.panel} ${styles.note} ${styles.warn}`}>
					{t('unavailable')}
				</p>
			</>
		)
	}
	const { stats } = result

	return (
		<>
			<ProfileIdentity username={owner.username} url={url}>
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
			</ProfileIdentity>

			<section aria-labelledby="profile-activity" className={styles.panel}>
				<h2 id="profile-activity" className={styles.panelTitle}>
					{t('activity')}
				</h2>
				{stats.empty ? (
					<p className={styles.note}>{t('empty', { username: owner.username })}</p>
				) : null}
				<ActivityHeatmap
					days={stats.days}
					today={stats.today}
					headingId="profile-activity"
					showDisclaimer={false}
				/>
			</section>
		</>
	)
}
