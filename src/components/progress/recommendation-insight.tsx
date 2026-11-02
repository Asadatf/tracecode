'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { InfoIcon, SpinnerIcon } from '@/components/ui/icons'
import type { Recommendation } from '@/lib/learning/recommend'
import { refreshRecommendationAction } from '@/server/actions/recommendations'

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

type Status = null | 'up_to_date' | 'cooldown' | 'running' | 'failed'

export function RecommendationInsight({
	initial,
	canRefresh,
	labels
}: {
	initial: Recommendation
	canRefresh: boolean
	labels: InsightLabels
}) {
	const [recommendation, setRecommendation] = useState(initial)
	const [status, setStatus] = useState<Status>(null)
	const [pending, startTransition] = useTransition()

	const { diagnosis } = recommendation
	const isAi = diagnosis.source === 'ai'

	function onRefresh() {
		setStatus(null)
		startTransition(async () => {
			const result = await refreshRecommendationAction(undefined)
			if (!result.ok || !result.data.view.available || result.data.view.recommendation == null) {
				setStatus('failed')
				return
			}
			setRecommendation(result.data.view.recommendation)
			switch (result.data.reason) {
				case 'ai_applied':
					setStatus(null)
					break
				case 'reused_cache':
					setStatus('up_to_date')
					break
				case 'cooldown':
					setStatus('cooldown')
					break
				case 'claim_lost':
					setStatus('running')
					break
				default:
					// ai_disabled / ai_rejected_or_failed / evidence_moved
					setStatus('failed')
			}
		})
	}

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
