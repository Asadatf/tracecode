import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { PROBLEMS } from '@/lib/trace/problems'
import { getDueReviews } from '@/server/reviews/reviews'
import styles from '@/components/dashboard/dashboard.module.css'

// The "Up next" panel's pointer to due reviews. Spaced reviews are a SEPARATE source
// from the recommendation engine (which ranks what to try next from the learner's
// evidence and is cached by that evidence): a due date changes with time, so it is
// shown beside the recommendation, clearly labelled, never merged into or replacing
// it. Nothing renders unless something is actually due.
export async function DueReviewCallout() {
	const [t, view] = await Promise.all([getTranslations('Dashboard.reviews'), getDueReviews()])
	if (!view.authenticated || !view.available || view.items.length === 0) return null
	const first = view.items[0]
	const problem = first == null ? undefined : PROBLEMS[first.slug]
	if (first == null || problem == null) return null

	return (
		<div className={styles.reviewCallout}>
			<p className={styles.reviewCalloutLabel}>{t('calloutLabel')}</p>
			<Link href={`/practice/${first.slug}`} className={styles.reviewCalloutLink}>
				{view.items.length === 1
					? t('calloutOne', { title: problem.title })
					: t('calloutMany', { title: problem.title, others: view.items.length - 1 })}
			</Link>
		</div>
	)
}
