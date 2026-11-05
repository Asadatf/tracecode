import {
	LEADERBOARD_SIZE,
	rankStandings,
	standingFor,
	type StandingInput,
	type VerifiedAttemptRow
} from './scoring'

// Building the weekly leaderboard from VERIFIED attempts (specs/features/daily-challenge.md
// § Leaderboard). Pure. Inclusion is by the explicit `optedIn` consent only — a public
// profile alone never lists anyone — and a listed learner must also have a username to
// be shown under. Nothing here carries an email, an internal id or source code outward.

export interface WeekUser {
	// Internal id: used to join and to find the viewer, never returned.
	userId: string
	username: string | null
	optedIn: boolean
	profilePublic: boolean
	// Only this learner's graded, verified attempts for the week.
	rows: readonly VerifiedAttemptRow[]
}

export interface PublicEntry {
	rank: number
	username: string
	score: number
	daysSolved: number
	totalMs: number
	// A link to the learner's public profile, only when that profile is public.
	profilePath: string | null
}

export interface PrivateRank {
	// Position among the public competitors (with this learner counted in if they are
	// not one), computed by the same rules as the public board.
	rank: number
	competitors: number
	score: number
	daysSolved: number
	totalMs: number
	// Whether this learner appears on the public board.
	listed: boolean
}

export interface WeekBoard {
	entries: PublicEntry[]
	// How many opted-in learners have a verified result this week.
	competitors: number
	you: PrivateRank | null
}

function isListed(user: WeekUser): boolean {
	return user.optedIn && user.username != null && user.username !== ''
}

export function buildWeekBoard(users: readonly WeekUser[], viewerId: string | null): WeekBoard {
	const verified = users.filter((user) => user.rows.length > 0)
	const standings = new Map<string, StandingInput>(
		verified.map((user) => [user.userId, standingFor(user.userId, user.rows)])
	)
	const listed = verified.filter(isListed)
	const ranked = rankStandings(listed.map((user) => standings.get(user.userId)!))
	const byId = new Map(verified.map((user) => [user.userId, user]))

	// The first LEADERBOARD_SIZE rows in rank order (ties share a rank).
	const entries: PublicEntry[] = ranked.slice(0, LEADERBOARD_SIZE).map(({ rank, entry }) => {
		const user = byId.get(entry.key)!
		return {
			rank,
			username: user.username!,
			score: entry.score,
			daysSolved: entry.daysSolved,
			totalMs: entry.totalMs,
			profilePath: user.profilePublic ? `/u/${user.username}` : null
		}
	})

	let you: PrivateRank | null = null
	const mine = viewerId == null ? undefined : standings.get(viewerId)
	if (mine != null && viewerId != null) {
		const viewer = byId.get(viewerId)!
		const set = isListed(viewer)
			? ranked.map((r) => r.entry)
			: [...ranked.map((r) => r.entry), mine]
		const position = rankStandings(set).find((r) => r.entry.key === viewerId)
		you = {
			rank: position?.rank ?? set.length,
			competitors: set.length,
			score: mine.score,
			daysSolved: mine.daysSolved,
			totalMs: mine.totalMs,
			listed: isListed(viewer)
		}
	}
	return { entries, competitors: listed.length, you }
}

export interface SnapshotRow {
	userId: string
	// Rank among the public competitors; null for a learner who had not opted in.
	rank: number | null
	isPublic: boolean
	score: number
	daysSolved: number
	totalMs: number
}

// The frozen result of a closed week: every verified participant, ranked only among
// those who had opted in when the week closed.
export function buildSnapshot(users: readonly WeekUser[]): SnapshotRow[] {
	const verified = users.filter((user) => user.rows.length > 0)
	const standings = new Map(verified.map((u) => [u.userId, standingFor(u.userId, u.rows)]))
	const ranks = new Map(
		rankStandings(verified.filter(isListed).map((u) => standings.get(u.userId)!)).map((r) => [
			r.entry.key,
			r.rank
		])
	)
	return verified.map((user) => {
		const s = standings.get(user.userId)!
		const isPublic = isListed(user)
		return {
			userId: user.userId,
			rank: isPublic ? (ranks.get(user.userId) ?? null) : null,
			isPublic,
			score: s.score,
			daysSolved: s.daysSolved,
			totalMs: s.totalMs
		}
	})
}
