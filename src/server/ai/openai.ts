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
	createStreamAccumulator,
	failureForStatus,
	mapError,
	parseResponse,
	splitSseChunk,
	usageResponseForStream
} from './openai-protocol'
import { disabledStream } from './disabled-stream'

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
		return disabledStream('no_api_key')
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
	// One tracked row per stream, written when `completion` settles.
	// - A provider-reported usage chunk gives a real, priced row.
	// - A failure, a cut-off stream or a cancelled request is recorded as an
	//   `error` row with no tokens: the provider sent no usage, and a zero-token
	//   `ok` row would claim the call was free and finished. Nothing is invented.
	void trackAiCall({ provider: 'openai', feature: config.feature, model: config.model }, () =>
		completion.then((final) => {
			const response = usageResponseForStream(final.ok ? final : { ok: false })
			if (response == null) throw new OpenAiHttpError(final.ok ? 499 : (final.status ?? 500))
			return response
		})
	).catch(() => {
		// trackAiCall swallows its own errors; a throw above only means
		// "record this call as an error row".
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
		const acc = createStreamAccumulator()
		let cancelled = false
		let errorFinal: ({ ok: false } & TutorStreamFailure) | null = null

		const feed = (chunk: string) => {
			const { events, remainder } = splitSseChunk(chunk)
			for (const ev of events) {
				const delta = acc.apply(ev)
				if (delta != null) enqueueDelta(delta)
			}
			return remainder
		}

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
				errorFinal = { ok: false, ...failureForStatus(res.status) }
			} else if (res.body == null) {
				errorFinal = { ok: false, reason: 'invalid_response' }
			} else {
				const reader = res.body.getReader()
				const decoder = new TextDecoder()
				let carry = ''
				while (true) {
					const { value, done } = await reader.read()
					if (done) break
					carry = feed(carry + decoder.decode(value, { stream: true }))
				}
				carry += decoder.decode()
				if (carry.length > 0) feed(carry + '\n')
			}
		} catch {
			if (controller.signal.aborted) {
				const why = (controller.signal.reason as Error | undefined)?.message
				if (why === 'timeout') errorFinal = { ok: false, reason: 'timeout' }
				else cancelled = true
			} else {
				errorFinal = { ok: false, reason: 'network_error' }
			}
		} finally {
			clearTimeout(timer)
			finishDeltas()
		}

		if (errorFinal != null) {
			settleCompletion(errorFinal)
			return
		}
		if (cancelled) {
			settleCompletion({
				ok: true,
				text: acc.text,
				model: acc.model ?? config.model,
				provider: 'openai',
				usage: acc.usage,
				finish: 'abort'
			})
			return
		}
		// Reached the end of the body without an error: only a provider-declared
		// finish counts as a finished reply.
		const verdict = acc.verdict()
		if (verdict.kind === 'incomplete') {
			settleCompletion({ ok: false, reason: 'incomplete_response' })
		} else if (verdict.kind === 'blocked') {
			settleCompletion({ ok: false, reason: 'blocked' })
		} else if (verdict.kind === 'empty') {
			settleCompletion({ ok: false, reason: 'invalid_response' })
		} else {
			settleCompletion({
				ok: true,
				text: acc.text,
				model: acc.model ?? config.model,
				provider: 'openai',
				usage: acc.usage,
				finish: 'complete'
			})
		}
	})()

	return {
		deltas,
		completion,
		abort: () => {
			if (!controller.signal.aborted) controller.abort()
		}
	}
}
