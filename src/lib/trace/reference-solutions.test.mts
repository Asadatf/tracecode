import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { COMPARISON_ARGS, REFERENCE_SOLUTIONS, type Growth } from './reference-solutions'
import { PROBLEMS } from './problems'
import { PYTHON, pythonAvailable } from './engine-python.mts'
import { seededRandom } from './catalog/test-data'

// Verifies each reference solution's stated growth by MEASUREMENT, independent
// of the AST heuristics: Python line events (time) and tracemalloc peak
// (auxiliary space) at doubling input sizes. Variants whose cost hides inside a
// C builtin (sorted) carry no `timeGrowth` and are not claimed here.

const MEASURE_PY = String.raw`
import sys, json, tracemalloc
req = json.loads(sys.stdin.read())
ns = {}
exec(compile(req['source'], '<sol>', 'exec'), ns)
fn = ns[req['entry']]

def lines(args):
    count = [0]
    def tracer(frame, event, arg):
        if frame.f_code.co_filename != '<sol>':
            return None
        def local(frame, event, arg):
            if event == 'line':
                count[0] += 1
            return local
        return local
    sys.settrace(tracer)
    try:
        fn(*args)
    finally:
        sys.settrace(None)
    return count[0]

def peak(args):
    tracemalloc.start()
    tracemalloc.reset_peak()
    fn(*args)
    value = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    return value

out = []
for size_args in req['inputs']:
    out.append({'lines': lines(json.loads(json.dumps(size_args))), 'peak': peak(json.loads(json.dumps(size_args)))})
print(json.dumps(out))
`

const ENTRY: Record<string, string> = Object.fromEntries(
	Object.values(PROBLEMS).map((problem) => [problem.slug, problem.entry])
)

// The worst case each problem's solutions are measured on, at size n.
function worstCase(slug: string, n: number): unknown[] {
	const random = seededRandom(n)
	switch (slug) {
		case 'valid-anagram': {
			const s = Array.from({ length: n }, (_, i) => 'abcdefghijklmnopqrstuvwxyz'[i % 26]).join('')
			const t = [...s].sort(() => random() - 0.5).join('')
			return [s, t]
		}
		case 'move-zeroes':
			return [Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0 : i))]
		case 'binary-search':
			// Absent target above everything: a scan reads all n, a halving search ~log n.
			return [Array.from({ length: n }, (_, i) => i), n + 1]
		case 'two-sum':
			// The only pair is the last two values: every pair is tried first.
			return [Array.from({ length: n }, (_, i) => i), 2 * n - 3]
		case 'contains-duplicate':
			// All distinct: nothing ends the search early.
			return [Array.from({ length: n }, (_, i) => i)]
		case 'best-time-to-buy-and-sell-stock':
			return [Array.from({ length: n }, () => Math.floor(random() * 10_001))]
		case 'valid-palindrome': {
			const half = Array.from({ length: n / 2 }, (_, i) => 'abc123'[i % 6]).join('')
			return [half + [...half].reverse().join('')]
		}
		case 'maximum-subarray':
			return [Array.from({ length: n }, () => Math.floor(random() * 20_001) - 10_000)]
		case 'merge-sorted-array': {
			const half = n / 2
			const evens = Array.from({ length: half }, (_, i) => i * 2)
			const odds = Array.from({ length: half }, (_, i) => i * 2 + 1)
			return [[...evens, ...Array.from({ length: half }, () => 0)], half, odds, half]
		}
		case 'majority-element':
			// Just over half are the majority; the rest are all different, so a
			// dictionary of counts grows with n.
			return [Array.from({ length: n + 1 }, (_, i) => (i % 2 === 0 ? -1 : i))]
		case 'climbing-stairs':
			return [n]
		default:
			// All openers then all closers: deepest nesting, longest pending stack.
			return ['('.repeat(n / 2) + ')'.repeat(n / 2)]
	}
}

function measure(slug: string, source: string, sizes: number[]) {
	const out = spawnSync(PYTHON, ['-I', '-c', MEASURE_PY], {
		input: JSON.stringify({
			source,
			entry: ENTRY[slug],
			inputs: sizes.map((n) => worstCase(slug, n))
		}),
		encoding: 'utf8',
		maxBuffer: 1 << 26
	})
	assert.equal(out.status, 0, out.stderr)
	return JSON.parse(out.stdout) as { lines: number; peak: number }[]
}

