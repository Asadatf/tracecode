import { z } from 'zod'
import {
	MAX_NEXT_STEP,
	MAX_SUMMARY,
	lookupMetric,
	type Recommendation
} from '@/lib/learning/recommend'
import type { RecommendationEvidence } from '@/lib/learning/recommendation-evidence'
import { STRUCTURAL_FEATURES } from '@/lib/learning/solution-evolution'
import type { OpenRouterPrompt, OpenRouterResult } from '@/server/ai/openrouter-protocol'

// Evidence-grounded AI enrichment (M7.4). OpenRouter is OPTIONAL enrichment of a
// recommendation: it may re-word the diagnosis and suggest how to approach the
// already-chosen problem, but it can never change the ranking, invent a problem,
// or assert anything the evidence does not contain. M7.3 stays the authority.
//
// The core (`enrichWithAi`) takes the model caller as an injected dependency, so
// every path — valid response, 429, timeout, bad JSON, schema rejection,
// fabricated slug/metric/value, disallowed claim — is unit-testable with a fake
// and no network. The production wiring (`diagnoseRecommendation`) binds the
// real OpenRouter wrapper lazily so this module stays importable in tests.
//
// What is sent to the model is a bounded, versioned, PII-free projection: slugs,
// difficulties, concept tags, M6 counts, observed AST pattern statuses, historical
// transition kinds, M6 inferred signal CODES (labelled inferred), and the M7.3
// ranking with its reason codes. Never raw source, names, emails, tokens, attempt
// ids, or a full attempt history.

export const AI_CONTEXT_VERSION = 1

// A diagnosis may cite only these metric names; each resolves through M7.3's
// `lookupMetric`. `<feature>` expands to the structural features below. Listed in
// the prompt so the model stays on grounded identifiers, and enforced on the way
// back — a matching identifier is necessary, never sufficient (see validation).
export const ACCOUNT_METRICS = [
	'totals.attempts',
	'totals.problemsAttempted',
	'totals.problemsSolved',
	'hasActivity'
] as const
export const PROBLEM_METRICS = [
	'progress',
	'observed.attempts',
	'observed.failedAttempts',
	'observed.latestOutcome',
	'observed.attemptsToFirstSolve',
	'observed.failurePattern.pattern',
	'observed.failurePattern.trailingFailures'
] as const

// Cap on transitions carried per problem, newest kept — the payload stays bounded
// even for a learner with a long, varied history.
const MAX_TRANSITIONS_PER_PROBLEM = 8

