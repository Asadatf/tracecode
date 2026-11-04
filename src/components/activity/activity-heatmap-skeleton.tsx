import styles from './activity.module.css'

// The graph's loading state: the same footprint, no data, so the card does not
// jump when the activity arrives. Announced as busy, never as "no practice".
export function ActivityHeatmapSkeleton({ label }: { label: string }) {
	return (
		<div className={styles.root} role="status" aria-busy="true" aria-label={label}>
			<div className={styles.skeleton} />
		</div>
	)
}
