'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { SparkleIcon } from '@/components/ui/icons'
import type { TutorMessage } from '@/lib/tutor/types'
import { MarkdownView } from './markdown-view'
import styles from './tutor.module.css'
import { TraceLoader } from '@/components/ui/trace-loader'

// The scrolling message area. Follows the latest text WHEN the learner is
// near the bottom; if they scrolled up to re-read, they stay there. A
// screen reader announces new messages via aria-live.

const STICK_THRESHOLD_PX = 64

export function TutorConversation({
	messages,
	sending,
	streaming,
	streamingReply,
	available
}: {
	messages: readonly TutorMessage[]
	sending: boolean
	streaming: boolean
	streamingReply: string | null
	available: boolean
}) {
	const scrollRef = useRef<HTMLDivElement>(null)
	// Whether the user is "stuck to the bottom". Starts true; flips to
	// false the instant they scroll away; flips back when they scroll
	// within STICK_THRESHOLD_PX of the bottom again.
	const stickRef = useRef(true)

	function onScroll() {
		const node = scrollRef.current
		if (node == null) return
		const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
		stickRef.current = distanceFromBottom < STICK_THRESHOLD_PX
	}

	useEffect(() => {
		const node = scrollRef.current
		if (node == null) return
		if (stickRef.current) node.scrollTop = node.scrollHeight
	}, [messages.length, sending, streamingReply])

	return (
		<div
			ref={scrollRef}
			className={styles.conversation}
			role="log"
			aria-live="polite"
			aria-label="Conversation with Tracy"
			tabIndex={0}
			onScroll={onScroll}
		>
			{messages.length === 0 ? (
				<div className={styles.empty}>
					<span className={styles.emptyIcon} aria-hidden="true">
						<SparkleIcon size={22} />
					</span>
					<h3>Hi, I&apos;m Tracy!</h3>
					<p>
						{available
							? 'I can help you understand your code, debug mistakes, and learn the concepts behind this problem. Nothing is sent until you press Send.'
							: 'Sign in to chat with Tracy. I can help you understand your code, debug mistakes, and learn the concepts behind this problem — only when you ask.'}
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
								{message.role === 'user' ? 'You' : 'Tracy'}
							</span>
							{/* The learner's own text is rendered verbatim (React escapes
							    it). Only assistant replies — which may use Markdown — go
							    through the renderer. This keeps a user who pastes "**x**"
							    seeing their exact message back. */}
							{message.role === 'user' ? (
								<p className={styles.messageBody}>{message.text}</p>
							) : (
								<MarkdownView source={message.text} />
							)}
						</li>
					))}
					{streamingReply != null && streamingReply.length > 0 && (
						<li className={styles.message} aria-label="Tracy is replying">
							<span className={styles.messageRole}>Tracy</span>
							<MarkdownView source={streamingReply} />
						</li>
					)}
					{sending && streamingReply == null && (
						<li className={styles.sending} aria-live="polite">
							Tracy is thinking
							<TraceLoader tone="dark" width={36} className="ml-2 inline-block align-middle" />
						</li>
					)}
					{streaming && streamingReply != null && streamingReply.length === 0 && (
						<li className={styles.sending} aria-live="polite">
							Tracy is replying
							<TraceLoader tone="dark" width={36} className="ml-2 inline-block align-middle" />
						</li>
					)}
				</ol>
			)}
		</div>
	)
}
