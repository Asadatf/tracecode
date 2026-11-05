import { RUN_PROGRAM, TRACE_PROGRAM } from './trace-program'
import { AST_PROGRAM } from './ast-program'
import { BUILTIN_CALL_ALLOWLIST, FEATURE_LIMITS } from './code-features'
import { VALUE_LIMITS } from './contract'

// The Web Worker body, built as a source string so it runs from a Blob URL —
// bundler-agnostic (no Turbopack worker wiring) and identical in the app and in
// the browser integration test. It is thin glue: boot Pyodide once (reported as
// `loading_runtime`), then run the untraced RUN_PROGRAM for a `run` request or
// the traced TRACE_PROGRAM for a `trace` request, and post back the result. An
// `ast` request (M7.1) runs AST_PROGRAM, which only parses the source. All
// `run` also posts a `test_result` as each test finishes (REPORT_TEST, called by
// RUN_PROGRAM mid-loop), then the final `run_result`. All validation happens on the
// main thread against the contract. `pyodideIndexUrl`
// is absolute (see pyodideIndexUrl in trace-program.ts).
export function buildWorkerSource(pyodideIndexUrl: string): string {
	const limits = JSON.stringify(VALUE_LIMITS)
	const astLimits = JSON.stringify({
		maxSourceChars: FEATURE_LIMITS.maxSourceChars,
		maxCount: FEATURE_LIMITS.maxCount,
		builtinAllowlist: BUILTIN_CALL_ALLOWLIST
	})
	return `"use strict";
const TRACE_PROGRAM = ${JSON.stringify(TRACE_PROGRAM)};
const RUN_PROGRAM = ${JSON.stringify(RUN_PROGRAM)};
const AST_PROGRAM = ${JSON.stringify(AST_PROGRAM)};
const AST_LIMITS = ${astLimits};
const PYODIDE_INDEX_URL = ${JSON.stringify(pyodideIndexUrl)};
const PYODIDE_SCRIPT_URL = PYODIDE_INDEX_URL + 'pyodide.js';
const VALUE_LIMITS = ${limits};
let pyodidePromise = null;
async function boot() {
	importScripts(PYODIDE_SCRIPT_URL);
	return await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
}
self.onmessage = async (event) => {
	const message = event.data;
	if (!message || (message.type !== 'trace' && message.type !== 'run' && message.type !== 'ast')) return;
	try {
		if (!pyodidePromise) {
			self.postMessage({ type: 'status', phase: 'loading_runtime' });
			pyodidePromise = boot();
		}
		const py = await pyodidePromise;
		self.postMessage({ type: 'status', phase: 'running' });
		const request = message.request;
		if (message.type === 'ast') {
			py.globals.set('REQUEST_JSON', JSON.stringify({
				source: request.code,
				maxSourceChars: AST_LIMITS.maxSourceChars,
				maxCount: AST_LIMITS.maxCount,
				builtinAllowlist: AST_LIMITS.builtinAllowlist
			}));
			const output = py.runPython(AST_PROGRAM);
			self.postMessage({ type: 'ast_result', result: JSON.parse(output) });
		} else if (message.type === 'trace') {
			py.globals.set('REQUEST_JSON', JSON.stringify({
				source: request.code,
				entry: request.entry,
				args: request.input.args,
				maxSteps: request.limits.maxSteps,
				maxItems: VALUE_LIMITS.maxItems,
				maxEntries: VALUE_LIMITS.maxEntries,
				maxStringLength: VALUE_LIMITS.maxStringLength,
				maxReprLength: VALUE_LIMITS.maxReprLength
			}));
			const output = py.runPython(TRACE_PROGRAM);
			self.postMessage({ type: 'trace_result', result: JSON.parse(output) });
		} else {
			py.globals.set('REQUEST_JSON', JSON.stringify({
				source: request.code,
				entry: request.entry,
				tests: request.tests,
				maxItems: VALUE_LIMITS.maxItems,
				maxEntries: VALUE_LIMITS.maxEntries,
				maxStringLength: VALUE_LIMITS.maxStringLength,
				maxReprLength: VALUE_LIMITS.maxReprLength
			}));
			// Called by the Python loop after each test, synchronously, so the message is on its
			// way before the next test starts. Nothing is buffered or replayed afterwards.
			py.globals.set('REPORT_TEST', (json) => {
				const event = JSON.parse(json);
				self.postMessage({ type: 'test_result', index: event.index, test: event.test });
			});
			let output;
			try {
				output = py.runPython(RUN_PROGRAM);
			} finally {
				py.globals.delete('REPORT_TEST');
			}
			self.postMessage({ type: 'run_result', result: JSON.parse(output) });
		}
	} catch (error) {
		const detail = String((error && error.message) || error);
		if (message.type === 'ast') {
			self.postMessage({ type: 'ast_result', result: { status: 'analysis_error', permanent: false, message: detail.slice(0, 200) } });
		} else if (message.type === 'run') {
			self.postMessage({ type: 'run_result', result: { status: 'engine_error', error: { type: 'engine', message: detail }, tests: [] } });
		} else {
			self.postMessage({ type: 'trace_result', result: { status: 'engine_error', error: { type: 'engine', message: detail, line: 1 } } });
		}
	}
};
`
}
