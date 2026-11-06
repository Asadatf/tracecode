import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { currentUserIdSafe } from '@/server/auth/session'
import { AppShell } from '@/components/app-shell/app-shell'
import { examEnabled } from '@/server/exam/exam'
import { leaderboardFor } from '@/server/exam/results'
import { formatClock } from '@/lib/challenge/daily'
import styles from '@/components/challenge/challenge.module.css'

// The published Daily Exam leaderboard (AC29): only after the finalisation barrier, a name only
// with explicit public-identity consent, never emails, code, events or (before publication) the
// problem. Named by its date.
export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Daily Exam leaderboard | TraceCode', robots: { index: false, follow: false } }
}

const units = (n: number) => (n / 100).toFixed(2)

export default async function LeaderboardPage({ params }: { params: Promise<{ date: string }> }) {
	const { date } = await params
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()
	const viewer = await currentUserIdSafe()
	if (!(await examEnabled(viewer))) notFound()
	const board = await leaderboardFor(date, viewer)
	return (
		<AppShell>
			<main className={styles.main} style={{ padding: 24 }}>
				<p className={styles.eyebrow}>Daily Exam · {date}</p>
				<h1 className={styles.title}>Leaderboard</h1>
				{board.isRepeat ? (
					<p className={styles.muted}>Repeat problem: it appeared in an earlier exam.</p>
				) : null}
				{!board.published ? (
					<p role="status">Standings appear once every result is finalised.</p>
				) : board.rows.length === 0 ? (
					<p>No one took this exam.</p>
				) : (
					<table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
						<thead>
							<tr>
								<th align="left">Rank</th>
								<th align="left">Learner</th>
								<th align="right">Coding</th>
								<th align="right">Deductions</th>
								<th align="right">Final</th>
								<th align="right">Tests</th>
								<th align="right">Time</th>
								<th align="left">Status</th>
							</tr>
						</thead>
						<tbody>
							{board.rows.map((r, i) => (
								<tr key={i} style={r.isYou ? { fontWeight: 700 } : undefined}>
									<td>{r.ranked ? r.rank : '—'}</td>
									<td>
										{r.name}
										{r.isYou ? ' (you)' : ''}
									</td>
									<td align="right">{units(r.codingScore)}</td>
									<td align="right">−{units(r.deductions)}</td>
									<td align="right">{units(r.finalScore)}</td>
									<td align="right">
										{r.testsPassed}/{r.testsTotal}
									</td>
									<td align="right">
										{r.elapsedSeconds == null ? '—' : formatClock(r.elapsedSeconds * 1000)}
									</td>
									<td>{r.status.replace('_', ' ')}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</main>
		</AppShell>
	)
}
