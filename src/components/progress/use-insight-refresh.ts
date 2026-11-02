'use client'

import { useState, useTransition } from 'react'
import type { Recommendation } from '@/lib/learning/recommend'
import { refreshRecommendationAction } from '@/server/actions/recommendations'

export type InsightStatus = null | 'up_to_date' | 'cooldown' | 'running' | 'failed'

// The explicit "Refresh AI insight" click, shared by /progress and the
// dashboard: seeds from what the server rendered, and on refresh swaps in
// whatever the service returns (a fresh AI diagnosis, or the deterministic
// fallback on cooldown/failure). The only place AI is ever triggered (M7.5A).
export function useInsightRefresh(initial: Recommendation) {
	const [recommendation, setRecommendation] = useState(initial)
	const [status, setStatus] = useState<InsightStatus>(null)
	const [pending, startTransition] = useTransition()

	function refresh() {
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

	return { recommendation, status, pending, refresh }
}
