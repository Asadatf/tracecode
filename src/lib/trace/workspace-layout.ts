// The Practice workspace's pane sizes (specs/features/practice-workspace-layout.md
// AC4–AC7). Pure maths and a tiny cookie format, so the limits are unit tested
// and the server can render the saved layout on the first paint.

export const LAYOUT_DEFAULTS = { left: 20, top: 45, tutor: 28 } as const
export const LAYOUT_COOKIE = 'tc-practice-layout'

const MIN_LEFT_PX = 280
const MIN_LEFT_PCT = 20
const MAX_LEFT_PCT = 60
const MIN_CODE_PX = 180
const MIN_CODE_PCT = 30
const MAX_CODE_PCT = 75
const MIN_RESULTS_PX = 120
// The AI Tutor column (AC16–AC20): at least 300px, at most 45%, and the middle
// (code + results) always keeps 420px whatever the other two take.
const MIN_TUTOR_PX = 300
const MIN_TUTOR_PCT = 20
const MAX_TUTOR_PCT = 45
const MIN_MIDDLE_PX = 420
const SPLITTERS_PX = 20
const RAIL_PX = 44
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export interface LayoutState {
	// Percent of the workspace width taken by the challenge pane.
	left: number
	// Percent of the right column's height taken by the code pane.
	top: number
	leftCollapsed: boolean
	resultsCollapsed: boolean
	// The code pane folded up to its header bar (never together with the results).
	codeCollapsed: boolean
	// Percent of the workspace width taken by the AI Tutor column while it is open.
	// Whether it is open is never saved: the Tutor is closed on every visit.
	tutor: number
}

export const DEFAULT_LAYOUT: LayoutState = {
	left: LAYOUT_DEFAULTS.left,
	top: LAYOUT_DEFAULTS.top,
	leftCollapsed: false,
	resultsCollapsed: false,
	codeCollapsed: false,
	tutor: LAYOUT_DEFAULTS.tutor
}

// Round a pixel-derived minimum up to 0.1%, so it is never a hair under the pixel limit.
function ceilTenth(value: number): number {
	return Math.ceil(value * 10 - 1e-9) / 10
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

// `tutorPct` is the Tutor's share while it is open (0 when closed), so the middle
// column keeps its minimum however the left column is dragged.
export function leftLimits(widthPx: number, tutorPct = 0): { min: number; max: number } {
	const w = Math.max(1, widthPx)
	const min = Math.min(Math.max(MIN_LEFT_PCT, ceilTenth((MIN_LEFT_PX / w) * 100)), MAX_LEFT_PCT)
	const roomFor =
		tutorPct > 0
			? Math.floor((100 - tutorPct - ((MIN_MIDDLE_PX + SPLITTERS_PX) / w) * 100) * 10 + 1e-9) / 10
			: MAX_LEFT_PCT
	return { min, max: Math.max(min, Math.min(MAX_LEFT_PCT, roomFor)) }
}

export function tutorLimits(
	widthPx: number,
	leftPct: number,
	leftCollapsed: boolean
): { min: number; max: number } {
	const w = Math.max(1, widthPx)
	const left = leftCollapsed ? (RAIL_PX / w) * 100 : leftPct
	const min = Math.max(MIN_TUTOR_PCT, ceilTenth((MIN_TUTOR_PX / w) * 100))
	const room =
		Math.floor((100 - left - ((MIN_MIDDLE_PX + SPLITTERS_PX) / w) * 100) * 10 + 1e-9) / 10
	return { min, max: Math.max(min, Math.min(MAX_TUTOR_PCT, room)) }
}

export function topLimits(heightPx: number): { min: number; max: number } {
	const h = Math.max(1, heightPx)
	const min = Math.max(MIN_CODE_PCT, ceilTenth((MIN_CODE_PX / h) * 100))
	const max = Math.min(
		MAX_CODE_PCT,
		Math.floor((100 - (MIN_RESULTS_PX / h) * 100) * 10 + 1e-9) / 10
	)
	return { min: Math.min(min, max), max }
}

export function clampLeft(pct: number, widthPx: number, tutorPct = 0): number {
	const { min, max } = leftLimits(widthPx, tutorPct)
	return clamp(pct, min, max)
}

export function clampTutor(
	pct: number,
	widthPx: number,
	leftPct: number,
	leftCollapsed: boolean
): number {
	const { min, max } = tutorLimits(widthPx, leftPct, leftCollapsed)
	return clamp(pct, min, max)
}

export function clampTop(pct: number, heightPx: number): number {
	const { min, max } = topLimits(heightPx)
	return clamp(pct, min, max)
}

// A keyboard step in pixels, as a percentage of the pane's container.
export function stepPercent(stepPx: number, containerPx: number): number {
	return (stepPx / Math.max(1, containerPx)) * 100
}

export function layoutCookieValue(state: LayoutState): string {
	return [
		Math.round(state.left * 10) / 10,
		Math.round(state.top * 10) / 10,
		state.leftCollapsed ? 1 : 0,
		state.resultsCollapsed ? 1 : 0,
		Math.round(state.tutor * 10) / 10,
		state.codeCollapsed ? 1 : 0
	].join(',')
}

export function layoutCookie(state: LayoutState): string {
	return `${LAYOUT_COOKIE}=${layoutCookieValue(state)}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
}

// Anything malformed falls back to the defaults, never throws.
export function parseLayoutCookie(raw: string | undefined): LayoutState {
	if (raw == null) return DEFAULT_LAYOUT
	const [left, top, lc, rc, tutor, cc] = raw.split(',')
	const l = Number(left)
	const t = Number(top)
	if (!Number.isFinite(l) || !Number.isFinite(t)) return DEFAULT_LAYOUT
	return {
		left: clamp(l, MIN_LEFT_PCT, MAX_LEFT_PCT),
		top: clamp(t, MIN_CODE_PCT, MAX_CODE_PCT),
		leftCollapsed: lc === '1',
		resultsCollapsed: rc === '1' && cc !== '1',
		codeCollapsed: cc === '1',
		// Cookies saved before the Tutor existed have no fifth value.
		tutor: Number.isFinite(Number(tutor ?? Number.NaN))
			? clamp(Number(tutor), MIN_TUTOR_PCT, MAX_TUTOR_PCT)
			: LAYOUT_DEFAULTS.tutor
	}
}
