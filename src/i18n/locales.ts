import { defineRouting } from 'next-intl/routing'

// Add locales here as the project needs them. Keep the list short at
// launch — every locale added here needs a matching messages/<locale>.json
// or it silently falls back to the default (see request.ts), and
// `pnpm test` includes an i18n-completeness check once real message keys
// exist (see scripts/ once the project has more than the example page).
export const routing = defineRouting({
	locales: ['en'],
	defaultLocale: 'en',
	// The default locale is served unprefixed (/about, not /en/about); every
	// other locale keeps its prefix (/de/about). /en/... redirects to /...
	localePrefix: 'as-needed'
})
