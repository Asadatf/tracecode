import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import type { ProblemTable } from '@/lib/home/problem-rows'
import dashboard from '@/components/dashboard/dashboard.module.css'
import styles from './problems.module.css'

// Every problem in registry order with the learner's status (problems-page
// AC3–AC6). Labels reuse the landing table's ProblemTable namespace.
export async function ProblemList({ table }: { table: ProblemTable }) {
	const [t, tl] = await Promise.all([
		getTranslations('ProblemsPage'),
		getTranslations('ProblemTable')
	])
	const columns = ['number', 'title', 'topics', 'difficulty', 'status'] as const
	const solved = table.rows.filter((row) => row.status === 'solved').length

	return (
		<section aria-labelledby="problems-list" className={dashboard.card}>
			<div className={dashboard.topicsHead}>
				<h2 id="problems-list" className={dashboard.cardTitle}>
					{t('listHeading')}
				</h2>
				{table.tracked ? (
					<span
						className={styles.tally}
						title={t('tally', { solved, total: table.rows.length })}
						aria-label={t('tally', { solved, total: table.rows.length })}
					>
						{solved}/{table.rows.length}
					</span>
				) : null}
			</div>
			{table.rows.length === 0 ? (
				<p className={dashboard.note}>{tl('empty')}</p>
			) : (
				<div className={dashboard.tableWrap}>
					<table className={dashboard.table}>
						<thead>
							<tr>
								{columns.map((column) => (
									<th key={column} scope="col">
										{tl(`columns.${column}`)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{table.rows.map((row) => (
								<tr key={row.slug} className={styles.row}>
									<td className={styles.number}>{row.number}</td>
									<td className={dashboard.problemCell}>
										<Link href={`/practice/${row.slug}`}>{row.title}</Link>
									</td>
									<td className={styles.topics}>{row.topics}</td>
									<td>
										<span className={`${styles.pill} ${styles[row.difficulty]}`}>
											{tl(`difficulty.${row.difficulty}`)}
										</span>
									</td>
									<td>
										<span className={`${styles.pill} ${styles[row.status]}`}>
											{tl(`status.${row.status}`)}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	)
}
