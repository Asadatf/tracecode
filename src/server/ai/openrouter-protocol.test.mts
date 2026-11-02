import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	DEFAULT_OPENROUTER_MODEL,
	OPENROUTER_MAX_OUTPUT_TOKENS,
	buildChatBody,
	extractContent,
	failureForStatus,
	isRetryable,
	resolveModel
} from './openrouter-protocol.ts'
import { OPENROUTER_SLUGS, openRouterSlug } from '../lib/ai-usage/models.ts'
import { costMicroUsd, type OpenRouterRates } from '../lib/ai-usage/pricing.ts'

// M7.4 — the pure OpenRouter protocol layer. No network, no SDK, no env.

test('the verified default model is mapped, so a call can be priced', () => {
	assert.ok(DEFAULT_OPENROUTER_MODEL in OPENROUTER_SLUGS)
	assert.equal(openRouterSlug(DEFAULT_OPENROUTER_MODEL), DEFAULT_OPENROUTER_MODEL)
})

// --- 15. Free-model usage tracking -----------------------------------------------

test('a free model prices at a real recorded $0, not the NULL of an unmapped model', () => {
	const freeRates: OpenRouterRates = { prompt: '0', completion: '0' }
	assert.equal(
		costMicroUsd(
			{ inputTokens: 1200, outputTokens: 400, cacheWriteTokens: 0, cacheReadTokens: 0 },
			freeRates
		),
		0
	)
	// The distinction the whole design rests on: no rate card at all is NULL.
	assert.equal(
		costMicroUsd(
			{ inputTokens: 1200, outputTokens: 400, cacheWriteTokens: 0, cacheReadTokens: 0 },
			undefined
		),
		null
	)
})

// --- 16. Model selection through configuration -----------------------------------

test('resolveModel takes a mapped override and ignores an unmapped or empty one', () => {
	assert.equal(resolveModel(undefined), DEFAULT_OPENROUTER_MODEL)
	assert.equal(resolveModel(''), DEFAULT_OPENROUTER_MODEL)
	assert.equal(resolveModel('totally/made-up:free'), DEFAULT_OPENROUTER_MODEL)
	assert.equal(resolveModel('claude-opus-5'), 'claude-opus-5')
})

// --- request building ------------------------------------------------------------

test('buildChatBody carries the model, bounded tokens, and the two messages', () => {
	const body = buildChatBody('m', { system: 'sys', user: 'hi' })
	assert.equal(body.model, 'm')
	assert.equal(body.max_tokens, OPENROUTER_MAX_OUTPUT_TOKENS)
	assert.equal(body.temperature, 0)
	assert.deepEqual(body.messages, [
		{ role: 'system', content: 'sys' },
		{ role: 'user', content: 'hi' }
	])
	assert.ok(!('response_format' in body))
})

test('buildChatBody requests strict structured output when a schema is supplied', () => {
	const body = buildChatBody('m', {
		system: 's',
		user: 'u',
		jsonSchema: { name: 'diag', schema: { type: 'object' } }
	})
	assert.deepEqual(body.response_format, {
		type: 'json_schema',
		json_schema: { name: 'diag', strict: true, schema: { type: 'object' } }
	})
})

// --- response parsing ------------------------------------------------------------

test('extractContent reads the assistant message and served model', () => {
	const got = extractContent({
		model: 'nvidia/nemotron-3.5-super-vl:free',
		choices: [{ message: { content: '{"summary":"ok"}' } }]
	})
	assert.deepEqual(got, { content: '{"summary":"ok"}', model: 'nvidia/nemotron-3.5-super-vl:free' })
})

test('extractContent returns null for a wrong shape or an empty message', () => {
	assert.equal(extractContent({ nonsense: true }), null)
	assert.equal(extractContent(null), null)
	assert.equal(extractContent({ choices: [{ message: { content: '   ' } }] }), null)
	assert.equal(extractContent({ choices: [] }), null)
})

// --- failure classification ------------------------------------------------------

test('status maps to a failure reason; 2xx is not a failure', () => {
	assert.equal(failureForStatus(200), null)
	assert.equal(failureForStatus(204), null)
	assert.equal(failureForStatus(429), 'rate_limited')
	assert.equal(failureForStatus(500), 'server_error')
	assert.equal(failureForStatus(503), 'server_error')
	assert.equal(failureForStatus(400), 'server_error')
})

test('only transient failures are retryable', () => {
	assert.equal(isRetryable('rate_limited'), true)
	assert.equal(isRetryable('server_error'), true)
	assert.equal(isRetryable('timeout'), true)
	assert.equal(isRetryable('network_error'), true)
	assert.equal(isRetryable('no_api_key'), false)
	assert.equal(isRetryable('invalid_response'), false)
})
