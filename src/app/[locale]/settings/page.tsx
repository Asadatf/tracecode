import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { getPreferences } from '@/server/notifications/inbox'
import { AppShell } from '@/components/app-shell/app-shell'
import { ReminderPreferences } from '@/components/notifications/reminder-preferences'
import { Input } from '@/components/ui/input'

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations('SettingsPage')
	return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

export default async function SettingsPage() {
	const account = await currentAccountSafe()
	if (account == null) {
		redirect({ href: '/login?next=%2Fsettings', locale: await getLocale() })
		return null
	}
	const [t, preferences] = await Promise.all([getTranslations('SettingsPage'), getPreferences()])
	return (
		<AppShell account={account} current="settings">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-12">
				<div>
					<h1 className="m-0 text-3xl font-bold tracking-tight">{t('heading')}</h1>
				</div>
				<section
					aria-labelledby="profile-heading"
					className="border-border bg-surface rounded-lg border p-6 sm:p-8"
				>
					<h2 id="profile-heading" className="text-lg font-bold">
						{t('profile')}
					</h2>
					<p className="text-text-muted mt-1 text-sm">{t('profileDescription')}</p>
					<label htmlFor="account-email" className="mt-6 mb-2 block text-sm font-semibold">
						{t('email')}
					</label>
					<Input
						id="account-email"
						value={account.email ?? t('emailMissing')}
						readOnly
						aria-describedby="email-help"
						className="bg-surface-subtle text-text-muted"
					/>
					<p id="email-help" className="text-text-muted mt-2 text-sm">
						{t('emailHelp')}
					</p>
					<p className="text-text-muted mt-5 text-sm">{t('profileDeferred')}</p>
				</section>
				{preferences.authenticated && preferences.available ? (
					<ReminderPreferences
						initial={{ inAppEnabled: preferences.inAppEnabled, emailOptIn: preferences.emailOptIn }}
						emailConfigured={preferences.emailConfigured}
						labels={{
							heading: t('reminders.heading'),
							description: t('reminders.description'),
							inApp: t('reminders.inApp'),
							inAppHelp: t('reminders.inAppHelp'),
							email: t('reminders.email'),
							emailHelp: t('reminders.emailHelp'),
							emailUnavailable: t('reminders.emailUnavailable'),
							saved: t('reminders.saved'),
							failed: t('reminders.failed'),
							saving: t('saving'),
							cadence: t('cadence'),
							daily: t('daily')
						}}
					/>
				) : (
					<p role="status" className="border-border bg-surface text-warning rounded-lg border p-6">
						{t('unavailable')}
					</p>
				)}
			</div>
		</AppShell>
	)
}
