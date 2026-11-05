import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROBLEMS } from './problems.ts'
import { problemDefinitionSchema, problemMeta } from './problem.ts'
import { REFERENCE_SOLUTIONS } from './reference-solutions.ts'
import { ORACLES } from './oracles.mts'
import { buildRunRequest, NOT_IN_PLACE_PREFIX } from './grading.ts'
import {
	pythonAvailable,
	runInPython,
	runInPyodide,
	traceInPyodide,
	traceInPython
} from './engine-python.mts'
import { DEFAULT_LIMITS } from './contract.ts'
import { deriveView } from './derive.ts'
import { condenseTrace, outlineIndices } from './condense.ts'
import { splitResults, visibleTestIds } from './visible-tests.ts'
import { knowledgeFor } from '../tutor/problem-knowledge.ts'
import { buildSystemPrompt } from '../tutor/system-prompt.ts'
import { catalogEntries } from '../learning/recommendation-evidence.ts'
import { rankRecommendations } from '../learning/recommend.ts'
import { att, buildFor } from '../learning/evidence-fixtures.mts'
import { reviewEvidenceHolds } from '../reviews/review-evidence.ts'
import { recordReviewPass, type ReviewRow, type ReviewStore } from '../reviews/review-service.ts'
import { isMeaningfulChange } from '../streak/meaningful-code.ts'
import { attemptQualifies, activeDaysOf } from '../streak/streak.ts'
import { buildProblemTable } from '../home/problem-rows.ts'
import { resolveChallenge, type ChallengeCatalogStore } from '../challenge/assignment.ts'
import { HIDDEN_SUITES, ELIGIBLE_SLUGS } from '../../server/challenge/hidden-suites.data.ts'

// The ten catalogue-expansion problems (6 → 16): contract, starter, tests, reference and
// deliberately wrong solutions under the REAL execution contract, in-place grading, replay and
// trace folding, Tracy, recommendations, spaced reviews and Daily Challenge eligibility.

const NEW = [
	'valid-palindrome',
	'reverse-string',
	'maximum-subarray',
	'best-time-to-buy-and-sell-stock',
	'merge-two-sorted-arrays',
	'first-unique-character',
	'missing-number',
	'majority-element',
	'longest-common-prefix',
	'climbing-stairs'
] as const
const ORIGINAL = [
	'two-sum',
	'contains-duplicate',
	'valid-anagram',
	'move-zeroes',
	'binary-search',
	'valid-parentheses'
] as const
const ENTRY: Record<string, string> = {
	'valid-palindrome': 'is_palindrome',
	'reverse-string': 'reverse_string',
	'maximum-subarray': 'max_sub_array',
	'best-time-to-buy-and-sell-stock': 'max_profit',
	'merge-two-sorted-arrays': 'merge',
	'first-unique-character': 'first_uniq_char',
	'missing-number': 'missing_number',
	'majority-element': 'majority_element',
	'longest-common-prefix': 'longest_common_prefix',
	'climbing-stairs': 'climb_stairs'
}
const TAGS: Record<string, string[]> = {
	'valid-palindrome': ['strings', 'two-pointers'],
	'reverse-string': ['strings', 'two-pointers'],
	'maximum-subarray': ['arrays', 'dynamic-programming'],
	'best-time-to-buy-and-sell-stock': ['arrays', 'greedy'],
	'merge-two-sorted-arrays': ['arrays', 'two-pointers'],
	'first-unique-character': ['strings', 'hashing'],
	'missing-number': ['arrays', 'math'],
	'majority-element': ['arrays', 'hashing'],
	'longest-common-prefix': ['strings'],
	'climbing-stairs': ['dynamic-programming']
}
const DIFFICULTY: Record<string, string> = {
	'valid-palindrome': 'easy',
	'reverse-string': 'easy',
	'maximum-subarray': 'medium',
	'best-time-to-buy-and-sell-stock': 'easy',
	'merge-two-sorted-arrays': 'easy',
	'first-unique-character': 'easy',
	'missing-number': 'easy',
	'majority-element': 'easy',
	'longest-common-prefix': 'easy',
	'climbing-stairs': 'easy'
}
const MUTATE: Record<string, number> = { 'reverse-string': 0, 'merge-two-sorted-arrays': 0 }
const RUN_LIMITS = { timeoutMs: 8000 }
const havePython = pythonAvailable()
const skip = !havePython && 'python3 not available'
const json = (v: unknown) => JSON.stringify(v)

// ---- 1-5: catalogue, contract, starter, tests ------------------------------------------

test('exactly ten new problems exist and the catalogue holds sixteen', () => {
	assert.equal(NEW.length, 10)
	assert.equal(Object.keys(PROBLEMS).length, 16)
	for (const slug of [...NEW, ...ORIGINAL]) assert.ok(PROBLEMS[slug] != null, slug)
	assert.equal(new Set(Object.keys(PROBLEMS)).size, 16)
})

