import {
	computeLearningStatistics,
	type AttemptRecord,
	type LearningRecords
} from './statistics.ts'
import { analyzeLearningBehavior } from './behavior.ts'
import { generateLearningInsights } from './insights.ts'
import { buildAttemptSequences, type AttemptEvidenceRecord } from './solution-evolution.ts'
import {
	buildRecommendationEvidence,
	catalogEntries,
	type CatalogEntry,
	type LearningAnalyticsInput
} from './recommendation-evidence.ts'
import { computeEvidenceHash } from './evidence-hash.ts'
import type { CodeFeatures } from '../trace/code-features.ts'
import { PROBLEMS } from '../trace/problems.ts'

// Shared by the M7.2 tests. It drives the REAL M6 calculators over small synthetic
// histories, so the evidence tests see genuine M6 output rather than stand-ins.

export const CATALOG: CatalogEntry[] = catalogEntries(Object.values(PROBLEMS))

// Structural fingerprints as the worker produces them for the shapes the tests need.
export const NESTED: CodeFeatures = {
	v: 1,
	loops: { for: 2, while: 0, maxDepth: 2 },
	comprehensions: 0,
	branches: 1,
	returns: 2,
	defs: 1,
	recursion: false,
	usesDict: false,
	usesSet: false,
	usesSorted: false,
	builtinCalls: ['len', 'range'],
	nodeCount: 61,
	lineCount: 6
}
export const HASHMAP: CodeFeatures = {
	...NESTED,
	loops: { for: 1, while: 0, maxDepth: 1 },
	usesDict: true,
	builtinCalls: ['enumerate'],
	nodeCount: 70,
	lineCount: 8
}
export const SET_BASED: CodeFeatures = {
	...NESTED,
	loops: { for: 1, while: 0, maxDepth: 1 },
	usesSet: true,
	builtinCalls: ['set'],
	nodeCount: 52,
	lineCount: 7
}
export const SORTED_BASED: CodeFeatures = {
	...NESTED,
	loops: { for: 0, while: 0, maxDepth: 0 },
	usesSorted: true,
	comprehensions: 1,
	builtinCalls: ['any', 'len', 'range', 'sorted'],
	nodeCount: 48,
	lineCount: 3
}
export const RECURSIVE: CodeFeatures = {
	...NESTED,
	loops: { for: 0, while: 0, maxDepth: 0 },
	recursion: true,
	builtinCalls: ['len'],
	nodeCount: 40,
	lineCount: 5
}
export const MARKER = { v: 1, unanalyzable: 'syntax_error' }

export interface Spec {
	id: string
	slug: string
	minute: number
	testsPassed: number
	testsTotal: number
	failedTestIds: string[]
	status: string
	features: unknown
}

const BASE_TIME = Date.UTC(2026, 10, 1)
export const at = (minute: number) => new Date(BASE_TIME + minute * 60_000)

// A terse attempt: `pass` passes all 3 tests, `fail` passes 1 and fails t2 and t3.
export function att(
	id: string,
	minute: number,
	result: 'pass' | 'fail',
	features: unknown = null,
	over: Partial<Spec> = {}
): Spec {
	return {
		id,
		slug: 'two-sum',
		minute,
		testsPassed: result === 'pass' ? 3 : 1,
		testsTotal: 3,
		failedTestIds: result === 'pass' ? [] : ['t2', 't3'],
		status: 'completed',
		features,
		...over
	}
}

export function m6Records(specs: Spec[]): LearningRecords {
	const attempts: AttemptRecord[] = specs.map((s) => ({
		id: s.id,
		problemSlug: s.slug,
		createdAt: at(s.minute),
		testsPassed: s.testsPassed,
		testsTotal: s.testsTotal,
		allPassed: s.status === 'completed' && s.testsTotal > 0 && s.testsPassed === s.testsTotal,
		failedTestIds: s.failedTestIds
	}))
	return { attempts, replaySessions: [], events: [] }
}

export function evidenceRecords(specs: Spec[]): AttemptEvidenceRecord[] {
	return specs.map((s) => ({
		id: s.id,
		problemSlug: s.slug,
		createdAt: at(s.minute),
		status: s.status,
		testsPassed: s.testsPassed,
		testsTotal: s.testsTotal,
		allPassed: s.status === 'completed' && s.testsTotal > 0 && s.testsPassed === s.testsTotal,
		failedTestIds: s.failedTestIds,
		codeFeatures: s.features
	}))
}

export function analyticsOf(records: LearningRecords): LearningAnalyticsInput {
	const statistics = computeLearningStatistics(records)
	const behavior = analyzeLearningBehavior(statistics, records)
	return { statistics, behavior, insights: generateLearningInsights(statistics, behavior) }
}

export function buildFor(
	specs: Spec[],
	options: { catalog?: CatalogEntry[]; generatedAt?: string | null } = {}
) {
	const analytics = analyticsOf(m6Records(specs))
	const sequences = buildAttemptSequences(evidenceRecords(specs))
	const evidence = buildRecommendationEvidence(analytics, sequences, options.catalog ?? CATALOG, {
		generatedAt: options.generatedAt ?? null
	})
	return { analytics, sequences, evidence, hash: computeEvidenceHash(evidence) }
}
