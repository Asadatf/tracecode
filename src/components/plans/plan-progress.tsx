import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import type { PlanView } from '@/lib/plans/plan-view'
import problems from '@/components/problems/problems.module.css'
import styles from './plans.module.css'

// A plan's "n of m solved", its bar, and Start / Continue / Completed
// (specs/features/study-plans.md, AC2, AC4). Shared by the list and the plan page.
export async function PlanProgress({
	plan,
	tracked,
	showOpen = false
}: {
	plan: PlanView
	tracked: boolean
	showOpen?: boolean
}) {
	const t = await getTranslations('PlansPage')
	const percent = plan.total === 0 ? 0 : Math.round((plan.solved / plan.total) * 100)
	return (
		<>
			<div className={styles.meta}>
				<span>{t('problemCount', { count: plan.total })}</span>
				{tracked ? <span>{t('progress', { solved: plan.solved, total: plan.total })}</span> : null}
			</div>
			{tracked ? (
				<div
					className={styles.bar}
					role="progressbar"
					aria-label={t('progress', { solved: plan.solved, total: plan.total })}
					aria-valuemin={0}
					aria-valuemax={plan.total}
					aria-valuenow={plan.solved}
				>
					<span className={styles.fill} style={{ width: `${percent}%` }} />
				</div>
			) : null}
			<div className={styles.actions}>
				{plan.completed ? (
					<span className={`${problems.pill} ${problems.solved}`}>{t('completed')}</span>
				) : plan.continueSlug != null ? (
					<Link className={styles.primary} href={`/practice/${plan.continueSlug}`}>
						{plan.started ? t('continue') : t('start')}
					</Link>
				) : null}
				{showOpen ? (
					<Link className={styles.secondary} href={`/plans/${plan.slug}`}>
						{t('open')}
					</Link>
				) : null}
			</div>
		</>
	)
}