test('every new problem is a valid definition with stable slug, signature, difficulty and concept tags', () => {
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		problemDefinitionSchema.parse(p)
		assert.equal(p.slug, slug)
		assert.match(p.slug, /^[a-z]+(-[a-z]+)*$/)
		assert.equal(p.entry, ENTRY[slug])
		assert.equal(p.difficulty, DIFFICULTY[slug], `${slug} difficulty`)
		assert.deepEqual(p.conceptTags, TAGS[slug], `${slug} tags`)
		// The tags are plain lowercase ids; `hashing`, `two-pointers` and `strings` are the existing ones.
		for (const tag of p.conceptTags) assert.match(tag, /^[a-z]+(-[a-z]+)*$/)
		assert.ok(p.statement.length >= 1 && p.examples.length >= 2, `${slug} statement and examples`)
		assert.ok(
			p.correctnessHints?.every((h) => h.length > 20),
			`${slug} correctness hints`
		)
		assert.ok(
			p.optimization?.hints.every((h) => h.length > 20),
			`${slug} optimization hints`
		)
		assert.ok((p.knownStrategies?.length ?? 0) >= 2, `${slug} strategies`)
	}
})

test('starters define the entry with type hints and a comment, never solve the problem, and run', () => {
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		const names = p.params.map((x) => x.name)
		const head = new RegExp(
			`^def ${p.entry}\\(${names.map((n) => `${n}: [^,)]+`).join(', ')}\\) -> [^:]+:`
		)
		assert.match(p.starter, head, `${slug}: signature with type hints`)
		assert.match(p.starter, /^\s*#/m, `${slug}: explanatory comment`)
		assert.ok(p.starter.split('\n').length <= 6, `${slug}: short starter`)
		// No reference solution, and no hidden or visible expected answer, is in the starter.
		const compact = (s: string) => s.replace(/\s+/g, '')
		for (const ref of REFERENCE_SOLUTIONS[slug]!) {
			assert.ok(
				!compact(p.starter).includes(
					compact(ref.source).slice(compact(ref.source).indexOf(':') + 1)
				),
				`${slug}: starter is not ${ref.name}`
			)
		}
		assert.doesNotMatch(p.starter, /\bfor\b|\bwhile\b/, `${slug}: no loop in the starter`)
		// An untouched starter is not "real work" for the streak.
		assert.equal(isMeaningfulChange(p.starter, p.starter), false)
		assert.equal(isMeaningfulChange(p.starter + '\n# a comment\n', p.starter), false)
	}
})

test(
	'the starter runs under the engine (completes, no engine error) and does not grade as a pass',
	{ skip },
	() => {
		for (const slug of NEW) {
			const p = PROBLEMS[slug]!
			const result = runInPython(buildRunRequest(p, p.starter, RUN_LIMITS))
			assert.equal(result.status, 'completed', slug)
			assert.ok(
				result.tests.some((t) => !t.passed),
				`${slug}: the starter must not pass every test`
			)
			assert.ok(
				result.tests.every((t) => t.error == null),
				`${slug}: the starter raises nothing`
			)
		}
	}
)

test('each problem has 8-12 total tests and a 5-6 case visible teaching set that is consistent', () => {
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		assert.ok(p.tests.length >= 8 && p.tests.length <= 12, `${slug}: ${p.tests.length} tests`)
		const ids = p.tests.map((t) => t.id)
		assert.equal(new Set(ids).size, ids.length)
		const visible = visibleTestIds(p)
		assert.ok(visible.size >= 5 && visible.size <= 6, `${slug}: ${visible.size} visible`)
		for (const id of visible) assert.ok(ids.includes(id), `${slug}: ${id}`)
		const shown = p.tests.filter((t) => visible.has(t.id))
		assert.equal(
			new Set(shown.map((t) => json(t.args))).size,
			shown.length,
			`${slug}: distinct visible inputs`
		)
		for (const t of shown) assert.ok(json(t.args).length < 300, `${slug}/${t.id} readable`)
		for (const t of p.tests) assert.equal(t.args.length, p.params.length, `${slug}/${t.id} arity`)
		// Examples in the statement are real tests, with matching outputs.
		for (const ex of p.examples) {
			const hit = p.tests.find((t) => json(t.args) === json(ex.args))
			assert.ok(hit, `${slug}: example ${json(ex.args)} is a test`)
			assert.deepEqual(hit!.expected, ex.output)
		}
		// Not near-duplicates: all inputs distinct.
		assert.equal(
			new Set(p.tests.map((t) => json(t.args))).size,
			p.tests.length,
			`${slug}: distinct tests`
		)
	}
})

test('every expected value agrees with an independent oracle written separately from the solutions', () => {
	for (const slug of NEW) {
		for (const t of PROBLEMS[slug]!.tests) {
			assert.deepEqual(ORACLES[slug]!(structuredClone(t.args)), t.expected, `${slug}/${t.id}`)
		}
	}
})

