import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { authHref, safeReturnTo } from '@/lib/auth/return-to'
import { currentUserIdSafe } from '@/server/auth/session'

// An account form, not a marketing page → noindex (which also opts it out of
// the SEO PUBLIC_PAGES requirement), like /progress.
export const metadata: Metadata = {
	title: 'Sign in | TraceCode',
	robots: { index: false }
}

export default async function LoginPage({
	searchParams
}: {
	searchParams: Promise<{ next?: string | string[] }>
}) {
	const { next } = await searchParams
	const requested = typeof next === 'string' ? next : null

	// Already signed in: go where they were headed. safeReturnTo never yields
	// /login or /register, so this cannot loop.
	if ((await currentUserIdSafe()) != null) {
		redirect({ href: safeReturnTo(requested), locale: await getLocale() })
	}

	const t = await getTranslations('Auth.signInPage')
	return (
		<AuthShell
			variant="sign-in"
			title={t('title')}
			description={t('description')}
			footer={
				<>
					{t('switchPrompt')} <Link href={authHref('register', requested)}>{t('switchLink')}</Link>
				</>
			}
		>
			<AuthForm mode="sign-in" next={requested == null ? null : safeReturnTo(requested)} />
		</AuthShell>
	)
}
