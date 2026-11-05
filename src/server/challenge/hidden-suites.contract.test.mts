// An INDEPENDENT review of the hidden grading suites, as a permanent test. Each problem
// has its own oracle here (written from the problem statement, sharing no code with the
// suites, the reference solutions or the grader), which recomputes every expected value
// and checks the input contract the statement promises. A wrong expected answer, an input
// the statement forbids, or a missing edge category fails the build.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HIDDEN_SUITES, type HiddenCase } from './hidden-suites.data.ts'

const cases = (slug: string): HiddenCase[] => HIDDEN_SUITES[slug]!.cases
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const ints = (v: unknown): v is number[] => Array.isArray(v) && v.every(isInt)

describe('suite-wide', () => {
	it('every case is plain JSON that survives a round trip, with unique ids and boolean/array/number results', () => {
		for (const [slug, suite] of Object.entries(HIDDEN_SUITES)) {
			const ids = new Set<string>()
			for (const c of suite.cases) {
				assert.match(c.id, /^h\d+$/, `${slug} ${c.id}`)
				assert.equal(ids.has(c.id), false, `${slug} duplicate ${c.id}`)
				ids.add(c.id)
				assert.deepEqual(JSON.parse(JSON.stringify(c.args)), c.args, `${slug} ${c.id} args`)
				assert.deepEqual(
					JSON.parse(JSON.stringify(c.expected)),
					c.expected,
					`${slug} ${c.id} expected`
				)
			}
		}
	})

	it('the whole set is small enough to send as one job (well under 400 KB)', () => {
		const bytes = Buffer.byteLength(
			JSON.stringify(
				Object.values(HIDDEN_SUITES).map((s) => s.cases.map(({ id, args }) => ({ id, args })))
			)
		)
		assert.ok(bytes < 400_000, `inputs are ${bytes} bytes`)
	})
})

describe('two-sum: exactly one pair, indices increasing', () => {
	it('every case has exactly one qualifying pair and the expected indices are it', () => {
		for (const c of cases('two-sum')) {
			const [nums, target] = c.args as [number[], number]
			assert.ok(ints(nums) && isInt(target), c.id)
			assert.ok(nums.length >= 2, c.id)
			const pairs: [number, number][] = []
			for (let i = 0; i < nums.length; i++)
				for (let j = i + 1; j < nums.length; j++)
					if (nums[i]! + nums[j]! === target) pairs.push([i, j])
			assert.equal(
				pairs.length,
				1,
				`${c.id}: the statement promises exactly one solution, found ${pairs.length}`
			)
			assert.deepEqual(c.expected, pairs[0], c.id)
			assert.ok(
				(c.expected as number[])[0]! < (c.expected as number[])[1]!,
				`${c.id}: increasing order`
			)
		}
	})
	it('covers negatives, zero, duplicate values, the smallest input and a large input', () => {
		const all = cases('two-sum').map((c) => c.args as [number[], number])
		assert.ok(all.some(([n]) => n.some((x) => x < 0)))
		assert.ok(all.some(([n, t]) => n.includes(0) || t === 0))
		assert.ok(all.some(([n]) => new Set(n).size < n.length))
		assert.ok(all.some(([n]) => n.length === 2))
		assert.ok(all.some(([n]) => n.length >= 1000))
	})
})

describe('contains-duplicate: a real boolean', () => {
	it('expected equals "some value repeats", and is a boolean', () => {
		for (const c of cases('contains-duplicate')) {
			const [nums] = c.args as [number[]]
			assert.ok(ints(nums), c.id)
			assert.equal(typeof c.expected, 'boolean', c.id)
			assert.equal(c.expected, new Set(nums).size !== nums.length, c.id)
		}
	})
	it('covers empty, single, adjacent and far-apart duplicates, all distinct, negatives and a large input of each kind', () => {
		const lists = cases('contains-duplicate').map((c) => (c.args as [number[]])[0])
		assert.ok(lists.some((l) => l.length === 0))
		assert.ok(lists.some((l) => l.length === 1))
		assert.ok(lists.some((l) => l.some((x, i) => i > 0 && x === l[i - 1])))
		assert.ok(lists.some((l) => l.length > 4000 && new Set(l).size === l.length))
		assert.ok(lists.some((l) => l.length > 4000 && new Set(l).size < l.length))
		assert.ok(lists.some((l) => l.some((x) => x < 0)))
		const results = cases('contains-duplicate').map((c) => c.expected)
		assert.ok(results.includes(true) && results.includes(false))
	})
})

describe('valid-anagram: lowercase a-z, at least one character, a real boolean', () => {
	it('inputs obey the statement and expected equals "same multiset of letters"', () => {
		for (const c of cases('valid-anagram')) {
			const [s, t] = c.args as [string, string]
			assert.match(s, /^[a-z]+$/, `${c.id} s`)
			assert.match(t, /^[a-z]+$/, `${c.id} t`)
			assert.equal(typeof c.expected, 'boolean', c.id)
			const norm = (x: string) => [...x].sort().join('')
			assert.equal(c.expected, norm(s) === norm(t), c.id)
		}
	})
	it('covers different lengths, same letters with different counts, true and false, and long strings', () => {
		const pairs = cases('valid-anagram').map((c) => c.args as [string, string])
		assert.ok(pairs.some(([s, t]) => s.length !== t.length))
		assert.ok(
			pairs.some(
				([s, t]) =>
					s.length === t.length &&
					[...s].sort().join('') !== [...t].sort().join('') &&
					new Set(s).size === new Set(t).size
			)
		)
		assert.ok(pairs.some(([s]) => s.length >= 4000))
		const r = cases('valid-anagram').map((c) => c.expected)
		assert.ok(r.includes(true) && r.includes(false))
	})
})

