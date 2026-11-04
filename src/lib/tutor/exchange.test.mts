import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MESSAGES, readNdjsonStream, runExchange, type ExchangeOutcome } from './exchange'
import type { TutorRequest } from './types'

const PAYLOAD: TutorRequest = {
	problemSlug: 'two-sum',
	conversationId: 'c1',
	messages: [{ id: 'm1', role: 'user', text: 'why?' }],
	context: {}
}
const enc = new TextEncoder()
const line = (o: object) => JSON.stringify(o) + '\n'

// A response whose body the test feeds by hand, so we can observe what the
// client has done at each point of a stream that is still open.
function liveStream(contentType = 'application/x-ndjson') {
	let ctl!: ReadableStreamDefaultController<Uint8Array>
	const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctl = c) })
	return {
		response: new Response(body, { status: 200, headers: { 'content-type': contentType } }),
		push: (text: string) => ctl.enqueue(enc.encode(text)),
		end: () => ctl.close()
	}
}
function finished(lines: string[], contentType = 'application/x-ndjson'): Response {
	return new Response(lines.join(''), { status: 200, headers: { 'content-type': contentType } })
}

async function run(
	fetchImpl: typeof fetch,
	extra: Partial<Parameters<typeof runExchange>[0]> = {}
): Promise<{ outcome: ExchangeOutcome; deltas: string[]; started: number }> {
	const deltas: string[] = []
	let started = 0
	const outcome = await runExchange({
		payload: PAYLOAD,
		signal: new AbortController().signal,
		isStale: () => false,
		onStart: () => void (started += 1),
		onDelta: (t) => deltas.push(t),
		fetchImpl,
		...extra
	})
	return { outcome, deltas, started }
}

describe('streaming display', () => {
	it('delivers each delta as soon as its line arrives, before the stream ends', async () => {
		const s = liveStream()
		const deltas: string[] = []
		const promise = runExchange({
			payload: PAYLOAD,
			signal: new AbortController().signal,
			isStale: () => false,
			onStart: () => {},
			onDelta: (t) => deltas.push(t),
			fetchImpl: () => Promise.resolve(s.response)
		})
		s.push(line({ type: 'start' }) + line({ type: 'delta', text: 'Hel' }))
		await new Promise((r) => setTimeout(r, 10))
		assert.deepEqual(deltas, ['Hel'], 'first text is visible while the stream is still open')
		s.push(line({ type: 'delta', text: 'lo' }))
		await new Promise((r) => setTimeout(r, 10))
		assert.deepEqual(deltas, ['Hel', 'lo'])
		s.push(line({ type: 'done' }))
		s.end()
		assert.deepEqual(await promise, { kind: 'done', text: 'Hello' })
	})

	it('reassembles a line split across network chunks', async () => {
		const reader = new Response(
			new ReadableStream({
				start(c) {
					const full = line({ type: 'delta', text: 'ab' }) + line({ type: 'done' })
					for (let i = 0; i < full.length; i += 3) c.enqueue(enc.encode(full.slice(i, i + 3)))
					c.close()
				}
			})
		).body!.getReader()
		const deltas: string[] = []
		const r = await readNdjsonStream(reader, { onStart: () => {}, onDelta: (t) => deltas.push(t) })
		assert.deepEqual(deltas, ['ab'])
		assert.equal(r.terminal?.type, 'done')
	})

	it('keeps a code fence that arrives across many deltas intact', async () => {
		const parts = ['```py', 'thon\n', 'x = 1\n', '```']
		const { outcome } = await run(() =>
			Promise.resolve(
				finished([
					line({ type: 'start' }),
					...parts.map((text) => line({ type: 'delta', text })),
					line({ type: 'done' })
				])
			)
		)
		assert.deepEqual(outcome, { kind: 'done', text: '```python\nx = 1\n```' })
	})

	it('skips a malformed line instead of failing the reply', async () => {
		const { outcome } = await run(() =>
			Promise.resolve(
				finished([line({ type: 'delta', text: 'ok' }), '{not json\n', line({ type: 'done' })])
			)
		)
		assert.deepEqual(outcome, { kind: 'done', text: 'ok' })
	})

	it('reads a final line that has no trailing newline', async () => {
		const { outcome } = await run(() =>
			Promise.resolve(
				finished([line({ type: 'delta', text: 'ok' }), JSON.stringify({ type: 'done' })])
			)
		)
		assert.equal(outcome.kind, 'done')
	})
})

