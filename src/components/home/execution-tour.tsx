'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import type { TwoSumDemo } from '@/lib/home/two-sum-demo'
import { cn } from '@/lib/cn'
import styles from './landing.module.css'

const STAGES = ['write', 'run', 'explore', 'improve'] as const
type Stage = (typeof STAGES)[number]

function indexValue(value: string): number | null {
	if (!/^\d+$/.test(value)) return null
	return Number(value)
}

export function ExecutionTour({ demo }: { demo: TwoSumDemo }) {
	const t = useTranslations('ExecutionTour')
	const [stage, setStage] = useState<Stage>('write')
	const [stepIndex, setStepIndex] = useState(0)
	const current = demo.rows[stepIndex] ?? demo.rows[0]
	const currentStage = STAGES.indexOf(stage)
	const pointerI = current == null ? null : indexValue(current.i)
	const pointerJ = current == null ? null : indexValue(current.j)

	function selectStage(next: Stage) {
		setStage(next)
		if (next === 'write' || next === 'run') setStepIndex(0)
		if (next === 'improve')
			setStepIndex(
				Math.max(
					0,
					demo.rows.findIndex((row) => row.highlighted)
				)
			)
	}

	function run() {
		setStage('run')
		setStepIndex(0)
	}

	function previous() {
		if (stage === 'improve') {
			setStage('explore')
			setStepIndex(Math.max(0, demo.rows.length - 1))
			return
		}
		if (stage === 'explore' && stepIndex > 0) {
			setStepIndex((value) => value - 1)
			return
		}
		if (currentStage > 0) selectStage(STAGES[currentStage - 1] ?? 'write')
	}

	function next() {
		if (stage === 'write') {
			run()
			return
		}
		if (stage === 'run') {
			setStage('explore')
			setStepIndex(0)
			return
		}
		if (stage === 'explore' && stepIndex < demo.rows.length - 1) {
			setStepIndex((value) => value + 1)
			return
		}
		if (stage === 'explore') selectStage('improve')
	}

	function reset() {
		setStage('write')
		setStepIndex(0)
	}

	const status =
		stage === 'write'
			? t('status.write')
			: stage === 'run'
				? t('status.run', { expected: demo.expected, actual: demo.actual })
				: stage === 'explore'
					? t('status.explore', { current: stepIndex + 1, total: demo.rows.length })
					: t('status.improve')

	return (
		<section className={styles.tour} aria-labelledby="guided-preview-title" data-motion-surface>
			<div className={styles.tourTopbar}>
				<div>
					<span className={styles.previewLabel}>{t('label')}</span>
					<h2 id="guided-preview-title" className={styles.previewTitle}>
						{t('title')}
					</h2>
				</div>
				<span className={styles.illustrative}>{t('illustrative')}</span>
			</div>

			<div className={styles.stageRail} aria-label={t('stageNav')}>
				{STAGES.map((item, index) => (
					<button
						key={item}
						type="button"
						aria-pressed={stage === item}
						className={cn(styles.stageButton, stage === item && styles.stageButtonActive)}
						onClick={() => selectStage(item)}
					>
						<span>{String(index + 1).padStart(2, '0')}</span>
						{t(`stages.${item}`)}
					</button>
				))}
			</div>

			<div className={styles.tourWorkspace}>
				<div className={styles.codePanel}>
					<div className={styles.codeHeader}>
						<span className={styles.fileDot} aria-hidden="true" />
						<code>two_sum.py</code>
						<span>{demo.call}</span>
					</div>
					<div className={styles.codeBody} aria-label={t('sourceLabel')}>
						{demo.source.map((line, index) => {
							const isActive = stage === 'explore' && current?.line === index + 1
							return (
								<div
									key={`${index}-${line}`}
									className={cn(styles.codeLine, isActive && styles.codeLineActive)}
								>
									<span>{index + 1}</span>
									<code>{line || ' '}</code>
								</div>
							)
						})}
					</div>
				</div>

				<div className={styles.statePanel}>
					<div className={styles.stateHeading}>
						<span>{t(`stages.${stage}`)}</span>
						{stage === 'explore' ? (
							<code>{t('stepCount', { current: stepIndex + 1, total: demo.rows.length })}</code>
						) : null}
					</div>

					{stage === 'write' ? (
						<div className={styles.stageMessage}>
							<span className={styles.messageIndex}>01</span>
							<h3>{t('write.heading')}</h3>
							<p>{t('write.body')}</p>
							<button type="button" className={styles.runButton} onClick={run}>
								<span aria-hidden="true">▶</span> {t('controls.run')}
							</button>
						</div>
					) : null}

					{stage === 'run' ? (
						<div className={styles.stageMessage}>
							<span className={cn(styles.messageIndex, styles.messageIndexDanger)}>!</span>
							<h3>{t('run.heading')}</h3>
							<p>{t('run.body')}</p>
							<div className={styles.resultComparison}>
								<div>
									<span>{t('run.expected')}</span>
									<code>{demo.expected}</code>
								</div>
								<div>
									<span>{t('run.actual')}</span>
									<code>{demo.actual}</code>
								</div>
							</div>
						</div>
					) : null}

					{stage === 'explore' && current != null ? (
						<div className={styles.exploreState}>
							<div className={styles.arrayLabel}>
								<span>{t('explore.input')}</span>
								<code>target = 6</code>
							</div>
							<div className={styles.array}>
								{demo.input.map((value, index) => (
									<div key={`${index}-${value}`} className={styles.arrayCellWrap}>
										<div className={styles.pointerSlot}>
											{pointerI === index ? <span className={styles.pointerI}>i</span> : null}
											{pointerJ === index ? <span className={styles.pointerJ}>j</span> : null}
										</div>
										<div
											className={cn(
												styles.arrayCell,
												(pointerI === index || pointerJ === index) && styles.arrayCellActive
											)}
										>
											{value}
										</div>
										<span className={styles.arrayIndex}>{index}</span>
									</div>
								))}
							</div>
							<div className={styles.variableRow}>
								<code>i = {current.i}</code>
								<code>j = {current.j}</code>
								<code>{current.sum}</code>
							</div>
							<p className={styles.stepExplanation}>
								{current.highlighted ? t('explore.bug') : t('explore.step', { line: current.line })}
							</p>
						</div>
					) : null}

					{stage === 'improve' ? (
						<div className={styles.stageMessage}>
							<span className={cn(styles.messageIndex, styles.messageIndexSuccess)}>✓</span>
							<h3>{t('improve.heading')}</h3>
							<p>{t('improve.body')}</p>
							<div className={styles.insight}>
								<span>{t('improve.insightLabel')}</span>
								<strong>{t('improve.insight')}</strong>
							</div>
							<Link href="/practice/two-sum" className={styles.practiceLink}>
								{t('improve.cta')} <span aria-hidden="true">→</span>
							</Link>
						</div>
					) : null}
				</div>
			</div>

			<div className={styles.tourControls}>
				<p role="status" aria-live="polite" className={styles.srStatus}>
					{status}
				</p>
				<button type="button" className={styles.controlButton} onClick={reset}>
					{t('controls.reset')}
				</button>
				<div>
					<button
						type="button"
						className={styles.controlButton}
						onClick={previous}
						disabled={stage === 'write'}
					>
						<span aria-hidden="true">←</span> {t('controls.previous')}
					</button>
					<button
						type="button"
						className={styles.nextButton}
						onClick={next}
						disabled={stage === 'improve'}
					>
						{stage === 'write' ? t('controls.run') : t('controls.next')}{' '}
						<span aria-hidden="true">→</span>
					</button>
				</div>
			</div>
		</section>
	)
}
