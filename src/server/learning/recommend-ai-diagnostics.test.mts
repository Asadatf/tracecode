import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	describeEnrichFailure,
	enrichWithAi,
	type AskModel,
	type EnrichDiagnostics
} from './recommend-ai.ts'
import { rankRecommendations, type Recommendation } from '../../lib/learning/recommend.ts'
import { resultFromResponse, type OpenRouterResult } from '../ai/openrouter-protocol.ts'
import type { RecommendationEvidence } from '../../lib/learning/recommendation-evidence.ts'
import { NESTED, att, buildFor, type Spec } from '../../lib/learning/evidence-fixtures.mts'
import { createLogger, type LogFields } from '../lib/logger/logger.ts'

// M7.4 diagnostics — every dropped enrichment explains itself with bounded facts
// (stage, reason, HTTP class, finish reason, content/reasoning presence, usage
// reported) and nothing else. The raw responses below are built the way OpenRouter
// shapes them and pushed through the real `resultFromResponse`, so the
// reasoning-only / empty / length-stopped cases exercise the production mapping.
// No network, no database.

const OPEN_FAILURES: Spec[] = [
	att('a1', 0, 'fail', NESTED),
	att('a2', 4, 'fail', NESTED),
	att('a3', 8, 'fail', NESTED)
]

function baseline(): { evidence: RecommendationEvidence; recommendation: Recommendation } {
	const { evidence } = buildFor(OPEN_FAILURES)
	return { evidence, recommendation: rankRecommendations(evidence) }
}

interface RawOptions {
	content?: string | null
	reasoning?: string
	finish?: string | null
	usage?: Record<string, unknown> | null
	id?: string
}

// An OpenAI-shaped chat completion as OpenRouter returns it.
function rawResponse(options: RawOptions): unknown {
	const { content = null, reasoning, finish = 'stop', usage, id = 'gen-1a2b3c' } = options
	return {
		id,
		model: 'nvidia/nemotron-3.5-super-vl:free',
		choices: [
			{
				finish_reason: finish,
				message: { role: 'assistant', content, ...(reasoning == null ? {} : { reasoning }) }
			}
		],
		...(usage === null ? {} : { usage: usage ?? { prompt_tokens: 812, completion_tokens: 140 } })
	}
}

const modelReturning =
	(response: unknown): AskModel =>
	async () =>
		resultFromResponse(response, 'nvidia/nemotron-3.5-super-vl:free')

const modelFailing =
	(reason: Extract<OpenRouterResult, { ok: false }>['reason'], status?: number): AskModel =>
	async () => ({ ok: false, reason, status })

async function rejected(
	askModel: AskModel
): Promise<{ diagnostics: EnrichDiagnostics[]; unchanged: boolean }> {
	const { evidence, recommendation } = baseline()
	const diagnostics: EnrichDiagnostics[] = []
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel, report: (_reason, d) => diagnostics.push(d) }
	)
	return { diagnostics, unchanged: JSON.stringify(out) === JSON.stringify(recommendation) }
}

const VALID = JSON.stringify({
	summary: 'Your recent two-sum submissions did not pass every test yet — keep going.',
	nextStep: 'Open two-sum again and work through the failing cases one at a time.',
	claims: [{ problemSlug: 'two-sum', metric: 'observed.failedAttempts', value: 3 }],
	concepts: ['arrays']
})

// --- Missing content --------------------------------------------------------------

test('a reasoning-only response is reported as missing content, with reasoning flagged', async () => {
	const { diagnostics, unchanged } = await rejected(
		modelReturning(
			rawResponse({
				content: null,
				reasoning: 'Let me think about the learner snapshot step by step…',
				finish: 'length',
				usage: {
					prompt_tokens: 2000,
					completion_tokens: 600,
					completion_tokens_details: { reasoning_tokens: 600 }
				}
			})
		)
	)
	assert.equal(unchanged, true)
	assert.deepEqual(diagnostics, [
		{
			stage: 'missing_content',
			reason: 'invalid_response',
			httpClass: '2xx',
			finishReason: 'length',
			hasContent: false,
			contentChars: 0,
			hasReasoning: true,
			usageReported: true,
			requestId: 'gen-1a2b3c'
		}
	])
})

