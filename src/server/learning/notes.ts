import 'server-only'
import { db } from '@/server/db/client'
import { currentUserIdSafe } from '@/server/auth/session'

// The signed-in learner's note on a problem, read on the server so the practice
// page renders with it (specs/features/problem-notes.md, AC3). A plain
// server-only helper, so its try/catch is free of the React Compiler's limits.
// Signed out, or the table not migrated yet → null; never throws into the page.
export async function getProblemNote(problemSlug: string): Promise<string | null> {
	const userId = await currentUserIdSafe()
	if (userId == null) return null
	try {
		const note = await db.problemNote.findUnique({
			where: { userId_problemSlug: { userId, problemSlug } },
			select: { body: true }
		})
		return note?.body ?? null
	} catch {
		return null
	}
}
