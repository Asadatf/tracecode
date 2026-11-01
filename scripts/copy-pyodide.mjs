// Copies the Pyodide runtime from node_modules into public/ so the app serves
// it from its own origin (ADR-0002) instead of a third-party CDN. Runs on
// postinstall, so every install and every Vercel build has it; the output is
// gitignored. The version folder must match PYODIDE_VERSION in
// src/lib/trace/trace-program.ts — pyodide-version.test.mts checks that.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Only what loadPyodide() fetches for the standard library — no extra packages.
const RUNTIME_FILES = [
	'pyodide.js',
	'pyodide.asm.js',
	'pyodide.asm.wasm',
	'python_stdlib.zip',
	'pyodide-lock.json'
]

const require = createRequire(import.meta.url)
const packageJsonPath = require.resolve('pyodide/package.json')
const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const source = dirname(packageJsonPath)
const target = join(process.cwd(), 'public', 'pyodide', `v${version}`)

mkdirSync(target, { recursive: true })
for (const file of RUNTIME_FILES) copyFileSync(join(source, file), join(target, file))
console.log(`copy-pyodide: Pyodide ${version} → public/pyodide/v${version}/`)
