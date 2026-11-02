import 'server-only'
import { env } from '@/lib/env'
import { trackAiCall } from '@/server/lib/ai-usage/sink'
import type { AiUsageMeta } from '@/server/lib/ai-usage/track'
import type { TrackedModel } from '@/server/lib/ai-usage/models'
import {
	OPENROUTER_CHAT_URL,
	OPENROUTER_MAX_RETRIES,
	OPENROUTER_TIMEOUT_MS,
	buildChatBody,
	extractContent,
	failureForStatus,
	isRetryable,
	type OpenRouterPrompt,
	type OpenRouterResult
} from './openrouter-protocol'

// The only file that calls OpenRouter's network endpoint and the only one that
// calls `trackAiCall` for it (docs/rules/ai-usage.md). Usage is recorded with
// `provider: 'openrouter'` (attribution), extracted with the OpenAI-compatible
// shape OpenRouter returns, and priced through its OpenRouter slug — a `:free`
// model prices at exactly $0, recorded, not NULL. The server-side API key is read
// here and never returned, logged, or placed in `meta`.
//
// Expected failures (no key, 429, 5xx, timeout, unusable body) come back as a
// typed `OpenRouterResult`, never a throw, so a caller can always fall back to
// the deterministic recommendation. One bounded retry on a transient failure,
// tracked under a distinct `_retry` feature so both attempts are costed.

// Thrown inside the tracked call so a non-2xx response is recorded as an `error`
// row (no tokens) and classified by the caller. Carries only the status code.
class OpenRouterHttpError extends Error {
	constructor(readonly status: number) {
		super(`OpenRouter responded ${status}`)
		this.name = 'OpenRouterHttpError'
	}
}

export interface OpenRouterContext {
	feature: string
	model: TrackedModel
	meta?: AiUsageMeta
}

async function attempt(
	context: OpenRouterContext,
	apiKey: string,
	body: Record<string, unknown>
): Promise<OpenRouterResult> {
	try {
		const response = await trackAiCall(
			{
				provider: 'openrouter',
				feature: context.feature,
				model: context.model,
				meta: context.meta
			},
			async () => {
				const res = await fetch(OPENROUTER_CHAT_URL, {
					method: 'POST',
					signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
					headers: {
						authorization: `Bearer ${apiKey}`,
						'content-type': 'application/json',
						accept: 'application/json'
					},
					body: JSON.stringify(body)
				})
				// Throw before reading a non-2xx body: there are no usage tokens to
				// record, and the status is all the classifier needs.
				if (!res.ok) throw new OpenRouterHttpError(res.status)
				// Returned to trackAiCall so the `openai` extractor reads usage/model.
				return (await res.json()) as unknown
			}
		)
		const extracted = extractContent(response)
		if (extracted == null) return { ok: false, reason: 'invalid_response' }
		return { ok: true, content: extracted.content, model: extracted.model ?? context.model }
	} catch (error) {
		return mapError(error)
	}
}

// Maps a thrown error to a typed failure WITHOUT leaking its message (which
// could contain a URL, a header, or body text). Only a status code or a coarse
// category crosses this boundary.
function mapError(error: unknown): OpenRouterResult {
	if (error instanceof OpenRouterHttpError) {
		return {
			ok: false,
			reason: failureForStatus(error.status) ?? 'server_error',
			status: error.status
		}
	}
	// AbortSignal.timeout rejects with a TimeoutError/AbortError.
	if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
		return { ok: false, reason: 'timeout' }
	}
	return { ok: false, reason: 'network_error' }
}

/**
 * One OpenRouter chat call, tracked and bounded, returning a typed result.
 *
 * Never throws for an expected condition (missing key, rate limit, timeout, bad
 * body): the caller branches on `ok` and keeps its deterministic fallback. A
 * single retry fires on a transient failure, costed under `${feature}_retry`.
 */
export async function askOpenRouter(
	context: OpenRouterContext,
	prompt: OpenRouterPrompt
): Promise<OpenRouterResult> {
	const apiKey = env.OPENROUTER_API_KEY
	if (apiKey == null || apiKey === '') return { ok: false, reason: 'no_api_key' }

	const body = buildChatBody(context.model, prompt)
	let result = await attempt(context, apiKey, body)
	for (let retry = 0; retry < OPENROUTER_MAX_RETRIES; retry += 1) {
		if (result.ok || !isRetryable(result.reason)) break
		result = await attempt({ ...context, feature: `${context.feature}_retry` }, apiKey, body)
	}
	return result
}
