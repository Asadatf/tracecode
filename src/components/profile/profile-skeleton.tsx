import styles from './profile.module.css'

// The statistics' loading state: the same footprint as the stats grid and the graph
// panel, so the page does not jump when they arrive. Announced as busy, never as
// "empty".
export function StatsSkeleton({ label }: { label: string }) {
	return (
		<div role="status" aria-busy="true" aria-label={label} className={styles.stats}>
			{[0, 1, 2, 3].map((n) => (
				<div key={n} className={`${styles.skeleton} ${styles.skStat}`} aria-hidden="true" />
			))}
		</div>
	)
}

export function ActivitySkeleton() {
	return (
		<div className={`${styles.panel} ${styles.skPanel}`} aria-hidden="true">
			<div className={`${styles.skeleton} ${styles.skGraph}`} />
		</div>
	)
}