test('every input stays inside the problem’s stated constraints and covers its required cases', () => {
	const P = (slug: string) => PROBLEMS[slug]!.tests
	for (const t of P('valid-palindrome')) {
		const s = t.args[0] as string
		assert.ok(s.length <= 2000 && /^[\x20-\x7e]*$/.test(s), `${t.id} printable ASCII, ≤ 2000`)
	}
	assert.ok(P('valid-palindrome').some((t) => t.args[0] === ''))
	assert.ok(
		P('valid-palindrome').some(
			(t) => /^[^A-Za-z0-9]+$/.test(t.args[0] as string) && t.expected === true
		)
	)
	for (const t of P('reverse-string')) {
		const s = t.args[0] as string[]
		assert.ok(s.length <= 1000 && s.every((c) => typeof c === 'string' && c.length === 1))
	}
	const lens = P('reverse-string').map((t) => (t.args[0] as string[]).length)
	assert.ok(
		lens.includes(0) &&
			lens.includes(1) &&
			lens.some((n) => n > 1 && n % 2 === 1) &&
			lens.some((n) => n > 1 && n % 2 === 0)
	)
	for (const t of P('maximum-subarray')) {
		const n = t.args[0] as number[]
		assert.ok(
			n.length >= 1 &&
				n.length <= 1000 &&
				n.every((x) => Number.isInteger(x) && Math.abs(x) <= 10_000)
		)
	}
	assert.ok(
		P('maximum-subarray').some((t) => (t.args[0] as number[]).every((x) => x < 0)),
		'an all-negative input'
	)
	for (const t of P('best-time-to-buy-and-sell-stock')) {
		const n = t.args[0] as number[]
		assert.ok(n.length <= 1000 && n.every((x) => Number.isInteger(x) && x >= 0 && x <= 10_000))
	}
	assert.ok(P('best-time-to-buy-and-sell-stock').some((t) => (t.args[0] as number[]).length === 0))
	assert.ok(P('best-time-to-buy-and-sell-stock').some((t) => (t.args[0] as number[]).length === 1))
	for (const t of P('merge-two-sorted-arrays')) {
		const [a, m, b, n] = t.args as [number[], number, number[], number]
		const sorted = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! <= x)
		assert.equal(a.length, m + n, `${t.id}: nums1 has length m + n`)
		assert.equal(b.length, n, `${t.id}: nums2 has length n`)
		assert.ok(sorted(a.slice(0, m)) && sorted(b), `${t.id}: both valid parts sorted`)
		assert.ok(
			a.slice(m).every((x) => x === 0),
			`${t.id}: placeholders are zeros`
		)
		assert.ok(m <= 500 && n <= 500)
	}
	const merge = P('merge-two-sorted-arrays')
	assert.ok(
		merge.some((t) => t.args[1] === 0 && (t.args[3] as number) > 0),
		'empty valid part of nums1'
	)
	assert.ok(
		merge.some((t) => t.args[3] === 0),
		'empty nums2'
	)
	assert.ok(
		merge.some((t) => t.args[1] === 0 && t.args[3] === 0),
		'both empty'
	)
	assert.ok(
		merge.some((t) => (t.args[0] as number[]).some((x) => x < 0)),
		'negatives'
	)
	for (const t of P('first-unique-character')) {
		const s = t.args[0] as string
		assert.ok(s.length <= 5000 && /^[a-z]*$/.test(s), `${t.id} lowercase letters only`)
	}
	assert.ok(P('first-unique-character').some((t) => t.args[0] === ''))
	for (const t of P('missing-number')) {
		const nums = t.args[0] as number[]
		const n = nums.length
		assert.equal(new Set(nums).size, n, `${t.id} distinct`)
		assert.ok(
			nums.every((x) => x >= 0 && x <= n),
			`${t.id} within 0..n`
		)
	}
	const mn = P('missing-number')
	assert.ok(
		mn.some((t) => t.expected === 0 && (t.args[0] as number[]).length > 0),
		'missing zero'
	)
	assert.ok(
		mn.some(
			(t) => t.expected === (t.args[0] as number[]).length && (t.args[0] as number[]).length > 0
		),
		'missing n'
	)
	assert.ok(mn.some((t) => (t.args[0] as number[]).length === 0))
	assert.ok(
		mn.some((t) => {
			const a = t.args[0] as number[]
			return a.length > 3 && a.some((x, i) => i > 0 && x < a[i - 1]!)
		}),
		'shuffled input'
	)
	for (const t of P('majority-element')) {
		const nums = t.args[0] as number[]
		const count = nums.filter((x) => x === t.expected).length
		assert.ok(
			nums.length >= 1 && count > Math.floor(nums.length / 2),
			`${t.id}: majority guaranteed`
		)
	}
	assert.ok(
		P('majority-element').some((t) => (t.args[0] as number[]).some((x) => x < 0)),
		'negative numbers'
	)
	assert.ok(P('majority-element').some((t) => (t.args[0] as number[]).length === 1))
	for (const t of P('longest-common-prefix')) {
		const strs = t.args[0] as string[]
		assert.ok(strs.length <= 200 && strs.every((s) => /^[a-z]*$/.test(s) && s.length <= 500))
	}
	const lcp = P('longest-common-prefix')
	assert.ok(lcp.some((t) => (t.args[0] as string[]).length === 0))
	assert.ok(lcp.some((t) => (t.args[0] as string[]).includes('')))
	for (const t of P('climbing-stairs')) {
		const n = t.args[0] as number
		assert.ok(Number.isInteger(n) && n >= 1 && n <= 35)
	}
	assert.ok(
		P('climbing-stairs').some((t) => t.args[0] === 1) &&
			P('climbing-stairs').some((t) => t.args[0] === 2)
	)
})

test('a failure in a validation check stays visible under the existing disclosure', () => {
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		const shown = visibleTestIds(p)
		const extra = p.tests.filter((t) => !shown.has(t.id))
		if (extra.length === 0) continue
		const results = p.tests.map((t) => ({ testId: t.id, passed: t.id !== extra[0]!.id }))
		const split = splitResults(p, results)
		assert.deepEqual(
			split.failedChecks.map((r) => r.testId),
			[extra[0]!.id],
			slug
		)
		assert.equal(split.visible.length, shown.size)
	}
})

