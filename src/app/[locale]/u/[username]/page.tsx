import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { localizedPath, robotsFor } from '@/lib/seo/metadata'
import { SITE, siteUrl } from '@/lib/seo/site'
import { ProfileIdentity } from '@/components/profile/profile-identity'
import { Surface } from '@/components/navigation/navigation-curtain'
import { PublicProfileHeader } from '@/components/profile/public-profile-header'
import { ActivitySkeleton, StatsSkeleton } from '@/components/profile/profile-skeleton'
import { PublicProfileBody } from '@/components/profile/public-profile-body'
import { loadPublicProfileStats, resolvePublicProfile } from '@/server/profile/public-profile'
import styles from '@/components/profile/profile.module.css'

// specs/features/public-profile-page.md. A learner's shareable profile, at /u/<name>.
//
// Only an explicitly PUBLIC profile with a valid username resolves. A private, unset,
// malformed or nonexistent one all end in the same notFound(), before anything about
// the account is read, so the response cannot tell them apart. The page is resolved
// before it streams, so that 404 is a real 404; only the statistics stream in behind
// a skeleton. Nothing here takes a user id from the request or the session: the data
// is the resolved owner's, read-only.
//
// noindex: a learner who makes their profile public means "anyone with the link", not
// "search engines"; link previews (Open Graph) work regardless.

const NOT_FOUND_METADATA: Metadata = { title: SITE.name, robots: robotsFor(true) }

export async function generateMetadata({
	params
}: {
	params: Promise<{ locale: string; username: string }>
}): Promise<Metadata> {
	const { locale, username } = await params
	const lookup = await resolvePublicProfile(username)
	// Not found and unavailable share one generic head: it reveals nothing.
	if (lookup.status !== 'found') return NOT_FOUND_METADATA

	const [t, result] = await Promise.all([
		getTranslations({ locale, namespace: 'PublicProfile.meta' }),
		loadPublicProfileStats(lookup.owner)
	])
	const name = lookup.owner.username
	const title = t('title', { username: name })
	// The description states only what the saved data shows, or nothing about numbers.
	const description =
		result.status === 'ready' && !result.stats.empty
			? t('description', {
					username: name,
					solved: result.stats.solved,
					longest: result.stats.streak.longest
				})
			: t('descriptionBasic', { username: name })
	const url = `${siteUrl()}${localizedPath(`/u/${name}`, locale)}`
	return {
		title,
		description,
		alternates: { canonical: url },
		robots: robotsFor(true),
		openGraph: { type: 'profile', title, description, url, siteName: SITE.name, username: name },
		twitter: { card: 'summary_large_image', title, description }
	}
}

export default async function PublicProfilePage({
	params
}: {
	params: Promise<{ locale: string; username: string }>
}) {
	const { locale, username } = await params
	const lookup = await resolvePublicProfile(username)
	if (lookup.status === 'not_found') notFound()

	const t = await getTranslations('PublicProfile')
	// A storage failure, not a missing profile. It happens identically whichever name
	// was asked for, and the page does not echo the name back.
	if (lookup.status === 'unavailable') {
		return (
			<Surface tone="dark">
				<div className={styles.page}>
					<PublicProfileHeader />
					<main className={styles.content}>
						<p role="status" className={`${styles.panel} ${styles.note} ${styles.warn}`}>
							{t('unavailablePage')}
						</p>
					</main>
				</div>
			</Surface>
		)
	}

	const { owner } = lookup
	// One canonical lower-case address per profile, however it was typed.
	if (username !== owner.username) {
		redirect({ href: `/u/${owner.username}`, locale: locale || (await getLocale()) })
	}
	const url = `${siteUrl()}${localizedPath(`/u/${owner.username}`, locale)}`

	return (
		<Surface tone="dark">
			<div className={styles.page}>
				<PublicProfileHeader />
				<main className={styles.content}>
					<Suspense
						fallback={
							<>
								<ProfileIdentity username={owner.username} url={url}>
									<StatsSkeleton label={t('loading')} />
								</ProfileIdentity>
								<ActivitySkeleton />
							</>
						}
					>
						<PublicProfileBody owner={owner} url={url} />
					</Suspense>
				</main>
			</div>
		</Surface>
	)
}
