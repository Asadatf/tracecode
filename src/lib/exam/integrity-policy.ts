// integrity-policy@1 (specs/features/daily-exam.md AC25, ADR-0010 §7, ADR-0011). A pure,
// versioned, deterministic function from an attempt's server-recorded events to warnings,
// automatic deductions and review flags.
//
// Every event is a CLIENT-REPORTED observation, not proof (AC21, AC24). Only three reliable,
// directly observed, disclosed rules can deduct automatically — repeated tab hiding beyond a
// grace, repeated blocked paste/drag attempts, and fullscreen exits beyond a grace — and each is
// capped, as is the total. Everything weaker (window blur, possible screenshot shortcuts, screen
// counts, unsupported or denied checks, media interruptions, network loss, rate limiting,
// delivery gaps) is a review flag and NEVER deducts. Durations use the server's `receivedAt`
// only; client timestamps never decide anything.

export const POLICY_VERSION = 'integrity-policy@1'

export const POLICY_V1 = {
	tabGraceSeconds: 30,
	tabDeduction: 200,
	tabCap: 1000,
	pasteWarnings: 2,
	pasteDeduction: 100,
	pasteCap: 600,
	fullscreenFreeExits: 1,
	fullscreenGraceSeconds: 15,
	fullscreenStepSeconds: 15,
	fullscreenDeduction: 150,
	fullscreenCap: 600,
	totalCap: 2000
} as const

export const EVENT_TYPES = [
	'tab_hidden',
	'tab_visible',
	'window_blurred',
	'window_focused',
	'fullscreen_exited',
	'fullscreen_entered',
	'paste_blocked',
	'drag_insert_blocked',
	'screenshot_shortcut_observed',
	'screens_reported',
	'screens_changed',
	'screens_unsupported',
	'screens_denied',
	'camera_interrupted',
	'camera_restored',
	'microphone_interrupted',
	'microphone_restored',
	'screen_capture_interrupted',
	'screen_capture_restored',
	'network_offline',
	'network_online',
	'delivery_gap',
	'rate_limited'
] as const
export type IntegrityEventType = (typeof EVENT_TYPES)[number]

export interface PolicyEvent {
	type: IntegrityEventType
	receivedAt: Date
	// For screens_reported / screens_changed: the reported count, when one was reported.
	screenCount?: number
}

export type FlagKind =
	| 'window_blur'
	| 'screenshot_shortcut'
	| 'multiple_screens'
	| 'screen_check_unavailable'
	| 'camera_interruption'
	| 'microphone_interruption'
	| 'screen_capture_interruption'
	| 'network_interruption'
	| 'reporting_gap'

export interface PolicySummary {
	tabHides: number
	tabHiddenSeconds: number
	blockedInsertions: number
	fullscreenExits: number
	fullscreenOutsideSeconds: number
	windowBlurs: number
	screenshotShortcuts: number
	maxScreensReported: number | null
	screenCheck: 'reported' | 'unsupported' | 'denied' | 'not_run'
	mediaInterruptions: { camera: number; microphone: number; screen: number }
	networkInterruptions: number
	reportingGaps: number
}

export interface DeductionLine {
	rule: 'tab_hidden' | 'blocked_insertion' | 'fullscreen_exit'
	units: number
	points: number
}

export interface PolicyResult {
	policyVersion: typeof POLICY_VERSION
	summary: PolicySummary
	warnings: DeductionLine['rule'][]
	deductions: DeductionLine[]
	totalDeduction: number
	flags: { kind: FlagKind; count: number }[]
}

// Pairs start/end events in server order; an interval still open at closing ends at `closesAt`.
function intervals(
	events: readonly PolicyEvent[],
	start: IntegrityEventType,
	end: IntegrityEventType,
	closesAt: Date
): number[] {
	const out: number[] = []
	let openedAt: number | null = null
	for (const e of events) {
		if (e.type === start && openedAt == null) openedAt = e.receivedAt.getTime()
		else if (e.type === end && openedAt != null) {
			out.push(Math.max(0, e.receivedAt.getTime() - openedAt))
			openedAt = null
		}
	}
	if (openedAt != null) out.push(Math.max(0, closesAt.getTime() - openedAt))
	return out
}

const count = (events: readonly PolicyEvent[], type: IntegrityEventType) =>
	events.filter((e) => e.type === type).length

