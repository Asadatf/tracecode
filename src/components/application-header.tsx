import { Suspense } from 'react'
import { cn } from '@/lib/cn'
import { BrandMark } from '@/components/ui/brand-mark'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { AccountMenu } from '@/components/account-menu'
import { SignOutForm } from '@/components/auth/sign-out-form'
import { NotificationBellSlot } from '@/components/notifications/notification-bell-slot'
import styles from './application.module.css'

export async function ApplicationHeader({
	account,
	current,
	variant = 'app'
}: {
	account: { email: string | null }
	current?: 'settings'
	variant?: 'home' | 'app'
}) {
	const t = await getTranslations('ApplicationNav')
	return (
		<div className={cn(styles.headerRail, variant === 'home' && styles.homeHeader)}>
			<header className={styles.header}>
				<Link href="/" aria-label={t('home')} className={styles.brand}>
					<BrandMark tone={variant === 'home' ? 'dark' : 'light'} />
					tracecode
				</Link>
				<nav aria-label={t('nav')} className={styles.nav}>
					{variant === 'home' ? <Link href="/#how-it-works">{t('how')}</Link> : null}
					<Link href="/#problems">{t('problems')}</Link>
				</nav>
				<div className={styles.actions}>
					<Suspense fallback={<span className="size-9" aria-hidden="true" />}>
						<NotificationBellSlot />
					</Suspense>
					<SignOutForm>
						<button type="submit" className={styles.signOut}>
							{t('signOut')}
						</button>
					</SignOutForm>
					<AccountMenu
						isSettings={current === 'settings'}
						email={account.email}
						labels={{
							account: t('account'),
							signedInAs: t('signedInAs'),
							settings: t('settings'),
							signOut: t('signOut')
						}}
					/>
				</div>
			</header>
		</div>
	)
}
