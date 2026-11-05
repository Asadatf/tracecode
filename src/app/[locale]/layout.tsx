import type { Metadata } from 'next'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { NextIntlClientProvider, hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { QueryProvider } from '@/components/query-provider'
import { NavigationCurtainProvider } from '@/components/navigation/navigation-curtain'
import { AnalyticsProvider } from '@/lib/analytics/analytics-provider'
import { Toaster } from '@/components/ui/toaster'
import { SiteFooter } from '@/components/site-footer'
import { JsonLd, organizationJsonLd, webSiteJsonLd } from '@/lib/seo/json-ld'
import { SITE, siteUrl } from '@/lib/seo/site'
import '../globals.css'

// Self-hosted by next/font; globals.css maps these onto --font-sans/--font-mono.
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const jetBrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

// The defaults every page inherits. Each page's own title, description,
// canonical, share card and robots come from pageMetadata(), or a noindex of
// its own (docs/rules/seo.md). No robots here: the 404 page would carry it
// beside the noindex Next gives it.
export const metadata: Metadata = {
	metadataBase: new URL(siteUrl()),
	title: SITE.name,
	applicationName: SITE.name,
	// The brand's own files in public/brand. The SVG is the favicon; the PNG is for
	// browsers that do not take an SVG one; iOS needs a PNG for the home-screen icon.
	icons: {
		icon: [
			{ url: '/brand/tracecode-icon.svg', type: 'image/svg+xml' },
			{ url: '/brand/tracecode-icon-192.png', type: 'image/png', sizes: '192x192' }
		],
		apple: [{ url: '/brand/tracecode-icon-180.png', type: 'image/png', sizes: '180x180' }]
	},
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
		<html lang={locale} className={`${dmSans.variable} ${jetBrainsMono.variable}`}>
			<body>
				<AnalyticsProvider />
				<NextIntlClientProvider>
					<NavigationCurtainProvider>
						<QueryProvider>{children}</QueryProvider>
						<SiteFooter />
					</NavigationCurtainProvider>
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
