// The whole grading pipeline against REAL CPython: a test-only "sandbox" that writes the
// three files to a temp directory and runs the runner, then the hidden suites checked
// against the repo's verified reference solutions (including the deliberately wrong ones).
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	createSandboxGrader,
	type SandboxCreateOptions,
	type SandboxFactory,
	type SandboxLike
} from './sandbox-grader.ts'
import { HIDDEN_SUITES, ELIGIBLE_SLUGS } from '../../server/challenge/hidden-suites.data.ts'
import { PROBLEMS } from '../trace/problems.ts'
import { REFERENCE_SOLUTIONS, type ReferenceSolution } from '../trace/reference-solutions.ts'

const PYTHON = process.env.TRACECODE_PYTHON ?? 'python3'

function localSandbox(seen: {
	options?: SandboxCreateOptions
	files: Record<string, string>
}): SandboxFactory {
	return async (options) => {
		seen.options = options
		const dir = mkdtempSync(join(tmpdir(), 'tc-grade-'))
		const sandbox: SandboxLike = {
			async writeFiles(files) {
				for (const f of files) {
					writeFileSync(
						join(dir, f.path),
						typeof f.content === 'string' ? f.content : Buffer.from(f.content)
					)
					seen.files[f.path] = typeof f.content === 'string' ? f.content : ''
				}
			},
			async runCommand({ cmd, args, timeoutMs }) {
				const out = spawnSync(cmd === 'python3' ? PYTHON : cmd, args, {
					cwd: dir,
					encoding: 'utf8',
					timeout: timeoutMs,
					maxBuffer: 1 << 26
				})
				return { exitCode: out.status ?? 1, stdout: async () => out.stdout }
			},
			async stop() {
				rmSync(dir, { recursive: true, force: true })
			}
		}
		return sandbox
	}
}

// The repo's reference-solution fixture has none for these two problems, so without these
// their suites would never be executed end to end. Test-only; never shipped.
const py = (lines: string[]): string => lines.join('\n') + '\n'
const LOCAL_REFERENCES: Record<string, Pick<ReferenceSolution, 'name' | 'passes' | 'source'>[]> = {
	'two-sum': [
		{
			name: 'Hash map',
			passes: true,
			source: py([
				'def two_sum(nums, target):',
				'    seen = {}',
				'    for i, x in enumerate(nums):',
				'        if target - x in seen:',
				'            return [seen[target - x], i]',
				'        seen[x] = i'
			])
		},
		{
			name: 'Nested loops',
			passes: true,
			source: py([
				'def two_sum(nums, target):',
				'    for i in range(len(nums)):',
				'        for j in range(i + 1, len(nums)):',
				'            if nums[i] + nums[j] == target:',
				'                return [i, j]'
			])
		},
		{
			name: 'Reports the indices in decreasing order',
			passes: false,
			source: py([
				'def two_sum(nums, target):',
				'    for i in range(len(nums)):',
				'        for j in range(i):',
				'            if nums[i] + nums[j] == target:',
				'                return [i, j]'
			])
		},
		{
			name: 'Always the first two',
			passes: false,
			source: py(['def two_sum(nums, target):', '    return [0, 1]'])
		}
	],
	'valid-anagram': [
		{
			name: 'Only compares lengths',
			passes: false,
			source: py(['def is_anagram(s, t):', '    return len(s) == len(t)'])
		},
		{
			name: 'Compares letter sets, not counts',
			passes: false,
			source: py(['def is_anagram(s, t):', '    return set(s) == set(t)'])
		}
	],
	'binary-search': [
		{
			name: 'Returns 0 when absent',
			passes: false,
			source: py([
				'def search(nums, target):',
				'    return nums.index(target) if target in nums else 0'
			])
		},
		{
			name: 'Never looks at the last element',
			passes: false,
			source: py([
				'def search(nums, target):',
				'    for i in range(len(nums) - 1):',
				'        if nums[i] == target:',
				'            return i',
				'    return -1'
			])
		}
	],
	'valid-parentheses': [
		{
			name: 'Counts brackets, ignores order',
			passes: false,
			source: py([
				'def is_valid(s):',
				"    return s.count('(') == s.count(')') and s.count('[') == s.count(']') and s.count('{') == s.count('}')"
			])
		},
		{
			name: 'Only handles one kind',
			passes: false,
			source: py([
				'def is_valid(s):',
				'    depth = 0',
				'    for ch in s:',
				"        depth += 1 if ch == '(' else -1 if ch == ')' else 0",
				'        if depth < 0:',
				'            return False',
				'    return depth == 0'
			])
		}
	],
	'contains-duplicate': [
		{
			name: 'Set size',
			passes: true,
			source: py(['def contains_duplicate(nums):', '    return len(set(nums)) != len(nums)'])
		},
		{
			name: 'Nested loops',
			passes: true,
			source: py([
				'def contains_duplicate(nums):',
				'    for i in range(len(nums)):',
				'        for j in range(i + 1, len(nums)):',
				'            if nums[i] == nums[j]:',
				'                return True',
				'    return False'
			])
		},
		{
			name: 'Only checks neighbours',
			passes: false,
			source: py([
				'def contains_duplicate(nums):',
				'    return any(nums[i] == nums[i + 1] for i in range(len(nums) - 1))'
			])
		},
		{
			name: 'Always False',
			passes: false,
			source: py(['def contains_duplicate(nums):', '    return False'])
		}
	]
}
const referencesFor = (slug: string) => [
	...(REFERENCE_SOLUTIONS[slug] ?? []),
	...(LOCAL_REFERENCES[slug] ?? [])
]