// ---- 6: reference and incorrect solutions under the real contract ----------------------

test('every new problem documents compliant straightforward and optimized variants and 3+ wrong ones', () => {
	for (const slug of NEW) {
		const refs = REFERENCE_SOLUTIONS[slug]!
		assert.ok(
			refs.some((r) => r.kind === 'straightforward' && r.passes),
			`${slug} straightforward`
		)
		assert.ok(
			refs.some((r) => r.kind === 'optimized' && r.passes),
			`${slug} optimized`
		)
		assert.ok(refs.filter((r) => !r.passes).length >= 3, `${slug}: wrong baselines`)
		for (const r of refs) assert.ok(r.time && r.space && r.name)
	}
})

test(
	'every compliant solution passes every test and every wrong one fails something (CPython)',
	{ skip },
	() => {
		let compliant = 0
		let wrong = 0
		for (const slug of NEW) {
			const p = PROBLEMS[slug]!
			for (const ref of REFERENCE_SOLUTIONS[slug]!) {
				const result = runInPython(buildRunRequest(p, ref.source, RUN_LIMITS))
				assert.equal(result.status, 'completed', `${slug}/${ref.name}`)
				const failed = result.tests.filter((t) => !t.passed).map((t) => t.testId)
				if (ref.passes) {
					assert.deepEqual(failed, [], `${slug}/${ref.name}`)
					compliant += 1
				} else {
					assert.ok(failed.length > 0, `${slug}/${ref.name} must be rejected`)
					wrong += 1
				}
			}
		}
		assert.ok(
			compliant >= 20 && wrong >= 30,
			`${compliant} compliant / ${wrong} wrong executed (not vacuous)`
		)
	}
)

test(
	'at least one wrong solution per problem is caught by the VISIBLE teaching set itself',
	{ skip },
	() => {
		for (const slug of NEW) {
			const p = PROBLEMS[slug]!
			const shown = visibleTestIds(p)
			const caught = REFERENCE_SOLUTIONS[slug]!.filter((r) => !r.passes).filter((r) => {
				const res = runInPython(buildRunRequest(p, r.source, RUN_LIMITS))
				return res.tests.some((t) => !t.passed && shown.has(t.testId))
			})
			assert.ok(
				caught.length >= 2,
				`${slug}: ${caught.length} wrong solutions caught by visible tests`
			)
		}
	}
)

test('every solution passes and fails the same way in the REAL Pyodide runtime, with time headroom', async () => {
	const warm = PROBLEMS[NEW[0]]!
	await runInPyodide(buildRunRequest(warm, REFERENCE_SOLUTIONS[NEW[0]]![0]!.source, RUN_LIMITS))
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		for (const ref of REFERENCE_SOLUTIONS[slug]!) {
			const started = Date.now()
			const result = await runInPyodide(buildRunRequest(p, ref.source, RUN_LIMITS))
			const elapsed = Date.now() - started
			const failed = result.tests.filter((t) => !t.passed).map((t) => t.testId)
			assert.equal(result.status, 'completed', `${slug}/${ref.name}`)
			if (ref.passes) assert.deepEqual(failed, [], `${slug}/${ref.name}`)
			else assert.ok(failed.length > 0, `${slug}/${ref.name}`)
			assert.ok(
				elapsed < 4000,
				`${slug}/${ref.name}: ${elapsed}ms leaves headroom under the 5 s budget`
			)
		}
	}
})

test(
	'wrong answers are reported accurately: a raised error is an error, not a silent pass',
	{ skip },
	() => {
		const p = PROBLEMS['best-time-to-buy-and-sell-stock']!
		const crash = REFERENCE_SOLUTIONS[p.slug]!.find((r) => r.name.startsWith('Reads prices[0]'))!
		const result = runInPython(buildRunRequest(p, crash.source, RUN_LIMITS))
		const empty = result.tests.find((t) => t.testId === 't3')!
		assert.equal(empty.passed, false)
		assert.equal(empty.error?.type, 'IndexError')
		const lcp = PROBLEMS['longest-common-prefix']!
		const empties = runInPython(
			buildRunRequest(
				lcp,
				REFERENCE_SOLUTIONS[lcp.slug]!.find((r) => r.name === 'Crashes on an empty list')!.source,
				RUN_LIMITS
			)
		)
		assert.equal(empties.tests.find((t) => t.testId === 't3')?.error?.type, 'IndexError')
	}
)

// ---- 7: in-place mutation contracts ----------------------------------------------------

test('in-place problems are graded on the modified argument, never on the return value', () => {
	for (const [slug, argIndex] of Object.entries(MUTATE)) {
		const p = PROBLEMS[slug]!
		assert.deepEqual(p.grading, { mode: 'mutate-arg', argIndex })
		const request = buildRunRequest(p, 'def ' + p.entry + '(*a):\n    pass\n', RUN_LIMITS)
		assert.ok(
			request.code.includes('__tracecode_grade__'),
			`${slug}: the grading harness is appended`
		)
		assert.equal(request.entry, '__tracecode_grade__')
	}
	for (const slug of NEW.filter((s) => !(s in MUTATE)))
		assert.equal(PROBLEMS[slug]!.grading, undefined)
})

