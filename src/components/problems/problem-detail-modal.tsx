'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { LocalTime } from '@/components/local-time'
import { CloseIcon } from '@/components/ui/icons'
import { DifficultyPill } from '@/components/dashboard/difficulty-pill'
import { practiceAction, type ProblemSummary } from '@/lib/problems/problem-summary'
import styles from '@/components/dashboard/dashboard.module.css'

// The ONE problem-detail modal (problems-page AC15, dashboard-page AC26): the
// Overview's Progress card and the Problems table both open it. A compact native
// <dialog>, so focus is trapped, Escape closes it and focus returns to whatever
// opened it. It shows only facts from the learner's persisted progress and the
// catalogue, plus the Practice action; there is no attempt list and nothing is
// fetched.
//
//   const { open, modal } = useProblemDetail()
//   ... <button onClick={() => open(summary)}> ... {modal}
export function useProblemDetail(): {
	open: (summary: ProblemSummary) => void
	modal: ReactNode
} {
	const [selected, setSelected] = useState<ProblemSummary | null>(null)
	const dialogRef = useRef<HTMLDialogElement>(null)

	function open(summary: ProblemSummary) {
		setSelected(summary)
		dialogRef.current?.showModal()
	}

	return {
		open,
		modal: (
			<dialog
				ref={dialogRef}
				className={styles.modal}
				aria-labelledby="problem-modal-title"
				onClose={() => setSelected(null)}
				onClick={(event) => {
					// A click on the backdrop (the dialog element itself) dismisses it.
					if (event.target === event.currentTarget) event.currentTarget.close()
				}}
			>
				{selected == null ? null : (
					<ProblemDetail summary={selected} onClose={() => dialogRef.current?.close()} />
				)}
			</dialog>
		)
	}
}

function ProblemDetail({ summary, onClose }: { summary: ProblemSummary; onClose: () => void }) {
	const t = useTranslations('ProblemDetail')
	const tl = useTranslations('ProblemTable')
	const action = practiceAction(summary.status)
	const none = t('none')

	return (
		<>
			<header className={styles.modalHead}>
				<div className={styles.modalTitleBlock}>
					<h2 id="problem-modal-title" className={styles.modalTitle}>
						{summary.title}
					</h2>
					<DifficultyPill
						difficulty={summary.difficulty}
						label={tl(`difficulty.${summary.difficulty}`)}
					/>
				</div>
				<button
					type="button"
					className={styles.modalClose}
					aria-label={t('close')}
					onClick={onClose}
				>
					<CloseIcon size={18} />
				</button>
			</header>

			<div className={styles.modalBody}>
				<dl className={styles.facts}>
					<div>
						<dt>{t('topics')}</dt>
						<dd>{summary.topics}</dd>
					</div>
					<div>
						<dt>{t('status')}</dt>
						<dd>{t(`statuses.${summary.status}`)}</dd>
					</div>
					<div>
						<dt>{t('attempts')}</dt>
						<dd>{summary.attempts}</dd>
					</div>
					<div>
						<dt>{t('best')}</dt>
						<dd>
							{summary.best == null
								? none
								: t('bestValue', { passed: summary.best.passed, total: summary.best.total })}
						</dd>
					</div>
					<div>
						<dt>{t('firstAttempt')}</dt>
						<dd>
							{summary.firstAttemptAt == null ? none : <LocalTime iso={summary.firstAttemptAt} />}
						</dd>
					</div>
					<div>
						<dt>{t('lastAttempt')}</dt>
						<dd>
							{summary.lastAttemptAt == null ? none : <LocalTime iso={summary.lastAttemptAt} />}
						</dd>
					</div>
					{summary.status === 'solved' && summary.solvedAt != null ? (
						<div>
							<dt>{t('firstSolved')}</dt>
							<dd>
								<LocalTime iso={summary.solvedAt} />
							</dd>
						</div>
					) : null}
					{summary.status === 'solved' && summary.latestSolvedAt != null ? (
						<div>
							<dt>{t('lastSolved')}</dt>
							<dd>
								<LocalTime iso={summary.latestSolvedAt} />
							</dd>
						</div>
					) : null}
				</dl>
			</div>

			<footer className={styles.modalFoot}>
				<Link href={`/practice/${summary.slug}`} className={styles.cta}>
					{t(action)}
				</Link>
			</footer>
		</>
	)
}
