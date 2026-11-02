import {
	parseStoredCodeFeatures,
	unanalyzableMarkerSchema,
	type CodeFeatures
} from '../trace/code-features'

// Solution evolution (M7.2): how one learner's solution to one problem changed
// across their latest few attempts. Pure and deterministic — no I/O, no clock, no
// randomness; the same records always give the same sequence.
//
// Everything here is OBSERVED. It describes what the structural fingerprints and
// the recorded outcomes say, and never what they mean: no structural change is
// called an improvement, a speed-up, or evidence of understanding. A learner can
// swap nested loops for a dictionary and still fail, or fix a bug without changing
// a single count, so the fingerprint alone supports no claim about correctness,
// complexity or mastery (specs/features/learning-recommendations.md). What the
// evidence might MEAN is left to M6's inferred layer and to the later ranking.

export const EVOLUTION_WINDOW = 5

// What the attempt's recorded run status was. Anything unrecognised is `other`.
export type RunStatusEvidence = 'completed' | 'syntax_error' | 'timeout' | 'engine_error' | 'other'
const RUN_STATUSES: readonly RunStatusEvidence[] = [
	'completed',
	'syntax_error',
	'timeout',
	'engine_error'
]
export type Outcome = 'passed' | 'failed'

// Whether this attempt has a structural fingerprint to compare:
// - features: a valid, current-version fingerprint is stored;
// - unanalyzable: the source can never be fingerprinted (it does not parse, or
//   exceeds the limits), recorded by a marker or by its syntax_error status;
// - missing: nothing usable yet (never backfilled, corrupt, or another version).
export type CodeEvidenceStatus = 'features' | 'unanalyzable' | 'missing'

// The structural facts tracked across attempts. `nested_loops` means the deepest
// loop nesting is at least NESTED_LOOP_DEPTH; the rest read straight off the
// fingerprint.
export const STRUCTURAL_FEATURES = ['nested_loops', 'dict', 'set', 'sorted', 'recursion'] as const
export type StructuralFeature = (typeof STRUCTURAL_FEATURES)[number]
export const NESTED_LOOP_DEPTH = 2

const FEATURE_PRESENT: Record<StructuralFeature, (features: CodeFeatures) => boolean> = {
	nested_loops: (f) => f.loops.maxDepth >= NESTED_LOOP_DEPTH,
	dict: (f) => f.usesDict,
	set: (f) => f.usesSet,
	sorted: (f) => f.usesSorted,
	recursion: (f) => f.recursion
}

// A difference between two CONSECUTIVE attempts that both have a fingerprint.
// Listed in this order whenever several happen between the same two attempts.
export const STRUCTURAL_CHANGES = [
	'nested_loops_added',
	'nested_loops_removed',
	'loop_depth_increased',
	'loop_depth_decreased',
	'dict_introduced',
	'dict_removed',
	'set_introduced',
	'set_removed',
	'sorted_introduced',
	'sorted_removed',
	'recursion_introduced',
	'recursion_removed'
] as const
export type StructuralChange = (typeof STRUCTURAL_CHANGES)[number]

const FEATURE_CHANGES: Record<
	StructuralFeature,
	{ gained: StructuralChange; lost: StructuralChange }
> = {
	nested_loops: { gained: 'nested_loops_added', lost: 'nested_loops_removed' },
	dict: { gained: 'dict_introduced', lost: 'dict_removed' },
	set: { gained: 'set_introduced', lost: 'set_removed' },
	sorted: { gained: 'sorted_introduced', lost: 'sorted_removed' },
	recursion: { gained: 'recursion_introduced', lost: 'recursion_removed' }
}

export type OutcomeChange =
	'failed_to_failed' | 'failed_to_passed' | 'passed_to_failed' | 'passed_to_passed'
const OUTCOME_CHANGE: Record<Outcome, Record<Outcome, OutcomeChange>> = {
	failed: { failed: 'failed_to_failed', passed: 'failed_to_passed' },
	passed: { failed: 'passed_to_failed', passed: 'passed_to_passed' }
}

// One stored attempt, read WITHOUT its source text: outcomes plus whatever sits in
// `codeFeatures` (null, a fingerprint, a marker, or something unreadable).
export interface AttemptEvidenceRecord {
	id: string
	problemSlug: string
	createdAt: Date
	// The recorded run status (attempts.status).
	status: string
	testsPassed: number
	testsTotal: number
	allPassed: boolean
	failedTestIds: string[]
	codeFeatures: unknown
}

export interface AttemptSeqItem {
	// 1-based within the kept window, oldest first.
	order: number
	attemptId: string
	createdAt: string
	runStatus: RunStatusEvidence
	outcome: Outcome
	testsPassed: number
	testsTotal: number
	failedTestIds: string[]
	code: CodeFeatures | null
	codeStatus: CodeEvidenceStatus
	// Same fingerprint as the previous attempt, or null when either lacks one.
	// Identical FINGERPRINTS, not identical source: a one-character fix can leave
	// every count unchanged.
	sameStructureAsPrevious: boolean | null
}

