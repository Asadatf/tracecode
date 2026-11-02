import Image from 'next/image'
import { accountInitials } from '@/lib/auth/account-initials'

// The account's picture: a photo when one is supplied, the email's initials
// otherwise. No avatar image is stored yet (specs/features/dashboard-page.md
// AC20), so callers pass only `email` today; the photo branch is ready for the
// day a source exists. Decorative — the control that wraps it carries the label.
export function Avatar({
	email,
	src,
	size = 36
}: {
	email: string | null
	src?: string | null
	size?: number
}) {
	if (src != null && src !== '') {
		return (
			<Image
				src={src}
				alt=""
				width={size}
				height={size}
				unoptimized
				className="rounded-full object-cover"
			/>
		)
	}
	return <span aria-hidden="true">{accountInitials(email)}</span>
}
