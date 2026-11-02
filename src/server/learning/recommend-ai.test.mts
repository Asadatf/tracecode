import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	buildAiContext,
	buildDiagnosisPrompt,
	enrichWithAi,
	type AskModel,
	type EnrichFailure
} from './recommend-ai.ts'
import { rankRecommendations, type Recommendation } from '../../lib/learning/recommend.ts'
import type { OpenRouterResult } from '../ai/openrouter-protocol.ts'
import type { RecommendationEvidence } from '../../lib/learning/recommendation-evidence.ts'
import { HASHMAP, NESTED, att, buildFor, type Spec } from '../../lib/learning/evidence-fixtures.mts'

// M7.4 — the evidence-grounded enrichment core, exercised with a fake model so
// every path (valid, transport failure, bad JSON, schema rejection, fabricated
// slug/metric/value, disallowed claim) is covered without a network call.

function baseline(specs: Spec[]): {
	evidence: RecommendationEvidence
	recommendation: Recommendation
} {
	const { evidence } = buildFor(specs)
	return { evidence, recommendation: rankRecommendations(evidence) }
}

// Two Sum failing three times in a row: open_repeated_failures, 3 failed attempts.
const OPEN_FAILURES: Spec[] = [
	att('a1', 0, 'fail', NESTED),
	att('a2', 4, 'fail', NESTED),
	att('a3', 8, 'fail', NESTED)
]

const okModel =
	(content: string): AskModel =>
	async () => ({ ok: true, content, model: 'test-model' })
const failingModel =
	(reason: Extract<OpenRouterResult, { ok: false }>['reason'], status?: number): AskModel =>
	async () => ({ ok: false, reason, status })

function collector() {
	const reasons: EnrichFailure[] = []
	return { report: (r: EnrichFailure) => reasons.push(r), reasons }
}

const VALID_DIAGNOSIS = JSON.stringify({
	summary: 'Your recent two-sum submissions did not pass every test yet — keep going.',
	nextStep: 'Open two-sum again and work through the failing cases one at a time.',
	claims: [
		{
			problemSlug: 'two-sum',
			metric: 'observed.failurePattern.pattern',
			value: 'repeat_failures_unresolved'
		},
		{ problemSlug: 'two-sum', metric: 'observed.failedAttempts', value: 3 }
	],
	concepts: ['arrays', 'loops']
})

// --- 1. Valid structured diagnosis -----------------------------------------------

test('a valid, grounded diagnosis is attached with source=ai', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(VALID_DIAGNOSIS), report }
	)
	assert.equal(out.diagnosis.source, 'ai')
	assert.equal(out.diagnosis.stale, false)
	assert.match(out.diagnosis.summary, /two-sum/)
	assert.deepEqual(out.diagnosis.claims, [
		{ problemSlug: 'two-sum', metric: 'observed.failurePattern.pattern' },
		{ problemSlug: 'two-sum', metric: 'observed.failedAttempts' }
	])
	assert.deepEqual(reasons, [])
})

test('prose wrapped around the JSON object is tolerated', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const content = `Sure, here you go:\n${VALID_DIAGNOSIS}\nHope that helps!`
	const out = await enrichWithAi({ evidence, recommendation }, { askModel: okModel(content) })
	assert.equal(out.diagnosis.source, 'ai')
})

// --- 13 & 17. No ranking change; evidence-hash binding ---------------------------

test('a valid diagnosis changes only the diagnosis — ranking, focus, hash, version untouched', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(VALID_DIAGNOSIS) }
	)
	assert.deepEqual(out.rankedProblems, recommendation.rankedProblems)
	assert.deepEqual(out.focusConcepts, recommendation.focusConcepts)
	assert.equal(out.evidenceHash, recommendation.evidenceHash)
	assert.equal(out.v, recommendation.v)
	assert.equal(out.generatedAt, recommendation.generatedAt)
	// The context the model saw is bound to the same evidence hash.
	assert.equal(buildAiContext(evidence, recommendation).evidenceHash, recommendation.evidenceHash)
})

// --- 2. Missing API key ----------------------------------------------------------

test('a missing API key disables AI silently and keeps the deterministic result', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: failingModel('no_api_key'), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, [], 'a disabled key is not an error to report')
})

// --- 3,4,5 + network/invalid_response. Transport failures -> fallback + report ---

test('transport failures fall back to the deterministic result and are reported', async () => {
	const cases: Extract<OpenRouterResult, { ok: false }>['reason'][] = [
		'rate_limited',
		'server_error',
		'timeout',
		'network_error',
		'invalid_response'
	]
	for (const reason of cases) {
		const { evidence, recommendation } = baseline(OPEN_FAILURES)
		const { report, reasons } = collector()
		const out = await enrichWithAi(
			{ evidence, recommendation },
			{ askModel: failingModel(reason), report }
		)
		assert.deepEqual(out, recommendation, reason)
		assert.deepEqual(reasons, [reason])
	}
})

// --- 6. Invalid JSON -------------------------------------------------------------

test('a non-JSON completion falls back and reports invalid_json', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel('I could not do that.'), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, ['invalid_json'])
})

// --- 7 & 11. Schema rejection (incl. overlong strings) ---------------------------

test('a response failing the Zod schema is rejected', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	// Missing nextStep.
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(JSON.stringify({ summary: 'hi', claims: [] })), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, ['schema_rejected'])
})

