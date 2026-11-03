'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { useProblemDetail } from '@/components/problems/problem-detail-modal'
import { practiceAction, type ProblemSummary } from '@/lib/problems/problem-summary'
import styles from './dashboard.module.css'

// The Overview's "Progress" card (dashboard-page AC25): the five most recently
// attempted distinct problems, one row each with its status and attempt count.
// A row opens the shared detail modal; the action link goes to the real practice
// page (Continue while unsolved, Reattempt once solved).
export function ProgressCard({ items }: { items: ProblemSummary[] }) {
	const t = useTranslations('Dashboard.progress')
	const td = useTranslations('ProblemDetail')
	const { open, modal } = useProblemDetail()

	return (
		<section aria-labelledby="dashboard-progress" className={styles.card}>
			<div className={styles.cardHead}>
				<h2 id="dashboard-progress" className={styles.cardTitle}>
					{t('heading')}
				</h2>
			</div>
			{items.length === 0 ? (
				<p className={styles.note}>{t('empty')}</p>
			) : (
				<ul className={styles.rows}>
					{items.map((item) => (
						<li key={item.slug} className={styles.row}>
							<button
								type="button"
								className={styles.rowButton}
								aria-haspopup="dialog"
								aria-label={t('open', { title: item.title })}
								onClick={() => open(item)}
							>
								<span className={styles.rowTitle}>{item.title}</span>
								<span className={styles.rowMeta}>
									<span>{item.topics}</span>
									<span className={styles.statusPill}>{td(`statuses.${item.status}`)}</span>
									<span>{t('attempts', { count: item.attempts })}</span>
								</span>
							</button>
							<Link href={`/practice/${item.slug}`} className={styles.rowAction}>
								{td(practiceAction(item.status))}
							</Link>
						</li>
					))}
				</ul>
			)}
			{modal}
		</section>
	)
}
