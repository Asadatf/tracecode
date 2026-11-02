import { z } from 'zod'
import { OPENROUTER_SLUGS, type TrackedModel } from '@/server/lib/ai-usage/models'

// The PURE half of the OpenRouter provider (M7.4): request bodies, response
// parsing, failure classification and model resolution. No `server-only`, no
// SDK, no network, no env — so it is unit-testable under `node --test`, and the
// thin tracked wrapper in `openrouter.ts` is the only part that touches the
// network and `trackAiCall`. OpenRouter speaks the OpenAI chat-completions
// protocol, so usage is recorded through the `openai` extractor.

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Verified free model (OpenRouter catalogue, 2026-11-02): reasoning-capable,
// supports native structured outputs, priced at $0/token. The preferred
// candidate `qwen/qwen3.6-plus:free` does NOT exist upstream (only the PAID
// `qwen/qwen3.6-plus`), and there is no free qwen model today, so this is the
// substitute — never a silent paid fallback. Configurable via OPENROUTER_MODEL,
// but only to another slug that is mapped in OPENROUTER_SLUGS (so a call can
// never ship unpriced); an unknown override falls back to this default.
export const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3.5-super-vl:free'

// Bounded by construction. A diagnosis is two short strings and a few refs.
export const OPENROUTER_MAX_OUTPUT_TOKENS = 600
export const OPENROUTER_TIMEOUT_MS = 20_000
// One retry, on a transient failure only. Never a second provider or a paid one.
export const OPENROUTER_MAX_RETRIES = 1
// Deterministic output for a structured extraction task.
export const OPENROUTER_TEMPERATURE = 0

export type OpenRouterFailure =
	// No key configured: AI is simply disabled, the deterministic result stands.
	| 'no_api_key'
	| 'rate_limited' // HTTP 429 / free-quota exhausted
	| 'server_error' // HTTP 5xx
	| 'timeout' // the request exceeded OPENROUTER_TIMEOUT_MS
	| 'invalid_response' // 2xx with no usable assistant message
	| 'network_error' // fetch threw for another reason

// Bounded facts about a 2xx response, for diagnosing why an enrichment was
// rejected. Booleans, small enums and counts only — never the content, the
// reasoning text or anything the learner sent (spec: "Enrichment diagnostics").
export type FinishReason =
	'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error' | 'other' | 'absent'

export interface ResponseDiagnostics {
	// OpenRouter's normalized finish reason. `length` is a signal, not proof of
	// why a diagnosis was rejected.
	finishReason: FinishReason
	hasContent: boolean
	contentChars: number
	// Whether the model emitted reasoning (a reasoning field, details, or a
	// reasoning-token count). Presence only; the text is never read out.
	hasReasoning: boolean
	// Whether the provider itself reported prompt and completion token counts
	// (as opposed to our zero default for a missing figure).
	usageReported: boolean
	// The provider's response id, to join a log line to its `ai_usage` row.
	requestId?: string
}

export type OpenRouterResult =
	| { ok: true; content: string; model: string; diagnostics?: ResponseDiagnostics }
	| { ok: false; reason: OpenRouterFailure; status?: number; diagnostics?: ResponseDiagnostics }

export type StatusClass = '2xx' | '4xx' | '5xx' | 'other' | 'none'

// The class of an HTTP status; `none` when there was no response at all (a
// timeout or a network error).
export function statusClass(status: number | undefined): StatusClass {
	if (status == null) return 'none'
	if (status >= 200 && status < 300) return '2xx'
	if (status >= 400 && status < 500) return '4xx'
	if (status >= 500 && status < 600) return '5xx'
	return 'other'
}

// Only a transient failure is worth a single retry; a bad response or a missing
// key will fail again identically.
export function isRetryable(reason: OpenRouterFailure): boolean {
	return (
		reason === 'rate_limited' ||
		reason === 'server_error' ||
		reason === 'timeout' ||
		reason === 'network_error'
	)
}

// Maps an HTTP status to a failure reason; a 2xx returns null (not a failure).
export function failureForStatus(status: number): OpenRouterFailure | null {
	if (status >= 200 && status < 300) return null
	if (status === 429) return 'rate_limited'
	if (status >= 500) return 'server_error'
	// 4xx other than 429 (bad request, auth, model gone): not retried, treated as
	// a server-side/config problem the deterministic fallback absorbs.
	return 'server_error'
}

export interface OpenRouterPrompt {
	system: string
	user: string
	// A strict JSON schema for structured output, when the selected model
	// supports it. The wrapper always validates with Zod regardless, so a model
	// that ignores it still produces a usable (or rejected) result.
	jsonSchema?: { name: string; schema: Record<string, unknown> }
}