describe('a reply that did not finish is never a success', () => {
	it('a body that just ends is a cut-off reply, retryable', async () => {
		const { outcome } = await run(() =>
			Promise.resolve(
				finished([line({ type: 'start' }), line({ type: 'delta', text: 'Half an ans' })])
			)
		)
		assert.deepEqual(outcome, { kind: 'failed', message: MESSAGES.cutOff, retryable: true })
	})

	it('a body cut in the middle of a line is also cut off', async () => {
		const { outcome } = await run(() =>
			Promise.resolve(finished([line({ type: 'delta', text: 'x' }), '{"type":"del']))
		)
		assert.equal(outcome.kind, 'failed')
	})

	it('an `aborted` event from the server is a cut-off reply', async () => {
		const { outcome } = await run(() =>
			Promise.resolve(finished([line({ type: 'delta', text: 'x' }), line({ type: 'aborted' })]))
		)
		assert.deepEqual(outcome, { kind: 'failed', message: MESSAGES.cutOff, retryable: true })
	})

	it('a mid-stream read error is a cut-off reply', async () => {
		const body = new ReadableStream<Uint8Array>({
			start(c) {
				c.enqueue(enc.encode(line({ type: 'delta', text: 'x' })))
				c.error(new Error('connection reset'))
			}
		})
		const { outcome } = await run(() =>
			Promise.resolve(new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }))
		)
		assert.deepEqual(outcome, { kind: 'failed', message: MESSAGES.cutOff, retryable: true })
	})

	it('a server error event surfaces its message', async () => {
		const { outcome } = await run(() =>
			Promise.resolve(
				finished([line({ type: 'error', reason: 'timeout', message: 'Took too long.' })])
			)
		)
		assert.deepEqual(outcome, { kind: 'failed', message: 'Took too long.', retryable: true })
	})

	it('a finished stream with no text is an empty reply, not an answer', async () => {
		const { outcome } = await run(() =>
			Promise.resolve(finished([line({ type: 'start' }), line({ type: 'done' })]))
		)
		assert.deepEqual(outcome, { kind: 'failed', message: MESSAGES.empty, retryable: true })
	})
})

describe('network failure, rejected requests and Stop', () => {
	it('a network failure is retryable', async () => {
		const { outcome } = await run(() => Promise.reject(new TypeError('Failed to fetch')))
		assert.deepEqual(outcome, { kind: 'failed', message: MESSAGES.unreachable, retryable: true })
	})

	it('a rejected request (401, 429) shows its message; invalid input is not retryable', async () => {
		const json = (status: number, body: object) =>
			Promise.resolve(
				new Response(JSON.stringify(body), {
					status,
					headers: { 'content-type': 'application/json' }
				})
			)
		const limited = await run(() => json(429, { reason: 'rate_limited', message: 'Slow down.' }))
		assert.deepEqual(limited.outcome, { kind: 'failed', message: 'Slow down.', retryable: true })
		const invalid = await run(() => json(400, { reason: 'invalid', message: 'Bad request.' }))
		assert.deepEqual(invalid.outcome, { kind: 'failed', message: 'Bad request.', retryable: false })
		const noBody = await run(() =>
			Promise.resolve(new Response('<html>', { headers: { 'content-type': 'text/html' } }))
		)
		assert.equal(noBody.outcome.kind, 'failed')
	})

	it('Stop mid-stream is `cancelled`, and no later text is shown', async () => {
		const s = liveStream()
		const controller = new AbortController()
		const deltas: string[] = []
		const promise = runExchange({
			payload: PAYLOAD,
			signal: controller.signal,
			isStale: () => false,
			onStart: () => {},
			onDelta: (t) => deltas.push(t),
			fetchImpl: () => Promise.resolve(s.response)
		})
		s.push(line({ type: 'delta', text: 'one ' }))
		await new Promise((r) => setTimeout(r, 10))
		controller.abort()
		s.push(line({ type: 'delta', text: 'two' }))
		s.end()
		assert.deepEqual(await promise, { kind: 'cancelled' })
		assert.deepEqual(deltas, ['one '])
	})

	it('Stop before the first byte is `cancelled`, not a failure', async () => {
		const controller = new AbortController()
		const fetchImpl: typeof fetch = (_url, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () =>
					reject(new DOMException('aborted', 'AbortError'))
				)
			})
		const promise = run(fetchImpl, { signal: controller.signal })
		controller.abort()
		assert.deepEqual((await promise).outcome, { kind: 'cancelled' })
	})
})

describe('a response for a conversation the learner left', () => {
	it('is stale and shows nothing, even when it completes', async () => {
		let stale = false
		const { outcome, deltas, started } = await run(
			() => {
				stale = true // the learner switched problems while the request was in flight
				return Promise.resolve(
					finished([
						line({ type: 'start' }),
						line({ type: 'delta', text: 'x' }),
						line({ type: 'done' })
					])
				)
			},
			{ isStale: () => stale }
		)
		assert.deepEqual(outcome, { kind: 'stale' })
		assert.deepEqual(deltas, [])
		assert.equal(started, 0)
	})

	it('becoming stale mid-stream stops display immediately', async () => {
		const s = liveStream()
		let stale = false
		const deltas: string[] = []
		const promise = runExchange({
			payload: PAYLOAD,
			signal: new AbortController().signal,
			isStale: () => stale,
			onStart: () => {},
			onDelta: (t) => deltas.push(t),
			fetchImpl: () => Promise.resolve(s.response)
		})
		s.push(line({ type: 'delta', text: 'a' }))
		await new Promise((r) => setTimeout(r, 10))
		stale = true
		s.push(line({ type: 'delta', text: 'b' }) + line({ type: 'done' }))
		s.end()
		assert.deepEqual(await promise, { kind: 'stale' })
		assert.deepEqual(deltas, ['a'])
	})
})
