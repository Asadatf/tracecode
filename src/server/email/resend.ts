// The Resend wrapper (M7.5B): the only code that talks to the email provider.
// Plain `fetch` against Resend's REST API — no SDK dependency. It holds no secret
// of its own (the caller passes the resolved key from `resolveEmailConfig`) and
// takes an injectable fetch, so every branch is unit-tested with no network.
//
// Expected failures come back as a typed result, never a throw, and carry only a
// status code or a coarse category — never the provider's message (which can
// echo the recipient address) — so they are safe to store and log.
//
// IDEMPOTENCY: every send carries an `Idempotency-Key` header. Resend replays the
// original response for a repeated key within its retention window (24 h at the
// time of writing — confirm against Resend's docs before relying on it in prod),
// so a run that crashed after Resend accepted but before we recorded it can retry
// with the same key without emailing the learner twice. Exactly-once end to end is
// not claimed; see specs/features/learning-recommendations.md § Email.

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
export const RESEND_TIMEOUT_MS = 10_000
// Resend's documented key length limit.
const MAX_IDEMPOTENCY_KEY = 256

export type SendFailure =
	| 'rate_limited' // 429 — stop sending for this run
	| 'server_error' // 5xx — retryable
	| 'conflict' // 409 — a concurrent request with the same key; retryable
	| 'timeout' // retryable
	| 'network_error' // retryable
	| 'rejected' // other 4xx (bad sender/recipient/auth) — permanent
	| 'invalid_response' // 2xx without a message id

export type SendResult =
	{ ok: true; id: string } | { ok: false; reason: SendFailure; status?: number }

export function isRetryableSend(reason: SendFailure): boolean {
	return (
		reason === 'server_error' ||
		reason === 'conflict' ||
		reason === 'timeout' ||
		reason === 'network_error' ||
		reason === 'rate_limited'
	)
}

export function failureForResendStatus(status: number): SendFailure | null {
	if (status >= 200 && status < 300) return null
	if (status === 429) return 'rate_limited'
	if (status === 409) return 'conflict'
	if (status >= 500) return 'server_error'
	return 'rejected'
}

export interface OutgoingEmail {
	from: string
	to: string
	subject: string
	html: string
	text: string
	idempotencyKey: string
	// Extra headers, e.g. List-Unsubscribe / List-Unsubscribe-Post (RFC 8058).
	headers?: Record<string, string>
}

export async function sendEmail(
	apiKey: string,
	email: OutgoingEmail,
	fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
	let response: Response
	try {
		response = await fetchImpl(RESEND_EMAILS_URL, {
			method: 'POST',
			signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
			headers: {
				authorization: `Bearer ${apiKey}`,
				'content-type': 'application/json',
				'idempotency-key': email.idempotencyKey.slice(0, MAX_IDEMPOTENCY_KEY)
			},
			body: JSON.stringify({
				from: email.from,
				to: [email.to],
				subject: email.subject,
				html: email.html,
				text: email.text,
				headers: email.headers
			})
		})
	} catch (error) {
		if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
			return { ok: false, reason: 'timeout' }
		}
		return { ok: false, reason: 'network_error' }
	}
	const failure = failureForResendStatus(response.status)
	if (failure != null) return { ok: false, reason: failure, status: response.status }
	try {
		const body: unknown = await response.json()
		const id =
			typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
				? body.id
				: null
		return id == null ? { ok: false, reason: 'invalid_response' } : { ok: true, id }
	} catch {
		return { ok: false, reason: 'invalid_response' }
	}
}
