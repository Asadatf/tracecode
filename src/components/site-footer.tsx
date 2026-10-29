import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { SITE } from '@/lib/seo/site'

// The privacy, terms and contact links every public page carries, which is
// how a person or an answer engine tells who stands behind the site
// (choose.trust.policy, choose.trust.contact). Each shows once it is set in
// SITE; docs/rules/seo.md makes all three a launch requirement.
export async function SiteFooter() {
	const t = await getTranslations('SiteFooter')
	const links = [
		{ href: SITE.privacyHref, label: t('privacy') },
		{ href: SITE.termsHref, label: t('terms') }
	].filter((link): link is { href: string; label: string } => link.href != null)
	if (links.length === 0 && SITE.contactEmail == null) return null

	return (
		<footer className="text-text-muted mx-auto flex max-w-2xl flex-wrap gap-x-6 gap-y-2 px-6 py-8 text-sm">
			{links.map((link) => (
				<Link key={link.label} href={link.href} className="hover:text-text">
					{link.label}
				</Link>
			))}
			{SITE.contactEmail == null ? null : (
				// The address shown as text, not only behind mailto: a crawler drops
				// non-http links, so it reads the text.
				<a href={`mailto:${SITE.contactEmail}`} className="hover:text-text">
					{t('contact')}: {SITE.contactEmail}
				</a>
			)}
		</footer>
	)
}
