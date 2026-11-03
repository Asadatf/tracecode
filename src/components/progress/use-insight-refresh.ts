'use client'

import { useState, useTransition } from 'react'
import type { Recommendation } from '@/lib/learning/recommend'
import { refreshRecommendationAction } from '@/server/actions/recommendations'

export type InsightStatus = null | 'up_to_date' | 'cooldown' | 'running' | 'failed'
// What a click ended in. `refreshed` is a fresh AI diagnosis; the rest match InsightStatus.
export type InsightOutcome = 'refreshed' | Exclude<InsightStatus, null>

// The explicit "Refresh AI insight" click, shared by /progress and the
// dashboard: seeds from what the server rendered, and on refresh swaps in
// whatever the service returns (a fresh AI diagnosis, or the deterministic
// fallback on cooldown/failure). The only place AI is ever triggered (M7.5A).
export function useInsightRefresh(
	initial: Recommendation,
	// Called once per click with how it ended (the dashboard shows a toast).
	onResult?: (outcome: InsightOutcome) => void
) {
	const [recommendation, setRecommendation] = useState(initial)
	const [status, setStatus] = useState<InsightStatus>(null)
	const [pending, startTransition] = useTransition()

	function refresh() {
		setStatus(null)
		startTransition(async () => {
			const result = await refreshRecommendationAction(undefined)
			if (!result.ok || !result.data.view.available || result.data.view.recommendation == null) {
				setStatus('failed')
				onResult?.('failed')
				return
			}
			setRecommendation(result.data.view.recommendation)
			let outcome: InsightOutcome
			switch (result.data.reason) {
				case 'ai_applied':
					outcome = 'refreshed'
					break
				case 'reused_cache':
					outcome = 'up_to_date'
					break
				case 'cooldown':
					outcome = 'cooldown'
					break
				case 'claim_lost':
					outcome = 'running'
					break
				default:
					// ai_disabled / ai_rejected_or_failed / evidence_moved
					outcome = 'failed'
			}
			setStatus(outcome === 'refreshed' ? null : outcome)
			onResult?.(outcome)
		})
	}

	return { recommendation, status, pending, refresh }
}
