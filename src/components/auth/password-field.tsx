'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EyeIcon, EyeOffIcon } from '@/components/ui/icons'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/credentials'

export interface PasswordFieldProps {
	id: string
	name?: string
	label: string
	autoComplete: 'current-password' | 'new-password'
	showLabel: string
	hideLabel: string
	describedBy?: string
	// Only the bounds the backend enforces on a NEW password; sign-in sends
	// whatever was typed and lets Supabase say "incorrect".
	enforceLength?: boolean
	onChange?: (value: string) => void
	invalid?: boolean
}

// A password input with a show/hide toggle. The toggle is a real button with a
// state-bearing label, large enough to tap, and never submits the form.
export function PasswordField({
	id,
	name,
	label,
	autoComplete,
	showLabel,
	hideLabel,
	describedBy,
	enforceLength = false,
	onChange,
	invalid
}: PasswordFieldProps) {
	const [visible, setVisible] = useState(false)
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<div className="relative">
				<Input
					id={id}
					name={name}
					type={visible ? 'text' : 'password'}
					autoComplete={autoComplete}
					required
					minLength={enforceLength ? MIN_PASSWORD_LENGTH : undefined}
					maxLength={MAX_PASSWORD_LENGTH}
					aria-describedby={describedBy}
					aria-invalid={invalid ? true : undefined}
					onChange={onChange == null ? undefined : (event) => onChange(event.target.value)}
					className="h-11 pr-12"
				/>
				<button
					type="button"
					onClick={() => setVisible((current) => !current)}
					aria-pressed={visible}
					aria-label={visible ? hideLabel : showLabel}
					className="text-text-muted hover:text-text focus-visible:outline-accent absolute top-0 right-0 grid size-11 place-items-center rounded focus-visible:outline focus-visible:outline-2"
				>
					{visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
				</button>
			</div>
		</div>
	)
}
