import test from 'node:test'
import assert from 'node:assert/strict'
import {
	buildExamAssessmentPrompt,
	guardExamAssessment,
	ignoresInputs,
	presentCategories,
	type AssessmentEvidence,
	type ExamAssessment
} from './assessment-guard.ts'
import { emptyFailureCounts } from './failures.ts'
import { applyPolicyV1 } from './integrity-policy.ts'

// specs/features/daily-exam.md AC28, AC28a.

const OPEN = new Date('2026-12-01T15:00:00.000Z')
const CLOSE = new Date('2026-12-01T15:30:00.000Z')
const at = (s: number) => new Date(OPEN.getTime() + s * 1000)

function evidence(
	over: Partial<AssessmentEvidence> = {},
	events: Parameters<typeof applyPolicyV1>[0]['events'] = []
): AssessmentEvidence {
	const policy = applyPolicyV1({ events, admittedAt: OPEN, closesAt: CLOSE })
	return {
		problem: {
			title: 'Synthetic',
			statement: ['Synthetic fixture.'],
			entry: 'solve',
			params: ['nums']
		},
		source: 'def solve(nums):\n    return sorted(nums)\n',
		tests: { passed: 10, total: 13, failures: { ...emptyFailureCounts(), wrong_answer: 3 } },
		time: {
			opensAt: OPEN.toISOString(),
			admittedAt: OPEN.toISOString(),
			submittedAt: at(600).toISOString(),
			submissionKind: 'manual',
			elapsedSeconds: 600,
			remainingSeconds: 1200
		},
		integrity: {
			summary: policy.summary,
			deductions: policy.deductions,
			totalDeduction: policy.totalDeduction
		},
		ignoresInputs: false,
		...over
	}
}

const s = (tag: 'fact' | 'estimate' | 'unverified', text: string) => ({ tag, text })
function output(over: Partial<ExamAssessment> = {}): ExamAssessment {
	return {
		overall: [s('estimate', 'The approach sorts the list and reads the answer from the ends.')],
		correctnessGaps: [s('fact', '3 of 13 hidden tests gave a wrong answer.')],
		efficiency: {
			timeComplexity: 'O(n log n)',
			spaceComplexity: 'O(n)',
			level: 'efficient',
			notes: [s('estimate', 'Sorting dominates; a single pass could avoid it.')]
		},
		timeManagement: [s('fact', 'Submitted after 10 minutes, with 20 minutes remaining.')],
		integrityObservations: [
			{ category: 'none', tag: 'fact', text: 'No integrity events were recorded.' }
		],
		deductionExplanation: [s('fact', 'No deductions were applied.')],
		recommendations: [s('estimate', 'Practise edge cases with duplicate values.')],
		summary: 'A mostly correct, efficient solution that misses some duplicate-value cases.',
		...over
	}
}

test('a well-formed, honest assessment passes', () => {
	assert.equal(guardExamAssessment(output(), evidence()).ok, true)
})

test('every statement must carry a fact/estimate/unverified tag (schema)', () => {
	const bad = { ...output(), overall: [{ text: 'untagged statement here' }] }
	assert.deepEqual(guardExamAssessment(bad, evidence()), { ok: false, reason: 'schema' })
	const intent = output({
		integrityObservations: [
			{ category: 'none', tag: 'estimate' as 'fact', text: 'Probably fine overall.' }
		]
	})
	assert.deepEqual(guardExamAssessment(intent, evidence()), { ok: false, reason: 'schema' })
})

test('integrity statements may only name categories that were actually recorded', () => {
	const invented = output({
		integrityObservations: [
			{ category: 'tab_hidden', tag: 'fact', text: 'The learner left the tab twice.' }
		]
	})
	assert.deepEqual(guardExamAssessment(invented, evidence()), {
		ok: false,
		reason: 'absent_integrity_category'
	})
	const withHide = evidence({}, [
		{ type: 'tab_hidden', receivedAt: at(100) },
		{ type: 'tab_visible', receivedAt: at(110) }
	])
	const honest = output({
		integrityObservations: [
			{
				category: 'tab_hidden',
				tag: 'fact',
				text: 'The exam tab was hidden once, for about 10 seconds.'
			},
			{
				category: 'tab_hidden',
				tag: 'unverified',
				text: 'This cannot show what happened while it was hidden.'
			}
		]
	})
	assert.equal(guardExamAssessment(honest, withHide).ok, true)
})

