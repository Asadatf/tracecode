import { getTranslations } from 'next-intl/server'
import styles from '@/components/application.module.css'

export default async function ProgressLoading() {
	const t = await getTranslations('ProgressPage')
	return (
		<div className={styles.page}>
			<main
				role="status"
				aria-label={t('loading')}
				className="mx-auto max-w-6xl space-y-8 px-5 py-16 sm:px-8"
			>
				<span className="sr-only">{t('loading')}</span>
				<div aria-hidden="true" className="bg-surface h-12 w-56 rounded-lg" />
				<div aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					{[0, 1, 2, 3].map((key) => (
						<div key={key} className="bg-surface border-border h-32 rounded-lg border" />
					))}
				</div>
				<div aria-hidden="true" className="bg-surface border-border h-48 rounded-lg border" />
				<div
					aria-hidden="true"
					className="bg-surface border-border space-y-5 rounded-lg border p-6"
				>
					{[0, 1, 2, 3, 4, 5].map((key) => (
						<div key={key} className="bg-surface-hover h-8 rounded-sm" />
					))}
				</div>
			</main>
		</div>
	)
}
