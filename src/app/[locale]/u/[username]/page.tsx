import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link, redirect } from '@/i18n/routing'
import { localizedPath, robotsFor } from '@/lib/seo/metadata'
import { SITE, siteUrl } from '@/lib/seo/site'
import { Button } from '@/components/ui/button'
import { CopyProfileLink } from '@/components/profile/copy-profile-link'
import { ProfileSkeleton } from '@/components/profile/profile-skeleton'
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
	const header = (
		<header className={styles.top}>
			<Link href="/" className={styles.brand} aria-label={t('home')}>
				<span aria-hidden="true" className={styles.brandMark}>
					⌁
				</span>
				tracecode
			</Link>
			<Button asChild size="sm" variant="outline">
				<Link href="/" className={styles.cta}>
					{t('cta')}
				</Link>
			</Button>
		</header>
	)

	// A storage failure, not a missing profile. It happens identically whichever name
	// was asked for, and the page does not echo the name back.
	if (lookup.status === 'unavailable') {
		return (
			<div className={styles.page}>
				{header}
				<main className={styles.main}>
					<p role="status" className={`${styles.card} ${styles.note} ${styles.warn}`}>
						{t('unavailablePage')}
					</p>
				</main>
			</div>
		)
	}

	const { owner } = lookup
	// One canonical lower-case address per profile, however it was typed.
	if (username !== owner.username) {
		redirect({ href: `/u/${owner.username}`, locale: locale || (await getLocale()) })
	}
	const url = `${siteUrl()}${localizedPath(`/u/${owner.username}`, locale)}`

	return (
		<div className={styles.page}>
			{header}
			<main className={styles.main}>
				<section aria-labelledby="profile-name" className={`${styles.card} ${styles.hero}`}>
					<span className={styles.avatar} aria-hidden="true">
						{owner.username.charAt(0)}
					</span>
					<div className={styles.identity}>
						<h1 id="profile-name" className={styles.name}>
							{owner.username}
						</h1>
						<p className={styles.tagline}>{t('tagline')}</p>
					</div>
					<CopyProfileLink url={url} />
				</section>
				<Suspense fallback={<ProfileSkeleton label={t('loading')} />}>
					<PublicProfileBody owner={owner} />
				</Suspense>
				<p className={styles.foot}>{t('footnote')}</p>
			</main>
		</div>
	)
}
