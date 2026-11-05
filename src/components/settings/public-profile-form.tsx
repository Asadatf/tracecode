'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { captureClientError } from '@/lib/observability/capture-client-error'
import { checkUsername, USERNAME_MAX, USERNAME_MIN } from '@/lib/profile/username'
import type { ProfileSettings, ProfileUpdateError } from '@/lib/profile/profile-settings'
import { updateProfileSettingsAction } from '@/server/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// The "Public profile" form on /settings (specs/features/public-profile-settings.md):
// pick a username and choose, explicitly, whether the profile is public. It is a
// real form with a Save button, not autosave, because a username has to be valid and
// free before it means anything. The browser only checks what it can for instant
// feedback; the server re-validates everything and the database enforces uniqueness.
// The server resolves the owner from the session, never from this form.

type Status = { kind: 'saved' } | { kind: 'error'; error: ProfileUpdateError | 'failed' } | null

export function PublicProfileForm({ initial }: { initial: ProfileSettings }) {
	const t = useTranslations('SettingsPage.publicProfile')
	const [saved, setSaved] = useState(initial)
	const [username, setUsername] = useState(initial.username ?? '')
	const [isPublic, setIsPublic] = useState(initial.visibility === 'PUBLIC')
	const [status, setStatus] = useState<Status>(null)

	const mutation = useMutation({
		mutationFn: updateProfileSettingsAction,
		onSuccess: (result) => {
			if (result.ok && result.data.saved) {
				const next = { username: result.data.username, visibility: result.data.visibility }
				setSaved(next)
				setUsername(next.username ?? '')
				setIsPublic(next.visibility === 'PUBLIC')
				setStatus({ kind: 'saved' })
			} else if (result.ok && !result.data.saved) {
				setStatus({ kind: 'error', error: result.data.error })
			} else {
				setStatus({ kind: 'error', error: 'failed' })
			}
		},
		onError: (error) => {
			captureClientError(error)
			setStatus({ kind: 'error', error: 'failed' })
		}
	})
	const pending = mutation.isPending

	const usernameChanged = username.trim() !== '' && username.trim() !== (saved.username ?? '')
	const visibilityChanged = isPublic !== (saved.visibility === 'PUBLIC')
	const dirty = usernameChanged || visibilityChanged

	function onSubmit(event: FormEvent) {
		event.preventDefault()
		if (!dirty || pending) return
		if (usernameChanged) {
			const checked = checkUsername(username)
			if (!checked.ok) return setStatus({ kind: 'error', error: checked.error })
		}
		if (isPublic && saved.username == null && !usernameChanged) {
			return setStatus({ kind: 'error', error: 'username_required' })
		}
		setStatus(null)
		mutation.mutate({
			...(usernameChanged ? { username } : {}),
			...(visibilityChanged ? { visibility: isPublic ? 'PUBLIC' : 'PRIVATE' } : {})
		})
	}

	const error = status?.kind === 'error' ? status.error : null
	// Field errors belong to the username input; the rest are form-level.
	const usernameError = error != null && error !== 'failed' && error !== 'unauthenticated'
	const visibilityOnlyError = error === 'username_required'

	return (
		<section
			aria-labelledby="public-profile-heading"
			className="border-border bg-surface rounded-lg border p-6 sm:p-8"
		>
			<h2 id="public-profile-heading" className="m-0 text-lg font-bold">
				{t('heading')}
			</h2>
			<p className="text-text-muted mt-1 mb-0 text-sm">{t('description')}</p>
			<form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-6">
				<div>
					<label htmlFor="profile-username" className="mb-2 block text-sm font-semibold">
						{t('username')}
					</label>
					<Input
						id="profile-username"
						name="username"
						value={username}
						disabled={pending}
						autoComplete="off"
						autoCapitalize="none"
						spellCheck={false}
						maxLength={USERNAME_MAX + 10}
						aria-invalid={usernameError && !visibilityOnlyError}
						aria-describedby={`profile-username-help${usernameError ? ' profile-form-error' : ''}`}
						onChange={(event) => {
							setUsername(event.target.value)
							setStatus(null)
						}}
					/>
					<p id="profile-username-help" className="text-text-muted mt-2 mb-0 text-sm">
						{t('usernameHelp', { min: USERNAME_MIN, max: USERNAME_MAX })}
					</p>
				</div>
				<label className="flex items-start gap-3">
					<input
						type="checkbox"
						className="accent-accent mt-1 size-4"
						checked={isPublic}
						disabled={pending}
						aria-describedby="profile-public-help"
						onChange={(event) => {
							setIsPublic(event.target.checked)
							setStatus(null)
						}}
					/>
					<span className="flex flex-col gap-0.5">
						<span className="text-sm font-semibold">{t('public')}</span>
						<span id="profile-public-help" className="text-text-muted text-sm">
							{t('publicHelp')}
						</span>
					</span>
				</label>
				<p className="text-text-muted m-0 text-sm">
					{saved.visibility === 'PUBLIC' ? t('statePublic') : t('statePrivate')}
				</p>
				<div className="flex flex-wrap items-center gap-4">
					<Button type="submit" disabled={!dirty || pending}>
						{pending ? t('saving') : t('save')}
					</Button>
					{status?.kind === 'saved' ? (
						<p role="status" className="text-text-muted m-0 text-sm">
							{t('saved')}
						</p>
					) : null}
					{error != null ? (
						<p id="profile-form-error" role="alert" className="text-danger m-0 text-sm">
							{t(`errors.${error}`, { min: USERNAME_MIN, max: USERNAME_MAX })}
						</p>
					) : null}
				</div>
			</form>
		</section>
	)
}
