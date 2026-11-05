'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { setLeaderboardOptInAction } from '@/server/actions/challenge'

// The explicit, separate consent to appear on the public weekly leaderboard
// (specs/features/daily-challenge.md § Consent). Off by default for everyone, and
// independent of the public profile: sharing a profile never lists anyone here. Saved on
// change; the server resolves the learner from the session, never from this control.
export function LeaderboardOptIn({
	initial,
	hasUsername
}: {
	initial: boolean
	hasUsername: boolean
}) {
	const t = useTranslations('SettingsPage.leaderboard')
	const [optIn, setOptIn] = useState(initial)
	const [status, setStatus] = useState<null | 'saved' | 'username_required' | 'failed'>(null)
	const mutation = useMutation({
		mutationFn: (wanted: boolean) => setLeaderboardOptInAction({ optIn: wanted }),
		onSuccess: (result) => {
			if (result.ok && result.data.saved) {
				setOptIn(result.data.optIn)
				setStatus('saved')
			} else if (result.ok && !result.data.saved && result.data.error === 'username_required') {
				setStatus('username_required')
			} else {
				setStatus('failed')
			}
		},
		onError: (error) => {
			captureClientError(error)
			setStatus('failed')
		}
	})

	return (
		<section
			aria-labelledby="leaderboard-optin-heading"
			className="border-border bg-surface rounded-lg border p-6 sm:p-8"
		>
			<h2 id="leaderboard-optin-heading" className="m-0 text-lg font-bold">
				{t('heading')}
			</h2>
			<p className="text-text-muted mt-1 mb-0 text-sm">{t('description')}</p>
			<label className="mt-5 flex items-start gap-3">
				<input
					type="checkbox"
					className="accent-accent mt-1 size-4"
					checked={optIn}
					disabled={mutation.isPending}
					aria-describedby="leaderboard-optin-help"
					onChange={(event) => {
						setStatus(null)
						mutation.mutate(event.target.checked)
					}}
				/>
				<span className="flex flex-col gap-0.5">
					<span className="text-sm font-semibold">{t('label')}</span>
					<span id="leaderboard-optin-help" className="text-text-muted text-sm">
						{t('help')}
					</span>
					{hasUsername ? null : <span className="text-warning text-sm">{t('needsUsername')}</span>}
				</span>
			</label>
			{mutation.isPending ? (
				<p role="status" className="text-text-muted mt-3 mb-0 text-sm">
					{t('saving')}
				</p>
			) : null}
			{status != null ? (
				<p
					role={status === 'saved' ? 'status' : 'alert'}
					className={
						status === 'saved'
							? 'text-text-muted mt-3 mb-0 text-sm'
							: 'text-danger mt-3 mb-0 text-sm'
					}
				>
					{t(`status.${status}`)}
				</p>
			) : null}
		</section>
	)
}