// `events` are the attempt's events received in [admittedAt, closesAt + 60 s); only those that
// happened during the exam window count towards durations, which end at `closesAt`.
export function applyPolicyV1(input: {
	events: readonly PolicyEvent[]
	admittedAt: Date
	closesAt: Date
}): PolicyResult {
	const p = POLICY_V1
	const events = [...input.events]
		.filter(
			(e) =>
				e.receivedAt.getTime() >= input.admittedAt.getTime() &&
				e.receivedAt.getTime() < input.closesAt.getTime()
		)
		.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())
	const all = [...input.events]

	const hides = intervals(events, 'tab_hidden', 'tab_visible', input.closesAt)
	const outside = intervals(events, 'fullscreen_exited', 'fullscreen_entered', input.closesAt)
	const blocked = count(events, 'paste_blocked') + count(events, 'drag_insert_blocked')

	// Tab: the first hide is a warning; each later hide costs once cumulative hidden time is past
	// the grace (the hide that crosses it included).
	let cumulative = 0
	let tabUnits = 0
	hides.forEach((ms, index) => {
		cumulative += ms
		if (index >= 1 && cumulative > p.tabGraceSeconds * 1000) tabUnits += 1
	})
	const tabPoints = Math.min(p.tabCap, tabUnits * p.tabDeduction)

	const pasteUnits = Math.max(0, blocked - p.pasteWarnings)
	const pastePoints = Math.min(p.pasteCap, pasteUnits * p.pasteDeduction)

	const outsideSeconds = Math.floor(outside.reduce((a, b) => a + b, 0) / 1000)
	const fullscreenUnits =
		Math.max(0, outside.length - p.fullscreenFreeExits) +
		Math.floor(Math.max(0, outsideSeconds - p.fullscreenGraceSeconds) / p.fullscreenStepSeconds)
	const fullscreenPoints = Math.min(p.fullscreenCap, fullscreenUnits * p.fullscreenDeduction)

	const deductions: DeductionLine[] = []
	if (tabPoints > 0) deductions.push({ rule: 'tab_hidden', units: tabUnits, points: tabPoints })
	if (pastePoints > 0)
		deductions.push({ rule: 'blocked_insertion', units: pasteUnits, points: pastePoints })
	if (fullscreenPoints > 0)
		deductions.push({ rule: 'fullscreen_exit', units: fullscreenUnits, points: fullscreenPoints })
	const totalDeduction = Math.min(
		p.totalCap,
		deductions.reduce((a, d) => a + d.points, 0)
	)

	const warnings: DeductionLine['rule'][] = []
	if (hides.length >= 1) warnings.push('tab_hidden')
	if (blocked >= 1) warnings.push('blocked_insertion')
	if (outside.length >= 1) warnings.push('fullscreen_exit')

	const screenCounts = events
		.filter((e) => e.type === 'screens_reported' || e.type === 'screens_changed')
		.map((e) => e.screenCount)
		.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0)
	const maxScreens = screenCounts.length === 0 ? null : Math.max(...screenCounts)
	const screenCheck: PolicySummary['screenCheck'] =
		maxScreens != null
			? 'reported'
			: count(events, 'screens_denied') > 0
				? 'denied'
				: count(events, 'screens_unsupported') > 0
					? 'unsupported'
					: 'not_run'

	const summary: PolicySummary = {
		tabHides: hides.length,
		tabHiddenSeconds: Math.floor(hides.reduce((a, b) => a + b, 0) / 1000),
		blockedInsertions: blocked,
		fullscreenExits: outside.length,
		fullscreenOutsideSeconds: outsideSeconds,
		windowBlurs: count(events, 'window_blurred'),
		screenshotShortcuts: count(events, 'screenshot_shortcut_observed'),
		maxScreensReported: maxScreens,
		screenCheck,
		mediaInterruptions: {
			camera: count(events, 'camera_interrupted'),
			microphone: count(events, 'microphone_interrupted'),
			screen: count(events, 'screen_capture_interrupted')
		},
		networkInterruptions: count(events, 'network_offline'),
		// Gaps and rate limiting are about delivery, so they count from every received event.
		reportingGaps: count(all, 'delivery_gap') + count(all, 'rate_limited')
	}

	const flags: PolicyResult['flags'] = []
	const flag = (kind: FlagKind, n: number) => {
		if (n > 0) flags.push({ kind, count: n })
	}
	flag('window_blur', summary.windowBlurs)
	flag('screenshot_shortcut', summary.screenshotShortcuts)
	flag('multiple_screens', maxScreens != null && maxScreens > 1 ? 1 : 0)
	flag(
		'screen_check_unavailable',
		screenCheck === 'unsupported' || screenCheck === 'denied' ? 1 : 0
	)
	flag('camera_interruption', summary.mediaInterruptions.camera)
	flag('microphone_interruption', summary.mediaInterruptions.microphone)
	flag('screen_capture_interruption', summary.mediaInterruptions.screen)
	flag('network_interruption', summary.networkInterruptions)
	flag('reporting_gap', summary.reportingGaps)

	return { policyVersion: POLICY_VERSION, summary, warnings, deductions, totalDeduction, flags }
}
