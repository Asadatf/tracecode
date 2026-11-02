export function accountInitials(email: string | null): string {
	const local = email?.split('@')[0]?.trim() ?? ''
	const parts = local.split(/[._+\s-]+/u).filter(Boolean)
	const first = Array.from(parts[0] ?? '')[0] ?? '?'
	const last = parts.length > 1 ? (Array.from(parts[parts.length - 1] ?? '')[0] ?? '') : ''
	return (first + last).toLocaleUpperCase()
}
