import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROBLEMS } from './problems'
import { problemDefinitionSchema } from './problem'
import { REFERENCE_SOLUTIONS } from './reference-solutions'
import { ORACLES } from './oracles.mts'
import { buildRunRequest } from './grading'
import { pythonAvailable, runInPython, runInPyodide } from './engine-python.mts'

const NEW_SLUGS = ['valid-anagram', 'move-zeroes', 'binary-search', 'valid-parentheses'] as const
const RUN_LIMITS = { timeoutMs: 5000 }
const havePython = pythonAvailable()

test('catalog: six problems, unique slugs, every definition valid', () => {
	const problems = Object.values(PROBLEMS)
	assert.equal(problems.length, 6)
	assert.deepEqual(Object.keys(PROBLEMS).sort(), [
		'binary-search',
		'contains-duplicate',
		'move-zeroes',
		'two-sum',
		'valid-anagram',
		'valid-parentheses'
	])
	for (const [key, problem] of Object.entries(PROBLEMS)) {
		assert.equal(problem.slug, key, `${key}: record key matches slug`)
		problemDefinitionSchema.parse(problem)
		assert.match(problem.slug, /^[a-z]+(-[a-z]+)*$/)
		assert.ok(problem.conceptTags.length >= 1)
		for (const tag of problem.conceptTags) assert.match(tag, /^[a-z]+(-[a-z]+)*$/, `${key} tag`)
		const ids = problem.tests.map((t) => t.id)
		assert.equal(new Set(ids).size, ids.length, `${key}: unique test ids`)
		for (const t of problem.tests) {
			assert.equal(t.args.length, problem.params.length, `${key}/${t.id}: arity`)
		}
		assert.ok(
			problem.starter.includes(`def ${problem.entry}(`),
			`${key}: starter defines the entry`
		)
	}
})

test('new problems carry difficulty, tags, strategies and full hint ladders', () => {
	for (const slug of NEW_SLUGS) {
		const p = PROBLEMS[slug]!
		assert.ok(['easy', 'medium', 'hard'].includes(p.difficulty), `${slug}: difficulty`)
		assert.ok(p.knownStrategies != null && p.knownStrategies.length >= 2, `${slug}: strategies`)
		assert.ok(
			p.correctnessHints?.every((h) => h.length > 20),
			`${slug}: correctness hints`
		)
		assert.ok(
			p.optimization?.hints.every((h) => h.length > 20),
			`${slug}: optimization hints`
		)
		assert.ok(p.tests.length >= 15, `${slug}: breadth of tests`)
	}
})

test('examples in the statement are also official tests', () => {
	for (const slug of NEW_SLUGS) {
		const p = PROBLEMS[slug]!
		for (const ex of p.examples) {
			const hit = p.tests.find((t) => JSON.stringify(t.args) === JSON.stringify(ex.args))
			assert.ok(hit, `${slug}: example ${JSON.stringify(ex.args)} is a test`)
			assert.deepEqual(hit.expected, ex.output, `${slug}: example output matches`)
		}
	}
})

test('every official input stays inside the problem’s stated constraints', () => {
	const MAX_INT = 2 ** 31 - 1
	for (const t of PROBLEMS['valid-anagram']!.tests) {
		for (const s of t.args as string[]) {
			assert.ok(s.length >= 1 && s.length <= 50_000, `${t.id} length`)
			assert.match(s, /^[a-z]+$/)
		}
	}
	for (const t of PROBLEMS['move-zeroes']!.tests) {
		const nums = t.args[0] as number[]
		assert.ok(nums.length >= 1 && nums.length <= 10_000, `${t.id} length`)
		assert.ok(nums.every((x) => Number.isInteger(x) && x >= -(2 ** 31) && x <= MAX_INT))
	}
	for (const t of PROBLEMS['binary-search']!.tests) {
		const [nums, target] = t.args as [number[], number]
		assert.ok(nums.length >= 1 && nums.length <= 10_000, `${t.id} length`)
		assert.ok(
			nums.every((x) => x > -10_000 && x < 10_000),
			`${t.id} range`
		)
		assert.ok(target > -10_000 && target < 10_000, `${t.id} target range`)
		for (let i = 1; i < nums.length; i++) {
			assert.ok(nums[i]! > nums[i - 1]!, `${t.id}: strictly ascending (sorted, unique)`)
		}
	}
	for (const t of PROBLEMS['valid-parentheses']!.tests) {
		const s = t.args[0] as string
		assert.ok(s.length >= 1 && s.length <= 10_000, `${t.id} length`)
		assert.match(s, /^[()[\]{}]+$/)
	}
})

