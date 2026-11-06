'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/routing'
import dashboard from '@/components/dashboard/dashboard.module.css'
import styles from './preview.module.css'

// Screen 2 — readiness. REAL browser permission APIs, with honest unsupported/denied states. The
// streams are opened only to observe that devices are live (no frame or sample is read, nothing is
// recorded or sent anywhere), and every track is stopped when you leave this page.
type State = 'idle' | 'ok' | 'warn' | 'bad'
interface Row {
	state: State
	detail: string
}

const NOT_CHECKED: Row = { state: 'idle', detail: 'Not checked yet' }

function support(): Row {
	if (typeof navigator === 'undefined') return NOT_CHECKED
	const md = navigator.mediaDevices
	const missing: string[] = []
	if (md == null || typeof md.getUserMedia !== 'function')
		missing.push('camera and microphone access')
	if (md == null || typeof md.getDisplayMedia !== 'function') missing.push('screen sharing')
	if (typeof document.documentElement.requestFullscreen !== 'function') missing.push('fullscreen')
	return missing.length === 0
		? { state: 'ok', detail: 'This browser supports every required check' }
		: {
				state: 'bad',
				detail: `Not supported here: ${missing.join(', ')}. Use a current desktop Chrome, Edge or Firefox.`
			}
}

const mark = (s: State) => (s === 'ok' ? '✓' : s === 'bad' ? '✕' : s === 'warn' ? '!' : '○')
const tone = (s: State) =>
	s === 'ok' ? styles.checkOk : s === 'bad' ? styles.checkBad : s === 'warn' ? styles.checkWarn : ''

function failure(name: string): string {
	return name === 'NotAllowedError'
		? 'Permission was denied. Allow it in your browser, then run the checks again.'
		: name === 'NotFoundError'
			? 'No device was found.'
			: 'This could not be started in this browser.'
}

