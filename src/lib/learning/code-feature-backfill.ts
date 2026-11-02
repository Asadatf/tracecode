import {
	featuresFromAstResult,
	markerFromAstResult,
	type AstResult,
	type CodeFeatures,
	type UnanalyzableMarker
} from '../trace/code-features'

// Browser-side backfill of code features for attempts saved before M7.1
// (ADR-0003). The server never runs Python, so the learner's own browser parses
// a few of their old sources with the Pyodide worker and posts the result back.
// Bounded, lazy and best-effort: at most BACKFILL_SESSION_LIMIT attempts per
// browser session, newest first, never forcing a resubmission, never calling an
// AI, and never throwing into the page. Everything it touches is injected so the
// limits and failure handling are tested without a browser.

export const BACKFILL_SESSION_LIMIT = 10

// Waiting for a learner's own Run to finish before analysing the next attempt.
export const IDLE_POLL_MS = 250
export const MAX_IDLE_POLLS = 20

const SESSION_KEY = 'tracecode:code-feature-backfill:v1'

// The slice of Storage the budget uses, so tests pass a plain object.
export interface BudgetStorage {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
}

export interface BackfillBudget {
	remaining(): number
	consume(count: number): void
}

// Attempts analysed so far this browser session. Backed by sessionStorage (per
// tab, survives a reload) and mirrored in memory, so a blocked or throwing
// storage degrades to a per-page-load budget rather than an unbounded one.
export function createSessionBudget(
	getStorage: () => BudgetStorage | null,
	limit: number = BACKFILL_SESSION_LIMIT
): BackfillBudget {
	let memory = 0
	function used(): number {
		let stored = 0
		try {
			const raw = Number(getStorage()?.getItem(SESSION_KEY))
			stored = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0
		} catch {
			stored = 0
		}
		return Math.max(memory, stored)
	}
	return {
		remaining: () => Math.max(0, limit - used()),
		consume(count) {
			memory = used() + count
			try {
				getStorage()?.setItem(SESSION_KEY, String(memory))
			} catch {
				// Memory still bounds this page load.
			}
		}
	}
}

export interface BackfillDeps {
	budget: BackfillBudget
	// The learner's own attempts that still lack features (≤ the requested limit),
	// or null when the read failed or the learner is signed out.
	list(limit: number): Promise<Array<{ attemptId: string; source: string }> | null>
	analyze(source: string): Promise<AstResult>
	// True when the value was stored; false for "not yours / already set".
	save(attemptId: string, value: CodeFeatures | UnanalyzableMarker): Promise<boolean>
	// True while the Pyodide worker is booted. Backfill never boots (or reboots) the
	// runtime itself: that is a ~14 MB load a learner's Run would end up waiting on.
	isReady(): boolean
	// False while a learner-initiated run/replay is queued or running.
	isIdle(): boolean
	sleep(ms: number): Promise<void>
	isCancelled(): boolean
}

export interface BackfillSummary {
	listed: number
	analyzed: number
	saved: number
	// Final outcomes with nothing to learn from (syntax error / too large): a marker
	// is stored so they are never listed or parsed again.
	marked: number
	// Transient failures (timeout, dead worker) that stored nothing and may be
	// retried in a later session.
	failed: number
	// Why the pass ended early; null when it ran to completion.
	stoppedBecause:
		'no_budget' | 'cancelled' | 'busy' | 'list_failed' | 'not_ready' | 'engine_failed' | null
}

export async function runCodeFeatureBackfill(deps: BackfillDeps): Promise<BackfillSummary> {
	const summary: BackfillSummary = {
		listed: 0,
		analyzed: 0,
		saved: 0,
		marked: 0,
		failed: 0,
		stoppedBecause: null
	}
	const limit = deps.budget.remaining()
	if (limit <= 0) return { ...summary, stoppedBecause: 'no_budget' }
	// No runtime, no server read: nothing is fetched that could not be analysed.
	if (!deps.isReady()) return { ...summary, stoppedBecause: 'not_ready' }

	let items: Array<{ attemptId: string; source: string }> | null = null
	try {
		items = await deps.list(limit)
	} catch {
		items = null
	}
	if (items == null) return { ...summary, stoppedBecause: 'list_failed' }
	// Never trust the server to honour the bound.
	const batch = items.slice(0, limit)
	summary.listed = batch.length

	for (const item of batch) {
		if (deps.isCancelled()) return { ...summary, stoppedBecause: 'cancelled' }
		let polls = 0
		while (!deps.isIdle()) {
			if (polls >= MAX_IDLE_POLLS || deps.isCancelled()) {
				return { ...summary, stoppedBecause: polls >= MAX_IDLE_POLLS ? 'busy' : 'cancelled' }
			}
			polls += 1
			await deps.sleep(IDLE_POLL_MS)
		}
		// The worker can die between items (an ast timeout recycles it); do not
		// reboot Pyodide in the background for the sake of an old attempt.
		if (!deps.isReady()) return { ...summary, stoppedBecause: 'not_ready' }
		// Counted before the attempt is analysed, so a source that always fails
		// still uses up its slot and cannot keep the pass looping.
		deps.budget.consume(1)
		summary.analyzed += 1
		try {
			const result = await deps.analyze(item.source)
			const features = featuresFromAstResult(result)
			if (features != null) {
				if (await deps.save(item.attemptId, features)) summary.saved += 1
				continue
			}
			const marker = markerFromAstResult(result)
			if (marker != null) {
				if (await deps.save(item.attemptId, marker)) summary.marked += 1
				continue
			}
			// A timeout or dead worker: not this source's fault, and the next one is
			// likely to fail the same way. Stop rather than burn through the budget.
			summary.failed += 1
			return { ...summary, stoppedBecause: 'engine_failed' }
		} catch {
			summary.failed += 1
			return { ...summary, stoppedBecause: 'engine_failed' }
		}
	}
	return summary
}
