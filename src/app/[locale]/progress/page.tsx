import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/routing'

export const metadata: Metadata = { robots: { index: false } }

// /progress is retired: its sections moved into Overview (Progress card, Practice
// next, topics). Old bookmarks and emailed links land there instead of a 404.
// Nothing is read here and nothing stored is touched: attempts, analytics and the
// recommendation logic all stay. A signed-out visitor continues on to Sign In.
export default async function ProgressPage() {
	redirect({ href: '/dashboard', locale: await getLocale() })
}
