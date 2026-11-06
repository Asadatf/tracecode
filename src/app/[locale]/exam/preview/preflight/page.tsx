import type { Metadata } from 'next'
import { PreviewFrame } from '@/components/exam/preview/preview-frame'
import { PreflightPanel } from '@/components/exam/preview/preflight-panel'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Exam readiness (preview) | TraceCode', robots: { index: false, follow: false } }
}

export default function PreflightPage() {
	return (
		<PreviewFrame step="preflight" eyebrow="Daily Exam" title="Check your setup">
			<PreflightPanel />
		</PreviewFrame>
	)
}
