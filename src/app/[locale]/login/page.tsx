import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { LoginForm } from '@/components/auth/login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { currentUserIdSafe } from '@/server/auth/session'

// An account form, not a marketing page → noindex (which also opts it out of
// the SEO PUBLIC_PAGES requirement), like /progress.
export const metadata: Metadata = {
	title: 'Sign in — TraceCode',
	robots: { index: false }
}

export default async function LoginPage() {
	if ((await currentUserIdSafe()) != null) {
		redirect({ href: '/progress', locale: await getLocale() })
	}

	return (
		<main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10 sm:px-6">
			<Card>
				<CardHeader>
					<CardTitle>Sign in to TraceCode</CardTitle>
					<CardDescription>
						An account saves your attempts and progress across devices. Practising works without
						one.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<LoginForm />
				</CardContent>
			</Card>
		</main>
	)
}
