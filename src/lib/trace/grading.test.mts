import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { PROBLEMS } from './problems'
import { REFERENCE_SOLUTIONS } from './reference-solutions'
import { GRADE_ENTRY, NOT_IN_PLACE_PREFIX, buildRunRequest } from './grading'
import { ORACLES } from './oracles.mts'
import { PYTHON, pythonAvailable, runInPython } from './engine-python.mts'
import { seededRandom } from './catalog/test-data'
import type { Json } from './contract'

const LIMITS = { timeoutMs: 5000 }
const skip = !pythonAvailable() && 'python3 not available'

function grade(slug: string, source: string) {
	return runInPython(buildRunRequest(PROBLEMS[slug]!, source, LIMITS))
}
function failedIds(slug: string, source: string): string[] {
	const result = grade(slug, source)
	assert.equal(result.status, 'completed')
	return result.tests.filter((t) => !t.passed).map((t) => t.testId)
}

// ── buildRunRequest ──────────────────────────────────────────────────────────

test('ordinary problems are sent to the engine untouched', () => {
	const problem = PROBLEMS['two-sum']!
	const request = buildRunRequest(problem, 'def two_sum(nums, target): return []', LIMITS)
	assert.equal(request.entry, 'two_sum')
	assert.equal(request.code, 'def two_sum(nums, target): return []')
	assert.deepEqual(request.tests, problem.tests)
})

test('Move Zeroes: harness is appended, learner lines keep their numbers, tests are the originals', () => {
	const problem = PROBLEMS['move-zeroes']!
	const source = 'def move_zeroes(nums):\n    pass'
	const request = buildRunRequest(problem, source, LIMITS)
	assert.equal(request.entry, GRADE_ENTRY)
	assert.ok(request.code.startsWith(source), 'learner source is a prefix')
	assert.deepEqual(request.tests, problem.tests)
})

test('Move Zeroes: a missing entry is left for the engine to report', () => {
	const request = buildRunRequest(
		PROBLEMS['move-zeroes']!,
		'def move_zeroes_v2(nums):\n    pass',
		LIMITS
	)
	assert.equal(request.entry, 'move_zeroes')
	assert.equal(request.code, 'def move_zeroes_v2(nums):\n    pass')
	if (pythonAvailable()) {
		assert.equal(grade('move-zeroes', 'x = 1').error?.type, 'entry_not_found')
	}
})

// ── Move Zeroes: the in-place contract ───────────────────────────────────────

test('Move Zeroes: in-place solutions pass; returning the same list is tolerated', { skip }, () => {
	assert.deepEqual(
		failedIds(
			'move-zeroes',
			'def move_zeroes(nums):\n    nums.sort(key=lambda x: x == 0)\n    return nums'
		),
		[]
	)
	assert.deepEqual(
		failedIds(
			'move-zeroes',
			'def move_zeroes(nums):\n    kept = [x for x in nums if x]\n    nums[:] = kept + [0] * (len(nums) - len(kept))'
		),
		[]
	)
})

test(
	'Move Zeroes: returning a NEW list is rejected, with the not-in-place message',
	{ skip },
	() => {
		const source = REFERENCE_SOLUTIONS['move-zeroes']!.find((s) => !s.passes)!.source
		const result = grade('move-zeroes', source)
		const t1 = result.tests.find((t) => t.testId === 't1')!
		assert.equal(t1.passed, false)
		assert.equal(t1.actual?.kind, 'str')
		assert.ok(t1.actual?.kind === 'str' && t1.actual.value.startsWith(NOT_IN_PLACE_PREFIX))
		// Even where the new list is exactly right, it is not in-place: nothing passes
		// except tests whose input needs no change AND returned is not a new list.
		assert.ok(result.tests.every((t) => !t.passed))
	}
)

test(
	'Move Zeroes: rebinding nums (no in-place change) is rejected and leaves the input untouched',
	{ skip },
	() => {
		const result = grade(
			'move-zeroes',
			'def move_zeroes(nums):\n    nums = [x for x in nums if x] + [0]\n'
		)
		const t1 = result.tests.find((t) => t.testId === 't1')!
		assert.equal(t1.passed, false)
		assert.deepEqual(t1.actual, {
			kind: 'list',
			items: [0, 1, 0, 3, 12].map((value) => ({ kind: 'int', value }))
		})
	}
)