const resolve = (slug: string) => {
	const problem = PROBLEMS[slug]
	const suite = HIDDEN_SUITES[slug]
	return problem == null || suite == null ? null : { problem, cases: suite.cases }
}

test('every eligible problem has a hidden suite, and the ids are unique within it', () => {
	assert.deepEqual([...ELIGIBLE_SLUGS].sort(), Object.keys(PROBLEMS).sort())
	for (const slug of ELIGIBLE_SLUGS) {
		const ids = HIDDEN_SUITES[slug]!.cases.map((c) => c.id)
		assert.equal(new Set(ids).size, ids.length, slug)
		assert.ok(ids.length >= 10, `${slug} has enough cases`)
	}
})

test('hidden suites are disjoint from the public practice tests (they are separate data)', () => {
	for (const slug of ELIGIBLE_SLUGS) {
		const publicArgs = new Set(PROBLEMS[slug]!.tests.map((t) => JSON.stringify(t.args)))
		const hidden = HIDDEN_SUITES[slug]!.cases
		const overlap = hidden.filter((c) => publicArgs.has(JSON.stringify(c.args))).length
		// A canonical tiny input may legitimately coincide, but the suite must be new.
		assert.ok(overlap <= 2, `${slug}: ${overlap} of ${hidden.length} hidden cases are also public`)
	}
})

for (const slug of ELIGIBLE_SLUGS) {
	test(`${slug}: every compliant reference solution passes the whole hidden suite; every non-compliant one fails at least one case`, async () => {
		const grader = createSandboxGrader(localSandbox({ files: {} }), resolve)
		const refs = referencesFor(slug)
		// Never vacuous: every suite is exercised by at least one compliant and one wrong solution.
		assert.ok(
			refs.some((r) => r.passes),
			`${slug}: no compliant reference solution ran`
		)
		assert.ok(
			refs.some((r) => !r.passes),
			`${slug}: no non-compliant reference solution ran`
		)
		for (const solution of refs) {
			const result = await grader.grade({ problemSlug: slug, source: solution.source })
			assert.ok(
				result.ok,
				`${solution.name}: grading itself must succeed (${JSON.stringify(result)})`
			)
			if (!result.ok) continue
			if (solution.passes) {
				assert.equal(
					result.testsPassed,
					result.testsTotal,
					`${slug} / ${solution.name} must pass all ${result.testsTotal}`
				)
			} else {
				assert.ok(
					result.testsPassed < result.testsTotal,
					`${slug} / ${solution.name} is non-compliant and must fail some case`
				)
			}
		}
	})
}

