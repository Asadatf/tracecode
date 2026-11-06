import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { provisionUser } from '@/server/auth/provision-user'
import { captureError } from '@/lib/observability/capture-error'
import { safeReturnTo } from '@/lib/auth/return-to'
import { oauthFailurePath } from '@/lib/auth/oauth'

// Where Google or GitHub sends the learner back (specs/features/oauth-sign-in.md,
// AC3, AC4, AC6). Exchanges the one-time code for a session (cookies set by the
// server Supabase client), provisions the users row exactly as email sign-in
// does, then redirects to the sanitised `next`. Under /api so the locale
// middleware leaves it alone. Not a JSON API, so not createApiRoute: it only
// ever answers with a redirect.
export async function GET(request: NextRequest) {
	const url = request.nextUrl
	const code = url.searchParams.get('code')
	const provider = url.searchParams.get('provider')
	const fail = () => NextResponse.redirect(new URL(oauthFailurePath(provider), url.origin))
	if (code == null) return fail()

	try {
		const supabase = await createServerSupabaseClient()
		const { data, error } = await supabase.auth.exchangeCodeForSession(code)
		if (error != null || data.user == null || !data.user.email) return fail()
		await provisionUser({ id: data.user.id, email: data.user.email })
	} catch (error) {
		captureError(error)
		return fail()
	}
	return NextResponse.redirect(new URL(safeReturnTo(url.searchParams.get('next')), url.origin))
}
