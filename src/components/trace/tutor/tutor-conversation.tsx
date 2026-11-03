import { cn } from '@/lib/cn'
import { SparkleIcon } from '@/components/ui/icons'
import type { TutorMessage } from './tutor-types'
import styles from './tutor.module.css'

// The scrolling message area. With no messages it shows the empty state; the
// preview never fills it with sample replies.
export function TutorConversation({
	messages,
	connected
}: {
	messages: readonly TutorMessage[]
	connected: boolean
}) {
	return (
		<div
			className={styles.conversation}
			role="log"
			aria-live="polite"
			aria-label="Conversation with the AI Tutor"
			tabIndex={0}
		>
			{messages.length === 0 ? (
				<div className={styles.empty}>
					<span className={styles.emptyIcon} aria-hidden="true">
						<SparkleIcon size={22} />
					</span>
					<h3>No conversation yet</h3>
					<p>
						{connected
							? 'Ask about this problem, or pick a suggestion below.'
							: 'When AI tutoring is available, this is where you will ask questions about the problem, get hints and have a failing test explained.'}
					</p>
				</div>
			) : (
				<ol className={styles.messages}>
					{messages.map((message) => (
						<li
							key={message.id}
							className={cn(styles.message, message.role === 'user' && styles.messageUser)}
						>
							<span className={styles.messageRole}>
								{message.role === 'user' ? 'You' : 'AI Tutor'}
							</span>
							<p>{message.text}</p>
						</li>
					))}
				</ol>
			)}
		</div>
	)
}
