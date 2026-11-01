import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PYODIDE_VERSION } from './trace-program'

// scripts/copy-pyodide.mjs serves the installed npm package's version; the
// worker requests PYODIDE_VERSION. If they drift, every Run 404s on load.
test('the installed pyodide package matches PYODIDE_VERSION', () => {
	const require = createRequire(import.meta.url)
	const { version } = JSON.parse(readFileSync(require.resolve('pyodide/package.json'), 'utf8'))
	assert.equal(version, PYODIDE_VERSION)
})
