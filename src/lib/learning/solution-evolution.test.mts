import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
	EVOLUTION_WINDOW,
	STRUCTURAL_CHANGES,
	STRUCTURAL_FEATURES,
	analyzeSolutionEvolution,
	buildAttemptSequences,
	type AttemptSequence,
	type StructuralPattern
} from './solution-evolution.ts'
import {
	HASHMAP,
	MARKER,
	NESTED,
	RECURSIVE,
	SET_BASED,
	SORTED_BASED,
	att,
	evidenceRecords
} from './evidence-fixtures.mts'

const seq = (...specs: ReturnType<typeof att>[]): AttemptSequence =>
	analyzeSolutionEvolution('two-sum', evidenceRecords(specs))
const pattern = (s: AttemptSequence, feature: StructuralPattern['feature']) =>
	s.patterns.find((p) => p.feature === feature) as StructuralPattern
const changes = (s: AttemptSequence) => s.transitions.map((t) => t.change)

test('empty history: an empty window, no transitions, every pattern has no evidence', () => {
	const s = seq()
	assert.deepEqual(s.items, [])
	assert.deepEqual(s.coverage, { attempts: 0, withFeatures: 0, unanalyzable: 0, missing: 0 })
	assert.deepEqual(s.transitions, [])
	assert.deepEqual(s.contradictions, [])
	assert.deepEqual(
		s.patterns.map((p) => [p.feature, p.status, p.inLatest]),
		STRUCTURAL_FEATURES.map((f) => [f, 'no_evidence', null])
	)
})

test('one failed attempt: one item, its fingerprint, and a pattern that appeared once', () => {
	const s = seq(att('a1', 0, 'fail', NESTED))
	assert.equal(s.items.length, 1)
	const [item] = s.items
	assert.deepEqual(
		[item?.order, item?.outcome, item?.testsPassed, item?.testsTotal, item?.codeStatus],
		[1, 'failed', 1, 3, 'features']
	)
	assert.deepEqual(item?.failedTestIds, ['t2', 't3'])
	assert.equal(item?.sameStructureAsPrevious, null)
	assert.deepEqual(s.transitions, [])
	assert.equal(pattern(s, 'nested_loops').status, 'appeared_once')
	assert.equal(pattern(s, 'dict').status, 'absent')
})

test('failed -> failed -> passed with the same structure: no change, a recurring pattern, and a flagged contradiction', () => {
	const s = seq(
		att('a1', 0, 'fail', NESTED),
		att('a2', 5, 'fail', NESTED, { failedTestIds: ['t3'], testsPassed: 2 }),
		att('a3', 9, 'pass', NESTED)
	)
	assert.deepEqual(
		s.items.map((i) => i.outcome),
		['failed', 'failed', 'passed']
	)
	assert.deepEqual(
		s.items.map((i) => i.order),
		[1, 2, 3]
	)
	assert.deepEqual(s.items[1]?.failedTestIds, ['t3'])
	assert.deepEqual(s.transitions, [], 'identical structure is not a change')
	assert.equal(pattern(s, 'nested_loops').status, 'recurring')
	assert.equal(pattern(s, 'nested_loops').presentIn, 3)
	// Same fingerprint, different outcome: the fingerprint cannot explain the pass.
	assert.deepEqual(
		s.contradictions.map((c) => [c.kind, c.attemptIds]),
		[
			['same_structure_different_outcome', ['a1', 'a3']],
			['same_structure_different_outcome', ['a2', 'a3']]
		]
	)
})

test('nested loops -> dictionary: the observed changes, in a fixed order, with the outcome change beside them', () => {
	const s = seq(
		att('a1', 0, 'fail', NESTED),
		att('a2', 4, 'fail', NESTED),
		att('a3', 8, 'pass', HASHMAP)
	)
	assert.deepEqual(changes(s), ['nested_loops_removed', 'loop_depth_decreased', 'dict_introduced'])
	assert.ok(s.transitions.every((t) => t.fromAttemptId === 'a2' && t.toAttemptId === 'a3'))
	assert.ok(s.transitions.every((t) => t.fromOrder === 2 && t.toOrder === 3))
	assert.ok(s.transitions.every((t) => t.outcomeChange === 'failed_to_passed'))
	const nested = pattern(s, 'nested_loops')
	assert.equal(nested.status, 'disappeared')
	assert.equal(nested.presentIn, 2)
	assert.equal(nested.inLatest, false)
	assert.equal(nested.droppedWithFailToPass, true)
	assert.equal(pattern(s, 'dict').status, 'appeared_once')
	assert.equal(pattern(s, 'set').status, 'absent')
})

