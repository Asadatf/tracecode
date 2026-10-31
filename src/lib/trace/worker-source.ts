import { RUN_PROGRAM, TRACE_PROGRAM, PYODIDE_INDEX_URL, PYODIDE_SCRIPT_URL } from './trace-program'
import { VALUE_LIMITS } from './contract'

// The Web Worker body, built as a source string so it runs from a Blob URL —
// bundler-agnostic (no Turbopack worker wiring) and identical in the app and in
// the browser integration test. It is thin glue: boot Pyodide once (reported as
// `loading_runtime`), then run the untraced RUN_PROGRAM for a `run` request or
// the traced TRACE_PROGRAM for a `trace` request, and post back the result. All
// validation happens on the main thread against the contract.
export function buildWorkerSource(): string {
	const limits = JSON.stringify(VALUE_LIMITS)
	return `"use strict";
const TRACE_PROGRAM = ${JSON.stringify(TRACE_PROGRAM)};
const RUN_PROGRAM = ${JSON.stringify(RUN_PROGRAM)};
const PYODIDE_SCRIPT_URL = ${JSON.stringify(PYODIDE_SCRIPT_URL)};
const PYODIDE_INDEX_URL = ${JSON.stringify(PYODIDE_INDEX_URL)};
const VALUE_LIMITS = ${limits};
let pyodidePromise = null;
async function boot() {
	importScripts(PYODIDE_SCRIPT_URL);
	return await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
}
self.onmessage = async (event) => {
	const message = event.data;
	if (!message || (message.type !== 'trace' && message.type !== 'run')) return;
	try {
		if (!pyodidePromise) {
			self.postMessage({ type: 'status', phase: 'loading_runtime' });
			pyodidePromise = boot();
		}
		const py = await pyodidePromise;
		self.postMessage({ type: 'status', phase: 'running' });
		const request = message.request;
		if (message.type === 'trace') {
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
			const output = py.runPython(RUN_PROGRAM);
			self.postMessage({ type: 'run_result', result: JSON.parse(output) });
		}
	} catch (error) {
		const detail = String((error && error.message) || error);
		if (message.type === 'run') {
			self.postMessage({ type: 'run_result', result: { status: 'engine_error', error: { type: 'engine', message: detail }, tests: [] } });
		} else {
			self.postMessage({ type: 'trace_result', result: { status: 'engine_error', error: { type: 'engine', message: detail, line: 1 } } });
		}
	}
};
`
}
