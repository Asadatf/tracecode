import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { PROBLEMS } from '@/lib/trace/problems'
import { STUDY_PLANS } from '@/lib/plans/plans'
import { buildPlanViews } from '@/lib/plans/plan-view'
import { getLearningProgress } from '@/server/learning/progress'
import { AppShell } from '@/components/app-shell/app-shell'
import { PlanProgress } from '@/components/plans/plan-progress'
import dashboard from '@/components/dashboard/dashboard.module.css'
import styles from '@/components/plans/plans.module.css'

// specs/features/study-plans.md. A personal page → noindex, which also opts it
// out of the SEO PUBLIC_PAGES requirement.
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('PlansPage')
	return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

export default async function PlansPage() {
	// No session, no page (AC1): checked before progress is read.
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({ href: '/login?next=%2Fplans', locale: await getLocale() })
		return null
	}
	const [t, progress] = await Promise.all([getTranslations('PlansPage'), getLearningProgress()])
	const views = buildPlanViews(STUDY_PLANS, PROBLEMS, progress)

	return (
		<AppShell current="plans">
			<header className={dashboard.head}>
				<p className={dashboard.eyebrow}>{t('eyebrow')}</p>
				<h1 className={dashboard.title}>{t('heading')}</h1>
				<p className={styles.intro}>{t('intro')}</p>
			</header>
			{views.tracked ? null : <p className={dashboard.note}>{t('unavailable')}</p>}
			<div className={styles.grid}>
				{views.plans.map((plan) => (
					<section
						key={plan.slug}
						className={`${dashboard.card} ${styles.plan}`}
						aria-labelledby={`plan-${plan.slug}`}
					>
						<h2 id={`plan-${plan.slug}`}>
							<Link href={`/plans/${plan.slug}`}>{plan.title}</Link>
						</h2>
						<p className={styles.description}>{plan.description}</p>
						<PlanProgress plan={plan} tracked={views.tracked} showOpen />
					</section>
				))}
			</div>
		</AppShell>
	)
}