// A deterministically-detectable unsupported claim: a judgement about mastery,
// speed, correctness or complexity that AST + outcomes cannot support. Mirrors the
// M7.3 copy constraint; if the model's prose trips it, the diagnosis is discarded.
const DISALLOWED_CLAIM =
	/\bmaster(ed|y|s)?\b|\bcomplexity\b|\bO\(|\bbig-?o\b|faster|slower|\bbetter\b|\bworse\b|optimal|efficien|proficien|\bskill(ed|s)?\b|you don'?t understand|\bgenius\b|\bexpert\b/i

// --- Compact, PII-free context ---------------------------------------------------

export interface AiProblemContext {
	slug: string
	difficulty: 'easy' | 'medium' | 'hard' | null
	conceptTags: string[]
	progress: 'not_started' | 'attempted' | 'solved'
	observed: {
		attempts: number
		failedAttempts: number
		latestOutcome: 'passed' | 'failed' | 'none'
		attemptsToFirstSolve: number | null
		failurePattern: string
		trailingFailures: number
		latestPassFraction: number | null
		bestPassFraction: number | null
	}
	// Observed AST pattern statuses (M7.2), never a judgement about them.
	structural: { feature: string; status: string; inLatest: boolean | null }[]
	// Historical structural transitions, as co-occurring facts (change + outcome).
	transitions: { change: string; outcomeChange: string }[]
	// M6 inferred signal codes only, explicitly separated from observed facts.
	inferredSignals: string[]
}

export interface AiContext {
	v: number
	// The version this diagnosis is bound to; the model is told not to contradict it.
	evidenceHash: string
	hasActivity: boolean
	totals: {
		attempts: number
		passedAttempts: number
		failedAttempts: number
		problemsAttempted: number
		problemsSolved: number
	}
	problems: AiProblemContext[]
	concepts: string[]
	ranked: { slug: string; reasonCode: string; reasonText: string }[]
	focusConcepts: string[]
	topRecommendation: string | null
}

export function buildAiContext(
	evidence: RecommendationEvidence,
	recommendation: Recommendation
): AiContext {
	const known = evidence.problems.filter((p) => p.known)
	const problems: AiProblemContext[] = known.map((p) => ({
		slug: p.slug,
		difficulty: p.difficulty,
		conceptTags: p.conceptTags,
		progress: p.progress,
		observed: {
			attempts: p.observed.attempts,
			failedAttempts: p.observed.failedAttempts,
			latestOutcome: p.observed.latestOutcome,
			attemptsToFirstSolve: p.observed.attemptsToFirstSolve,
			failurePattern: p.observed.failurePattern.pattern,
			trailingFailures: p.observed.failurePattern.trailingFailures,
			latestPassFraction: p.observed.latestPassFraction,
			bestPassFraction: p.observed.bestPassFraction
		},
		structural: p.observed.sequence.patterns.map((pat) => ({
			feature: pat.feature,
			status: pat.status,
			inLatest: pat.inLatest
		})),
		transitions: p.observed.sequence.transitions
			.slice(-MAX_TRANSITIONS_PER_PROBLEM)
			.map((t) => ({ change: t.change, outcomeChange: t.outcomeChange })),
		inferredSignals: [...new Set(p.inferred.signals.map((s) => s.code))].sort()
	}))
	return {
		v: AI_CONTEXT_VERSION,
		evidenceHash: recommendation.evidenceHash,
		hasActivity: evidence.hasActivity,
		totals: {
			attempts: evidence.totals.attempts,
			passedAttempts: evidence.totals.passedAttempts,
			failedAttempts: evidence.totals.failedAttempts,
			problemsAttempted: evidence.totals.problemsAttempted,
			problemsSolved: evidence.totals.problemsSolved
		},
		problems,
		concepts: evidence.concepts.map((c) => c.tag),
		ranked: recommendation.rankedProblems.map((r) => ({
			slug: r.slug,
			reasonCode: r.reasonCode,
			reasonText: r.reasonText
		})),
		focusConcepts: recommendation.focusConcepts,
		topRecommendation: recommendation.rankedProblems[0]?.slug ?? null
	}
}

// --- Prompt ----------------------------------------------------------------------

const DIAGNOSIS_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['summary', 'nextStep', 'claims'],
	properties: {
		summary: { type: 'string', maxLength: MAX_SUMMARY },
		nextStep: { type: 'string', maxLength: MAX_NEXT_STEP },
		claims: {
			type: 'array',
			maxItems: 8,
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['problemSlug', 'metric'],
				properties: {
					problemSlug: { type: ['string', 'null'] },
					metric: { type: 'string' },
					value: { type: ['string', 'number', 'boolean', 'null'] }
				}
			}
		},
		concepts: { type: 'array', maxItems: 3, items: { type: 'string' } }
	}
} as const

const SYSTEM_PROMPT = [
	'You are a coding-practice tutor. You are given a JSON snapshot of ONE learner and a deterministic recommendation that has ALREADY been decided.',
	'Your only job is to write a short, encouraging, factual explanation of that recommendation and a concrete next step.',
	'Hard rules:',
	'- Do NOT change the ranking or recommend a different problem than topRecommendation.',
	'- Use ONLY problem slugs present in the snapshot. Never invent a slug or a problem.',
	'- Every claim must reference a real metric from the allowed list and the value in the snapshot. Do not invent numbers, failures or facts.',
	'- "observed" fields are facts. "inferredSignals" are hypotheses — never state them as proven, and never present a correlation as a cause.',
	'- Never assert algorithmic complexity (no "O(...)", no "faster/slower"), never claim mastery, skill level or understanding from code structure.',
	`- summary <= ${MAX_SUMMARY} chars, nextStep <= ${MAX_NEXT_STEP} chars.`,
	'Respond with ONLY a JSON object matching the schema. No prose outside the JSON.'
].join('\n')

