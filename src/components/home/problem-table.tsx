import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { authHref } from '@/lib/auth/return-to'
import { isGuestPracticeSlug } from '@/lib/auth/access'
import { LockIcon } from '@/components/ui/icons'
import type { ProblemTable as ProblemTableData } from '@/lib/home/problem-rows'
import styles from './landing.module.css'

// The home page's problem list (specs/features/home-page.md, AC6–AC8).
export async function ProblemTable({
	table,
	authenticated
}: {
	table: ProblemTableData
	authenticated: boolean
}) {
	const t = await getTranslations('ProblemTable')
	const columns = ['number', 'title', 'topics', 'difficulty', 'status'] as const

	return (
		<section id="problems" aria-labelledby="problems-heading" className={styles.catalogSection}>
			<div className={styles.catalogIntro}>
				<p className={styles.catalogKicker}>{t('kicker')}</p>
				<h2 id="problems-heading" className={styles.catalogTitle}>
					{t('heading')}
				</h2>
				<p className={styles.catalogDescription}>{t('description')}</p>
			</div>
			<div className={styles.tableFrame}>
				<table className={styles.table}>
					<thead>
						<tr className={styles.tableHead}>
							{columns.map((column) => (
								<th key={column} scope="col">
									{t(`columns.${column}`)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{table.rows.length === 0 ? (
							<tr className={styles.tableRow}>
								<td colSpan={columns.length}>{t('empty')}</td>
							</tr>
						) : (
							table.rows.map((row) => {
								// Signed-out visitors can open Two Sum only; the rest route through
								// Sign In and come back here (specs/features/auth-access.md AC5).
								const locked = !authenticated && !isGuestPracticeSlug(row.slug)
								return (
									<tr key={row.slug} className={styles.tableRow}>
										<td className={styles.problemNumber}>{row.number}</td>
										<td>
											{locked ? (
												<Link
													href={authHref('login', `/practice/${row.slug}`)}
													className={`${styles.problemTitle} ${styles.lockedTitle}`}
												>
													<LockIcon size={14} />
													{row.title}
												</Link>
											) : (
												<Link href={`/practice/${row.slug}`} className={styles.problemTitle}>
													{row.title}
												</Link>
											)}
										</td>
										<td className={styles.problemTopics}>{row.topics}</td>
										<td className={styles.problemDifficulty}>
											{t(`difficulty.${row.difficulty}`)}
										</td>
										<td className={styles.problemStatus}>
											{locked ? (
												<span className={styles.lockedNote}>{t('locked')}</span>
											) : !authenticated ? (
												<span className={styles.lockedNote}>{t('free')}</span>
											) : (
												t(`status.${row.status}`)
											)}
										</td>
									</tr>
								)
							})
						)}
					</tbody>
				</table>
			</div>
			{table.tracked ? null : <p className={styles.signIn}>{t('signIn')}</p>}
		</section>
	)
}
