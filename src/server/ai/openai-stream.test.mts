import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
	buildStreamBody,
	createStreamAccumulator,
	failureForStatus,
	parseSseBlock,
	splitSseChunk,
	type SseEvent
} from './openai-protocol'

// Streaming contract (M8 streaming pass). The PURE parser is where
// malformed chunks, split-across-boundaries chunks, and the usage-only
// terminal chunk get handled — so tests here are DOM-free and deterministic.

describe('OpenAI SSE parser', () => {
	it('extracts a text delta from a well-formed chunk', () => {
		const ev = parseSseBlock('{"choices":[{"delta":{"content":"hello"}}]}')
		assert.equal(ev.kind, 'delta')
		if (ev.kind === 'delta') assert.equal(ev.text, 'hello')
	})

	it('reads the finish_reason', () => {
		const ev = parseSseBlock('{"choices":[{"delta":{},"finish_reason":"stop"}]}')
		assert.equal(ev.kind, 'finish')
	})

	it('extracts real token usage from a final usage-only chunk', () => {
		const ev = parseSseBlock(
			'{"model":"gpt-4o-mini-2024-07-18","choices":[],"usage":{"prompt_tokens":123,"completion_tokens":45}}'
		)
		assert.equal(ev.kind, 'usage')
		if (ev.kind === 'usage') {
			assert.equal(ev.inputTokens, 123)
			assert.equal(ev.outputTokens, 45)
			assert.equal(ev.model, 'gpt-4o-mini-2024-07-18')
		}
	})

	it('malformed JSON is ignored, not thrown', () => {
		const ev = parseSseBlock('{not valid json')
		assert.equal(ev.kind, 'ignore')
	})

	it('an unexpected shape degrades to ignore instead of throwing', () => {
		const ev = parseSseBlock('{"foo":"bar"}')
		assert.equal(ev.kind, 'ignore')
	})
})

describe('OpenAI SSE chunker', () => {
	it('splits several data lines in one buffer', () => {
		const buf =
			'data: {"choices":[{"delta":{"content":"he"}}]}\n' +
			'data: {"choices":[{"delta":{"content":"llo"}}]}\n' +
			'data: [DONE]\n'
		const { events, remainder } = splitSseChunk(buf)
		assert.equal(remainder, '')
		const deltas = events.filter((e) => e.kind === 'delta') as Extract<
			SseEvent,
			{ kind: 'delta' }
		>[]
		assert.equal(deltas.length, 2)
		assert.equal(deltas[0]!.text, 'he')
		assert.equal(deltas[1]!.text, 'llo')
		assert.ok(events.some((e) => e.kind === 'finish'))
	})

	it('carries a partial final line into the remainder for the next read', () => {
		const buf = 'data: {"choices":[{"delta":{"content":"ok"}}]}\ndata: {"cho'
		const { events, remainder } = splitSseChunk(buf)
		assert.equal(events.length, 1)
		assert.equal(remainder, 'data: {"cho')
	})

	it('a code-block arriving token-by-token reassembles correctly', () => {
		// A real OpenAI stream splits ```python\ndef f():\n   pass\n``` into
		// many small content tokens. Confirm we can walk them and rebuild
		// the exact source (the Markdown renderer tolerates partial fences
		// — see markdown.test.mts — but the aggregator must be lossless).
		const tokens = ['```py', 'thon\n', 'def f', '():\n', '    ', 'pass\n', '```']
		const bodies = tokens.map(
			(t) => `data: {"choices":[{"delta":{"content":${JSON.stringify(t)}}}]}\n`
		)
		let carry = ''
		let aggregated = ''
		// Feed one byte at a time to stress the carry logic.
		const full = bodies.join('')
		for (const ch of full) {
			carry += ch
			const { events, remainder } = splitSseChunk(carry)
			carry = remainder
			for (const ev of events) if (ev.kind === 'delta') aggregated += ev.text
		}
		assert.equal(aggregated, '```python\ndef f():\n    pass\n```')
	})

	it('empty lines and keepalive comments are ignored', () => {
		const buf = '\n: keepalive\n\ndata: {"choices":[{"delta":{"content":"x"}}]}\n'
		const { events } = splitSseChunk(buf)
		assert.equal(events.filter((e) => e.kind === 'delta').length, 1)
	})
})

describe('buildStreamBody', () => {
	it('sets stream: true and include_usage so the final chunk carries tokens', () => {
		const body = buildStreamBody('gpt-4o-mini', {
			system: 'sys',
			messages: [{ role: 'user', content: 'hi' }]
		}) as Record<string, unknown>
		assert.equal(body.stream, true)
		assert.deepEqual(body.stream_options, { include_usage: true })
		assert.equal(body.model, 'gpt-4o-mini')
	})
})

// The stream is finished only when the provider says so. A body that merely
// stops is a cut-off reply and must never be saved as an answer.
describe('stream completion verdict', () => {
	const feed = (body: string) => {
		const acc = createStreamAccumulator()
		for (const ev of splitSseChunk(body).events) acc.apply(ev)
		return acc
	}
	const delta = (t: string) => `data: {"choices":[{"delta":{"content":"${t}"}}]}\n`

	it('finish_reason "stop" completes the reply', () => {
		const acc = feed(delta('Hi') + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n')
		assert.deepEqual(acc.verdict(), { kind: 'complete', finishReason: 'stop' })
		assert.equal(acc.text, 'Hi')
	})

	it('[DONE] alone also completes it', () => {
		assert.equal(feed(delta('Hi') + 'data: [DONE]\n').verdict().kind, 'complete')
	})

	it('"length" is a provider-declared end (the output cap), so it is complete', () => {
		const acc = feed(delta('Hi') + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n')
		assert.deepEqual(acc.verdict(), { kind: 'complete', finishReason: 'length' })
	})

	it('text that just stops, with no finish and no [DONE], is incomplete', () => {
		assert.equal(feed(delta('Half an ans')).verdict().kind, 'incomplete')
	})

	it('a cut-off before any text is incomplete, not empty', () => {
		assert.equal(feed('').verdict().kind, 'incomplete')
	})

	it('finished with no text is empty', () => {
		assert.equal(feed('data: [DONE]\n').verdict().kind, 'empty')
	})

	it('a content filter stop is blocked, not a finished reply', () => {
		const acc = feed(
			delta('Hi') + 'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n'
		)
		assert.equal(acc.verdict().kind, 'blocked')
	})

	it('real usage is kept when the provider sends it, and absent when it does not', () => {
		const withUsage = feed(
			delta('Hi') +
				'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n' +
				'data: {"model":"gpt-4o-mini-2024-07-18","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4}}\n'
		)
		assert.deepEqual(withUsage.usage, { inputTokens: 10, outputTokens: 4 })
		assert.equal(withUsage.model, 'gpt-4o-mini-2024-07-18')
		const without = feed(delta('Hi') + 'data: [DONE]\n')
		assert.equal(without.usage, undefined, 'no usage is invented')
	})
})

describe('provider status normalization', () => {
	it('maps statuses to safe reasons without any body text', () => {
		assert.deepEqual(failureForStatus(401), { reason: 'no_api_key', status: 401 })
		assert.deepEqual(failureForStatus(429), { reason: 'rate_limited', status: 429 })
		assert.deepEqual(failureForStatus(503), { reason: 'server_error', status: 503 })
		assert.deepEqual(failureForStatus(400), { reason: 'invalid_response', status: 400 })
	})
})