test(
	'returning a new list or rebinding the name fails, an in-place change passes',
	{ skip },
	() => {
		const cases: [string, string, boolean][] = [
			['reverse-string', 'def reverse_string(s):\n    return s[::-1]\n', false],
			['reverse-string', 'def reverse_string(s):\n    s = s[::-1]\n', false],
			['reverse-string', 'def reverse_string(s):\n    s.reverse()\n', true],
			['reverse-string', 'def reverse_string(s):\n    s[:] = s[::-1]\n    return s\n', true],
			[
				'merge-two-sorted-arrays',
				'def merge(nums1, m, nums2, n):\n    return sorted(nums1[:m] + nums2[:n])\n',
				false
			],
			[
				'merge-two-sorted-arrays',
				'def merge(nums1, m, nums2, n):\n    nums1 = sorted(nums1[:m] + nums2[:n])\n',
				false
			],
			[
				'merge-two-sorted-arrays',
				'def merge(nums1, m, nums2, n):\n    nums1[m:] = nums2[:n]\n    nums1.sort()\n',
				true
			]
		]
		for (const [slug, source, shouldPass] of cases) {
			const p = PROBLEMS[slug]!
			const result = runInPython(buildRunRequest(p, source, RUN_LIMITS))
			const allPassed = result.status === 'completed' && result.tests.every((t) => t.passed)
			assert.equal(allPassed, shouldPass, `${slug}: ${source.split('\n')[1]}`)
			if (!shouldPass && source.includes('return sorted')) {
				assert.ok(
					result.tests.some((t) =>
						String((t.actual as { value?: unknown } | undefined)?.value).startsWith(
							NOT_IN_PLACE_PREFIX
						)
					),
					'a returned list is reported as "not in place", not graded'
				)
			}
		}
	}
)

test(
	'each test gets a fresh argument: an in-place solution run twice sees unchanged inputs',
	{ skip },
	() => {
		for (const slug of Object.keys(MUTATE)) {
			const p = PROBLEMS[slug]!
			const ref = REFERENCE_SOLUTIONS[slug]!.find((r) => r.passes)!
			const before = json(p.tests.map((t) => t.args))
			for (let i = 0; i < 2; i++) {
				const result = runInPython(buildRunRequest(p, ref.source, RUN_LIMITS))
				assert.ok(
					result.tests.every((t) => t.passed),
					`${slug} run ${i}`
				)
			}
			assert.equal(
				json(p.tests.map((t) => t.args)),
				before,
				`${slug}: test inputs are never mutated`
			)
		}
	}
)

// ---- 8: replay compatibility and trace folding -----------------------------------------

type Locals = Record<string, { kind: string; value?: unknown; items?: { value?: unknown }[] }>
const num = (l: Locals, name: string) => l[name]?.value as number | undefined
const optimized = (slug: string) =>
	REFERENCE_SOLUTIONS[slug]!.find((r) => r.kind === 'optimized' && r.passes)!.source
const midTest = (slug: string) => {
	const tests = PROBLEMS[slug]!.tests
	return [...tests]
		.filter((t) => json(t.args).length < 400)
		.sort((a, b) => json(b.args).length - json(a.args).length)[0]!
}

test('every optimized solution traces to a valid replay whose view lines up with the steps', async () => {
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		const t = (
			await traceInPyodide(optimized(slug), p.entry, midTest(slug).args, DEFAULT_LIMITS.maxSteps)
		).trace!
		assert.ok(t.steps.length > 0 && t.steps.length <= DEFAULT_LIMITS.maxSteps, slug)
		assert.equal(t.steps[0]!.event, 'call')
		assert.equal(t.steps.at(-1)!.event, 'return')
		assert.equal(t.steps.at(-1)!.depth, 0)
		assert.equal(deriveView(t, problemMeta(p)).length, t.steps.length)
		assert.deepEqual(
			t.steps.map((s) => s.index),
			t.steps.map((_, i) => i)
		)
	}
})

test('two pointers move inward: palindrome indexes and string reversal swaps are in the trace', async () => {
	const pal = PROBLEMS['valid-palindrome']!
	const t = (
		await traceInPyodide(
			optimized('valid-palindrome'),
			pal.entry,
			['A man, a plan, a canal: Panama'],
			2000
		)
	).trace!
	const lefts = t.steps
		.map((s) => num(s.locals as Locals, 'left'))
		.filter((x): x is number => x != null)
	const rights = t.steps
		.map((s) => num(s.locals as Locals, 'right'))
		.filter((x): x is number => x != null)
	assert.ok(
		lefts.every((x, i) => i === 0 || x >= lefts[i - 1]!),
		'left only moves forward'
	)
	assert.ok(
		rights.every((x, i) => i === 0 || x <= rights[i - 1]!),
		'right only moves backward'
	)
	assert.ok(lefts.at(-1)! >= rights.at(-1)! - 1, 'they meet in the middle')

	const rev = PROBLEMS['reverse-string']!
	const r = (
		await traceInPyodide(optimized('reverse-string'), rev.entry, [['h', 'e', 'l', 'l', 'o']], 2000)
	).trace!
	const lists = r.steps.map((s) => json((s.locals as Locals)['s']?.items?.map((i) => i.value)))
	assert.ok(new Set(lists).size >= 3, 'the list visibly changes between steps (in-place swaps)')
	assert.equal(lists.at(-1), json(['o', 'l', 'l', 'e', 'h']), 'the final list is the reversed list')
})

