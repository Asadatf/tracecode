import { AppError } from '@/lib/errors/app-error'

// The ownership guard docs/rules/auth.md asks for: a client-supplied id (an
// attemptId) only names a row, it never proves the caller owns it. Run this
// before writing against that row. A row that exists but belongs to someone
// else reads the same as one that doesn't, so a probe can't tell them apart.
export function assertOwnedBy(ownerId: string | null | undefined, userId: string): void {
	if (ownerId == null || ownerId !== userId) {
		throw new AppError('Not found.', { status: 404, code: 'not_found' })
	}
}
