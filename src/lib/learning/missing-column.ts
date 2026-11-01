// Prisma reports a column the database does not have (a schema change whose
// migration has not been applied yet) as P2022. Compared by code, not by
// importing Prisma's error class, so this stays pure and testable.
export function isMissingColumnError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'P2022'
	)
}
