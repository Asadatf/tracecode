import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { BrandMark } from '@/components/ui/brand-mark'
import { headerNav } from '@/lib/home/header-nav'
import styles from '@/components/home/landing.module.css'

// The signed-out home header, for the public profile. It never reads the session
// (specs/features/public-profile-page.md AC7): whoever is looking sees the same bar,
// which is also what a person arriving from a shared link is. The section links point
// back to the home page, where those sections live.
export async function PublicProfileHeader() {
	const t = await getTranslations('LandingHeader')
	const nav = headerNav(false)

	return (
		<div className={styles.headerRail}>
			<header className={styles.header}>
				<Link href="/" aria-label={t('home')} className={styles.brand}>
					<BrandMark tone="dark" />
					tracecode
				</Link>
				<nav aria-label={t('nav')} className={styles.nav}>
					{nav.links.includes('how') && <Link href="/#how-it-works">{t('how')}</Link>}
					{nav.links.includes('problems') && <Link href="/#problems">{t('problems')}</Link>}
				</nav>
				<div className={styles.headerActions}>
					<Link href="/login" className={styles.headerSecondary}>
						{t('signIn')}
					</Link>
					<Link href="/register" className={styles.headerCta}>
						{t('register')}
					</Link>
				</div>
			</header>
		</div>
	)
}
