'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckIcon, CopyIcon } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import styles from './profile.module.css'

// Copies the profile's public address. The address is shown as text too, so it can
// still be selected and copied by hand if the clipboard is blocked. The result is
// announced in a live region, not only by the button changing.
export function CopyProfileLink({ url }: { url: string }) {
	const t = useTranslations('PublicProfile.share')
	const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

	async function copy() {
		try {
			await navigator.clipboard.writeText(url)
			setState('copied')
		} catch {
			setState('failed')
		}
	}

	return (
		<div className={styles.share}>
			<div className={styles.shareRow}>
				<span className={styles.url} title={url}>
					{url}
				</span>
				<Button type="button" variant="outline" size="sm" onClick={copy}>
					{state === 'copied' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
					{state === 'copied' ? t('copied') : t('copy')}
				</Button>
			</div>
			<p className={styles.shareStatus} role="status" aria-live="polite">
				{state === 'copied' ? t('copiedNote') : state === 'failed' ? t('failed') : ''}
			</p>
		</div>
	)
}
