import 'server-only'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// The signed-in learner's id, or null when nobody is signed in. Also null when
// Supabase isn't configured (a fresh local clone): progress then stays
// browser-only instead of the Supabase client throwing on a missing URL/key —
// the same guard src/proxy.ts applies before it touches Supabase.
export async function getLearnerId(): Promise<string | null> {
	if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
		return null
	}
	const supabase = await createServerSupabaseClient()
	const { data } = await supabase.auth.getUser()
	return data.user?.id ?? null
}
