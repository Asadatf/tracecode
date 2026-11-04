import type { TutorRequest } from './types'

// One question and its streamed answer, as a pure function. The React hook
// (src/components/trace/tutor/use-tutor.ts) owns state and storage; this owns
// the protocol and the decision about what the outcome WAS, so the rules that
// protect the conversation are unit-testable without a browser:
//
//   - a reply is `done` only if the server sent its `done` event
//   - a stream that just ends, or ends in `aborted`, is a cut-off reply
//   - a learner's Stop is `cancelled`, never a failure and never an answer
//   - a response for a conversation the learner has left is `stale` and must
//     touch nothing
//
// Only a `done` outcome may be saved and counted as a question.

export type StreamEvent =
	| { type: 'start' }
	| { type: 'delta'; text: string }
	| { type: 'done' }
	| { type: 'aborted' }
	| { type: 'error'; reason: string; message: string }

export type ExchangeOutcome =
	| { kind: 'done'; text: string }
	| { kind: 'cancelled' }
	| { kind: 'stale' }
	| { kind: 'failed'; message: string; retryable: boolean }

export const MESSAGES = {
	unreachable: 'Could not reach Tracy. Check your connection and try again.',
	unexpected: 'Tracy returned an unexpected response. Try again.',
	noBody: 'Tracy sent no reply. Try again.',
	cutOff: 'The reply was cut off before it finished. Try again.',
	empty: 'Tracy returned an empty reply. Try rewording your question.'
} as const

interface ReadResult {
	aggregated: string
	terminal: StreamEvent | null
	readError: boolean
}

// Reads NDJSON lines as they arrive. `onDelta` fires per delta, in order, as
// soon as its line is complete, which is what makes the reply appear
// progressively. A malformed line is skipped, never fatal.
export async function readNdjsonStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	callbacks: { onStart: () => void; onDelta: (text: string) => void }
): Promise<ReadResult> {
	const decoder = new TextDecoder()
	let carry = ''
	let aggregated = ''
	let terminal: StreamEvent | null = null
	let readError = false

	const handleLine = (raw: string) => {
		const line = raw.trim()
		if (line === '') return
		let ev: StreamEvent
		try {
			ev = JSON.parse(line) as StreamEvent
		} catch {
			return
		}
		if (ev.type === 'start') {
			callbacks.onStart()
		} else if (ev.type === 'delta' && typeof ev.text === 'string') {
			aggregated += ev.text
			callbacks.onDelta(ev.text)
		} else if (ev.type === 'done' || ev.type === 'aborted' || ev.type === 'error') {
			terminal = ev
		}
	}

	try {
		while (true) {
			const { value, done } = await reader.read()
			if (done) break
			carry += decoder.decode(value, { stream: true })
			let nl: number
			while ((nl = carry.indexOf('\n')) >= 0) {
				handleLine(carry.slice(0, nl))
				carry = carry.slice(nl + 1)
			}
		}
		carry += decoder.decode()
		// A final line with no trailing newline is still a line.
		handleLine(carry)
	} catch {
		readError = true
	}
	return { aggregated, terminal, readError }
}

export async function runExchange(args: {
	payload: TutorRequest
	signal: AbortSignal
	// True once the learner has left this conversation (problem switch, new chat).
	isStale: () => boolean
	onStart: () => void
	onDelta: (text: string) => void
	fetchImpl?: typeof fetch
}): Promise<ExchangeOutcome> {
	const { payload, signal, isStale, onStart, onDelta } = args
	const doFetch = args.fetchImpl ?? fetch

	let res: Response
	try {
		res = await doFetch('/api/tutor', {
			method: 'POST',
			signal,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		})
	} catch {
		if (isStale()) return { kind: 'stale' }
		if (signal.aborted) return { kind: 'cancelled' }
		return { kind: 'failed', message: MESSAGES.unreachable, retryable: true }
	}
	if (isStale()) return { kind: 'stale' }

	// A plain JSON body is a precondition failure (sign-in, validation, rate limit).
	const contentType = res.headers.get('content-type') ?? ''
	if (!contentType.includes('x-ndjson')) {
		const body = (await res.json().catch(() => null)) as {
			reason?: string
			message?: string
		} | null
		if (isStale()) return { kind: 'stale' }
		return {
			kind: 'failed',
			message: body?.message ?? MESSAGES.unexpected,
			retryable: body?.reason !== 'invalid'
		}
	}

	const reader = res.body?.getReader()
	if (reader == null) return { kind: 'failed', message: MESSAGES.noBody, retryable: true }

	const { aggregated, terminal, readError } = await readNdjsonStream(reader, {
		onStart: () => {
			if (!isStale() && !signal.aborted) onStart()
		},
		onDelta: (text) => {
			if (!isStale() && !signal.aborted) onDelta(text)
		}
	})

	if (isStale()) return { kind: 'stale' }
	if (signal.aborted) return { kind: 'cancelled' }
	if (readError) return { kind: 'failed', message: MESSAGES.cutOff, retryable: true }
	if (terminal == null || terminal.type === 'aborted') {
		// The body ended without the server saying the reply was finished.
		return { kind: 'failed', message: MESSAGES.cutOff, retryable: true }
	}
	if (terminal.type === 'error') {
		return { kind: 'failed', message: terminal.message, retryable: terminal.reason !== 'invalid' }
	}
	if (aggregated.trim().length === 0) {
		return { kind: 'failed', message: MESSAGES.empty, retryable: true }
	}
	return { kind: 'done', text: aggregated }
}