export function PreflightPanel() {
	const [browser] = useState<Row>(() => support())
	const [camera, setCamera] = useState<Row>(NOT_CHECKED)
	const [mic, setMic] = useState<Row>(NOT_CHECKED)
	const [screen, setScreen] = useState<Row>(NOT_CHECKED)
	const [fullscreen, setFullscreen] = useState<Row>(NOT_CHECKED)
	const streams = useRef<MediaStream[]>([])

	useEffect(() => {
		const onFs = () =>
			setFullscreen(
				document.fullscreenElement != null
					? { state: 'ok', detail: 'Fullscreen is on' }
					: { state: 'idle', detail: 'Not in fullscreen' }
			)
		document.addEventListener('fullscreenchange', onFs)
		const held = streams.current
		return () => {
			document.removeEventListener('fullscreenchange', onFs)
			for (const s of held) for (const t of s.getTracks()) t.stop()
		}
	}, [])

	function watch(track: MediaStreamTrack, set: (r: Row) => void, what: string) {
		const lost = () =>
			set({ state: 'bad', detail: `${what} stopped. Run the checks again to restore it.` })
		track.addEventListener('ended', lost)
		track.addEventListener('mute', lost)
	}

	async function checkDevices() {
		const cam = await navigator.mediaDevices
			.getUserMedia({ video: true, audio: true })
			.catch((e: unknown) => (e instanceof DOMException ? e.name : 'Error'))
		if (typeof cam === 'string') {
			const row: Row = { state: 'bad', detail: failure(cam) }
			setCamera(row)
			setMic(row)
		} else {
			streams.current.push(cam)
			const v = cam.getVideoTracks()[0]
			const a = cam.getAudioTracks()[0]
			setCamera(
				v != null && v.readyState === 'live'
					? { state: 'ok', detail: v.label === '' ? 'Connected and live' : `${v.label} · live` }
					: { state: 'bad', detail: 'No live camera track' }
			)
			setMic(
				a != null && a.readyState === 'live'
					? { state: 'ok', detail: a.label === '' ? 'Connected and live' : `${a.label} · live` }
					: { state: 'bad', detail: 'No live microphone track' }
			)
			if (v != null) watch(v, setCamera, 'Camera')
			if (a != null) watch(a, setMic, 'Microphone')
		}
		const display = await navigator.mediaDevices
			.getDisplayMedia({
				video: { displaySurface: 'monitor' } as MediaTrackConstraints,
				audio: false
			})
			.catch((e: unknown) => (e instanceof DOMException ? e.name : 'Error'))
		if (typeof display === 'string') {
			setScreen({ state: 'bad', detail: failure(display) })
			return
		}
		streams.current.push(display)
		const track = display.getVideoTracks()[0]
		const surface =
			track == null
				? 'unknown'
				: ((track.getSettings() as { displaySurface?: string }).displaySurface ?? 'unknown')
		setScreen(
			surface === 'monitor'
				? { state: 'ok', detail: 'Entire screen shared (as reported by the browser)' }
				: surface === 'unknown'
					? {
							state: 'warn',
							detail:
								'This browser did not report what is shared, so it cannot be confirmed as your entire screen.'
						}
					: {
							state: 'warn',
							detail: `You shared ${surface === 'browser' ? 'a browser tab' : 'a window'}. The exam needs your entire screen.`
						}
		)
		if (track != null) watch(track, setScreen, 'Screen sharing')
	}

	async function goFullscreen() {
		const failed = await document.documentElement.requestFullscreen().then(
			() => false,
			() => true
		)
		if (failed) setFullscreen({ state: 'bad', detail: 'Fullscreen was blocked by the browser.' })
	}

	const rows: [string, Row][] = [
		['Browser compatibility', browser],
		['Camera', camera],
		['Microphone', mic],
		['Screen sharing', screen],
		['Fullscreen', fullscreen]
	]
	const ready = rows.every(([, r]) => r.state === 'ok')
	return (
		<div className={`${styles.grid} ${styles.grid2}`}>
			<section className={dashboard.card} aria-labelledby="ready">
				<div className={dashboard.cardHead}>
					<h2 className={dashboard.cardTitle} id="ready">
						Readiness checks
					</h2>
				</div>
				<ul className={styles.checks} aria-live="polite">
					{rows.map(([name, row]) => (
						<li key={name} className={`${styles.check} ${tone(row.state)}`}>
							<span className={styles.checkIcon} aria-hidden="true">
								{mark(row.state)}
							</span>
							<div>
								<p className={styles.checkName}>{name}</p>
								<p className={styles.checkDetail}>{row.detail}</p>
							</div>
						</li>
					))}
				</ul>
				<div className={styles.actions}>
					<button type="button" className={dashboard.cta} onClick={checkDevices}>
						Run checks
					</button>
					<button type="button" className={dashboard.rowAction} onClick={goFullscreen}>
						Enter fullscreen
					</button>
					{ready ? (
						<Link href="/exam/preview/workspace" className={dashboard.cta}>
							Continue to the exam
						</Link>
					) : (
						<Link href="/exam/preview/workspace" className={dashboard.rowAction}>
							Skip checks (preview only)
						</Link>
					)}
				</div>
				<p className={styles.note}>
					These checks use your browser&apos;s real permission prompts. The real exam needs every
					check to pass; this preview lets you skip.
				</p>
			</section>
			<aside className={dashboard.card} aria-labelledby="privacy">
				<div className={dashboard.cardHead}>
					<h2 className={dashboard.cardTitle} id="privacy">
						Privacy
					</h2>
				</div>
				<p className={styles.muted}>
					Your exam session is monitored for browser activity and device interruptions. Confirmed
					rule violations may affect your final score. Camera, microphone and screen content are not
					recorded or stored.
				</p>
				<ul className={styles.list}>
					<li>No audio, video or screen image is read, uploaded or kept.</li>
					<li>Nobody can watch your camera, microphone or screen.</li>
					<li>No face, voice or attention analysis.</li>
					<li>Devices are used only to see that they stay connected, and stop when you finish.</li>
				</ul>
				<p className={styles.note}>
					A browser cannot see other devices, other people or screenshots taken outside the page, so
					these signals are observations, not proof.
				</p>
			</aside>
		</div>
	)
}