export function buildDiagnosisPrompt(context: AiContext): OpenRouterPrompt {
	const metricHelp = [
		`Allowed account metrics: ${ACCOUNT_METRICS.join(', ')}.`,
		`Allowed per-problem metrics: ${PROBLEM_METRICS.join(', ')}, and observed.sequence.patterns.<feature>.status where <feature> is one of ${STRUCTURAL_FEATURES.join(', ')}.`,
		'A claim with a problemSlug uses a per-problem metric; a claim for the whole account uses problemSlug=null and an account metric.'
	].join('\n')
	return {
		system: SYSTEM_PROMPT,
		user: `${metricHelp}\n\nLearner snapshot:\n${JSON.stringify(context)}`,
		jsonSchema: { name: 'recommendation_diagnosis', schema: DIAGNOSIS_JSON_SCHEMA }
	}
}

// --- Response schema and validation ----------------------------------------------

const claimSchema = z.object({
	problemSlug: z.string().nullable(),
	metric: z.string(),
	// Optional: when present it is checked against the evidence, not trusted.
	value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
})

export const aiDiagnosisResponseSchema = z
	.object({
		summary: z.string().min(1).max(MAX_SUMMARY),
		nextStep: z.string().min(1).max(MAX_NEXT_STEP),
		claims: z.array(claimSchema).max(8).default([]),
		concepts: z.array(z.string()).max(3).optional()
	})
	.strict()

export type AiDiagnosisResponse = z.infer<typeof aiDiagnosisResponseSchema>

export type DiagnosisRejection =
	| 'unknown_slug'
	| 'unresolved_metric'
	| 'wrong_metric_value'
	| 'unknown_concept'
	| 'disallowed_claim'

export type DiagnosisValidation =
	{ ok: true; diagnosis: AiDiagnosisResponse } | { ok: false; reason: DiagnosisRejection }

// A matching metric identifier is necessary but never sufficient: the slug must
// exist, the metric must resolve, and any value the model volunteered must equal
// the evidence. Concepts must be catalog tags, and no prose may make a disallowed
// claim. Anything less and the whole diagnosis is discarded for the M7.3 fallback.
export function validateAiDiagnosis(
	response: AiDiagnosisResponse,
	evidence: RecommendationEvidence
): DiagnosisValidation {
	const knownSlugs = new Set(evidence.problems.filter((p) => p.known).map((p) => p.slug))
	const conceptTags = new Set(evidence.concepts.map((c) => c.tag))

	for (const claim of response.claims) {
		if (claim.problemSlug != null && !knownSlugs.has(claim.problemSlug)) {
			return { ok: false, reason: 'unknown_slug' }
		}
		const hit = lookupMetric(evidence, claim.problemSlug, claim.metric)
		if (!hit.found) return { ok: false, reason: 'unresolved_metric' }
		if (claim.value !== undefined && !sameValue(claim.value, hit.value)) {
			return { ok: false, reason: 'wrong_metric_value' }
		}
	}
	for (const concept of response.concepts ?? []) {
		if (!conceptTags.has(concept)) return { ok: false, reason: 'unknown_concept' }
	}
	if (DISALLOWED_CLAIM.test(response.summary) || DISALLOWED_CLAIM.test(response.nextStep)) {
		return { ok: false, reason: 'disallowed_claim' }
	}
	return { ok: true, diagnosis: response }
}

function sameValue(a: unknown, b: unknown): boolean {
	// Numbers may arrive as strings from a loose model; compare leniently but safely.
	if (typeof b === 'number' && typeof a === 'string') return Number(a) === b
	return a === b
}

// Attaches the validated diagnosis, leaving ranking, focus concepts, version and
// the evidence hash exactly as M7.3 produced them. The AI touches the diagnosis
// and nothing else.
export function applyAiDiagnosis(
	recommendation: Recommendation,
	diagnosis: AiDiagnosisResponse
): Recommendation {
	return {
		...recommendation,
		diagnosis: {
			source: 'ai',
			stale: false,
			summary: diagnosis.summary,
			nextStep: diagnosis.nextStep,
			claims: diagnosis.claims.map((c) => ({ problemSlug: c.problemSlug, metric: c.metric }))
		}
	}
}