test('the sandbox is created with no network, no persistence and a bounded time', async () => {
	const seen: { options?: SandboxCreateOptions; files: Record<string, string> } = { files: {} }
	const grader = createSandboxGrader(localSandbox(seen), resolve)
	await grader.grade({
		problemSlug: 'two-sum',
		source: 'def two_sum(nums, target):\n    return [0, 1]\n'
	})
	assert.equal(seen.options?.networkPolicy, 'deny-all')
	assert.equal(seen.options?.persistent, false)
	assert.ok((seen.options?.timeout ?? 0) <= 5 * 60_000)
})

test('no expected answer is ever written into the sandbox, so learner code cannot read one', async () => {
	const seen: { options?: SandboxCreateOptions; files: Record<string, string> } = { files: {} }
	const grader = createSandboxGrader(localSandbox(seen), resolve)
	await grader.grade({
		problemSlug: 'valid-anagram',
		source: 'def is_anagram(s, t):\n    return sorted(s) == sorted(t)\n'
	})
	assert.deepEqual(Object.keys(seen.files).sort(), ['case.py', 'job.json', 'runner.py'])
	assert.equal(seen.files['job.json']!.includes('expected'), false)
	assert.equal(/"expected"/.test(Object.values(seen.files).join('\n')), false)
	// A hostile solution that goes looking for answers in the sandbox's files finds none.
	const cheat = [
		'def is_anagram(s, t):',
		"    return open('job.json').read().count('expected') > 0",
		''
	].join('\n')
	const result = await grader.grade({ problemSlug: 'valid-anagram', source: cheat })
	assert.ok(result.ok)
	// It cannot return the right answer for most cases by reading the files: the file has
	// no answers, so it answers False everywhere and fails the cases whose answer is True.
	assert.ok(result.ok && result.testsPassed < result.testsTotal)
})

test('an infinite loop costs only its own case; the rest are still graded', async () => {
	const grader = createSandboxGrader(localSandbox({ files: {} }), resolve)
	const source = [
		'def contains_duplicate(nums):',
		'    if len(nums) == 5000 and len(set(nums)) == 1:',
		'        while True:',
		'            pass',
		'    return len(nums) != len(set(nums))',
		''
	].join('\n')
	const result = await grader.grade({ problemSlug: 'contains-duplicate', source })
	assert.ok(result.ok)
	if (result.ok) {
		assert.equal(result.testsTotal, HIDDEN_SUITES['contains-duplicate']!.cases.length)
		assert.equal(result.testsPassed, result.testsTotal - 1)
	}
})

test('a solution that crashes, has a syntax error or prints noise is a failed learner result, not a grader error', async () => {
	const grader = createSandboxGrader(localSandbox({ files: {} }), resolve)
	for (const source of [
		'def two_sum(nums, target):\n    raise ValueError("x")\n',
		'def two_sum(:\n',
		'print("{\\"ok\\": true}")\ndef two_sum(nums, target):\n    return [9, 9]\n'
	]) {
		const result = await grader.grade({ problemSlug: 'two-sum', source })
		assert.ok(result.ok, source)
		if (result.ok) assert.equal(result.testsPassed, 0, source)
	}
})

test('a sandbox that cannot be created is a recoverable grader error, never a score', async () => {
	const grader = createSandboxGrader(async () => {
		throw new Error('no capacity')
	}, resolve)
	assert.deepEqual(await grader.grade({ problemSlug: 'two-sum', source: 'x' }), {
		ok: false,
		code: 'sandbox_unavailable'
	})
})

test('a runner that exits non-zero is a grader error', async () => {
	const failing: SandboxFactory = async () => ({
		writeFiles: async () => undefined,
		runCommand: async () => ({ exitCode: 1, stdout: async () => '' }),
		stop: async () => undefined
	})
	assert.deepEqual(
		await createSandboxGrader(failing, resolve).grade({ problemSlug: 'two-sum', source: 'x' }),
		{ ok: false, code: 'runner_failed' }
	)
})

test('an unknown problem has no hidden suite and is refused', async () => {
	assert.deepEqual(
		await createSandboxGrader(localSandbox({ files: {} }), resolve).grade({
			problemSlug: 'nope',
			source: 'x'
		}),
		{ ok: false, code: 'no_hidden_suite' }
	)
})
