// The contract the AI Tutor panel is built against, so a future integration
// (the problem-specific tutor, M8) only has to supply these props. Nothing here
// calls a model or a server: today the panel is a non-functional preview.

export type TutorRole = 'user' | 'assistant'

export interface TutorMessage {
	id: string
	role: TutorRole
	text: string
}

export type TutorAction = 'ask' | 'hint' | 'explain-failure'

// What the learner is working on, shown in the panel header. Read from state the
// workspace already holds; it is displayed, never sent anywhere.
export interface TutorContext {
	problemTitle: string
	difficulty: string
	// e.g. "0 / 3 passed", or null before the first run.
	runSummary: string | null
}

// 'docked' is a column beside the editor; 'overlay' is a drawer over the
// workspace on mid-width screens; 'phone' is full screen.
export type TutorMode = 'docked' | 'overlay' | 'phone'

export interface TutorPanelProps {
	context: TutorContext
	mode: TutorMode
	open: boolean
	maximized: boolean
	onToggleMaximize: () => void
	onClose: () => void
	// False until a tutor is wired in. While false the composer and the suggested
	// actions are disabled and the panel says so; it never shows a made-up reply.
	connected?: boolean
	messages?: readonly TutorMessage[]
	onSend?: (text: string) => void
	onAction?: (action: TutorAction) => void
}
