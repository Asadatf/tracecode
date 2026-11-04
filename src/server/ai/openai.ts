import 'server-only'
import { env } from '@/lib/env'
import { trackAiCall } from '@/server/lib/ai-usage/sink'
import type {
	TutorPrompt,
	TutorProviderConfig,
	TutorProviderResult,
	TutorProviderStream,
	TutorStreamFailure,
	TutorStreamFinal
} from './tutor-provider'
import {
	DEFAULT_TIMEOUT_MS,
	OPENAI_CHAT_URL,
	OpenAiHttpError,
	buildBody,
	buildStreamBody,
	mapError,
	parseResponse,
	splitSseChunk,
	type SseEvent
} from './openai-protocol'

// The only file allowed to call OpenAI's HTTP endpoint and the only file
// that calls `trackAiCall` for it (docs/rules/ai-usage.md; enforced by
// no-restricted-imports). Expected failures come back as typed
// TutorProviderResult failures, never throws.

export async function askOpenAI(
	config: TutorProviderConfig,
	prompt: TutorPrompt
): Promise<TutorProviderResult> {
	const apiKey = env.OPENAI_API_KEY
	if (apiKey == null || apiKey === '') return { ok: false, reason: 'no_api_key' }

	const body = buildBody(config.model, prompt)
	const timeoutMs = prompt.timeoutMs ?? DEFAULT_TIMEOUT_MS
	try {
		const response = await trackAiCall(
			{ provider: 'openai', feature: config.feature, model: config.model },
			async () => {
				const res = await fetch(OPENAI_CHAT_URL, {
					method: 'POST',
					signal: AbortSignal.timeout(timeoutMs),
					headers: {
						authorization: `Bearer ${apiKey}`,
						'content-type': 'application/json',
						accept: 'application/json'
					},
					body: JSON.stringify(body)
				})
				if (!res.ok) throw new OpenAiHttpError(res.status)
				return (await res.json()) as unknown
			}
		)
		return parseResponse(response, config.model)
	} catch (error) {
		return mapError(error)
	}
}

// ─── Streaming ───────────────────────────────────────────────────────────
//
// Opens a chat/completions stream, returns an async iterable of text deltas,
// and resolves `completion` ONCE when the stream has ended (complete,
// abort, or provider failure). The usage row is written through
// `trackAiCall` wrapping the `completion` promise — one tracked row per
// stream regardless of chunk count, with real `prompt_tokens` /
// `completion_tokens` when OpenAI's final chunk reports them (which it
// does with `stream_options.include_usage`).

