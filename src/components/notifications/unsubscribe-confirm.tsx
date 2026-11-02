'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { unsubscribeEmailAction } from '@/server/actions/notifications'

// Confirm-first unsubscribe (M7.5B). The email's visible link lands here and a
// click does the work, so a mail scanner prefetching the link can't unsubscribe
// anyone. Mail clients use the RFC 8058 one-click POST endpoint instead.
export function UnsubscribeConfirm({
	token,
	labels
}: {
	token: string
	labels: { confirm: string; working: string; done: string; failed: string }
}) {
	const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
	const [pending, startTransition] = useTransition()

	if (state === 'done')
		return (
			<p className="m-0" role="status">
				{labels.done}
			</p>
		)

	return (
		<div className="flex flex-col items-start gap-3">
			<Button
				type="button"
				disabled={pending}
				onClick={() =>
					startTransition(async () => {
						const result = await unsubscribeEmailAction({ token })
						setState(result.ok ? 'done' : 'failed')
					})
				}
			>
				{pending ? labels.working : labels.confirm}
			</Button>
			{state === 'failed' ? (
				<p className="text-warning m-0 text-sm" role="status">
					{labels.failed}
				</p>
			) : null}
		</div>
	)
}
