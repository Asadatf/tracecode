import 'server-only'
import { AppError } from '@/lib/errors/app-error'
import { PROBLEMS } from '@/lib/trace/problems'
import { buildSystemPrompt } from '@/lib/tutor/system-prompt'
import { knowledgeFor } from '@/lib/tutor/problem-knowledge'
import { LIMITS, type TutorRequest, type TutorResponse } from '@/lib/tutor/types'
import {
	callTutorProvider,
	callTutorProviderStream,
	resolveTutorConfig,
	type TutorMessage as ProviderMessage,
	type TutorPrompt,
	type TutorProviderFailure
} from '@/server/ai/tutor-provider'
import { checkRateLimit } from './rate-limit'
import { captureError } from '@/lib/observability/capture-error'
import { log } from '@/server/lib/logger'

// The handler is the whole pipeline: authenticate (the caller supplies the
// validated user id), rate-limit, look up the curated knowledge, assemble
// the prompt and call the provider. It returns a plain object so the route
// factory can serialize it; it never throws for an expected failure.

export async function handleTutorRequest(
	userId: string,
	input: TutorRequest
): Promise<TutorResponse> {
	const problem = PROBLEMS[input.problemSlug]
	if (problem == null) {
		throw new AppError('Unknown problem.', { status: 400, code: 'tutor.unknown_problem' })
	}
	const knowledge = knowledgeFor(input.problemSlug)
	if (knowledge == null) {
		// Covered by a unit test that guarantees every PROBLEMS slug has
		// knowledge; if this fires in prod it is a real bug worth reporting.
		captureError(new Error(`No tutor knowledge for ${input.problemSlug}`))
		return { ok: false, reason: 'unavailable', message: 'This problem has no tutor context yet.' }
	}

	const limit = checkRateLimit(userId)
	if (!limit.ok) {
		return {
			ok: false,
			reason: 'rate_limited',
			message: 'You are asking very fast. Try again in a moment.'
		}
	}

	const system = buildSystemPrompt({ problem, knowledge, context: input.context })
	const messages = toProviderMessages(input.messages)

	const config = resolveTutorConfig()
	const result = await callTutorProvider(config, {
		system,
		messages,
		maxOutputTokens: 600,
		timeoutMs: 20_000
	})

	if (!result.ok) {
		log.warn('tutor.provider_failure', { reason: result.reason, status: result.status })
		return providerFailureResponse(result.reason)
	}
	return { ok: true, reply: result.text }
}

function toProviderMessages(messages: TutorRequest['messages']): ProviderMessage[] {
	// Bound again, defence in depth. The Zod schema already caps lengths; this
	// stops a schema change from silently inflating prompts.
	const trimmed = messages.slice(-LIMITS.maxMessagesSent)
	return trimmed.map((m) => ({
		role: m.role,
		content:
			m.text.length > LIMITS.maxMessageChars ? m.text.slice(0, LIMITS.maxMessageChars) : m.text
	}))
}

// ─── Streaming handler ───────────────────────────────────────────────────
//
// Returns a ReadableStream of NDJSON events for the route handler to pipe
// into the HTTP response. Events (one per line, newline-terminated JSON):
//
//   {"type":"start"}
//   {"type":"delta","text":"he"}
//   {"type":"delta","text":"llo"}
//   {"type":"done"}
//   {"type":"error","reason":"timeout","message":"…"}
//
// A commit decision is the CLIENT's responsibility — the server never
// records a conversation, so an aborted or failed stream naturally leaves
// nothing persisted. The usage row IS written for the real tokens the
// provider served (even on abort), through trackAiCall inside askOpenAIStream.

export type TutorStreamOutcome =
	| { ok: true; stream: ReadableStream<Uint8Array>; abort: () => void }
	| { ok: false; response: TutorResponse; httpStatus: number }

export async function handleTutorStreamRequest(
	userId: string,
	input: TutorRequest,
	requestSignal?: AbortSignal
): Promise<TutorStreamOutcome> {
	const problem = PROBLEMS[input.problemSlug]
	if (problem == null) {
		throw new AppError('Unknown problem.', { status: 400, code: 'tutor.unknown_problem' })
	}
	const knowledge = knowledgeFor(input.problemSlug)
	if (knowledge == null) {
		captureError(new Error(`No tutor knowledge for ${input.problemSlug}`))
		return {
			ok: false,
			httpStatus: 503,
			response: {
				ok: false,
				reason: 'unavailable',
				message: 'This problem has no tutor context yet.'
			}
		}
	}

	const limit = checkRateLimit(userId)
	if (!limit.ok) {
		return {
			ok: false,
			httpStatus: 429,
			response: {
				ok: false,
				reason: 'rate_limited',
				message: 'You are asking very fast. Try again in a moment.'
			}
		}
	}

	const system = buildSystemPrompt({ problem, knowledge, context: input.context })
	const messages = toProviderMessages(input.messages)
	const prompt: TutorPrompt = { system, messages, maxOutputTokens: 600, timeoutMs: 30_000 }
	const config = resolveTutorConfig()
	const providerStream = callTutorProviderStream(config, prompt, requestSignal)

	const encoder = new TextEncoder()
	const writeLine = (controller: ReadableStreamDefaultController<Uint8Array>, obj: object) => {
		controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
	}

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			writeLine(controller, { type: 'start' })
			try {
				for await (const delta of providerStream.deltas) {
					writeLine(controller, { type: 'delta', text: delta })
				}
			} catch {
				// A thrown reader is already surfaced via `completion` below;
				// swallow here so the final event is correctly classified.
			}
			const final = await providerStream.completion
			if (final.ok) {
				if (final.finish === 'abort') {
					writeLine(controller, { type: 'aborted' })
				} else {
					writeLine(controller, { type: 'done' })
				}
			} else {
				const normalised = providerFailureResponse(final.reason)
				log.warn('tutor.provider_failure', {
					reason: final.reason,
					status: 'status' in final ? final.status : undefined
				})
				writeLine(controller, {
					type: 'error',
					reason: normalised.ok ? 'unavailable' : normalised.reason,
					message: normalised.ok ? '' : normalised.message
				})
			}
			controller.close()
		},
		cancel() {
			providerStream.abort()
		}
	})

	return { ok: true, stream, abort: () => providerStream.abort() }
}

function providerFailureResponse(reason: TutorProviderFailure | string): TutorResponse {
	switch (reason) {
		case 'no_api_key':
			return {
				ok: false,
				reason: 'unavailable',
				message: 'The AI Tutor is not configured on this environment.'
			}
		case 'rate_limited':
			return {
				ok: false,
				reason: 'rate_limited',
				message: 'The AI provider is rate-limiting us. Try again shortly.'
			}
		case 'timeout':
			return {
				ok: false,
				reason: 'timeout',
				message: 'The tutor took too long to respond. Try again.'
			}
		case 'server_error':
			return {
				ok: false,
				reason: 'unavailable',
				message: 'The AI provider is having trouble. Try again.'
			}
		case 'invalid_response':
			return {
				ok: false,
				reason: 'empty',
				message: 'The tutor returned an empty response. Try rewording your question.'
			}
		case 'network_error':
		default:
			return {
				ok: false,
				reason: 'network',
				message: 'A network error reached the AI provider. Try again.'
			}
	}
}
