import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { PROBLEMS } from '@/lib/trace/problems'
import { findPlan } from '@/lib/plans/plans'
import { buildPlanView } from '@/lib/plans/plan-view'
import { getLearningProgress } from '@/server/learning/progress'
import { AppShell } from '@/components/app-shell/app-shell'
import { PlanProgress } from '@/components/plans/plan-progress'
import dashboard from '@/components/dashboard/dashboard.module.css'
import problemStyles from '@/components/problems/problems.module.css'
import styles from '@/components/plans/plans.module.css'

// specs/features/study-plans.md, AC3. A personal page → noindex.
export async function generateMetadata({
	params
}: {
	params: Promise<{ slug: string }>
}): Promise<Metadata> {
	const { slug } = await params
	const t = await getTranslations('PlansPage')
	const plan = findPlan(slug)
	return {
		title: plan == null ? t('metaTitle') : `${plan.title} — ${t('metaTitle')}`,
		robots: { index: false, follow: false }
	}
}

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params
	const plan = findPlan(slug)
	if (plan == null) notFound()
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({
			href: `/login?next=${encodeURIComponent(`/plans/${slug}`)}`,
			locale: await getLocale()
		})
		return null
	}
	const [t, tl, progress] = await Promise.all([
		getTranslations('PlansPage'),
		getTranslations('ProblemTable'),
		getLearningProgress()
	])
	const view = buildPlanView(plan, PROBLEMS, progress)
	const tracked = progress.authenticated && progress.available

	return (
		<AppShell current="plans">
			<header className={dashboard.head}>
				<Link className={styles.back} href="/plans">
					← {t('back')}
				</Link>
				<p className={dashboard.eyebrow}>{t('heading')}</p>
				<h1 className={dashboard.title}>{view.title}</h1>
				<p className={styles.intro}>{view.description}</p>
			</header>
			{tracked ? null : <p className={dashboard.note}>{t('unavailable')}</p>}
			<section className={`${dashboard.card} ${styles.plan}`} aria-labelledby="plan-problems">
				<h2 id="plan-problems" className={dashboard.cardTitle}>
					{t('listHeading')}
				</h2>
				<PlanProgress plan={view} tracked={tracked} />
				<div className={dashboard.tableWrap}>
					<table className={dashboard.table}>
						<thead>
							<tr>
								<th scope="col">{tl('columns.number')}</th>
								<th scope="col">{tl('columns.title')}</th>
								<th scope="col">{tl('columns.difficulty')}</th>
								<th scope="col">{tl('columns.status')}</th>
							</tr>
						</thead>
						<tbody>
							{view.problems.map((row) => (
								<tr key={row.slug}>
									<td className={problemStyles.number}>{row.number}</td>
									<td className={dashboard.problemCell}>
										<Link href={`/practice/${row.slug}`}>{row.title}</Link>
									</td>
									<td>
										<span className={`${problemStyles.pill} ${problemStyles[row.difficulty]}`}>
											{tl(`difficulty.${row.difficulty}`)}
										</span>
									</td>
									<td>
										<span className={`${problemStyles.pill} ${problemStyles[row.status]}`}>
											{tl(`status.${row.status}`)}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</AppShell>
	)
}
