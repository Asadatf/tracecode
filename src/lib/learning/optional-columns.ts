// Compatibility for columns whose migration may land after the code that uses
// them (Attempt.codeFeatures, Attempt.meaningful). A fallback is allowed ONLY for
// PostgreSQL's "undefined column" condition (SQLSTATE 42703) about a column we
// can name; any other failure — connectivity, constraints, a different missing
// column, a bug — propagates untouched instead of being silently retried.
//
// How 42703 surfaces: the Prisma query engine reports it as P2022 with
// `meta.column` (a typed query, which is all this app uses); a raw query would be
// P2010 with `meta.code === '42703'`; a bare driver error carries it as `code`.
// If the column cannot be identified we do NOT fall back: refusing to guess is
// the safe direction.

const UNDEFINED_COLUMN_SQLSTATE = '42703'

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

// `attempts.meaningful`, `"meaningful"` and `meaningful` all name the column.
function namesColumn(text: unknown, column: string): boolean {
	if (typeof text !== 'string') return false
	const last = text.split('.').pop() ?? ''
	return last.replace(/"/g, '') === column
}

function messageNamesColumn(message: unknown, column: string): boolean {
	return typeof message === 'string' && new RegExp(`\\b${column}\\b`).test(message)
}

export function isUndefinedColumnError(error: unknown, column: string): boolean {
	const e = asRecord(error)
	const meta = asRecord(e.meta)
	if (e.code === 'P2022') return namesColumn(meta.column, column)
	if (e.code === 'P2010' && meta.code === UNDEFINED_COLUMN_SQLSTATE) {
		return messageNamesColumn(meta.message, column)
	}
	if (e.code === UNDEFINED_COLUMN_SQLSTATE) return messageNamesColumn(e.message, column)
	return false
}

// Runs `write` with every optional column; when the database reports one of them
// undefined, drops just that column and tries again, down to none. Terminates:
// every retry removes one key. Anything else rethrows.
export async function writeWithOptionalColumns<Extras extends object, Result>(
	extras: Extras,
	write: (extras: Partial<Extras>) => Promise<Result>,
	onDropped?: (column: string, error: unknown) => void
): Promise<Result> {
	let remaining: Partial<Extras> = { ...extras }
	for (;;) {
		try {
			return await write(remaining)
		} catch (error) {
			const missing = (Object.keys(remaining) as (keyof Extras & string)[]).find((column) =>
				isUndefinedColumnError(error, column)
			)
			if (missing == null) throw error
			onDropped?.(missing, error)
			remaining = { ...remaining }
			delete remaining[missing]
		}
	}
}

// Reads with the primary query; on an undefined-column error for `column` only,
// reads with the fallback that doesn't name it.
export async function readWithColumnFallback<Result>(
	column: string,
	primary: () => Promise<Result>,
	fallback: () => Promise<Result>
): Promise<Result> {
	try {
		return await primary()
	} catch (error) {
		if (!isUndefinedColumnError(error, column)) throw error
		return fallback()
	}
}