test('every expected value agrees with the independent oracle', () => {
	for (const slug of NEW_SLUGS) {
		for (const t of PROBLEMS[slug]!.tests) {
			assert.deepEqual(t.expected, ORACLES[slug]!(t.args), `${slug}/${t.id}`)
		}
	}
})

test('suites mix outcomes and exercise their required categories', () => {
	const verdicts = (slug: string) => PROBLEMS[slug]!.tests.map((t) => t.expected)
	for (const slug of ['valid-anagram', 'valid-parentheses']) {
		assert.ok(verdicts(slug).includes(true) && verdicts(slug).includes(false), slug)
	}
	const search = PROBLEMS['binary-search']!.tests
	assert.ok(
		search.some((t) => t.expected === -1),
		'absent targets'
	)
	assert.ok(
		search.some((t) => t.expected === 0),
		'first position'
	)
	assert.ok(
		search.some((t) => t.expected === (t.args[0] as number[]).length - 1),
		'last position'
	)
	assert.ok(
		search.some((t) => (t.args[0] as number[]).length === 1),
		'single element'
	)
	const zeroes = PROBLEMS['move-zeroes']!.tests
	assert.ok(
		zeroes.some((t) => (t.args[0] as number[]).every((x) => x === 0)),
		'all zero'
	)
	assert.ok(
		zeroes.some((t) => (t.args[0] as number[]).every((x) => x !== 0)),
		'no zeros'
	)
	assert.ok(
		zeroes.some((t) => JSON.stringify(t.args[0]) === JSON.stringify(t.expected)),
		'already laid out'
	)
})

test(
	'reference solutions: every compliant variant passes every official test (CPython)',
	{
		skip: !havePython && 'python3 not available'
	},
	() => {
		for (const slug of NEW_SLUGS) {
			const problem = PROBLEMS[slug]!
			assert.ok(REFERENCE_SOLUTIONS[slug]!.some((s) => s.kind === 'straightforward'))
			assert.ok(REFERENCE_SOLUTIONS[slug]!.some((s) => s.kind === 'optimized'))
			for (const solution of REFERENCE_SOLUTIONS[slug]!) {
				const result = runInPython(buildRunRequest(problem, solution.source, RUN_LIMITS))
				assert.equal(result.status, 'completed', `${slug}/${solution.name}`)
				const failed = result.tests.filter((t) => !t.passed).map((t) => t.testId)
				if (solution.passes) assert.deepEqual(failed, [], `${slug}/${solution.name}`)
				else assert.ok(failed.length > 0, `${slug}/${solution.name} must be rejected`)
			}
		}
	}
)

test('reference solutions pass through the real Pyodide runtime too', async () => {
	// Pyodide's one-off cold start isn't a solution's cost; pay it before any timer starts.
	const warm = PROBLEMS[NEW_SLUGS[0]!]!
	await runInPyodide(
		buildRunRequest(warm, REFERENCE_SOLUTIONS[NEW_SLUGS[0]!]![0]!.source, RUN_LIMITS)
	)
	for (const slug of NEW_SLUGS) {
		const problem = PROBLEMS[slug]!
		for (const solution of REFERENCE_SOLUTIONS[slug]!) {
			const started = Date.now()
			const result = await runInPyodide(buildRunRequest(problem, solution.source, RUN_LIMITS))
			const elapsed = Date.now() - started
			const failed = result.tests.filter((t) => !t.passed).map((t) => t.testId)
			assert.equal(result.status, 'completed', `${slug}/${solution.name}`)
			if (solution.passes) assert.deepEqual(failed, [], `${slug}/${solution.name}`)
			else assert.ok(failed.length > 0)
			assert.ok(
				elapsed < 4000,
				`${slug}/${solution.name}: ${elapsed}ms leaves headroom under the 5 s budget`
			)
		}
	}
})
