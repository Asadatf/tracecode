import { getTranslations } from 'next-intl/server'
import styles from './auth.module.css'

// The brand panel: one small Two Sum trace stepping through its lines while the
// variables update — the product's actual subject. Pure CSS (a moving line
// highlight plus stacked values that take turns), so it needs no JS, adds no
// dependency, and `prefers-reduced-motion` simply freezes it on the last step.
// Illustrative and labelled as such; it is not live Python.

const SOURCE = [
	'def two_sum(nums, target):',
	'    seen = {}',
	'    for i, n in enumerate(nums):',
	'        need = target - n',
	'        if need in seen:',
	'            return [seen[need], i]',
	'        seen[n] = i'
]

// The highlighted source line (0-based) at each step of two_sum([3, 2, 4], 6).
const STEP_LINES = [1, 2, 3, 4, 6, 2, 3, 4, 5] as const
// What each variable shows at each of those steps.
const VARIABLES: Array<{ name: string; values: readonly string[] }> = [
	{ name: 'i', values: ['-', '0', '0', '0', '0', '1', '1', '1', '1'] },
	{ name: 'n', values: ['-', '3', '3', '3', '3', '2', '2', '2', '2'] },
	{ name: 'need', values: ['-', '-', '3', '3', '3', '3', '4', '4', '4'] },
	{
		name: 'seen',
		values: ['{}', '{}', '{}', '{}', '{3: 0}', '{3: 0}', '{3: 0}', '{3: 0}', '{3: 0}']
	}
]
const STEP_COUNT = STEP_LINES.length
const STEP_SECONDS = 1.8
const LINE_HEIGHT_REM = 1.75

export async function AuthVisual({ variant }: { variant: 'sign-in' | 'register' }) {
	const t = await getTranslations('Auth.visual')
	const cycle = `${(STEP_COUNT * STEP_SECONDS).toFixed(1)}s`
	return (
		<aside className={styles.visual} aria-label={t('label')}>
			<div className={styles.visualInner}>
				<p className={styles.visualEyebrow}>
					<span aria-hidden="true" className={styles.pulse} />
					{t('caption')}
				</p>
				<h2 className={styles.visualHeading}>
					{variant === 'sign-in' ? t('signInHeading') : t('registerHeading')}
				</h2>

				{/* Decorative: the trace restates nothing the page needs to be usable. */}
				<div
					className={styles.window}
					aria-hidden="true"
					style={
						{
							'--cycle': cycle,
							'--step': `${STEP_SECONDS}s`,
							'--lh': `${LINE_HEIGHT_REM}rem`
						} as React.CSSProperties
					}
				>
					<div className={styles.windowBar}>
						<span>two_sum.py</span>
						<span className={styles.stepLabel}>
							{t('step')}
							<span className={styles.valueStack}>
								{STEP_LINES.map((_, step) => (
									<span
										key={step}
										className={`${styles.value} ${styles.slot}`}
										data-final={step === STEP_COUNT - 1 || undefined}
										style={{ '--k': step } as React.CSSProperties}
									>
										{step + 1}/{STEP_COUNT}
									</span>
								))}
							</span>
						</span>
					</div>
					<div className={styles.code}>
						{STEP_LINES.map((line, step) => (
							<span
								key={step}
								className={`${styles.bar} ${styles.slot}`}
								data-final={step === STEP_COUNT - 1 || undefined}
								style={{ '--k': step, '--line': line } as React.CSSProperties}
							/>
						))}
						{SOURCE.map((text, index) => (
							<div key={text} className={styles.codeLine}>
								<span className={styles.lineNo}>{index + 1}</span>
								<span className={styles.lineText}>{text}</span>
							</div>
						))}
					</div>
					<div className={styles.state}>
						<p className={styles.stateTitle}>{t('variables')}</p>
						<dl className={styles.stateGrid}>
							{VARIABLES.map((variable) => (
								<div key={variable.name} className={styles.stateRow}>
									<dt>{variable.name}</dt>
									<dd className={styles.valueStack}>
										{variable.values.map((value, step) => (
											<span
												key={step}
												className={`${styles.value} ${styles.slot}`}
												data-final={step === STEP_COUNT - 1 || undefined}
												style={{ '--k': step } as React.CSSProperties}
											>
												{value}
											</span>
										))}
									</dd>
								</div>
							))}
						</dl>
					</div>
				</div>
			</div>
		</aside>
	)
}