export function askOpenAIStream(
	config: TutorProviderConfig,
	prompt: TutorPrompt,
	externalSignal?: AbortSignal
): TutorProviderStream {
	const apiKey = env.OPENAI_API_KEY
	if (apiKey == null || apiKey === '') {
		return disabledStreamImpl('no_api_key')
	}

	const controller = new AbortController()
	// Compose the caller's abort signal with our own so either path cancels.
	if (externalSignal != null) {
		if (externalSignal.aborted) controller.abort()
		else externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
	}
	const timeoutMs = prompt.timeoutMs ?? DEFAULT_TIMEOUT_MS
	const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)

	let settleCompletion: (
		result: TutorStreamFinal | ({ ok: false } & TutorStreamFailure)
	) => void = () => {}
	const completion = new Promise<TutorStreamFinal | ({ ok: false } & TutorStreamFailure)>(
		(resolve) => {
			settleCompletion = resolve
		}
	)
	// Track the call through the sink: trackAiCall records ONE row, keyed
	// on the final aggregated response shape. `completion` is what the
	// extractor will be handed — a usage-bearing synthetic chat-completion
	// object so the existing openai extractor in usage.ts picks it up.
	void trackAiCall({ provider: 'openai', feature: config.feature, model: config.model }, () =>
		completion.then((final) => {
			if (!final.ok) throw new OpenAiHttpError(final.status ?? 500)
			return {
				id: 'stream',
				model: final.model,
				choices: [{ finish_reason: final.finish === 'abort' ? 'stop' : 'stop' }],
				usage: {
					prompt_tokens: final.usage?.inputTokens ?? 0,
					completion_tokens: final.usage?.outputTokens ?? 0
				}
			}
		})
	).catch(() => {
		// trackAiCall swallows its own errors; the throw above only
		// signals "record this as an error row".
	})

	const deltaBuffer: string[] = []
	let deltaResolve: (() => void) | null = null
	let deltaDone = false
	function enqueueDelta(text: string) {
		deltaBuffer.push(text)
		if (deltaResolve != null) {
			const r = deltaResolve
			deltaResolve = null
			r()
		}
	}
	function finishDeltas() {
		deltaDone = true
		if (deltaResolve != null) {
			const r = deltaResolve
			deltaResolve = null
			r()
		}
	}

	const deltas: AsyncIterable<string> = {
		async *[Symbol.asyncIterator]() {
			while (true) {
				while (deltaBuffer.length > 0) yield deltaBuffer.shift()!
				if (deltaDone) return
				await new Promise<void>((resolve) => {
					deltaResolve = resolve
				})
			}
		}
	}

	// Drive the fetch asynchronously; the caller gets the stream handle now.
	void (async () => {
		let aggregatedText = ''
		let servedModel = config.model as string
		let usage: TutorStreamFinal['usage'] = undefined
		let finish: 'complete' | 'abort' = 'complete'
		let errorFinal: ({ ok: false } & TutorStreamFailure) | null = null

		try {
			const res = await fetch(OPENAI_CHAT_URL, {
				method: 'POST',
				signal: controller.signal,
				headers: {
					authorization: `Bearer ${apiKey}`,
					'content-type': 'application/json',
					accept: 'text/event-stream'
				},
				body: JSON.stringify(buildStreamBody(config.model, prompt))
			})
			if (!res.ok) {
				errorFinal = { ok: false, ...mapStatusToFailure(res.status) }
			} else if (res.body == null) {
				errorFinal = { ok: false, reason: 'invalid_response' }
			} else {
				const reader = res.body.getReader()
				const decoder = new TextDecoder()
				let carry = ''
				while (true) {
					const { value, done } = await reader.read()
					if (done) break
					carry += decoder.decode(value, { stream: true })
					const { events, remainder } = splitSseChunk(carry)
					carry = remainder
					for (const ev of events) applyEvent(ev)
				}
				carry += decoder.decode()
				if (carry.length > 0) {
					const { events } = splitSseChunk(carry + '\n')
					for (const ev of events) applyEvent(ev)
				}
			}
		} catch {
			if (controller.signal.aborted) {
				const r = (controller.signal.reason as Error | undefined)?.message
				if (r === 'timeout') errorFinal = { ok: false, reason: 'timeout' }
				else finish = 'abort'
			} else {
				errorFinal = { ok: false, reason: 'network_error' }
			}
		} finally {
			clearTimeout(timer)
			finishDeltas()
		}

		function applyEvent(ev: SseEvent) {
			if (ev.kind === 'delta') {
				aggregatedText += ev.text
				enqueueDelta(ev.text)
			} else if (ev.kind === 'usage') {
				usage = { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens }
				if (ev.model != null) servedModel = ev.model
			}
			// 'finish' / 'ignore' don't need action; the stream ends when
			// the reader signals `done`.
		}

		if (errorFinal != null) {
			settleCompletion(errorFinal)
			return
		}
		if (finish === 'complete' && aggregatedText.trim().length === 0) {
			settleCompletion({ ok: false, reason: 'invalid_response' })
			return
		}
		settleCompletion({
			ok: true,
			text: aggregatedText,
			model: servedModel,
			provider: 'openai',
			usage,
			finish
		})
	})()

	return {
		deltas,
		completion,
		abort: () => {
			if (!controller.signal.aborted) controller.abort()
		}
	}
}

function mapStatusToFailure(status: number): TutorStreamFailure {
	if (status === 401 || status === 403) return { reason: 'no_api_key', status }
	if (status === 429) return { reason: 'rate_limited', status }
	if (status >= 500) return { reason: 'server_error', status }
	return { reason: 'invalid_response', status }
}

function disabledStreamImpl(reason: 'no_api_key'): TutorProviderStream {
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
