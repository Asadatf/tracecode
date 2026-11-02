'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { authenticateAction, type AuthFormState } from '@/server/actions/auth'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SpinnerIcon } from '@/components/ui/icons'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/credentials'
import { PasswordField } from './password-field'
import styles from './auth.module.css'

const INITIAL_STATE: AuthFormState = {}

// One form for both pages: `mode` is the existing authenticateAction field, so
// Sign In and Register share the server path (validation, Supabase call,
// provisioning, error mapping) and differ only in fields and copy.
// `next` is forwarded untrusted; the action sanitises it.
export function AuthForm({ mode, next }: { mode: 'sign-in' | 'sign-up'; next: string | null }) {
	const t = useTranslations('Auth')
	const [state, formAction, isPending] = useActionState(authenticateAction, INITIAL_STATE)
	const [password, setPassword] = useState('')
	const [confirm, setConfirm] = useState('')
	const [touched, setTouched] = useState(false)

	const isSignUp = mode === 'sign-up'
	const lengthOk = password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH
	const mismatch = isSignUp && confirm.length > 0 && confirm !== password
	// Client validation is a convenience; the action re-validates everything.
	const clientError =
		isSignUp && touched
			? !lengthOk
				? t('errors.passwordLength', { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH })
				: confirm !== password
					? t('errors.mismatch')
					: null
			: null

	return (
		<form
			action={formAction}
			noValidate={isSignUp}
			onSubmit={(event) => {
				if (!isSignUp) return
				setTouched(true)
				if (!lengthOk || confirm !== password) event.preventDefault()
			}}
			className="flex flex-col gap-5"
		>
			<input type="hidden" name="mode" value={mode} />
			{next != null && <input type="hidden" name="next" value={next} />}

			<div className="flex flex-col gap-1.5">
				<Label htmlFor="email">{t('email')}</Label>
				<Input
					id="email"
					name="email"
					type="email"
					autoComplete="email"
					inputMode="email"
					required
					className="h-11"
				/>
			</div>

			<PasswordField
				id="password"
				name="password"
				label={t('password')}
				autoComplete={isSignUp ? 'new-password' : 'current-password'}
				showLabel={t('show')}
				hideLabel={t('hide')}
				enforceLength={isSignUp}
				describedBy={isSignUp ? 'password-rules' : undefined}
				onChange={setPassword}
			/>

			{isSignUp && (
				<>
					<p id="password-rules" className={styles.rules} data-ok={lengthOk || undefined}>
						{t('rules', { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH })}
					</p>
					<PasswordField
						id="confirm-password"
						name="confirmPassword"
						label={t('confirm')}
						autoComplete="new-password"
						showLabel={t('show')}
						hideLabel={t('hide')}
						onChange={setConfirm}
						invalid={mismatch}
					/>
				</>
			)}

			<div aria-live="polite" className="flex flex-col gap-2">
				{clientError != null && (
					<p role="alert" className="text-danger text-sm">
						{clientError}
					</p>
				)}
				{state.error != null && (
					<p role="alert" className="text-danger text-sm">
						{state.error}
					</p>
				)}
				{state.notice != null && (
					<p role="status" className="text-success text-sm font-medium">
						{state.notice}
					</p>
				)}
			</div>

			<button type="submit" disabled={isPending} className={styles.submit}>
				{isPending && <SpinnerIcon size={18} />}
				{isPending ? t(isSignUp ? 'creating' : 'signingIn') : t(isSignUp ? 'create' : 'signIn')}
			</button>
		</form>
	)
}
