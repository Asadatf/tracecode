import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { PROBLEMS } from '@/lib/trace/problems'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon } from '@/components/ui/icons'
import type { Recommendation } from '@/lib/learning/recommend'
import type { ReasonCode } from '@/lib/learning/recommend'
import { RecommendationInsight, type InsightLabels } from './recommendation-insight'

// The "What to practise next" section on /progress (M7.5A). The ranking, the
// reason and the focus concepts are the deterministic M7.3 output, rendered on
// the server; only the AI insight block is interactive (and the sole AI trigger).
// The recommended problem always resolves to a real catalog problem — the ranking
// only ever contains known slugs — so the Start/Continue link can't 404.

const ACTION_FOR_REASON: Record<ReasonCode, 'start' | 'continue' | 'open'> = {
	not_attempted: 'start',
	open_repeated_failures: 'continue',
	in_progress: 'continue',
	solved_revision: 'open'
}

export async function RecommendationCard({
	recommendation,
	canRefresh
}: {
	recommendation: Recommendation
	canRefresh: boolean
}) {
	const t = await getTranslations('ProgressPage.recommendations')
	const top = recommendation.rankedProblems[0]
	const problem = top ? PROBLEMS[top.slug] : undefined

	const labels: InsightLabels = {
		aiHeading: t('insight.aiHeading'),
		fallbackHeading: t('insight.fallbackHeading'),
		aiDisclaimer: t('insight.aiDisclaimer'),
		fallbackDisclaimer: t('insight.fallbackDisclaimer'),
		nextStepLabel: t('insight.nextStep'),
		refresh: t('insight.refresh'),
		refreshing: t('insight.refreshing'),
		upToDate: t('insight.upToDate'),
		cooldown: t('insight.cooldown'),
		running: t('insight.running'),
		failed: t('insight.failed')
	}

	return (
		<section
			aria-labelledby="recommendation-heading"
			className="border-border bg-surface flex flex-col gap-5 rounded-sm border p-6"
		>
			<div className="flex flex-col gap-1">
				<h2 id="recommendation-heading" className="m-0 text-lg font-bold">
					{t('heading')}
				</h2>
				<p className="text-text-muted m-0 text-sm">{t('subheading')}</p>
			</div>

			{problem && top ? (
				<>
					<div className="border-border bg-surface-subtle flex flex-wrap items-center justify-between gap-4 rounded-sm border p-4">
						<div className="flex flex-col gap-1.5">
							<div className="flex items-center gap-2">
								<span className="text-text text-base font-semibold">{problem.title}</span>
								<Badge variant="secondary">{t(`difficulty.${problem.difficulty}`)}</Badge>
							</div>
							<p className="text-text-muted m-0 text-sm leading-relaxed">{top.reasonText}</p>
						</div>
						<Button asChild size="sm">
							<Link href={`/practice/${top.slug}`}>
								{t(`action.${ACTION_FOR_REASON[top.reasonCode]}`)}
								<ArrowRightIcon className="size-4" />
							</Link>
						</Button>
					</div>

					{recommendation.focusConcepts.length > 0 ? (
						<div className="flex flex-col gap-2">
							<span className="text-text-muted text-sm font-semibold">{t('focusConcepts')}</span>
							<div className="flex flex-wrap gap-2">
								{recommendation.focusConcepts.map((concept) => (
									<Badge key={concept} variant="outline">
										{concept}
									</Badge>
								))}
							</div>
						</div>
					) : null}

					<RecommendationInsight initial={recommendation} canRefresh={canRefresh} labels={labels} />
				</>
			) : (
				<p className="text-text-muted m-0">{t('empty')}</p>
			)}
		</section>
	)
}
