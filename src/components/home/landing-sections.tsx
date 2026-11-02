import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import type { TwoSumDemo } from '@/lib/home/two-sum-demo'
import styles from './landing.module.css'
import motion from './landing-motion.module.css'

export async function TraceNarrative({ demo }: { demo: TwoSumDemo }) {
	const t = await getTranslations('LandingSections')
	const row = demo.rows.find((item) => item.highlighted) ?? demo.rows[0]

	return (
		<section
			data-reveal
			className={`${styles.narrative} ${motion.narrative}`}
			aria-labelledby="narrative-title"
		>
			<div className={styles.narrativeInner}>
				<div className={`${styles.narrativeCopy} ${motion.narrativeCopy}`}>
					<span className={styles.darkKicker}>{t('narrative.kicker')}</span>
					<h2 id="narrative-title">{t('narrative.title')}</h2>
					<p>{t('narrative.body')}</p>
				</div>
				<div
					className={`${styles.narrativeVisual} ${motion.narrativeVisual}`}
					aria-label={t('narrative.visualLabel')}
				>
					<div className={`${styles.narrativeCode} ${motion.narrativeCode}`}>
						<span>{t('narrative.activeLine')}</span>
						<code>{row?.code}</code>
					</div>
					<div className={styles.narrativeArray}>
						{demo.input.map((value, index) => (
							<div key={`${index}-${value}`} className={motion.narrativeCell}>
								<div className={styles.narrativePointers}>
									{index === 0 ? (
										<>
											<span className={motion.narrativePointer}>i</span>
											<span className={motion.narrativePointer}>j</span>
										</>
									) : null}
								</div>
								<strong>{value}</strong>
								<small>{index}</small>
							</div>
						))}
					</div>
					<div className={`${styles.narrativeResult} ${motion.narrativeResult}`}>
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
		<section
			id="how-it-works"
			data-reveal
			className={`${styles.loopSection} ${motion.loopSection}`}
			aria-labelledby="loop-title"
		>
			<div className={`${styles.sectionHeading} ${motion.loopHeading}`}>
				<span className={styles.sectionKicker}>{t('loop.kicker')}</span>
				<h2 id="loop-title">{t('loop.title')}</h2>
				<p>{t('loop.body')}</p>
			</div>
			<ol className={`${styles.loopGrid} ${motion.loopGrid}`}>
				{stages.map((stage, index) => (
					<li key={stage} className={`${styles.loopCard} ${motion.loopCard}`}>
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
		<section
			data-reveal
			className={`${styles.closing} ${motion.closing}`}
			aria-labelledby="closing-title"
		>
			<span className={`${styles.sectionKicker} ${motion.closingPart}`}>{t('closing.kicker')}</span>
			<h2 id="closing-title" className={motion.closingPart}>
				{t('closing.title')}
			</h2>
			<p className={motion.closingPart}>{t('closing.body')}</p>
			<div className={`${styles.closingActions} ${motion.closingPart}`}>
				<Link href="/practice/two-sum" className={`${styles.primaryCta} ${motion.closingPrimary}`}>
					{t('closing.primary')}
				</Link>
				<a href="#problems" className={styles.secondaryCta}>
					{t('closing.secondary')}
				</a>
			</div>
		</section>
	)
}
