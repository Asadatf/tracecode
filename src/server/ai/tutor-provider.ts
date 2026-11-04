import 'server-only'
import { env } from '@/lib/env'
import { OPENROUTER_SLUGS, type TrackedModel } from '@/server/lib/ai-usage/models'
import { askOpenAI, askOpenAIStream } from './openai'

// Provider-independent adapter for the AI Tutor (specs/features/
// contextual-ai-tutor.md). The tutor handler holds only this contract; the
// concrete OpenAI call lives in src/server/ai/openai.ts. Adding another
// provider (OpenRouter-backed tutor, Anthropic-backed tutor) is a case in
// `callTutorProvider` and a new file under src/server/ai/, not a rewrite of
// tutor logic.

export type TutorMessage = { role: 'user' | 'assistant'; content: string }

export interface TutorPrompt {
	system: string
	messages: TutorMessage[]
	// Hard bound passed through to the provider so one runaway completion
	// cannot cost multiples of a normal one. Separate from the request
	// timeout.
	maxOutputTokens?: number
	timeoutMs?: number
}

export type TutorProviderFailure =
	| 'no_api_key' // unset — the tutor is simply disabled
	| 'rate_limited' // 429 / upstream quota
	| 'server_error' // 5xx
	| 'timeout'
	| 'invalid_response' // 2xx with no usable text
	| 'network_error' // fetch rejected / connection issue

export type TutorProviderResult =
	| { ok: true; text: string; model: string; provider: string }
	| { ok: false; reason: TutorProviderFailure; status?: number }

export interface TutorProviderConfig {
	provider: 'openai' | 'openrouter'
	model: TrackedModel
	feature: string
}

const DEFAULT_MODEL: TrackedModel = 'gpt-4o-mini'
const DEFAULT_PROVIDER: 'openai' | 'openrouter' = 'openai'

// Resolve env to a validated, provider-and-model pair. An unmapped
// AI_TUTOR_MODEL is rejected rather than silently priced NULL — the ai-usage
// rule is "unmapped doesn't compile at call sites", and this resolve is the
// runtime equivalent at the config boundary.
export function resolveTutorConfig(): TutorProviderConfig {
	const provider = env.AI_TUTOR_PROVIDER ?? DEFAULT_PROVIDER
	const rawModel = env.AI_TUTOR_MODEL
	const modelCandidate = rawModel == null || rawModel === '' ? DEFAULT_MODEL : rawModel
	const model = isTrackedModel(modelCandidate) ? modelCandidate : DEFAULT_MODEL
	return { provider, model, feature: 'tutor_chat' }
}

function isTrackedModel(value: string): value is TrackedModel {
	return Object.prototype.hasOwnProperty.call(OPENROUTER_SLUGS, value)
}

// The one call site a tutor handler ever makes.
export function callTutorProvider(
	config: TutorProviderConfig,
	prompt: TutorPrompt
): Promise<TutorProviderResult> {
	switch (config.provider) {
		case 'openai':
			return askOpenAI(config, prompt)
		case 'openrouter':
			// Future: route through the existing src/server/ai/openrouter.ts
			// chat wrapper. Not wired in M8; keep the exhaustive switch so a
			// new case is a type error, not a silent fallback to OpenAI.
			return Promise.resolve({ ok: false, reason: 'no_api_key' })
	}
}

// ─── Streaming ────────────────────────────────────────────────────────────
//
// The streaming contract. A provider implementation returns a
// `TutorProviderStream`: an async iterable of text deltas, plus a
// `completion` promise that resolves to the final aggregated result
// (text, model, and token usage when the provider reports it). The handler
// forwards deltas to the HTTP response as they arrive and persists a
// usage row only after `completion` resolves — so an aborted stream never
// records fabricated tokens, and a provider that omits usage metadata
// writes a row with `tokens: 0` rather than making them up.

export type TutorStreamFailure = { reason: TutorProviderFailure; status?: number }

export interface TutorStreamFinal {
	ok: true
	text: string
	model: string
	provider: string
	// Real token counts from the provider when it reports them (OpenAI
	// does via `stream_options.include_usage`), otherwise undefined.
	usage?: { inputTokens: number; outputTokens: number }
	// How the stream ended. `abort` means the consumer (or an upstream
	// controller) cancelled; `complete` means the model finished.
	finish: 'complete' | 'abort'
}

export interface TutorProviderStream {
	// Fires text deltas in the order the provider sent them. Yields
	// nothing when the stream failed before the first chunk — inspect
	// `completion` for the final outcome in every case.
	readonly deltas: AsyncIterable<string>
	// Resolves once the stream has ended (complete, abort, or provider
	// failure). This is what trackAiCall wraps so the usage row is written
	// EXACTLY once — never per-chunk.
	readonly completion: Promise<TutorStreamFinal | ({ ok: false } & TutorStreamFailure)>
	// Caller-controlled cancellation. A route handler ties this to the
	// request's own AbortSignal so a client disconnect stops the upstream
	// provider fetch and nothing continues to be billed.
	readonly abort: () => void
}

export function callTutorProviderStream(
	config: TutorProviderConfig,
	prompt: TutorPrompt,
	signal?: AbortSignal
): TutorProviderStream {
	switch (config.provider) {
		case 'openai':
			return askOpenAIStream(config, prompt, signal)
		case 'openrouter':
			// Stub in M8. Mirrors callTutorProvider: an exhaustive switch
			// keeps a future provider addition honest.
			return disabledStream('no_api_key')
	}
}

// A degenerate stream that yields nothing and resolves immediately to the
// given failure. Used when the provider is not configured, and by tests.
export function disabledStream(reason: TutorProviderFailure): TutorProviderStream {
	return {
		deltas: {
			[Symbol.asyncIterator](): AsyncIterator<string> {
				return {
					next: () => Promise.resolve({ value: undefined, done: true })
				}
			}
		},
		completion: Promise.resolve({ ok: false, reason }),
		abort: () => {}
	}
}
