import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/routing'
import { BrandMark } from '@/components/ui/brand-mark'
import { AuthVisual } from './auth-visual'
import styles from './auth.module.css'

// The split-screen frame shared by /login and /register so they read as two
// states of one design: form first (and alone on a phone), brand panel beside
// it from 1024px up (DESIGN_DECISIONS.md Q13).
export async function AuthShell({
	variant,
	title,
	description,
	children,
	footer
}: {
	variant: 'sign-in' | 'register'
	title: string
	description: string
	children: React.ReactNode
	footer: React.ReactNode
}) {
	const t = await getTranslations('Auth')
	return (
		<main key={variant} className={styles.shell}>
			<section className={styles.formPanel}>
				<Link href="/" aria-label={t('home')} className={styles.brand}>
					<BrandMark tone="light" />
					tracecode
				</Link>
				<div className={styles.formWrap}>
					<h1 className={styles.title}>{title}</h1>
					<p className={styles.description}>{description}</p>
					{children}
					<p className={styles.switch}>{footer}</p>
				</div>
			</section>
			<AuthVisual variant={variant} />
		</main>
	)
}
