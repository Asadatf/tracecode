import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SiteHeader } from '@/components/site-header'
import { UnsubscribeConfirm } from '@/components/notifications/unsubscribe-confirm'
import { isWellFormedUnsubscribeToken } from '@/lib/notifications/queries'

// The landing page for the unsubscribe link in reminder emails (M7.5B). Personal
// and token-bearing, so never indexed (also opts it out of PUBLIC_PAGES).
export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('UnsubscribePage')
	return { title: t('metaTitle'), robots: { index: false } }
}

export default async function UnsubscribePage({
	searchParams
}: {
	searchParams: Promise<{ token?: string | string[] }>
}) {
	const [t, params] = await Promise.all([getTranslations('UnsubscribePage'), searchParams])
	const token = typeof params.token === 'string' ? params.token : null

	return (
		<>
			<SiteHeader />
			<main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 pt-12 pb-16">
				<h1 className="m-0 text-3xl font-bold tracking-tight">{t('heading')}</h1>
				{token != null && isWellFormedUnsubscribeToken(token) ? (
					<>
						<p className="text-text-muted m-0 leading-relaxed">{t('body')}</p>
						<UnsubscribeConfirm
							token={token}
							labels={{
								confirm: t('confirm'),
								working: t('working'),
								done: t('done'),
								failed: t('failed')
							}}
						/>
					</>
				) : (
					<p className="text-text-muted m-0 leading-relaxed">{t('invalid')}</p>
				)}
			</main>
		</>
	)
}
