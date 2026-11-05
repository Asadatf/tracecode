import styles from '@/components/dashboard/dashboard.module.css'

// The card's loading state: the same card footprint, announced as busy, never as
// "nothing is due".
export function DueReviewsSkeleton({ label }: { label: string }) {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label={label}
			className={styles.card}
			style={{ minHeight: 148, opacity: 0.6 }}
		/>
	)
}
