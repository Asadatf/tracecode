import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { getLeaderboard } from '@/server/challenge/leaderboard'
import { activeGrader } from '@/server/challenge/grade'
import { LEADERBOARD_SIZE } from '@/lib/challenge/scoring'
import { daysOfWeek, weekEndOf } from '@/lib/challenge/week'
import { Button } from '@/components/ui/button'
import styles from '@/components/challenge/leaderboard.module.css'

// specs/features/daily-challenge.md § Leaderboard. The week's top twenty LEARNERS WHO
// OPTED IN, ranked only from server-verified scores, by published tie-break rules; any
// learner who is signed in also sees their own rank privately. Archived weeks are the
// frozen standings. Public data is a username and numbers: no email, id or code.
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('Leaderboard')
	return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

function minutes(ms: number): string {
	const total = Math.round(ms / 1000)
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export default async function LeaderboardPage({
	searchParams
}: {
	searchParams: Promise<{ week?: string }>
}) {
	const { week } = await searchParams
	const [t, board, grader] = await Promise.all([
		getTranslations('Leaderboard'),
		getLeaderboard(week ?? null),
		activeGrader()
	])
	const viewing = board.weekStart
	const label = (iso: string) =>
		new Date(`${iso}T00:00:00.000Z`).toLocaleDateString('en', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		})
	const isCurrent = viewing === board.currentWeek

	return (
		<div className={styles.page}>
			<header className={styles.top}>
				<Link href="/" className={styles.brand}>
					tracecode
				</Link>
				<Button asChild size="sm" variant="outline">
					<Link href="/problems">{t('toProblems')}</Link>
				</Button>
			</header>
			<main className={styles.main}>
				<p className={styles.eyebrow}>{t('eyebrow')}</p>
				<h1 className={styles.title}>
					{t('heading', { start: label(viewing), end: label(weekEndOf(viewing)) })}
				</h1>
				<p className={styles.note}>{t('weekRule')}</p>

				{!board.available ? (
					<p role="status" className={styles.card}>
						{t('unavailable')}
					</p>
				) : (
					<>
						{board.you != null ? (
							<section aria-labelledby="lb-you" className={styles.card}>
								<h2 id="lb-you" className={styles.cardTitle}>
									{t('you.heading')}
								</h2>
								<p>
									{board.you.listed || board.you.rank > 0
										? t('you.rank', { rank: board.you.rank, competitors: board.you.competitors })
										: t('you.notListed')}
								</p>
								<p className={styles.note}>
									{t('you.numbers', {
										score: board.you.score,
										days: board.you.daysSolved,
										time: minutes(board.you.totalMs)
									})}
								</p>
								{board.you.listed ? null : <p className={styles.note}>{t('you.private')}</p>}
							</section>
						) : null}

						<section aria-labelledby="lb-top" className={styles.card}>
							<h2 id="lb-top" className={styles.cardTitle}>
								{t('top', { count: LEADERBOARD_SIZE })}
							</h2>
							{board.entries.length === 0 ? (
								<div role="status">
									<p>{t('empty')}</p>
									{!isCurrent ? null : grader == null ? (
										<p className={styles.note}>{t('gradingOff')}</p>
									) : null}
								</div>
							) : (
								<div className={styles.tableWrap}>
									<table className={styles.table}>
										<caption className="sr-only">
											{t('caption', { start: label(viewing), end: label(weekEndOf(viewing)) })}
										</caption>
										<thead>
											<tr>
												<th scope="col">{t('cols.rank')}</th>
												<th scope="col">{t('cols.user')}</th>
												<th scope="col">{t('cols.score')}</th>
												<th scope="col">{t('cols.solved')}</th>
												<th scope="col">{t('cols.time')}</th>
											</tr>
										</thead>
										<tbody>
											{board.entries.map((entry) => (
												<tr key={`${entry.rank}-${entry.username}`}>
													<td>{entry.rank}</td>
													<th scope="row">
														{entry.profilePath == null ? (
															entry.username
														) : (
															<Link href={entry.profilePath}>{entry.username}</Link>
														)}
													</th>
													<td>{entry.score}</td>
													<td>
														{entry.daysSolved}/{daysOfWeek(viewing).length}
													</td>
													<td>{minutes(entry.totalMs)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
							<p className={styles.note}>{t('competitors', { count: board.competitors })}</p>
						</section>

						<section aria-labelledby="lb-rules" className={styles.card}>
							<h2 id="lb-rules" className={styles.cardTitle}>
								{t('rules.heading')}
							</h2>
							<ol className={styles.rules}>
								<li>{t('rules.score')}</li>
								<li>{t('rules.tie1')}</li>
								<li>{t('rules.tie2')}</li>
								<li>{t('rules.tie3')}</li>
								<li>{t('rules.shared')}</li>
							</ol>
							<p className={styles.note}>{t('rules.verified')}</p>
						</section>

						{board.archivedWeeks.length > 0 ? (
							<nav aria-label={t('archive.heading')} className={styles.card}>
								<h2 className={styles.cardTitle}>{t('archive.heading')}</h2>
								<ul className={styles.weeks}>
									{!isCurrent ? (
										<li>
											<Link href="/leaderboard">{t('archive.current')}</Link>
										</li>
									) : null}
									{board.archivedWeeks.map((w) => (
										<li key={w}>
											{w === viewing ? (
												<strong aria-current="page">{label(w)}</strong>
											) : (
												<Link href={`/leaderboard?week=${w}`}>{label(w)}</Link>
											)}
										</li>
									))}
								</ul>
							</nav>
						) : null}
					</>
				)}
			</main>
		</div>
	)
}