test('an overlong summary or nextStep is rejected by the schema', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	for (const field of ['summary', 'nextStep'] as const) {
		const payload = {
			summary: 'ok',
			nextStep: 'ok',
			claims: [],
			[field]: 'x'.repeat(400)
		}
		const { report, reasons } = collector()
		const out = await enrichWithAi(
			{ evidence, recommendation },
			{ askModel: okModel(JSON.stringify(payload)), report }
		)
		assert.deepEqual(out, recommendation, field)
		assert.deepEqual(reasons, ['schema_rejected'], field)
	}
})

// --- 8. Fabricated problem slug --------------------------------------------------

test('a claim about a problem not in the catalog is rejected', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const content = JSON.stringify({
		summary: 'Try the next one.',
		nextStep: 'Open three-sum.',
		claims: [{ problemSlug: 'three-sum', metric: 'progress' }]
	})
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(content), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, ['unknown_slug'])
})

// --- 9. Fabricated metric --------------------------------------------------------

test('a claim citing a metric that does not resolve is rejected', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const content = JSON.stringify({
		summary: 'Observed something.',
		nextStep: 'Keep going on two-sum.',
		claims: [{ problemSlug: 'two-sum', metric: 'observed.cleverness' }]
	})
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(content), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, ['unresolved_metric'])
})

// --- 10. Incorrect claimed metric value ------------------------------------------

test('a real metric with a value that disagrees with the evidence is rejected', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const content = JSON.stringify({
		summary: 'You failed many times.',
		nextStep: 'Keep going on two-sum.',
		// Real metric, wrong number: actual failedAttempts is 3.
		claims: [{ problemSlug: 'two-sum', metric: 'observed.failedAttempts', value: 99 }]
	})
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(content), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, ['wrong_metric_value'])
})

// --- disallowed claim and unknown concept ----------------------------------------

test('a disallowed mastery/complexity claim in the prose is rejected', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const content = JSON.stringify({
		summary: 'Your solution is O(n^2) and you have not mastered arrays.',
		nextStep: 'Keep going on two-sum.',
		claims: []
	})
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(content), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, ['disallowed_claim'])
})

test('a concept id not in the catalog is rejected', async () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const { report, reasons } = collector()
	const content = JSON.stringify({
		summary: 'Keep practising two-sum.',
		nextStep: 'Open two-sum again.',
		claims: [],
		concepts: ['dynamic-programming']
	})
	const out = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: okModel(content), report }
	)
	assert.deepEqual(out, recommendation)
	assert.deepEqual(reasons, ['unknown_concept'])
})

// --- 14. Deterministic fallback is byte-for-byte the input -----------------------

test('every failure path returns exactly the deterministic recommendation', async () => {
	const { evidence, recommendation } = baseline([
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'pass', HASHMAP)
	])
	const askers: AskModel[] = [
		failingModel('no_api_key'),
		failingModel('rate_limited', 429),
		failingModel('server_error', 503),
		failingModel('timeout'),
		okModel('not json'),
		okModel(JSON.stringify({ summary: 'x' })), // schema fail
		okModel(
			JSON.stringify({
				summary: 'x',
				nextStep: 'y',
				claims: [{ problemSlug: 'nope', metric: 'progress' }]
			})
		)
	]
	for (const askModel of askers) {
		const out = await enrichWithAi({ evidence, recommendation }, { askModel })
		assert.deepEqual(out, recommendation)
	}
})

// --- 12. No raw source or PII in the prompt --------------------------------------

test('the prompt carries only bounded, PII-free evidence', () => {
	const { evidence, recommendation } = baseline(OPEN_FAILURES)
	const prompt = buildDiagnosisPrompt(buildAiContext(evidence, recommendation))
	const text = `${prompt.system}\n${prompt.user}`
	// No Python source, no identifiers, no timestamps, no e-mail shapes.
	assert.doesNotMatch(text, /def\s|return\s|import\s/)
	assert.doesNotMatch(text, /@/)
	assert.doesNotMatch(text, /\b20\d\dT\d\d:/) // ISO timestamp
	assert.doesNotMatch(text, /"(createdAt|attemptId|source|email|userId)"/)
	for (const id of ['a1', 'a2', 'a3']) assert.ok(!text.includes(`"${id}"`), id)
	// ...but it IS grounded: it names the real problem and the reason code.
	assert.ok(text.includes('two-sum'))
	assert.ok(text.includes('open_repeated_failures'))
})

// --- 18. Empty learner history ---------------------------------------------------

test('an empty-history learner still enriches, grounded in the zero totals', async () => {
	const { evidence, recommendation } = baseline([])
	const content = JSON.stringify({
		summary: 'You have not started yet — a first attempt is the way in.',
		nextStep: 'Start with contains-duplicate.',
		claims: [{ problemSlug: null, metric: 'totals.attempts', value: 0 }]
	})
	const out = await enrichWithAi({ evidence, recommendation }, { askModel: okModel(content) })
	assert.equal(out.diagnosis.source, 'ai')
	assert.deepEqual(out.diagnosis.claims, [{ problemSlug: null, metric: 'totals.attempts' }])
	// And with AI disabled it is the deterministic cold-start result, unchanged.
	const off = await enrichWithAi(
		{ evidence, recommendation },
		{ askModel: failingModel('no_api_key') }
	)
	assert.deepEqual(off, recommendation)
})
