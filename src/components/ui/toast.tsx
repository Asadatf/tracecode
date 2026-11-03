'use client'

import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { CloseIcon } from '@/components/ui/icons'

export const ToastProvider = ToastPrimitives.Provider

export function ToastViewport({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Viewport>) {
	return (
		<ToastPrimitives.Viewport
			className={cn(
				'fixed right-0 bottom-0 z-50 flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm',
				className
			)}
			{...props}
		/>
	)
}

const toastVariants = cva(
	// Solid colours with white text, the same in light and dark mode. Slides in
	// from the right on open and out on close (keyframes in globals.css); the
	// Toaster delays unmounting so the exit plays.
	'pointer-events-auto relative flex w-full items-start justify-between gap-3 rounded-xl p-4 text-white shadow-lg data-[state=closed]:animate-[toast-out_220ms_ease-in_forwards] data-[state=open]:animate-[toast-in_360ms_cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:animate-none',
	{
		variants: {
			variant: {
				default: 'bg-[#17231e]',
				success: 'bg-[#087a56]',
				destructive: 'bg-[#b44837]'
			}
		},
		defaultVariants: { variant: 'default' }
	}
)

export function Toast({
	className,
	variant,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>) {
	return <ToastPrimitives.Root className={cn(toastVariants({ variant }), className)} {...props} />
}

export function ToastTitle({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Title>) {
	return <ToastPrimitives.Title className={cn('text-sm font-semibold', className)} {...props} />
}

export function ToastDescription({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Description>) {
	return <ToastPrimitives.Description className={cn('text-sm opacity-90', className)} {...props} />
}

export function ToastClose({
	className,
	...props
}: React.ComponentProps<typeof ToastPrimitives.Close>) {
	return (
		<ToastPrimitives.Close
			aria-label="Dismiss"
			className={cn(
				'shrink-0 rounded opacity-70 hover:opacity-100',
				'focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
				className
			)}
			{...props}
		>
			{/* Decorative: the button already carries aria-label="Dismiss". */}
			<CloseIcon />
		</ToastPrimitives.Close>
	)
}
