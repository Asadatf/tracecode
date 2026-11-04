import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildStreamBody, parseSseBlock, splitSseChunk, type SseEvent } from './openai-protocol'

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
