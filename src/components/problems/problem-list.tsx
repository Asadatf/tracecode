'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { DifficultyPill } from '@/components/dashboard/difficulty-pill'
import {
	matchesStatus,
	practiceAction,
	type ProblemSummary,
	type StatusFilter
} from '@/lib/problems/problem-summary'
import { filterByTopic, topicsOf } from '@/lib/problems/topic-filter'
import { useProblemDetail } from './problem-detail-modal'
import dashboard from '@/components/dashboard/dashboard.module.css'
import styles from './problems.module.css'

const STATUS_FILTERS: readonly StatusFilter[] = [
	'all',
	'attempted',
	'not_started',
	'solved',
	'unsolved'
]

// Every problem in catalogue order with the learner's status (problems-page
// AC3–AC6, AC11–AC17). Topic chips and a status dropdown in the card header narrow
// the list; the title opens the shared detail modal and the last column is the
// Practice action. The table has no scroll of its own: the page scrolls once, and
// the shell's sidebar and the calendar widget stay put beside it.
export function ProblemList({ rows, tracked }: { rows: ProblemSummary[]; tracked: boolean }) {
	const t = useTranslations('ProblemsPage')
	const tl = useTranslations('ProblemTable')
	const td = useTranslations('ProblemDetail')
	const { open, modal } = useProblemDetail()
	const [topic, setTopic] = useState<string | null>(null)
	const [status, setStatus] = useState<StatusFilter>('all')
	const solved = rows.filter((row) => row.status === 'solved').length
	const visible = filterByTopic(rows, topic).filter((row) => matchesStatus(row, status))

	return (
		<section aria-label={t('listHeading')} className={dashboard.card}>
			<div className={styles.listHead}>
				<div className={styles.filters} role="group" aria-label={t('filterLabel')}>
					<button
						type="button"
						className={styles.filterChip}
						aria-pressed={topic == null}
						onClick={() => setTopic(null)}
					>
						{t('filterAll')}
					</button>
					{topicsOf(rows).map((name) => (
						<button
							key={name}
							type="button"
							className={styles.filterChip}
							aria-pressed={topic === name}
							onClick={() => setTopic(name)}
						>
							{name}
						</button>
					))}
				</div>
				<div className={styles.headEnd}>
					{tracked ? (
						<label className={styles.statusFilter}>
							<span>{t('statusFilter.label')}</span>
							<select
								value={status}
								onChange={(event) => setStatus(statusFrom(event.target.value))}
							>
								{STATUS_FILTERS.map((value) => (
									<option key={value} value={value}>
										{t(`statusFilter.${value}`)}
									</option>
								))}
							</select>
						</label>
					) : null}
					{tracked ? (
						<span
							className={styles.tally}
							title={t('tally', { solved, total: rows.length })}
							aria-label={t('tally', { solved, total: rows.length })}
						>
							{solved}/{rows.length}
						</span>
					) : null}
				</div>
			</div>
			{rows.length === 0 ? (
				<p className={dashboard.note}>{tl('empty')}</p>
			) : (
				<div className={styles.tableWrap}>
					<table className={`${dashboard.table} ${styles.table}`}>
						<thead>
							<tr>
								<th scope="col" className={styles.colNumber}>
									{tl('columns.number')}
								</th>
								<th scope="col">{tl('columns.title')}</th>
								<th scope="col" className={styles.colTopics}>
									{tl('columns.topics')}
								</th>
								<th scope="col" className={styles.colDifficulty}>
									{tl('columns.difficulty')}
								</th>
								<th scope="col">{tl('columns.status')}</th>
								<th scope="col" className={styles.colAction}>
									{t('actionColumn')}
								</th>
							</tr>
						</thead>
						<tbody>
							{visible.length === 0 ? (
								<tr>
									<td colSpan={6} className={styles.noMatch}>
										{t('noMatch')}
									</td>
								</tr>
							) : (
								visible.map((row) => (
									<tr key={row.slug} className={styles.row}>
										<td className={`${styles.number} ${styles.colNumber}`}>{row.number}</td>
										<td className={dashboard.problemCell}>
											<button
												type="button"
												className={styles.titleButton}
												aria-haspopup="dialog"
												aria-label={t('open', { title: row.title })}
												onClick={() => open(row)}
											>
												{row.title}
											</button>
											<span className={styles.phoneMeta}>
												<DifficultyPill
													difficulty={row.difficulty}
													label={tl(`difficulty.${row.difficulty}`)}
												/>
											</span>
										</td>
										<td className={`${styles.topics} ${styles.colTopics}`}>{row.topics}</td>
										<td className={styles.colDifficulty}>
											<DifficultyPill
												difficulty={row.difficulty}
												label={tl(`difficulty.${row.difficulty}`)}
											/>
										</td>
										<td>
											<span className={`${styles.pill} ${styles[row.status]}`}>
												{tl(`status.${row.status}`)}
											</span>
										</td>
										<td className={styles.colAction}>
											<Link href={`/practice/${row.slug}`} className={dashboard.rowAction}>
												{td(practiceAction(row.status))}
											</Link>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}
			{modal}
		</section>
	)
}

// The select's value is one of the options above; anything else falls back to All.
function statusFrom(value: string): StatusFilter {
	return STATUS_FILTERS.find((candidate) => candidate === value) ?? 'all'
}
