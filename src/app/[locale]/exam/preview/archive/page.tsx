import type { Metadata } from 'next'
import { Link } from '@/i18n/routing'
import { PreviewFrame } from '@/components/exam/preview/preview-frame'
import { PREVIEW_ARCHIVE, units } from '@/lib/exam/preview-data'
import { DifficultyPill } from '@/components/dashboard/difficulty-pill'
import dashboard from '@/components/dashboard/dashboard.module.css'
import problems from '@/components/problems/problems.module.css'
import styles from '@/components/exam/preview/preview.module.css'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Exam archive (preview) | TraceCode', robots: { index: false, follow: false } }
}

const FILTERS = [
	['all', 'All'],
	['first', 'First time'],
	['repeat', 'Repeat']
] as const
const STATUS: Record<string, [string, string]> = {
	results: ['Results', problems.solved ?? ''],
	published: ['Published', problems.attempted ?? ''],
	open: ['Open today', problems.attempted ?? ''],
	locked: ['Locked', problems.not_started ?? ''],
	no_exam: ['No exam', problems.not_started ?? '']
}

// Screen 6 — archive, laid out like /problems: filter chips, a table, status pills, Practice links.
// SAMPLE rows; published problems link to real Practice problems only as a demonstration.
export default async function ArchivePreview({
	searchParams
}: {
	searchParams: Promise<{ kind?: string }>
}) {
	const { kind = 'all' } = await searchParams
	const rows = PREVIEW_ARCHIVE.filter((r) =>
		kind === 'first' ? r.kind === 'first' : kind === 'repeat' ? r.kind === 'repeat' : true
	)
	return (
		<PreviewFrame step="archive" eyebrow="Daily Exam" title="Exam archive">
			<section className={dashboard.card} aria-labelledby="arch">
				<div className={problems.listHead}>
					<div className={problems.filters} role="group" aria-label="Filter exams">
						{FILTERS.map(([key, label]) => (
							<Link
								key={key}
								href={`/exam/preview/archive?kind=${key}`}
								className={problems.filterChip}
								aria-pressed={kind === key}
							>
								{label}
							</Link>
						))}
					</div>
					<span className={problems.tally}>{rows.length} exams</span>
				</div>
				<div className={`${problems.tableWrap} ${styles.scroll}`}>
					<table className={dashboard.table}>
						<caption className="sr-only" id="arch">
							Daily exams
						</caption>
						<thead>
							<tr>
								<th>Date</th>
								<th>Problem</th>
								<th>Difficulty</th>
								<th>Problem history</th>
								<th>Status</th>
								<th className={styles.num}>Your result</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => {
								const [label, pill] = STATUS[r.status] ?? ['', '']
								const hidden = r.status === 'locked' || r.status === 'open'
								return (
									<tr key={r.date} className={problems.row}>
										<td className={problems.number}>{r.date}</td>
										<td>
											{hidden ? (
												<span className={styles.muted}>Hidden until it opens</span>
											) : (
												(r.title ?? '—')
											)}
										</td>
										<td>
											{r.difficulty == null ? (
												'—'
											) : (
												<DifficultyPill difficulty={r.difficulty} label={r.difficulty} />
											)}
										</td>
										<td>
											{hidden || r.status === 'no_exam' ? (
												'—'
											) : (
												<span
													className={`${problems.pill} ${r.kind === 'repeat' ? problems.attempted : problems.easy}`}
												>
													{r.kind === 'repeat' ? 'Repeat' : 'First time'}
												</span>
											)}
										</td>
										<td>
											<span className={`${problems.pill} ${pill}`}>{label}</span>
										</td>
										<td className={styles.num}>
											{r.score == null ? '—' : `${units(r.score)} · #${r.rank}`}
										</td>
										<td>
											{r.status === 'results' && r.practiceSlug != null ? (
												<div className={styles.actions} style={{ margin: 0 }}>
													<Link href="/exam/preview/result" className={dashboard.rowAction}>
														Result
													</Link>
													<Link
														href={`/practice/${r.practiceSlug}`}
														className={dashboard.rowAction}
													>
														Practice
													</Link>
												</div>
											) : r.status === 'published' && r.practiceSlug != null ? (
												<Link href={`/practice/${r.practiceSlug}`} className={dashboard.rowAction}>
													Practice
												</Link>
											) : r.status === 'open' ? (
												<Link href="/exam/preview" className={dashboard.rowAction}>
													Open
												</Link>
											) : (
												<span className={styles.muted}>
													{r.status === 'no_exam' ? '—' : 'Locked'}
												</span>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
				<p className={styles.note}>
					Sample rows. A problem is public in Practice only after its exam ends and results are
					published; a repeat problem is labelled because it has been public before. The Practice
					links here open ordinary catalogue problems purely to demonstrate the flow.
				</p>
			</section>
		</PreviewFrame>
	)
}
