import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { captureError } from '@/lib/observability/capture-error'
import { unsubscribeByToken } from '@/server/notifications/inbox'

// POST /api/notifications/unsubscribe?token=… — RFC 8058 one-click unsubscribe,
// the target of every reminder email's List-Unsubscribe header. Mail clients POST
// `List-Unsubscribe=One-Click`; the token in the query string is the only
// authorisation and can only ever turn email OFF. Always 200 with the same body,
// so it can't be used to probe for valid tokens. (A plain GET does nothing: link
// scanners prefetch GETs, which is why the email's visible link goes to the
// confirm-first /unsubscribe page instead.)
export async function unsubscribeOneClick(req: NextRequest) {
	try {
		await unsubscribeByToken(req.nextUrl.searchParams.get('token'))
	} catch (error) {
		captureError(error, { area: 'unsubscribe-one-click' })
	}
	return NextResponse.json({ ok: true })
}
