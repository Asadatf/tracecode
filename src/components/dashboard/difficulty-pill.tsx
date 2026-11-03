import type { ProblemDefinition } from '@/lib/trace/problem'
import styles from './dashboard.module.css'

const TONE: Record<ProblemDefinition['difficulty'], string> = {
	easy: styles.diffEasy ?? '',
	medium: styles.diffMedium ?? '',
	hard: styles.diffHard ?? ''
}

// Difficulty as a colour as well as a word: green easy, orange medium, red hard.
export function DifficultyPill({
	difficulty,
	label
}: {
	difficulty: ProblemDefinition['difficulty']
	label: string
}) {
	return <span className={`${styles.diff} ${TONE[difficulty]}`}>{label}</span>
}