test('whitespace-only content is missing content, with no reasoning', async () => {
	const { diagnostics } = await rejected(
		modelReturning(rawResponse({ content: '   \n', finish: 'stop' }))
	)
	assert.equal(diagnostics[0]?.stage, 'missing_content')
	assert.equal(diagnostics[0]?.hasContent, false)
	assert.equal(diagnostics[0]?.hasReasoning, false)
	assert.equal(diagnostics[0]?.finishReason, 'stop')
})

test('a body with no choices at all reads as nothing present, never throws', async () => {
	const { diagnostics, unchanged } = await rejected(modelReturning({ nonsense: true }))
	assert.equal(unchanged, true)
	assert.equal(diagnostics[0]?.stage, 'missing_content')
	assert.equal(diagnostics[0]?.finishReason, 'absent')
	assert.equal(diagnostics[0]?.usageReported, false)
})

// --- Length-stopped ---------------------------------------------------------------

test('a length-stopped, cut-off JSON body reports finish=length without claiming a cause', async () => {
	const { diagnostics } = await rejected(
		modelReturning(
			rawResponse({ content: '{"summary":"Your two-sum submissions did not', finish: 'length' })
		)
	)
	assert.equal(diagnostics[0]?.stage, 'invalid_json')
	assert.equal(diagnostics[0]?.reason, 'invalid_json')
	// The signal is surfaced as a fact next to the rejection; nothing in the record
	// asserts that the length stop *caused* it.
	assert.equal(diagnostics[0]?.finishReason, 'length')
	assert.equal(diagnostics[0]?.hasContent, true)
	assert.ok(!('cause' in (diagnostics[0] ?? {})))
})

test('a length stop whose JSON is complete is still judged on its content', async () => {
	const { evidence, recommendation } = baseline()
	const diagnostics: EnrichDiagnostics[] = []
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{
			askModel: modelReturning(rawResponse({ content: VALID, finish: 'length' })),
			report: (_r, d) => diagnostics.push(d)
		}
	)
	assert.equal(out.diagnosis.source, 'ai')
	assert.deepEqual(diagnostics, [])
})

// --- JSON, schema, evidence -------------------------------------------------------

test('non-JSON prose is reported as invalid_json', async () => {
	const { diagnostics } = await rejected(
		modelReturning(rawResponse({ content: 'Sure! Here is my advice.', finish: 'stop' }))
	)
	assert.equal(diagnostics[0]?.stage, 'invalid_json')
	assert.equal(diagnostics[0]?.finishReason, 'stop')
})

test('JSON that fails the strict schema is reported as schema_rejected', async () => {
	const { diagnostics } = await rejected(
		modelReturning(
			rawResponse({
				content: JSON.stringify({ summary: 'ok', nextStep: 'go', claims: [], extra: true })
			})
		)
	)
	assert.equal(diagnostics[0]?.stage, 'schema')
	assert.equal(diagnostics[0]?.reason, 'schema_rejected')
})

const EVIDENCE_CASES: { reason: string; body: Record<string, unknown> }[] = [
	{
		reason: 'unknown_slug',
		body: {
			summary: 'Try the next one.',
			nextStep: 'Open three-sum.',
			claims: [{ problemSlug: 'three-sum', metric: 'progress' }]
		}
	},
	{
		reason: 'unresolved_metric',
		body: {
			summary: 'Observed something.',
			nextStep: 'Keep going on two-sum.',
			claims: [{ problemSlug: 'two-sum', metric: 'observed.cleverness' }]
		}
	},
	{
		reason: 'wrong_metric_value',
		body: {
			summary: 'You failed many times.',
			nextStep: 'Keep going on two-sum.',
			claims: [{ problemSlug: 'two-sum', metric: 'observed.failedAttempts', value: 99 }]
		}
	},
	{
		reason: 'unknown_concept',
		body: {
			summary: 'Keep going.',
			nextStep: 'Open two-sum.',
			claims: [],
			concepts: ['quantum-sorting']
		}
	},
	{
		reason: 'disallowed_claim',
		body: {
			summary: 'Your solution is O(n^2) and you have not mastered arrays.',
			nextStep: 'Keep going on two-sum.',
			claims: []
		}
	}
]