test('swapping in a dictionary and still failing is reported as exactly that, nothing more', () => {
	const s = seq(att('a1', 0, 'fail', NESTED), att('a2', 3, 'fail', HASHMAP))
	assert.deepEqual(changes(s), ['nested_loops_removed', 'loop_depth_decreased', 'dict_introduced'])
	assert.ok(s.transitions.every((t) => t.outcomeChange === 'failed_to_failed'))
	assert.equal(pattern(s, 'nested_loops').droppedWithFailToPass, false)
})

test('every structural change kind is detected, in both directions', () => {
	const pairs: Array<[unknown, unknown, string[]]> = [
		[HASHMAP, SET_BASED, ['dict_removed', 'set_introduced']],
		[SET_BASED, SORTED_BASED, ['loop_depth_decreased', 'set_removed', 'sorted_introduced']],
		[SORTED_BASED, RECURSIVE, ['sorted_removed', 'recursion_introduced']],
		[RECURSIVE, NESTED, ['nested_loops_added', 'loop_depth_increased', 'recursion_removed']],
		[HASHMAP, NESTED, ['nested_loops_added', 'loop_depth_increased', 'dict_removed']],
		[NESTED, HASHMAP, ['nested_loops_removed', 'loop_depth_decreased', 'dict_introduced']]
	]
	const seen = new Set<string>()
	for (const [from, to, expected] of pairs) {
		const s = seq(att('x1', 0, 'fail', from), att('x2', 1, 'fail', to))
		assert.deepEqual(changes(s), expected)
		for (const change of changes(s)) seen.add(change)
		// Always listed in the canonical order.
		const order = changes(s).map((c) => STRUCTURAL_CHANGES.indexOf(c))
		assert.deepEqual(
			order,
			[...order].sort((a, b) => a - b)
		)
	}
	assert.deepEqual([...seen].sort(), [...STRUCTURAL_CHANGES].sort(), 'all twelve exercised')
})

test('loop depth changes are reported even when the nested-loop line is not crossed', () => {
	const flat = { ...NESTED, loops: { for: 0, while: 0, maxDepth: 0 } }
	const one = { ...NESTED, loops: { for: 1, while: 0, maxDepth: 1 } }
	assert.deepEqual(changes(seq(att('a', 0, 'fail', flat), att('b', 1, 'fail', one))), [
		'loop_depth_increased'
	])
	assert.deepEqual(changes(seq(att('a', 0, 'fail', one), att('b', 1, 'fail', flat))), [
		'loop_depth_decreased'
	])
})

test('repeated identical solutions: same structure each time, no transitions, no contradictions', () => {
	const s = seq(
		att('a1', 0, 'fail', NESTED),
		att('a2', 2, 'fail', NESTED),
		att('a3', 4, 'fail', NESTED)
	)
	assert.deepEqual(
		s.items.map((i) => i.sameStructureAsPrevious),
		[null, true, true]
	)
	assert.deepEqual(s.transitions, [])
	assert.deepEqual(s.contradictions, [])
	assert.equal(pattern(s, 'nested_loops').status, 'recurring')
})

test('a regression, passed -> failed, keeps both outcomes and the structural facts apart', () => {
	const s = seq(att('a1', 0, 'pass', HASHMAP), att('a2', 6, 'fail', NESTED))
	assert.deepEqual(changes(s), ['nested_loops_added', 'loop_depth_increased', 'dict_removed'])
	assert.ok(s.transitions.every((t) => t.outcomeChange === 'passed_to_failed'))
	assert.equal(pattern(s, 'dict').status, 'disappeared')
	assert.equal(pattern(s, 'dict').droppedWithFailToPass, false)
	// Same structure, passed then failed: flagged as unexplained by structure.
	const same = seq(att('b1', 0, 'pass', HASHMAP), att('b2', 1, 'fail', HASHMAP))
	assert.deepEqual(same.transitions, [])
	assert.deepEqual(
		same.contradictions.map((c) => c.kind),
		['same_structure_different_outcome']
	)
})

