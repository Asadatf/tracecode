// The leaderboard opt-in (specs/features/daily-challenge.md § Consent). Separate from the
// public profile on purpose: choosing to share a profile never lists a learner on a
// leaderboard. Appearing needs a name to appear under, so opting in requires a username.

export type ConsentPlan =
	{ ok: true; change: boolean | null } | { ok: false; error: 'username_required' }

// `change` is the new value, or null when nothing changes.
export function planConsent(
	current: { optIn: boolean; username: string | null },
	wanted: boolean
): ConsentPlan {
	if (wanted && (current.username == null || current.username === '')) {
		return { ok: false, error: 'username_required' }
	}
	return { ok: true, change: wanted === current.optIn ? null : wanted }
}
