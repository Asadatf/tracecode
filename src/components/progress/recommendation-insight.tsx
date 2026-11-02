'use client'

import { Button } from '@/components/ui/button'
import { InfoIcon, SpinnerIcon } from '@/components/ui/icons'
import type { Recommendation } from '@/lib/learning/recommend'
import { useInsightRefresh } from './use-insight-refresh'

// The AI-diagnosis block of the recommendation card, and the only place AI is
// ever triggered — on an explicit click, never on render (M7.5A). It seeds from
// the deterministic-or-cached diagnosis the server already produced, and on
// refresh swaps in whatever the service returns (a fresh AI diagnosis, or the
// deterministic fallback on cooldown/failure). It never implies the model saw raw
// source: the disclaimer states it reads activity patterns and code structure.

export interface InsightLabels {
	aiHeading: string
	fallbackHeading: string
	aiDisclaimer: string
	fallbackDisclaimer: string
	nextStepLabel: string
	refresh: string
	refreshing: string
	upToDate: string
	cooldown: string
	running: string
	failed: string
}

export function RecommendationInsight({
	initial,
	canRefresh,
	labels
}: {
	initial: Recommendation
	canRefresh: boolean
	labels: InsightLabels
}) {
	const { recommendation, status, pending, refresh: onRefresh } = useInsightRefresh(initial)

	const { diagnosis } = recommendation
	const isAi = diagnosis.source === 'ai'

	return (
		<div className="border-border bg-surface-subtle flex flex-col gap-3 rounded-sm border p-4">
			<div className="flex items-center gap-2">
				<InfoIcon className="text-text-muted size-4 shrink-0" />
				<span className="text-text text-sm font-semibold">
					{isAi ? labels.aiHeading : labels.fallbackHeading}
				</span>
			</div>
			<p className="text-text m-0 leading-relaxed">{diagnosis.summary}</p>
			<p className="text-text-muted m-0 text-sm leading-relaxed">
				<span className="font-semibold">{labels.nextStepLabel} </span>
				{diagnosis.nextStep}
			</p>
			<p className="text-text-muted m-0 text-xs leading-relaxed">
				{isAi ? labels.aiDisclaimer : labels.fallbackDisclaimer}
			</p>
			{canRefresh ? (
				<div className="flex flex-wrap items-center gap-3 pt-1">
					<Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={pending}>
						{pending ? <SpinnerIcon className="size-4" /> : null}
						{pending ? labels.refreshing : labels.refresh}
					</Button>
					{status != null ? (
						<span
							className={status === 'failed' ? 'text-warning text-sm' : 'text-text-muted text-sm'}
							role="status"
						>
							{labels[status === 'up_to_date' ? 'upToDate' : status]}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	)
}
