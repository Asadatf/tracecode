import { practicePath, reminderCopy, type ReminderPlan } from '@/lib/learning/reminder-plan'
import { reviewReminderCopy, type ReviewReminder } from '@/lib/reviews/review-reminder'

// The daily reminder email (M7.5B), rendered from the shared reminder plan so it
// says exactly what the in-app notification says. Pure. Every interpolated value
// is HTML-escaped; the only learner data in it is the plan (enums + a catalog
// title) — never source, traces, or anything the learner typed.

export interface ReminderEmailInput {
	plan: ReminderPlan
	problemTitle: string
	// Absolute app origin, e.g. https://tracecode.app (no trailing slash needed).
	appUrl: string
	// The learner's unsubscribe token (base64url).
	unsubscribeToken: string
}

export interface ReminderEmail {
	subject: string
	html: string
	text: string
	practiceUrl: string
	unsubscribeUrl: string
	// RFC 8058 one-click endpoint, for the List-Unsubscribe header.
	oneClickUrl: string
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

function absolute(appUrl: string, path: string): string {
	return new URL(path, appUrl.endsWith('/') ? appUrl : `${appUrl}/`).toString()
}

export function renderReminderEmail(input: ReminderEmailInput): ReminderEmail {
	const copy = reminderCopy(input.plan, input.problemTitle)
	const token = encodeURIComponent(input.unsubscribeToken)
	const practiceUrl = absolute(input.appUrl, practicePath(input.plan.problemSlug))
	// The page asks for a confirming click, so a mail scanner prefetching the link
	// can't unsubscribe anyone; mail clients use the one-click POST endpoint.
	const unsubscribeUrl = absolute(input.appUrl, `/unsubscribe?token=${token}`)
	const oneClickUrl = absolute(input.appUrl, `/api/notifications/unsubscribe?token=${token}`)

	const lines = [copy.body, ...(copy.concept ? [copy.concept] : [])]
	const text = [
		copy.title,
		'',
		...lines,
		'',
		`${copy.cta}: ${practiceUrl}`,
		'',
		'You get this because you turned on daily reminder emails in TraceCode.',
		`Unsubscribe: ${unsubscribeUrl}`
	].join('\n')

	const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;background:#ffffff">
<div style="max-width:520px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(copy.title)}</h1>
${lines.map((line) => `<p style="margin:0 0 10px;line-height:1.5">${escapeHtml(line)}</p>`).join('\n')}
<p style="margin:20px 0"><a href="${escapeHtml(practiceUrl)}" style="background:#2563eb;color:#ffffff;padding:10px 16px;border-radius:4px;text-decoration:none;font-weight:600">${escapeHtml(copy.cta)}</a></p>
<p style="margin:24px 0 0;font-size:12px;color:#666;line-height:1.5">You get this because you turned on daily reminder emails in TraceCode. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#666">Unsubscribe</a></p>
</div>
</body></html>`

	return { subject: copy.title, html, text, practiceUrl, unsubscribeUrl, oneClickUrl }
}

export interface ReviewEmailInput {
	reminder: ReviewReminder
	// Catalogue titles and first concept tags by slug.
	titles: Readonly<Record<string, string | undefined>>
	concepts: Readonly<Record<string, string | undefined>>
	appUrl: string
	unsubscribeToken: string
}

// The due-review email (M9C), rendered from the shared review reminder so it says what
// the in-app notification says. Same escaping, same one-click unsubscribe as the daily
// reminder; the only learner data is catalogue titles and stage numbers.
export function renderReviewEmail(input: ReviewEmailInput): ReminderEmail {
	const copy = reviewReminderCopy(input.reminder, input.titles, input.concepts)
	const token = encodeURIComponent(input.unsubscribeToken)
	const practiceUrl = absolute(input.appUrl, copy.href)
	const unsubscribeUrl = absolute(input.appUrl, `/unsubscribe?token=${token}`)
	const oneClickUrl = absolute(input.appUrl, `/api/notifications/unsubscribe?token=${token}`)
	const lines = [copy.body, ...(copy.concept ? [copy.concept] : [])]
	const text = [
		copy.title,
		'',
		...lines,
		'',
		`${copy.cta}: ${practiceUrl}`,
		'',
		'You get this because you turned on reminder emails in TraceCode.',
		`Unsubscribe: ${unsubscribeUrl}`
	].join('\n')
	const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;background:#ffffff">
<div style="max-width:520px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(copy.title)}</h1>
${lines.map((line) => `<p style="margin:0 0 10px;line-height:1.5">${escapeHtml(line)}</p>`).join('\n')}
<p style="margin:20px 0"><a href="${escapeHtml(practiceUrl)}" style="background:#2563eb;color:#ffffff;padding:10px 16px;border-radius:4px;text-decoration:none;font-weight:600">${escapeHtml(copy.cta)}</a></p>
<p style="margin:24px 0 0;font-size:12px;color:#666;line-height:1.5">You get this because you turned on reminder emails in TraceCode. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#666">Unsubscribe</a></p>
</div>
</body></html>`
	return { subject: copy.title, html, text, practiceUrl, unsubscribeUrl, oneClickUrl }
}
