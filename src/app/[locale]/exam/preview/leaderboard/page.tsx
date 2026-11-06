import type { Metadata } from 'next'
import { Link } from '@/i18n/routing'
import { PreviewFrame } from '@/components/exam/preview/preview-frame'
import { PREVIEW_STANDINGS, mmss, units } from '@/lib/exam/preview-data'
import dashboard from '@/components/dashboard/dashboard.module.css'
import problems from '@/components/problems/problems.module.css'
import styles from '@/components/exam/preview/preview.module.css'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Leaderboard (preview) | TraceCode', robots: { index: false, follow: false } }
}

const STATUS_LABEL = {
	full_pass: 'Full pass',
	partial: 'Partial',
	no_submission: 'No submission',
	grading_failed: 'Grading failed · not ranked'
}
const STATUS_PILL = {
	full_pass: problems.solved,
	partial: problems.attempted,
	no_submission: problems.not_started,
	grading_failed: problems.hard
}
const VIEWS = [
	['ready', 'Published'],
	['processing', 'Processing'],
	['empty', 'No participants']
] as const
const FILTERS = [
	['all', 'All'],
	['full', 'Full pass'],
	['partial', 'Partial']
] as const

// Screen 5 — leaderboard. Public names only for opted-in learners, "Anonymous participant" for
// everyone else; your own row is highlighted; only scores and counts are shown, never private
// monitoring detail. SAMPLE rows.
export default async function LeaderboardPreview({
	searchParams
}: {
	searchParams: Promise<{ view?: string; filter?: string; repeat?: string }>
}) {
	const { view = 'ready', filter = 'all', repeat = '0' } = await searchParams
	const rows = PREVIEW_STANDINGS.filter((r) =>
		filter === 'full'
			? r.status === 'full_pass'
			: filter === 'partial'
				? r.status === 'partial'
				: true
	)
	const href = (patch: Record<string, string>) => {
		const q = new URLSearchParams({ view, filter, repeat, ...patch })
		return `/exam/preview/leaderboard?${q.toString()}`
	}
	return (
		<PreviewFrame step="leaderboard" eyebrow="Daily Exam · 2026-11-10 (sample)" title="Leaderboard">
			<section className={dashboard.card} aria-labelledby="board">
				<div className={problems.listHead}>
					<div className={problems.filters} role="group" aria-label="Show">
						{FILTERS.map(([key, label]) => (
							<Link
								key={key}
								href={href({ filter: key })}
								className={problems.filterChip}
								aria-pressed={filter === key}
							>
								{label}
							</Link>
						))}
					</div>
					<div className={problems.filters} role="group" aria-label="Preview state">
						{VIEWS.map(([key, label]) => (
							<Link
								key={key}
								href={href({ view: key })}
								className={problems.filterChip}
								aria-pressed={view === key}
							>
								{label}
							</Link>
						))}
						<Link
							href={href({ repeat: repeat === '1' ? '0' : '1' })}
							className={problems.filterChip}
							aria-pressed={repeat === '1'}
						>
							Repeat problem
						</Link>
					</div>
				</div>
				{repeat === '1' ? (
					<p className={styles.muted} style={{ marginBottom: 12 }}>
						<span className={`${problems.pill} ${problems.attempted}`}>Repeat problem</span> This
						problem appeared in an earlier exam and is available in Practice, so some participants
						may have seen it.
					</p>
				) : null}
				{view === 'processing' ? (
					<p role="status" className={styles.muted}>
						Results are still processing. Standings appear once every submission is graded and
						accounted for; nothing is ranked early.
					</p>
				) : view === 'empty' ? (
					<p className={styles.muted}>No one took this exam.</p>
				) : (
					<div className={`${problems.tableWrap} ${styles.scroll}`}>
						<table className={dashboard.table}>
							<thead>
								<tr>
									<th>Rank</th>
									<th>Learner</th>
									<th>Result</th>
									<th className={styles.num}>Tests</th>
									<th className={styles.num}>Coding</th>
									<th className={styles.num}>Deductions</th>
									<th className={styles.num}>Final</th>
									<th className={styles.num}>Time</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r, i) => (
									<tr key={i} className={r.isYou ? styles.you : undefined}>
										<td className={problems.number}>{r.rank ?? '—'}</td>
										<td>
											{r.name}
											{r.isYou ? ' (you)' : ''}
										</td>
										<td>
											<span className={`${problems.pill} ${STATUS_PILL[r.status]}`}>
												{STATUS_LABEL[r.status]}
											</span>
										</td>
										<td className={styles.num}>
											{r.tests[0]}/{r.tests[1]}
										</td>
										<td className={styles.num}>{units(r.coding)}</td>
										<td className={`${styles.num} ${r.deductions > 0 ? styles.minusText : ''}`}>
											{r.deductions > 0 ? `−${units(r.deductions)}` : '—'}
										</td>
										<td className={styles.num}>
											<strong>{units(r.finalScore)}</strong>
										</td>
										<td className={styles.num}>
											{r.elapsedSeconds == null ? '—' : mmss(r.elapsedSeconds)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<p className={styles.note}>
					Sample standings. In the real exam, ties share a rank, a full pass ranks above any partial
					pass, and usernames appear only for learners who opted in to a public identity.
				</p>
			</section>
		</PreviewFrame>
	)
}
