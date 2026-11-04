// Panel-level props. The conversation state itself lives in useTutor (sibling
// file); this contract is what the practice workspace hands to the panel.

export type TutorRole = 'user' | 'assistant'

export interface TutorMessage {
	id: string
	role: TutorRole
	text: string
}

export type TutorAction = 'ask' | 'hint' | 'explain-failure'

// What the learner is working on, shown in the panel header and sent with
// each question by `useTutor` through a `buildContext` callback.
export interface TutorContext {
	problemTitle: string
	difficulty: string
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
	// A hook returned by useTutor. Keeping the panel decoupled from fetch
	// means its tests can pass a stub.
	tutor: import('./use-tutor').UseTutor
	// Suggestions that depend on the current workspace state (e.g. "Explain
	// my failing test" only shows up once a run has happened).
	suggestions?: readonly { id: string; label: string; prompt: string }[]
}
