import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { currentAccountSafe } from '@/server/auth/session'
import { getProfileSettings } from '@/server/profile/profile'
import { getLeaderboardConsent } from '@/server/challenge/leaderboard'
import { AppShell } from '@/components/app-shell/app-shell'
import { PublicProfileForm } from '@/components/settings/public-profile-form'
import { LEADERBOARD_VISIBLE } from '@/lib/challenge/visibility'
import { LeaderboardOptIn } from '@/components/settings/leaderboard-opt-in'
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
	const [t, profile, consent] = await Promise.all([
		getTranslations('SettingsPage'),
		getProfileSettings(),
		LEADERBOARD_VISIBLE ? getLeaderboardConsent() : null
	])
	return (
		<AppShell current="settings">
			<div className="flex w-full max-w-6xl flex-col gap-6 pb-12">
				<h1 className="m-0 text-3xl font-bold tracking-tight">{t('heading')}</h1>
				{/* One card: Profile beside Public profile (and the leaderboard choice under it). */}
				<div className="border-border bg-surface grid gap-10 rounded-lg border p-6 sm:p-8 lg:grid-cols-2 lg:gap-0">
					<section aria-labelledby="profile-heading" className="lg:pr-12">
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
					<div className="border-border flex flex-col gap-10 lg:border-l lg:pl-12">
						{profile.authenticated && profile.available ? (
							<PublicProfileForm
								initial={{ username: profile.username, visibility: profile.visibility }}
							/>
						) : (
							<p role="status" className="text-warning m-0">
								{t('unavailable')}
							</p>
						)}
						{consent != null && consent.authenticated && consent.available ? (
							<div className="border-border border-t pt-10">
								<LeaderboardOptIn initial={consent.optIn} hasUsername={consent.hasUsername} />
							</div>
						) : null}
					</div>
				</div>
			</div>
		</AppShell>
	)
}
