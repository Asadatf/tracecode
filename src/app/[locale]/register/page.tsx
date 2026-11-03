import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { AuthForm } from '@/components/auth/auth-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { authHref, safeReturnTo } from '@/lib/auth/return-to'
import { currentUserIdSafe } from '@/server/auth/session'

export const metadata: Metadata = {
	title: 'Create account | TraceCode',
	robots: { index: false }
}

export default async function RegisterPage({
	searchParams
}: {
	searchParams: Promise<{ next?: string | string[] }>
}) {
	const { next } = await searchParams
	const requested = typeof next === 'string' ? next : null

	if ((await currentUserIdSafe()) != null) {
		redirect({ href: safeReturnTo(requested), locale: await getLocale() })
	}

	const t = await getTranslations('Auth.registerPage')
	return (
		<AuthShell
			variant="register"
			title={t('title')}
			description={t('description')}
			footer={
				<>
					{t('switchPrompt')} <Link href={authHref('login', requested)}>{t('switchLink')}</Link>
				</>
			}
		>
			<AuthForm mode="sign-up" next={requested == null ? null : safeReturnTo(requested)} />
		</AuthShell>
	)
}
