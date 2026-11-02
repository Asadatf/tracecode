'use client'

import { useState, useTransition } from 'react'
import { Link } from '@/i18n/routing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowRightIcon, InfoIcon, SpinnerIcon } from '@/components/ui/icons'
import { withSolvedTopics } from '@/lib/learning/summary-topics'
import type { ReasonCode, Recommendation } from '@/lib/learning/recommend'
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

// The dashboard's variant of the block: the summary names topics instead of a
// slug, the Start button sits on the next-step line, and the focus concepts
// follow the card. Everything stays in this one component so a refresh updates
// all of it together. /progress passes none of this and renders as before.
export interface DashboardExtras {
	topicsBySlug: Record<string, string>
	startLabels: Record<'start' | 'continue' | 'open', string>
	focusLabel: string
}

const ACTION_FOR_REASON: Record<ReasonCode, 'start' | 'continue' | 'open'> = {
	not_attempted: 'start',
	open_repeated_failures: 'continue',
	in_progress: 'continue',
	solved_revision: 'open'
}

type Status = null | 'up_to_date' | 'cooldown' | 'running' | 'failed'

export function RecommendationInsight({
	initial,
	canRefresh,
	labels,
	dashboard
}: {
	initial: Recommendation
	canRefresh: boolean
	labels: InsightLabels
	dashboard?: DashboardExtras
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

	const top = recommendation.rankedProblems[0]
	const summary =
		dashboard == null
			? diagnosis.summary
			: withSolvedTopics(diagnosis.summary, dashboard.topicsBySlug)

	const card = (
		<div className="border-border bg-surface-subtle flex flex-col gap-3 rounded-sm border p-4">
			<div className="flex items-center gap-2">
				<InfoIcon className="text-text-muted size-4 shrink-0" />
				<span className="text-text text-sm font-semibold">
					{isAi ? labels.aiHeading : labels.fallbackHeading}
				</span>
			</div>
			<p className="text-text m-0 leading-relaxed">{summary}</p>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-text-muted m-0 text-sm leading-relaxed">
					<span className="font-semibold">{labels.nextStepLabel} </span>
					{diagnosis.nextStep}
				</p>
				{dashboard != null && top != null ? (
					<Button asChild size="sm">
						<Link href={`/practice/${top.slug}`}>
							{dashboard.startLabels[ACTION_FOR_REASON[top.reasonCode]]}
							<ArrowRightIcon className="size-4" />
						</Link>
					</Button>
				) : null}
			</div>
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

	if (dashboard == null) return card
	return (
		<div className="flex flex-col gap-5">
			{card}
			{recommendation.focusConcepts.length > 0 ? (
				<div className="flex flex-col gap-2">
					<span className="text-text-muted text-sm font-semibold">{dashboard.focusLabel}</span>
					<div className="flex flex-wrap gap-2">
						{recommendation.focusConcepts.map((concept) => (
							<Badge key={concept} variant="outline">
								{concept}
							</Badge>
						))}
					</div>
				</div>
			) : null}
		</div>
	)
}
