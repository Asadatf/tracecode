'use client'

import type { ReactNode } from 'react'
import { signOutAction } from '@/server/actions/auth'
import { clearAllTutorConversations } from '@/lib/tutor/conversation-store'

// Thin client wrapper around `<form action={signOutAction}>` so we can clear
// the per-tab AI Tutor sessionStorage BEFORE the server action redirects
// (specs/features/contextual-ai-tutor.md AC9). Scoped to the
// `tracecode.tutor.*` prefix — nothing else in sessionStorage is touched.

export function SignOutForm({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<form
			action={signOutAction}
			className={className}
			onSubmit={() => {
				clearAllTutorConversations()
			}}
		>
			{children}
		</form>
	)
}