// --- The DI core -----------------------------------------------------------------

export type AskModel = (prompt: OpenRouterPrompt) => Promise<OpenRouterResult>

type OpenRouterFailureReason = Extract<OpenRouterResult, { ok: false }>['reason']

// Why a diagnosis was not attached — reported safely (enum only, no payload).
export type EnrichFailure =
	OpenRouterFailureReason | 'invalid_json' | 'schema_rejected' | DiagnosisRejection

export interface EnrichDeps {
	askModel: AskModel
	// Safe reporter: receives an enum reason only, never prompt/response content.
	report?: (reason: EnrichFailure) => void
}

export interface EnrichInput {
	evidence: RecommendationEvidence
	recommendation: Recommendation
}

// Parses model output, tolerating prose around the JSON object. Returns undefined
// when nothing parseable is found.
function parseJsonLoose(content: string): unknown {
	try {
		return JSON.parse(content)
	} catch {
		const start = content.indexOf('{')
		const end = content.lastIndexOf('}')
		if (start === -1 || end <= start) return undefined
		try {
			return JSON.parse(content.slice(start, end + 1))
		} catch {
			return undefined
		}
	}
}

/**
 * Enrich a deterministic recommendation with an AI diagnosis, or return it
 * unchanged. ALWAYS resolves to a complete recommendation — never throws, never
 * drops the deterministic result. The AI can only replace the `diagnosis`; if the
 * model is unavailable, malformed, or makes any claim the evidence does not
 * support, the M7.3 fallback is kept and the reason is reported.
 */
export async function enrichWithAi(input: EnrichInput, deps: EnrichDeps): Promise<Recommendation> {
	const { evidence, recommendation } = input
	const report = (reason: EnrichFailure) => deps.report?.(reason)

	const result = await deps.askModel(buildDiagnosisPrompt(buildAiContext(evidence, recommendation)))
	if (!result.ok) {
		// A missing key is "AI disabled", not an error worth reporting.
		if (result.reason !== 'no_api_key') report(result.reason)
		return recommendation
	}

	const json = parseJsonLoose(result.content)
	if (json === undefined) {
		report('invalid_json')
		return recommendation
	}
	const parsed = aiDiagnosisResponseSchema.safeParse(json)
	if (!parsed.success) {
		report('schema_rejected')
		return recommendation
	}
	const validated = validateAiDiagnosis(parsed.data, evidence)
	if (!validated.ok) {
		report(validated.reason)
		return recommendation
	}
	return applyAiDiagnosis(recommendation, validated.diagnosis)
}

// --- Production wiring ------------------------------------------------------------

export interface DiagnoseOptions {
	// ids/enums/booleans only, forwarded to the usage row's meta (never PII).
	meta?: Record<string, string | number | boolean>
}

/**
 * The real entry point a later authenticated refresh action (M7.5) calls: run the
 * deterministic recommendation through OpenRouter and return the enriched (or
 * unchanged) result. Binds the real provider lazily so this module stays testable.
 *
 * NOTE: this performs exactly one enrichment attempt. It does NOT implement the
 * durable refresh claim, per-user rate cap, or recommendation-cache dedup — those
 * belong to M7.5, which will wrap this behind the claim and the cache.
 */
export async function diagnoseRecommendation(
	input: EnrichInput,
	options: DiagnoseOptions = {}
): Promise<Recommendation> {
	const [{ askOpenRouter }, { resolveModel }, { env }, { captureError }] = await Promise.all([
		import('@/server/ai/openrouter'),
		import('@/server/ai/openrouter-protocol'),
		import('@/lib/env'),
		import('@/lib/observability/capture-error')
	])
	const model = resolveModel(env.OPENROUTER_MODEL)
	return enrichWithAi(input, {
		askModel: (prompt) =>
			askOpenRouter({ feature: 'learning_recommendation', model, meta: options.meta }, prompt),
		report: (reason) =>
			captureError(new Error(`learning_recommendation enrichment skipped: ${reason}`), {
				area: 'recommend-ai',
				reason
			})
	})
}
