'use client'

import { useActionState } from 'react'
import { authenticateAction, type AuthFormState } from '@/server/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const INITIAL_STATE: AuthFormState = {}

// One form, two submit buttons: the clicked button's name/value ("mode") tells
// the server action whether this is a sign-in or a sign-up.
export function LoginForm() {
	const [state, formAction, isPending] = useActionState(authenticateAction, INITIAL_STATE)

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="email">Email</Label>
				<Input id="email" name="email" type="email" autoComplete="email" required />
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="password">Password</Label>
				<Input
					id="password"
					name="password"
					type="password"
					autoComplete="current-password"
					minLength={8}
					maxLength={72}
					required
				/>
			</div>

			{state.error != null && (
				<p role="alert" className="text-danger text-sm">
					{state.error}
				</p>
			)}
			{state.notice != null && (
				<p role="status" className="text-success text-sm">
					{state.notice}
				</p>
			)}

			<div className="flex gap-2">
				<Button type="submit" name="mode" value="sign-in" disabled={isPending}>
					Sign in
				</Button>
				<Button type="submit" name="mode" value="sign-up" variant="outline" disabled={isPending}>
					Create account
				</Button>
			</div>
		</form>
	)
}
