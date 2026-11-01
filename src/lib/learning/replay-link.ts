// What a replay needs from the attempt it replays: the server id if the save
// has already landed, or the in-flight save to wait for.
export interface ReplayableAttempt {
	dbId?: string
	saving?: Promise<string | undefined>
}

// Resolve the server id a replay session should be linked to. The save is
// asynchronous (and serialized behind other Server Actions), and a replay reads
// its attempt from a render-time snapshot that never sees the later `dbId`
// state update — so waiting on the save itself is the only reliable source.
// A failed or unauthenticated save yields undefined, and the caller falls back
// to a plain learning event: replay never depends on the save succeeding.
export async function resolveAttemptDbId(
	attempt: ReplayableAttempt | undefined
): Promise<string | undefined> {
	if (attempt == null) return undefined
	if (attempt.dbId != null) return attempt.dbId
	try {
		return await attempt.saving
	} catch {
		return undefined
	}
}
