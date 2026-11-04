// Per-user in-memory token-bucket. No `import 'server-only'`: the module
// is pure and only reached from server callers (handler.ts), but we want it
// unit-testable under `node --test`. M8 does not justify adding Redis or a
// database quota table (specs/features/contextual-ai-tutor.md § Security);
// the goal is "reasonable server-side throttling", not a billing meter. On
// Vercel this is per-instance, so a learner spraying the endpoint hits a
// single warm instance's bucket; in practice the AI call itself (20 s
// timeout + ~600 output tokens) is the dominant cost ceiling.
//
// Configurable from env would be premature — the numbers here match the
// 15-questions-per-conversation UX cap (max ~60 questions/minute even if
// the learner never read a reply).

const MAX_REQUESTS = 20
const WINDOW_MS = 60_000

interface Bucket {
	windowStart: number
	count: number
}

const buckets = new Map<string, Bucket>()

export function checkRateLimit(
	userId: string,
	now = Date.now()
): { ok: boolean; retryAfterMs?: number } {
	const existing = buckets.get(userId)
	if (existing == null || now - existing.windowStart >= WINDOW_MS) {
		buckets.set(userId, { windowStart: now, count: 1 })
		return { ok: true }
	}
	if (existing.count >= MAX_REQUESTS) {
		return { ok: false, retryAfterMs: WINDOW_MS - (now - existing.windowStart) }
	}
	existing.count += 1
	return { ok: true }
}

// Exposed for tests.
export const __rateLimitInternal = { buckets, MAX_REQUESTS, WINDOW_MS }
