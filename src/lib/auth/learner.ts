export interface AuthIdentity {
	id: string
	email?: string | null
}

// Turn the verified Supabase user into the id a learning write may use, making
// sure a matching public.users row exists first (attempts.userId and the other
// learning tables have a foreign key to it). The identity must come from the
// server-verified session, never from the browser — callers pass in what
// supabase.auth.getUser() returned. No identity or no email (users.email is
// required) means no persistence. A provisioning failure propagates so the
// action reports it instead of writing against a missing row.
export async function resolveLearnerId(
	identity: AuthIdentity | null | undefined,
	provision: (user: { id: string; email: string }) => Promise<void>
): Promise<string | null> {
	if (identity == null || !identity.email) return null
	await provision({ id: identity.id, email: identity.email })
	return identity.id
}
