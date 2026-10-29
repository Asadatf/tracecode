import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { withSentryConfig } from '@sentry/nextjs'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// The five headers every SEO audit grades (tech.transport.headers). The CSP
// only restricts framing, <base> and plugins, so it breaks no script, style or
// connection; tighten it per project once you know its origins.
const SECURITY_HEADERS = [
	{ key: 'Strict-Transport-Security', value: 'max-age=63072000' },
	{
		key: 'Content-Security-Policy',
		value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'"
	},
	{ key: 'X-Frame-Options', value: 'SAMEORIGIN' },
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
]

const nextConfig: NextConfig = {
	poweredByHeader: false,
	// Next streams generateMetadata into the body for any client not on its own
	// bot list, so a crawler it doesn't know (most answer engines, our SEO
	// platform) reads a page with no title, description or canonical in the
	// head (tech.head.streamed). Matching every client keeps it in the head.
	htmlLimitedBots: /.*/,
	async headers() {
		return [
			{ source: '/:path*', headers: SECURITY_HEADERS },
			// The production deployment also answers on its *.vercel.app alias, a
			// duplicate of the real domain that reports VERCEL_ENV production too.
			{
				source: '/:path*',
				has: [{ type: 'host', value: '.*\\.vercel\\.app' }],
				headers: [{ key: 'X-Robots-Tag', value: 'noindex' }]
			}
		]
	},
	reactStrictMode: true,
	// Top-level as of Next.js 16, not under `experimental`. Strictest
	// setting: any Compiler bailout fails the build instead of silently
	// skipping optimization for that component. Catch Compiler-incompatible code at build time, not as a
	// silent perf regression in prod.
	reactCompiler: {
		panicThreshold: 'all_errors'
	}
}

export default withSentryConfig(withNextIntl(nextConfig), {
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
	silent: !process.env.CI,
	widenClientFileUpload: true
	// disableLogger is deprecated and unsupported under Turbopack (our
	// default bundler) — Sentry's tree-shaking of its own debug logging
	// happens automatically now, nothing to configure here.
})
