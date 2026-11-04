import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildBody, mapError, OpenAiHttpError, parseResponse } from './openai-protocol'

describe('openai adapter — pure parts', () => {
	it('buildBody carries system + messages and bounds max_tokens', () => {
		const body = buildBody('gpt-4o-mini', {
			system: 'sys',
			messages: [{ role: 'user', content: 'hi' }],
			maxOutputTokens: 123
		})
		assert.equal((body as { model: string }).model, 'gpt-4o-mini')
		assert.equal((body as { max_tokens: number }).max_tokens, 123)
		const messages = (body as { messages: unknown[] }).messages as Array<{
			role: string
			content: string
		}>
		assert.equal(messages[0]!.role, 'system')
		assert.equal(messages[0]!.content, 'sys')
		assert.equal(messages[1]!.role, 'user')
	})

	it('parseResponse rejects an empty completion', () => {
		const result = parseResponse(
			{ model: 'gpt-4o-mini', choices: [{ message: { role: 'assistant', content: '' } }] },
			'gpt-4o-mini'
		)
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.reason, 'invalid_response')
	})

	it('parseResponse returns trimmed text on success', () => {
		const result = parseResponse(
			{
				model: 'gpt-4o-mini',
				choices: [{ message: { role: 'assistant', content: '  hello there  ' } }]
			},
			'gpt-4o-mini'
		)
		assert.equal(result.ok, true)
		if (result.ok) {
			assert.equal(result.text, 'hello there')
			assert.equal(result.model, 'gpt-4o-mini')
		}
	})

	it('parseResponse rejects a non-chat-completions shape', () => {
		const result = parseResponse({ not: 'a response' }, 'gpt-4o-mini')
		assert.equal(result.ok, false)
	})

	it('maps HTTP 401 to no_api_key', () => {
		const result = mapError(new OpenAiHttpError(401))
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.reason, 'no_api_key')
	})

	it('maps HTTP 429 to rate_limited', () => {
		const result = mapError(new OpenAiHttpError(429))
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.reason, 'rate_limited')
	})

	it('maps HTTP 503 to server_error', () => {
		const result = mapError(new OpenAiHttpError(503))
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.reason, 'server_error')
	})

	it('maps a TimeoutError to timeout', () => {
		const err = new Error('t')
		err.name = 'TimeoutError'
		const result = mapError(err)
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.reason, 'timeout')
	})

	it('falls back to network_error for anything else', () => {
		const result = mapError(new Error('connection reset'))
		assert.equal(result.ok, false)
		if (!result.ok) assert.equal(result.reason, 'network_error')
	})
})
