import { z } from 'zod'
import { PROBLEMS } from '@/lib/trace/problems'

// Notes per problem (specs/features/problem-notes.md): the shared input rules,
// used by the server actions and the panel alike.

export const MAX_NOTE_CHARS = 2000
export const NOTE_SAVE_DEBOUNCE_MS = 800

export const problemSlugSchema = z
	.string()
	.refine((slug) => Object.hasOwn(PROBLEMS, slug), 'Unknown problem')

export const saveNoteInput = z.object({
	problemSlug: problemSlugSchema,
	body: z.string().max(MAX_NOTE_CHARS)
})

// A note with nothing but whitespace is no note: saving it deletes it (AC7).
export function isEmptyNote(body: string): boolean {
	return body.trim() === ''
}
