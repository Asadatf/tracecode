import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { LocalTime } from '@/components/local-time'
import { AlertIcon, SuccessIcon } from '@/components/ui/icons'
import { PROBLEMS } from '@/lib/trace/problems'
import type { RecentRun } from '@/lib/progress/progress-view'
import styles from './dashboard.module.css'

// Recent runs (dashboard-page AC6, AC13): newest first, the last 10 the loader
// returns. A run whose problem has left the catalogue shows as plain text.
export async function RecentRuns({ runs }: { runs: RecentRun[] }) {
	const t = await getTranslations('Dashboard.recent')

	return (
		<section aria-labelledby="dashboard-recent" className={styles.card}>
			<h2 id="dashboard-recent" className={styles.cardTitle}>
				{t('heading')}
			</h2>
			{runs.length === 0 ? (
				<div className={styles.empty}>
					<p>{t('empty')}</p>
					<Link href="/practice/two-sum" className={styles.cta}>
						{t('cta')}
					</Link>
				</div>
			) : (
				<>
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th scope="col">{t('columns.problem')}</th>
									<th scope="col">{t('columns.result')}</th>
									<th scope="col">{t('columns.when')}</th>
								</tr>
							</thead>
							<tbody>
								{runs.map((run) => (
									<tr key={run.key}>
										<td className={styles.problemCell}>
											{PROBLEMS[run.slug] != null ? (
												<Link href={`/practice/${run.slug}`}>{run.title}</Link>
											) : (
												run.title
											)}
										</td>
										<td>
											<span className={run.allPassed ? styles.pass : styles.fail}>
												{run.allPassed ? <SuccessIcon size={15} /> : <AlertIcon size={15} />}
												{t('result', { passed: run.passed, total: run.total })}
											</span>
										</td>
										<td className={styles.when}>
											<LocalTime iso={run.at} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className={styles.note}>{t('note')}</p>
				</>
			)}
		</section>
	)
}
