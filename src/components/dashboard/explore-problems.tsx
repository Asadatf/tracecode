import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import type { ProblemSummary } from '@/lib/problems/problem-summary'
import { DifficultyPill } from './difficulty-pill'
import styles from './dashboard.module.css'

// Explore problems (dashboard-page AC27): up to three problems the learner has not
// attempted yet, each with a Start link to its practice page, and a link to the
// full catalogue.
export async function ExploreProblems({ items }: { items: ProblemSummary[] }) {
	const [t, tl] = await Promise.all([
		getTranslations('Dashboard.explore'),
		getTranslations('ProblemTable')
	])

	return (
		<section aria-labelledby="dashboard-explore" className={styles.card}>
			<div className={styles.cardHead}>
				<h2 id="dashboard-explore" className={styles.cardTitle}>
					{t('heading')}
				</h2>
				<Link href="/problems" className={styles.moreLink}>
					{t('viewAll')}
				</Link>
			</div>
			{items.length === 0 ? (
				<p className={styles.note}>{t('empty')}</p>
			) : (
				<ul className={`${styles.rows} ${styles.rowsScroll}`}>
					{items.map((item) => (
						<li key={item.slug} className={styles.row}>
							<div className={styles.rowMain}>
								<Link href={`/practice/${item.slug}`} className={styles.rowTitle}>
									{item.title}
								</Link>
								<span className={styles.rowMeta}>
									<span>{item.topics}</span>
								</span>
							</div>
							<div className={styles.rowEnd}>
								<DifficultyPill
									difficulty={item.difficulty}
									label={tl(`difficulty.${item.difficulty}`)}
								/>
								<Link href={`/practice/${item.slug}`} className={styles.rowAction}>
									{t('start')}
								</Link>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	)
}
