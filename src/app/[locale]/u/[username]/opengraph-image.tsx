import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/seo/site'
import { loadPublicProfileStats, resolvePublicProfile } from '@/server/profile/public-profile'

// The share card for a public profile (LinkedIn, X, chat apps): the username and
// three real numbers from the saved data. For anything that is not a public profile
// — private, unset, nonexistent, or an outage — it is the plain brand card, the same
// image for all of them, so it reveals nothing about any account.
export const alt = `${SITE.name} learning profile`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const card = {
	width: '100%',
	height: '100%',
	display: 'flex',
	flexDirection: 'column',
	justifyContent: 'center',
	padding: 80,
	background: '#0f1412',
	color: '#eef2ef'
} as const

export default async function ProfileImage({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params
	const lookup = await resolvePublicProfile(username)
	if (lookup.status !== 'found') {
		return new ImageResponse(
			<div style={{ ...card, alignItems: 'center', fontSize: 72, fontWeight: 700 }}>
				{SITE.name}
			</div>,
			size
		)
	}
	const result = await loadPublicProfileStats(lookup.owner)
	const stats =
		result.status === 'ready' && !result.stats.empty
			? [
					{ label: 'Problems solved', value: String(result.stats.solved) },
					{ label: 'Practice runs', value: String(result.stats.runs) },
					{ label: 'Longest streak', value: `${result.stats.streak.longest} d` }
				]
			: []
	return new ImageResponse(
		<div style={card}>
			<div style={{ display: 'flex', fontSize: 30, color: '#39a67e', fontWeight: 700 }}>
				{SITE.name}
			</div>
			<div style={{ display: 'flex', fontSize: 84, fontWeight: 700, marginTop: 24 }}>
				{lookup.owner.username}
			</div>
			<div style={{ display: 'flex', fontSize: 32, color: '#a9b5ae', marginTop: 8 }}>
				Learning profile
			</div>
			<div style={{ display: 'flex', gap: 56, marginTop: 56 }}>
				{stats.map((stat) => (
					<div key={stat.label} style={{ display: 'flex', flexDirection: 'column' }}>
						<div style={{ display: 'flex', fontSize: 64, fontWeight: 700 }}>{stat.value}</div>
						<div style={{ display: 'flex', fontSize: 26, color: '#a9b5ae' }}>{stat.label}</div>
					</div>
				))}
			</div>
		</div>,
		size
	)
}
