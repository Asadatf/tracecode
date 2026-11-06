import type { Metadata } from 'next'
import { Link } from '@/i18n/routing'
import { PreviewFrame } from '@/components/exam/preview/preview-frame'
import { ExamCountdown } from '@/components/exam/preview/exam-countdown'
import { examDateOf, examTimes } from '@/lib/exam/schedule'
import dashboard from '@/components/dashboard/dashboard.module.css'
import problems from '@/components/problems/problems.module.css'
import styles from '@/components/exam/preview/preview.module.css'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Daily Exam (preview) | TraceCode', robots: { index: false, follow: false } }
}

// Screen 1 — Daily Exam landing, laid out like /dashboard: a summary strip, cards, and rows.
export default async function ExamPreviewLanding() {
	const now = new Date()
	const times = examTimes(examDateOf(now))
	return (
		<PreviewFrame
			step="landing"
			eyebrow="Daily Exam"
			title="One problem. Thirty minutes. One submission."
		>
			<div>
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
				<div className={styles.grid} style={{ marginTop: 18 }}>
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
				</div>
			</div>
		</PreviewFrame>
	)
}
