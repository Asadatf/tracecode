import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { QueryProvider } from '@/components/query-provider'
import { AnalyticsProvider } from '@/lib/analytics/analytics-provider'
import { Toaster } from '@/components/ui/toaster'
import { SiteFooter } from '@/components/site-footer'
import { JsonLd, organizationJsonLd, webSiteJsonLd } from '@/lib/seo/json-ld'
import { SITE, siteUrl } from '@/lib/seo/site'
import '../globals.css'

// The defaults every page inherits. Each page's own title, description,
// canonical, share card and robots come from pageMetadata(), or a noindex of
// its own (docs/rules/seo.md). No robots here: the 404 page would carry it
// beside the noindex Next gives it.
export const metadata: Metadata = {
	metadataBase: new URL(siteUrl()),
	title: SITE.name,
	applicationName: SITE.name,
	verification: {
		google: SITE.verification.google ?? undefined,
		other: SITE.verification.bing == null ? {} : { 'msvalidate.01': SITE.verification.bing }
	}
}

export default async function LocaleLayout({
	children,
	params
}: {
	children: React.ReactNode
	params: Promise<{ locale: string }>
}) {
	const { locale } = await params
	if (!hasLocale(routing.locales, locale)) {
		notFound()
	}

	return (
		<html lang={locale}>
			<body>
				<AnalyticsProvider />
				<NextIntlClientProvider>
					<QueryProvider>{children}</QueryProvider>
					<SiteFooter />
				</NextIntlClientProvider>
				<Toaster />
				<JsonLd data={organizationJsonLd()} />
				<JsonLd data={webSiteJsonLd(locale)} />
				{/* Vercel Web Analytics: visitors and page views, beside PostHog's
				    product events (docs/rules/analytics.md). Collects nothing until
				    Web Analytics is switched on for the project in Vercel. */}
				<Analytics />
			</body>
		</html>
	)
}