for (const { reason, body } of EVIDENCE_CASES) {
	test(`an evidence rejection is reported as stage=evidence, reason=${reason}`, async () => {
		const { diagnostics, unchanged } = await rejected(
			modelReturning(rawResponse({ content: JSON.stringify(body) }))
		)
		assert.equal(unchanged, true)
		assert.equal(diagnostics.length, 1)
		assert.equal(diagnostics[0]?.stage, 'evidence')
		assert.equal(diagnostics[0]?.reason, reason)
		assert.equal(diagnostics[0]?.hasContent, true)
		assert.equal(diagnostics[0]?.httpClass, '2xx')
	})
}

// --- Provider-level failure -------------------------------------------------------

test('provider failures report the HTTP class, not an error body', async () => {
	const cases: [Parameters<typeof modelFailing>, string][] = [
		[['rate_limited', 429], '4xx'],
		[['server_error', 503], '5xx'],
		[['timeout'], 'none'],
		[['network_error'], 'none']
	]
	for (const [args, httpClass] of cases) {
		const { diagnostics, unchanged } = await rejected(modelFailing(...args))
		assert.equal(unchanged, true)
		assert.equal(diagnostics[0]?.stage, 'provider')
		assert.equal(diagnostics[0]?.reason, args[0])
		assert.equal(diagnostics[0]?.httpClass, httpClass)
		assert.equal(diagnostics[0]?.finishReason, undefined)
	}
})

test('a missing API key is AI-disabled and reports nothing', async () => {
	const { diagnostics, unchanged } = await rejected(modelFailing('no_api_key'))
	assert.equal(unchanged, true)
	assert.deepEqual(diagnostics, [])
})

// --- Success ----------------------------------------------------------------------

test('a valid structured response attaches an AI diagnosis and reports nothing', async () => {
	const response = rawResponse({ content: VALID, finish: 'stop' })
	const result = resultFromResponse(response, 'nvidia/nemotron-3.5-super-vl:free')
	assert.equal(result.ok, true)
	assert.deepEqual(result.diagnostics, {
		finishReason: 'stop',
		hasContent: true,
		contentChars: VALID.length,
		hasReasoning: false,
		usageReported: true,
		requestId: 'gen-1a2b3c'
	})

	const { evidence, recommendation } = baseline()
	const diagnostics: EnrichDiagnostics[] = []
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: modelReturning(response), report: (_r, d) => diagnostics.push(d) }
	)
	assert.equal(out.diagnosis.source, 'ai')
	assert.deepEqual(diagnostics, [])
})

test('an unrecognised finish reason is bucketed as other, a missing one as absent', () => {
	assert.equal(
		resultFromResponse(rawResponse({ content: 'x', finish: 'weird' }), 'm').diagnostics
			?.finishReason,
		'other'
	)
	assert.equal(
		resultFromResponse(rawResponse({ content: 'x', finish: null }), 'm').diagnostics?.finishReason,
		'absent'
	)
})

test('reasoning is detected from a token count even when no text is returned', () => {
	const result = resultFromResponse(
		rawResponse({
			content: null,
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				completion_tokens_details: { reasoning_tokens: 4 }
			}
		}),
		'm'
	)
	assert.equal(result.diagnostics?.hasReasoning, true)
})

test('usage is "reported" only when the provider gave both counts', () => {
	const none = resultFromResponse(rawResponse({ content: 'x', usage: null }), 'm')
	const partial = resultFromResponse(
		rawResponse({ content: 'x', usage: { prompt_tokens: 5 } }),
		'm'
	)
	assert.equal(none.diagnostics?.usageReported, false)
	assert.equal(partial.diagnostics?.usageReported, false)
})

// --- Nothing sensitive in a diagnostic event --------------------------------------

const SENSITIVE = [
	'learner@example.com',
	'sk-or-v1-abcdef0123456789abcdef',
	'def isValid(s): return True',
	'Bearer abc.def.ghi',
	'SNAPSHOT-PROMPT-MARKER',
	'sessiontoken=zzz999'
]

