import type { Metadata } from 'next'
import { Link } from '@/i18n/routing'
import { PreviewFrame } from '@/components/exam/preview/preview-frame'
import { PREVIEW_RESULT, mmss, units } from '@/lib/exam/preview-data'
import dashboard from '@/components/dashboard/dashboard.module.css'
import problems from '@/components/problems/problems.module.css'
import styles from '@/components/exam/preview/preview.module.css'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Exam result (preview) | TraceCode', robots: { index: false, follow: false } }
}

const TAG_STYLE = {
	fact: styles.tagFact,
	estimate: styles.tagEstimate,
	unverified: styles.tagUnverified
}
const TAG_LABEL = { fact: 'Fact', estimate: 'AI estimate', unverified: 'Unverified' }
const STATES = [
	['ready', 'Feedback ready'],
	['pending', 'Feedback being prepared'],
	['unavailable', 'Feedback unavailable']
] as const

// Screen 4 — result and AI evaluation. Facts (scores, tests, times) are visually distinct from AI
// estimates and from unverified browser observations. SAMPLE values only.
export default async function ResultPreview({
	searchParams
}: {
	searchParams: Promise<{ state?: string }>
}) {
	const { state = 'ready' } = await searchParams
	const r = PREVIEW_RESULT
	return (
		<PreviewFrame step="result" eyebrow="Daily Exam · 2026-11-10 (sample)" title="Your result">
			<div className={`${styles.grid} ${styles.grid2}`}>
				<section className={dashboard.card} aria-labelledby="score">
					<div className={dashboard.cardHead}>
						<h2 className={dashboard.cardTitle} id="score">
							Final score
						</h2>
						<span className={`${problems.pill} ${problems.solved}`}>
							Rank {r.rank} of {r.participants}
						</span>
					</div>
					<div className={styles.bigScore}>
						<strong>{units(r.finalScore)}</strong>
						<span>/ 100</span>
					</div>
					<dl className={styles.breakdown}>
						<div className={styles.part}>
							<dt>Correctness</dt>
							<dd>{units(r.correctness)}</dd>
						</div>
						<div className={styles.part}>
							<dt>Speed</dt>
							<dd>{units(r.speed)}</dd>
						</div>
						<div className={`${styles.part} ${styles.minus}`}>
							<dt>Integrity</dt>
							<dd>−{units(r.deductions)}</dd>
						</div>
						<div className={styles.part}>
							<dt>Hidden tests</dt>
							<dd>
								{r.testsPassed}/{r.testsTotal}
							</dd>
						</div>
						<div className={styles.part}>
							<dt>Time used</dt>
							<dd>{mmss(r.elapsedSeconds)}</dd>
						</div>
					</dl>
					<p className={styles.note}>
						Deterministic: 80 × tests passed ÷ total, plus up to 20 speed points on a full pass,
						minus documented deductions. The AI feedback below never changes your score or rank.
					</p>
					<div className={styles.actions}>
						<Link href="/exam/preview/leaderboard" className={dashboard.cta}>
							See the leaderboard
						</Link>
						<Link href="/exam/preview/archive" className={dashboard.rowAction}>
							Past exams
						</Link>
					</div>
				</section>
				<aside className={dashboard.card} aria-labelledby="ded">
					<div className={dashboard.cardHead}>
						<h2 className={dashboard.cardTitle} id="ded">
							Integrity
						</h2>
					</div>
					<ul className={dashboard.rows}>
						{r.deductionLines.map((d) => (
							<li key={d.rule} className={dashboard.row}>
								<div className={dashboard.rowMain}>
									<span className={dashboard.rowTitle}>{d.rule}</span>
									<span className={dashboard.rowMeta}>{d.units}× applied</span>
								</div>
								<span className={dashboard.warn}>−{units(d.points)}</span>
							</li>
						))}
					</ul>
					<p className={styles.note}>
						Recorded for review, with no penalty: {r.flags.join(', ')}. These are browser
						observations, not proof. You can challenge a deduction within 30 days.
					</p>
				</aside>
			</div>
			<section className={dashboard.card} aria-labelledby="ai" style={{ marginTop: 18 }}>
				<div className={dashboard.cardHead}>
					<h2 className={dashboard.cardTitle} id="ai">
						AI evaluation
					</h2>
					<span className={`${styles.tag} ${styles.tagEstimate}`}>AI estimate · sample</span>
				</div>
				<div className={styles.steps} style={{ marginBottom: 12 }}>
					{STATES.map(([key, label]) => (
						<Link
							key={key}
							href={`/exam/preview/result?state=${key}`}
							className={styles.step}
							aria-current={state === key ? 'page' : undefined}
						>
							{label}
						</Link>
					))}
				</div>
				{state === 'pending' ? (
					<p role="status" className={styles.muted}>
						AI feedback is being prepared. Your scores are final and this will appear automatically.
					</p>
				) : state === 'unavailable' ? (
					<p role="status" className={styles.muted}>
						AI feedback is unavailable right now. Your score and rank are not affected.
					</p>
				) : (
					<>
						{r.sections.map((s) => (
							<div key={s.id} className={styles.section}>
								<div className={styles.sectionHead}>
									<h3>{s.title}</h3>
									<span
										className={`${styles.tag} ${s.kind === 'fact' ? styles.tagFact : styles.tagEstimate}`}
									>
										{s.kind === 'fact' ? 'Verified facts' : 'AI estimate'}
									</span>
								</div>
								<ul className={styles.statements}>
									{s.lines.map((l, i) => (
										<li key={i} className={styles.statement}>
											<span className={`${styles.tag} ${TAG_STYLE[l.tag]}`}>
												{TAG_LABEL[l.tag]}
											</span>
											<span>{l.text}</span>
										</li>
									))}
								</ul>
							</div>
						))}
						<p style={{ margin: '14px 0 0', color: 'var(--text)', fontSize: 15, lineHeight: 1.6 }}>
							{r.summary}
						</p>
						<p className={styles.note}>
							Sample text for the walkthrough. In the real exam an AI writes this from your code and
							the recorded evidence; estimates are not proof and it cannot change your score, rank
							or deductions.
						</p>
					</>
				)}
			</section>
		</PreviewFrame>
	)
}