test('no accusation, no invented screenshot, no certainty', () => {
	const shortcut = evidence({}, [{ type: 'screenshot_shortcut_observed', receivedAt: at(50) }])
	const allowed = output({
		integrityObservations: [
			{
				category: 'screenshot_shortcut',
				tag: 'fact',
				text: 'A possible screenshot shortcut was observed once.'
			}
		]
	})
	assert.equal(guardExamAssessment(allowed, shortcut).ok, true)
	const claims: [string, string][] = [
		['The learner took a screenshot of the problem.', 'screenshot_claim'],
		['The tab switches suggest the learner was cheating.', 'misconduct_claim'],
		['Someone else helped with the loop.', 'misconduct_claim'],
		['This proves the solution is optimal.', 'certainty']
	]
	for (const [textValue, reason] of claims) {
		const bad = output({ summary: `${textValue} Overall a fair attempt.` })
		assert.deepEqual(guardExamAssessment(bad, shortcut), { ok: false, reason }, textValue)
	}
})

test('ordinary learning language is not mistaken for an accusation', () => {
	const fine = output({
		efficiency: {
			...output().efficiency,
			notes: [s('estimate', 'The loop copied the list on every pass, which costs O(n) each time.')]
		}
	})
	assert.equal(guardExamAssessment(fine, evidence()).ok, true)
})

test('no code anywhere in the assessment', () => {
	const bad = output({ recommendations: [s('estimate', 'Try this: def solve(nums): return 0')] })
	assert.deepEqual(guardExamAssessment(bad, evidence()), { ok: false, reason: 'code' })
})

test('an input-ignoring submission must be called incomplete, never brute force', () => {
	const constant = evidence({ source: 'def solve(nums):\n    return False\n', ignoresInputs: true })
	const bruteForce = output({ efficiency: { ...output().efficiency, level: 'brute_force' } })
	assert.deepEqual(guardExamAssessment(bruteForce, constant), {
		ok: false,
		reason: 'incomplete_not_acknowledged'
	})
	const incomplete = output({ efficiency: { ...output().efficiency, level: 'incomplete' } })
	assert.equal(guardExamAssessment(incomplete, constant).ok, true)
})

test('a full pass that uses its inputs may not be called incomplete', () => {
	const full = evidence({ tests: { passed: 13, total: 13, failures: emptyFailureCounts() } })
	const bad = output({ efficiency: { ...output().efficiency, level: 'incomplete' } })
	assert.deepEqual(guardExamAssessment(bad, full), {
		ok: false,
		reason: 'full_pass_called_incomplete'
	})
})

test('the input-ignoring pre-check reads the entry body, ignoring comments and strings', () => {
	assert.equal(ignoresInputs('def solve(nums):\n    return False\n', 'solve', ['nums']), true)
	assert.equal(
		ignoresInputs('def solve(nums):\n    # nums is unused\n    return "nums"\n', 'solve', ['nums']),
		true
	)
	assert.equal(
		ignoresInputs('def solve(nums):\n    return len(nums) > 0\n', 'solve', ['nums']),
		false
	)
	assert.equal(
		ignoresInputs(
			'def helper(x):\n    return x\n\ndef solve(nums, k):\n    return helper(k)\n',
			'solve',
			['nums', 'k']
		),
		false
	)
	assert.equal(
		ignoresInputs('def other(nums):\n    return nums\n', 'solve', ['nums']),
		true,
		'no entry'
	)
})

test('present categories come from the recorded summary and the applied deductions', () => {
	const e = evidence({}, [
		{ type: 'window_blurred', receivedAt: at(5) },
		{ type: 'screens_unsupported', receivedAt: at(6) }
	])
	assert.deepEqual([...presentCategories(e.integrity.summary, e.integrity.deductions)].sort(), [
		'none',
		'screen_check_unavailable',
		'window_blur'
	])
})

test('the prompt carries all four evidence categories and never hidden cases', () => {
	const e = evidence({}, [{ type: 'paste_blocked', receivedAt: at(5) }])
	const { system, user } = buildExamAssessmentPrompt(e)
	const payload = JSON.parse(user) as Record<string, unknown>
	assert.deepEqual(Object.keys(payload).sort(), [
		'codeIgnoresInputs',
		'integrity',
		'problem',
		'submittedCode',
		'tests',
		'time'
	])
	assert.match(system, /never infer cheating/)
	assert.match(system, /possible screenshot shortcut/)
	assert.ok(!/hiddenCases|expected/.test(user))
})