test('Move Zeroes: wrong-but-plausible in-place attempts are caught', { skip }, () => {
	assert.ok(
		failedIds('move-zeroes', 'def move_zeroes(nums):\n    nums.sort(reverse=True)').length > 0,
		'a plain sort does not keep the original order'
	)
	const popWhileIndexing =
		'def move_zeroes(nums):\n    for i in range(len(nums)):\n        if nums[i] == 0:\n            nums.pop(i)\n            nums.append(0)\n'
	assert.ok(failedIds('move-zeroes', popWhileIndexing).includes('t7'), 'skips consecutive zeros')
	const swapWithLast =
		'def move_zeroes(nums):\n    end = len(nums) - 1\n    for i in range(len(nums)):\n        if nums[i] == 0 and i < end:\n            nums[i], nums[end] = nums[end], nums[i]\n            end -= 1\n'
	assert.ok(failedIds('move-zeroes', swapWithLast).includes('t12'), 'loses relative order')
	const writeOnly =
		'def move_zeroes(nums):\n    k = 0\n    for x in nums:\n        if x != 0:\n            nums[k] = x\n            k += 1\n'
	assert.ok(failedIds('move-zeroes', writeOnly).includes('t1'), 'forgets to zero-fill')
})

// ── Adversarial wrong approaches must each fail something ────────────────────

const WRONG: Record<string, Record<string, string>> = {
	'valid-anagram': {
		'compares letter sets only': 'def is_anagram(s, t):\n    return set(s) == set(t)',
		'compares lengths only': 'def is_anagram(s, t):\n    return len(s) == len(t)',
		'sums character codes':
			'def is_anagram(s, t):\n    return sum(map(ord, s)) == sum(map(ord, t))',
		'ignores lengths when counting':
			'def is_anagram(s, t):\n    c = {}\n    for ch in s:\n        c[ch] = c.get(ch, 0) + 1\n    for ch in t:\n        if c.get(ch, 0) == 0:\n            return False\n        c[ch] -= 1\n    return True',
		'returns a count, not a boolean': 'def is_anagram(s, t):\n    return len(set(s) & set(t))',
		'every letter of s found in t':
			'def is_anagram(s, t):\n    return all(ch in t for ch in s) and len(s) == len(t)'
	},
	'binary-search': {
		'while left < right with no final check':
			'def search(nums, target):\n    left, right = 0, len(nums) - 1\n    while left < right:\n        mid = (left + right) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1',
		'right starts one past the end':
			'def search(nums, target):\n    left, right = 0, len(nums)\n    while left <= right:\n        mid = (left + right) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1',
		'returns the value, not the index':
			'def search(nums, target):\n    for x in nums:\n        if x == target:\n            return x\n    return -1',
		'never excludes mid on the right':
			'def search(nums, target):\n    left, right = 0, len(nums) - 1\n    while left < right:\n        mid = (left + right) // 2\n        if nums[mid] < target:\n            left = mid + 1\n        else:\n            right = mid\n    return left',
		'returns None when absent':
			'def search(nums, target):\n    for i in range(len(nums)):\n        if nums[i] == target:\n            return i'
	},
	'valid-parentheses': {
		'counts brackets only':
			"def is_valid(s):\n    return s.count('(') == s.count(')') and s.count('[') == s.count(']') and s.count('{') == s.count('}')",
		'forgets leftover openers':
			"def is_valid(s):\n    m = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for ch in s:\n        if ch in m:\n            if not stack or stack.pop() != m[ch]:\n                return False\n        else:\n            stack.append(ch)\n    return True",
		'pops without checking empty':
			"def is_valid(s):\n    m = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for ch in s:\n        if ch in m:\n            if stack.pop() != m[ch]:\n                return False\n        else:\n            stack.append(ch)\n    return not stack",
		'matches first with last only':
			"def is_valid(s):\n    return len(s) % 2 == 0 and {'(': ')', '[': ']', '{': '}'}.get(s[0]) == s[-1]",
		'one pass of pair removal':
			"def is_valid(s):\n    return s.replace('()', '').replace('[]', '').replace('{}', '') == ''",
		'treats any closer as a match':
			"def is_valid(s):\n    stack = []\n    for ch in s:\n        if ch in '([{':\n            stack.append(ch)\n        elif stack:\n            stack.pop()\n        else:\n            return False\n    return not stack"
	}
}

for (const [slug, variants] of Object.entries(WRONG)) {
	for (const [label, source] of Object.entries(variants)) {
		test(`${slug}: wrong approach "${label}" is rejected by the suite`, { skip }, () => {
			assert.ok(failedIds(slug, source).length > 0)
		})
	}
}

