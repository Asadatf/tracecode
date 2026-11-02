import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import type { TwoSumDemo } from '@/lib/home/two-sum-demo'
import styles from './landing.module.css'

export async function TraceNarrative({ demo }: { demo: TwoSumDemo }) {
	const t = await getTranslations('LandingSections')
	const row = demo.rows.find((item) => item.highlighted) ?? demo.rows[0]

	return (
		<section className={styles.narrative} aria-labelledby="narrative-title">
			<div className={styles.narrativeInner}>
				<div className={styles.narrativeCopy}>
					<span className={styles.darkKicker}>{t('narrative.kicker')}</span>
					<h2 id="narrative-title">{t('narrative.title')}</h2>
					<p>{t('narrative.body')}</p>
				</div>
				<div className={styles.narrativeVisual} aria-label={t('narrative.visualLabel')}>
					<div className={styles.narrativeCode}>
						<span>{t('narrative.activeLine')}</span>
						<code>{row?.code}</code>
					</div>
					<div className={styles.narrativeArray}>
						{demo.input.map((value, index) => (
							<div key={`${index}-${value}`}>
								<div className={styles.narrativePointers}>
									{index === 0 ? (
										<>
											<span>i</span>
											<span>j</span>
										</>
									) : null}
								</div>
								<strong>{value}</strong>
								<small>{index}</small>
							</div>
						))}
					</div>
					<div className={styles.narrativeResult}>
						<span>{row?.sum}</span>
						<strong>{t('narrative.explanation')}</strong>
					</div>
				</div>
			</div>
		</section>
	)
}

export async function LearningLoop() {
	const t = await getTranslations('LandingSections')
	const stages = ['write', 'run', 'explore', 'improve'] as const

	return (
		<section id="how-it-works" className={styles.loopSection} aria-labelledby="loop-title">
			<div className={styles.sectionHeading}>
				<span className={styles.sectionKicker}>{t('loop.kicker')}</span>
				<h2 id="loop-title">{t('loop.title')}</h2>
				<p>{t('loop.body')}</p>
			</div>
			<ol className={styles.loopGrid}>
				{stages.map((stage, index) => (
					<li key={stage} className={styles.loopCard}>
						<span>{String(index + 1).padStart(2, '0')}</span>
						<h3>{t(`loop.stages.${stage}.title`)}</h3>
						<p>{t(`loop.stages.${stage}.body`)}</p>
					</li>
				))}
			</ol>
		</section>
	)
}

export async function ClosingCta() {
	const t = await getTranslations('LandingSections')

	return (
		<section className={styles.closing} aria-labelledby="closing-title">
			<span className={styles.sectionKicker}>{t('closing.kicker')}</span>
			<h2 id="closing-title">{t('closing.title')}</h2>
			<p>{t('closing.body')}</p>
			<div className={styles.closingActions}>
				<Link href="/practice/two-sum" className={styles.primaryCta}>
					{t('closing.primary')}
				</Link>
				<a href="#problems" className={styles.secondaryCta}>
					{t('closing.secondary')}
				</a>
			</div>
		</section>
	)
}