test('missing historical fingerprints are counted, never bridged over, and never invented', () => {
	const s = seq(
		att('a1', 0, 'fail', null),
		att('a2', 1, 'fail', NESTED),
		att('a3', 2, 'fail', undefined),
		att('a4', 3, 'pass', HASHMAP)
	)
	assert.deepEqual(s.coverage, { attempts: 4, withFeatures: 2, unanalyzable: 0, missing: 2 })
	assert.deepEqual(
		s.items.map((i) => i.codeStatus),
		['missing', 'features', 'missing', 'features']
	)
	assert.deepEqual(s.transitions, [], 'a2 and a4 are not consecutive, so they are not compared')
	assert.deepEqual(
		s.items.map((i) => i.sameStructureAsPrevious),
		[null, null, null, null]
	)
	// Patterns still describe the fingerprinted attempts, and say how many that is.
	assert.equal(pattern(s, 'nested_loops').of, 2)
	assert.equal(pattern(s, 'nested_loops').status, 'disappeared')
	assert.equal(pattern(s, 'nested_loops').droppedWithFailToPass, false, 'no transition to credit')
})

test('invalid, corrupt and other-version fingerprints read as missing, not as an error', () => {
	const s = seq(
		att('a1', 0, 'fail', { ...NESTED, v: 2 }),
		att('a2', 1, 'fail', 'not json'),
		att('a3', 2, 'fail', { ...NESTED, extra: 'x' }),
		att('a4', 3, 'fail', { v: 1 }),
		att('a5', 4, 'fail', 42)
	)
	assert.deepEqual(s.coverage, { attempts: 5, withFeatures: 0, unanalyzable: 0, missing: 5 })
	assert.ok(s.patterns.every((p) => p.status === 'no_evidence'))
})

test('syntax-error attempts and unanalyzable markers are unanalyzable, and break no comparison they are not part of', () => {
	const s = seq(
		att('a1', 0, 'fail', NESTED),
		att('a2', 1, 'fail', null, {
			status: 'syntax_error',
			testsPassed: 0,
			testsTotal: 0,
			failedTestIds: []
		}),
		att('a3', 2, 'fail', MARKER),
		att('a4', 3, 'fail', HASHMAP)
	)
	assert.deepEqual(
		s.items.map((i) => i.codeStatus),
		['features', 'unanalyzable', 'unanalyzable', 'features']
	)
	assert.deepEqual(
		s.items.map((i) => i.runStatus),
		['completed', 'syntax_error', 'completed', 'completed']
	)
	assert.deepEqual(s.coverage, { attempts: 4, withFeatures: 2, unanalyzable: 2, missing: 0 })
	assert.deepEqual(s.transitions, [])
	// A marker is "no fingerprint" to the pattern logic, exactly like a missing one.
	assert.equal(pattern(s, 'nested_loops').of, 2)
	assert.deepEqual(s.contradictions, [])
})

test('a syntax error is not a contradiction, but a "passed" syntax error is', () => {
	const broken = att('a1', 0, 'fail', null, {
		status: 'syntax_error',
		testsPassed: 0,
		testsTotal: 0,
		failedTestIds: []
	})
	assert.deepEqual(seq(broken).contradictions, [])
	const records = evidenceRecords([broken])
	const first = records[0]
	assert.ok(first)
	const lying = analyzeSolutionEvolution('two-sum', [{ ...first, allPassed: true }])
	assert.deepEqual(
		lying.contradictions.map((c) => [c.kind, c.attemptIds]),
		[['inconsistent_attempt_record', ['a1']]]
	)
})