// The request body for OpenRouter's OpenAI-compatible chat endpoint. `model` is
// passed separately so it can never disagree with the tracked usage row.
export function buildChatBody(model: string, prompt: OpenRouterPrompt): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model,
		max_tokens: OPENROUTER_MAX_OUTPUT_TOKENS,
		temperature: OPENROUTER_TEMPERATURE,
		messages: [
			{ role: 'system', content: prompt.system },
			{ role: 'user', content: prompt.user }
		]
	}
	if (prompt.jsonSchema) {
		body.response_format = {
			type: 'json_schema',
			json_schema: { name: prompt.jsonSchema.name, strict: true, schema: prompt.jsonSchema.schema }
		}
	}
	return body
}

// Reads the assistant message text out of an OpenAI-shaped chat response,
// tolerating the shape being wrong (returns null rather than throwing). Usage is
// recorded separately by the tracker's own extractor, not here.
const chatResponseSchema = z.object({
	model: z.string().optional(),
	choices: z
		.array(z.object({ message: z.object({ content: z.string().nullish() }).nullish() }))
		.optional()
})

export function extractContent(
	response: unknown
): { content: string; model: string | null } | null {
	const parsed = chatResponseSchema.safeParse(response)
	if (!parsed.success) return null
	const content = parsed.data.choices?.[0]?.message?.content
	if (content == null || content.trim() === '') return null
	return { content, model: parsed.data.model ?? null }
}

const diagnosticsSchema = z.object({
	id: z.string().optional(),
	choices: z
		.array(
			z.object({
				finish_reason: z.string().nullish(),
				message: z
					.object({
						content: z.string().nullish(),
						reasoning: z.unknown().optional(),
						reasoning_details: z.unknown().optional()
					})
					.nullish()
			})
		)
		.optional(),
	usage: z
		.object({
			prompt_tokens: z.number().nullish(),
			completion_tokens: z.number().nullish(),
			completion_tokens_details: z.object({ reasoning_tokens: z.number().nullish() }).nullish()
		})
		.nullish()
})

const KNOWN_FINISH_REASONS = ['stop', 'length', 'content_filter', 'tool_calls', 'error'] as const
// A provider response id is an opaque token; anything else (free text) is dropped
// rather than logged.
const REQUEST_ID = /^[A-Za-z0-9_.:-]{1,80}$/

function nonEmpty(value: unknown): boolean {
	if (typeof value === 'string') return value.trim() !== ''
	if (Array.isArray(value)) return value.length > 0
	return false
}

// Summarises a raw chat-completion response into `ResponseDiagnostics`. Tolerates
// any shape (a wrong one reads as "nothing present") and never throws, so it can
// sit on the failure path without ever making things worse.
export function describeResponse(response: unknown): ResponseDiagnostics {
	const parsed = diagnosticsSchema.safeParse(response)
	if (!parsed.success) {
		return {
			finishReason: 'absent',
			hasContent: false,
			contentChars: 0,
			hasReasoning: false,
			usageReported: false
		}
	}
	const { id, choices, usage } = parsed.data
	const choice = choices?.[0]
	const content = choice?.message?.content?.trim() ?? ''
	const rawFinish = choice?.finish_reason
	const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0
	return {
		finishReason:
			rawFinish == null ? 'absent' : (KNOWN_FINISH_REASONS.find((k) => k === rawFinish) ?? 'other'),
		hasContent: content !== '',
		contentChars: content.length,
		hasReasoning:
			nonEmpty(choice?.message?.reasoning) ||
			nonEmpty(choice?.message?.reasoning_details) ||
			reasoningTokens > 0,
		usageReported:
			typeof usage?.prompt_tokens === 'number' && typeof usage?.completion_tokens === 'number',
		...(id != null && REQUEST_ID.test(id) ? { requestId: id } : {})
	}
}

// Turns a 2xx response body into the typed result the caller branches on, with
// the bounded diagnostics attached either way. Pure, so the empty / reasoning-only
// / length-stopped shapes are testable without a network.
export function resultFromResponse(response: unknown, requestedModel: string): OpenRouterResult {
	const diagnostics = describeResponse(response)
	const extracted = extractContent(response)
	if (extracted == null) return { ok: false, reason: 'invalid_response', diagnostics }
	return {
		ok: true,
		content: extracted.content,
		model: extracted.model ?? requestedModel,
		diagnostics
	}
}

// The model to call: the configured override when it is a mapped slug, else the
// verified free default. Membership-checked so a typo or a retired override can
// never ship a call the pricing layer cannot represent.
export function resolveModel(configured: string | undefined | null): TrackedModel {
	if (configured != null && configured !== '' && configured in OPENROUTER_SLUGS) {
		return configured as TrackedModel
	}
	return DEFAULT_OPENROUTER_MODEL
}