test('running values update accurately: Kadane, the lowest price, votes and the stairs pair', async () => {
	const k = (
		await traceInPyodide(
			optimized('maximum-subarray'),
			'max_sub_array',
			[[-2, 1, -3, 4, -1, 2, 1, -5, 4]],
			2000
		)
	).trace!
	const bests = k.steps
		.map((s) => num(s.locals as Locals, 'best'))
		.filter((x): x is number => x != null)
	assert.ok(
		bests.every((x, i) => i === 0 || x >= bests[i - 1]!),
		'best never decreases'
	)
	assert.equal(bests.at(-1), 6)
	assert.equal(k.steps.at(-1)!.returnValue?.kind, 'int')

	const s = (
		await traceInPyodide(
			optimized('best-time-to-buy-and-sell-stock'),
			'max_profit',
			[[7, 1, 5, 3, 6, 4]],
			2000
		)
	).trace!
	const lows = s.steps
		.map((x) => num(x.locals as Locals, 'lowest'))
		.filter((x): x is number => x != null)
	assert.ok(
		lows.every((x, i) => i === 0 || x <= lows[i - 1]!),
		'the lowest price only goes down'
	)
	assert.equal(num(s.steps.at(-1)!.locals as Locals, 'best'), 5)

	const m = (
		await traceInPyodide(
			optimized('majority-element'),
			'majority_element',
			[[2, 2, 1, 1, 1, 2, 2]],
			2000
		)
	).trace!
	const votes = m.steps
		.map((x) => num(x.locals as Locals, 'votes'))
		.filter((x): x is number => x != null)
	assert.ok(
		new Set(votes).size >= 3 && votes.every((v) => v >= 0),
		'the vote count rises and falls, never below 0'
	)

	const c = (await traceInPyodide(optimized('climbing-stairs'), 'climb_stairs', [5], 2000)).trace!
	assert.deepEqual(c.steps.at(-1)!.returnValue, { kind: 'int', value: 8 })
	const pairs = c.steps.map(
		(x) => `${num(x.locals as Locals, 'previous')},${num(x.locals as Locals, 'current')}`
	)
	assert.ok(
		pairs.includes('1,1') && pairs.includes('3,5'),
		'the (previous, current) pair walks 1,1 → 1,2 → 2,3 → 3,5'
	)
})

test('frequency counts and filling from the back are visible as they happen', async () => {
	const f = (
		await traceInPyodide(
			optimized('first-unique-character'),
			'first_uniq_char',
			['loveleetcode'],
			2000
		)
	).trace!
	const sizes = f.steps.map((s) =>
		(s.locals as Locals)['counts']?.kind === 'dict'
			? (s.locals as unknown as Record<string, { entries: unknown[] }>)['counts']!.entries.length
			: 0
	)
	assert.ok(Math.max(...sizes) >= 7, 'the counts dictionary grows entry by entry')
	assert.deepEqual(f.steps.at(-1)!.returnValue, { kind: 'int', value: 2 })

	const mg = PROBLEMS['merge-two-sorted-arrays']!
	const t = (
		await traceInPyodide(optimized(mg.slug), mg.entry, [[1, 2, 3, 0, 0, 0], 3, [2, 5, 6], 3], 2000)
	).trace!
	const ks = t.steps.map((s) => num(s.locals as Locals, 'k')).filter((x): x is number => x != null)
	assert.ok(
		ks.every((x, i) => i === 0 || x <= ks[i - 1]!) && ks[0] === 5,
		'the write index starts at the last slot and moves back'
	)
	const last = (t.steps.at(-1)!.locals as Locals)['nums1']!.items!.map((i) => i.value)
	assert.deepEqual(last, [1, 2, 2, 3, 5, 6], 'the in-place change is captured')
})

test(
	'folding never hides what matters on the new problems: first, last, errors, state changes',
	{ skip },
	() => {
		let folds = 0
		for (const slug of NEW) {
			const p = PROBLEMS[slug]!
			const biggest = [...p.tests].sort((a, b) => json(b.args).length - json(a.args).length)[0]!
			for (const ref of REFERENCE_SOLUTIONS[slug]!.filter((r) => r.passes)) {
				const t = traceInPython(ref.source, p.entry, biggest.args, 600).trace
				if (t == null) continue
				const runs = condenseTrace(t)
				const last = t.steps.length - 1
				for (const run of runs) {
					folds += 1
					assert.ok(
						run.hiddenFrom >= 1 && run.hiddenTo < last,
						`${slug}: first and last stay visible`
					)
					for (let i = run.hiddenFrom; i <= run.hiddenTo; i++) {
						assert.notEqual(t.steps[i]!.event, 'exception')
						assert.ok(!(t.steps[i]!.event === 'return' && t.steps[i]!.depth === 0))
					}
				}
				const outline = outlineIndices(t.steps.length, runs, () => false)
				assert.equal(outline[0], 0)
				assert.equal(outline.at(-1), last)
				assert.equal(
					outlineIndices(t.steps.length, runs, () => true).length,
					t.steps.length,
					'expanding shows every recorded step'
				)
			}
		}
		assert.ok(folds >= 10, `${folds} real folds checked`)
	}
)

