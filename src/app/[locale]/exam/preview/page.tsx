import type { Metadata } from 'next'
import { Link } from '@/i18n/routing'
import { PreviewFrame } from '@/components/exam/preview/preview-frame'
import { ExamCountdown } from '@/components/exam/preview/exam-countdown'
import { examDateOf, examTimes } from '@/lib/exam/schedule'
import { PREVIEW_ARCHIVE, units } from '@/lib/exam/preview-data'
import dashboard from '@/components/dashboard/dashboard.module.css'
import problems from '@/components/problems/problems.module.css'
import styles from '@/components/exam/preview/preview.module.css'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Daily Exam (preview) | TraceCode', robots: { index: false, follow: false } }
}

const PILL: Record<string, string> = {
	results: problems.solved ?? '',
	published: problems.attempted ?? '',
	open: problems.attempted ?? '',
	locked: problems.not_started ?? '',
	no_exam: problems.not_started ?? ''
}
const STATUS: Record<string, string> = {
	results: 'Results',
	published: 'Published',
	open: 'Open today',
	locked: 'Locked',
	no_exam: 'No exam'
}

// Screen 1 — Daily Exam landing, laid out like /dashboard: a summary strip, cards, and rows.
export default async function ExamPreviewLanding() {
	const now = new Date()
	const times = examTimes(examDateOf(now))
	const recent = PREVIEW_ARCHIVE.slice(0, 5)
	return (
		<PreviewFrame
			step="landing"
			eyebrow="Daily Exam"
			title="One problem. Thirty minutes. One submission."
		>
			<dl className={dashboard.summary}>
				<div className={dashboard.stat}>
					<dt>Opens</dt>
					<dd>
						15:00 <span>UTC daily</span>
					</dd>
				</div>
				<div className={dashboard.stat}>
					<dt>Duration</dt>
					<dd>
						30 <span>minutes, no overtime</span>
					</dd>
				</div>
				<div className={dashboard.stat}>
					<dt>Submissions</dt>
					<dd>1</dd>
				</div>
			</dl>
			<div className={`${styles.grid} ${styles.grid2}`} style={{ marginTop: 18 }}>
				<section className={dashboard.card} aria-labelledby="today">
					<div className={dashboard.cardHead}>
						<h2 className={dashboard.cardTitle} id="today">
							Today&apos;s exam
						</h2>
						<span className={problems.pill}>{examDateOf(now)}</span>
					</div>
					<ExamCountdown
						serverNow={now.toISOString()}
						opensAt={times.opensAt.toISOString()}
						closesAt={times.closesAt.toISOString()}
					/>
					<p className={styles.note}>
						The countdown follows the real schedule (15:00–15:30 UTC, entry until 15:10). The exam
						problem stays hidden until it opens. In this preview, Start walks you through the
						screens with a sample problem.
					</p>
					<div className={styles.actions}>
						<Link href="/exam/preview/preflight" className={dashboard.cta}>
							Start exam (preview)
						</Link>
						<Link href="/exam/preview/archive" className={dashboard.rowAction}>
							Past exams
						</Link>
					</div>
				</section>
				<aside className={dashboard.card} aria-labelledby="monitor">
					<div className={dashboard.cardHead}>
						<h2 className={dashboard.cardTitle} id="monitor">
							Monitoring requirements
						</h2>
					</div>
					<ul className={styles.list}>
						<li>Camera and microphone connected</li>
						<li>Entire screen shared</li>
						<li>Fullscreen while you work</li>
						<li>Pasting and drag-and-drop disabled in the editor</li>
					</ul>
					<p className={styles.note}>
						Your exam session is monitored for browser activity and device interruptions. Camera,
						microphone and screen content are not recorded or stored. Declining? Keep practising
						instead, no penalty.
					</p>
				</aside>
			</div>
			<div className={`${styles.grid} ${styles.grid2}`} style={{ marginTop: 18 }}>
				<section className={dashboard.card} aria-labelledby="rules">
					<div className={dashboard.cardHead}>
						<h2 className={dashboard.cardTitle} id="rules">
							How it works and how it is scored
						</h2>
					</div>
					<ul className={styles.list}>
						<li>The same problem for everyone, chosen when the exam opens.</li>
						<li>Run tries the public examples as often as you like; Submit counts once.</li>
						<li>Your code autosaves, and at 15:30 your last autosave is submitted for you.</li>
						<li>Hidden tests run in an isolated sandbox: up to 80 points for correctness.</li>
						<li>Up to 20 points for speed, only on a full pass.</li>
						<li>Documented integrity deductions, capped at 20 points.</li>
						<li>
							Results and an AI evaluation by 16:30 UTC; the problem opens for Practice the next
							day.
						</li>
					</ul>
				</section>
				<section className={dashboard.card} aria-labelledby="recent">
					<div className={dashboard.cardHead}>
						<h2 className={dashboard.cardTitle} id="recent">
							Upcoming and previous
						</h2>
						<Link href="/exam/preview/archive" className={dashboard.moreLink}>
							All exams
						</Link>
					</div>
					<ul className={dashboard.rows}>
						{recent.map((r) => (
							<li key={r.date} className={dashboard.row}>
								<div className={dashboard.rowMain}>
									<span className={dashboard.rowTitle}>{r.date}</span>
									<span className={dashboard.rowMeta}>
										{r.status === 'results'
											? `${r.title} · ${units(r.score)} · rank ${r.rank}`
											: r.status === 'locked'
												? 'Hidden until it opens'
												: r.status === 'open'
													? 'Problem hidden until 15:00 UTC'
													: (r.title ?? '')}
									</span>
								</div>
								<span className={`${problems.pill} ${PILL[r.status]}`}>{STATUS[r.status]}</span>
							</li>
						))}
					</ul>
					<p className={styles.note}>Sample rows for the walkthrough.</p>
				</section>
			</div>
		</PreviewFrame>
	)
}
