'use client'

import { useEffect } from 'react'
import { analyzeCode, isEngineBooted, isEngineIdle, warmUpEngine } from '@/lib/trace/run-code'
import {
	createSessionBudget,
	runCodeFeatureBackfill,
	type BackfillDeps
} from '@/lib/learning/code-feature-backfill'
import { listBackfillCandidates, saveCodeFeatures } from '@/server/actions/learning'

// Renders nothing. For a signed-in learner it lazily gives a few of their
// pre-M7 attempts a code-feature fingerprint (specs/features/learning-
// recommendations.md): the browser's Pyodide worker parses the source — the
// server never runs Python — and the result is saved only where still missing.
// It starts once the runtime is warm, queues behind (never ahead of) a Run or
// Replay the learner starts, and every failure is swallowed: the practice page
// must never be affected by it. Mounted on the practice page only, because
// ADR-0001 keeps Pyodide off every other page.

function browserStorage(): Storage | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage
	} catch {
		return null
	}
}

const budget = createSessionBudget(browserStorage)

export function CodeFeatureBackfill() {
	useEffect(() => {
		let cancelled = false
		const deps: BackfillDeps = {
			budget,
			list: async (limit) => {
				const res = await listBackfillCandidates({ limit })
				return res.ok ? res.data.items : null
			},
			analyze: (source) => analyzeCode({ code: source }),
			isReady: isEngineBooted,
			save: async (attemptId, codeFeatures) => {
				const res = await saveCodeFeatures({ attemptId, codeFeatures })
				return res.ok && res.data.saved
			},
			isIdle: isEngineIdle,
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			isCancelled: () => cancelled
		}
		void warmUpEngine()
			.then(() => (cancelled ? undefined : runCodeFeatureBackfill(deps)))
			.catch(() => undefined)
		return () => {
			cancelled = true
		}
	}, [])
	return null
}
