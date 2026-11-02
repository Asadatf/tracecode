import { getTranslations } from 'next-intl/server'
import type { ProgressView } from '@/lib/progress/progress-view'
import styles from './dashboard.module.css'

// Three real counts from buildProgressView().summary (dashboard-page AC5).
export async function SummaryStrip({ summary }: { summary: ProgressView['summary'] }) {
	const t = await getTranslations('Dashboard.summary')
	return (
		<dl className={styles.summary}>
			<div className={styles.stat}>
				<dt>{t('solved')}</dt>
				<dd>
					{summary.solved} <span>{t('of', { total: summary.total })}</span>
				</dd>
			</div>
			<div className={styles.stat}>
				<dt>{t('attempted')}</dt>
				<dd>{summary.attempted}</dd>
			</div>
			<div className={styles.stat}>
				<dt>{t('runs')}</dt>
				<dd>{summary.runs}</dd>
			</div>
		</dl>
	)
}