describe('move-zeroes: in place, stable, the judged value is the list after the call', () => {
	it('expected is every non-zero in original order followed by the zeros, with the same length', () => {
		for (const c of cases('move-zeroes')) {
			const [nums] = c.args as [number[]]
			assert.ok(ints(nums) && ints(c.expected), c.id)
			const nonZero = nums.filter((x) => x !== 0)
			const expected = [...nonZero, ...nums.filter((x) => x === 0)]
			assert.deepEqual(c.expected, expected, c.id)
			assert.equal((c.expected as number[]).length, nums.length, c.id)
		}
	})
	it('covers all zeros, none, leading, trailing and interleaved zeros, negatives and large inputs', () => {
		const lists = cases('move-zeroes').map((c) => (c.args as [number[]])[0])
		assert.ok(lists.some((l) => l.length > 0 && l.every((x) => x === 0)))
		assert.ok(lists.some((l) => l.length > 0 && l.every((x) => x !== 0)))
		assert.ok(lists.some((l) => l[0] === 0 && l.some((x) => x !== 0)))
		assert.ok(lists.some((l) => l.at(-1) === 0 && l.some((x) => x !== 0)))
		assert.ok(lists.some((l) => l.some((x) => x < 0)))
		assert.ok(lists.some((l) => l.length >= 3000))
		// A stable order matters: some input has distinct non-zero values out of numeric order.
		assert.ok(
			lists.some((l) => {
				const nz = l.filter((x) => x !== 0)
				return nz.some((x, i) => i > 0 && x < nz[i - 1]!)
			})
		)
	})
})

describe('binary-search: sorted, distinct, index or -1', () => {
	it('inputs are strictly increasing and expected is the index (or -1)', () => {
		for (const c of cases('binary-search')) {
			const [nums, target] = c.args as [number[], number]
			assert.ok(ints(nums) && isInt(target), c.id)
			for (let i = 1; i < nums.length; i++)
				assert.ok(nums[i]! > nums[i - 1]!, `${c.id}: sorted and distinct`)
			assert.equal(c.expected, nums.indexOf(target), c.id)
		}
	})
	it('covers first, last, middle, absent below, above and between, single element and a large input', () => {
		const rows = cases('binary-search').map((c) => ({
			nums: (c.args as [number[], number])[0],
			target: (c.args as [number[], number])[1],
			expected: c.expected as number
		}))
		assert.ok(rows.some((r) => r.expected === 0 && r.nums.length > 1))
		assert.ok(rows.some((r) => r.expected === r.nums.length - 1 && r.nums.length > 1))
		assert.ok(rows.some((r) => r.expected > 0 && r.expected < r.nums.length - 1))
		assert.ok(rows.some((r) => r.expected === -1 && r.target < r.nums[0]!))
		assert.ok(rows.some((r) => r.expected === -1 && r.target > r.nums.at(-1)!))
		assert.ok(
			rows.some((r) => r.expected === -1 && r.target > r.nums[0]! && r.target < r.nums.at(-1)!)
		)
		assert.ok(rows.some((r) => r.nums.length === 1))
		assert.ok(rows.some((r) => r.nums.length >= 10_000))
	})
})

describe('valid-parentheses: only ()[]{}, a real boolean', () => {
	const valid = (s: string) => {
		const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
		const stack: string[] = []
		for (const ch of s) {
			if (ch in pairs) {
				if (stack.pop() !== pairs[ch]) return false
			} else stack.push(ch)
		}
		return stack.length === 0
	}
	it('inputs use only the six bracket characters and expected matches a stack check', () => {
		for (const c of cases('valid-parentheses')) {
			const [s] = c.args as [string]
			assert.match(s, /^[()[\]{}]+$/, c.id)
			assert.equal(typeof c.expected, 'boolean', c.id)
			assert.equal(c.expected, valid(s), c.id)
		}
	})
	it('covers each wrong shape: unclosed, unopened, wrong kind, wrong order, odd length, deep nesting, long', () => {
		const strs = cases('valid-parentheses').map((c) => (c.args as [string])[0])
		const exp = cases('valid-parentheses').map((c) => c.expected)
		assert.ok(
			strs.some((s) => !valid(s) && /^[([{]+$/.test(s)),
			'only openers'
		)
		assert.ok(
			strs.some((s) => !valid(s) && /^[)\]}]/.test(s)),
			'starts with a closer'
		)
		assert.ok(
			strs.some((s) => !valid(s) && s.length % 2 === 0 && s.length > 0),
			'even length but invalid'
		)
		assert.ok(
			strs.some((s) => !valid(s) && s.length % 2 === 1),
			'odd length'
		)
		assert.ok(
			strs.some((s) => valid(s) && s.length >= 2000),
			'long valid'
		)
		assert.ok(
			strs.some((s) => !valid(s) && s.length >= 1000),
			'long invalid'
		)
		assert.ok(
			strs.some((s) => valid(s) && /^[(]{500,}/.test(s)),
			'deeply nested'
		)
		assert.ok(exp.includes(true) && exp.includes(false))
	})
})
