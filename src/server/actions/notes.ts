'use server'

import { validatedAction } from './validated-action'
import { db } from '@/server/db/client'
import { currentLearnerId } from '@/server/auth/session'
import { isEmptyNote, saveNoteInput } from '@/lib/learning/problem-notes'

// Save or clear the signed-in learner's note on a problem
// (specs/features/problem-notes.md). The user id always comes from the
// verified session, never from the request (AC8); the input schema has no
// user field at all.
export const saveProblemNote = validatedAction({
	input: saveNoteInput,
	handler: async ({ problemSlug, body }) => {
		const userId = await currentLearnerId()
		if (userId == null) return { saved: false as const }
		if (isEmptyNote(body)) {
			await db.problemNote.deleteMany({ where: { userId, problemSlug } })
			return { saved: true as const }
		}
		await db.problemNote.upsert({
			where: { userId_problemSlug: { userId, problemSlug } },
			create: { userId, problemSlug, body },
			update: { body }
		})
		return { saved: true as const }
	}
})
