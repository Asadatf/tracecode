import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { CopyProfileLink } from './copy-profile-link'
import styles from './profile.module.css'

// Panel one of a public profile: who it is on the left, the numbers (or their
// skeleton) on the right. It renders before the statistics load, so the name and the
// copy-link control are on screen first; `children` is the statistics slot.
export async function ProfileIdentity({
	username,
	url,
	children
}: {
	username: string
	url: string
	children: ReactNode
}) {
	const t = await getTranslations('PublicProfile')

	return (
		<section aria-labelledby="profile-name" className={`${styles.panel} ${styles.identityPanel}`}>
			<div className={styles.identity}>
				<p className={styles.eyebrow}>{t('eyebrow')}</p>
				<h1 id="profile-name" className={styles.name}>
					{username}
				</h1>
				<p className={styles.subtitle}>{t('subtitle')}</p>
				<CopyProfileLink url={url} />
			</div>
			{children}
		</section>
	)
}
