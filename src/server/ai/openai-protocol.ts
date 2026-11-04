import { z } from 'zod'
import type { TutorPrompt, TutorProviderResult } from './tutor-provider'

// The PURE half of the OpenAI tutor provider — body shape, response parsing,
// error normalization. No `server-only`, no SDK, no network, so it is unit-
// testable under `node --test` (openai-protocol.test.mts). The thin wrapper
// in openai.ts owns the fetch + trackAiCall and is the only one that reads
// env.OPENAI_API_KEY.

export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
export const DEFAULT_TIMEOUT_MS = 20_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 600

// Non-2xx status surfaces as a thrown error through trackAiCall so the row
// is marked `error` with no tokens; we do not carry the body text.
export class OpenAiHttpError extends Error {
	readonly status: number
	constructor(status: number) {
		super(`OpenAI responded ${status}`)
		this.name = 'OpenAiHttpError'
		this.status = status
	}
}

const chatResponseSchema = z.object({
	id: z.string().optional(),
	model: z.string().optional(),
	choices: z
		.array(
			z.object({
				finish_reason: z.string().nullish(),
				message: z.object({ role: z.string(), content: z.string().nullish() }).optional()
			})
		)
		.optional()
})

export function buildBody(model: string, prompt: TutorPrompt): Record<string, unknown> {
	return {
		model,
		temperature: 0.4,
		max_tokens: prompt.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
		messages: [
			{ role: 'system', content: prompt.system },
			...prompt.messages.map((m) => ({ role: m.role, content: m.content }))
		]
	}
}

export function parseResponse(raw: unknown, requestedModel: string): TutorProviderResult {
	const parsed = chatResponseSchema.safeParse(raw)
	if (!parsed.success) return { ok: false, reason: 'invalid_response' }
	const text = parsed.data.choices?.[0]?.message?.content ?? ''
	if (text.trim().length === 0) return { ok: false, reason: 'invalid_response' }
	return {
		ok: true,
		text: text.trim(),
		model: parsed.data.model ?? requestedModel,
		provider: 'openai'
	}
}

// ─── Streaming (SSE) ─────────────────────────────────────────────────────
//
// OpenAI chat/completions with `stream: true` emits Server-Sent Events:
//
//   data: {"choices":[{"delta":{"content":"he"}}]}
//   data: {"choices":[{"delta":{"content":"llo"}}]}
//   data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
//   data: {"usage":{"prompt_tokens":123,"completion_tokens":45}}  // if stream_options.include_usage
//   data: [DONE]
//
// `parseSseBlock` is the pure parser for ONE "data: …" line's JSON body
// (minus the "data: " prefix and the "[DONE]" sentinel, which the caller
// strips). Unit-testable; see openai-protocol.test.mts.

export type SseEvent =
	| { kind: 'delta'; text: string }
	| { kind: 'finish'; reason: string }
	| { kind: 'usage'; inputTokens: number; outputTokens: number; model?: string }
	| { kind: 'ignore' }

const streamChunkSchema = z.object({
	id: z.string().optional(),
	model: z.string().optional(),
	choices: z
		.array(
			z.object({
				finish_reason: z.string().nullish(),
				delta: z
					.object({
						role: z.string().optional(),
						content: z.string().nullish()
					})
					.optional()
			})
		)
		.optional(),
	usage: z
		.object({
			prompt_tokens: z.number().nullish(),
			completion_tokens: z.number().nullish()
		})
		.nullish()
})

export function parseSseBlock(json: string): SseEvent {
	try {
		const parsed = streamChunkSchema.safeParse(JSON.parse(json))
		if (!parsed.success) return { kind: 'ignore' }
		const data = parsed.data
		// A usage-only chunk (OpenAI sends one at the end when
		// stream_options.include_usage=true).
		if (data.usage != null && data.usage !== undefined) {
			const u = data.usage
			if (data.choices == null || data.choices.length === 0) {
				return {
					kind: 'usage',
					inputTokens: u.prompt_tokens ?? 0,
					outputTokens: u.completion_tokens ?? 0,
					model: data.model
				}
			}
		}
		const choice = data.choices?.[0]
		if (choice == null) return { kind: 'ignore' }
		const delta = choice.delta?.content
		if (typeof delta === 'string' && delta.length > 0) {
			return { kind: 'delta', text: delta }
		}
		if (choice.finish_reason != null && choice.finish_reason !== '') {
			return { kind: 'finish', reason: choice.finish_reason }
		}
		return { kind: 'ignore' }
	} catch {
		// Malformed stream chunks are ignored, not thrown — one bad line
		// must never break the rest of the response.
		return { kind: 'ignore' }
	}
}

