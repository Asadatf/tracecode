import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPython } from './format-python.ts'

const fmt = (source: string) => formatPython(source).text

test('AC14: every block level becomes four spaces', () => {
	const messy = 'def f(nums):\n  for i in nums:\n      if i:\n        return i\n  return -1'
	assert.equal(
		fmt(messy),
		'def f(nums):\n    for i in nums:\n        if i:\n            return i\n    return -1'
	)
	assert.equal(formatPython(messy).status, 'formatted')
})

test('AC14: tabs are expanded as Python reads them', () => {
	assert.equal(fmt('def f():\n\treturn 1'), 'def f():\n    return 1')
	assert.equal(
		fmt('def f(x):\n  for i in x:\n\tfor j in x:\n\t    if i:\n\t\treturn [i, j]'),
		'def f(x):\n    for i in x:\n        for j in x:\n            if i:\n                return [i, j]'
	)
})

test('AC14: trailing spaces and trailing blank lines go, inner blank lines stay', () => {
	assert.equal(fmt('x = 1   \n\ny = 2\n\n\n'), 'x = 1\n\ny = 2')
	assert.equal(
		fmt('def f():\n    x = 1\n      \n    return x'),
		'def f():\n    x = 1\n\n    return x'
	)
})

test('AC14: a comment takes the indentation of the code after it, wherever it was typed', () => {
	assert.equal(
		fmt('def f(nums):\n    x = 1\n# note\n    return x'),
		'def f(nums):\n    x = 1\n    # note\n    return x'
	)
	assert.equal(
		fmt('def f(nums):\n    x = 1\n            # note\n    return x'),
		'def f(nums):\n    x = 1\n    # note\n    return x'
	)
	assert.equal(
		fmt('def f(x):\n    if x:\n        return 1\n  # otherwise\n    return 2'),
		'def f(x):\n    if x:\n        return 1\n    # otherwise\n    return 2'
	)
})

test('AC14: bracket and backslash continuations keep their offset from the statement', () => {
	assert.equal(
		fmt('def f():\n  d = {\n    "a": 1,\n  }\n  return d'),
		'def f():\n    d = {\n      "a": 1,\n    }\n    return d'
	)
	assert.equal(
		fmt('def f():\n  x = 1 + \\\n   2\n  return x'),
		'def f():\n    x = 1 + \\\n     2\n    return x'
	)
	assert.equal(
		fmt('def f():\n  x = [1,\n         2]\n  return x'),
		'def f():\n    x = [1,\n           2]\n    return x'
	)
})

test('AC14: lines inside triple-quoted strings are untouched', () => {
	const src = 'def f():\n  s = """a\n      b  """\n  return s'
	assert.equal(fmt(src), 'def f():\n    s = """a\n      b  """\n    return s')
})

test('AC14: brackets and colons inside strings and comments do not confuse it', () => {
	assert.equal(
		fmt('def f():\n  s = "(["  # {\n  return s'),
		'def f():\n    s = "(["  # {\n    return s'
	)
	assert.equal(
		fmt('def f(x):\n  if x:  # check:\n      return 1'),
		'def f(x):\n    if x:  # check:\n        return 1'
	)
})

test('AC14: a dedent to a level no block used is reported, code unchanged', () => {
	const bad = 'def f():\n    x = 1\n  y = 2'
	const result = formatPython(bad)
	assert.equal(result.status, 'error')
	assert.equal(result.reason, 'dedent')
	assert.equal(result.line, 3)
	assert.equal(result.text, bad)
})

test('AC14: a missing indent after a colon is reported with its line', () => {
	const flat = 'def f(x):\nreturn x'
	const result = formatPython(flat)
	assert.equal(result.status, 'error')
	assert.equal(result.reason, 'missing-indent')
	assert.equal(result.line, 2)
	assert.equal(result.text, flat)
})

test('AC14: already formatted code reports unchanged', () => {
	const ok =
		'def two_sum(nums, target):\n    for i in range(len(nums)):\n        pass\n    return []'
	const result = formatPython(ok)
	assert.equal(result.status, 'unchanged')
	assert.equal(result.text, ok)
})