const SIZES = [1000, 2000, 4000]
// Problems with a quadratic straightforward variant, measured at smaller sizes
// so the line-event tracer stays fast; the growth ratios are the same.
const SIZES_FOR: Record<string, number[]> = {
	'two-sum': [300, 600, 1200],
	'contains-duplicate': [300, 600, 1200],
	'best-time-to-buy-and-sell-stock': [300, 600, 1200],
	'maximum-subarray': [300, 600, 1200]
}

function assertTime(growth: Growth, lines: number[], label: string) {
	const [a, b, c] = lines as [number, number, number]
	if (growth === 'linear') {
		assert.ok(b / a > 1.8 && b / a < 2.2 && c / b > 1.8 && c / b < 2.2, `${label}: ${lines}`)
	} else if (growth === 'quadratic') {
		assert.ok(b / a > 3.5 && c / b > 3.5, `${label}: ${lines}`)
	} else if (growth === 'log') {
		// Doubling n adds at most one more halving step (a handful of lines).
		assert.ok(b - a <= 12 && c - b <= 12 && c < 150, `${label}: ${lines}`)
	}
}

function assertSpace(growth: Growth, peaks: number[], label: string) {
	const [a, , c] = peaks as [number, number, number]
	if (growth === 'constant') {
		assert.ok(c <= a + 4096, `${label}: peak ${peaks} should not scale with n`)
	} else if (growth === 'linear') {
		assert.ok(c / a > 2.5, `${label}: peak ${peaks} should scale with n`)
	}
}

for (const [slug, solutions] of Object.entries(REFERENCE_SOLUTIONS)) {
	for (const solution of solutions) {
		if (solution.timeGrowth == null && solution.spaceGrowth == null) continue
		test(
			`${slug}: "${solution.name}" measures as ${solution.time} time / ${solution.space} space`,
			{
				skip: !pythonAvailable() && 'python3 not available'
			},
			() => {
				const results = measure(slug, solution.source, SIZES_FOR[slug] ?? SIZES)
				if (solution.timeGrowth != null)
					assertTime(
						solution.timeGrowth,
						results.map((r) => r.lines),
						solution.name
					)
				if (solution.spaceGrowth != null)
					assertSpace(
						solution.spaceGrowth,
						results.map((r) => r.peak),
						solution.name
					)
			}
		)
	}
}

test('every problem documents a straightforward and an optimized variant with stated complexity', () => {
	for (const [slug, solutions] of Object.entries(REFERENCE_SOLUTIONS)) {
		assert.ok(
			solutions.some((s) => s.kind === 'straightforward' && s.passes),
			slug
		)
		assert.ok(
			solutions.some((s) => s.kind === 'optimized' && s.passes),
			slug
		)
		for (const s of solutions) assert.ok(s.time !== '' && s.space !== '')
	}
})

// specs/features/solutions-tab.md, AC10: every problem a learner can open has a
// straightforward and an optimised passing solution, each with an explanation,
// and a comparison input shaped like its tests.
test('every registry problem has explained solutions of both kinds and a comparison input', () => {
	for (const problem of Object.values(PROBLEMS)) {
		const solutions = REFERENCE_SOLUTIONS[problem.slug] ?? []
		for (const kind of ['straightforward', 'optimized'] as const) {
			assert.ok(
				solutions.some((s) => s.kind === kind && s.passes),
				`${problem.slug}: a passing ${kind} solution`
			)
		}
		for (const s of solutions) {
			assert.ok(s.explanation.length >= 60, `${problem.slug}/${s.name}: explanation`)
			assert.ok(s.source.includes(`def ${problem.entry}(`), `${problem.slug}/${s.name}: entry`)
		}
		const args = COMPARISON_ARGS[problem.slug]
		assert.ok(args != null, `${problem.slug}: comparison input`)
		assert.equal(args.length, problem.params.length, `${problem.slug}: comparison arity`)
	}
})
