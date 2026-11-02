'use server'

import { z } from 'zod'
import { validatedAction } from './validated-action'
import { refreshRecommendation } from '@/server/learning/recommendation'

// The authenticated "Refresh AI insight" action for the /progress recommendation
// card (M7.5A). Takes no input — the learner is resolved from the validated
// session inside refreshRecommendation, never from the request body, so it can
// only ever refresh the caller's own recommendation. All the concurrency, cooldown
// and provider-failure handling lives in the service; this is the thin Server
// Action shell that returns a serialisable result object (see validatedAction).
export const refreshRecommendationAction = validatedAction({
	input: z.unknown(),
	handler: async () => refreshRecommendation()
})
