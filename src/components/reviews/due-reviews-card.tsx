import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { topicLabel } from '@/lib/home/problem-rows'
import { PROBLEMS } from '@/lib/trace/problems'
import { REVIEW_STAGES } from '@/lib/reviews/review-schedule'
import { getDueReviews } from '@/server/reviews/reviews'
import { DifficultyPill } from '@/components/dashboard/difficulty-pill'
import styles from '@/components/dashboard/dashboard.module.css'

// The Overview's "Due for review" card (specs/features/spaced-review.md). Nothing for
// a signed-out visitor. Each row is a problem whose scheduled review is due today or
// overdue; "Start review" opens the normal practice workspace — there is no separate
// editor, and opening it completes nothing: only a passing, meaningful run does.
// Wrapped in <Suspense> by the page so the query never delays it. Not a measure of
// what the learner remembers, and it says so.
const MAX_ROWS = 5

export async function DueReviewsCard() {
	const [t, td, view] = await Promise.all([
		getTranslations('Dashboard.reviews'),
		getTranslations('ProgressPage.recommendations.difficulty'),
		getDueReviews()
	])
	if (!view.authenticated) return null

	return (
		<section aria-labelledby="dashboard-reviews" className={styles.card} id="due-reviews">
			<div className={styles.cardHead}>
				<h2 id="dashboard-reviews" className={styles.cardTitle}>
					{t('heading')}
				</h2>
			</div>
			{!view.available ? (
				<p role="status" className={styles.note}>
					{t('unavailable')}
				</p>
			) : view.items.length === 0 ? (
				<p className={styles.note}>{t('empty')}</p>
			) : (
				<>
					<ul className={styles.rows}>
						{view.items.slice(0, MAX_ROWS).map((item) => {
							const problem = PROBLEMS[item.slug]
							if (problem == null) return null
							return (
								<li key={item.slug} className={styles.row}>
									<div className={styles.rowMain}>
										<span className={styles.rowTitle}>{problem.title}</span>
										<span className={styles.rowMeta}>
											<span>{problem.conceptTags.map(topicLabel).join(' · ')}</span>
											<DifficultyPill
												difficulty={problem.difficulty}
												label={td(problem.difficulty)}
											/>
											<span className={styles.statusPill}>
												{t('stage', { stage: item.stage, total: REVIEW_STAGES })}
											</span>
											<span>
												{item.label.kind === 'overdue'
													? t('overdue', { count: item.label.days })
													: t('dueToday')}
											</span>
										</span>
									</div>
									<Link
										href={`/practice/${item.slug}`}
										className={styles.rowAction}
										aria-label={t('startLabel', { title: problem.title })}
									>
										{t('start')}
									</Link>
								</li>
							)
						})}
					</ul>
					{view.items.length > MAX_ROWS ? (
						<p className={styles.note} style={{ marginTop: 10 }}>
							{t('more', { count: view.items.length - MAX_ROWS })}
						</p>
					) : null}
				</>
			)}
			<p className={styles.note} style={{ marginTop: 12, fontSize: 12.5 }}>
				{t('note')}
			</p>
		</section>
	)
}