// Walks a chunk of raw bytes from the response body and yields one event
// per `data: …` line. Returns the remainder (any partial line) so the
// caller can carry it into the next chunk. Pure and testable.
export function splitSseChunk(buffer: string): { events: SseEvent[]; remainder: string } {
	const events: SseEvent[] = []
	let remainder = buffer
	while (true) {
		const nl = remainder.indexOf('\n')
		if (nl < 0) break
		const rawLine = remainder.slice(0, nl)
		remainder = remainder.slice(nl + 1)
		const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
		if (line === '' || !line.startsWith('data:')) continue
		const payload = line.slice(5).trimStart()
		if (payload === '[DONE]') {
			events.push({ kind: 'finish', reason: 'done' })
			continue
		}
		events.push(parseSseBlock(payload))
	}
	return { events, remainder }
}

// Folds a stream's events into one verdict. The ONLY way a stream counts as
// complete is the provider saying so: a `finish_reason` on a choice, or the
// `[DONE]` sentinel. A body that simply stops (a dropped connection, a proxy
// closing early) has neither, and is reported as incomplete so a truncated
// reply is never saved as a finished answer.
export type StreamVerdict =
	| { kind: 'complete'; finishReason: string }
	| { kind: 'incomplete' }
	| { kind: 'empty' }
	// The provider stopped on purpose without finishing the answer (a content
	// filter). Distinct from a cut connection, but equally not a finished reply.
	| { kind: 'blocked'; finishReason: string }

export function createStreamAccumulator() {
	let text = ''
	let finishReason: string | null = null
	let sawDone = false
	let usage: { inputTokens: number; outputTokens: number } | undefined
	let model: string | undefined
	return {
		apply(event: SseEvent): string | null {
			if (event.kind === 'delta') {
				text += event.text
				return event.text
			}
			if (event.kind === 'finish') {
				if (event.reason === 'done') sawDone = true
				else finishReason = event.reason
			} else if (event.kind === 'usage') {
				usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens }
				if (event.model != null) model = event.model
			}
			return null
		},
		verdict(): StreamVerdict {
			if (finishReason === 'content_filter') return { kind: 'blocked', finishReason }
			if (finishReason == null && !sawDone) return { kind: 'incomplete' }
			if (text.trim().length === 0) return { kind: 'empty' }
			return { kind: 'complete', finishReason: finishReason ?? 'stop' }
		},
		get text() {
			return text
		},
		get usage() {
			return usage
		},
		get model() {
			return model
		}
	}
}

// What a finished stream tells the usage tracker. Returns the response shape the
// shared OpenAI extractor reads (src/server/lib/ai-usage/usage.ts), or null when
// the call must be recorded as an `error` row.
//
// Only a reply the provider finished AND reported real token counts for becomes
// a priced `ok` row. A cut-off stream, a failure and a learner's Stop all carry
// no provider usage; recording them as `ok` with zero tokens would claim the
// call was complete and free, so they are recorded as errors with no tokens
// instead. Counts are never estimated or invented.
export function usageResponseForStream(final: {
	ok: boolean
	model?: string
	finish?: 'complete' | 'abort'
	usage?: { inputTokens: number; outputTokens: number }
}): Record<string, unknown> | null {
	if (!final.ok || final.usage == null) return null
	return {
		id: 'stream',
		model: final.model,
		choices: [{ finish_reason: 'stop' }],
		usage: {
			prompt_tokens: final.usage.inputTokens,
			completion_tokens: final.usage.outputTokens
		}
	}
}

// Provider HTTP status to a normalized failure reason (never the body).
export function failureForStatus(status: number): {
	reason: 'no_api_key' | 'rate_limited' | 'server_error' | 'invalid_response'
	status: number
} {
	if (status === 401 || status === 403) return { reason: 'no_api_key', status }
	if (status === 429) return { reason: 'rate_limited', status }
	if (status >= 500) return { reason: 'server_error', status }
	return { reason: 'invalid_response', status }
}

// The tutor's cost bounds, named once so the handler and the provider cannot
// drift apart (they previously disagreed on the timeout).
export const TUTOR_MAX_OUTPUT_TOKENS = 600
export const TUTOR_STREAM_TIMEOUT_MS = 30_000

export function buildStreamBody(model: string, prompt: TutorPrompt): Record<string, unknown> {
	return {
		...buildBody(model, prompt),
		stream: true,
		// Ask OpenAI to append a final usage-only chunk so we can price
		// the call accurately (docs/rules/ai-usage.md). When this flag is
		// absent the stream carries no token counts.
		stream_options: { include_usage: true }
	}
}

export function mapError(error: unknown): TutorProviderResult {
	if (error instanceof OpenAiHttpError) {
		const status = error.status
		if (status === 401 || status === 403) return { ok: false, reason: 'no_api_key', status }
		if (status === 429) return { ok: false, reason: 'rate_limited', status }
		if (status >= 500) return { ok: false, reason: 'server_error', status }
		return { ok: false, reason: 'invalid_response', status }
	}
	if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
		return { ok: false, reason: 'timeout' }
	}
	return { ok: false, reason: 'network_error' }
}