export interface StructuralTransition {
	change: StructuralChange
	fromOrder: number
	toOrder: number
	fromAttemptId: string
	toAttemptId: string
	// What happened to the pass/fail outcome across the same two attempts. It
	// co-occurs with the change; it is not claimed to be caused by it.
	outcomeChange: OutcomeChange
}

// How one structural fact is distributed over the attempts that have a fingerprint.
// - no_evidence: no attempt in the window has a fingerprint;
// - absent: no fingerprinted attempt has it;
// - appeared_once: exactly one fingerprinted attempt has it, the latest;
// - recurring: two or more fingerprinted attempts have it, including the latest;
// - disappeared: some fingerprinted attempt had it, the latest does not.
export type PatternStatus = 'no_evidence' | 'absent' | 'appeared_once' | 'recurring' | 'disappeared'

export interface StructuralPattern {
	feature: StructuralFeature
	status: PatternStatus
	// Fingerprinted attempts that have it, out of all fingerprinted attempts.
	presentIn: number
	of: number
	// Whether the latest fingerprinted attempt has it (null with no fingerprints).
	inLatest: boolean | null
	// True when a change dropping it coincided with a failed -> passed outcome
	// change between two consecutive attempts. Co-occurrence, nothing more.
	droppedWithFailToPass: boolean
}

export interface EvidenceCoverage {
	attempts: number
	withFeatures: number
	unanalyzable: number
	missing: number
}

export type ContradictionKind =
	// The stored record disagrees with itself (e.g. passed, yet a test failed).
	| 'inconsistent_attempt_record'
	// Two attempts with the same fingerprint but different outcomes. Not an error:
	// it is exactly the case where structure cannot explain the result.
	| 'same_structure_different_outcome'

export interface Contradiction {
	kind: ContradictionKind
	attemptIds: string[]
}

export interface AttemptSequence {
	problemSlug: string
	windowSize: number
	items: AttemptSeqItem[]
	coverage: EvidenceCoverage
	transitions: StructuralTransition[]
	patterns: StructuralPattern[]
	contradictions: Contradiction[]
}

function runStatusOf(status: string): RunStatusEvidence {
	return RUN_STATUSES.find((known) => known === status) ?? 'other'
}

function codeStatusOf(value: unknown, runStatus: RunStatusEvidence): CodeEvidenceStatus {
	if (parseStoredCodeFeatures(value) != null) return 'features'
	if (unanalyzableMarkerSchema.safeParse(value).success) return 'unanalyzable'
	return runStatus === 'syntax_error' ? 'unanalyzable' : 'missing'
}

function sameFeatures(a: CodeFeatures, b: CodeFeatures): boolean {
	// Both come out of the strict schema, so equal content serialises identically.
	return JSON.stringify(a) === JSON.stringify(b)
}

