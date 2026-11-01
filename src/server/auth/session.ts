import 'server-only'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { provisionUser } from '@/server/auth/provision-user'
import { resolveLearnerId } from '@/lib/auth/learner'

// Resolve the signed-in Supabase user id, or null. RESILIENT by design: if
// Supabase is unconfigured or unreachable, this returns null instead of
// throwing, so the practice experience still renders for everyone (Pyodide is
// client-side and must never be blocked by auth/DB problems). A plain server-only
// helper — not a component — so its try/catch is free of React Compiler limits.
export async function currentUserIdSafe(): Promise<string | null> {
	try {
		const supabase = await createServerSupabaseClient()
		const { data } = await supabase.auth.getUser()
		return data.user?.id ?? null
	} catch {
		return null
	}
}

// The signed-in learner's id for a WRITE, with their public.users row ensured
// first. The identity comes from supabase.auth.getUser() — validated against
// Supabase, not read from a cookie or the request body — so the id is never
// browser-supplied. Unlike currentUserIdSafe it lets provisioning errors
// propagate, so validatedAction reports them rather than a write silently
// no-opping or hitting a foreign-key error.
export async function currentLearnerId(): Promise<string | null> {
	const supabase = await createServerSupabaseClient()
	const { data } = await supabase.auth.getUser()
	return resolveLearnerId(data.user, provisionUser)
}