test('records that contradict themselves are flagged', () => {
	const [pass, fail] = evidenceRecords([att('p', 0, 'pass'), att('f', 1, 'fail')])
	assert.ok(pass && fail)
	const passedButTestFailed = { ...pass, failedTestIds: ['t1'] }
	const passedButShort = {
		...pass,
		id: 'p2',
		createdAt: new Date(pass.createdAt.getTime() + 1),
		testsPassed: 2
	}
	const failedButAllPassed = { ...fail, failedTestIds: [], testsPassed: 3 }
	const s = analyzeSolutionEvolution('two-sum', [
		passedButTestFailed,
		passedButShort,
		failedButAllPassed
	])
	assert.deepEqual(s.contradictions.map((c) => c.attemptIds[0]).sort(), ['f', 'p', 'p2'])
	assert.ok(s.contradictions.every((c) => c.kind === 'inconsistent_attempt_record'))
})

test('identical timestamps tie-break by id, whatever order the records arrive in', () => {
	const specs = ['c', 'a', 'b'].map((id) => att(id, 5, 'fail', NESTED))
	const permutations = [
		[0, 1, 2],
		[0, 2, 1],
		[1, 0, 2],
		[1, 2, 0],
		[2, 0, 1],
		[2, 1, 0]
	]
	const results = permutations.map((p) => seq(...p.map((i) => specs[i] as ReturnType<typeof att>)))
	for (const r of results) assert.deepEqual(r, results[0])
	assert.deepEqual(
		results[0]?.items.map((i) => i.attemptId),
		['a', 'b', 'c']
	)
	assert.deepEqual(
		results[0]?.items.map((i) => i.order),
		[1, 2, 3]
	)
})

test('only the latest five attempts are kept, oldest first; a repeated id is counted once', () => {
	assert.equal(EVOLUTION_WINDOW, 5)
	const many = Array.from({ length: 8 }, (_, i) =>
		att(`a${i + 1}`, i, i === 7 ? 'pass' : 'fail', NESTED)
	)
	const s = seq(...many)
	assert.deepEqual(
		s.items.map((i) => i.attemptId),
		['a4', 'a5', 'a6', 'a7', 'a8']
	)
	assert.deepEqual(
		s.items.map((i) => i.order),
		[1, 2, 3, 4, 5]
	)
	assert.equal(s.windowSize, 5)
	const dup = seq(
		att('d1', 0, 'fail', NESTED),
		att('d1', 0, 'fail', NESTED),
		att('d2', 1, 'fail', NESTED)
	)
	assert.deepEqual(
		dup.items.map((i) => i.attemptId),
		['d1', 'd2']
	)
	assert.equal(analyzeSolutionEvolution('two-sum', evidenceRecords(many), 3).items.length, 3)
})

test('an unrecognised run status is `other`, and failed test ids are sorted and unique', () => {
	const s = seq(
		att('a1', 0, 'fail', NESTED, { status: 'exploded', failedTestIds: ['t3', 't2', 't3'] })
	)
	assert.equal(s.items[0]?.runStatus, 'other')
	assert.deepEqual(s.items[0]?.failedTestIds, ['t2', 't3'])
})

test('records are grouped by problem and the sequences come out sorted by slug', () => {
	const sequences = buildAttemptSequences(
		evidenceRecords([
			att('z1', 0, 'fail', NESTED, { slug: 'two-sum' }),
			att('c1', 1, 'fail', SET_BASED, { slug: 'contains-duplicate' }),
			att('z2', 2, 'pass', HASHMAP, { slug: 'two-sum' })
		])
	)
	assert.deepEqual(
		sequences.map((s) => [s.problemSlug, s.items.length]),
		[
			['contains-duplicate', 1],
			['two-sum', 2]
		]
	)
})

test('the sequence carries no source text and makes no complexity, correctness or mastery claim', () => {
	const s = seq(att('a1', 0, 'fail', NESTED), att('a2', 1, 'pass', HASHMAP))
	const text = JSON.stringify(s)
	assert.doesNotMatch(
		text,
		/mastery|mastered|complexity|faster|slower|better|worse|optimal|efficien|improv|understand|correct|skill|score/i
	)
	for (const change of STRUCTURAL_CHANGES)
		assert.match(change, /^[a-z_]+_(added|removed|introduced|increased|decreased)$/)
	assert.ok(!('source' in (s.items[0] ?? {})))
})
