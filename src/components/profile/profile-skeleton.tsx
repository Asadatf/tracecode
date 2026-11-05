import styles from './profile.module.css'

// The statistics' loading state: the same footprint as the stats, graph and topics,
// so the page does not jump when they arrive. Announced as busy, never as "empty".
export function ProfileSkeleton({ label }: { label: string }) {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label={label}
			className={styles.main}
			style={{ padding: 0 }}
		>
			<div className={styles.stats} aria-hidden="true">
				{[0, 1, 2, 3].map((n) => (
					<div key={n} className={`${styles.skeleton} ${styles.skStat}`} />
				))}
			</div>
			<div className={`${styles.skeleton} ${styles.skGraph}`} aria-hidden="true" />
			<div className={`${styles.skeleton} ${styles.skTopics}`} aria-hidden="true" />
		</div>
	)
}