test('valid-parentheses: the idiomatic repeated str.replace removal is accepted', { skip }, () => {
	assert.deepEqual(
		failedIds(
			'valid-parentheses',
			"def is_valid(s):\n    while '()' in s or '[]' in s or '{}' in s:\n        s = s.replace('()', '').replace('[]', '').replace('{}', '')\n    return s == ''"
		),
		[]
	)
})

// ── Differential: all compliant references agree with each other and the oracle ──

function randomInputs(slug: string, count: number): Json[][] {
	const random = seededRandom(slug.length * 7919)
	const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))
	const out: Json[][] = []
	for (let i = 0; i < count; i++) {
		if (slug === 'valid-anagram') {
			const letters = 'abcd'.slice(0, int(1, 4))
			const word = (n: number) =>
				Array.from({ length: n }, () => letters[int(0, letters.length - 1)]).join('')
			const s = word(int(1, 12))
			const shuffled = [...s].sort(() => random() - 0.5).join('')
			const mode = int(0, 3)
			const t =
				mode === 0
					? shuffled
					: mode === 1
						? word(s.length)
						: mode === 2
							? word(int(1, 12))
							: shuffled.slice(0, -1) + 'z'
			out.push([s, t])
		} else if (slug === 'move-zeroes') {
			const n = int(1, 20)
			const zeroRate = random()
			out.push([Array.from({ length: n }, () => (random() < zeroRate ? 0 : int(-5, 5) || 7))])
		} else if (slug === 'binary-search') {
			const n = int(1, 25)
			const values = new Set<number>()
			while (values.size < n) values.add(int(-60, 60))
			const nums = [...values].sort((a, b) => a - b)
			out.push([nums, int(-62, 62)])
		} else {
			const n = int(1, 14)
			const pool = int(0, 1) === 0 ? '()' : '()[]{}'
			out.push([Array.from({ length: n }, () => pool[int(0, pool.length - 1)]).join('')])
		}
	}
	return out
}

// Runs every compliant variant over `inputs` in ONE python process, applying the
// same call convention the grader uses, and returns their results per variant.
function runVariants(slug: string, sources: string[], inputs: Json[][]): Json[][] {
	const driver = `
import sys, json, copy
req = json.loads(sys.stdin.read())
out = []
for source in req['sources']:
    ns = {}
    exec(compile(source, '<sol>', 'exec'), ns)
    fn = ns[req['entry']]
    results = []
    for args in req['inputs']:
        args = copy.deepcopy(args)
        returned = fn(*args)
        results.append(args[0] if req['mutate'] else returned)
    out.append(results)
print(json.dumps(out))`
	const run = spawnSync(PYTHON, ['-I', '-c', driver], {
		input: JSON.stringify({
			sources,
			inputs,
			entry: PROBLEMS[slug]!.entry,
			mutate: PROBLEMS[slug]!.grading?.mode === 'mutate-arg'
		}),
		encoding: 'utf8',
		maxBuffer: 1 << 26
	})
	assert.equal(run.status, 0, run.stderr)
	return JSON.parse(run.stdout) as Json[][]
}

for (const slug of Object.keys(WRONG)
	.concat('move-zeroes')
	.filter((s, i, a) => a.indexOf(s) === i)) {
	test(
		`${slug}: differential run — all compliant references and the oracle agree on 400 generated inputs`,
		{ skip },
		() => {
			const compliant = REFERENCE_SOLUTIONS[slug]!.filter((s) => s.passes)
			assert.ok(compliant.length >= 2)
			const inputs = randomInputs(slug, 400)
			const results = runVariants(
				slug,
				compliant.map((s) => s.source),
				inputs
			)
			for (const [i, args] of inputs.entries()) {
				const expected = ORACLES[slug]!(structuredClone(args))
				for (const [v, variantResults] of results.entries()) {
					assert.deepEqual(
						variantResults[i],
						expected,
						`${slug}/${compliant[v]!.name} on ${JSON.stringify(args)}`
					)
				}
			}
			// The inputs must actually exercise both outcomes where there are two.
			if (slug === 'valid-anagram' || slug === 'valid-parentheses') {
				const verdicts = new Set(inputs.map((a) => ORACLES[slug]!(a)))
				assert.equal(verdicts.size, 2, 'both True and False are generated')
			}
			if (slug === 'binary-search') {
				const outcomes = inputs.map((a) => ORACLES[slug]!(a) as number)
				assert.ok(outcomes.some((o) => o === -1) && outcomes.some((o) => o >= 0))
			}
		}
	)
}
