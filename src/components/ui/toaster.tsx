'use client'

import { useToast } from '@/lib/toast'
import { AlertIcon, SuccessIcon } from '@/components/ui/icons'
import {
	Toast,
	ToastClose,
	ToastDescription,
	ToastProvider,
	ToastTitle,
	ToastViewport
} from '@/components/ui/toast'

// Mounted once in the root layout. Call toast() from src/lib/toast.ts
// anywhere in the app to show one — nothing else to wire up per call site.
const EXIT_MS = 220

export function Toaster() {
	const { toasts, dismiss } = useToast()

	return (
		<ToastProvider>
			{toasts.map(({ id, title, description, variant }) => (
				<Toast
					key={id}
					variant={variant}
					// Let the exit animation play before the toast is removed.
					onOpenChange={(open) => !open && setTimeout(() => dismiss(id), EXIT_MS)}
				>
					{variant === 'success' ? <SuccessIcon size={20} /> : null}
					{variant === 'destructive' ? <AlertIcon size={20} /> : null}
					<div className="grid flex-1 gap-1">
						{title && <ToastTitle>{title}</ToastTitle>}
						{description && <ToastDescription>{description}</ToastDescription>}
					</div>
					<ToastClose />
				</Toast>
			))}
			<ToastViewport />
		</ToastProvider>
	)
}
