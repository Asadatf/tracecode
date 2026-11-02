'use client'

import { useState, useTransition } from 'react'
import { updateNotificationPreferencesAction } from '@/server/actions/notifications'

// The two independent reminder switches on /progress (M7.5B): in-app (default
// ON) and daily email (explicit opt-in, default OFF). Each change is saved on its
// own; the server resolves the learner from the session, never from this form.

export interface PreferenceLabels {
	heading: string
	description: string
	inApp: string
	inAppHelp: string
	email: string
	emailHelp: string
	emailUnavailable: string
	saved: string
	failed: string
}

type Field = 'inAppEnabled' | 'emailOptIn'

export function ReminderPreferences({
	initial,
	emailConfigured,
	labels
}: {
	initial: { inAppEnabled: boolean; emailOptIn: boolean }
	emailConfigured: boolean
	labels: PreferenceLabels
}) {
	const [values, setValues] = useState(initial)
	const [status, setStatus] = useState<null | 'saved' | 'failed'>(null)
	const [pending, startTransition] = useTransition()

	function change(field: Field, value: boolean) {
		const previous = values
		setValues({ ...values, [field]: value })
		setStatus(null)
		startTransition(async () => {
			const result = await updateNotificationPreferencesAction({ [field]: value })
			if (result.ok && result.data.saved) {
				setStatus('saved')
			} else {
				setValues(previous)
				setStatus('failed')
			}
		})
	}

	return (
		<section
			aria-labelledby="reminder-preferences-heading"
			className="border-border bg-surface flex flex-col gap-4 rounded-sm border p-6"
		>
			<div className="flex flex-col gap-1">
				<h2 id="reminder-preferences-heading" className="m-0 text-lg font-bold">
					{labels.heading}
				</h2>
				<p className="text-text-muted m-0 text-sm">{labels.description}</p>
			</div>
			<label className="flex items-start gap-3">
				<input
					type="checkbox"
					className="accent-accent mt-1 size-4"
					checked={values.inAppEnabled}
					disabled={pending}
					onChange={(event) => change('inAppEnabled', event.target.checked)}
				/>
				<span className="flex flex-col gap-0.5">
					<span className="text-sm font-semibold">{labels.inApp}</span>
					<span className="text-text-muted text-sm">{labels.inAppHelp}</span>
				</span>
			</label>
			<label className="flex items-start gap-3">
				<input
					type="checkbox"
					className="accent-accent mt-1 size-4"
					checked={values.emailOptIn}
					disabled={pending}
					onChange={(event) => change('emailOptIn', event.target.checked)}
				/>
				<span className="flex flex-col gap-0.5">
					<span className="text-sm font-semibold">{labels.email}</span>
					<span className="text-text-muted text-sm">{labels.emailHelp}</span>
					{!emailConfigured ? (
						<span className="text-warning text-sm">{labels.emailUnavailable}</span>
					) : null}
				</span>
			</label>
			{status != null ? (
				<p
					className={
						status === 'failed' ? 'text-warning m-0 text-sm' : 'text-text-muted m-0 text-sm'
					}
					role="status"
				>
					{status === 'saved' ? labels.saved : labels.failed}
				</p>
			) : null}
		</section>
	)
}
