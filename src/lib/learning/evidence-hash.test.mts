import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
	EVIDENCE_FINGERPRINT_VERSION,
	canonicalJson,
	computeEvidenceHash,
	fingerprintView
} from './evidence-hash.ts'
import { buildAttemptSequences } from './solution-evolution.ts'
import { buildRecommendationEvidence } from './recommendation-evidence.ts'
import {
	CATALOG,
	HASHMAP,
	MARKER,
	NESTED,
	analyticsOf,
	att,
	buildFor,
	evidenceRecords,
	m6Records
} from './evidence-fixtures.mts'

const SPECS = [
	att('a1', 0, 'fail', NESTED),
	att('a2', 4, 'fail', NESTED),
	att('a3', 8, 'pass', HASHMAP)
]

test('canonicalJson sorts keys at every level, keeps array order and drops undefined', () => {
	assert.equal(
		canonicalJson({ b: 1, a: { d: [3, 1, 2], c: undefined, b: null } }),
		'{"a":{"b":null,"d":[3,1,2]},"b":1}'
	)
	assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }))
	assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]))
	assert.equal(canonicalJson('x'), '"x"')
	assert.throws(() => canonicalJson({ n: Number.NaN }), TypeError)
	assert.throws(() => canonicalJson({ n: Infinity }), TypeError)
	assert.throws(() => canonicalJson({ f: () => 1 }), TypeError)
})

test('the hash is stable: the same evidence always gives the same versioned hash', () => {
	const first = buildFor(SPECS).hash
	assert.match(first, /^ev1:[0-9a-f]{64}$/)
	assert.equal(EVIDENCE_FINGERPRINT_VERSION, 1)
	assert.equal(buildFor(SPECS).hash, first)
	assert.equal(buildFor(SPECS).hash, first, 'and again')
})

test('volatile generation timestamps never change the hash', () => {
	const a = buildFor(SPECS, { generatedAt: '2026-11-02T00:00:00.000Z' })
	const b = buildFor(SPECS, { generatedAt: '2031-01-01T12:34:56.789Z' })
	const c = buildFor(SPECS, { generatedAt: null })
	assert.notEqual(a.evidence.generatedAt, b.evidence.generatedAt)
	assert.equal(a.hash, b.hash)
	assert.equal(a.hash, c.hash)
	assert.ok(!('generatedAt' in fingerprintView(a.evidence)))
})

test('ordering is normalised: shuffled records, sequences and catalog hash identically', () => {
	const reference = buildFor(SPECS).hash
	const reversed = [...SPECS].reverse()
	assert.equal(buildFor(reversed).hash, reference)
	const analytics = analyticsOf(m6Records(SPECS))
	const sequences = buildAttemptSequences(evidenceRecords(reversed))
	const shuffled = buildRecommendationEvidence(
		analytics,
		[...sequences].reverse(),
		[...CATALOG].reverse()
	)
	assert.equal(computeEvidenceHash(shuffled), reference)
})

test('a backfill that fills a missing fingerprint invalidates the hash, with the same ids and schema version', () => {
	const before = [
		att('a1', 0, 'fail', null),
		att('a2', 4, 'fail', null),
		att('a3', 8, 'pass', HASHMAP)
	]
	const after = [
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', null),
		att('a3', 8, 'pass', HASHMAP)
	]
	const hashBefore = buildFor(before).hash
	const hashAfter = buildFor(after).hash
	assert.notEqual(hashBefore, hashAfter)
	assert.deepEqual(
		buildFor(before).evidence.problems.map((p) =>
			p.observed.sequence.items.map((i) => i.attemptId)
		),
		buildFor(after).evidence.problems.map((p) => p.observed.sequence.items.map((i) => i.attemptId)),
		'identical attempt ids'
	)
	// Filling the rest changes it again; and the content, not just presence, counts.
	const full = [
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'pass', HASHMAP)
	]
	assert.notEqual(buildFor(full).hash, hashAfter)
	const tweaked = [
		att('a1', 0, 'fail', { ...NESTED, nodeCount: NESTED.nodeCount + 1 }),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'pass', HASHMAP)
	]
	assert.notEqual(buildFor(tweaked).hash, buildFor(full).hash)
})

test('recording that a source can never be analysed is a change in evidence, so it changes the hash too', () => {
	const missing = [att('a1', 0, 'fail', null)]
	const marked = [att('a1', 0, 'fail', MARKER)]
	assert.notEqual(buildFor(missing).hash, buildFor(marked).hash)
})

test('a new attempt, a changed outcome or a different test result changes the hash', () => {
	const base = buildFor(SPECS).hash
	assert.notEqual(buildFor([...SPECS, att('a4', 12, 'pass', HASHMAP)]).hash, base, 'new attempt')
	assert.notEqual(
		buildFor([
			att('a1', 0, 'fail', NESTED),
			att('a2', 4, 'fail', NESTED),
			att('a3', 8, 'fail', HASHMAP)
		]).hash,
		base,
		'outcome'
	)
	assert.notEqual(
		buildFor([
			att('a1', 0, 'fail', NESTED),
			att('a2', 4, 'fail', NESTED, { failedTestIds: ['t1'], testsPassed: 2 }),
			att('a3', 8, 'pass', HASHMAP)
		]).hash,
		base,
		'failed test ids'
	)
	assert.notEqual(
		buildFor([
			att('a1', 0, 'fail', NESTED),
			att('a2', 4, 'fail', NESTED),
			att('a3', 9, 'pass', HASHMAP)
		]).hash,
		base,
		'a different time'
	)
})

test('a change to the catalog changes the hash; an unrelated reordering does not', () => {
	const base = buildFor(SPECS, { catalog: CATALOG }).hash
	const retagged = CATALOG.map((e) =>
		e.slug === 'two-sum' ? { ...e, conceptTags: [...e.conceptTags, 'pointers'] } : e
	)
	assert.notEqual(buildFor(SPECS, { catalog: retagged }).hash, base)
	assert.equal(buildFor(SPECS, { catalog: [...CATALOG].reverse() }).hash, base)
})

test('the version is part of what is hashed, so a bump invalidates every cached hash', () => {
	const { evidence, hash } = buildFor(SPECS)
	const digest = (input: string) => createHash('sha256').update(input).digest('hex')
	const withVersion = digest(
		canonicalJson({
			fingerprint: EVIDENCE_FINGERPRINT_VERSION,
			evidence: fingerprintView(evidence)
		})
	)
	const withoutVersion = digest(canonicalJson(fingerprintView(evidence)))
	assert.equal(hash, `ev${EVIDENCE_FINGERPRINT_VERSION}:${withVersion}`)
	assert.notEqual(withVersion, withoutVersion)
	const nextVersion = digest(
		canonicalJson({
			fingerprint: EVIDENCE_FINGERPRINT_VERSION + 1,
			evidence: fingerprintView(evidence)
		})
	)
	assert.notEqual(nextVersion, withVersion)
})

test('an empty learner has a stable hash that a first attempt changes', () => {
	const empty = buildFor([]).hash
	assert.equal(buildFor([]).hash, empty)
	assert.notEqual(buildFor([att('a1', 0, 'fail', null)]).hash, empty)
})
