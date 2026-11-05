// Comparing a sandbox's actual output with a hidden expected answer, on the server.
// The expected answers never enter the sandbox, so learner code can never read them.
//
// Equality follows the engine's Python semantics (the practice engine judges with
// Python `==` after a JSON round trip), so a legitimate answer is never marked wrong
// for its representation: `True == 1`, `1 == 1.0`, lists and dicts compare deeply.
// Anything else that is not equal is wrong.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function isNumeric(value: unknown): value is number | boolean {
	return typeof value === 'number' || typeof value === 'boolean'
}

export function pythonEquals(a: unknown, b: unknown): boolean {
	if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b)
	if (a === null || b === null) return a === b
	if (typeof a === 'string' || typeof b === 'string') return a === b
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
		return a.every((item, i) => pythonEquals(item, b[i]))
	}
	if (typeof a === 'object' && typeof b === 'object') {
		const ka = Object.keys(a as object)
		const kb = Object.keys(b as object)
		if (ka.length !== kb.length) return false
		return ka.every(
			(key) =>
				Object.hasOwn(b as object, key) &&
				pythonEquals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
		)
	}
	return false
}
