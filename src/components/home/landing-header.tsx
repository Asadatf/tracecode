import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { signOutAction } from '@/server/actions/auth'
import { headerNav } from '@/lib/home/header-nav'
import { NotificationBellSlot } from '@/components/notifications/notification-bell-slot'
import { SignOutIcon } from '@/components/ui/icons'
import styles from './landing.module.css'

// Resolved on the server from the verified session (specs/features/auth-access.md
// AC1/AC2), so the first paint is already the right header for this visitor.
export async function LandingHeader() {
	const [t, account] = await Promise.all([getTranslations('LandingHeader'), currentAccountSafe()])
	const authenticated = account != null
	const nav = headerNav(authenticated)
	const initial = (account?.email ?? '?').charAt(0).toUpperCase()

	return (
		<div className={styles.headerRail}>
			<header className={styles.header}>
				<Link href="/" aria-label={t('home')} className={styles.brand}>
					<span aria-hidden="true" className={styles.brandMark}>
						⌁
					</span>
					tracecode
				</Link>
				<nav aria-label={t('nav')} className={styles.nav}>
					{nav.links.includes('how') && <a href="#how-it-works">{t('how')}</a>}
					{nav.links.includes('problems') && <a href="#problems">{t('problems')}</a>}
					{nav.links.includes('progress') && (
						<Link href="/progress" className={styles.navKeep}>
							{t('progress')}
						</Link>
					)}
				</nav>
				{authenticated ? (
					<div className={styles.headerActions}>
						<Suspense fallback={null}>
							<NotificationBellSlot />
						</Suspense>
						<Link
							href="/practice/two-sum"
							className={`${styles.headerCta} ${styles.headerCtaWide}`}
						>
							{t('cta')}
						</Link>
						<details className={styles.accountMenu}>
							<summary aria-label={t('account')} className={styles.accountButton}>
								<span aria-hidden="true">{initial}</span>
							</summary>
							<div className={styles.accountPanel}>
								{account.email != null && (
									<p className={styles.accountEmail}>
										<span>{t('signedInAs')}</span>
										{account.email}
									</p>
								)}
								<form action={signOutAction}>
									<button type="submit" className={styles.accountSignOut}>
										<SignOutIcon size={16} />
										{t('signOut')}
									</button>
								</form>
							</div>
						</details>
					</div>
				) : (
					<div className={styles.headerActions}>
						<Link href="/login" className={styles.headerSecondary}>
							{t('signIn')}
						</Link>
						<Link href="/register" className={styles.headerCta}>
							{t('register')}
						</Link>
					</div>
				)}
			</header>
		</div>
	)
}