function byTimeThenId(a: AttemptEvidenceRecord, b: AttemptEvidenceRecord): number {
	const diff = a.createdAt.getTime() - b.createdAt.getTime()
	if (diff !== 0) return diff
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function itemOf(record: AttemptEvidenceRecord, order: number): AttemptSeqItem {
	const runStatus = runStatusOf(record.status)
	const code = parseStoredCodeFeatures(record.codeFeatures)
	return {
		order,
		attemptId: record.id,
		createdAt: record.createdAt.toISOString(),
		runStatus,
		outcome: record.allPassed ? 'passed' : 'failed',
		testsPassed: record.testsPassed,
		testsTotal: record.testsTotal,
		failedTestIds: [...new Set(record.failedTestIds)].sort(),
		code,
		codeStatus: codeStatusOf(record.codeFeatures, runStatus),
		sameStructureAsPrevious: null
	}
}

function transitionsOf(items: AttemptSeqItem[]): StructuralTransition[] {
	const out: StructuralTransition[] = []
	for (let i = 1; i < items.length; i += 1) {
		const from = items[i - 1]
		const to = items[i]
		// Only genuinely consecutive attempts with a fingerprint each are compared;
		// a missing one is never bridged over.
		if (from?.code == null || to?.code == null) continue
		const changes = new Set<StructuralChange>()
		for (const feature of STRUCTURAL_FEATURES) {
			const before = FEATURE_PRESENT[feature](from.code)
			const after = FEATURE_PRESENT[feature](to.code)
			if (!before && after) changes.add(FEATURE_CHANGES[feature].gained)
			if (before && !after) changes.add(FEATURE_CHANGES[feature].lost)
		}
		if (to.code.loops.maxDepth > from.code.loops.maxDepth) changes.add('loop_depth_increased')
		if (to.code.loops.maxDepth < from.code.loops.maxDepth) changes.add('loop_depth_decreased')
		for (const change of STRUCTURAL_CHANGES) {
			if (!changes.has(change)) continue
			out.push({
				change,
				fromOrder: from.order,
				toOrder: to.order,
				fromAttemptId: from.attemptId,
				toAttemptId: to.attemptId,
				outcomeChange: OUTCOME_CHANGE[from.outcome][to.outcome]
			})
		}
	}
	return out
}

function patternsOf(
	items: AttemptSeqItem[],
	transitions: StructuralTransition[]
): StructuralPattern[] {
	const fingerprinted = items.flatMap((item) => (item.code == null ? [] : [item.code]))
	const latest = fingerprinted.at(-1)
	return STRUCTURAL_FEATURES.map((feature): StructuralPattern => {
		const present = FEATURE_PRESENT[feature]
		const presentIn = fingerprinted.filter(present).length
		const inLatest = latest == null ? null : present(latest)
		let status: PatternStatus
		if (latest == null) status = 'no_evidence'
		else if (presentIn === 0) status = 'absent'
		else if (!inLatest) status = 'disappeared'
		else status = presentIn >= 2 ? 'recurring' : 'appeared_once'
		const lost = FEATURE_CHANGES[feature].lost
		return {
			feature,
			status,
			presentIn,
			of: fingerprinted.length,
			inLatest,
			droppedWithFailToPass:
				status === 'disappeared' &&
				transitions.some((t) => t.change === lost && t.outcomeChange === 'failed_to_passed')
		}
	})
}

function contradictionsOf(items: AttemptSeqItem[]): Contradiction[] {
	const out: Contradiction[] = []
	for (const item of items) {
		const claimsPassed = item.outcome === 'passed'
		const inconsistent = claimsPassed
			? item.runStatus !== 'completed' ||
				item.failedTestIds.length > 0 ||
				item.testsPassed < item.testsTotal
			: item.testsTotal > 0 &&
				item.testsPassed === item.testsTotal &&
				item.failedTestIds.length === 0
		if (inconsistent)
			out.push({ kind: 'inconsistent_attempt_record', attemptIds: [item.attemptId] })
	}
	for (let i = 0; i < items.length; i += 1) {
		for (let j = i + 1; j < items.length; j += 1) {
			const a = items[i]
			const b = items[j]
			if (a?.code == null || b?.code == null) continue
			if (a.outcome !== b.outcome && sameFeatures(a.code, b.code)) {
				out.push({
					kind: 'same_structure_different_outcome',
					attemptIds: [a.attemptId, b.attemptId]
				})
			}
		}
	}
	return out
}

// The latest `window` attempts of ONE problem, oldest first, with their observed
// structural evolution. Records are sorted by time then id, so input order never
// matters and identical timestamps tie-break deterministically; a repeated id is
// kept once.
export function analyzeSolutionEvolution(
	problemSlug: string,
	records: AttemptEvidenceRecord[],
	window: number = EVOLUTION_WINDOW
): AttemptSequence {
	const unique = [...new Map(records.map((record) => [record.id, record])).values()]
	const kept = unique.sort(byTimeThenId).slice(-Math.max(1, window))
	const items = kept.map((record, index) => itemOf(record, index + 1))
	items.forEach((item, index) => {
		const previous = items[index - 1]
		item.sameStructureAsPrevious =
			previous?.code == null || item.code == null ? null : sameFeatures(previous.code, item.code)
	})
	const transitions = transitionsOf(items)
	return {
		problemSlug,
		windowSize: window,
		items,
		coverage: {
			attempts: items.length,
			withFeatures: items.filter((i) => i.codeStatus === 'features').length,
			unanalyzable: items.filter((i) => i.codeStatus === 'unanalyzable').length,
			missing: items.filter((i) => i.codeStatus === 'missing').length
		},
		transitions,
		patterns: patternsOf(items, transitions),
		contradictions: contradictionsOf(items)
	}
}

export function emptySequence(
	problemSlug: string,
	window: number = EVOLUTION_WINDOW
): AttemptSequence {
	return analyzeSolutionEvolution(problemSlug, [], window)
}

// Groups raw records by problem and analyses each. Sorted by slug.
export function buildAttemptSequences(
	records: AttemptEvidenceRecord[],
	window: number = EVOLUTION_WINDOW
): AttemptSequence[] {
	const bySlug = new Map<string, AttemptEvidenceRecord[]>()
	for (const record of records) {
		const group = bySlug.get(record.problemSlug)
		if (group) group.push(record)
		else bySlug.set(record.problemSlug, [record])
	}
	return [...bySlug.keys()]
		.sort()
		.map((slug) => analyzeSolutionEvolution(slug, bySlug.get(slug) ?? [], window))
}