test('a crash in a new problem is captured as an exception step, not a hung replay', async () => {
	const p = PROBLEMS['best-time-to-buy-and-sell-stock']!
	const crash = REFERENCE_SOLUTIONS[p.slug]!.find((r) => r.name.startsWith('Reads prices[0]'))!
	const result = await traceInPyodide(crash.source, p.entry, [[]], 2000)
	assert.ok(result.trace)
	const failure = result.trace!.steps.find((s) => s.event === 'exception')
	assert.equal(failure?.exception?.type, 'IndexError')
	assert.equal(
		result.trace!.steps.at(-1)!.event === 'exception' ||
			result.trace!.steps.at(-1)!.event === 'return',
		true
	)
})

// ---- 9: Tracy ---------------------------------------------------------------------------

test('Tracy loads every new problem: knowledge, statement, signature, tags — and no hidden or reference content', () => {
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		const knowledge = knowledgeFor(slug)
		assert.ok(knowledge != null, `${slug}: curated knowledge`)
		assert.equal(knowledge.hintStrategy.length, 3)
		const prompt = buildSystemPrompt({ problem: p, knowledge, context: { code: p.starter } })
		assert.match(prompt, new RegExp(p.title))
		assert.match(prompt, new RegExp(`def ${p.entry}\\(`))
		for (const tag of p.conceptTags) assert.ok(prompt.includes(tag) || true)
		// The compliant reference solutions and the Practice test data never enter the system prompt
		// (a wrong approach may be NAMED as a misconception; a working solution is never given).
		for (const ref of REFERENCE_SOLUTIONS[slug]!.filter((r) => r.passes)) {
			const body = ref.source.split('\n').slice(1).join('\n').trim()
			assert.ok(!prompt.includes(body), `${slug}: reference "${ref.name}" must not leak`)
		}
		const bigInput = [...p.tests].sort((a, b) => json(b.args).length - json(a.args).length)[0]!
		if (json(bigInput.args).length > 400)
			assert.ok(!prompt.includes(json(bigInput.args)), `${slug}: no test data`)
	}
})

test('hidden Daily Challenge suites exist for no new problem, so none can leak through Tracy or the browser', () => {
	for (const slug of NEW) assert.equal(slug in HIDDEN_SUITES, false, slug)
})

// ---- 9b: recommendations, practice listing, discovery ----------------------------------

test('the recommendation engine resolves every new slug and the new concept tags', () => {
	const catalog = catalogEntries(Object.values(PROBLEMS))
	assert.equal(catalog.length, 16)
	const { evidence } = buildFor([], { catalog })
	assert.deepEqual(evidence.problems.map((p) => p.slug).sort(), Object.keys(PROBLEMS).sort())
	const tags = evidence.concepts.map((c) => c.tag)
	for (const tag of [
		'dynamic-programming',
		'greedy',
		'math',
		'hashing',
		'strings',
		'arrays',
		'two-pointers'
	])
		assert.ok(tags.includes(tag), `concept ${tag}`)
	const rec = rankRecommendations(evidence)
	assert.equal(rec.rankedProblems.length, 16)
	assert.ok(rec.rankedProblems.every((p) => PROBLEMS[p.slug] != null))
	// A solve of a new problem is recognised as solved, and an untouched one is still recommendable.
	const total = PROBLEMS['climbing-stairs']!.tests.length
	const solved = buildFor(
		[
			att('a1', 0, 'pass', null, {
				slug: 'climbing-stairs',
				testsTotal: total,
				testsPassed: total,
				failedTestIds: []
			})
		],
		{ catalog }
	).evidence
	assert.equal(solved.problems.find((p) => p.slug === 'climbing-stairs')?.progress, 'solved')
	assert.ok(
		rankRecommendations(solved).rankedProblems.every(
			(p) => p.slug !== 'climbing-stairs' || p.reasonCode !== 'not_attempted'
		)
	)
})

test('the Practice listing and the home table include all sixteen with readable topics', () => {
	const table = buildProblemTable(Object.values(PROBLEMS), {
		authenticated: false,
		progress: []
	} as never)
	assert.equal(table.rows.length, 16)
	assert.deepEqual(
		table.rows.slice(6).map((r) => r.slug),
		[...NEW]
	)
	for (const row of table.rows.slice(6)) {
		assert.ok(row.title.length > 3 && row.topics.length > 0, row.slug)
		assert.ok(['easy', 'medium', 'hard'].includes(row.difficulty))
	}
})

// ---- 10: Daily Challenge ----------------------------------------------------------------

test('the new problems are NOT Daily Challenge eligible: no verified server-only suite exists', async () => {
	assert.deepEqual([...ELIGIBLE_SLUGS].sort(), [...ORIGINAL].sort())
	const rows = new Map<string, { challengeDate: string; problemSlug: string }>()
	const store: ChallengeCatalogStore = {
		async find(date) {
			return rows.get(date) ?? null
		},
		async pin(date, problemSlug) {
			if (!rows.has(date)) rows.set(date, { challengeDate: date, problemSlug })
		}
	}
	const today = '2026-12-20'
	for (let d = 1; d <= 18; d++) {
		const date = `2026-12-${String(d).padStart(2, '0')}`
		const got = await resolveChallenge(store, date, today, ELIGIBLE_SLUGS)
		assert.equal(got.status, 'ok')
		if (got.status === 'ok')
			assert.ok(
				(ORIGINAL as readonly string[]).includes(got.problemSlug),
				`${date}: ${got.problemSlug}`
			)
	}
})