function hostileResponse(finish: string, content: string | null): unknown {
	return {
		id: `gen with spaces ${SENSITIVE[0]}`,
		model: `model-${SENSITIVE[1]}`,
		error: { message: SENSITIVE.join(' | ') },
		choices: [
			{
				finish_reason: finish,
				message: {
					role: 'assistant',
					content,
					reasoning: SENSITIVE.join(' | '),
					reasoning_details: [{ text: SENSITIVE.join(' | ') }]
				}
			}
		],
		usage: { prompt_tokens: 1, completion_tokens: 1 }
	}
}

const ALLOWED_KEYS = new Set([
	'stage',
	'reason',
	'httpClass',
	'finishReason',
	'hasContent',
	'contentChars',
	'hasReasoning',
	'usageReported',
	'requestId'
])

test('no diagnostic event can carry response text, prompt, source, emails or keys', async () => {
	const leaky = [
		hostileResponse('length', null),
		hostileResponse('stop', `not json ${SENSITIVE.join(' ')}`),
		hostileResponse(
			'stop',
			JSON.stringify({ summary: SENSITIVE.join(' '), nextStep: 'x', claims: [], extra: 1 })
		),
		hostileResponse(
			'stop',
			JSON.stringify({
				summary: SENSITIVE.join(' '),
				nextStep: SENSITIVE.join(' '),
				claims: [{ problemSlug: SENSITIVE[2], metric: 'progress' }]
			})
		)
	]
	for (const response of leaky) {
		const { diagnostics } = await rejected(modelReturning(response))
		assert.equal(diagnostics.length, 1)
		const [d] = diagnostics
		for (const key of Object.keys(d ?? {}))
			assert.ok(ALLOWED_KEYS.has(key), `unexpected key ${key}`)
		for (const value of Object.values(d ?? {})) {
			assert.ok(['string', 'number', 'boolean'].includes(typeof value))
		}
		const serialized = JSON.stringify(d)
		for (const secret of SENSITIVE) assert.ok(!serialized.includes(secret), `leaked: ${secret}`)
		// A free-text provider id is dropped, not logged.
		assert.equal(d?.requestId, undefined)
	}
})

test('a provider failure result carrying a hostile body still yields only enums', () => {
	const result = {
		ok: false,
		reason: 'server_error',
		status: 502,
		body: SENSITIVE.join(' | ')
	} as unknown as OpenRouterResult
	const serialized = JSON.stringify(describeEnrichFailure('server_error', result))
	for (const secret of SENSITIVE) assert.ok(!serialized.includes(secret))
	assert.deepEqual(JSON.parse(serialized), {
		stage: 'provider',
		reason: 'server_error',
		httpClass: '5xx'
	})
})

test('the structured log line a diagnostic produces is clean after the real logger', async () => {
	const lines: LogFields[] = []
	const log = createLogger({ threshold: 'debug', write: (line) => lines.push(JSON.parse(line)) })
	const { diagnostics } = await rejected(modelReturning(hostileResponse('length', null)))
	log.warn('learning recommendation enrichment skipped', {
		model: 'nvidia/nemotron-3.5-super-vl:free',
		...diagnostics[0]
	})
	assert.equal(lines.length, 1)
	assert.equal(lines[0]?.level, 'warn')
	assert.equal(lines[0]?.stage, 'missing_content')
	assert.equal(lines[0]?.finishReason, 'length')
	assert.equal(lines[0]?.hasReasoning, true)
	const serialized = JSON.stringify(lines[0])
	for (const secret of SENSITIVE) assert.ok(!serialized.includes(secret))
})

// --- Behaviour unchanged ----------------------------------------------------------

test('every rejection still returns exactly the deterministic recommendation', async () => {
	const models = [
		modelReturning(rawResponse({ content: null, reasoning: 'x', finish: 'length' })),
		modelReturning(rawResponse({ content: 'not json' })),
		modelReturning(rawResponse({ content: JSON.stringify({ nope: 1 }) })),
		modelFailing('server_error', 500)
	]
	for (const askModel of models) {
		const { unchanged } = await rejected(askModel)
		assert.equal(unchanged, true)
	}
})