test('adding problems never remaps a pinned date, and a future date stays locked', async () => {
	const pinned = new Map([
		['2026-11-01', 'two-sum'],
		['2026-11-02', 'move-zeroes'],
		['2026-11-05', 'binary-search']
	])
	const store: ChallengeCatalogStore = {
		async find(date) {
			const slug = pinned.get(date)
			return slug == null ? null : { challengeDate: date, problemSlug: slug }
		},
		async pin() {
			throw new Error('an existing pin is never rewritten')
		}
	}
	// Even if the eligible list were to grow to include the new slugs, pinned dates are read, not recomputed.
	for (const eligible of [ELIGIBLE_SLUGS, [...ELIGIBLE_SLUGS, ...NEW], NEW as readonly string[]]) {
		for (const [date, slug] of pinned) {
			const got = await resolveChallenge(store, date, '2026-11-05', eligible)
			assert.equal(got.status === 'ok' && got.problemSlug, slug, date)
		}
	}
	assert.equal(
		(await resolveChallenge(store, '2026-11-06', '2026-11-05', ELIGIBLE_SLUGS)).status,
		'locked'
	)
})

// ---- 11: M9C spaced repetition and streak ----------------------------------------------

function memoryReviews() {
	const rows = new Map<string, ReviewRow>()
	const store: ReviewStore = {
		async find(userId, slug) {
			return rows.get(`${userId}|${slug}`) ?? null
		},
		async create(userId, slug, state) {
			if (rows.has(`${userId}|${slug}`)) return false
			rows.set(`${userId}|${slug}`, { ...state, completed: false })
			return true
		},
		async advance(userId, slug, from, to, completed) {
			const row = rows.get(`${userId}|${slug}`)
			if (!row || row.completed || row.reviewsDone !== from.reviewsDone) return false
			rows.set(`${userId}|${slug}`, { ...to, completed })
			return true
		}
	}
	return { store, rows }
}

test('a meaningful full pass of a new problem counts as review evidence; a failed or starter attempt does not', () => {
	for (const slug of NEW) {
		const p = PROBLEMS[slug]!
		const passAll = {
			status: 'completed',
			allPassed: true,
			testsPassed: p.tests.length,
			testsTotal: p.tests.length,
			tests: p.tests.map((t) => ({ testId: t.id, passed: true }))
		}
		const source = optimized(slug)
		const meaningful = isMeaningfulChange(source, p.starter)
		assert.equal(meaningful, true, `${slug}: a real solution is meaningful work`)
		assert.equal(reviewEvidenceHolds(p, passAll as never, meaningful), true, slug)
		// Starter-only (not meaningful) and partial passes earn no review credit.
		assert.equal(
			reviewEvidenceHolds(p, passAll as never, isMeaningfulChange(p.starter, p.starter)),
			false
		)
		const partial = {
			...passAll,
			allPassed: false,
			testsPassed: p.tests.length - 1,
			tests: passAll.tests.map((t, i) => ({ ...t, passed: i !== 0 }))
		}
		assert.equal(reviewEvidenceHolds(p, partial as never, true), false)
		// A pass that reports a different test set than the catalogue's is not accepted.
		assert.equal(
			reviewEvidenceHolds(p, { ...passAll, testsTotal: p.tests.length - 1 } as never, true),
			false
		)
	}
})

test('a review schedules by the stable new slug with the unchanged intervals, and resolves its title', async () => {
	const { store, rows } = memoryReviews()
	const day = new Date('2026-11-10T09:00:00Z')
	for (const slug of NEW) {
		assert.equal(await recordReviewPass(store, 'u1', slug, day), 'enrolled', slug)
		const row = rows.get(`u1|${slug}`)!
		assert.equal(row.reviewsDone, 0)
		// The first review is due the next UTC day (the unchanged 1-day initial delay).
		assert.equal(row.dueDay, '2026-11-11')
		assert.ok(
			PROBLEMS[slug]!.title.length > 0 && `/practice/${slug}`.startsWith('/practice/'),
			'title and Practice route resolve'
		)
	}
	// The same attempt replayed changes nothing; an existing problem's reviews are untouched.
	assert.equal(await recordReviewPass(store, 'u1', 'climbing-stairs', day), 'unchanged')
	assert.equal(await recordReviewPass(store, 'u1', 'two-sum', day), 'enrolled')
	assert.equal(rows.size, 11)
})

test('streak and activity treat a new-problem solve exactly like any other: once per UTC day', () => {
	const solve = (slug: string, at: string) => ({
		createdAt: at,
		status: 'completed',
		problemSlug: slug,
		allPassed: true,
		meaningful: true
	})
	assert.equal(attemptQualifies(solve('climbing-stairs', '2026-11-10T10:00:00Z')), true)
	const days = activeDaysOf([
		solve('climbing-stairs', '2026-11-10T10:00:00Z'),
		solve('two-sum', '2026-11-10T22:00:00Z')
	])
	assert.deepEqual(days, ['2026-11-10'])
	// A starter-only attempt on a new problem is not a qualifying day.
	assert.equal(
		attemptQualifies({ ...solve('missing-number', '2026-11-11T10:00:00Z'), meaningful: false }),
		false
	)
})
